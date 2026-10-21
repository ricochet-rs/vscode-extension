/**
 * Typed access to the `ricochet` CLI.
 *
 * Every command string in the extension lives here. Callers deal in domain types and
 * never in argv, so a CLI flag change is a one-file edit.
 */

import { ensureSupported, locate } from "./binary.js";
import { CliError, run, runOrThrow, type RunOptions, type RunResult } from "./exec.js";
import {
  DeployError,
  parseDeployEvent,
  type DeployEvent,
  type DeployProgressEvent,
} from "./deployEvents.js";
import { LineSplitter } from "./lines.js";
import { parseLogRecord, type LogRecord } from "./logRecords.js";

export interface Server {
  readonly name: string;
  readonly url: string;
  readonly isDefault: boolean;
  readonly hasKey: boolean;
}

export interface Deployment {
  readonly id: string;
  /** `pending`, `success`, `dependency_mismatch`, `failure`, `timeout`, `cancelled` or `invalidated`. */
  readonly status: string;
  readonly deployedAt: Date | undefined;
}

export interface TaskRun {
  readonly id: string;
  /** `success`, `failure` or `cancelled` once finished. */
  readonly status: string;
  readonly startedAt: Date | undefined;
  readonly endedAt: Date | undefined;
}

export interface BundleFile {
  /** Path inside the bundle. */
  readonly path: string;
  readonly size: number;
  /** Why the file is left out: `always-excluded`, `not-included` or `exclude:<pattern>`. Absent when included. */
  readonly reason: string | undefined;
  /** Where a file from outside the deployed directory, such as a workspace `uv.lock`, is read from. */
  readonly source: string | undefined;
}

export interface Deployed {
  readonly id: string | undefined;
  readonly deploymentId: string | undefined;
}

export interface DeployOptions extends RunOptions {
  readonly onProgress?: (event: DeployProgressEvent) => void;
}

export interface LogOptions extends RunOptions {
  readonly onRecord?: (record: LogRecord) => void;
}

export interface ClientOptions {
  /** Overrides the located binary, from `ricochet.cli.path`. */
  readonly binaryPath?: string;
  /** Server profile name or URL, from `ricochet.server`. Passed as `--server`. */
  readonly server?: string;
}

export class RicochetClient {
  private constructor(
    readonly binary: string,
    private readonly server: string | undefined,
  ) {}

  static create(options: ClientOptions = {}): RicochetClient {
    const server = options.server?.trim();
    return new RicochetClient(
      locate(options.binaryPath),
      server !== undefined && server.length > 0 ? server : undefined,
    );
  }

  /** Configured server profiles, or an empty list when the config file has none. */
  async servers(options: RunOptions = {}): Promise<Server[]> {
    const payload = await this.json(["server", "list"], options);
    return asArray(payload).flatMap((raw) => {
      const name = str(raw, "name");
      const url = str(raw, "url");
      if (name === undefined || url === undefined) {
        return [];
      }
      // `api_key` is the masked key, or null when none is stored.
      return [
        {
          name,
          url,
          isDefault: raw["default"] === true,
          hasKey: str(raw, "api_key") !== undefined,
        },
      ];
    });
  }

  /** Deployment history for a content item, newest first when the CLI orders it so. */
  async deployments(kind: ItemKind, id: string, options: RunOptions = {}): Promise<Deployment[]> {
    const payload = await this.json([kind, "deployment", "list", id, "--fields", "all"], options);
    return asArray(payload).flatMap((raw) => {
      const deploymentId = str(raw, "id");
      if (deploymentId === undefined) {
        return [];
      }
      return [
        {
          id: deploymentId,
          status: str(raw, "status") ?? "unknown",
          deployedAt: seconds(raw["deployed_at"]),
        },
      ];
    });
  }

  /**
   * Starts a deployed task and waits for the run to finish.
   * A run that fails still resolves with its status; only a run the CLI lost track of throws.
   */
  async runTask(id: string, options: RunOptions = {}): Promise<TaskRun> {
    const args = this.args(["task", "invoke", id, "--wait"]);
    await ensureSupported(this.binary);
    // The CLI prints the finished run and then exits non-zero unless it succeeded.
    const result = await run(this.binary, args, options);
    const payload = parseJson(result.stdout);
    const runId = str(payload, "id");
    const status = str(payload, "status");
    if (!isRecord(payload) || runId === undefined || status === undefined) {
      throw new CliError(`\`ricochet ${args.join(" ")}\` exited with ${result.code}.`, result);
    }
    return {
      id: runId,
      status,
      startedAt: seconds(payload["started"]),
      endedAt: seconds(payload["ended"]),
    };
  }

  /**
   * Deploys the directory holding `_ricochet.toml`, reporting `bundling` and `uploading` through `onProgress`.
   * A deploy the CLI reports as failed throws `DeployError`, carrying the failure's `kind`.
   */
  async deploy(directory: string, options: DeployOptions = {}): Promise<Deployed> {
    const args = this.args(["deploy", directory]);
    await ensureSupported(this.binary);
    const splitter = new LineSplitter();
    let outcome: Extract<DeployEvent, { event: "done" | "error" }> | undefined;
    const read = (line: string): void => {
      const event = parseDeployEvent(line);
      if (event === undefined) {
        return;
      }
      if (event.event === "done" || event.event === "error") {
        outcome = event;
      } else {
        options.onProgress?.(event);
      }
    };

    const result = await run(this.binary, args, {
      ...options,
      cwd: directory,
      onStdout: (chunk) => {
        splitter.push(chunk).forEach(read);
        options.onStdout?.(chunk);
      },
    });
    splitter.flush().forEach(read);

    if (outcome?.event === "error") {
      throw new DeployError(outcome, result);
    }
    if (result.code !== 0 || outcome === undefined) {
      throw new CliError(`\`ricochet ${args.join(" ")}\` exited with ${result.code}.`, result);
    }
    return { id: outcome.id, deploymentId: outcome.deploymentId };
  }

  /**
   * Reads a server-side log, such as a task run's output under its run ID, until the server closes it.
   * A finished log replays in full and then ends.
   */
  async log(id: string, options: LogOptions = {}): Promise<void> {
    const splitter = new LineSplitter();
    const read = (line: string): void => {
      const record = parseLogRecord(line);
      if (record !== undefined) {
        options.onRecord?.(record);
      }
    };
    // `--` keeps an ID the server sent from being read as a flag.
    await this.run(this.args(["log", "--", id]), {
      ...options,
      onStdout: (chunk) => {
        splitter.push(chunk).forEach(read);
        options.onStdout?.(chunk);
      },
    });
    splitter.flush().forEach(read);
  }

  /** Lists every file a deploy of `directory` would consider, without contacting a server. */
  async bundle(directory: string, options: RunOptions = {}): Promise<BundleFile[]> {
    const payload = await this.json(["deploy", directory, "--dry-run"], {
      ...options,
      cwd: directory,
    });
    const files = isRecord(payload) ? asArray(payload["files"]) : [];
    return files.flatMap((raw) => {
      const path = str(raw, "path");
      const size = raw["size"];
      if (path === undefined || typeof size !== "number") {
        return [];
      }
      return [
        {
          path,
          size,
          reason: raw["included"] === true ? undefined : (str(raw, "reason") ?? "not-included"),
          source: str(raw, "source"),
        },
      ];
    });
  }

  /** Signs in with a pre-existing key, the only non-interactive login path. */
  async loginWithKey(server: string, key: string, options: RunOptions = {}): Promise<void> {
    await this.run(["login", "--server", server, "-k", key], options);
  }

  async addServer(name: string, url: string, options: RunOptions = {}): Promise<void> {
    await this.run(["server", "add", name, url], options);
  }

  async setDefaultServer(name: string, options: RunOptions = {}): Promise<void> {
    await this.run(["server", "set-default", name], options);
  }

  /** Runs a command under `-F json` and parses stdout, which carries the payload alone. */
  private async json(args: readonly string[], options: RunOptions): Promise<unknown> {
    const result = await this.run(this.args(args), options);
    try {
      return JSON.parse(result.stdout) as unknown;
    } catch {
      throw new CliError(`\`ricochet ${args.join(" ")}\` did not print JSON.`, result);
    }
  }

  private async run(args: readonly string[], options: RunOptions): Promise<RunResult> {
    await ensureSupported(this.binary);
    return runOrThrow(this.binary, args, options);
  }

  private args(args: readonly string[]): string[] {
    const global = ["-F", "json"];
    if (this.server !== undefined) {
      global.push("--server", this.server);
    }
    return [...global, ...args];
  }
}

export type ItemKind = "app" | "task";

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    return undefined;
  }
}

/** The CLI reports times as Unix seconds. */
function seconds(value: unknown): Date | undefined {
  return typeof value === "number" ? new Date(value * 1000) : undefined;
}

function asArray(payload: unknown): Record<string, unknown>[] {
  return Array.isArray(payload) ? payload.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(payload: unknown, key: string): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

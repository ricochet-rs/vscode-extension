/**
 * Typed access to the `ricochet` CLI.
 *
 * Every command string in the extension lives here. Callers deal in domain types and
 * never in argv, so a CLI flag change is a one-file edit.
 */

import { ensureSupported, locate } from "./binary.js";
import { CliError, runOrThrow, type RunOptions, type RunResult } from "./exec.js";

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

export interface Invocation {
  readonly id: string | undefined;
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
      const deployedAt = raw["deployed_at"];
      return [
        {
          id: deploymentId,
          status: str(raw, "status") ?? "unknown",
          // Unix seconds.
          deployedAt: typeof deployedAt === "number" ? new Date(deployedAt * 1000) : undefined,
        },
      ];
    });
  }

  async invoke(id: string, options: RunOptions = {}): Promise<Invocation> {
    const payload = await this.json(["task", "invoke", id], options);
    return { id: str(payload, "id") };
  }

  /**
   * Deploys the directory holding `_ricochet.toml`.
   * The CLI's status lines arrive through `onStderr`, the only progress it reports.
   */
  async deploy(directory: string, options: RunOptions = {}): Promise<void> {
    await this.run(this.args(["deploy", directory]), { ...options, cwd: directory });
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

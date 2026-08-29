/**
 * Typed access to the `ricochet` CLI.
 *
 * Every command string in the extension lives here. Callers deal in domain types and
 * never in argv, so a CLI flag change is a one-file edit.
 */

import { locate } from "./binary.js";
import { CliError, runOrThrow, type RunOptions } from "./exec.js";
import { parseJsonOutput } from "./output.js";

export interface Server {
  readonly name: string;
  readonly url: string;
  readonly isDefault: boolean;
  readonly hasKey: boolean;
}

export interface Deployment {
  readonly id: string;
  readonly status: string;
  readonly createdAt: string | undefined;
  readonly bundleId: string | undefined;
}

export interface Invocation {
  readonly id: string | undefined;
  readonly status: string | undefined;
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
      return [
        {
          name,
          url,
          isDefault: bool(raw, "default") ?? bool(raw, "is_default") ?? false,
          hasKey: bool(raw, "has_key") ?? bool(raw, "authenticated") ?? false,
        },
      ];
    });
  }

  /** Deployment history for a content item, newest first when the CLI orders it so. */
  async deployments(kind: ItemKind, id: string, options: RunOptions = {}): Promise<Deployment[]> {
    const payload = await this.json([kind, "deployment", "list", id, "--fields", "all"], options);
    return asArray(payload).flatMap((raw) => {
      const deploymentId = str(raw, "id") ?? str(raw, "deployment_id");
      if (deploymentId === undefined) {
        return [];
      }
      return [
        {
          id: deploymentId,
          status: str(raw, "status") ?? "unknown",
          createdAt: str(raw, "created_at") ?? str(raw, "createdAt"),
          bundleId: str(raw, "bundle_id") ?? str(raw, "bundleId"),
        },
      ];
    });
  }

  async invoke(id: string, options: RunOptions = {}): Promise<Invocation> {
    const payload = await this.json(["task", "invoke", id], options);
    return {
      id: str(payload, "invocation_id") ?? str(payload, "id"),
      status: str(payload, "status"),
    };
  }

  /**
   * Deploys the directory holding `_ricochet.toml`.
   *
   * `deploy` does not honour `-F json` yet (ricochet-rs/cli#212), so the response is
   * whatever the command printed. Progress is surfaced through `onStdout` instead.
   */
  async deploy(directory: string, options: RunOptions = {}): Promise<string> {
    const result = await runOrThrow(this.binary, this.args(["deploy", directory]), {
      ...options,
      cwd: directory,
    });
    return result.stdout;
  }

  /** Signs in with a pre-existing key, the only non-interactive login path. */
  async loginWithKey(server: string, key: string, options: RunOptions = {}): Promise<void> {
    await runOrThrow(this.binary, ["login", "--server", server, "-k", key], options);
  }

  async addServer(name: string, url: string, options: RunOptions = {}): Promise<void> {
    await runOrThrow(this.binary, ["server", "add", name, url], options);
  }

  async setDefaultServer(name: string, options: RunOptions = {}): Promise<void> {
    await runOrThrow(this.binary, ["server", "set-default", name], options);
  }

  /** Runs a command under `-F json` and returns the recovered payload. */
  private async json(args: readonly string[], options: RunOptions): Promise<unknown> {
    const result = await runOrThrow(this.binary, this.args(args), options);
    try {
      return parseJsonOutput(result.stdout);
    } catch (error) {
      // An empty list is a legitimate result that some commands render as prose.
      if (looksEmpty(result.stdout)) {
        return [];
      }
      throw new CliError(
        error instanceof Error ? error.message : "Could not read the command output.",
        result,
      );
    }
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

function looksEmpty(stdout: string): boolean {
  return /\b(no |none|empty)\b/i.test(stdout);
}

function asArray(payload: unknown): Record<string, unknown>[] {
  const candidate = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? (payload["items"] ?? payload["data"] ?? payload["servers"])
      : undefined;
  if (!Array.isArray(candidate)) {
    return [];
  }
  return candidate.filter(isRecord);
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

function bool(payload: unknown, key: string): boolean | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

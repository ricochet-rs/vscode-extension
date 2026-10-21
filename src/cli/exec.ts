/**
 * Running the `ricochet` binary.
 *
 * Deliberately free of `vscode` imports: cancellation arrives as an `AbortSignal` so this
 * layer stays testable and reusable outside the extension host.
 */

import { spawn } from "node:child_process";

/** Terminal colour and cursor sequences, which an output channel would print literally. */
export const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export interface RunOptions {
  readonly cwd?: string;
  readonly signal?: AbortSignal;
  /** Called with each decoded stdout chunk, for progress and log streaming. */
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly result: RunResult,
  ) {
    super(message);
    this.name = "CliError";
  }

  /**
   * The most useful line to put in a notification. Status lines and the CLI's `Error: ...`
   * diagnosis both go to stderr, so prefer the error line over whatever was printed before it.
   */
  get summary(): string {
    const lines = this.result.stderr
      .replace(ANSI, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines.find((line) => line.startsWith("Error:")) ?? lines.at(-1) ?? this.message;
  }
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "CancelledError";
  }
}

/** Resolves for any exit code; throws only when the process could not be started. */
export async function run(
  binary: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  if (options.signal?.aborted === true) {
    throw new CancelledError();
  }
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(binary, [...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      // The CLI suppresses its own update check under CI, which is the right
      // behaviour for a programmatic caller too.
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let cancelled = false;

    const onAbort = (): void => {
      cancelled = true;
      child.kill("SIGTERM");
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      options.onStdout?.(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      options.onStderr?.(chunk);
    });

    child.on("error", (error) => {
      options.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", onAbort);
      if (cancelled) {
        reject(new CancelledError());
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/** Runs the binary and throws `CliError` on a non-zero exit. */
export async function runOrThrow(
  binary: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const result = await run(binary, args, options);
  if (result.code !== 0) {
    throw new CliError(`\`ricochet ${args.join(" ")}\` exited with ${result.code}.`, result);
  }
  return result;
}

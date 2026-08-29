/**
 * Finding the `ricochet` binary.
 *
 * The extension does not bundle the CLI, so it has to locate an installed one and say
 * something useful when there is none.
 */

import { accessSync, constants } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join } from "node:path";
import { run } from "./exec.js";

export const MINIMUM_VERSION = "0.15.0";

const EXECUTABLE = platform() === "win32" ? "ricochet.exe" : "ricochet";

/** Install locations the CLI's own installers use, checked after `PATH`. */
function fallbackDirectories(): string[] {
  const home = homedir();
  if (platform() === "win32") {
    return [join(home, ".ricochet", "bin"), join(home, "AppData", "Local", "ricochet", "bin")];
  }
  return [
    join(home, ".local", "bin"),
    join(home, ".ricochet", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/home/linuxbrew/.linuxbrew/bin",
  ];
}

export class CliNotFoundError extends Error {
  constructor() {
    super(
      "Could not find the `ricochet` executable. Install it, or set `ricochet.cli.path` to its location.",
    );
    this.name = "CliNotFoundError";
  }
}

/**
 * Resolves the binary to use. `configured` wins outright so a user can always
 * point at a specific build.
 */
export function locate(configured?: string): string {
  if (configured !== undefined && configured.trim().length > 0) {
    return configured.trim();
  }
  for (const dir of [...pathDirectories(), ...fallbackDirectories()]) {
    const candidate = join(dir, EXECUTABLE);
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  throw new CliNotFoundError();
}

function pathDirectories(): string[] {
  return (process.env.PATH ?? "").split(delimiter).filter((dir) => dir.length > 0);
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Reads `ricochet --version`, returning the bare version or undefined when unreadable. */
export async function version(binary: string): Promise<string | undefined> {
  const result = await run(binary, ["--version"]).catch(() => undefined);
  if (result === undefined || result.code !== 0) {
    return undefined;
  }
  return parseVersion(result.stdout);
}

/** `ricochet 0.15.0` and `ricochet-cli 0.15.0-rc.1` both yield the numeric part. */
export function parseVersion(output: string): string | undefined {
  return /(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/.exec(output)?.[1];
}

/** Semver comparison limited to what a minimum-version gate needs. */
export function isAtLeast(actual: string, minimum: string): boolean {
  const parse = (v: string): number[] =>
    (v.split(/[-+]/)[0] ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parse(actual), parse(minimum)];
  for (let i = 0; i < 3; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }
  // Numerically equal, so only a prerelease of the minimum version sorts below it.
  const prerelease = (v: string): boolean => v.includes("-");
  return !(prerelease(actual) && !prerelease(minimum));
}

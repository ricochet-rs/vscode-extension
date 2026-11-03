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

/** The CLI release the extension is built and tested against. Older ones print no deploy events under `-F json`. */
export const MINIMUM_VERSION = "1.4.0-0";

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

export class CliTooOldError extends Error {
  constructor(readonly found: string | undefined) {
    super(
      found === undefined
        ? `Could not read the version of the \`ricochet\` CLI. This extension needs version ${MINIMUM_VERSION} or newer.`
        : `The \`ricochet\` CLI is version ${found}, and this extension needs ${MINIMUM_VERSION} or newer. Run \`ricochet self update\` to upgrade.`,
    );
    this.name = "CliTooOldError";
  }
}

const supported = new Map<string, Promise<void>>();

/**
 * Throws `CliTooOldError` unless `binary` is at least `MINIMUM_VERSION`.
 * A passing check is remembered per binary; a failing one is retried, so an upgrade needs no reload.
 */
export async function ensureSupported(binary: string): Promise<void> {
  let check = supported.get(binary);
  if (check === undefined) {
    check = version(binary).then((found) => {
      if (found === undefined || !isAtLeast(found, MINIMUM_VERSION)) {
        throw new CliTooOldError(found);
      }
    });
    supported.set(binary, check);
    check.catch(() => supported.delete(binary));
  }
  return check;
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

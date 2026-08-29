/**
 * Recover a JSON payload from `ricochet` stdout.
 *
 * `-F json` does not yet mean "JSON only": most commands print status lines and links
 * around the payload, and `deploy` never receives the flag at all. See
 * https://github.com/ricochet-rs/cli/issues/212. This module is the single place that
 * knows about that, so when the CLI is fixed only this file changes.
 */

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export class CliOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "CliOutputError";
  }
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** Returns the parsed payload, or throws `CliOutputError` when stdout carries none. */
export function parseJsonOutput(stdout: string): unknown {
  const clean = stripAnsi(stdout).trim();
  if (clean.length === 0) {
    throw new CliOutputError("The command produced no output.", stdout);
  }

  const direct = tryParse(clean);
  if (direct.ok) {
    return direct.value;
  }

  // Fall back to the first line that opens a JSON value, then every later candidate.
  for (const start of candidateOffsets(clean)) {
    const attempt = tryParse(clean.slice(start));
    if (attempt.ok) {
      return attempt.value;
    }
  }
  throw new CliOutputError("The command did not produce JSON output.", stdout);
}

/**
 * Parse newline-delimited JSON, ignoring any line that is not a JSON object.
 * Used for streaming progress once the CLI emits it, and harmless before then.
 */
export function parseNdjson(chunk: string): unknown[] {
  const values: unknown[] = [];
  for (const line of stripAnsi(chunk).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    const attempt = tryParse(trimmed);
    if (attempt.ok) {
      values.push(attempt.value);
    }
  }
  return values;
}

/**
 * The human lines the CLI prints around a payload, so a failure can be shown
 * to the user rather than discarded.
 */
export function humanLines(stdout: string): string[] {
  const clean = stripAnsi(stdout);
  const first = candidateOffsets(clean)[0];
  const prefix = first === undefined ? clean : clean.slice(0, first);
  return prefix
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function candidateOffsets(text: string): number[] {
  const offsets: number[] = [];
  let index = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      offsets.push(index + (line.length - trimmed.length));
    }
    index += line.length + 1;
  }
  return offsets;
}

type Parsed = { ok: true; value: unknown } | { ok: false };

function tryParse(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

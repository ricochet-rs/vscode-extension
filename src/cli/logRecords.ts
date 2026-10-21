/**
 * The records `ricochet log -F json` writes, one per line of a server-side log.
 */

import { ANSI } from "./exec.js";

export interface LogRecord {
  readonly line: string;
  readonly timestamp: Date | undefined;
  /** `stdout`, `stderr`, or a label such as a container name. Absent for a line with no prefix. */
  readonly stream: string | undefined;
}

/** Reads one line of the stream, or undefined for a line that is not a log record. */
export function parseLogRecord(text: string): LogRecord | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const line = record["line"];
  if (typeof line !== "string") {
    return undefined;
  }
  const timestamp =
    typeof record["timestamp"] === "string" ? new Date(record["timestamp"]) : undefined;
  return {
    line: line.replace(ANSI, ""),
    timestamp:
      timestamp !== undefined && !Number.isNaN(timestamp.getTime()) ? timestamp : undefined,
    stream: typeof record["stream"] === "string" ? record["stream"] : undefined,
  };
}

/** `HH:MM:SS stream text` in local time, as `ricochet log` prints it, or the text alone when it had no prefix. */
export function formatLogRecord(record: LogRecord): string {
  if (record.timestamp === undefined || record.stream === undefined) {
    return record.line;
  }
  const pad = (value: number): string => value.toString().padStart(2, "0");
  const time = `${pad(record.timestamp.getHours())}:${pad(record.timestamp.getMinutes())}:${pad(record.timestamp.getSeconds())}`;
  return `${time} ${record.stream} ${record.line}`;
}

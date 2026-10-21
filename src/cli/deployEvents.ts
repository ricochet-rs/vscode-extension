/**
 * The event stream `ricochet deploy -F json` writes, one JSON object per line.
 *
 * A deploy reports `bundling`, then `uploading` at most once per percent, and ends with
 * `done` or a categorised `error`.
 */

import { CliError, type RunResult } from "./exec.js";

export type DeployEvent =
  | { readonly event: "bundling"; readonly files: number }
  | { readonly event: "uploading"; readonly bytesSent: number; readonly bytesTotal: number }
  | {
      readonly event: "done";
      readonly id: string | undefined;
      readonly deploymentId: string | undefined;
    }
  | {
      readonly event: "error";
      readonly kind: DeployFailureKind;
      readonly status: number | undefined;
      readonly message: string;
    };

/** `project` is a local problem, `rejected` a 4xx and `server` a 5xx; `auth` and `network` are what they say. */
export type DeployFailureKind = "project" | "auth" | "network" | "rejected" | "server";

const FAILURE_KINDS: readonly string[] = ["project", "auth", "network", "rejected", "server"];

/** Reads one line of the stream, or undefined for a line that is not a known event. */
export function parseDeployEvent(line: string): DeployEvent | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  switch (record["event"]) {
    case "bundling":
      return typeof record["files"] === "number"
        ? { event: "bundling", files: record["files"] }
        : undefined;
    case "uploading": {
      const sent = record["bytes_sent"];
      const total = record["bytes_total"];
      return typeof sent === "number" && typeof total === "number"
        ? { event: "uploading", bytesSent: sent, bytesTotal: total }
        : undefined;
    }
    case "done":
      return {
        event: "done",
        id: text(record["id"]),
        deploymentId: text(record["deployment_id"]),
      };
    case "error": {
      const kind = record["kind"];
      const status = record["status"];
      return {
        event: "error",
        kind:
          typeof kind === "string" && FAILURE_KINDS.includes(kind)
            ? (kind as DeployFailureKind)
            : "project",
        status: typeof status === "number" ? status : undefined,
        message: text(record["message"]) ?? "The deploy failed.",
      };
    }
    default:
      return undefined;
  }
}

export type DeployProgressEvent = Extract<DeployEvent, { event: "bundling" | "uploading" }>;

/** A deploy that ended in an `error` event, whose message is the CLI's own diagnosis. */
export class DeployError extends CliError {
  readonly kind: DeployFailureKind;
  readonly status: number | undefined;

  constructor(event: Extract<DeployEvent, { event: "error" }>, result: RunResult) {
    super(event.message, result);
    this.name = "DeployError";
    this.kind = event.kind;
    this.status = event.status;
  }

  /** The first line, since the rest is a hint such as which command to run, and the log keeps it. */
  override get summary(): string {
    return this.message.split("\n")[0]?.trim() || this.message;
  }
}

/** Whole percent of the upload sent, from 0 to 100. */
export function uploadPercent(event: { bytesSent: number; bytesTotal: number }): number {
  if (event.bytesTotal <= 0) {
    return 100;
  }
  return Math.min(100, Math.floor((event.bytesSent * 100) / event.bytesTotal));
}

/** Splits streamed chunks into complete lines, holding back a trailing partial line. */
export class LineSplitter {
  private pending = "";

  push(chunk: string): string[] {
    const lines = (this.pending + chunk).split("\n");
    this.pending = lines.pop() ?? "";
    return lines.map((line) => line.trim()).filter((line) => line.length > 0);
  }

  /** The partial line left at the end of the stream, if any. */
  flush(): string[] {
    const rest = this.pending.trim();
    this.pending = "";
    return rest.length > 0 ? [rest] : [];
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

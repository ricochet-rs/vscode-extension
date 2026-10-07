/**
 * How a finished task run reads in a notification.
 */

import type { TaskRun } from "./client.js";

export interface RunOutcome {
  readonly level: "info" | "warning" | "error";
  readonly message: string;
}

export function describeTaskRun(name: string, run: TaskRun): RunOutcome {
  const took =
    run.startedAt !== undefined && run.endedAt !== undefined
      ? ` in ${formatDuration(run.endedAt.getTime() - run.startedAt.getTime())}`
      : "";
  switch (run.status) {
    case "success":
      return { level: "info", message: `${name} finished${took}.` };
    case "cancelled":
      return { level: "warning", message: `${name} was cancelled${took}.` };
    case "failure":
      return { level: "error", message: `${name} failed${took}.` };
    default:
      return { level: "warning", message: `${name} ended as ${run.status}${took}.` };
  }
}

/** `42s`, `3m 05s` or `1h 02m`. */
export function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number): string => value.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${pad(secs)}s`;
  }
  return `${secs}s`;
}

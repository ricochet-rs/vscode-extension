/**
 * Grouping a deploy dry run into what is sent and why the rest is left out.
 */

import type { BundleFile } from "../cli/client.js";

export interface BundleGroup {
  /** Undefined for the files that are sent. */
  readonly reason: string | undefined;
  readonly label: string;
  readonly files: readonly BundleFile[];
  readonly bytes: number;
  /** False for directories such as `.venv`, whose thousands of files nobody needs itemised. */
  readonly listed: boolean;
}

const ALWAYS_EXCLUDED = "always-excluded";

/** The included files first, then one group per reason, with never-bundled directories last. */
export function groupBundle(files: readonly BundleFile[]): BundleGroup[] {
  const byReason = new Map<string | undefined, BundleFile[]>([[undefined, []]]);
  for (const file of files) {
    const group = byReason.get(file.reason);
    if (group === undefined) {
      byReason.set(file.reason, [file]);
    } else {
      group.push(file);
    }
  }
  const leftOut = [...byReason.keys()].filter((reason) => reason !== undefined);
  const reasons = [undefined, ...leftOut.sort((a, b) => rank(a) - rank(b))];
  return reasons.map((reason) => {
    const members = byReason.get(reason) ?? [];
    return {
      reason,
      label: groupLabel(reason),
      files: members,
      bytes: members.reduce((total, file) => total + file.size, 0),
      listed: reason !== ALWAYS_EXCLUDED,
    };
  });
}

function rank(reason: string): number {
  return reason === ALWAYS_EXCLUDED ? 1 : 0;
}

function groupLabel(reason: string | undefined): string {
  if (reason === undefined) {
    return "Sent";
  }
  if (reason === ALWAYS_EXCLUDED) {
    return "Never sent (.venv, .renv, __pycache__, .ipynb_checkpoints)";
  }
  if (reason === "not-included") {
    return "Not matched by content.include";
  }
  if (reason.startsWith("exclude:")) {
    return `Excluded by ${reason.slice("exclude:".length)}`;
  }
  return reason;
}

/** `1 file` or `3 files`. */
export function fileCount(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

/** Binary units, matching the CLI: `512 B`, `1.50 KB`, `3.25 MB`. */
export function formatSize(bytes: number): string {
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    if (value < 1024) {
      break;
    }
    value /= 1024;
    unit = next;
  }
  return unit === "B" ? `${bytes} B` : `${value.toFixed(2)} ${unit}`;
}

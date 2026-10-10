import { describe, expect, it } from "vitest";
import { describeTaskRun, formatDuration } from "./taskRun.js";

const at = (seconds: number): Date => new Date(seconds * 1000);

describe("describeTaskRun", () => {
  it("reports a successful run with its duration", () => {
    const run = { id: "01J", status: "success", startedAt: at(100), endedAt: at(142) };
    expect(describeTaskRun("Nightly report", run)).toEqual({
      level: "info",
      message: "Nightly report finished in 42s.",
    });
  });

  it("reports a failed run as an error", () => {
    const run = { id: "01J", status: "failure", startedAt: at(0), endedAt: at(185) };
    expect(describeTaskRun("Nightly report", run)).toEqual({
      level: "error",
      message: "Nightly report failed in 3m 05s.",
    });
  });

  it("omits the duration of a run that was cancelled before it started", () => {
    const run = { id: "01J", status: "cancelled", startedAt: undefined, endedAt: undefined };
    expect(describeTaskRun("Nightly report", run)).toEqual({
      level: "warning",
      message: "Nightly report was cancelled.",
    });
  });
});

describe("formatDuration", () => {
  it("switches units as the run gets longer", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59_400)).toBe("59s");
    expect(formatDuration(3_725_000)).toBe("1h 02m");
  });
});

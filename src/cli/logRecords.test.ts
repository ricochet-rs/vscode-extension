import { describe, expect, it } from "vitest";
import { formatLogRecord, parseLogRecord } from "./logRecords.js";

describe("parseLogRecord", () => {
  it("reads a prefixed line in the CLI's field names", () => {
    expect(
      parseLogRecord('{"line":"rendering","timestamp":"2026-10-21T09:15:02Z","stream":"stdout"}'),
    ).toEqual({ line: "rendering", timestamp: new Date("2026-10-21T09:15:02Z"), stream: "stdout" });
  });

  it("keeps a line that had no timestamp prefix", () => {
    expect(parseLogRecord('{"line":"plain","timestamp":null,"stream":null}')).toEqual({
      line: "plain",
      timestamp: undefined,
      stream: undefined,
    });
  });

  it("drops the colour codes a program wrote into its output", () => {
    expect(parseLogRecord('{"line":"\\u001b[31mError\\u001b[0m: failed"}')?.line).toBe(
      "Error: failed",
    );
  });

  it("ignores lines that are not records", () => {
    expect(parseLogRecord('{"event":"done"}')).toBeUndefined();
    expect(parseLogRecord("Following task run 01J")).toBeUndefined();
  });
});

describe("formatLogRecord", () => {
  it("prints the local time and stream before the text", () => {
    const timestamp = new Date(2026, 9, 21, 9, 5, 7);
    expect(formatLogRecord({ line: "done", timestamp, stream: "stderr" })).toBe(
      "09:05:07 stderr done",
    );
  });

  it("prints the text alone when the line had no prefix", () => {
    expect(formatLogRecord({ line: "plain", timestamp: undefined, stream: undefined })).toBe(
      "plain",
    );
  });
});

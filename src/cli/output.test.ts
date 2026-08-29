import { describe, expect, it } from "vitest";
import { CliOutputError, humanLines, parseJsonOutput, parseNdjson, stripAnsi } from "./output.js";

const GREEN = "\u001b[32m";
const RESET = "\u001b[0m";

describe("parseJsonOutput", () => {
  it("parses output that is only JSON", () => {
    expect(parseJsonOutput('{"id":"01J"}')).toEqual({ id: "01J" });
  });

  it("skips the status lines `task invoke` prints before its payload", () => {
    const stdout = [
      "Invoking task: 01JABC",
      `${GREEN}✓${RESET} Task invoked successfully!`,
      "",
      '{\n  "invocation_id": "01JXYZ",\n  "status": "pending"\n}',
    ].join("\n");
    expect(parseJsonOutput(stdout)).toEqual({ invocation_id: "01JXYZ", status: "pending" });
  });

  it("parses a top-level array", () => {
    expect(parseJsonOutput('Listing items\n[{"id":"a"}]')).toEqual([{ id: "a" }]);
  });

  it("ignores a brace inside a status line and finds the real payload", () => {
    const stdout = 'note: use {id} to refer to it\n{"id":"real"}';
    expect(parseJsonOutput(stdout)).toEqual({ id: "real" });
  });

  it("throws when there is no JSON at all", () => {
    expect(() => parseJsonOutput("Deployment successful!")).toThrow(CliOutputError);
  });

  it("throws on empty output", () => {
    expect(() => parseJsonOutput("   ")).toThrow(CliOutputError);
  });
});

describe("humanLines", () => {
  it("returns the status lines that precede the payload", () => {
    expect(humanLines('Invoking task: 01J\n\n{"a":1}')).toEqual(["Invoking task: 01J"]);
  });

  it("returns every line when there is no payload", () => {
    expect(humanLines("Deployment failed: boom\nHint: check the server")).toEqual([
      "Deployment failed: boom",
      "Hint: check the server",
    ]);
  });
});

describe("parseNdjson", () => {
  it("collects one value per JSON line and ignores the rest", () => {
    const chunk = 'bundling...\n{"event":"uploading"}\nnot json\n{"event":"done"}\n';
    expect(parseNdjson(chunk)).toEqual([{ event: "uploading" }, { event: "done" }]);
  });
});

describe("stripAnsi", () => {
  it("removes colour escapes", () => {
    expect(stripAnsi(`${GREEN}ok${RESET}`)).toBe("ok");
  });

  it("leaves a JSON array untouched", () => {
    expect(stripAnsi('[{"id":"a"}]')).toBe('[{"id":"a"}]');
  });
});

import { describe, expect, it } from "vitest";
import { LineSplitter, parseDeployEvent, uploadPercent } from "./deployEvents.js";

describe("parseDeployEvent", () => {
  it("reads the events a local deploy writes, in the CLI's field names", () => {
    expect(parseDeployEvent('{"event":"bundling","files":142}')).toEqual({
      event: "bundling",
      files: 142,
    });
    expect(
      parseDeployEvent('{"event":"uploading","bytes_sent":83886,"bytes_total":8388608}'),
    ).toEqual({ event: "uploading", bytesSent: 83886, bytesTotal: 8388608 });
    expect(
      parseDeployEvent('{"event":"done","id":"01J","deployment_id":"01JDEP","status":"deployed"}'),
    ).toEqual({ event: "done", id: "01J", deploymentId: "01JDEP" });
  });

  it("reads a categorised error with its HTTP status", () => {
    expect(
      parseDeployEvent('{"event":"error","kind":"rejected","status":422,"message":"bad bundle"}'),
    ).toEqual({ event: "error", kind: "rejected", status: 422, message: "bad bundle" });
  });

  it("treats an error kind it does not know as a project failure", () => {
    expect(parseDeployEvent('{"event":"error","kind":"quota","message":"over"}')).toMatchObject({
      kind: "project",
      status: undefined,
    });
  });

  it("ignores lines that are not events, such as a log record", () => {
    expect(parseDeployEvent('{"line":"installing","stream":"stdout"}')).toBeUndefined();
    expect(parseDeployEvent("Bundling project")).toBeUndefined();
    expect(parseDeployEvent('{"event":"bundling"}')).toBeUndefined();
  });
});

describe("uploadPercent", () => {
  it("rounds down and treats an empty bundle as sent", () => {
    expect(uploadPercent({ bytesSent: 83887, bytesTotal: 8388608 })).toBe(1);
    expect(uploadPercent({ bytesSent: 8388608, bytesTotal: 8388608 })).toBe(100);
    expect(uploadPercent({ bytesSent: 0, bytesTotal: 0 })).toBe(100);
  });
});

describe("LineSplitter", () => {
  it("joins a line split across chunks and holds back the partial tail", () => {
    const splitter = new LineSplitter();
    expect(splitter.push('{"event":"bund')).toEqual([]);
    expect(splitter.push('ling","files":1}\n{"event":')).toEqual([
      '{"event":"bundling","files":1}',
    ]);
    expect(splitter.flush()).toEqual(['{"event":']);
    expect(splitter.flush()).toEqual([]);
  });
});

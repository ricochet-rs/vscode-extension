import { describe, expect, it } from "vitest";
import { LineSplitter } from "./lines.js";

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

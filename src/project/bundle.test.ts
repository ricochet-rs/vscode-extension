import { describe, expect, it } from "vitest";
import type { BundleFile } from "../cli/client.js";
import { fileCount, formatSize, groupBundle } from "./bundle.js";

const file = (path: string, size: number, reason?: string): BundleFile => ({
  path,
  size,
  reason,
  source: undefined,
});

describe("groupBundle", () => {
  it("puts sent files first and never-sent directories last", () => {
    const groups = groupBundle([
      file(".venv/lib/x.py", 10, "always-excluded"),
      file("app.R", 15),
      file("data/big.parquet", 2048, "exclude:data/**"),
      file("renv.lock", 3),
    ]);
    expect(groups.map((g) => [g.label, g.files.length, g.bytes, g.listed])).toEqual([
      ["Sent", 2, 18, true],
      ["Excluded by data/**", 1, 2048, true],
      ["Never sent (.venv, .renv, __pycache__, .ipynb_checkpoints)", 1, 10, false],
    ]);
  });

  it("keeps an empty sent group so the view can say nothing would be sent", () => {
    const groups = groupBundle([file("notes.md", 1, "not-included")]);
    expect(groups.map((g) => [g.label, g.files.length])).toEqual([
      ["Sent", 0],
      ["Not matched by content.include", 1],
    ]);
  });
});

describe("formatSize", () => {
  it("uses binary units like the CLI", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1.50 KB");
    expect(formatSize(3.25 * 1024 * 1024)).toBe("3.25 MB");
  });
});

describe("fileCount", () => {
  it("agrees in number", () => {
    expect(fileCount(1)).toBe("1 file");
    expect(fileCount(3)).toBe("3 files");
  });
});

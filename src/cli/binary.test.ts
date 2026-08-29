import { describe, expect, it } from "vitest";
import { isAtLeast, parseVersion } from "./binary.js";

describe("parseVersion", () => {
  it("reads the version from the usual output", () => {
    expect(parseVersion("ricochet 0.15.0\n")).toBe("0.15.0");
  });

  it("keeps a prerelease suffix", () => {
    expect(parseVersion("ricochet-cli 0.16.0-rc.1")).toBe("0.16.0-rc.1");
  });

  it("returns undefined when there is no version", () => {
    expect(parseVersion("command not found")).toBeUndefined();
  });
});

describe("isAtLeast", () => {
  it("accepts an equal version", () => {
    expect(isAtLeast("0.15.0", "0.15.0")).toBe(true);
  });

  it("accepts a newer minor and patch", () => {
    expect(isAtLeast("0.16.0", "0.15.0")).toBe(true);
    expect(isAtLeast("0.15.3", "0.15.0")).toBe(true);
  });

  it("rejects an older version", () => {
    expect(isAtLeast("0.14.9", "0.15.0")).toBe(false);
    expect(isAtLeast("0.15.0", "0.16.0")).toBe(false);
  });

  it("compares across a major bump", () => {
    expect(isAtLeast("1.0.0", "0.15.0")).toBe(true);
  });

  it("sorts a prerelease of the minimum below the release", () => {
    expect(isAtLeast("0.15.0-rc.1", "0.15.0")).toBe(false);
  });
});

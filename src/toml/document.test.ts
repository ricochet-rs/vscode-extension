import { describe, expect, it } from "vitest";
import { TomlDocument, TomlSyntaxError } from "./document.js";

describe("TomlDocument", () => {
  it("exposes dotted paths with spans that cover the key", () => {
    const text = '[content]\nname = "report"\n';
    const doc = TomlDocument.parse(text);
    const entry = doc.entry("content.name");
    expect(entry?.value).toBe("report");
    expect(text.slice(entry?.span.start, entry?.span.end)).toBe("name");
    expect(text.slice(entry?.valueSpan.start, entry?.valueSpan.end)).toBe('"report"');
  });

  it("records table headers", () => {
    const text = '[content]\nname = "x"\n\n[language]\nname = "r"\n';
    const doc = TomlDocument.parse(text);
    expect(doc.table("language")).toBeDefined();
    expect(doc.table("serve")).toBeUndefined();
  });

  it("flattens nested tables", () => {
    const doc = TomlDocument.parse('[serve.k8s]\nstrategy = "recreate"\n');
    expect(doc.string("serve.k8s.strategy")).toBe("recreate");
  });

  it("flattens inline tables so they validate like a table header", () => {
    const doc = TomlDocument.parse(
      '[repositories]\nr = { CRAN = "https://cloud.r-project.org" }\n',
    );
    expect(doc.string("repositories.r.CRAN")).toBe("https://cloud.r-project.org");
  });

  it("lists the keys of one table without descending", () => {
    const doc = TomlDocument.parse('[content]\nname = "x"\nslug = "y"\n\n[language]\nname = "r"\n');
    expect(doc.keysIn("content").sort()).toEqual(["name", "slug"]);
  });

  it("raises a syntax error with an offset", () => {
    expect(() => TomlDocument.parse("[content\nname =")).toThrow(TomlSyntaxError);
  });
});

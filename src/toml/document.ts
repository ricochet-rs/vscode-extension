/**
 * A span-aware view over a `_ricochet.toml`.
 *
 * `toml-eslint-parser` is used rather than a plain TOML reader because a diagnostic
 * has to point at the offending key, not at the file.
 */

import { parseTOML, getStaticTOMLValue, type AST } from "toml-eslint-parser";

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Entry {
  readonly span: Span;
  /** Span of the value alone, for diagnostics that concern the value rather than the key. */
  readonly valueSpan: Span;
  readonly value: unknown;
}

export type TomlValue = Record<string, unknown>;

export class TomlDocument {
  private constructor(
    readonly value: TomlValue,
    private readonly entries: ReadonlyMap<string, Entry>,
    private readonly tables: ReadonlyMap<string, Span>,
  ) {}

  /** Throws `TomlSyntaxError` when the document does not parse. */
  static parse(text: string): TomlDocument {
    let ast;
    try {
      ast = parseTOML(text);
    } catch (error) {
      throw TomlSyntaxError.from(error);
    }
    const value = getStaticTOMLValue(ast) as TomlValue;
    const entries = new Map<string, Entry>();
    const tables = new Map<string, Span>();
    collect(ast as unknown as AST.TOMLNode, entries, tables);
    return new TomlDocument(value, entries, tables);
  }

  /** `content.name`, `serve.k8s.strategy`, and so on. */
  entry(path: string): Entry | undefined {
    return this.entries.get(path);
  }

  table(name: string): Span | undefined {
    return this.tables.get(name);
  }

  /** Keys present in a table, in document order. */
  keysIn(table: string): string[] {
    const prefix = `${table}.`;
    return [...this.entries.keys()]
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("."))
      .map((k) => k.slice(prefix.length));
  }

  string(path: string): string | undefined {
    const value = this.entry(path)?.value;
    return typeof value === "string" ? value : undefined;
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }
}

export class TomlSyntaxError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
    this.name = "TomlSyntaxError";
  }

  static from(error: unknown): TomlSyntaxError {
    const message = error instanceof Error ? error.message : String(error);
    const index = error !== null && typeof error === "object" && "index" in error ? error.index : 0;
    return new TomlSyntaxError(message, typeof index === "number" ? index : 0);
  }
}

/** Walk the AST once, flattening every key into a dotted path with its span. */
function collect(
  node: AST.TOMLNode,
  entries: Map<string, Entry>,
  tables: Map<string, Span>,
  prefix: string[] = [],
): void {
  switch (node.type) {
    case "Program":
      collect(node.body[0] as unknown as AST.TOMLNode, entries, tables, prefix);
      return;
    case "TOMLTopLevelTable":
      for (const child of node.body) {
        collect(child as unknown as AST.TOMLNode, entries, tables, prefix);
      }
      return;
    case "TOMLTable": {
      const path = [...prefix, ...node.resolvedKey.map(String)];
      tables.set(path.join("."), spanOf(node));
      for (const child of node.body) {
        collect(child as unknown as AST.TOMLNode, entries, tables, path);
      }
      return;
    }
    case "TOMLKeyValue": {
      const path = [...prefix, ...node.key.keys.map(keyName)];
      entries.set(path.join("."), {
        span: spanOf(node.key as unknown as AST.TOMLNode),
        valueSpan: spanOf(node.value as unknown as AST.TOMLNode),
        value: getStaticTOMLValue(node.value as never),
      });
      // An inline table contributes its own dotted paths so `[serve]` written inline validates too.
      if (node.value.type === "TOMLInlineTable") {
        for (const child of node.value.body) {
          collect(child as unknown as AST.TOMLNode, entries, tables, path);
        }
      }
      return;
    }
    default:
      return;
  }
}

function keyName(key: { type: string; name?: string; value?: unknown }): string {
  if (key.type === "TOMLBare" && typeof key.name === "string") {
    return key.name;
  }
  return String(key.value ?? "");
}

function spanOf(node: { range: [number, number] }): Span {
  return { start: node.range[0], end: node.range[1] };
}

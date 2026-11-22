/**
 * Rules from `ContentItem::validate_config`, applied in the editor.
 *
 * Every problem reported here is one the CLI would otherwise raise at deploy time.
 * Nothing here touches the filesystem or the `vscode` module, so it is directly testable.
 */

import {
  ACCESS_TYPES,
  CONTENT_TYPES,
  CONTENT_TYPE_NAMES,
  FIELD_DOCS,
  LANGUAGES,
  PACKAGE_FILES,
  PACKAGE_FILE_FOR,
  REQUIRED_SERVE_KEYS,
  type ContentTypeSpec,
  type FieldDoc,
  type Language,
} from "./schema.js";
import type { Span, TomlDocument } from "./document.js";

export type Severity = "error" | "warning";

export interface Problem {
  readonly span: Span;
  readonly message: string;
  readonly severity: Severity;
}

const REQUIRED = [
  "content.name",
  "content.entrypoint",
  "content.access_type",
  "content.content_type",
  "language.name",
  "language.packages",
] as const;

export function validate(doc: TomlDocument): Problem[] {
  const problems: Problem[] = [];
  const at = (path: string): Span | undefined => doc.entry(path)?.span;
  const headOf = (path: string): Span =>
    at(path) ?? doc.table(path.split(".")[0] ?? "") ?? { start: 0, end: 0 };

  for (const path of REQUIRED) {
    const [table] = path.split(".");
    if (doc.has(path)) {
      continue;
    }
    const span = doc.table(table ?? "") ?? { start: 0, end: 0 };
    problems.push({ span, message: `\`${path}\` is required.`, severity: "error" });
  }

  const contentType = doc.string("content.content_type");
  const spec = contentType === undefined ? undefined : CONTENT_TYPES[contentType];

  if (contentType !== undefined && spec === undefined) {
    problems.push({
      span: headOf("content.content_type"),
      message: `Unknown content type \`${contentType}\`. Expected one of: ${CONTENT_TYPE_NAMES.join(", ")}.`,
      severity: "error",
    });
  }

  checkKinds(doc, problems);
  checkEnum(doc, problems, "content.access_type", ACCESS_TYPES);
  checkEnum(doc, problems, "language.name", LANGUAGES);
  checkEnum(doc, problems, "language.packages", PACKAGE_FILES);
  checkId(doc, problems);
  checkName(doc, problems);

  if (spec !== undefined) {
    checkLanguage(doc, problems, spec, contentType as string);
    checkEntrypoint(doc, problems, spec);
    checkTables(doc, problems, spec, contentType as string);
  }

  checkPythonPackages(doc, problems);
  checkServeTable(doc, problems);
  checkCron(doc, problems);
  checkAlwaysExcluded(doc, problems);

  return problems;
}

/** The problems reported on the key at `path` or on its value. */
export function problemsAt(
  doc: TomlDocument,
  problems: readonly Problem[],
  path: string,
): Problem[] {
  const entry = doc.entry(path);
  if (entry === undefined) {
    return [];
  }
  return problems.filter(
    (problem) => problem.span.start >= entry.span.start && problem.span.end <= entry.valueSpan.end,
  );
}

/** Reports values serde would refuse for their type or range, before any rule reads them. */
function checkKinds(doc: TomlDocument, problems: Problem[]): void {
  for (const [path, field] of Object.entries(FIELD_DOCS)) {
    const entry = doc.entry(path);
    if (entry === undefined) {
      continue;
    }
    const expected = kindMismatch(entry.value, field);
    if (expected !== undefined) {
      problems.push({
        span: entry.valueSpan,
        message: `\`${path}\` must be ${expected}.`,
        severity: "error",
      });
    }
  }
}

/** Describes the value `field` expects when `value` does not fit it. */
function kindMismatch(value: unknown, field: FieldDoc): string | undefined {
  switch (field.kind) {
    case "string":
      return typeof value === "string" ? undefined : "a string";
    case "boolean":
      return typeof value === "boolean" ? undefined : "`true` or `false`";
    case "strings":
      return Array.isArray(value) && value.every((v) => typeof v === "string")
        ? undefined
        : "a list of strings";
    case "integer": {
      const { min, max } = field;
      const range =
        max === undefined
          ? `a whole number, ${min ?? 0} or more`
          : `a whole number from ${min ?? 0} to ${max}`;
      const whole =
        typeof value === "bigint"
          ? Number(value)
          : typeof value === "number" && Number.isInteger(value)
            ? value
            : undefined;
      if (whole === undefined) {
        return range;
      }
      return (min !== undefined && whole < min) || (max !== undefined && whole > max)
        ? range
        : undefined;
    }
  }
}

function checkEnum(
  doc: TomlDocument,
  problems: Problem[],
  path: string,
  allowed: readonly string[],
): void {
  const entry = doc.entry(path);
  if (entry === undefined || typeof entry.value !== "string") {
    return;
  }
  if (path === "content.content_type" || allowed.includes(entry.value)) {
    return;
  }
  problems.push({
    span: entry.valueSpan,
    message: `\`${entry.value}\` is not valid here. Expected one of: ${allowed.join(", ")}.`,
    severity: "error",
  });
}

/** Mirrors the deploy endpoint, which parses `content.id` as a ULID. */
function checkId(doc: TomlDocument, problems: Problem[]): void {
  const entry = doc.entry("content.id");
  if (entry === undefined || typeof entry.value !== "string") {
    return;
  }
  if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(entry.value)) {
    problems.push({
      span: entry.valueSpan,
      message: "The `id` in `_ricochet.toml` is not a valid ULID.",
      severity: "error",
    });
  }
}

function checkName(doc: TomlDocument, problems: Problem[]): void {
  const entry = doc.entry("content.name");
  if (entry === undefined || typeof entry.value !== "string") {
    return;
  }
  if (entry.value.length > 120) {
    problems.push({
      span: entry.valueSpan,
      message: `\`content.name\` is ${entry.value.length} characters. The limit is 120.`,
      severity: "error",
    });
  }
}

function checkLanguage(
  doc: TomlDocument,
  problems: Problem[],
  spec: ContentTypeSpec,
  contentType: string,
): void {
  const entry = doc.entry("language.name");
  if (entry === undefined || typeof entry.value !== "string") {
    return;
  }
  if (entry.value !== spec.language) {
    problems.push({
      span: entry.valueSpan,
      message: `Content type \`${contentType}\` requires \`language.name = "${spec.language}"\`.`,
      severity: "error",
    });
  }
}

function checkEntrypoint(doc: TomlDocument, problems: Problem[], spec: ContentTypeSpec): void {
  const entry = doc.entry("content.entrypoint");
  const rule = spec.entrypoint;
  if (entry === undefined || typeof entry.value !== "string" || rule.kind === "any") {
    return;
  }
  // Shiny entrypoints may be a directory, which the editor cannot distinguish from a typo.
  const directory =
    rule.kind === "directory-or-extensions" && extensionOf(entry.value) === undefined;
  if (!directory && !fits(rule, entry.value)) {
    problems.push({ span: entry.valueSpan, message: rule.message, severity: "error" });
  }
}

const SOURCE_EXTENSION: Readonly<Record<Language, string>> = { r: "r", julia: "jl", python: "py" };

/**
 * Whether the file at `path` can be the entrypoint of `spec`. A type whose rule names no
 * extension, such as plumber, takes its language's source files.
 */
export function canBeEntrypoint(spec: ContentTypeSpec, path: string): boolean {
  const rule = spec.entrypoint;
  const loose = rule.kind === "any" || rule.kind === "except";
  return fits(rule, path) && (!loose || extensionOf(path) === SOURCE_EXTENSION[spec.language]);
}

function fits(rule: ContentTypeSpec["entrypoint"], path: string): boolean {
  const base = path.split("/").pop() ?? path;
  const extension = extensionOf(base);
  switch (rule.kind) {
    case "any":
      return true;
    case "filename":
      return base === rule.name;
    case "except":
      return base !== rule.name;
    case "quarto":
      return (
        base === "_quarto.yml" || (extension !== undefined && rule.allowed.includes(extension))
      );
    default:
      return extension !== undefined && rule.allowed.includes(extension);
  }
}

function extensionOf(path: string): string | undefined {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : undefined;
}

function checkTables(
  doc: TomlDocument,
  problems: Problem[],
  spec: ContentTypeSpec,
  contentType: string,
): void {
  const rejected: ReadonlyArray<{ table: string; allowed: boolean; message: string }> = [
    {
      table: "serve",
      allowed: !spec.task,
      message: `\`${contentType}\` is a task and cannot be served. Remove the \`[serve]\` table.`,
    },
    {
      table: "schedule",
      allowed: spec.task,
      message: `\`${contentType}\` is an app and cannot be scheduled. Remove the \`[schedule]\` table.`,
    },
    {
      table: "static",
      allowed: spec.static,
      message: `\`${contentType}\` is an app and cannot be served as a static site. Remove the \`[static]\` table.`,
    },
  ];

  for (const { table, allowed, message } of rejected) {
    if (allowed) {
      continue;
    }
    const span = doc.table(table) ?? doc.entry(table)?.span;
    if (span !== undefined) {
      problems.push({ span, message, severity: "error" });
    }
  }
}

function checkPythonPackages(doc: TomlDocument, problems: Problem[]): void {
  const language = doc.string("language.name");
  const entry = doc.entry("language.packages");
  if (language === undefined || entry === undefined || typeof entry.value !== "string") {
    return;
  }
  if (!isLanguage(language)) {
    return;
  }
  const expected = PACKAGE_FILE_FOR[language];
  if (entry.value === expected) {
    return;
  }
  // Only Python is rejected outright by the server; the others are a mismatch worth flagging.
  problems.push({
    span: entry.valueSpan,
    message:
      language === "python"
        ? 'Python items must use `packages = "uv.lock"`.'
        : `\`${language}\` items normally use \`packages = "${expected}"\`.`,
    severity: language === "python" ? "error" : "warning",
  });
}

function checkServeTable(doc: TomlDocument, problems: Problem[]): void {
  const table = doc.table("serve");
  if (table === undefined) {
    return;
  }
  const missing = REQUIRED_SERVE_KEYS.filter((key) => !doc.has(`serve.${key}`));
  if (missing.length > 0) {
    problems.push({
      span: table,
      message: `\`[serve]\` has no defaults, so it needs every sizing key. Missing: ${missing.join(", ")}.`,
      severity: "error",
    });
  }
  const min = numberAt(doc, "serve.min_instances");
  const max = numberAt(doc, "serve.max_instances");
  if (min !== undefined && max !== undefined && max < min) {
    problems.push({
      span: doc.entry("serve.max_instances")?.valueSpan ?? table,
      message: `\`max_instances\` (${max}) is below \`min_instances\` (${min}); the server clamps it up.`,
      severity: "warning",
    });
  }
}

const CRON_SHORTHAND = new Set([
  "@yearly",
  "@annually",
  "@monthly",
  "@weekly",
  "@daily",
  "@midnight",
  "@hourly",
]);

function checkCron(doc: TomlDocument, problems: Problem[]): void {
  const entry = doc.entry("schedule.cron");
  if (entry === undefined || typeof entry.value !== "string") {
    return;
  }
  const cron = entry.value.trim();
  if (CRON_SHORTHAND.has(cron.toLowerCase())) {
    return;
  }
  const fields = cron.split(/\s+/).filter((f) => f.length > 0);
  // tokio-cron-scheduler accepts 5 fields, or 6 and 7 with seconds and years.
  if (fields.length < 5 || fields.length > 7) {
    problems.push({
      span: entry.valueSpan,
      message: `A cron expression needs 5 to 7 fields, or a shorthand such as \`@daily\`. This has ${fields.length}.`,
      severity: "error",
    });
  }
}

function checkAlwaysExcluded(doc: TomlDocument, problems: Problem[]): void {
  const entry = doc.entry("content.include");
  if (entry === undefined || !Array.isArray(entry.value)) {
    return;
  }
  const named = entry.value.filter(
    (pattern): pattern is string =>
      typeof pattern === "string" &&
      [".venv", ".renv", "__pycache__"].some((dir) => pattern.includes(dir)),
  );
  if (named.length > 0) {
    problems.push({
      span: entry.valueSpan,
      message: `\`.venv\`, \`.renv\` and \`__pycache__\` are dropped from every bundle, so \`${named[0]}\` has no effect.`,
      severity: "warning",
    });
  }
}

function numberAt(doc: TomlDocument, path: string): number | undefined {
  const value = doc.entry(path)?.value;
  return typeof value === "number" ? value : undefined;
}

function isLanguage(value: string): value is keyof typeof PACKAGE_FILE_FOR {
  return LANGUAGES.includes(value as never);
}

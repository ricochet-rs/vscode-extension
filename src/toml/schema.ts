/**
 * The `_ricochet.toml` schema, mirrored from `ricochet_core::content::ContentItem`.
 *
 * The server is the authority. This module exists so the editor can report the same
 * rejections while you type instead of at deploy time, and it must be updated whenever
 * `ricochet-core` changes. Every rule here has a counterpart in `ContentItem::validate_config`.
 */

export const LANGUAGES = ["r", "python", "julia"] as const;
export type Language = (typeof LANGUAGES)[number];

export const PACKAGE_FILES = ["renv.lock", "uv.lock", "Manifest.toml"] as const;
export type PackageFile = (typeof PACKAGE_FILES)[number];

export const ACCESS_TYPES = ["private", "internal", "external"] as const;
export type AccessType = (typeof ACCESS_TYPES)[number];

/** How an entrypoint path is checked for a given content type. */
type EntrypointRule =
  | { kind: "extensions"; allowed: readonly string[]; message: string }
  /** `ricochet-core` performs no extension check for this type. */
  | { kind: "any" }
  /** Quarto for R also accepts a `_quarto.yml`, and only that `.yml` name. */
  | { kind: "quarto"; allowed: readonly string[]; message: string }
  /** Shiny accepts a directory, so a path with no extension is not an error. */
  | { kind: "directory-or-extensions"; allowed: readonly string[]; message: string };

export interface ContentTypeSpec {
  readonly language: Language;
  /** Task types can be invoked and scheduled. App types are served instead. */
  readonly task: boolean;
  /** Whether a `[static]` table is accepted. Only task types render static output. */
  readonly static: boolean;
  readonly entrypoint: EntrypointRule;
}

const QUARTO_R: EntrypointRule = {
  kind: "quarto",
  allowed: ["qmd", "rmd", "r"],
  message:
    "quarto-r content type requires a file ending in `.qmd`, `.Rmd`, or `.R` or a `_quarto.yml` file.",
};

const quartoNonR = (label: string): EntrypointRule => ({
  kind: "quarto",
  allowed: ["qmd"],
  message: `${label} content type requires a \`.qmd\` file or a \`_quarto.yml\` file.`,
});

const ext = (allowed: readonly string[], message: string): EntrypointRule => ({
  kind: "extensions",
  allowed,
  message,
});

export const CONTENT_TYPES: Readonly<Record<string, ContentTypeSpec>> = {
  r: {
    language: "r",
    task: true,
    static: true,
    entrypoint: ext(["r"], "R content type requires a file ending in `.R`."),
  },
  rmd: {
    language: "r",
    task: true,
    static: true,
    entrypoint: ext(["rmd", "r"], "Rmd content type requires a file ending in `.Rmd` or `.R`."),
  },
  "quarto-r": { language: "r", task: true, static: true, entrypoint: QUARTO_R },
  "quarto-jl": {
    language: "julia",
    task: true,
    static: true,
    entrypoint: quartoNonR("quarto-julia"),
  },
  "quarto-py": {
    language: "python",
    task: true,
    static: true,
    entrypoint: quartoNonR("quarto-python"),
  },
  julia: {
    language: "julia",
    task: true,
    static: true,
    entrypoint: ext(["jl"], "Julia content type requires a file ending in `.jl`."),
  },
  python: {
    language: "python",
    task: true,
    static: true,
    entrypoint: ext(["py"], "Python content type requires a file ending in `.py`."),
  },
  shiny: {
    language: "r",
    task: false,
    static: false,
    entrypoint: {
      kind: "directory-or-extensions",
      allowed: ["r"],
      message: "Shiny app entrypoints must be a directory or a path to a .R file",
    },
  },
  "shiny-py": {
    language: "python",
    task: false,
    static: false,
    entrypoint: {
      kind: "directory-or-extensions",
      allowed: ["py"],
      message: "Shiny Python app entrypoints must be a directory or a path to a .py file",
    },
  },
  "rmd-shiny": {
    language: "r",
    task: false,
    static: false,
    entrypoint: ext(["rmd", "r"], "Expected a file ending in `.Rmd` or `.R`."),
  },
  "quarto-r-shiny": { language: "r", task: false, static: false, entrypoint: QUARTO_R },
  plumber: {
    language: "r",
    task: false,
    static: false,
    // Plumber is the one app type ricochet-core does not extension-check.
    entrypoint: { kind: "any" },
  },
  ambiorix: {
    language: "r",
    task: false,
    static: false,
    entrypoint: ext(["r"], "Expected a file ending in `.R`."),
  },
  "r-service": {
    language: "r",
    task: false,
    static: false,
    entrypoint: ext(["r"], "Expected a file ending in `.R`."),
  },
  "serverless-r": {
    language: "r",
    task: false,
    static: false,
    entrypoint: ext(["r"], "Expected a file ending in `.R`."),
  },
  "julia-service": {
    language: "julia",
    task: false,
    static: false,
    entrypoint: ext(["jl"], "Julia-live content type requires a file ending in `.jl`."),
  },
  "python-service": {
    language: "python",
    task: false,
    static: false,
    entrypoint: ext(["py"], "Python service content type requires a file ending in `.py`."),
  },
  fastapi: {
    language: "python",
    task: false,
    static: false,
    entrypoint: ext(["py"], "Python service content type requires a file ending in `.py`."),
  },
  flask: {
    language: "python",
    task: false,
    static: false,
    entrypoint: ext(["py"], "Python service content type requires a file ending in `.py`."),
  },
  streamlit: {
    language: "python",
    task: false,
    static: false,
    entrypoint: ext(["py"], "Python service content type requires a file ending in `.py`."),
  },
  dash: {
    language: "python",
    task: false,
    static: false,
    entrypoint: ext(["py"], "Python service content type requires a file ending in `.py`."),
  },
};

export const CONTENT_TYPE_NAMES = Object.keys(CONTENT_TYPES).sort();

/** The lockfile each language requires. Python is the only one the server hard-rejects. */
export const PACKAGE_FILE_FOR: Readonly<Record<Language, PackageFile>> = {
  r: "renv.lock",
  python: "uv.lock",
  julia: "Manifest.toml",
};

/** Paths that are dropped from every bundle regardless of `include`. */
export const ALWAYS_EXCLUDED = [".venv", ".renv", "__pycache__"] as const;

/** The TOML value shape serde accepts for a key. */
export type FieldKind = "string" | "integer" | "boolean" | "strings";

export interface FieldDoc {
  readonly detail: string;
  readonly kind: FieldKind;
  readonly values?: readonly string[];
  /** Inclusive bounds for an integer; `max` is omitted when only the Rust type bounds it. */
  readonly min?: number;
  readonly max?: number;
}

/** Backing data for key completion and hovers, keyed by `<table>.<key>`. */
export const FIELD_DOCS: Readonly<Record<string, FieldDoc>> = {
  "content.id": {
    detail: "Item ULID. Omit it; the first successful deploy writes it back.",
    kind: "string",
  },
  "content.name": { detail: "Display name, 120 characters or fewer.", kind: "string" },
  "content.slug": { detail: "URL slug. Derived from the name when absent.", kind: "string" },
  "content.entrypoint": { detail: "Path relative to the deployed directory.", kind: "string" },
  "content.access_type": {
    detail: "Who may reach the item.",
    values: [...ACCESS_TYPES],
    kind: "string",
  },
  "content.content_type": {
    detail: "What is deployed.",
    values: CONTENT_TYPE_NAMES,
    kind: "string",
  },
  "content.summary": { detail: "Short description shown in the UI.", kind: "string" },
  "content.thumbnail": { detail: "Relative path to a thumbnail image.", kind: "string" },
  "content.tags": { detail: "Free-form tags.", kind: "strings" },
  "content.include": { detail: "When set, only matching paths are bundled.", kind: "strings" },
  "content.exclude": {
    detail: "Matching paths are dropped after `include` is applied.",
    kind: "strings",
  },
  "content.exec_env": {
    detail: "Named execution environment, for Docker and Kubernetes backends.",
    kind: "string",
  },
  "language.name": {
    detail: "Must agree with the content type.",
    values: [...LANGUAGES],
    kind: "string",
  },
  "language.packages": {
    detail: "Lockfile naming the dependencies.",
    values: [...PACKAGE_FILES],
    kind: "string",
  },
  "schedule.cron": { detail: "Cron expression, or a shorthand such as `@daily`.", kind: "string" },
  "schedule.parameterized": {
    detail: "Whether the task accepts parameters at invocation.",
    kind: "boolean",
  },
  "schedule.on_success": { detail: "Notification targets for a successful run.", kind: "strings" },
  "schedule.on_error": { detail: "Notification targets for a failed run.", kind: "strings" },
  "schedule.max_duration": {
    detail: "Seconds an invocation may run before it is stopped. Defaults to the server limit.",
    kind: "integer",
    min: 1,
  },
  "static.index": {
    detail: "File served at the item root, conventionally `index.html`.",
    kind: "string",
  },
  "static.output_dir": { detail: "Directory holding the rendered output.", kind: "string" },
  "static.render_fn": { detail: "Custom render function.", kind: "string" },
  "serve.min_instances": { detail: "Instances started eagerly.", kind: "integer", min: 0 },
  "serve.max_instances": {
    detail: "Hard ceiling on concurrent instances.",
    kind: "integer",
    min: 0,
  },
  "serve.spawn_threshold": {
    detail: "Percentage of `max_connections` at which a new instance spawns.",
    kind: "integer",
    min: 1,
    max: 100,
  },
  "serve.max_connections": {
    detail: "Connections a single instance will accept.",
    kind: "integer",
    min: 0,
  },
  "serve.max_connection_age": {
    detail: "Maximum lifetime of an instance, in seconds.",
    kind: "integer",
    min: 1,
  },
  "serve.inactive_timeout": {
    detail: "Idle seconds before a connection is closed.",
    kind: "integer",
    min: 1,
  },
  "serve.connection_timeout": {
    detail: "Seconds allowed to establish a connection.",
    kind: "integer",
    min: 1,
  },
  "resources.cpu_request": {
    detail: "Millicores, such as `500m`, or a plain number of cores.",
    kind: "string",
  },
  "resources.cpu_limit": {
    detail: "Millicores, such as `1000m`, or a plain number of cores.",
    kind: "string",
  },
  "resources.memory_request": {
    detail: "`Ki`, `Mi`, or `Gi` suffix, or plain bytes.",
    kind: "string",
  },
  "resources.memory_limit": {
    detail: "`Ki`, `Mi`, or `Gi` suffix, or plain bytes.",
    kind: "string",
  },
  "resources.restore_timeout": {
    detail: "Dependency restore timeout in seconds. `0` disables it.",
    kind: "integer",
    min: 0,
  },
};

/** The four `[serve]` sizing keys have no serde defaults, so the table is all-or-nothing. */
export const REQUIRED_SERVE_KEYS = [
  "min_instances",
  "max_instances",
  "spawn_threshold",
  "max_connections",
] as const;

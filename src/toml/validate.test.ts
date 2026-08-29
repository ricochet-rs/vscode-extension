import { describe, expect, it } from "vitest";
import { TomlDocument } from "./document.js";
import { validate } from "./validate.js";

const VALID_TASK = `
[content]
name = "weekly-report"
entrypoint = "report.qmd"
access_type = "private"
content_type = "quarto-r"

[language]
name = "r"
packages = "renv.lock"

[schedule]
cron = "0 9 * * 1-5"
`;

const VALID_APP = `
[content]
name = "dashboard"
entrypoint = "app.R"
access_type = "internal"
content_type = "shiny"

[language]
name = "r"
packages = "renv.lock"
`;

function messages(toml: string): string[] {
  return validate(TomlDocument.parse(toml)).map((p) => p.message);
}

describe("validate", () => {
  it("accepts a well-formed task", () => {
    expect(messages(VALID_TASK)).toEqual([]);
  });

  it("accepts a well-formed app", () => {
    expect(messages(VALID_APP)).toEqual([]);
  });

  it("reports every missing required key", () => {
    const found = messages(`[content]\nname = "x"\n`);
    expect(found).toContain("`content.entrypoint` is required.");
    expect(found).toContain("`content.access_type` is required.");
    expect(found).toContain("`language.name` is required.");
    expect(found).toContain("`language.packages` is required.");
  });

  it("rejects an unknown content type and lists the valid ones", () => {
    const found = messages(VALID_TASK.replace("quarto-r", "quarto-rr"));
    expect(found[0]).toMatch(/^Unknown content type `quarto-rr`\./);
    expect(found[0]).toContain("shiny-py");
  });

  it("rejects a language that disagrees with the content type", () => {
    const found = messages(VALID_APP.replace('name = "r"', 'name = "python"'));
    expect(found).toContain('Content type `shiny` requires `language.name = "r"`.');
  });

  it("rejects an entrypoint extension the content type does not allow", () => {
    const found = messages(VALID_TASK.replace("report.qmd", "report.py"));
    expect(found).toContain(
      "quarto-r content type requires a file ending in `.qmd`, `.Rmd`, or `.R` or a `_quarto.yml` file.",
    );
  });

  it("accepts _quarto.yml but not another yml for quarto-r", () => {
    expect(messages(VALID_TASK.replace("report.qmd", "_quarto.yml"))).toEqual([]);
    expect(messages(VALID_TASK.replace("report.qmd", "other.yml"))).toHaveLength(1);
  });

  it("accepts an extensionless shiny entrypoint because it may be a directory", () => {
    expect(messages(VALID_APP.replace("app.R", "app"))).toEqual([]);
  });

  it("does not extension-check plumber, which ricochet-core leaves unchecked", () => {
    const plumber = VALID_APP.replace("shiny", "plumber").replace("app.R", "whatever.txt");
    expect(messages(plumber)).toEqual([]);
  });

  it("rejects [schedule] on an app", () => {
    const found = messages(`${VALID_APP}\n[schedule]\ncron = "@daily"\n`);
    expect(found).toContain(
      "`shiny` is an app and cannot be scheduled. Remove the `[schedule]` table.",
    );
  });

  it("rejects [serve] on a task", () => {
    const found = messages(
      `${VALID_TASK}\n[serve]\nmin_instances = 0\nmax_instances = 5\nspawn_threshold = 80\nmax_connections = 10\n`,
    );
    expect(found).toContain(
      "`quarto-r` is a task and cannot be served. Remove the `[serve]` table.",
    );
  });

  it("rejects [static] on an app", () => {
    const found = messages(`${VALID_APP}\n[static]\nindex = "index.html"\n`);
    expect(found).toContain(
      "`shiny` is an app and cannot be served as a static site. Remove the `[static]` table.",
    );
  });

  it("requires every [serve] sizing key once the table exists", () => {
    const found = messages(`${VALID_APP}\n[serve]\nmin_instances = 0\n`);
    expect(found).toContain(
      "`[serve]` has no defaults, so it needs every sizing key. Missing: max_instances, spawn_threshold, max_connections.",
    );
  });

  it("rejects a non-uv lockfile for python", () => {
    const py = `
[content]
name = "api"
entrypoint = "main.py"
access_type = "private"
content_type = "fastapi"

[language]
name = "python"
packages = "renv.lock"
`;
    expect(messages(py)).toContain('Python items must use `packages = "uv.lock"`.');
  });

  it("rejects a name over 120 characters", () => {
    const long = VALID_APP.replace("dashboard", "d".repeat(121));
    expect(messages(long)).toContain("`content.name` is 121 characters. The limit is 120.");
  });

  it("accepts cron shorthands and rejects a malformed expression", () => {
    expect(messages(VALID_TASK.replace('"0 9 * * 1-5"', '"@daily"'))).toEqual([]);
    expect(messages(VALID_TASK.replace('"0 9 * * 1-5"', '"0 9 *"'))).toContain(
      "A cron expression needs 5 to 7 fields, or a shorthand such as `@daily`. This has 3.",
    );
  });

  it("warns that an include pattern naming .venv has no effect", () => {
    const found = messages(
      VALID_APP.replace(
        'content_type = "shiny"',
        'content_type = "shiny"\ninclude = ["src/**", ".venv/**"]',
      ),
    );
    expect(found.some((m) => m.includes("`.venv/**` has no effect"))).toBe(true);
  });

  it("warns when max_instances is below min_instances", () => {
    const found = messages(
      `${VALID_APP}\n[serve]\nmin_instances = 3\nmax_instances = 1\nspawn_threshold = 80\nmax_connections = 10\n`,
    );
    expect(found).toContain(
      "`max_instances` (1) is below `min_instances` (3); the server clamps it up.",
    );
  });
});

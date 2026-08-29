/**
 * The starting `_ricochet.toml`.
 *
 * `ricochet init` cannot be reached without a TTY (ricochet-rs/cli#212), so the extension
 * writes a minimal, valid file and lets completion and diagnostics take it from there.
 */

export const TEMPLATE = `[content]
name = "my-content"
entrypoint = "app.R"
access_type = "private"
content_type = "shiny"

[language]
name = "r"
packages = "renv.lock"
`;

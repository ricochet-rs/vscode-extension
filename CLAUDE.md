# CLAUDE.md

## Shared instructions

Before inspecting repository files, planning, editing, or running project commands, load the latest shared `ricochet-rs` instructions.

1. Use `~/.cache/ricochet-rs/agent-instructions` as the shared checkout.
2. If the checkout is absent, clone `git@github.com:ricochet-rs/agent-instructions.git` there.
3. Fetch `origin/main` and check it out in detached-HEAD mode.
4. Read `instructions/global.md`, then `skills/development-flow/SKILL.md`, then `skills/typescript-development/SKILL.md`.

## What this repository is

A VS Code and Positron extension that drives the `ricochet` CLI.
It is not a second API client.
Anything involving the bundle format, the `_ricochet.toml` schema semantics, or the wire protocol belongs in `ricochet-rs/cli`, not here.

## Architecture

The layering exists so that the logic worth testing never imports `vscode`.

| Directory                                                                                                 | Imports `vscode` | Responsibility                                                       |
| --------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------- |
| `src/toml/schema.ts`, `validate.ts`, `document.ts`                                                        | no               | The `_ricochet.toml` schema and its rules                            |
| `src/cli/exec.ts`, `binary.ts`, `client.ts`, `taskRun.ts`, `deployEvents.ts`, `lines.ts`, `logRecords.ts` | no               | Locating, running and parsing the CLI                                |
| `src/project/config.ts`, `bundle.ts`, `deployments.ts`                                                    | no               | Deriving item facts from a parsed config, dry run or deployment list |
| `src/toml/diagnostics.ts`, `completion.ts`                                                                | yes              | Editor bindings for the rules above                                  |
| `src/project/workspace.ts`, `src/views`, `src/commands`, `src/ui`                                         | yes              | Everything user-facing                                               |

Keep that split.
A rule that moves into a file importing `vscode` stops being testable under Vitest and needs a whole extension host instead.

## Reading the CLI

Under `-F json`, stdout carries the payload alone and status lines and errors go to stderr, so parse stdout with `JSON.parse` and never scrape prose.
Read field names from the CLI's `-F json` output, not from the table it prints for people, since the two name things differently.
`MINIMUM_VERSION` in `src/cli/binary.ts` is enforced before every command, so raise it in the same change that starts relying on a newer CLI feature.
An untagged CLI build reports the last tagged version with a hash suffix, which sorts below that version, so test against a release binary.
Before that release exists, point `ricochet.cli.path` at a wrapper script that answers `--version` with the upcoming version and execs the untagged build for everything else, and hold the merge until the release ships.
Never read `content.id` as "deployed", since `ricochet init` writes one before the item exists, and the server answers an unknown ID either with an empty deployment list or with the same 403 as an item the key cannot read, so check the item list instead.

## Keeping the schema honest

`src/toml/schema.ts` mirrors `ricochet_core::content::ContentItem`.
Every rule in `src/toml/validate.ts` has a counterpart in `ContentItem::validate_config`.
Each `FIELD_DOCS` entry's `kind`, `min` and `max` mirror the serde type of that field in `ricochet-core/src/settings.rs` or `content.rs`, since the editor otherwise accepts values the CLI refuses to parse.
When `ricochet-core` changes a content type, an enum, or a table rule, update both the schema and its test in the same change.

Two rules are deliberately looser than the server's, because the editor cannot know what the filesystem holds:

- A Shiny entrypoint with no extension is accepted, since it may be a directory.
- `plumber` gets no extension check at all, matching `validate_config`.

## Validation

- `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:host` and `bun run format:check` are what CI runs.
- Run all five before opening a pull request.
- Cover a command, view or diagnostic wiring in `test/host/suite`, and the logic behind it in a Vitest test beside the module.
- Keep `mocha` on 11, since VS Code 1.90's extension host cannot `require` the ESM-only mocha 12.
- Point `test/host/runTest.ts` at the oldest VS Code `engines.vscode` admits, and raise both together.
- Use Bun. Never npm, yarn, or pnpm, and do not add a second lockfile.

## Publishing

Positron reads Posit Public Package Manager, which mirrors Open VSX, and Microsoft blocks Marketplace access from non-VS Code builds.
So the extension has to reach Open VSX to be installable in Positron at all, and the VS Code Marketplace to be installable in VS Code.
Release by pushing a `v<major>.<minor>.<patch>` tag on main, never by editing the version by hand.
`.crow/release.yaml` writes the tag's version into `package.json`, renames the CHANGELOG's `## Unreleased` heading to it, pushes that commit to main as ricochet-bot, and moves the tag before publishing.
So add changelog entries under `## Unreleased`, and recreate that heading first when the last release renamed it, or the next tag fails for want of a section.
The GitHub release notes and the open "Changelog for upcoming version" issue are generated by git-sv (`.gitsv/config.yaml`) from the squash-merged pull request titles, so give each title the Conventional Commit type that sorts it into the right section.
`CHANGELOG.md` is separate: it is the hand-written page the stores show, so a user-visible change still needs its entry there.
The store tokens are read from OpenBao at `open-vsx/tokens/ricochet-rs` and `vscode-marketplace/tokens/ricochet-rs`, each with a `token` key.

The VSIX ships only what `files` in `package.json` lists, so add a new runtime asset there, and never add a `.vscodeignore`, which `vsce` refuses beside `files`.

Anything from the `positron` API namespace must be a soft dependency, loaded defensively, so the extension still activates in stock VS Code.

# Ricochet for VS Code and Positron

Deploy and manage [Ricochet](https://ricochet.rs) content without leaving the editor.

The extension drives the `ricochet` CLI rather than reimplementing it.
Bundling, `_ricochet.toml` validation, environment variable encryption and credential storage keep exactly one implementation, in the CLI, and the extension is the interface to it.

## Features

**Catch configuration errors while you type.**
`_ricochet.toml` is validated against the same rules the server applies, so a content type that disagrees with its language, an entrypoint with the wrong extension, a `[schedule]` on an app or an incomplete `[serve]` table is reported in the editor instead of at deploy time.
Key and value completion covers every table in the schema.

**Deploy from the sidebar.**
The Project view shows what the active `_ricochet.toml` describes.
Deploying shows how many files were bundled and how much of the upload is sent, writes the CLI's output to the Ricochet log, and offers to open the result.
When a deploy fails because your key is missing or expired, the error offers **Sign In**.

**See what a deploy would send.**
The Bundle view lists every file a deploy would upload with its size, and groups the files left out by the reason, such as a `content.exclude` pattern or a `.venv` directory, which is never sent.
It reads the project on your machine, so it works before you sign in.

**Run a task and read its output.**
**Run Task Now** waits for the run to finish and reports whether it succeeded and how long it took.
**Show Output** on that notification opens the run's output in the **Ricochet Task Output** panel.

**See where the item went.**
The Deployments view lists the item's deployment history with status, opens any entry in the web UI, and shows **Not deployed yet** until the server has the item.

**Manage servers.**
The Servers view lists the profiles from the CLI's own configuration, shows which ones hold a key, and can add a server, sign in, or change the default.
Signing in asks for an API key, and a button in the prompt opens the server page that creates one, so it works the same in a remote window.

## Installation

Search for **Ricochet** in the Extensions view.
VS Code installs it from the Visual Studio Marketplace and Positron from Open VSX.

## Requirements

The `ricochet` CLI, version 1.4.0 or newer, must be installed and on your `PATH`.

```sh
curl -fsSL https://raw.githubusercontent.com/ricochet-rs/cli/main/install.sh | sh
```

Run `ricochet self update` to upgrade an older CLI.

Set `ricochet.cli.path` if it lives somewhere the extension does not look.

## Settings

| Setting                       | Default | Purpose                                                                                                                                   |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ricochet.cli.path`           | `""`    | Absolute path to the `ricochet` executable. Empty means search `PATH` and the usual install locations.                                    |
| `ricochet.server`             | `""`    | Server profile name or URL to target. Empty means the CLI's default server. Set it to a full URL to enable the "open in browser" actions. |
| `ricochet.deploy.confirm`     | `true`  | Ask before deploying.                                                                                                                     |
| `ricochet.validation.enabled` | `true`  | Report `_ricochet.toml` problems as diagnostics.                                                                                          |

`ricochet.server` is resolved per resource, so a multi-root workspace can target a different server per folder.

## Commands

All commands are under the **Ricochet** category.

| Command                                   | Description                                                       |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `Ricochet: Deploy`                        | Deploy the active project.                                        |
| `Ricochet: Run Task Now`                  | Run a deployed task, report how it finished, and show its output. |
| `Ricochet: Open Deployed Item in Browser` | Open the item in the web UI.                                      |
| `Ricochet: Create _ricochet.toml`         | Create a config for an entrypoint found in the folder.            |
| `Ricochet: Select Active Project`         | Choose between several projects in one workspace.                 |
| `Ricochet: Add Server`                    | Add a server profile.                                             |
| `Ricochet: Sign In to Server`             | Store an API key for a server.                                    |
| `Ricochet: Show Log`                      | Open the Ricochet log channel.                                    |

## Development

```sh
bun install
bun run build
bun run test
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host.

`bun run typecheck`, `bun run lint` and `bun run test` are what CI runs.
The logic that is worth testing lives in modules that do not import `vscode`, so the suite runs under plain Vitest with no extension host.

## License

MIT

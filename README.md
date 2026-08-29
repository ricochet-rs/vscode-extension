# Ricochet for VS Code and Positron

Deploy and manage [Ricochet](https://ricochet.rs) content without leaving the editor.

The extension drives the `ricochet` CLI rather than reimplementing it.
Bundling, `_ricochet.toml` validation, environment variable encryption and credential storage keep exactly one implementation, in the CLI, and the extension is the interface to it.

## Features

**Catch configuration errors while you type.**
`_ricochet.toml` is validated against the same rules the server applies, so a content type that disagrees with its language, an entrypoint with the wrong extension, a `[schedule]` on an app or an incomplete `[serve]` table is reported in the editor instead of at deploy time.
Key and value completion covers every table in the schema.

**Deploy from the sidebar.**
The Project view shows what the active `_ricochet.toml` describes and whether it has ever been deployed.
Deploying reports progress in a notification, streams the CLI's output to the Ricochet log, and offers to open the result.

**See where the item went.**
The Deployments view lists the item's deployment history with status, and opens any entry in the web UI.

**Manage servers.**
The Servers view lists the profiles from the CLI's own configuration, shows which ones hold a key, and can add a server, sign in, or change the default.

## Requirements

The `ricochet` CLI must be installed and on your `PATH`.

```sh
curl -fsSL https://ricochet.rs/install.sh | sh
```

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

| Command                                   | Description                                       |
| ----------------------------------------- | ------------------------------------------------- |
| `Ricochet: Deploy`                        | Deploy the active project.                        |
| `Ricochet: Run Task Now`                  | Invoke a deployed task.                           |
| `Ricochet: Open Deployed Item in Browser` | Open the item in the web UI.                      |
| `Ricochet: Create _ricochet.toml`         | Write a minimal, valid config to start from.      |
| `Ricochet: Select Active Project`         | Choose between several projects in one workspace. |
| `Ricochet: Add Server`                    | Add a server profile.                             |
| `Ricochet: Sign In to Server`             | Store an API key for a server.                    |
| `Ricochet: Show Log`                      | Open the Ricochet log channel.                    |

## Known limitations

These follow from gaps in the CLI, tracked in [ricochet-rs/cli#212](https://github.com/ricochet-rs/cli/issues/212).

- Deploy progress is the CLI's own status lines rather than structured events, because `deploy` does not honour `-F json` yet.
- Running a task reports that the run started and points at the web UI, because no CLI command polls an invocation to completion.
- There is no file inclusion view, because nothing reports what a bundle would contain without deploying it.
- Signing in is by pasting an API key. The CLI's browser flow binds a `localhost` callback, which is the wrong machine in a remote window.

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

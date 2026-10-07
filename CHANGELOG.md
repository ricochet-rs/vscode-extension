# Changelog

## Unreleased

- Require the `ricochet` CLI 1.3.0 or newer, and say so with an upgrade hint when an older one is installed.
- The Servers view shows which servers have a stored key.
- The Deployments view shows when each deployment happened, and marks failed, timed-out and dependency-mismatch deployments as failures.
- Cancelling an operation before the CLI starts no longer leaves the command running.

## 0.1.0

Initial release.

- Validate `_ricochet.toml` against the rules `ricochet-core` applies, and report problems as editor diagnostics.
- Complete keys and enum values for every table in the `_ricochet.toml` schema.
- Deploy the active project from the sidebar, the editor title bar or the command palette, with cancellable progress.
- List the active item's deployment history and open any entry in the web UI.
- List, add and sign in to server profiles from the CLI's own configuration.
- Invoke a deployed task from the editor.

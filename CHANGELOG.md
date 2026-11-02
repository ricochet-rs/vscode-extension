# Changelog

## Unreleased

- Require the `ricochet` CLI 1.4.0 or newer, and say so with an upgrade hint when an older one is installed.
- Deploying shows the number of bundled files and the upload percentage.
- A deploy that fails because the server rejects your key offers **Sign In**.
- The Servers view shows which servers have a stored key.
- The Deployments view shows when each deployment happened, and marks failed, timed-out and dependency-mismatch deployments as failures.
- Cancelling an operation before the CLI starts no longer leaves the command running.
- The **Bundle** view lists the files a deploy would send and groups the files left out by the reason.
- **Run Task Now** waits for the run to finish and reports whether it succeeded, failed or was cancelled, and how long it took. Cancelling stops waiting while the run continues on the server.

## 0.1.0

Initial release.

- Validate `_ricochet.toml` against the rules `ricochet-core` applies, and report problems as editor diagnostics.
- Complete keys and enum values for every table in the `_ricochet.toml` schema.
- Deploy the active project from the sidebar, the editor title bar or the command palette, with cancellable progress.
- List the active item's deployment history and open any entry in the web UI.
- List, add and sign in to server profiles from the CLI's own configuration.
- Invoke a deployed task from the editor.

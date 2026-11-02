# Changelog

## Unreleased

The first release of Ricochet for VS Code and Positron.
It needs the `ricochet` CLI 1.4.0 or newer, and offers an upgrade hint when an older one is installed.

### Configuration

- Problems in `_ricochet.toml` show up as editor diagnostics, checked against the rules the server applies, including the type and range of each value.
- Completion offers every key and value the `_ricochet.toml` schema allows.
- **Create \_ricochet.toml** lists the entrypoints found in the folder, asks for a name and access type, and writes the file.

### Deploying

- **Deploy** runs from the sidebar, the editor title bar or the command palette, and shows the bundled file count and upload percentage.
- The **Bundle** view lists the files a deploy would send and groups the files left out by the reason.
- A deploy rejected because of your key offers **Sign In**.
- The **Deployments** view lists the item's deployments with their time and status, and opens any of them in the web UI.
- The **Deployments** view shows **Not deployed yet** until the server has the item.
- **Open in Browser** finds the server URL from `ricochet.server`, whether it holds a URL or a profile name, or from the CLI's default server when it is empty.

### Tasks

- **Run Task Now** waits for the run and reports whether it succeeded, failed or was cancelled, and how long it took.
- Cancelling **Run Task Now** stops waiting, and the run carries on on the server.
- **Show Output** on a finished run opens what it printed in the **Ricochet Task Output** panel.

### Servers

- The **Servers** view lists the server profiles the CLI knows, adds new ones, and shows which have a stored key.
- Signing in offers a button that opens the server page where you create an API key.

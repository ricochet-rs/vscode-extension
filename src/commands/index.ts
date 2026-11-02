/**
 * Command registration.
 *
 * Commands are thin: they resolve the target, call the client, and report. Anything worth
 * testing lives in the layers below.
 */

import * as vscode from "vscode";
import { basename, join } from "node:path";
import { RicochetClient } from "../cli/client.js";
import { CancelledError, CliError } from "../cli/exec.js";
import { describeTaskRun } from "../cli/taskRun.js";
import { formatLogRecord } from "../cli/logRecords.js";
import { CliNotFoundError } from "../cli/binary.js";
import { clientOptions, serverUrl } from "../config.js";
import { deploy } from "./deploy.js";
import { credentialsUrl, deploymentUrl, itemKind, itemUrl } from "../project/config.js";
import { CONFIG_FILENAME, displayPath, type Workspace } from "../project/workspace.js";
import type { BundleView } from "../views/bundleView.js";
import type { DeploymentItem, DeploymentsView } from "../views/deploymentsView.js";
import type { ServerItem, ServersView } from "../views/serversView.js";
import { log, taskOutput } from "../ui/log.js";
import { ACCESS_TYPES } from "../toml/schema.js";

export interface Views {
  readonly bundle: BundleView;
  readonly deployments: DeploymentsView;
  readonly servers: ServersView;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  workspace: Workspace,
  views: Views,
): void {
  const register = (id: string, handler: (...args: never[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  register("ricochet.deploy", () => guard(() => deploy(workspace)));
  register("ricochet.refresh", async () => {
    await workspace.refresh();
    views.bundle.refresh();
    views.deployments.refresh();
    views.servers.refresh();
  });
  register("ricochet.showLog", () => log().show());
  register("ricochet.openConfig", async () => {
    const project = workspace.activeProject;
    if (project !== undefined) {
      await vscode.window.showTextDocument(project.uri);
    }
  });
  register("ricochet.createConfig", () => guard(() => createConfig(workspace)));
  register("ricochet.selectProject", () => selectProject(workspace));
  register("ricochet.invokeTask", () => guard(() => invokeTask(workspace)));
  register("ricochet.openInBrowser", () => guard(() => openInBrowser(workspace)));
  register("ricochet.openDeployment", (item: DeploymentItem) =>
    guard(() => openDeployment(workspace, item)),
  );
  register("ricochet.addServer", () => guard(() => addServer(views)));
  register("ricochet.login", (item?: ServerItem) => guard(() => login(views, item)));
  register("ricochet.setDefaultServer", (item: ServerItem) =>
    guard(() => setDefaultServer(views, item)),
  );
}

async function invokeTask(workspace: Workspace): Promise<void> {
  const project = workspace.activeProject;
  if (project === undefined || project.config.id === undefined) {
    void vscode.window.showWarningMessage("Deploy this item before running it.");
    return;
  }
  if (itemKind(project.config) !== "task") {
    void vscode.window.showWarningMessage(
      `\`${project.config.contentType ?? "This item"}\` is served rather than invoked.`,
    );
    return;
  }

  const id = project.config.id;
  const name = project.config.name ?? "Task";
  const client = RicochetClient.create(clientOptions(project.uri));
  const run = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running ${name}`,
      cancellable: true,
    },
    async (_progress, token) => {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      try {
        return await client.runTask(id, { cwd: project.directory, signal: controller.signal });
      } catch (error) {
        if (error instanceof CancelledError) {
          return undefined;
        }
        throw error;
      }
    },
  );
  if (run === undefined) {
    void vscode.window.showInformationMessage(
      `Stopped waiting for ${name}. The run continues on the server.`,
    );
    return;
  }

  const outcome = describeTaskRun(name, run);
  log().info(`Task run ${run.id}: ${run.status}`);
  const url = await serverUrl(project.uri);
  const openable = url !== undefined ? ["Open in Browser"] : [];
  const show =
    outcome.level === "error"
      ? vscode.window.showErrorMessage
      : outcome.level === "warning"
        ? vscode.window.showWarningMessage
        : vscode.window.showInformationMessage;
  const action = await show(outcome.message, "Show Output", ...openable);
  if (action === "Show Output") {
    await showTaskOutput(client, name, run.id);
  }
  if (action === "Open in Browser" && url !== undefined) {
    const target = itemUrl(url, project.config);
    if (target !== undefined) {
      await vscode.env.openExternal(vscode.Uri.parse(target));
    }
  }
}

/** Replays a finished run's output, which the server keeps under the run's ID, into its own channel. */
async function showTaskOutput(client: RicochetClient, name: string, runId: string): Promise<void> {
  const output = taskOutput();
  output.clear();
  output.appendLine(`${name}, run ${runId}`);
  output.show(true);
  let lines = 0;
  const finished = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Loading the output of ${name}`,
      cancellable: true,
    },
    async (_progress, token) => {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      try {
        await client.log(runId, {
          signal: controller.signal,
          onRecord: (record) => {
            output.appendLine(formatLogRecord(record));
            lines += 1;
          },
        });
        return true;
      } catch (error) {
        if (error instanceof CancelledError) {
          return false;
        }
        throw error;
      }
    },
  );
  if (!finished) {
    output.appendLine("Stopped loading the output.");
  } else if (lines === 0) {
    output.appendLine("The run wrote no output.");
  }
}

async function openInBrowser(workspace: Workspace): Promise<void> {
  const project = workspace.activeProject;
  if (project === undefined || project.config.id === undefined) {
    void vscode.window.showWarningMessage("This item has no content ID yet. Deploy it first.");
    return;
  }
  const url = await serverUrl(project.uri);
  if (url === undefined) {
    void vscode.window.showWarningMessage(
      "No server URL is known. Set `ricochet.server`, or set a default server.",
    );
    return;
  }
  const target = itemUrl(url, project.config);
  if (target !== undefined) {
    await vscode.env.openExternal(vscode.Uri.parse(target));
  }
}

async function openDeployment(workspace: Workspace, item: DeploymentItem): Promise<void> {
  const project = workspace.activeProject;
  const url = project === undefined ? undefined : await serverUrl(project.uri);
  if (url === undefined) {
    void vscode.window.showWarningMessage(
      "No server URL is known. Set `ricochet.server`, or set a default server.",
    );
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(deploymentUrl(url, item.deployment.id)));
}

async function selectProject(workspace: Workspace): Promise<void> {
  const picks = workspace.all.map((project) => ({
    label: project.label,
    description: displayPath(project.directory),
    project,
  }));
  const chosen = await vscode.window.showQuickPick(picks, { title: "Select the active project" });
  if (chosen !== undefined) {
    workspace.setActive(chosen.project.uri);
  }
}

/** Writes `_ricochet.toml` with `ricochet init`, offering the entrypoints `ricochet detect` finds. */
async function createConfig(workspace: Workspace): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    void vscode.window.showWarningMessage("Open a folder first.");
    return;
  }
  const directory = folder.uri.fsPath;
  const target = vscode.Uri.file(join(directory, CONFIG_FILENAME));
  try {
    await vscode.workspace.fs.stat(target);
    void vscode.window.showWarningMessage(`${CONFIG_FILENAME} already exists.`);
    await vscode.window.showTextDocument(target);
    return;
  } catch {
    // Not existing is the expected path.
  }

  const client = RicochetClient.create(clientOptions(folder.uri));
  const candidates = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "Looking for deployable content" },
    () => client.detect(directory),
  );
  if (candidates.length === 0) {
    void vscode.window.showWarningMessage(
      `No deployable content was found in ${folder.name}. Add an entrypoint, such as \`app.R\`, \`app.py\` or \`report.qmd\`, and try again.`,
    );
    return;
  }

  const title = `Create ${CONFIG_FILENAME}`;
  const entry = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({
      label: candidate.path,
      description: candidate.contentType,
      candidate,
    })),
    { title, placeHolder: "Entrypoint to deploy" },
  );
  if (entry === undefined) {
    return;
  }
  const name = await vscode.window.showInputBox({
    title,
    prompt: "Item name",
    value: basename(directory),
    validateInput: (value) => (value.trim().length > 0 ? undefined : "A name is required"),
  });
  if (name === undefined) {
    return;
  }
  const access = await vscode.window.showQuickPick([...ACCESS_TYPES], {
    title,
    placeHolder: "Who can open the item",
  });
  if (access === undefined) {
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: `Writing ${CONFIG_FILENAME}` },
    () =>
      client.init(directory, {
        contentType: entry.candidate.contentType,
        entrypoint: entry.candidate.path,
        name: name.trim(),
        accessType: access,
      }),
  );
  await workspace.refresh();
  await vscode.window.showTextDocument(target);
}

async function addServer(views: Views): Promise<void> {
  const url = await vscode.window.showInputBox({
    title: "Add a Ricochet server",
    prompt: "Server URL",
    placeHolder: "https://ricochet.example.com",
    validateInput: (value) =>
      /^https?:\/\/\S+$/.test(value.trim())
        ? undefined
        : "The URL must start with http:// or https://",
  });
  if (url === undefined) {
    return;
  }
  const name = await vscode.window.showInputBox({
    title: "Add a Ricochet server",
    prompt: "Profile name",
    value: defaultProfileName(url),
    validateInput: (value) => (value.trim().length > 0 ? undefined : "A profile name is required"),
  });
  if (name === undefined) {
    return;
  }
  await RicochetClient.create(clientOptions()).addServer(name.trim(), url.trim());
  views.servers.refresh();
  void vscode.window.showInformationMessage(`Added \`${name.trim()}\`. Sign in to deploy to it.`);
}

/**
 * Sign in by pasting a key.
 *
 * The CLI's browser flow binds a `localhost` callback, which is the wrong machine in a
 * remote window, so the extension offers the paste path it can always complete, with a
 * button that opens the page where the key is created.
 */
async function login(views: Views, item?: ServerItem): Promise<void> {
  const client = RicochetClient.create(clientOptions());
  const target = item?.server ?? (await pickServer(client));
  if (target === undefined) {
    return;
  }
  const key = await promptForKey(target);
  if (key === undefined) {
    return;
  }
  await client.loginWithKey(target.name, key);
  views.servers.refresh();
  void vscode.window.showInformationMessage(`Signed in to \`${target.name}\`.`);
}

/** Asks for an API key, resolving undefined when the box is dismissed. */
async function promptForKey(target: { name: string; url: string }): Promise<string | undefined> {
  const page = credentialsUrl(target.url);
  const openPage: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("link-external"),
    tooltip: "Open the page that creates an API key",
  };
  const input = vscode.window.createInputBox();
  input.title = `Sign in to ${target.name}`;
  input.prompt =
    page === undefined
      ? `Paste an API key from ${target.url}`
      : `Paste an API key from ${page}. The button above opens that page.`;
  input.password = true;
  input.placeholder = "rico_...";
  input.ignoreFocusOut = true;
  input.buttons = page === undefined ? [] : [openPage];

  return new Promise<string | undefined>((resolve) => {
    let key: string | undefined;
    input.onDidTriggerButton(() => {
      if (page !== undefined) {
        void vscode.env.openExternal(vscode.Uri.parse(page));
      }
    });
    input.onDidChangeValue((value) => {
      input.validationMessage = value.trim().length > 0 ? undefined : "A key is required";
    });
    input.onDidAccept(() => {
      if (input.value.trim().length === 0) {
        input.validationMessage = "A key is required";
        return;
      }
      key = input.value.trim();
      input.hide();
    });
    input.onDidHide(() => {
      input.dispose();
      resolve(key);
    });
    input.show();
  });
}

async function setDefaultServer(views: Views, item: ServerItem): Promise<void> {
  await RicochetClient.create(clientOptions()).setDefaultServer(item.server.name);
  views.servers.refresh();
}

async function pickServer(
  client: RicochetClient,
): Promise<{ name: string; url: string } | undefined> {
  const servers = await client.servers();
  if (servers.length === 0) {
    void vscode.window.showWarningMessage("Add a server first.");
    return undefined;
  }
  const chosen = await vscode.window.showQuickPick(
    servers.map((server) => ({ label: server.name, description: server.url, server })),
    { title: "Select a server" },
  );
  return chosen?.server;
}

function defaultProfileName(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0] ?? "ricochet";
  } catch {
    return "ricochet";
  }
}

/** Turns the errors every command shares into one notification path. */
async function guard(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof CliNotFoundError) {
      const choice = await vscode.window.showErrorMessage(error.message, "Open Settings");
      if (choice === "Open Settings") {
        await vscode.commands.executeCommand("workbench.action.openSettings", "ricochet.cli.path");
      }
      return;
    }
    const message =
      error instanceof CliError
        ? error.summary
        : error instanceof Error
          ? error.message
          : String(error);
    log().error(message);
    const choice = await vscode.window.showErrorMessage(message, "Show Log");
    if (choice === "Show Log") {
      log().show();
    }
  }
}

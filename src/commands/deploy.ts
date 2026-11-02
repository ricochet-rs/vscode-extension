/**
 * Deploying the active project.
 *
 * Every long operation runs under `withProgress` with a cancel button, and the CLI's own
 * output is mirrored into the log channel so a failure is diagnosable without a terminal.
 */

import * as vscode from "vscode";
import { join } from "node:path";
import { RicochetClient } from "../cli/client.js";
import { CancelledError, CliError } from "../cli/exec.js";
import { CliNotFoundError } from "../cli/binary.js";
import { DeployError, uploadPercent } from "../cli/deployEvents.js";
import { LineSplitter } from "../cli/lines.js";
import { clientOptions, confirmBeforeDeploy, serverUrl } from "../config.js";
import { itemUrl } from "../project/config.js";
import { log } from "../ui/log.js";
import type { Project, Workspace } from "../project/workspace.js";

export async function deploy(workspace: Workspace): Promise<void> {
  const project = workspace.activeProject;
  if (project === undefined) {
    void vscode.window.showWarningMessage("No _ricochet.toml found in this workspace.");
    return;
  }

  const blocker = await preflight(project);
  if (blocker !== undefined) {
    void vscode.window.showErrorMessage(blocker);
    return;
  }

  if (confirmBeforeDeploy()) {
    const target = displayPath(project.directory);
    const answer = await vscode.window.showInformationMessage(
      `Deploy ${project.config.name ?? target}?`,
      { modal: true, detail: `Everything under ${target} will be bundled and uploaded.` },
      "Deploy",
    );
    if (answer !== "Deploy") {
      return;
    }
  }

  const deployed = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Deploying ${project.config.name ?? "project"}`,
      cancellable: true,
    },
    async (progress, token) => {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      progress.report({ message: "bundling" });
      let uploaded = 0;
      const stderr = new LineSplitter();

      try {
        const client = RicochetClient.create(clientOptions(project.uri));
        await client.deploy(project.directory, {
          signal: controller.signal,
          onProgress: (event) => {
            if (event.event === "bundling") {
              log().info(`Bundled ${event.files} files.`);
              progress.report({ message: `bundled ${event.files} files` });
              return;
            }
            const percent = uploadPercent(event);
            progress.report({ message: `uploading ${percent}%`, increment: percent - uploaded });
            uploaded = percent;
          },
          onStderr: (chunk) => stderr.push(chunk).forEach((line) => log().info(line)),
        });
        stderr.flush().forEach((line) => log().info(line));
        return true;
      } catch (error) {
        stderr.flush().forEach((line) => log().info(line));
        reportFailure(error);
        return false;
      }
    },
  );
  // Outside `withProgress`, so the progress closes before this message waits on the user.
  if (deployed) {
    await onSuccess(workspace, project);
  }
}

/** The directory relative to its workspace folder, or the folder's name when it is the folder itself. */
function displayPath(directory: string): string {
  const relative = vscode.workspace.asRelativePath(directory);
  if (relative !== directory) {
    return relative;
  }
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(directory))?.name ?? directory;
}

/** Checks the things that make a deploy fail immediately, before spending a bundle on it. */
async function preflight(project: Project): Promise<string | undefined> {
  const { config } = project;
  if (config.contentType === undefined || config.entrypoint === undefined) {
    return "This _ricochet.toml is incomplete. Fix the reported problems before deploying.";
  }
  if (config.packages === undefined) {
    return "`language.packages` is not set, so there is no lockfile to deploy.";
  }
  const lockfile = vscode.Uri.file(join(project.directory, config.packages));
  const present = await exists(lockfile);
  if (!present) {
    // uv workspaces keep a single lockfile at the workspace root, so this is a warning path
    // for R and Julia only, where the CLI searches no parent directory.
    if (config.packages !== "uv.lock") {
      return `\`${config.packages}\` was not found next to _ricochet.toml. Create it before deploying.`;
    }
  }
  return undefined;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function onSuccess(workspace: Workspace, project: Project): Promise<void> {
  // The CLI writes content.id back into the file on a first deploy, so re-read it.
  await workspace.refresh();
  const updated = workspace.all.find((p) => p.uri.toString() === project.uri.toString());
  const config = updated?.config ?? project.config;
  const server = await serverUrl(project.uri);
  const url = server === undefined ? undefined : itemUrl(server, config);

  const action = await vscode.window.showInformationMessage(
    `Deployed ${config.name ?? "project"}.`,
    ...(url === undefined ? ["Show Log"] : ["Open", "Show Log"]),
  );
  if (action === "Open" && url !== undefined) {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }
  if (action === "Show Log") {
    log().show();
  }
}

function reportFailure(error: unknown): void {
  if (error instanceof CancelledError) {
    log().info("Deploy cancelled.");
    return;
  }
  if (error instanceof CliNotFoundError) {
    void vscode.window
      .showErrorMessage(error.message, "Open Settings")
      .then((action) =>
        action === "Open Settings"
          ? vscode.commands.executeCommand("workbench.action.openSettings", "ricochet.cli.path")
          : undefined,
      );
    return;
  }
  const message =
    error instanceof CliError
      ? error.summary
      : error instanceof Error
        ? error.message
        : String(error);
  log().error(message);
  const signIn = error instanceof DeployError && error.kind === "auth" ? ["Sign In"] : [];
  void vscode.window
    .showErrorMessage(`Deploy failed: ${message}`, ...signIn, "Show Log")
    .then((action) => {
      if (action === "Sign In") {
        return vscode.commands.executeCommand("ricochet.login");
      }
      return action === "Show Log" ? log().show() : undefined;
    });
}

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
import { clientOptions, confirmBeforeDeploy } from "../config.js";
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
    const target = vscode.workspace.asRelativePath(project.directory);
    const answer = await vscode.window.showInformationMessage(
      `Deploy ${project.config.name ?? target}?`,
      { modal: true, detail: `Everything under ${target} will be bundled and uploaded.` },
      "Deploy",
    );
    if (answer !== "Deploy") {
      return;
    }
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Deploying ${project.config.name ?? "project"}`,
      cancellable: true,
    },
    async (progress, token) => {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      progress.report({ message: "bundling" });

      try {
        const client = RicochetClient.create(clientOptions(project.uri));
        await client.deploy(project.directory, {
          signal: controller.signal,
          onStdout: (chunk) => {
            for (const line of chunk.split("\n").map((l) => l.trim())) {
              if (line.length > 0) {
                log().info(line);
                progress.report({ message: line.slice(0, 60) });
              }
            }
          },
          onStderr: (chunk) => log().warn(chunk.trimEnd()),
        });
        await onSuccess(workspace, project);
      } catch (error) {
        reportFailure(error);
      }
    },
  );
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
  const server = vscode.workspace
    .getConfiguration("ricochet", project.uri)
    .get<string>("server", "");
  const url = server.startsWith("http") ? itemUrl(server, config) : undefined;

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
  const message = error instanceof CliError ? error.summary : String(error);
  log().error(message);
  void vscode.window
    .showErrorMessage(`Deploy failed: ${message}`, "Show Log")
    .then((action) => (action === "Show Log" ? log().show() : undefined));
}

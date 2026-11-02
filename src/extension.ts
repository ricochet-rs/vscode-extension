/**
 * Extension entry point.
 *
 * Activation stays cheap: it wires the views and providers and returns. Nothing here
 * spawns a process, so a workspace that merely contains a `_ricochet.toml` pays almost
 * nothing until the user asks for something.
 */

import * as vscode from "vscode";
import { registerCommands } from "./commands/index.js";
import { registerCompletion } from "./toml/completion.js";
import { registerDiagnostics } from "./toml/diagnostics.js";
import { BundleView } from "./views/bundleView.js";
import { DeploymentsView } from "./views/deploymentsView.js";
import { ProjectView } from "./views/projectView.js";
import { ServersView } from "./views/serversView.js";
import { StatusBar } from "./ui/statusBar.js";
import { Workspace } from "./project/workspace.js";
import { createLog, createTaskOutput, log } from "./ui/log.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(createLog(), createTaskOutput());

  const workspace = new Workspace();
  context.subscriptions.push(workspace);

  const views = {
    bundle: new BundleView(workspace),
    deployments: new DeploymentsView(workspace),
    servers: new ServersView(),
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("ricochet.project", new ProjectView(workspace)),
    vscode.window.registerTreeDataProvider("ricochet.bundle", views.bundle),
    vscode.window.registerTreeDataProvider("ricochet.deployments", views.deployments),
    vscode.window.registerTreeDataProvider("ricochet.servers", views.servers),
    new StatusBar(workspace),
  );

  registerDiagnostics(context);
  registerCompletion(context);
  registerCommands(context, workspace, views);

  await workspace.refresh();
  log().info(`Ricochet activated with ${workspace.all.length} project(s).`);
}

export function deactivate(): void {
  // Every disposable is registered on the context, so the host handles teardown.
}

import * as vscode from "vscode";
import type { Workspace } from "../project/workspace.js";

/** Shows the active project and the server it deploys to. */
export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly workspace: Workspace) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "ricochet.deploy";
    workspace.onDidChange(() => this.update());
    this.update();
  }

  private update(): void {
    const project = this.workspace.activeProject;
    if (project === undefined) {
      this.item.hide();
      return;
    }
    const server = vscode.workspace
      .getConfiguration("ricochet", project.uri)
      .get<string>("server", "");
    this.item.text = `$(rocket) ${project.config.name ?? "Ricochet"}`;
    this.item.tooltip = new vscode.MarkdownString(
      [
        `**${project.config.name ?? "Ricochet project"}**`,
        server.length > 0 ? `Target: ${server}` : "Target: the CLI's default server",
        "",
        "Click to deploy.",
      ].join("\n\n"),
    );
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}

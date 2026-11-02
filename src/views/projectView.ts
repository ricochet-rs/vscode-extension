/**
 * The Project view: what the active `_ricochet.toml` says, at a glance.
 *
 * A tree is used rather than a webview so the content is themable, keyboard
 * navigable and screen-reader friendly without any work on our part.
 */

import * as vscode from "vscode";
import { itemKind } from "../project/config.js";
import { displayPath, type Project, type Workspace } from "../project/workspace.js";

class Row extends vscode.TreeItem {
  constructor(label: string, value: string, icon: string, tooltip?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip ?? `${label}: ${value}`;
  }
}

export class ProjectView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly workspace: Workspace) {
    workspace.onDidChange(() => this.changed.fire());
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element !== undefined) {
      return [];
    }
    const project = this.workspace.activeProject;
    if (project === undefined) {
      return [];
    }
    return rows(project, this.workspace.all.length);
  }
}

function rows(project: Project, total: number): vscode.TreeItem[] {
  const { config } = project;
  const kind = itemKind(config);
  const items: vscode.TreeItem[] = [];

  const name = new Row(
    config.name ?? "Unnamed",
    displayPath(project.directory),
    "package",
    "Open _ricochet.toml",
  );
  name.command = {
    command: "vscode.open",
    title: "Open _ricochet.toml",
    arguments: [project.uri],
  };
  items.push(name);

  if (total > 1) {
    const selector = new Row("Project", `${total} in this workspace`, "list-selection");
    selector.command = { command: "ricochet.selectProject", title: "Select Active Project" };
    items.push(selector);
  }

  items.push(new Row("Type", config.contentType ?? "not set", "symbol-enum"));
  items.push(new Row("Entrypoint", config.entrypoint ?? "not set", "file-code"));
  items.push(
    new Row(
      "Runtime",
      [config.language, config.packages].filter(Boolean).join(" · ") || "not set",
      "beaker",
    ),
  );
  items.push(new Row("Access", config.accessType ?? "not set", accessIcon(config.accessType)));

  if (kind === "task" && config.schedule !== undefined) {
    items.push(new Row("Schedule", config.schedule, "clock"));
  }

  items.push(
    config.id !== undefined
      ? new Row(
          "Content ID",
          config.id,
          "cloud",
          `Content ID ${config.id}. The Deployments view shows whether the server has it.`,
        )
      : new Row("Content ID", "not set", "circle-outline", "The first deploy assigns one."),
  );

  return items;
}

function accessIcon(access: string | undefined): string {
  switch (access) {
    case "external":
      return "globe";
    case "internal":
      return "organization";
    default:
      return "lock";
  }
}

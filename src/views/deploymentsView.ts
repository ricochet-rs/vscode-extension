/**
 * The Deployments view: this item's deployment history, read from the CLI.
 *
 * The list is fetched lazily and cached until something invalidates it, so opening the
 * sidebar does not fire a network call on every keystroke in the config.
 */

import * as vscode from "vscode";
import { itemKind } from "../project/config.js";
import type { Workspace } from "../project/workspace.js";
import type { Deployment, ItemKind } from "../cli/client.js";
import type { RunOptions } from "../cli/exec.js";
import { RicochetClient } from "../cli/client.js";
import { clientOptions } from "../config.js";
import { log } from "../ui/log.js";

export class DeploymentItem extends vscode.TreeItem {
  constructor(readonly deployment: Deployment) {
    super(shortId(deployment.id), vscode.TreeItemCollapsibleState.None);
    this.description = [deployment.status, formatDate(deployment.deployedAt)]
      .filter(Boolean)
      .join(" · ");
    this.iconPath = new vscode.ThemeIcon(
      statusIcon(deployment.status),
      statusColor(deployment.status),
    );
    this.contextValue = "ricochet.deployment";
    this.tooltip = new vscode.MarkdownString(
      [`**Deployment** \`${deployment.id}\``, `Status: ${deployment.status}`].join("\n\n"),
    );
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(message: string, icon: string, tooltip?: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
  }
}

const NOT_DEPLOYED = new MessageItem(
  "Not deployed yet",
  "circle-outline",
  "The server has no item with this content ID that your key can see. Deploying creates it.",
);

export class DeploymentsView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private cache: vscode.TreeItem[] | undefined;

  constructor(private readonly workspace: Workspace) {
    workspace.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.cache = undefined;
    this.changed.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (element !== undefined) {
      return [];
    }
    if (this.cache !== undefined) {
      return this.cache;
    }
    this.cache = await this.load();
    return this.cache;
  }

  private async load(): Promise<vscode.TreeItem[]> {
    const project = this.workspace.activeProject;
    if (project === undefined) {
      return [];
    }
    const id = project.config.id;
    if (id === undefined) {
      return [NOT_DEPLOYED];
    }
    const kind = itemKind(project.config);
    if (kind === undefined) {
      return [new MessageItem("Unknown content type", "warning")];
    }
    const client = RicochetClient.create(clientOptions(project.uri));
    const options = { cwd: project.directory };
    try {
      const deployments = await client.deployments(kind, id, options);
      if (deployments.length === 0) {
        return [new MessageItem("No deployments recorded", "circle-outline")];
      }
      return deployments.map((deployment) => new DeploymentItem(deployment));
    } catch (error) {
      // The server refuses an item it does not have the same way as one the key cannot read.
      if (await isUnknownItem(client, kind, id, options)) {
        return [NOT_DEPLOYED];
      }
      const message = error instanceof Error ? error.message : String(error);
      log().warn(`Could not list deployments: ${message}`);
      return [new MessageItem("Could not list deployments", "warning")];
    }
  }
}

async function isUnknownItem(
  client: RicochetClient,
  kind: ItemKind,
  id: string,
  options: RunOptions,
): Promise<boolean> {
  try {
    return !(await client.itemIds(kind, options)).has(id);
  } catch {
    return false;
  }
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 10)}…` : id;
}

function statusIcon(status: string): string {
  switch (status) {
    case "success":
      return "pass";
    case "failure":
    case "timeout":
    case "dependency_mismatch":
      return "error";
    case "pending":
      return "sync";
    default:
      return "circle-outline";
  }
}

function statusColor(status: string): vscode.ThemeColor | undefined {
  switch (status) {
    case "success":
      return new vscode.ThemeColor("testing.iconPassed");
    case "failure":
    case "timeout":
    case "dependency_mismatch":
      return new vscode.ThemeColor("testing.iconFailed");
    default:
      return undefined;
  }
}

function formatDate(value: Date | undefined): string {
  return value === undefined ? "" : value.toLocaleString();
}

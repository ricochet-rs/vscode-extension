/**
 * The Bundle view: which files a deploy would send, and why the rest stay behind.
 *
 * It reads a dry run from the CLI, which never contacts a server, so it works before signing in.
 * The result is cached until the project or its `_ricochet.toml` changes, or the user refreshes.
 */

import * as vscode from "vscode";
import { join } from "node:path";
import { RicochetClient, type BundleFile } from "../cli/client.js";
import { CliError } from "../cli/exec.js";
import { clientOptions } from "../config.js";
import { fileCount, formatSize, groupBundle, type BundleGroup } from "../project/bundle.js";
import type { Workspace } from "../project/workspace.js";
import { log } from "../ui/log.js";

class GroupItem extends vscode.TreeItem {
  constructor(readonly group: BundleGroup) {
    super(
      group.label,
      !group.listed || group.files.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : group.reason === undefined
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.description = `${fileCount(group.files.length)} · ${formatSize(group.bytes)}`;
    this.iconPath = new vscode.ThemeIcon(group.reason === undefined ? "package" : "circle-slash");
  }
}

class FileItem extends vscode.TreeItem {
  constructor(file: BundleFile, directory: string) {
    super(file.path, vscode.TreeItemCollapsibleState.None);
    const uri = vscode.Uri.file(file.source ?? join(directory, file.path));
    this.resourceUri = uri;
    this.description = formatSize(file.size);
    this.tooltip = file.source === undefined ? file.path : `${file.path}, from ${file.source}`;
    this.command = { command: "vscode.open", title: "Open File", arguments: [uri] };
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(message: string, icon: string, tooltip?: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
  }
}

export class BundleView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private cache: vscode.TreeItem[] | undefined;
  private directory = "";

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
    if (element instanceof GroupItem) {
      return element.group.files.map((file) => new FileItem(file, this.directory));
    }
    if (element !== undefined) {
      return [];
    }
    this.cache ??= await this.load();
    return this.cache;
  }

  private async load(): Promise<vscode.TreeItem[]> {
    const project = this.workspace.activeProject;
    if (project === undefined) {
      return [];
    }
    this.directory = project.directory;
    try {
      const client = RicochetClient.create(clientOptions(project.uri));
      const groups = groupBundle(await client.bundle(project.directory));
      if (groups[0]?.files.length === 0) {
        return [
          new MessageItem("No files would be sent", "warning"),
          ...groups.slice(1).map((group) => new GroupItem(group)),
        ];
      }
      return groups.map((group) => new GroupItem(group));
    } catch (error) {
      const message =
        error instanceof CliError
          ? error.summary
          : error instanceof Error
            ? error.message
            : String(error);
      log().warn(`Could not list the bundle: ${message}`);
      return [new MessageItem(message.replace(/^Error:\s*/, ""), "warning", message)];
    }
  }
}

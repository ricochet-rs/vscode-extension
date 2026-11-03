/**
 * The Servers view: the profiles configured in the CLI's own config file.
 *
 * The extension deliberately does not keep its own credential store. The CLI already owns
 * `~/.config/ricochet/config.toml`, and a second store would drift from it.
 */

import * as vscode from "vscode";
import { RicochetClient, type Server } from "../cli/client.js";
import { clientOptions } from "../config.js";
import { log } from "../ui/log.js";

export class ServerItem extends vscode.TreeItem {
  constructor(readonly server: Server) {
    super(server.name, vscode.TreeItemCollapsibleState.None);
    this.description = server.isDefault ? `default · ${server.url}` : server.url;
    this.contextValue = "ricochet.server";
    this.iconPath = new vscode.ThemeIcon(server.isDefault ? "star-full" : "server");
    this.tooltip = new vscode.MarkdownString(
      [
        `**${server.name}**`,
        server.url,
        server.hasKey ? "A key is stored for this server." : "No key stored. Sign in to deploy.",
      ].join("\n\n"),
    );
  }
}

class MessageItem extends vscode.TreeItem {
  constructor(message: string, icon: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class ServersView implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  private cache: vscode.TreeItem[] | undefined;

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
    try {
      const servers = await RicochetClient.create(clientOptions()).servers();
      return servers.map((server) => new ServerItem(server));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log().warn(`Could not list servers: ${message}`);
      return [new MessageItem(message, "warning")];
    }
  }
}

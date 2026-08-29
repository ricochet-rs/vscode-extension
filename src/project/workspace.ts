/**
 * Tracking the `_ricochet.toml` files in the workspace and which one is active.
 *
 * A workspace may hold several deployable directories, so the extension keeps a list
 * and one active selection rather than assuming a single project at the root.
 */

import * as vscode from "vscode";
import { dirname } from "node:path";
import { readConfig, type ProjectConfig } from "./config.js";
import { log } from "../ui/log.js";

export const CONFIG_FILENAME = "_ricochet.toml";

export interface Project {
  /** The `_ricochet.toml` itself. */
  readonly uri: vscode.Uri;
  /** The directory that gets deployed. */
  readonly directory: string;
  readonly label: string;
  readonly config: ProjectConfig;
}

export class Workspace implements vscode.Disposable {
  private projects: Project[] = [];
  private active: vscode.Uri | undefined;

  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  private readonly watcher: vscode.FileSystemWatcher;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.watcher = vscode.workspace.createFileSystemWatcher(`**/${CONFIG_FILENAME}`);
    this.disposables.push(
      this.watcher,
      this.changed,
      this.watcher.onDidCreate(() => void this.refresh()),
      this.watcher.onDidDelete(() => void this.refresh()),
      this.watcher.onDidChange(() => void this.refresh()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.refresh()),
    );
  }

  get all(): readonly Project[] {
    return this.projects;
  }

  get activeProject(): Project | undefined {
    if (this.active !== undefined) {
      const match = this.projects.find((p) => p.uri.toString() === this.active?.toString());
      if (match !== undefined) {
        return match;
      }
    }
    return this.projects[0];
  }

  setActive(uri: vscode.Uri): void {
    this.active = uri;
    this.changed.fire();
  }

  async refresh(): Promise<void> {
    const found = await vscode.workspace.findFiles(
      `**/${CONFIG_FILENAME}`,
      "**/{node_modules,.venv,.renv,renv/library,__pycache__}/**",
    );
    const projects: Project[] = [];
    for (const uri of found.sort((a, b) => a.fsPath.localeCompare(b.fsPath))) {
      const project = await load(uri);
      if (project !== undefined) {
        projects.push(project);
      }
    }
    this.projects = projects;
    await vscode.commands.executeCommand("setContext", "ricochet.hasProject", projects.length > 0);
    this.changed.fire();
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

async function load(uri: vscode.Uri): Promise<Project | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const config = readConfig(new TextDecoder().decode(bytes));
    const directory = dirname(uri.fsPath);
    return {
      uri,
      directory,
      label: config.name ?? vscode.workspace.asRelativePath(directory),
      config,
    };
  } catch (error) {
    // A config mid-edit fails to parse constantly; the diagnostics surface that, not a toast.
    log().debug(`Skipping ${uri.fsPath}: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
}

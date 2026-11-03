/**
 * Tracking the `_ricochet.toml` files in the workspace and which one is active.
 *
 * A workspace may hold several deployable directories, so the extension keeps a list
 * and one active selection rather than assuming a single project at the root.
 */

import * as vscode from "vscode";
import { dirname, join } from "node:path";
import { readConfig, type ProjectConfig } from "./config.js";
import { TomlDocument } from "../toml/document.js";
import { validate, type Problem } from "../toml/validate.js";
import { log } from "../ui/log.js";

export const CONFIG_FILENAME = "_ricochet.toml";

export interface Project {
  /** The `_ricochet.toml` itself. */
  readonly uri: vscode.Uri;
  /** The directory that gets deployed. */
  readonly directory: string;
  readonly label: string;
  readonly config: ProjectConfig;
  readonly document: TomlDocument;
  /** What validation reports for the file on disk, plus a missing lockfile, empty when `ricochet.validation.enabled` is off. */
  readonly problems: readonly Problem[];
  readonly missingLockfile: boolean;
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

/** The directory relative to its workspace folder, or the folder's name when it is the folder itself. */
export function displayPath(directory: string): string {
  const relative = vscode.workspace.asRelativePath(directory);
  if (relative !== directory) {
    return relative;
  }
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(directory))?.name ?? directory;
}

async function load(uri: vscode.Uri): Promise<Project | undefined> {
  try {
    const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    const config = readConfig(text);
    const document = TomlDocument.parse(text);
    const validating = vscode.workspace
      .getConfiguration("ricochet")
      .get<boolean>("validation.enabled", true);
    const directory = dirname(uri.fsPath);
    const problems = validating ? validate(document) : [];
    const packages = document.entry("language.packages");
    const missingLockfile =
      validating &&
      packages !== undefined &&
      config.packages !== undefined &&
      !(await lockfileExists(directory, config.packages));
    if (missingLockfile && packages !== undefined) {
      problems.push({
        span: packages.valueSpan,
        message: `\`${config.packages}\` was not found next to _ricochet.toml.`,
        severity: "error",
      });
    }
    return {
      uri,
      directory,
      label: config.name ?? displayPath(directory),
      config,
      document,
      problems,
      missingLockfile,
    };
  } catch (error) {
    // A config mid-edit fails to parse constantly; the diagnostics surface that, not a toast.
    log().debug(`Skipping ${uri.fsPath}: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
}

/** Whether `name` is beside the config, or for `uv.lock` in any parent, since uv workspaces keep one at the root. */
async function lockfileExists(directory: string, name: string): Promise<boolean> {
  for (let dir = directory; ; dir = dirname(dir)) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(join(dir, name)));
      return true;
    } catch {
      if (name !== "uv.lock" || dirname(dir) === dir) {
        return false;
      }
    }
  }
}

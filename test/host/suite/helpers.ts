/** Shared controls for the extension-host suites: the stub CLI's replies and a recorded UI. */

import * as vscode from "vscode";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STUB_ENV } from "../stub.js";

export const EXTENSION_ID = "ricochet.ricochet";
export const APP_ID = "01JTESTAPP0000000000000000";

export const SERVERS = [
  { name: "main", url: "https://main.example.com/", api_key: "rk_***", default: false },
  { name: "local", url: "http://localhost:6188/", api_key: "rk_***", default: true },
];

function stubDir(): string {
  const dir = process.env[STUB_ENV];
  if (dir === undefined) {
    throw new Error(`${STUB_ENV} is not set; run the suites through test/host/runTest.ts.`);
  }
  return dir;
}

/** Sets what the stub prints for `name`, such as `deploy` or `server-list`, and its exit code. */
export function reply(name: string, stdout: string, code = 0, stderr = ""): void {
  const dir = stubDir();
  writeFileSync(join(dir, `${name}.out`), stdout);
  writeFileSync(join(dir, `${name}.code`), String(code));
  writeFileSync(join(dir, `${name}.err`), stderr);
}

/** Every command line the stub received since the last `clearCalls`, global flags included. */
export function calls(): string[] {
  const log = join(stubDir(), "calls.log");
  return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
}

export function clearCalls(): void {
  rmSync(join(stubDir(), "calls.log"), { force: true });
}

export function workspaceDir(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    throw new Error("The suites need the fixture workspace open.");
  }
  return folder.uri.fsPath;
}

export async function activate(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (extension === undefined) {
    throw new Error(`${EXTENSION_ID} is not installed in the test host.`);
  }
  await extension.activate();
}

/** Re-reads the workspace's projects now, rather than waiting for the file watcher. */
export async function refreshProjects(): Promise<void> {
  await vscode.commands.executeCommand("ricochet.refresh");
}

export async function setServer(value: string | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration("ricochet")
    .update("server", value, vscode.ConfigurationTarget.Global);
}

export interface Shown {
  readonly level: "info" | "warning" | "error";
  readonly message: string;
  readonly items: readonly string[];
  /** Whether a `withProgress` notification was still open when the message appeared. */
  readonly duringProgress: boolean;
}

/**
 * Replaces the parts of `vscode.window` and `vscode.env` a command talks to with recorders,
 * so a suite can answer prompts and inspect what the user would have seen.
 */
export class RecordedUi {
  readonly shown: Shown[] = [];
  readonly opened: string[] = [];
  /** Modal prompts, which the recorder answers with `modalAnswer`. */
  readonly modals: Array<{ readonly message: string; readonly detail: string | undefined }> = [];
  /** The button a modal message answers with; undefined behaves like Cancel. */
  modalAnswer: string | undefined;
  /** Answers for `showQuickPick`, in order; each picks the item whose label matches. */
  readonly picks: string[] = [];
  /** The items each `showQuickPick` offered, as labels with their descriptions. */
  readonly offered: Array<
    Array<{ readonly label: string; readonly description: string | undefined }>
  > = [];
  /** Answers for `showInputBox`, in order. */
  readonly inputs: string[] = [];

  private openProgress = 0;
  private readonly restores: Array<() => void> = [];

  install(): this {
    const message =
      (level: Shown["level"]) =>
      (text: string, ...rest: unknown[]): Promise<string | undefined> => {
        const options = rest[0];
        if (typeof options === "object" && options !== null && "modal" in options) {
          const { detail } = options as vscode.MessageOptions;
          this.modals.push({ message: text, detail });
          return Promise.resolve(options.modal === true ? this.modalAnswer : undefined);
        }
        this.shown.push({
          level,
          message: text,
          items: rest.filter((item): item is string => typeof item === "string"),
          duringProgress: this.openProgress > 0,
        });
        return Promise.resolve(undefined);
      };

    this.replace(vscode.window, "showInformationMessage", message("info"));
    this.replace(vscode.window, "showWarningMessage", message("warning"));
    this.replace(vscode.window, "showErrorMessage", message("error"));
    this.replace(
      vscode.window,
      "withProgress",
      async (
        _options: unknown,
        task: (progress: unknown, token: vscode.CancellationToken) => Promise<unknown>,
      ) => {
        this.openProgress += 1;
        const cancellation = new vscode.CancellationTokenSource();
        try {
          return await task({ report: () => undefined }, cancellation.token);
        } finally {
          cancellation.dispose();
          this.openProgress -= 1;
        }
      },
    );
    this.replace(
      vscode.window,
      "showQuickPick",
      async (items: ReadonlyArray<string | vscode.QuickPickItem>) => {
        const wanted = this.picks.shift();
        this.offered.push(
          (await items).map((item) =>
            typeof item === "string"
              ? { label: item, description: undefined }
              : { label: item.label, description: item.description },
          ),
        );
        return (await items).find((item) =>
          typeof item === "string" ? item === wanted : item.label === wanted,
        );
      },
    );
    this.replace(vscode.window, "showInputBox", async () => this.inputs.shift());
    this.replace(vscode.env, "openExternal", async (uri: vscode.Uri) => {
      this.opened.push(uri.toString(true));
      return true;
    });
    return this;
  }

  dispose(): void {
    this.restores
      .splice(0)
      .reverse()
      .forEach((restore) => restore());
  }

  private replace(target: object, key: string, value: unknown): void {
    const original = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { value, configurable: true, writable: true });
    this.restores.push(() => {
      if (original !== undefined) {
        Object.defineProperty(target, key, original);
      }
    });
  }
}

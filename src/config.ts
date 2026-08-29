/**
 * Reading extension settings.
 *
 * Settings are resolved per resource so a multi-root workspace can target a different
 * server per folder.
 */

import * as vscode from "vscode";
import type { ClientOptions } from "./cli/client.js";

export function clientOptions(scope?: vscode.Uri): ClientOptions {
  const config = vscode.workspace.getConfiguration("ricochet", scope ?? null);
  const binaryPath = config.get<string>("cli.path", "").trim();
  const server = config.get<string>("server", "").trim();
  return {
    ...(binaryPath.length > 0 ? { binaryPath } : {}),
    ...(server.length > 0 ? { server } : {}),
  };
}

export function confirmBeforeDeploy(): boolean {
  return vscode.workspace.getConfiguration("ricochet").get<boolean>("deploy.confirm", true);
}

/**
 * Reading extension settings.
 *
 * Settings are resolved per resource so a multi-root workspace can target a different
 * server per folder.
 */

import * as vscode from "vscode";
import { RicochetClient, type ClientOptions } from "./cli/client.js";
import { resolveServerUrl } from "./project/config.js";

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

/** The URL of the server commands target, looking a profile name up in the CLI's server list. */
export async function serverUrl(scope: vscode.Uri): Promise<string | undefined> {
  const setting = vscode.workspace.getConfiguration("ricochet", scope).get<string>("server", "");
  const servers = setting.trim().startsWith("http")
    ? []
    : await RicochetClient.create(clientOptions(scope))
        .servers()
        .catch(() => []);
  return resolveServerUrl(setting, servers);
}

/**
 * What the extension needs to know about a `_ricochet.toml`, derived from its contents.
 *
 * Pure, so the interesting decisions (is this a task, has it ever been deployed) are
 * testable without an extension host.
 */

import { CONTENT_TYPES } from "../toml/schema.js";
import { TomlDocument } from "../toml/document.js";
import type { ItemKind } from "../cli/client.js";

export interface ProjectConfig {
  readonly name: string | undefined;
  readonly contentType: string | undefined;
  readonly entrypoint: string | undefined;
  readonly accessType: string | undefined;
  readonly language: string | undefined;
  readonly packages: string | undefined;
  /** Present once the item has been deployed at least once. */
  readonly id: string | undefined;
  readonly schedule: string | undefined;
}

export function readConfig(text: string): ProjectConfig {
  const doc = TomlDocument.parse(text);
  return {
    name: doc.string("content.name"),
    contentType: doc.string("content.content_type"),
    entrypoint: doc.string("content.entrypoint"),
    accessType: doc.string("content.access_type"),
    language: doc.string("language.name"),
    packages: doc.string("language.packages"),
    id: doc.string("content.id"),
    schedule: doc.string("schedule.cron"),
  };
}

/** Apps and tasks take different CLI subcommands, so this drives most command routing. */
export function itemKind(config: ProjectConfig): ItemKind | undefined {
  const spec = config.contentType === undefined ? undefined : CONTENT_TYPES[config.contentType];
  if (spec === undefined) {
    return undefined;
  }
  return spec.task ? "task" : "app";
}

export function isDeployed(config: ProjectConfig): boolean {
  return config.id !== undefined && config.id.length > 0;
}

/** The web UI path for a deployed item, which differs between apps and tasks. */
export function itemUrl(serverUrl: string, config: ProjectConfig): string | undefined {
  const kind = itemKind(config);
  if (config.id === undefined || kind === undefined) {
    return undefined;
  }
  const base = serverUrl.replace(/\/+$/, "");
  return kind === "task" ? `${base}/tasks/${config.id}` : `${base}/apps/${config.id}/overview`;
}

export function deploymentUrl(serverUrl: string, deploymentId: string): string {
  return `${serverUrl.replace(/\/+$/, "")}/deployments/${deploymentId}`;
}

/** The lockfile that must sit beside the config, used for a pre-deploy check. */
export function requiredLockfile(config: ProjectConfig): string | undefined {
  return config.packages;
}

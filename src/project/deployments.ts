/**
 * What the Deployments view shows for an item, decided from the CLI's answers.
 *
 * A server can answer an ID it does not have with an empty deployment list or with the
 * same refusal as an item the key cannot read, so the item list settles both cases.
 */

import type { Deployment, ItemKind, RicochetClient } from "../cli/client.js";
import type { RunOptions } from "../cli/exec.js";

export type DeploymentHistory =
  | { readonly state: "listed"; readonly deployments: readonly Deployment[] }
  | { readonly state: "none" }
  | { readonly state: "not-deployed" }
  | { readonly state: "failed"; readonly error: unknown };

export type HistoryClient = Pick<RicochetClient, "deployments" | "itemIds">;

export async function deploymentHistory(
  client: HistoryClient,
  kind: ItemKind,
  id: string,
  options: RunOptions = {},
): Promise<DeploymentHistory> {
  try {
    const deployments = await client.deployments(kind, id, options);
    if (deployments.length > 0) {
      return { state: "listed", deployments };
    }
    return (await isUnknownItem(client, kind, id, options))
      ? { state: "not-deployed" }
      : { state: "none" };
  } catch (error) {
    return (await isUnknownItem(client, kind, id, options))
      ? { state: "not-deployed" }
      : { state: "failed", error };
  }
}

/** Whether a listed deployment has yet to settle, so the history is worth reading again. */
export function isSettling(history: DeploymentHistory): boolean {
  return (
    history.state === "listed" &&
    history.deployments.some((deployment) => deployment.status === "pending")
  );
}

/** False when the item list cannot be read, so a failure is never mistaken for a missing item. */
async function isUnknownItem(
  client: HistoryClient,
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

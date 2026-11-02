import { describe, expect, it } from "vitest";
import type { Deployment } from "../cli/client.js";
import { deploymentHistory, type HistoryClient } from "./deployments.js";

const ID = "01JTESTAPP0000000000000000";
const DEPLOYMENT: Deployment = { id: "01JDEP", status: "success", deployedAt: undefined };

function client(
  deployments: () => Promise<Deployment[]>,
  itemIds: () => Promise<Set<string>>,
): HistoryClient {
  return { deployments, itemIds };
}

const known = (): Promise<Set<string>> => Promise.resolve(new Set([ID]));
const unknown = (): Promise<Set<string>> => Promise.resolve(new Set(["01JOTHER"]));
const refused = (): Promise<never> => Promise.reject(new Error("403 Forbidden"));

describe("deploymentHistory", () => {
  it("lists the deployments the server returns", async () => {
    const history = await deploymentHistory(
      client(() => Promise.resolve([DEPLOYMENT]), known),
      "app",
      ID,
    );
    expect(history).toEqual({ state: "listed", deployments: [DEPLOYMENT] });
  });

  it("reports an empty list for an item the server has as having no deployments", async () => {
    const history = await deploymentHistory(
      client(() => Promise.resolve([]), known),
      "app",
      ID,
    );
    expect(history).toEqual({ state: "none" });
  });

  it("reports an empty list for an item the server lacks as not deployed", async () => {
    const history = await deploymentHistory(
      client(() => Promise.resolve([]), unknown),
      "app",
      ID,
    );
    expect(history).toEqual({ state: "not-deployed" });
  });

  it("reports a refusal for an item the server lacks as not deployed", async () => {
    const history = await deploymentHistory(client(refused, unknown), "task", ID);
    expect(history).toEqual({ state: "not-deployed" });
  });

  it("keeps a refusal for an item the server has as a failure", async () => {
    const history = await deploymentHistory(client(refused, known), "app", ID);
    expect(history).toMatchObject({ state: "failed" });
  });

  it("never calls an item missing when the item list cannot be read either", async () => {
    expect(await deploymentHistory(client(refused, refused), "app", ID)).toMatchObject({
      state: "failed",
    });
    expect(
      await deploymentHistory(
        client(() => Promise.resolve([]), refused),
        "app",
        ID,
      ),
    ).toEqual({ state: "none" });
  });
});

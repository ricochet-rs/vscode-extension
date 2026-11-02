import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  APP_ID,
  RecordedUi,
  SERVERS,
  activate,
  calls,
  clearCalls,
  refreshProjects,
  reply,
  setServer,
  workspaceDir,
} from "./helpers.js";

const EVENTS = [
  { event: "bundling", files: 3 },
  { event: "uploading", bytes_sent: 50, bytes_total: 100 },
  { event: "uploading", bytes_sent: 100, bytes_total: 100 },
  { event: "done", id: APP_ID, deployment_id: "01JTESTDEPLOY0000000000000" },
];

const jsonLines = (events: readonly object[]): string =>
  events.map((event) => JSON.stringify(event)).join("\n");

describe("Deploy", () => {
  let ui: RecordedUi;

  before(activate);

  beforeEach(async () => {
    await setServer("main");
    await refreshProjects();
    clearCalls();
    reply("server-list", JSON.stringify(SERVERS));
    reply("app-list", JSON.stringify([{ id: APP_ID }]));
    reply("app-deployments", "[]");
    ui = new RecordedUi().install();
    ui.modalAnswer = "Deploy";
  });

  afterEach(() => ui.dispose());

  it("deploys the project directory to the configured server", async () => {
    reply("deploy", jsonLines(EVENTS));

    await vscode.commands.executeCommand("ricochet.deploy");

    assert.ok(
      calls().includes(`-F json --server main deploy ${workspaceDir()}`),
      `stub calls: ${calls().join(" | ")}`,
    );
  });

  it("reports success only after the progress notification has closed", async () => {
    reply("deploy", jsonLines(EVENTS));

    await vscode.commands.executeCommand("ricochet.deploy");

    const deployed = ui.shown.find((shown) => shown.message === "Deployed Fixture App.");
    assert.ok(deployed, `messages: ${JSON.stringify(ui.shown)}`);
    assert.equal(deployed.duringProgress, false);
  });

  it("offers Open when the server profile has a URL", async () => {
    reply("deploy", jsonLines(EVENTS));

    await vscode.commands.executeCommand("ricochet.deploy");

    const deployed = ui.shown.find((shown) => shown.message === "Deployed Fixture App.");
    assert.deepEqual(deployed?.items, ["Open", "Show Log"]);
  });

  it("offers Sign In when the server rejects the key", async () => {
    reply(
      "deploy",
      jsonLines([
        { event: "bundling", files: 3 },
        { event: "error", kind: "auth", status: 401, message: "The API key was rejected." },
      ]),
      1,
    );

    await vscode.commands.executeCommand("ricochet.deploy");

    const failure = ui.shown.find((shown) => shown.level === "error");
    assert.equal(failure?.message, "Deploy failed: The API key was rejected.");
    assert.deepEqual(failure?.items, ["Sign In", "Show Log"]);
  });

  it("names the workspace folder, not its absolute path, in the confirmation", async () => {
    reply("deploy", jsonLines(EVENTS));

    await vscode.commands.executeCommand("ricochet.deploy");

    const folder = vscode.workspace.workspaceFolders?.[0]?.name;
    assert.deepEqual(ui.modals, [
      {
        message: "Deploy Fixture App?",
        detail: `Everything under ${folder} will be bundled and uploaded.`,
      },
    ]);
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    reply("deploy", jsonLines(EVENTS));
    ui.modalAnswer = undefined;

    await vscode.commands.executeCommand("ricochet.deploy");

    assert.deepEqual(
      calls().filter((line) => / deploy /.test(` ${line} `) && !line.includes("--dry-run")),
      [],
    );
    assert.deepEqual(ui.shown, []);
  });
});

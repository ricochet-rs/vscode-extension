import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { APP_ID, RecordedUi, SERVERS, activate, reply, setServer } from "./helpers.js";

describe("Open in Browser", () => {
  let ui: RecordedUi;

  before(activate);

  beforeEach(() => {
    reply("server-list", JSON.stringify(SERVERS));
    ui = new RecordedUi().install();
  });

  afterEach(async () => {
    ui.dispose();
    await setServer("main");
  });

  it("opens the item on the server a profile name points at", async () => {
    await setServer("main");

    await vscode.commands.executeCommand("ricochet.openInBrowser");

    assert.deepEqual(ui.opened, [`https://main.example.com/apps/${APP_ID}/overview`]);
  });

  it("opens the item on the CLI's default server when the setting is empty", async () => {
    await setServer(undefined);

    await vscode.commands.executeCommand("ricochet.openInBrowser");

    assert.deepEqual(ui.opened, [`http://localhost:6188/apps/${APP_ID}/overview`]);
  });

  it("uses a URL setting without asking the CLI", async () => {
    await setServer("https://direct.example.com");
    reply("server-list", "not json", 1);

    await vscode.commands.executeCommand("ricochet.openInBrowser");

    assert.deepEqual(ui.opened, [`https://direct.example.com/apps/${APP_ID}/overview`]);
  });

  it("explains that no URL is known for a profile the CLI lacks", async () => {
    await setServer("missing");

    await vscode.commands.executeCommand("ricochet.openInBrowser");

    assert.deepEqual(ui.opened, []);
    assert.deepEqual(
      ui.shown.map((shown) => shown.message),
      ["No server URL is known. Set `ricochet.server`, or set a default server."],
    );
  });
});

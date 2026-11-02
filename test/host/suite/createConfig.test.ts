import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RecordedUi,
  activate,
  calls,
  clearCalls,
  refreshProjects,
  reply,
  workspaceDir,
} from "./helpers.js";

describe("Create _ricochet.toml", () => {
  let ui: RecordedUi;
  let path: string;
  let original: string;

  before(async () => {
    await activate();
    path = join(workspaceDir(), "_ricochet.toml");
    original = readFileSync(path, "utf8");
  });

  beforeEach(async () => {
    rmSync(path, { force: true });
    await refreshProjects();
    clearCalls();
    reply(
      "detect",
      JSON.stringify({ entrypoints: [{ path: "app.py", content_type: "shiny-py" }] }),
    );
    ui = new RecordedUi().install();
  });

  afterEach(async () => {
    ui.dispose();
    writeFileSync(path, original);
    await refreshProjects();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("writes the file with ricochet init from the detected entrypoint and the answers", async () => {
    ui.picks.push("app.py", "internal");
    ui.inputs.push("  My App  ");

    await vscode.commands.executeCommand("ricochet.createConfig");

    const dir = workspaceDir();
    assert.ok(
      calls().includes(
        `-F json --server main init ${dir} --content-type shiny-py --entrypoint app.py --name My App --access-type internal`,
      ),
      `stub calls: ${calls().join(" | ")}`,
    );
    assert.match(readFileSync(path, "utf8"), /name = "My App"/);
    assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, path);
  });

  it("writes nothing when the name prompt is dismissed", async () => {
    ui.picks.push("app.py");

    await vscode.commands.executeCommand("ricochet.createConfig");

    assert.equal(existsSync(path), false);
    assert.deepEqual(
      calls().filter((line) => line.includes(" init ")),
      [],
    );
  });

  it("explains what to add when nothing deployable is found", async () => {
    reply("detect", JSON.stringify({ entrypoints: [] }));

    await vscode.commands.executeCommand("ricochet.createConfig");

    assert.equal(ui.shown[0]?.level, "warning");
    assert.match(ui.shown[0]?.message ?? "", /^No deployable content was found/);
  });
});

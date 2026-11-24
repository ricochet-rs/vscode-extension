import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RecordedUi, activate, refreshProjects, workspaceDir } from "./helpers.js";

describe("Change Entrypoint", () => {
  let ui: RecordedUi;
  let path: string;
  let original: string;

  before(async () => {
    await activate();
    path = join(workspaceDir(), "_ricochet.toml");
    original = readFileSync(path, "utf8");
  });

  beforeEach(async () => {
    const dir = workspaceDir();
    mkdirSync(join(dir, "pages"), { recursive: true });
    writeFileSync(join(dir, "main.py"), "");
    writeFileSync(join(dir, "pages", "extra.py"), "");
    writeFileSync(join(dir, "notes.txt"), "");
    await refreshProjects();
    ui = new RecordedUi().install();
  });

  afterEach(async () => {
    ui.dispose();
    const dir = workspaceDir();
    rmSync(join(dir, "pages"), { recursive: true, force: true });
    rmSync(join(dir, "main.py"), { force: true });
    rmSync(join(dir, "notes.txt"), { force: true });
    writeFileSync(path, original);
    await refreshProjects();
  });

  it("offers the files the content type accepts, top-level first, and marks the current one", async () => {
    await vscode.commands.executeCommand("ricochet.changeEntrypoint");

    assert.deepEqual(ui.offered[0], [
      { label: "app.py", description: "current" },
      { label: "main.py", description: "" },
      { label: "pages/extra.py", description: "" },
    ]);
  });

  it("writes the chosen file and leaves the rest of _ricochet.toml as written", async () => {
    ui.picks.push("pages/extra.py");

    await vscode.commands.executeCommand("ricochet.changeEntrypoint");

    assert.equal(
      readFileSync(path, "utf8"),
      original.replace('entrypoint = "app.py"', 'entrypoint = "pages/extra.py"'),
    );
  });

  it("writes nothing when the list is dismissed", async () => {
    await vscode.commands.executeCommand("ricochet.changeEntrypoint");

    assert.equal(readFileSync(path, "utf8"), original);
  });

  it("asks for the content type first when it is missing", async () => {
    writeFileSync(path, original.replace('content_type = "shiny-py"\n', ""));
    await refreshProjects();

    await vscode.commands.executeCommand("ricochet.changeEntrypoint");

    assert.equal(ui.shown[0]?.level, "warning");
    assert.equal(ui.shown[0]?.message, "Set the content type before the entrypoint.");
    assert.deepEqual(ui.offered, []);
  });
});

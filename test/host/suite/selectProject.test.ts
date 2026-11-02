import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RecordedUi, activate, refreshProjects, workspaceDir } from "./helpers.js";

describe("Select Active Project", () => {
  let ui: RecordedUi;
  let path: string;
  let original: string;

  before(async () => {
    await activate();
    path = join(workspaceDir(), "_ricochet.toml");
    original = readFileSync(path, "utf8");
  });

  beforeEach(() => {
    ui = new RecordedUi().install();
  });

  afterEach(async () => {
    ui.dispose();
    writeFileSync(path, original);
    await refreshProjects();
  });

  it("describes a project at the workspace root by the folder's name", async () => {
    await vscode.commands.executeCommand("ricochet.selectProject");

    const folder = vscode.workspace.workspaceFolders?.[0]?.name;
    assert.deepEqual(ui.offered, [[{ label: "Fixture App", description: folder }]]);
  });

  it("labels a project with no name by its folder's name", async () => {
    writeFileSync(path, original.replace(/^name = .*\n/m, ""));
    await refreshProjects();

    await vscode.commands.executeCommand("ricochet.selectProject");

    const folder = vscode.workspace.workspaceFolders?.[0]?.name;
    assert.equal(ui.offered[0]?.[0]?.label, folder);
  });
});

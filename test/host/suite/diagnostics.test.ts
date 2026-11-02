import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { activate, workspaceDir } from "./helpers.js";

const SERVE = `
[serve]
min_instances = 0
max_instances = "five"
spawn_threshold = 150
max_connections = 10
`;

async function diagnosticsFor(uri: vscode.Uri, timeoutMs = 5_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const messages = vscode.languages.getDiagnostics(uri).map((d) => d.message);
    if (messages.length > 0 || Date.now() > deadline) {
      return messages;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe("_ricochet.toml diagnostics", () => {
  let path: string;
  let original: string;

  before(async () => {
    await activate();
    path = join(workspaceDir(), "_ricochet.toml");
    original = readFileSync(path, "utf8");
  });

  after(async () => {
    writeFileSync(path, original);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("reports values of the wrong type or range where they are written", async () => {
    writeFileSync(path, original + SERVE);
    const document = await vscode.workspace.openTextDocument(path);
    await vscode.window.showTextDocument(document);

    const messages = await diagnosticsFor(document.uri);

    assert.deepEqual(messages.sort(), [
      "`serve.max_instances` must be a whole number, 0 or more.",
      "`serve.spawn_threshold` must be a whole number from 1 to 100.",
    ]);
    const line = vscode.languages
      .getDiagnostics(document.uri)
      .find((d) => d.message.startsWith("`serve.max_instances`"))?.range.start.line;
    assert.equal(document.lineAt(line ?? 0).text, 'max_instances = "five"');
  });
});

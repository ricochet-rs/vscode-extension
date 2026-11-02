/**
 * Runs the extension-host suites inside a downloaded VS Code.
 *
 * The user profile is created here with `ricochet.cli.path` already pointing at the stub, so
 * not even activation can find a real CLI on `PATH`.
 */

import { build } from "esbuild";
import { runTests } from "@vscode/test-electron";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { MINIMUM_VERSION } from "../../src/cli/binary.js";
import { STUB_ENV, writeStub } from "./stub.js";

/** The oldest VS Code `engines.vscode` admits, so the suite holds that claim to account. */
const VSCODE_VERSION = "1.90.0";

const root = resolve(import.meta.dirname, "../..");
const suiteDir = join(root, "test/host/suite");
const outDir = join(root, "out/host/suite");

await build({
  entryPoints: readdirSync(suiteDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(suiteDir, file)),
  bundle: true,
  outdir: outDir,
  external: ["vscode", "mocha"],
  format: "cjs",
  platform: "node",
  target: "node20",
  logLevel: "warning",
});

const scratch = mkdtempSync(join(tmpdir(), "ricochet-host-"));
try {
  const workspace = join(scratch, "workspace");
  cpSync(join(root, "test/host/fixture"), workspace, { recursive: true });

  const stubDir = join(scratch, "stub");
  mkdirSync(stubDir);
  const binary = writeStub(stubDir, MINIMUM_VERSION);

  const userData = join(scratch, "user");
  mkdirSync(join(userData, "User"), { recursive: true });
  writeFileSync(
    join(userData, "User", "settings.json"),
    JSON.stringify({
      "ricochet.cli.path": binary,
      "ricochet.server": "main",
      "security.workspace.trust.enabled": false,
      "workbench.startupEditor": "none",
      "update.mode": "none",
    }),
  );

  // An editor host that sets this would make the downloaded VS Code start as plain Node.
  delete process.env.ELECTRON_RUN_AS_NODE;

  await runTests({
    version: VSCODE_VERSION,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(outDir, "index.js"),
    extensionTestsEnv: { [STUB_ENV]: stubDir },
    launchArgs: [
      workspace,
      "--user-data-dir",
      userData,
      "--disable-extensions",
      "--disable-workspace-trust",
      // CI runs as root in a container, where Chromium refuses to start sandboxed.
      "--no-sandbox",
    ],
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

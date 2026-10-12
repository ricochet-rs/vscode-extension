/**
 * `RicochetClient` against a stub binary that reproduces the real CLI's output shape:
 * the `-F json` payload alone on stdout, and status lines and errors on stderr.
 *
 * This is the layer most likely to break when the CLI changes, and the only one where
 * the parsing, the process handling and the argument construction meet.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliTooOldError, MINIMUM_VERSION } from "./binary.js";
import { RicochetClient } from "./client.js";
import { CliError } from "./exec.js";

let dir: string;
let binary: string;
let stubs = 0;

/**
 * Writes a stub that reports `version`, records its argv and prints `stdout`, then exits with `code`.
 * Each test gets a fresh binary path, because the client remembers which binaries passed the version check.
 */
function stub(stdout: string, code = 0, stderr = "", version = MINIMUM_VERSION): void {
  binary = join(dir, `ricochet-${(stubs += 1)}`);
  rmSync(join(dir, "argv"), { force: true });
  writeFileSync(
    binary,
    [
      "#!/bin/sh",
      `if [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi`,
      `printf '%s\\n' "$@" > "${join(dir, "argv")}"`,
      stderr.length > 0 ? `cat >&2 <<'STDERR'\n${stderr}\nSTDERR` : "",
      `cat <<'STDOUT'\n${stdout}\nSTDOUT`,
      `exit ${code}`,
    ].join("\n"),
    "utf8",
  );
  chmodSync(binary, 0o755);
}

function argv(): string[] {
  return existsSync(join(dir, "argv"))
    ? readFileSync(join(dir, "argv"), "utf8").trim().split("\n")
    : [];
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ricochet-ext-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("RicochetClient", () => {
  it("passes -F json and the configured server on every command", async () => {
    stub("[]");
    await RicochetClient.create({ binaryPath: binary, server: "staging" }).servers();
    expect(argv()).toEqual(["-F", "json", "--server", "staging", "server", "list"]);
  });

  it("omits --server when none is configured", async () => {
    stub("[]");
    await RicochetClient.create({ binaryPath: binary }).servers();
    expect(argv()).toEqual(["-F", "json", "server", "list"]);
  });

  it("reads server profiles as `server list -F json` prints them", async () => {
    stub(
      JSON.stringify([
        {
          name: "production",
          url: "https://r.example.com/",
          api_key: "rico_abc...mnop",
          default: true,
        },
        { name: "staging", url: "https://staging.example.com/", api_key: null, default: false },
      ]),
    );
    const servers = await RicochetClient.create({ binaryPath: binary }).servers();
    expect(servers).toEqual([
      { name: "production", url: "https://r.example.com/", isDefault: true, hasKey: true },
      { name: "staging", url: "https://staging.example.com/", isDefault: false, hasKey: false },
    ]);
  });

  it("reads an empty server list", async () => {
    stub("[]");
    await expect(RicochetClient.create({ binaryPath: binary }).servers()).resolves.toEqual([]);
  });

  it("rejects stdout that is not JSON rather than guessing at it", async () => {
    stub("No servers configured.");
    await expect(RicochetClient.create({ binaryPath: binary }).servers()).rejects.toThrow(CliError);
  });

  it("waits for a task run and reads how it finished", async () => {
    stub(
      JSON.stringify({
        id: "01JINV",
        invoked_at: 1767225600,
        status: "success",
        started: 1767225601,
        ended: 1767225643,
        deployment_id: "01JDEP",
        display_name: "Ada",
        invoked_by: "344509059241640593",
      }),
      0,
      "Invoking task: 01JTASK\n\u001b[32m✓\u001b[0m Task invoked successfully!",
    );
    const run = await RicochetClient.create({ binaryPath: binary }).runTask("01JTASK");
    expect(run).toEqual({
      id: "01JINV",
      status: "success",
      startedAt: new Date(1767225601_000),
      endedAt: new Date(1767225643_000),
    });
    expect(argv()).toEqual(["-F", "json", "task", "invoke", "01JTASK", "--wait"]);
  });

  it("resolves a failed run with its status, although the CLI exits non-zero", async () => {
    stub(
      JSON.stringify({
        id: "01JINV",
        invoked_at: 1,
        status: "failure",
        started: 2,
        ended: 9,
        invoked_by: "1",
      }),
      1,
      "Error: Task run 01JINV finished as failure",
    );
    const run = await RicochetClient.create({ binaryPath: binary }).runTask("01JTASK");
    expect(run.status).toBe("failure");
  });

  it("throws when the CLI lost track of the run and printed no result", async () => {
    stub(
      "",
      1,
      "Error: Lost track of task run 01JINV. Check it later with `ricochet task invocation get 01JTASK 01JINV`",
    );
    const pending = RicochetClient.create({ binaryPath: binary }).runTask("01JTASK");
    await expect(pending).rejects.toThrow(CliError);
    await pending.catch((error: unknown) => {
      expect((error as CliError).summary).toContain("Lost track of task run 01JINV");
    });
  });

  it("reads a deploy dry run, including files from outside the directory", async () => {
    stub(
      JSON.stringify({
        files: [
          { path: ".venv/lib/x.py", included: false, size: 2, reason: "always-excluded" },
          { path: "app.py", included: true, size: 15 },
          { path: "uv.lock", included: true, size: 40, source: "/work/uv.lock" },
        ],
      }),
      0,
      "demo (new app)\n  Path: /work/app",
    );
    const files = await RicochetClient.create({ binaryPath: binary }).bundle(dir);
    expect(files).toEqual([
      { path: ".venv/lib/x.py", size: 2, reason: "always-excluded", source: undefined },
      { path: "app.py", size: 15, reason: undefined, source: undefined },
      { path: "uv.lock", size: 40, reason: undefined, source: "/work/uv.lock" },
    ]);
    expect(argv()).toEqual(["-F", "json", "deploy", dir, "--dry-run"]);
  });

  it("asks for every deployment field and drops entries with no id", async () => {
    stub(
      JSON.stringify([
        { id: "01JDEP", content_id: "01JAPP", deployed_at: 1767225600, status: "success" },
        { status: "success" },
      ]),
    );
    const deployments = await RicochetClient.create({ binaryPath: binary }).deployments(
      "app",
      "01JAPP",
    );
    expect(deployments).toEqual([
      { id: "01JDEP", status: "success", deployedAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    expect(argv()).toEqual([
      "-F",
      "json",
      "app",
      "deployment",
      "list",
      "01JAPP",
      "--fields",
      "all",
    ]);
  });

  it("surfaces the CLI's own error line rather than the status lines before it", async () => {
    stub(
      "",
      1,
      "Invoking task: 01JTASK\nError: Credentials are invalid or expired for server https://r.example.com",
    );
    const client = RicochetClient.create({ binaryPath: binary });
    await expect(client.servers()).rejects.toThrow(CliError);
    await client.servers().catch((error: unknown) => {
      expect((error as CliError).summary).toBe(
        "Error: Credentials are invalid or expired for server https://r.example.com",
      );
    });
  });

  it("deploys under -F json and streams the status lines from stderr", async () => {
    stub(
      JSON.stringify({ id: "01J", deployment_id: "01JDEP" }),
      0,
      "local-app (new app)\n  Path: /tmp/app",
    );
    const lines: string[] = [];
    await RicochetClient.create({ binaryPath: binary }).deploy(dir, {
      onStderr: (chunk) => lines.push(chunk),
    });
    expect(lines.join("")).toContain("local-app (new app)");
    expect(argv()).toEqual(["-F", "json", "deploy", dir]);
  });

  it("refuses a CLI older than the minimum without running the command", async () => {
    stub("[]", 0, "", "1.2.0");
    const client = RicochetClient.create({ binaryPath: binary });
    await expect(client.servers()).rejects.toThrow(CliTooOldError);
    expect(argv()).toEqual([]);
  });

  it("checks the version again after a failed check, so an upgrade needs no reload", async () => {
    stub("[]", 0, "", "1.2.0");
    const client = RicochetClient.create({ binaryPath: binary });
    await expect(client.servers()).rejects.toThrow(CliTooOldError);
    writeFileSync(
      binary,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${MINIMUM_VERSION}"; exit 0; fi\necho "[]"\n`,
      "utf8",
    );
    await expect(client.servers()).resolves.toEqual([]);
  });

  it("aborts the process when the signal fires", async () => {
    stub("[]");
    writeFileSync(
      binary,
      `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${MINIMUM_VERSION}"; exit 0; fi\nsleep 30\n`,
      "utf8",
    );
    chmodSync(binary, 0o755);
    const controller = new AbortController();
    const pending = RicochetClient.create({ binaryPath: binary }).deploy(dir, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow("Cancelled.");
  });
});

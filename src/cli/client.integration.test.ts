/**
 * `RicochetClient` against a stub binary that reproduces the real CLI's output shape,
 * including the human status lines it prints around a `-F json` payload.
 *
 * This is the layer most likely to break when the CLI changes, and the only one where
 * the parsing, the process handling and the argument construction meet.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RicochetClient } from "./client.js";
import { CliError } from "./exec.js";

let dir: string;
let binary: string;

/** Writes a stub that records its argv and prints `stdout`, then exits with `code`. */
function stub(stdout: string, code = 0, stderr = ""): void {
  writeFileSync(
    binary,
    [
      "#!/bin/sh",
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
  binary = join(dir, "ricochet");
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

  it("reads server profiles past the status lines the CLI prints", async () => {
    stub(
      [
        "Configured servers:",
        JSON.stringify([
          { name: "production", url: "https://r.example.com", default: true, has_key: true },
          { name: "staging", url: "https://staging.example.com" },
        ]),
      ].join("\n"),
    );
    const servers = await RicochetClient.create({ binaryPath: binary }).servers();
    expect(servers).toEqual([
      { name: "production", url: "https://r.example.com", isDefault: true, hasKey: true },
      { name: "staging", url: "https://staging.example.com", isDefault: false, hasKey: false },
    ]);
  });

  it("reads a payload wrapped in an object rather than a bare array", async () => {
    stub(JSON.stringify({ items: [{ name: "prod", url: "https://r.example.com" }] }));
    const servers = await RicochetClient.create({ binaryPath: binary }).servers();
    expect(servers.map((s) => s.name)).toEqual(["prod"]);
  });

  it("treats prose about an empty list as an empty list", async () => {
    stub("No servers configured.");
    await expect(RicochetClient.create({ binaryPath: binary }).servers()).resolves.toEqual([]);
  });

  it("reads an invocation from the output `task invoke` actually produces", async () => {
    stub(
      [
        "Invoking task: 01JTASK",
        "\u001b[32m✓\u001b[0m Task invoked successfully!",
        "",
        JSON.stringify({ invocation_id: "01JINV", content_id: "01JTASK", status: "pending" }),
      ].join("\n"),
    );
    const invocation = await RicochetClient.create({ binaryPath: binary }).invoke("01JTASK");
    expect(invocation).toEqual({ id: "01JINV", status: "pending" });
    expect(argv()).toEqual(["-F", "json", "task", "invoke", "01JTASK"]);
  });

  it("asks for every deployment field and drops entries with no id", async () => {
    stub(
      JSON.stringify([
        { id: "01JDEP", status: "success", created_at: "2026-01-01T00:00:00Z" },
        { status: "success" },
      ]),
    );
    const deployments = await RicochetClient.create({ binaryPath: binary }).deployments(
      "app",
      "01JAPP",
    );
    expect(deployments).toEqual([
      { id: "01JDEP", status: "success", createdAt: "2026-01-01T00:00:00Z", bundleId: undefined },
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

  it("surfaces the CLI's own error line rather than the exit code", async () => {
    stub("", 1, "Error: Credentials are invalid or expired for server https://r.example.com");
    const client = RicochetClient.create({ binaryPath: binary });
    await expect(client.servers()).rejects.toThrow(CliError);
    await client.servers().catch((error: unknown) => {
      expect((error as CliError).summary).toBe(
        "Error: Credentials are invalid or expired for server https://r.example.com",
      );
    });
  });

  it("returns deploy output verbatim, since deploy has no JSON mode yet", async () => {
    stub(
      "✓ Deployment successful!\n\nLinks:\n  App Overview: https://r.example.com/apps/01J/overview",
    );
    const output = await RicochetClient.create({ binaryPath: binary }).deploy(dir);
    expect(output).toContain("Deployment successful!");
    expect(argv()).toEqual(["-F", "json", "deploy", dir]);
  });

  it("streams stdout to the caller as it arrives", async () => {
    stub("line one\nline two");
    const chunks: string[] = [];
    await RicochetClient.create({ binaryPath: binary }).deploy(dir, {
      onStdout: (chunk) => chunks.push(chunk),
    });
    expect(chunks.join("")).toContain("line two");
  });

  it("aborts the process when the signal fires", async () => {
    writeFileSync(binary, "#!/bin/sh\nsleep 30\n", "utf8");
    chmodSync(binary, 0o755);
    const controller = new AbortController();
    const pending = RicochetClient.create({ binaryPath: binary }).deploy(dir, {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow("Cancelled.");
  });
});

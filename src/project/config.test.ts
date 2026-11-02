import { describe, expect, it } from "vitest";
import type { Server } from "../cli/client.js";
import {
  credentialsUrl,
  deploymentUrl,
  itemKind,
  itemUrl,
  readConfig,
  resolveServerUrl,
} from "./config.js";

const TASK = `
[content]
id = "01JTASK"
name = "weekly-report"
entrypoint = "report.qmd"
access_type = "private"
content_type = "quarto-r"

[language]
name = "r"
packages = "renv.lock"

[schedule]
cron = "0 9 * * 1-5"
`;

const APP = `
[content]
name = "dashboard"
entrypoint = "app.R"
access_type = "internal"
content_type = "shiny"

[language]
name = "r"
packages = "renv.lock"
`;

describe("readConfig", () => {
  it("reads every field the views display", () => {
    expect(readConfig(TASK)).toEqual({
      id: "01JTASK",
      name: "weekly-report",
      entrypoint: "report.qmd",
      accessType: "private",
      contentType: "quarto-r",
      language: "r",
      packages: "renv.lock",
      schedule: "0 9 * * 1-5",
    });
  });

  it("leaves the id undefined when the config has none", () => {
    expect(readConfig(APP).id).toBeUndefined();
  });

  it("treats an empty content ID as missing", () => {
    expect(readConfig(TASK.replace('id = "01JTASK"', 'id = ""')).id).toBeUndefined();
  });
});

describe("itemKind", () => {
  it("classifies a task content type", () => {
    expect(itemKind(readConfig(TASK))).toBe("task");
  });

  it("classifies an app content type", () => {
    expect(itemKind(readConfig(APP))).toBe("app");
  });

  it("returns undefined for a content type it does not know", () => {
    expect(itemKind(readConfig(APP.replace("shiny", "nonsense")))).toBeUndefined();
  });
});

describe("itemUrl", () => {
  it("uses the task path for a task", () => {
    expect(itemUrl("https://r.example.com", readConfig(TASK))).toBe(
      "https://r.example.com/tasks/01JTASK",
    );
  });

  it("uses the app overview path for an app", () => {
    const deployedApp = readConfig(APP.replace("[content]", '[content]\nid = "01JAPP"'));
    expect(itemUrl("https://r.example.com/", deployedApp)).toBe(
      "https://r.example.com/apps/01JAPP/overview",
    );
  });

  it("returns undefined when the item was never deployed", () => {
    expect(itemUrl("https://r.example.com", readConfig(APP))).toBeUndefined();
  });
});

describe("deploymentUrl", () => {
  it("strips a trailing slash from the server url", () => {
    expect(deploymentUrl("https://r.example.com//", "01JDEP")).toBe(
      "https://r.example.com/deployments/01JDEP",
    );
  });
});

describe("credentialsUrl", () => {
  it("points at the origin's credentials page, whatever path the server url has", () => {
    expect(credentialsUrl("https://r.example.com/")).toBe("https://r.example.com/credentials");
    expect(credentialsUrl("https://r.example.com/some/path")).toBe(
      "https://r.example.com/credentials",
    );
  });

  it("returns undefined for a server url it cannot parse", () => {
    expect(credentialsUrl("not a url")).toBeUndefined();
  });
});

describe("resolveServerUrl", () => {
  const servers: Server[] = [
    { name: "prod", url: "https://prod.example.com/", isDefault: false, hasKey: true },
    { name: "local", url: "http://localhost:6188/", isDefault: true, hasKey: true },
  ];

  it("returns a configured URL as it is", () => {
    expect(resolveServerUrl(" https://other.example.com ", servers)).toBe(
      "https://other.example.com",
    );
  });

  it("looks a profile name up in the server list", () => {
    expect(resolveServerUrl("prod", servers)).toBe("https://prod.example.com/");
  });

  it("falls back to the default profile when the setting is empty", () => {
    expect(resolveServerUrl("", servers)).toBe("http://localhost:6188/");
  });

  it("returns undefined for a profile the CLI does not know", () => {
    expect(resolveServerUrl("missing", servers)).toBeUndefined();
    expect(resolveServerUrl("", [])).toBeUndefined();
  });
});

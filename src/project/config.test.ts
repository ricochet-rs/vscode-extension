import { describe, expect, it } from "vitest";
import { deploymentUrl, isDeployed, itemKind, itemUrl, readConfig } from "./config.js";

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

  it("leaves the id undefined before the first deploy", () => {
    expect(readConfig(APP).id).toBeUndefined();
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

describe("isDeployed", () => {
  it("is true only once an id is present", () => {
    expect(isDeployed(readConfig(TASK))).toBe(true);
    expect(isDeployed(readConfig(APP))).toBe(false);
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

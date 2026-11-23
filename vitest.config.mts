import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // CI runs vitest under Bun, whose child processes lack the IPC channel the forks pool unrefs.
    pool: "threads",
  },
});

/** Entry point VS Code calls in the extension host: runs every compiled `*.test.js` beside it. */

import Mocha from "mocha";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "bdd", timeout: 20_000, color: true });
  readdirSync(__dirname)
    .filter((file) => file.endsWith(".test.js"))
    .sort()
    .forEach((file) => mocha.addFile(join(__dirname, file)));

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) =>
      failures > 0 ? reject(new Error(`${failures} extension-host test(s) failed.`)) : resolve(),
    );
  });
}

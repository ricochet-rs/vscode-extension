/**
 * A stand-in `ricochet` executable for the extension-host tests.
 *
 * It answers `--version` with the supported version, appends every other command line to
 * `calls.log`, and replies with the `<name>.out`, `<name>.err` and `<name>.code` files a
 * test writes beside it, so no test can reach a real server.
 */

import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STUB_ENV = "RICOCHET_STUB_DIR";

export function writeStub(dir: string, version: string): string {
  const binary = join(dir, "ricochet");
  writeFileSync(
    binary,
    `#!/bin/sh
stub="$(cd "$(dirname "$0")" && pwd)"
if [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi
printf '%s\\n' "$*" >> "$stub/calls.log"

reply() {
  [ -f "$stub/$1.err" ] && cat "$stub/$1.err" >&2
  [ -f "$stub/$1.out" ] && cat "$stub/$1.out"
  exit "$(cat "$stub/$1.code" 2>/dev/null || echo 0)"
}

while [ $# -gt 0 ]; do
  case "$1" in
    -F|--server) shift 2 ;;
    *) break ;;
  esac
done

case "$1" in
  server) reply server-list ;;
  app|task)
    if [ "$2" = list ]; then reply "$1-list"; fi
    reply "$1-deployments"
    ;;
  detect) reply detect ;;
  deploy)
    case "$*" in
      *--dry-run*) reply bundle ;;
      *) reply deploy ;;
    esac
    ;;
  init)
    dir="$2"
    shift 2
    while [ $# -gt 0 ]; do
      case "$1" in
        --content-type) type="$2" ;;
        --entrypoint) entrypoint="$2" ;;
        --name) name="$2" ;;
        --access-type) access="$2" ;;
      esac
      shift 2
    done
    printf '[content]\\nname = "%s"\\nentrypoint = "%s"\\naccess_type = "%s"\\ncontent_type = "%s"\\n\\n[language]\\nname = "python"\\npackages = "uv.lock"\\n' \\
      "$name" "$entrypoint" "$access" "$type" > "$dir/_ricochet.toml"
    ;;
  *)
    echo "The stub has no reply for: $*" >&2
    exit 2
    ;;
esac
`,
    "utf8",
  );
  chmodSync(binary, 0o755);
  return binary;
}

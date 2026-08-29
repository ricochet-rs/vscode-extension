/**
 * Key and enum completion inside `_ricochet.toml`.
 *
 * Completion is offered for the table the cursor is in, and for the value of a key
 * whose accepted values the schema knows.
 */

import * as vscode from "vscode";
import { CONTENT_TYPE_NAMES, FIELD_DOCS } from "./schema.js";
import { isConfig } from "./diagnostics.js";

const TABLES = ["content", "language", "schedule", "serve", "static", "resources", "repositories"];

export function registerCompletion(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [{ pattern: "**/_ricochet.toml" }],
      new ConfigCompletionProvider(),
      '"',
      "[",
    ),
  );
}

class ConfigCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    if (!isConfig(document)) {
      return [];
    }
    const line = document.lineAt(position.line).text;
    const before = line.slice(0, position.character);

    if (/^\s*\[[a-z.]*$/.test(before)) {
      return TABLES.map((table) => {
        const item = new vscode.CompletionItem(table, vscode.CompletionItemKind.Module);
        item.insertText = `${table}]`;
        return item;
      });
    }

    const assignment = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?[^"]*$/.exec(before);
    const table = tableAt(document, position);
    if (assignment !== null && table !== undefined) {
      return valueCompletions(`${table}.${assignment[1]}`, before);
    }
    if (table !== undefined && /^\s*[A-Za-z_]*$/.test(before)) {
      return keyCompletions(table);
    }
    return [];
  }
}

function keyCompletions(table: string): vscode.CompletionItem[] {
  const prefix = `${table}.`;
  return Object.entries(FIELD_DOCS)
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, doc]) => {
      const key = path.slice(prefix.length);
      const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
      item.detail = doc.detail;
      item.insertText = new vscode.SnippetString(
        doc.values === undefined ? `${key} = "$0"` : `${key} = "\${1|${doc.values.join(",")}|}"`,
      );
      return item;
    });
}

function valueCompletions(path: string, before: string): vscode.CompletionItem[] {
  const values = FIELD_DOCS[path]?.values;
  if (values === undefined) {
    return [];
  }
  const quoted = before.includes('"');
  return values.map((value) => {
    const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
    item.insertText = quoted ? value : `"${value}"`;
    if (path === "content.content_type") {
      item.documentation = new vscode.MarkdownString(describeContentType(value));
    }
    return item;
  });
}

function describeContentType(value: string): string {
  return CONTENT_TYPE_NAMES.includes(value) ? `Content type \`${value}\`.` : "";
}

/** The `[table]` header governing a position, or undefined above the first header. */
function tableAt(document: vscode.TextDocument, position: vscode.Position): string | undefined {
  for (let line = position.line; line >= 0; line -= 1) {
    const match = /^\s*\[([A-Za-z0-9_.]+)\]\s*$/.exec(document.lineAt(line).text);
    if (match !== null) {
      return match[1];
    }
  }
  return undefined;
}

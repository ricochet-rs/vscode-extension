/**
 * Publishing `_ricochet.toml` problems as editor diagnostics.
 *
 * The rules live in `validate.ts`; this file is only the `vscode` binding.
 */

import * as vscode from "vscode";
import { TomlDocument, TomlSyntaxError } from "./document.js";
import { validate, type Problem } from "./validate.js";
import { CONFIG_FILENAME } from "../project/workspace.js";

const SOURCE = "ricochet";

export function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(SOURCE);
  context.subscriptions.push(collection);

  const update = (document: vscode.TextDocument): void => {
    if (!isConfig(document)) {
      return;
    }
    if (!enabled()) {
      collection.delete(document.uri);
      return;
    }
    collection.set(document.uri, diagnose(document));
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument((event) => update(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("ricochet.validation.enabled")) {
        for (const document of vscode.workspace.textDocuments) {
          update(document);
        }
      }
    }),
  );

  for (const document of vscode.workspace.textDocuments) {
    update(document);
  }
}

function enabled(): boolean {
  return vscode.workspace.getConfiguration("ricochet").get<boolean>("validation.enabled", true);
}

export function isConfig(document: vscode.TextDocument): boolean {
  return document.uri.path.endsWith(`/${CONFIG_FILENAME}`);
}

function diagnose(document: vscode.TextDocument): vscode.Diagnostic[] {
  const text = document.getText();
  let parsed: TomlDocument;
  try {
    parsed = TomlDocument.parse(text);
  } catch (error) {
    if (error instanceof TomlSyntaxError) {
      const at = document.positionAt(Math.min(error.offset, text.length));
      return [
        new vscode.Diagnostic(
          document.getWordRangeAtPosition(at) ?? new vscode.Range(at, at),
          error.message,
          vscode.DiagnosticSeverity.Error,
        ),
      ];
    }
    throw error;
  }
  return validate(parsed).map((problem) => toDiagnostic(document, problem));
}

function toDiagnostic(document: vscode.TextDocument, problem: Problem): vscode.Diagnostic {
  const range = new vscode.Range(
    document.positionAt(problem.span.start),
    document.positionAt(problem.span.end),
  );
  const diagnostic = new vscode.Diagnostic(range, problem.message, severity(problem));
  diagnostic.source = SOURCE;
  return diagnostic;
}

function severity(problem: Problem): vscode.DiagnosticSeverity {
  return problem.severity === "error"
    ? vscode.DiagnosticSeverity.Error
    : vscode.DiagnosticSeverity.Warning;
}

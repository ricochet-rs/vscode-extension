import * as vscode from "vscode";

/**
 * The extension's log channel.
 *
 * `LogOutputChannel` is used rather than a plain output channel so the user's
 * configured log level applies and lines are timestamped by the host.
 */
let channel: vscode.LogOutputChannel | undefined;

export function createLog(): vscode.LogOutputChannel {
  channel = vscode.window.createOutputChannel("Ricochet", { log: true });
  return channel;
}

export function log(): vscode.LogOutputChannel {
  if (channel === undefined) {
    throw new Error("The log channel was used before activation.");
  }
  return channel;
}

/** The output of the last task run the user opened, kept apart from the extension's own log. */
let taskChannel: vscode.OutputChannel | undefined;

export function createTaskOutput(): vscode.OutputChannel {
  taskChannel = vscode.window.createOutputChannel("Ricochet Task Output");
  return taskChannel;
}

export function taskOutput(): vscode.OutputChannel {
  if (taskChannel === undefined) {
    throw new Error("The task output channel was used before activation.");
  }
  return taskChannel;
}

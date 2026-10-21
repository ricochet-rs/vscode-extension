/**
 * Reading a stream that carries one JSON record per line, as the CLI writes under `-F json`.
 */

/** Splits streamed chunks into complete lines, holding back a trailing partial line. */
export class LineSplitter {
  private pending = "";

  push(chunk: string): string[] {
    const lines = (this.pending + chunk).split("\n");
    this.pending = lines.pop() ?? "";
    return lines.map((line) => line.trim()).filter((line) => line.length > 0);
  }

  /** The partial line left at the end of the stream, if any. */
  flush(): string[] {
    const rest = this.pending.trim();
    this.pending = "";
    return rest.length > 0 ? [rest] : [];
  }
}

export type DiagnosticSink = (level: "info" | "warn" | "error", event: string, context?: unknown) => void;
let sink: DiagnosticSink | undefined;
export function installDiagnosticSink(next: DiagnosticSink): void { sink = next; }
/** Host-neutral diagnostics: logging is optional and cannot alter engine outcomes. */
export function diagnosticEvent(level: "info" | "warn" | "error", event: string, context?: unknown): void {
  try { sink?.(level, event, context); } catch { /* Diagnostics are non-fatal. */ }
}

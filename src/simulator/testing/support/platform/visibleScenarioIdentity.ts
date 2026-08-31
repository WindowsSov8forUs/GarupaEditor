export interface VisibleScenarioIdentity {
  readonly mode: "live" | "rehearsal";
  readonly input: "manual" | "auto";
  readonly chart: {
    readonly identity: string;
    readonly sha256: string | null;
  };
  readonly timeline: {
    readonly frame: number;
    readonly adjustedMusicPosition: number;
  };
  readonly score: {
    readonly value: number;
    readonly rank: number;
  };
  readonly owner: {
    readonly sessionId: string;
    readonly renderObjectCount: number;
    readonly particleNodeCount: number;
    readonly visibleWorldRecordCount: number;
  };
  readonly phase: string;
  readonly terminalStatus: "active" | "game-over" | "clear-1" | "clear-2" | "clear-3";
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  readonly dpr: number;
}

/**
 * Fail-closed identity gate for actual framebuffer observations. A pixel digest
 * is not comparable unless the complete product scenario tuple is attached.
 */
export function assertVisibleScenarioIdentity(
  identity: VisibleScenarioIdentity,
): Readonly<VisibleScenarioIdentity> {
  requireIdentity(identity.mode === "live" || identity.mode === "rehearsal", "mode");
  requireIdentity(identity.input === "manual" || identity.input === "auto", "input");
  requireIdentity(identity.chart.identity.length > 0, "chart.identity");
  requireIdentity(identity.chart.sha256 === null || /^[0-9A-Fa-f]{64}$/.test(identity.chart.sha256), "chart.sha256");
  requireIdentity(Number.isInteger(identity.timeline.frame) && identity.timeline.frame >= 0, "timeline.frame");
  requireIdentity(Number.isFinite(identity.timeline.adjustedMusicPosition), "timeline.adjustedMusicPosition");
  requireIdentity(Number.isFinite(identity.score.value), "score.value");
  requireIdentity(Number.isInteger(identity.score.rank), "score.rank");
  requireIdentity(identity.owner.sessionId.length > 0, "owner.sessionId");
  for (const [name, value] of [
    ["renderObjectCount", identity.owner.renderObjectCount],
    ["particleNodeCount", identity.owner.particleNodeCount],
    ["visibleWorldRecordCount", identity.owner.visibleWorldRecordCount],
  ] as const) requireIdentity(Number.isInteger(value) && value >= 0, `owner.${name}`);
  requireIdentity(identity.phase.length > 0, "phase");
  requireIdentity(["active", "game-over", "clear-1", "clear-2", "clear-3"].includes(identity.terminalStatus), "terminalStatus");
  requireIdentity(Number.isInteger(identity.viewport.width) && identity.viewport.width > 0, "viewport.width");
  requireIdentity(Number.isInteger(identity.viewport.height) && identity.viewport.height > 0, "viewport.height");
  requireIdentity(Number.isFinite(identity.dpr) && identity.dpr > 0, "dpr");
  return Object.freeze({
    ...identity,
    chart: Object.freeze({ ...identity.chart }),
    timeline: Object.freeze({ ...identity.timeline }),
    score: Object.freeze({ ...identity.score }),
    owner: Object.freeze({ ...identity.owner }),
    viewport: Object.freeze({ ...identity.viewport }),
  });
}

function requireIdentity(condition: boolean, field: string): void {
  if (!condition) throw new Error(`actual framebuffer scenario identity is incomplete: ${field}`);
}

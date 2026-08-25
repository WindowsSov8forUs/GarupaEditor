export interface ScoreGaugeSsAnimationKey {
  readonly index: number;
  readonly coefficients: readonly [number, number, number, number];
}

export interface ScoreGaugeSsAnimationFrame {
  readonly time: number;
  readonly keys: readonly ScoreGaugeSsAnimationKey[];
}

import { CURRENT_SCORE_GAUGE_SS_WIDGETS } from "./currentCompleteHudProfile";

export interface ScoreGaugeSsAnimationNodeProfile {
  readonly name: string;
  readonly textureKey: "high-rank-kira" | "high-rank-long-star" | "high-rank-overlay";
  readonly widgetWidth: number;
  readonly widgetHeight: number;
  readonly pivot: "center" | "left";
  readonly colorF32Bits: readonly [string, string, string, string];
  readonly blendMode: "normal";
  readonly initialPosition: readonly [number, number, number];
  readonly initialScale: readonly [number, number, number];
  readonly initialRotationQuaternion: readonly [number, number, number, number];
}

export interface ScoreGaugeSsAnimationProfile {
  readonly durationSeconds: 3;
  readonly loop: true;
  readonly curveCount: 56;
  readonly nodes: readonly ScoreGaugeSsAnimationNodeProfile[];
  readonly frames: readonly ScoreGaugeSsAnimationFrame[];
}

export function parseCurrentScoreGaugeSsAnimationProfile(
  value: unknown,
): ScoreGaugeSsAnimationProfile | null {
  if (!isRecord(value)) return null;
  const root = value;
  const sample = isRecord(root.sample) ? root.sample : null;
  const clip = isRecord(root.clip) ? root.clip : null;
  if (
    root.schema_version !== 1 ||
    root.status !== "confirmed-current-score-gauge-ss-streamed-animation-profile" ||
    sample?.package !== "jp.co.craftegg.band" || sample.version_name !== "10.1.4" ||
    sample.version_code !== 230 || sample.abi !== "arm64-v8a" ||
    clip?.name !== "ScoreGaugeSS" || clip.sample_rate !== 60 ||
    clip.duration_seconds !== 3 || clip.loop !== true ||
    clip.curve_count !== 56 || clip.frame_count !== 39 ||
    !Array.isArray(root.nodes) || root.nodes.length !== 11 ||
    !Array.isArray(root.frames) || root.frames.length !== 39 ||
    !Array.isArray(root.unknown_fields) || root.unknown_fields.length !== 0 ||
    !Array.isArray(root.blocking_findings) || root.blocking_findings.length !== 0
  ) return null;
  const expectedNames = [
    "kira_1", "kira_2", "kira_3", "kira_4", "kira_5", "kira_6", "kira_7", "kira_8",
    "BigStar_2", "BigStar_1", "Flash",
  ];
  const nodes: ScoreGaugeSsAnimationNodeProfile[] = [];
  for (let index = 0; index < root.nodes.length; index += 1) {
    const node = root.nodes[index];
    if (
      !isRecord(node) || node.name !== expectedNames[index] ||
      !validVector(node.initial_position, 3) || !validVector(node.initial_scale, 3) ||
      !validVector(node.initial_rotation_quaternion, 4) ||
      (node.portable_texture !== "high-rank-kira" &&
        node.portable_texture !== "high-rank-long-star" &&
        node.portable_texture !== "high-rank-overlay")
    ) return null;
    const widget = CURRENT_SCORE_GAUGE_SS_WIDGETS[node.name];
    if (widget === undefined) return null;
    nodes.push(Object.freeze({
      name: node.name,
      textureKey: widget.textureKey,
      widgetWidth: widget.width,
      widgetHeight: widget.height,
      pivot: widget.pivot,
      colorF32Bits: widget.colorF32Bits,
      blendMode: widget.blendMode,
      initialPosition: freezeVector3(node.initial_position),
      initialScale: freezeVector3(node.initial_scale),
      initialRotationQuaternion: Object.freeze([...node.initial_rotation_quaternion]) as
        readonly [number, number, number, number],
    }));
  }
  const frames: ScoreGaugeSsAnimationFrame[] = [];
  let previousTime = -1;
  let keyCount = 0;
  for (const frame of root.frames) {
    if (
      !isRecord(frame) ||
      typeof frame.time !== "number" || !Number.isFinite(frame.time) ||
      Math.fround(frame.time) !== frame.time || frame.time < 0 || frame.time >= 3 ||
      frame.time <= previousTime || !Array.isArray(frame.keys) || frame.keys.length === 0
    ) return null;
    previousTime = frame.time;
    const indices = new Set<number>();
    const keys: ScoreGaugeSsAnimationKey[] = [];
    for (const key of frame.keys) {
      if (
        !isRecord(key) || typeof key.index !== "number" || !Number.isInteger(key.index) ||
        key.index < 0 || key.index >= 56 || indices.has(key.index) ||
        !validVector(key.coefficients, 4) ||
        key.coefficients.some((entry: number) => Math.fround(entry) !== entry)
      ) return null;
      indices.add(key.index);
      keys.push(Object.freeze({
        index: key.index,
        coefficients: Object.freeze([...key.coefficients]) as readonly [number, number, number, number],
      }));
      keyCount += 1;
    }
    frames.push(Object.freeze({ time: frame.time, keys: Object.freeze(keys) }));
  }
  if (keyCount !== 236 || frames[0]!.time !== 0 || frames[0]!.keys.length !== 56) return null;
  return Object.freeze({
    durationSeconds: 3 as const,
    loop: true as const,
    curveCount: 56 as const,
    nodes: Object.freeze(nodes),
    frames: Object.freeze(frames),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validVector(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function freezeVector3(value: number[]): readonly [number, number, number] {
  return Object.freeze([...value]) as readonly [number, number, number];
}

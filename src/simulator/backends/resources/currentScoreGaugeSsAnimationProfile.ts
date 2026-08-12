export interface ScoreGaugeSsAnimationKey {
  readonly index: number;
  readonly coefficients: readonly [number, number, number, number];
}

export interface ScoreGaugeSsAnimationFrame {
  readonly time: number;
  readonly keys: readonly ScoreGaugeSsAnimationKey[];
}

export interface ScoreGaugeSsAnimationNodeProfile {
  readonly name: string;
  readonly textureKey: "high-rank-kira" | "high-rank-long-star" | "high-rank-overlay";
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
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, any>;
  if (
    root.schema_version !== 1 ||
    root.status !== "confirmed-current-score-gauge-ss-streamed-animation-profile" ||
    root.sample?.package !== "jp.co.craftegg.band" || root.sample?.version_name !== "10.1.4" ||
    root.sample?.version_code !== 230 || root.sample?.abi !== "arm64-v8a" ||
    root.clip?.name !== "ScoreGaugeSS" || root.clip?.sample_rate !== 60 ||
    root.clip?.duration_seconds !== 3 || root.clip?.loop !== true ||
    root.clip?.curve_count !== 56 || root.clip?.frame_count !== 39 ||
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
      node === null || typeof node !== "object" || node.name !== expectedNames[index] ||
      !validVector(node.initial_position, 3) || !validVector(node.initial_scale, 3) ||
      !validVector(node.initial_rotation_quaternion, 4) ||
      (node.portable_texture !== "high-rank-kira" &&
        node.portable_texture !== "high-rank-long-star" &&
        node.portable_texture !== "high-rank-overlay")
    ) return null;
    nodes.push(Object.freeze({
      name: node.name,
      textureKey: node.portable_texture,
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
      frame === null || typeof frame !== "object" ||
      typeof frame.time !== "number" || !Number.isFinite(frame.time) ||
      Math.fround(frame.time) !== frame.time || frame.time < 0 || frame.time >= 3 ||
      frame.time <= previousTime || !Array.isArray(frame.keys) || frame.keys.length === 0
    ) return null;
    previousTime = frame.time;
    const indices = new Set<number>();
    const keys: ScoreGaugeSsAnimationKey[] = [];
    for (const key of frame.keys) {
      if (
        key === null || typeof key !== "object" || !Number.isInteger(key.index) ||
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

function validVector(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function freezeVector3(value: number[]): readonly [number, number, number] {
  return Object.freeze([...value]) as readonly [number, number, number];
}

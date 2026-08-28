export interface PauseCountdownClipKey {
  readonly index: number;
  readonly coefficients: readonly [number, number, number, number];
}

export interface PauseCountdownClipFrame {
  readonly time: number;
  readonly keys: readonly PauseCountdownClipKey[];
}

export interface PauseCountdownClipBinding {
  readonly pathHash: number;
  readonly path: string;
  readonly attributeHash: number;
  readonly attribute: string;
  readonly typeId: number;
  readonly channels: readonly string[];
}

export interface PauseCountdownClipProfile {
  readonly name: string;
  readonly sampleRate: 60;
  readonly durationSeconds: number;
  readonly loop: true;
  readonly curveCount: number;
  readonly streamedCurveCount: number;
  readonly bindings: readonly PauseCountdownClipBinding[];
  readonly frames: readonly PauseCountdownClipFrame[];
  readonly constants: readonly number[];
}

export interface PauseCountdownAnimationProfile {
  readonly schemaVersion: 1;
  readonly callbackSeconds: 3;
  readonly continueClip: PauseCountdownClipProfile;
  readonly resumeOneSecondClip: PauseCountdownClipProfile;
}

export function parseCurrentPauseCountdownAnimationProfile(
  value: unknown,
): PauseCountdownAnimationProfile | null {
  if (!record(value) || value.schemaVersion !== 1 || value.callbackSeconds !== 3) return null;
  const rawIdentity = value.status === "confirmed-current-pause-countdown-animation-profile" &&
    record(value.sample) && value.sample.package === "jp.co.craftegg.band" &&
    value.sample.versionName === "10.1.4" && value.sample.versionCode === 230 &&
    value.sample.abi === "arm64-v8a";
  const alreadyParsed = value.status === undefined && value.sample === undefined;
  if (!rawIdentity && !alreadyParsed) return null;
  const continued = parseClip(value.continueClip, {
    name: "ContinueCountDownAnimation", duration: 3.5, curves: 25,
    frames: 22, keys: 102, bindings: 15,
  });
  const oneSecond = parseClip(value.resumeOneSecondClip, {
    name: "ResumeCountDownOneSecAnimamtion", duration: Math.fround(1.899999976158142),
    curves: 10, frames: 5, keys: 31, bindings: 8,
  });
  if (continued === null || oneSecond === null) return null;
  return Object.freeze({
    schemaVersion: 1 as const,
    callbackSeconds: 3 as const,
    continueClip: continued,
    resumeOneSecondClip: oneSecond,
  });
}

function parseClip(
  value: unknown,
  expected: Readonly<{
    name: string; duration: number; curves: number; frames: number; keys: number; bindings: number;
  }>,
): PauseCountdownClipProfile | null {
  if (!record(value) || value.name !== expected.name || value.sampleRate !== 60 ||
    value.durationSeconds !== expected.duration || value.loop !== true ||
    value.curveCount !== expected.curves || value.streamedCurveCount !== expected.curves ||
    !Array.isArray(value.bindings) || value.bindings.length !== expected.bindings ||
    !Array.isArray(value.frames) || value.frames.length !== expected.frames ||
    !Array.isArray(value.constants) || value.constants.length !== 0) return null;
  const bindings: PauseCountdownClipBinding[] = [];
  const channels: string[] = [];
  for (const raw of value.bindings) {
    if (!record(raw) || !Number.isSafeInteger(raw.pathHash) || typeof raw.path !== "string" ||
      !Number.isSafeInteger(raw.attributeHash) || typeof raw.attribute !== "string" ||
      !Number.isSafeInteger(raw.typeId) || !Array.isArray(raw.channels) || raw.channels.length === 0 ||
      raw.channels.some((channel) => typeof channel !== "string" || channel.length === 0)) return null;
    channels.push(...raw.channels);
    bindings.push(Object.freeze({
      pathHash: raw.pathHash,
      path: raw.path,
      attributeHash: raw.attributeHash,
      attribute: raw.attribute,
      typeId: raw.typeId,
      channels: Object.freeze([...raw.channels]),
    }));
  }
  if (channels.length !== expected.curves || new Set(channels).size !== channels.length) return null;
  let keyCount = 0;
  let previousTime = -1;
  const frames: PauseCountdownClipFrame[] = [];
  const initialized = new Set<number>();
  for (const rawFrame of value.frames) {
    if (!record(rawFrame) || !finiteF32(rawFrame.time) || rawFrame.time < 0 ||
      rawFrame.time > expected.duration || rawFrame.time <= previousTime ||
      !Array.isArray(rawFrame.keys) || rawFrame.keys.length === 0) return null;
    previousTime = rawFrame.time;
    const indices = new Set<number>();
    const keys: PauseCountdownClipKey[] = [];
    for (const rawKey of rawFrame.keys) {
      if (!record(rawKey) || !Number.isInteger(rawKey.index) || rawKey.index < 0 ||
        rawKey.index >= expected.curves || indices.has(rawKey.index) ||
        !vector(rawKey.coefficients, 4) || rawKey.coefficients.some((entry) => !finiteF32(entry))) return null;
      indices.add(rawKey.index);
      initialized.add(rawKey.index);
      keys.push(Object.freeze({
        index: rawKey.index,
        coefficients: Object.freeze([...rawKey.coefficients]) as readonly [number, number, number, number],
      }));
      keyCount += 1;
    }
    frames.push(Object.freeze({ time: rawFrame.time, keys: Object.freeze(keys) }));
  }
  if (keyCount !== expected.keys || initialized.size !== expected.curves || frames[0]?.time !== 0) return null;
  return Object.freeze({
    name: expected.name,
    sampleRate: 60 as const,
    durationSeconds: expected.duration,
    loop: true as const,
    curveCount: expected.curves,
    streamedCurveCount: expected.curves,
    bindings: Object.freeze(bindings),
    frames: Object.freeze(frames),
    constants: Object.freeze([]),
  });
}

export function samplePauseCountdownClip(
  clip: PauseCountdownClipProfile,
  elapsedSeconds: number,
): ReadonlyMap<string, number> {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new TypeError("Pause countdown sampling requires one finite non-negative elapsed time.");
  }
  const phase = Math.fround(Math.min(
    elapsedSeconds,
    Math.fround(clip.durationSeconds - 1 / 6000),
  ));
  const latest = new Map<number, Readonly<{
    time: number;
    coefficients: readonly [number, number, number, number];
  }>>();
  for (const frame of clip.frames) {
    if (frame.time > phase) break;
    for (const key of frame.keys) latest.set(key.index, Object.freeze({
      time: frame.time,
      coefficients: key.coefficients,
    }));
  }
  const channels = clip.bindings.flatMap((binding) => binding.channels);
  const sampled = new Map<string, number>();
  for (let index = 0; index < channels.length; index += 1) {
    const key = latest.get(index);
    if (key === undefined) {
      sampled.set(channels[index]!, Math.fround(0));
      continue;
    }
    const delta = Math.fround(phase - key.time);
    let value = Math.fround(Math.fround(key.coefficients[0] * delta) + key.coefficients[1]);
    value = Math.fround(Math.fround(value * delta) + key.coefficients[2]);
    value = Math.fround(Math.fround(value * delta) + key.coefficients[3]);
    sampled.set(channels[index]!, value);
  }
  return sampled;
}

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function vector(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number");
}
function finiteF32(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value;
}

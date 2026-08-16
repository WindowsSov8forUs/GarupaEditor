import { CURRENT_AUDIO_SE_RESOURCES } from "./resources/currentAudioResourceManifest";
import type {
  AudioCommand,
  AudioFailureCode,
  AudioFixedSeResourceProfile,
  AudioOperationResult,
  AudioResourceProfile,
  AudioResourceProfileSet,
  AudioSessionBgmResourceProfile,
} from "./audioContracts";

const SHA256_PATTERN = /^[0-9A-F]{64}$/;
const FLOAT32_BITS_PATTERN = /^0x[0-9A-F]{8}$/;

const FIXED_SE_LOGICAL_IDS = Object.freeze({
  directional_fl: "sound/tapseskin/directionalflickskin00",
  directional_fl_2: "sound/tapseskin/directionalflickskin00",
  directional_fl_3: "sound/tapseskin/directionalflickskin00",
  SE_RHYTHM_CLEAR: "sound/common",
  SE_RHYTHM_FULLCOMBO: "sound/common",
  SE_RHYTHM_TAP_SKILL: "sound/common",
  bad: "sound/common",
  miss: "sound/common",
  SE_RHYTHM_TAP_LONG: "sound/tapseskin/skin00",
  flick: "sound/tapseskin/skin00",
  game_button: "sound/tapseskin/skin00",
  good: "sound/tapseskin/skin00",
  great: "sound/tapseskin/skin00",
  perfect: "sound/tapseskin/skin00",
} as const);

const FIXED_SE_LOGICAL_IDS_SET: ReadonlySet<string> = new Set(Object.values(FIXED_SE_LOGICAL_IDS));

const RESOURCE_KEYS = Object.freeze([
  "role", "logicalId", "cue", "byteLength", "sha256", "mime", "codec",
  "sampleRate", "channels", "durationSeconds", "sampleFrames", "loop",
  "identity", "signal",
] as const);

export function audioAccepted<T>(value: T): AudioOperationResult<T> {
  return Object.freeze({ status: "accepted", value });
}

export function audioRejected(
  code: AudioFailureCode,
  capability: string,
  boundary: string,
): AudioOperationResult<never> {
  return Object.freeze({
    status: code,
    failure: Object.freeze({
      code,
      capability,
      boundary,
    }),
  });
}

export function validateAndFreezeAudioProfile(
  profile: AudioResourceProfileSet,
): AudioOperationResult<AudioResourceProfileSet> {
  if (
    !isRecord(profile) ||
    !hasExactKeys(profile, [
      "schemaVersion", "profileId", "sample", "sourceClass", "fidelity",
      "networkAllowed", "automaticFallbackAllowed", "pools", "resources",
    ]) ||
    profile.schemaVersion !== 1 ||
    profile.profileId !== "session-external-portable-v1" ||
    profile.sourceClass !== "external-reference-only-no-redistribution" ||
    profile.fidelity !== "semantic-exact-portable-equivalent-lossy" ||
    profile.networkAllowed !== false ||
    profile.automaticFallbackAllowed !== false ||
    !Array.isArray(profile.resources) ||
    profile.resources.length !== CURRENT_AUDIO_SE_RESOURCES.length + 1
  ) {
    return rejectProfile(
      "audio.profile.invalid-shape",
      "The reduced gameplay profile requires one explicit BGM plus the fourteen retained gameplay SE resources, including the Skill-note hit cue.",
    );
  }
  if (
    !isRecord(profile.sample) ||
    !hasExactKeys(profile.sample, [
      "package", "versionName", "versionCode", "abi", "libil2cppSha256",
      "globalMetadataSha256",
    ]) ||
    profile.sample.package !== "jp.co.craftegg.band" ||
    profile.sample.versionName !== "10.1.4" ||
    profile.sample.versionCode !== 230 ||
    profile.sample.abi !== "arm64-v8a" ||
    profile.sample.libil2cppSha256 !==
      "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F" ||
    profile.sample.globalMetadataSha256 !==
      "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
  ) {
    return rejectProfile(
      "audio.profile.wrong-sample",
      "Audio accepts only the locked jp.co.craftegg.band 10.1.4/230 arm64-v8a engine contract.",
    );
  }
  if (
    !isRecord(profile.pools) ||
    !hasExactKeys(profile.pools, ["bgm", "se", "oneShot", "exhaustion"]) ||
    profile.pools.bgm !== 8 ||
    profile.pools.se !== 12 ||
    profile.pools.oneShot !== 1 ||
    profile.pools.exhaustion !== "evidence-required"
  ) {
    return rejectProfile(
      "audio.profile.invalid-pools",
      "The current fixed pools are BGM=8, SE=12 and one-shot=1; exhaustion fails closed.",
    );
  }

  let bgm: AudioSessionBgmResourceProfile | null = null;
  const seenSe = new Set<string>();
  for (const resource of profile.resources) {
    if (resource?.role === "bgm") {
      if (bgm !== null) {
        return rejectProfile(
          "audio.profile.duplicate-session-bgm",
          "A Live session owns exactly one explicit BGM resource and cannot alias or replace it.",
        );
      }
      const validated = validateSessionBgmResource(resource);
      if (validated.status !== "accepted") return validated;
      bgm = validated.value;
      continue;
    }
    const validated = validateFixedSeResource(resource, seenSe);
    if (validated.status !== "accepted") return validated;
  }
  if (bgm === null || seenSe.size !== CURRENT_AUDIO_SE_RESOURCES.length) {
    return rejectProfile(
      "audio.profile.incomplete-session-inventory",
      "The profile must contain one session BGM and every exact current SE once; defaults and substitutions are forbidden.",
    );
  }
  if (seenSe.has(bgm.cue) || FIXED_SE_LOGICAL_IDS_SET.has(bgm.logicalId)) {
    return rejectProfile(
      "audio.profile.session-bgm-aliases-fixed-se",
      "Session BGM cue and logical identity cannot alias a fixed SE resource.",
    );
  }

  return audioAccepted(Object.freeze({
    schemaVersion: 1,
    profileId: "session-external-portable-v1",
    sample: Object.freeze({ ...profile.sample }),
    sourceClass: "external-reference-only-no-redistribution",
    fidelity: "semantic-exact-portable-equivalent-lossy",
    networkAllowed: false,
    automaticFallbackAllowed: false,
    pools: Object.freeze({
      bgm: 8,
      se: 12,
      oneShot: 1,
      exhaustion: "evidence-required",
    }),
    resources: Object.freeze([
      bgm,
      ...CURRENT_AUDIO_SE_RESOURCES,
    ]),
  }));
}

export function validateAudioCommandShape(
  command: AudioCommand,
  bgmCue: string,
  seCueSet: ReadonlySet<string>,
): AudioOperationResult<void> {
  if (!isRecord(command) || typeof command.kind !== "string") {
    return rejectCommand("audio.command.invalid-shape", "Audio commands must be typed immutable records.");
  }
  switch (command.kind) {
    case "session.open":
      return hasExactKeys(command, ["kind", "bgm_pool", "se_pool", "one_shot_pool"]) &&
        command.bgm_pool === 8 && command.se_pool === 12 && command.one_shot_pool === 1
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.invalid-session-open", "Session open preserves the exact fixed pool capacities.");
    case "bgm.load":
    case "bgm.move-time-load":
      return hasExactKeys(command, ["kind", "cue", "seek_ms", "priority", "fade_bits"]) &&
        isNonEmpty(bgmCue) && command.cue === bgmCue &&
        Number.isSafeInteger(command.seek_ms) && command.seek_ms >= 0 &&
        command.priority === 255 && command.fade_bits === "0x00000000"
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.invalid-bgm-load", "BGM load requires the exact prepared session cue, millisecond seek, priority and zero-fade fields.");
    case "bgm.pause":
    case "bgm.resume":
    case "se.pause":
    case "se.resume":
      return hasExactKeys(command, ["kind"])
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.unexpected-field", "Fieldless pause/resume commands cannot carry aliases or backend options.");
    case "audio.pause-all": {
      const keys = command.delay_seconds_bits === undefined
        ? ["kind", "paused"] as const
        : ["kind", "paused", "delay_seconds_bits"] as const;
      if (!hasExactKeys(command, keys) || typeof command.paused !== "boolean") {
        return rejectCommand("audio.command.invalid-pause-all", "Global pause requires an explicit boolean and only the evidenced optional delay.");
      }
      if (command.delay_seconds_bits !== undefined &&
          (!command.paused || !isFiniteFloat32Bits(command.delay_seconds_bits) || audioFloat32FromBits(command.delay_seconds_bits)! < 0)) {
        return rejectCommand("audio.command.invalid-pause-delay", "A pause delay must be a non-negative finite binary32 value and is invalid on resume.");
      }
      return audioAccepted(undefined);
    }
    case "se.play-one-shot":
      return hasExactKeys(command, [
        "kind", "cue", "voice_key", "volume_bits", "pitch_bits",
        "pan_distance_bits", "pan_angle_bits",
      ]) && seCueSet.has(command.cue) && isNonEmpty(command.voice_key) &&
        isUnitFloat32Bits(command.volume_bits) &&
        command.pitch_bits === "0x00000000" &&
        command.pan_distance_bits === "0x00000000" &&
        command.pan_angle_bits === "0x00000000"
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.invalid-one-shot", "One-shot commands require an exact cue, stable voice and evidenced unit-range gain with zero pitch/pan.");
    case "hold.start-loop":
      return hasExactKeys(command, [
        "kind", "cue", "owner_key", "volume_bits", "fade_in_bits",
      ]) && command.cue === "SE_RHYTHM_TAP_LONG" && seCueSet.has(command.cue) &&
        isNonEmpty(command.owner_key) && isUnitFloat32Bits(command.volume_bits) &&
        command.fade_in_bits === "0x00000000"
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.invalid-hold-start", "Hold start requires the exact loop cue, stable owner, unit-range gain and zero fade-in.");
    case "hold.fade":
      return hasExactKeys(command, [
        "kind", "owner_key", "target_bits", "duration_bits", "stop_at_zero",
      ]) && isNonEmpty(command.owner_key) && isUnitFloat32Bits(command.target_bits) &&
        isPositiveFloat32Bits(command.duration_bits) && typeof command.stop_at_zero === "boolean" &&
        (!command.stop_at_zero || command.target_bits === "0x00000000")
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.invalid-hold-fade", "Hold fade requires a stable owner, finite target/duration and zero target when stop-at-zero is set.");
    case "hold.pause":
    case "hold.resume":
      return hasExactKeys(command, ["kind", "owner_key"]) && isNonEmpty(command.owner_key)
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.invalid-hold-owner", "Hold pause/resume requires one stable non-empty owner identity.");
    case "gain.set":
      return hasExactKeys(command, ["kind", "bgm_bits", "se_bits"]) &&
        isUnitFloat32Bits(command.bgm_bits) && isUnitFloat32Bits(command.se_bits)
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.invalid-gain", "BGM and SE gains must be finite binary32 values in [0,1] without clamping.");
    case "pool.profile":
      return hasExactKeys(command, ["kind", "bgm", "se", "one_shot", "exhaustion"]) &&
        command.bgm === 8 && command.se === 12 && command.one_shot === 1 &&
        command.exhaustion === "evidence-required"
        ? audioAccepted(undefined)
        : rejectCommand("audio.command.invalid-pool-profile", "Pool profile is fixed at 8/12/1 and exhaustion remains evidence-required.");
    default:
      return rejectCommand("audio.command.unknown-kind", "Unknown audio command kinds cannot be ignored or converted to no-op.");
  }
}

export function freezeAudioCommand(command: AudioCommand): AudioCommand {
  return Object.freeze({ ...command }) as AudioCommand;
}

export function audioFloat32ToBits(value: number): string | null {
  const rounded = Math.fround(value);
  if (!Number.isFinite(value) || !Number.isFinite(rounded) || rounded !== value) {
    return null;
  }
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, rounded, false);
  return `0x${view.getUint32(0, false).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function audioFloat32FromBits(bits: string): number | null {
  if (!FLOAT32_BITS_PATTERN.test(bits)) return null;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, Number.parseInt(bits.slice(2), 16), false);
  const value = view.getFloat32(0, false);
  return Number.isFinite(value) ? value : null;
}

function validateSessionBgmResource(
  resource: AudioResourceProfile,
): AudioOperationResult<AudioSessionBgmResourceProfile> {
  if (!isRecord(resource) || !hasExactKeys(resource, RESOURCE_KEYS) ||
    resource.role !== "bgm" || !isNonEmpty(resource.logicalId) || !isNonEmpty(resource.cue) ||
    !Number.isSafeInteger(resource.byteLength) || resource.byteLength <= 0 ||
    !SHA256_PATTERN.test(resource.sha256) ||
    resource.mime !== "audio/mpeg" || resource.codec !== "mp3" ||
    !Number.isSafeInteger(resource.sampleRate) || resource.sampleRate <= 0 ||
    (resource.channels !== 1 && resource.channels !== 2) ||
    !Number.isFinite(resource.durationSeconds) || resource.durationSeconds <= 0 ||
    !Number.isSafeInteger(resource.sampleFrames) || resource.sampleFrames <= 0 ||
    resource.loop !== null || resource.identity !== "session-explicit" ||
    resource.signal !== "host-supplied-portable"
  ) {
    return rejectProfile(
      "audio.profile.invalid-session-bgm",
      "Session BGM requires one explicit non-empty identity, positive MP3 metadata, uppercase SHA-256, no loop, and portable host classification.",
    );
  }
  return audioAccepted(Object.freeze({ ...resource }));
}

function validateFixedSeResource(
  resource: AudioResourceProfile,
  seen: Set<string>,
): AudioOperationResult<AudioFixedSeResourceProfile> {
  if (!isRecord(resource) || !hasExactKeys(resource, RESOURCE_KEYS) || resource.role !== "se") {
    return rejectProfile(
      "audio.profile.invalid-resource-shape",
      "Fixed SE declarations require the exact typed resource fields and role.",
    );
  }
  const expectedLogicalId = FIXED_SE_LOGICAL_IDS[resource.cue as keyof typeof FIXED_SE_LOGICAL_IDS];
  const expected = CURRENT_AUDIO_SE_RESOURCES.find((candidate) => candidate.cue === resource.cue);
  if (
    expectedLogicalId === undefined || expected === undefined || seen.has(resource.cue) ||
    resource.logicalId !== expectedLogicalId || resource.byteLength !== expected.byteLength ||
    resource.sha256 !== expected.sha256 || resource.mime !== expected.mime ||
    resource.codec !== expected.codec || resource.sampleRate !== expected.sampleRate ||
    resource.channels !== expected.channels || resource.durationSeconds !== expected.durationSeconds ||
    resource.sampleFrames !== expected.sampleFrames ||
    resource.identity !== expected.identity || resource.signal !== expected.signal
  ) {
    return rejectProfile(
      "audio.profile.invalid-fixed-se",
      "Every fixed SE must match the exact current cue, logical ID, bytes, metadata and fidelity without aliases.",
    );
  }
  if (resource.cue === "SE_RHYTHM_TAP_LONG") {
    if (!isRecord(resource.loop) || !hasExactKeys(resource.loop, ["start", "end"]) ||
      resource.loop.start !== expected.loop?.start || resource.loop.end !== expected.loop.end) {
      return rejectProfile(
        "audio.profile.invalid-loop",
        "The current Long/Slide loop is the exact half-open source range [0,22997).",
      );
    }
  } else if (resource.loop !== null) {
    return rejectProfile(
      "audio.profile.unexpected-loop",
      "Only SE_RHYTHM_TAP_LONG carries a current loop range.",
    );
  }
  seen.add(resource.cue);
  return audioAccepted(Object.freeze({
    ...expected,
    loop: expected.loop === null ? null : Object.freeze({ ...expected.loop }),
  }));
}

function rejectProfile(capability: string, boundary: string) {
  return audioRejected("evidence-required", capability, boundary);
}

function rejectCommand(capability: string, boundary: string) {
  return audioRejected("evidence-required", capability, boundary);
}

function isUnitFloat32Bits(bits: string): boolean {
  const value = audioFloat32FromBits(bits);
  return value !== null && value >= 0 && value <= 1;
}

function isPositiveFloat32Bits(bits: string): boolean {
  const value = audioFloat32FromBits(bits);
  return value !== null && value > 0;
}

function isFiniteFloat32Bits(bits: string): boolean {
  return audioFloat32FromBits(bits) !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

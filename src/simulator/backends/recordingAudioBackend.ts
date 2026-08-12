import type {
  AudioBackendFault,
  AudioBackendSnapshot,
  AudioCommand,
  AudioCommandBatch,
  AudioOperationResult,
  AudioResourcePreflightAdapter,
  AudioResourceProfileSet,
  AudioResourceProvider,
  AudioSemanticStateSnapshot,
  AudioVoiceSnapshot,
  SimulatorAudioBackend,
} from "./audioContracts";
import {
  audioAccepted,
  audioRejected,
  freezeAudioCommand,
  validateAndFreezeAudioProfile,
  validateAudioCommandShape,
} from "./audioValidation";

interface MutableHoldVoice {
  readonly cue: "SE_RHYTHM_TAP_LONG";
  paused: boolean;
}

interface MutableAudioSemanticState {
  sessionOpened: boolean;
  bgmCue: string | null;
  bgmPaused: boolean;
  sePaused: boolean;
  allPaused: boolean;
  readonly holds: Map<string, MutableHoldVoice>;
  gain: {
    bgmBits: string;
    seBits: string;
  } | null;
}

interface PendingAudioBatch {
  readonly capability: AudioCommandBatch;
  readonly commands: readonly AudioCommand[];
  readonly semantic: MutableAudioSemanticState;
}

export class RecordingSimulatorAudioBackend implements SimulatorAudioBackend {
  readonly id = "recording-audio";

  private state: AudioBackendSnapshot["state"] = "unprepared";
  private sessionId: string | null = null;
  private profile: AudioResourceProfileSet | null = null;
  private resourceCount = 0;
  private nextSequence = 0;
  private semantic = createEmptySemanticState();
  private bgmNaturallyEnded = false;
  private readonly commands: AudioCommand[] = [];
  private pendingBatch: PendingAudioBatch | null = null;
  private fault: AudioBackendFault | null = null;

  async prepare(
    sessionId: string,
    profile: AudioResourceProfileSet,
    provider: AudioResourceProvider,
    preflight: AudioResourcePreflightAdapter,
  ): Promise<AudioOperationResult<void>> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "unprepared") {
      return this.reject(
        "audio.prepare.invalid-state",
        "An audio backend session prepares exactly once and cannot overlap another prepare.",
      );
    }
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return this.reject(
        "audio.prepare.invalid-session",
        "Prepare requires one non-empty host-authored session identity.",
      );
    }
    if (
      provider === null || typeof provider !== "object" || typeof provider.read !== "function" ||
      preflight === null || typeof preflight !== "object" ||
      typeof preflight.sha256 !== "function" || typeof preflight.inspect !== "function"
    ) {
      return this.reject(
        "audio.prepare.missing-provider",
        "Profile preparation requires explicit byte provider and preflight capabilities; no fallback is available.",
      );
    }
    const validated = validateAndFreezeAudioProfile(profile);
    if (validated.status !== "accepted") return validated;

    this.state = "preparing";
    try {
      for (const resource of validated.value.resources) {
        const read = await provider.read(resource);
        if (read.status !== "accepted") return this.abortPrepare(read);
        if (!(read.value instanceof Uint8Array)) {
          return this.latchFault(
            "audio.prepare.invalid-provider-result",
            "The provider returned a non-byte capability.",
          );
        }
        const bytes = Uint8Array.from(read.value);
        if (bytes.byteLength !== resource.byteLength) {
          return this.abortPrepare(audioRejected(
            "audio-resource-integrity",
            "audio.prepare.byte-length-mismatch",
            "Resource bytes must match the exact declared length before decode.",
          ));
        }
        const digest = await preflight.sha256(bytes);
        if (digest.status !== "accepted") return this.abortPrepare(digest);
        if (digest.value !== resource.sha256) {
          return this.abortPrepare(audioRejected(
            "audio-resource-integrity",
            "audio.prepare.sha256-mismatch",
            "Resource bytes must match the exact uppercase SHA-256 before decode.",
          ));
        }
        const metadata = await preflight.inspect(bytes, resource);
        if (metadata.status !== "accepted") return this.abortPrepare(metadata);
        if (
          metadata.value === null || typeof metadata.value !== "object" ||
          metadata.value.codec !== resource.codec ||
          metadata.value.sampleRate !== resource.sampleRate ||
          metadata.value.channels !== resource.channels ||
          metadata.value.durationSeconds !== resource.durationSeconds
        ) {
          return this.abortPrepare(audioRejected(
            "audio-resource-decode",
            "audio.prepare.decoded-metadata-mismatch",
            "Decoded codec, sample rate, channels and gapless duration must match the current portable profile.",
          ));
        }
      }
    } catch {
      return this.latchFault(
        "audio.prepare.provider-or-preflight-threw",
        "A synchronous or asynchronous provider/preflight exception is the first terminal backend fault.",
      );
    }

    this.sessionId = sessionId;
    this.profile = validated.value;
    this.resourceCount = validated.value.resources.length;
    this.state = "ready";
    return audioAccepted(undefined);
  }

  preflight(commands: readonly AudioCommand[]): AudioOperationResult<AudioCommandBatch> {
    const terminal = this.terminalResult<AudioCommandBatch>();
    if (terminal !== null) return terminal;
    if (this.state !== "ready" || this.profile === null || this.sessionId === null) {
      return this.reject(
        "audio.command.backend-not-ready",
        "Commands require a prepared audio session.",
      );
    }
    if (this.pendingBatch !== null) {
      return this.reject(
        "audio.command.overlapping-batch",
        "Only one one-use batch capability may be pending for a session.",
      );
    }
    if (!Array.isArray(commands) || commands.length === 0) {
      return this.reject(
        "audio.command.empty-or-invalid-batch",
        "A semantic transition with no audio command must not manufacture an empty backend batch.",
      );
    }

    const bgmCue = this.profile.resources.find((resource) => resource.role === "bgm")!.cue;
    const seCueSet = new Set(
      this.profile.resources.filter((resource) => resource.role === "se").map((resource) => resource.cue),
    );
    const simulated = cloneSemanticState(this.semantic);
    const frozenCommands: AudioCommand[] = [];
    for (const command of commands) {
      const shape = validateAudioCommandShape(command, bgmCue, seCueSet);
      if (shape.status !== "accepted") return shape;
      const transition = applyCommand(command, simulated);
      if (transition.status !== "accepted") return transition;
      frozenCommands.push(freezeAudioCommand(command));
    }

    const capability = Object.freeze({
      sessionId: this.sessionId,
      firstSequence: this.nextSequence,
      commandCount: frozenCommands.length,
    });
    this.pendingBatch = Object.freeze({
      capability,
      commands: Object.freeze(frozenCommands),
      semantic: simulated,
    });
    return audioAccepted(capability);
  }

  commit(batch: AudioCommandBatch): AudioOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    const pending = this.pendingBatch;
    if (
      this.state !== "ready" || pending === null || pending.capability !== batch ||
      batch.sessionId !== this.sessionId || batch.firstSequence !== this.nextSequence ||
      batch.commandCount !== pending.commands.length
    ) {
      return this.reject(
        "audio.command.invalid-batch-capability",
        "Only the exact one-use capability issued for this session and sequence can commit.",
      );
    }
    this.semantic = pending.semantic;
    this.commands.push(...pending.commands);
    this.nextSequence += pending.commands.length;
    this.pendingBatch = null;
    return audioAccepted(undefined);
  }

  discard(batch: AudioCommandBatch): AudioOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    if (this.pendingBatch?.capability !== batch) {
      return this.reject(
        "audio.command.invalid-discard-capability",
        "Only the exact pending capability may be discarded; foreign and replayed capabilities fail closed.",
      );
    }
    this.pendingBatch = null;
    return audioAccepted(undefined);
  }

  execute(command: AudioCommand): AudioOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    const batch = this.preflight([command]);
    return batch.status === "accepted" ? this.commit(batch.value) : batch;
  }

  getBgmPlaybackState(): AudioOperationResult<"not-loaded" | "playing" | "paused" | "ended"> {
    const terminal = this.terminalResult<"not-loaded" | "playing" | "paused" | "ended">();
    if (terminal !== null) return terminal;
    if (this.semantic.bgmCue === null) return audioAccepted("not-loaded");
    if (this.bgmNaturallyEnded) return audioAccepted("ended");
    return audioAccepted(this.semantic.bgmPaused || this.semantic.allPaused ? "paused" : "playing");
  }

  notifyBgmNaturalEnd(): AudioOperationResult<void> {
    const terminal = this.terminalResult<void>();
    if (terminal !== null) return terminal;
    if (this.state !== "ready" || this.semantic.bgmCue === null || this.bgmNaturallyEnded) {
      return this.reject(
        "audio.recording.invalid-natural-end",
        "The recording oracle can publish one natural end only for one loaded ready BGM voice.",
      );
    }
    this.bgmNaturallyEnded = true;
    return audioAccepted(undefined);
  }

  recordTerminalFault(capability: string, boundary: string): AudioOperationResult<never> {
    const disposed = this.state === "disposed" ? this.disposedResult<never>() : null;
    if (disposed !== null) return disposed;
    if (this.fault !== null) return this.faultResult();
    return this.latchFault(capability, boundary);
  }

  snapshot(): AudioBackendSnapshot {
    return Object.freeze({
      state: this.state,
      sessionId: this.sessionId,
      profileId: this.profile?.profileId ?? null,
      fidelity: this.profile?.fidelity ?? null,
      preparedBgmCue: this.profile?.resources.find((resource) => resource.role === "bgm")?.cue ?? null,
      nextSequence: this.nextSequence,
      resourceCount: this.resourceCount,
      semantic: freezeSemanticSnapshot(this.semantic),
      commands: Object.freeze(this.commands.map(freezeAudioCommand)),
      fault: this.fault === null ? null : Object.freeze({ ...this.fault }),
    });
  }

  dispose(): AudioOperationResult<void> {
    if (this.state === "disposed") return this.disposedResult();
    this.pendingBatch = null;
    this.profile = null;
    this.sessionId = null;
    this.resourceCount = 0;
    this.semantic = createEmptySemanticState();
    this.bgmNaturallyEnded = false;
    this.state = "disposed";
    return audioAccepted(undefined);
  }

  private abortPrepare<T>(result: AudioOperationResult<T>): AudioOperationResult<void> {
    this.state = "unprepared";
    return result.status === "accepted" ? audioAccepted(undefined) : result;
  }

  private terminalResult<T>(): AudioOperationResult<T> | null {
    if (this.state === "disposed") return this.disposedResult<T>();
    if (this.fault !== null) return this.faultResult<T>();
    return null;
  }

  private latchFault(capability: string, boundary: string): AudioOperationResult<never> {
    if (this.fault === null) {
      this.fault = Object.freeze({
        code: "audio-backend-fault",
        capability,
        boundary,
      });
      this.pendingBatch = null;
      this.state = "faulted";
    }
    return this.faultResult();
  }

  private faultResult<T = never>(): AudioOperationResult<T> {
    const fault = this.fault!;
    return audioRejected(
      "audio-backend-fault",
      fault.capability,
      fault.boundary,
    );
  }

  private disposedResult<T = void>(): AudioOperationResult<T> {
    return audioRejected(
      "terminal-disposed",
      "audio.lifecycle.terminal-disposed",
      "Disposed audio sessions reject before argument validation and are never recreated.",
    );
  }

  private reject(capability: string, boundary: string): AudioOperationResult<never> {
    return audioRejected(
      "evidence-required",
      capability,
      boundary,
    );
  }
}

function applyCommand(
  command: AudioCommand,
  state: MutableAudioSemanticState,
): AudioOperationResult<void> {
  if (command.kind === "session.open") {
    if (state.sessionOpened) {
      return transitionRejected("audio.command.duplicate-session-open", "A prepared backend opens its semantic session once.");
    }
    state.sessionOpened = true;
    return audioAccepted(undefined);
  }
  if (!state.sessionOpened) {
    return transitionRejected("audio.command.session-not-open", "Semantic audio commands require session.open first.");
  }

  switch (command.kind) {
    case "bgm.load":
      if (state.bgmCue !== null) {
        return transitionRejected("audio.command.bgm-already-loaded", "A Live audio session cannot replace its BGM through an unproven implicit handoff.");
      }
      state.bgmCue = command.cue;
      state.bgmPaused = false;
      return audioAccepted(undefined);
    case "bgm.pause":
      if (state.bgmCue === null || state.bgmPaused) {
        return transitionRejected("audio.command.invalid-bgm-pause", "BGM pause requires one loaded running BGM voice.");
      }
      state.bgmPaused = true;
      return audioAccepted(undefined);
    case "bgm.resume":
      if (state.bgmCue === null || !state.bgmPaused) {
        return transitionRejected("audio.command.invalid-bgm-resume", "BGM resume requires one paused BGM voice.");
      }
      state.bgmPaused = false;
      return audioAccepted(undefined);
    case "se.pause":
      if (state.sePaused) return transitionRejected("audio.command.duplicate-se-pause", "SE pause cannot be silently duplicated.");
      state.sePaused = true;
      return audioAccepted(undefined);
    case "se.resume":
      if (!state.sePaused) return transitionRejected("audio.command.se-not-paused", "SE resume requires an active pause.");
      state.sePaused = false;
      return audioAccepted(undefined);
    case "audio.pause-all":
      state.allPaused = command.paused;
      return audioAccepted(undefined);
    case "se.play-one-shot":
      return audioAccepted(undefined);
    case "hold.start-loop":
      if (state.holds.has(command.owner_key)) {
        return transitionRejected("audio.command.duplicate-hold-owner", "A stable Hold owner can own only one active loop voice.");
      }
      state.holds.set(command.owner_key, { cue: command.cue, paused: false });
      return audioAccepted(undefined);
    case "hold.fade":
      if (!state.holds.has(command.owner_key)) {
        return transitionRejected("audio.command.missing-hold-owner", "Hold fade cannot infer a missing owner from cue or note index.");
      }
      if (command.stop_at_zero) state.holds.delete(command.owner_key);
      return audioAccepted(undefined);
    case "hold.pause": {
      const hold = state.holds.get(command.owner_key);
      if (hold === undefined || hold.paused) {
        return transitionRejected("audio.command.invalid-hold-pause", "Hold pause requires one active unpaused owner voice.");
      }
      hold.paused = true;
      return audioAccepted(undefined);
    }
    case "hold.resume": {
      const hold = state.holds.get(command.owner_key);
      if (hold === undefined || !hold.paused) {
        return transitionRejected("audio.command.invalid-hold-resume", "Hold resume requires one paused owner voice.");
      }
      hold.paused = false;
      return audioAccepted(undefined);
    }
    case "gain.set":
      state.gain = {
        bgmBits: command.bgm_bits,
        seBits: command.se_bits,
      };
      return audioAccepted(undefined);
    case "pool.profile":
      return audioAccepted(undefined);
    default:
      return transitionRejected("audio.command.unknown-transition", "Unknown commands cannot mutate semantic audio state.");
  }
}

function createEmptySemanticState(): MutableAudioSemanticState {
  return {
    sessionOpened: false,
    bgmCue: null,
    bgmPaused: false,
    sePaused: false,
    allPaused: false,
    holds: new Map(),
    gain: null,
  };
}

function cloneSemanticState(source: MutableAudioSemanticState): MutableAudioSemanticState {
  return {
    sessionOpened: source.sessionOpened,
    bgmCue: source.bgmCue,
    bgmPaused: source.bgmPaused,
    sePaused: source.sePaused,
    allPaused: source.allPaused,
    holds: new Map([...source.holds].map(([owner, hold]) => [owner, { ...hold }])),
    gain: source.gain === null ? null : { ...source.gain },
  };
}

function freezeSemanticSnapshot(source: MutableAudioSemanticState): AudioSemanticStateSnapshot {
  const holds: AudioVoiceSnapshot[] = [...source.holds]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([ownerKey, hold]) => Object.freeze({
      ownerKey,
      cue: hold.cue,
      paused: hold.paused,
    }));
  return Object.freeze({
    sessionOpened: source.sessionOpened,
    bgmCue: source.bgmCue,
    bgmPaused: source.bgmPaused,
    sePaused: source.sePaused,
    allPaused: source.allPaused,
    holds: Object.freeze(holds),
    gain: source.gain === null ? null : Object.freeze({ ...source.gain }),
  });
}

function transitionRejected(capability: string, boundary: string): AudioOperationResult<never> {
  return audioRejected(
    "evidence-required",
    capability,
    boundary,
  );
}

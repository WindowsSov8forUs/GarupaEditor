import type {
  AudioBackendSnapshot,
  AudioCommand,
  AudioCommandBatch,
  AudioOperationResult,
  AudioResourcePreflightAdapter,
  AudioResourceProfile,
  AudioResourceProfileSet,
  AudioResourceProvider,
  SimulatorAudioBackend,
} from "../audioContracts";
import {
  audioAccepted,
  audioFloat32FromBits,
  audioRejected,
} from "../audioValidation";
import { RecordingSimulatorAudioBackend } from "../recordingAudioBackend";

interface WebAudioVoiceFade {
  startValue: number;
  readonly targetValue: number;
  remainingSeconds: number;
  startedAt: number | null;
  readonly stopAtZero: boolean;
}

interface WebAudioVoice {
  readonly voiceKey: string;
  readonly cue: string;
  readonly category: "bgm" | "se";
  readonly gain: GainNode;
  source: AudioBufferSourceNode | null;
  startedAt: number;
  offsetSeconds: number;
  paused: boolean;
  readonly loopStart: number | null;
  readonly loopEnd: number | null;
  fade: WebAudioVoiceFade | null;
}

interface PendingWebAudioBatch {
  readonly capability: AudioCommandBatch;
  readonly commands: readonly AudioCommand[];
}

export class WebAudioSimulatorBackend implements SimulatorAudioBackend {
  readonly id = "web-audio";

  private recording = new RecordingSimulatorAudioBackend();
  private readonly decodedByCue = new Map<string, AudioBuffer>();
  private readonly loopByCue = new Map<string, { readonly startSeconds: number; readonly endSeconds: number }>();
  private readonly voices = new Map<string, WebAudioVoice>();
  private pending: PendingWebAudioBatch | null = null;
  private bgmGain: GainNode | null = null;
  private seGain: GainNode | null = null;
  private contextListenerInstalled = false;
  private scheduledPauseOffset = 0;
  private physicalOutputState: "live" | "move-time-suppressed" | "move-time-published";

  constructor(
    private readonly context: AudioContext,
    moveTimeReconstruction = false,
  ) {
    this.physicalOutputState = moveTimeReconstruction
      ? "move-time-suppressed"
      : "live";
  }

  async prepare(
    sessionId: string,
    profile: AudioResourceProfileSet,
    provider: AudioResourceProvider,
    preflight: AudioResourcePreflightAdapter,
  ): Promise<AudioOperationResult<void>> {
    const state = this.recording.snapshot().state;
    if (state === "disposed") return terminalDisposed();
    if (state === "faulted") return this.currentFault();
    if (state !== "unprepared") {
      return reject(
        "audio.web.prepare.invalid-state",
        "A Web Audio backend prepares exactly once and never auto-recreates its context.",
      );
    }
    if (this.context === null || typeof this.context !== "object" || this.context.state !== "running") {
      return audioRejected(
        "audio-context-unavailable",
        "audio.web.context-unavailable-at-prepare",
        "Web Audio preparation requires an existing running context; missing, suspended and closed contexts are not resumed or recreated.",
      );
    }

    const bytesByCue = new Map<string, Uint8Array>();
    const cachingProvider: AudioResourceProvider = {
      read: async (resource) => {
        const result = await provider.read(resource);
        if (result.status !== "accepted") return result;
        const copied = Uint8Array.from(result.value);
        bytesByCue.set(resource.cue, copied);
        return audioAccepted(Uint8Array.from(copied));
      },
    };
    const candidate = new RecordingSimulatorAudioBackend();
    const prepared = await candidate.prepare(
      sessionId,
      profile,
      cachingProvider,
      preflight,
    );
    if (prepared.status !== "accepted") return prepared;
    if (this.context.state !== "running") {
      candidate.dispose();
      return audioRejected(
        "audio-context-unavailable",
        "audio.web.context-lost-during-prepare",
        "Context capability lost before ready; no decoded resources or graph are committed.",
      );
    }

    const decoded = new Map<string, AudioBuffer>();
    const temporaryGains: GainNode[] = [];
    try {
      for (const resource of profile.resources) {
        const bytes = bytesByCue.get(resource.cue);
        if (bytes === undefined) {
          candidate.dispose();
          return audioRejected(
            "audio-resource-unavailable",
            "audio.web.missing-preflight-bytes",
            "Every validated resource must remain available in the atomic temporary decode set.",
          );
        }
        let buffer: AudioBuffer;
        if (preflight.getDecodedBuffer !== undefined) {
          const cached = preflight.getDecodedBuffer(bytes);
          if (cached.status !== "accepted") {
            candidate.dispose();
            return cached;
          }
          buffer = cached.value;
        } else {
          buffer = await this.context.decodeAudioData(exactArrayBuffer(bytes));
        }
        if (!validDecodedBuffer(buffer, resource)) {
          candidate.dispose();
          return audioRejected(
            "audio-resource-decode",
            "audio.web.decoded-metadata-mismatch",
            "Browser decoded sample rate, channels, sample frames and rounded gapless duration must match the current portable profile.",
          );
        }
        decoded.set(resource.cue, buffer);
      }
      if (this.context.state !== "running") {
        candidate.dispose();
        return audioRejected(
          "audio-context-unavailable",
          "audio.web.context-lost-before-ready",
          "Context capability lost before graph commit and is not recovered automatically.",
        );
      }
      const bgmGain = this.context.createGain();
      temporaryGains.push(bgmGain);
      const seGain = this.context.createGain();
      temporaryGains.push(seGain);
      bgmGain.connect(this.context.destination);
      seGain.connect(this.context.destination);
      this.bgmGain = bgmGain;
      this.seGain = seGain;
    } catch {
      const cleanupFailures: string[] = [];
      for (const [index, gain] of temporaryGains.entries()) {
        try {
          gain.disconnect();
        } catch {
          cleanupFailures.push(`temporary-gain:${index}`);
        }
      }
      this.recording = candidate;
      return this.recording.recordTerminalFault(
        "audio.web.decode-or-graph-threw",
        cleanupFailures.length === 0
          ? "A decode rejection or synchronous graph exception is the first terminal Web Audio backend fault."
          : `A decode or graph exception is terminal; rollback continued with failed identities: ${cleanupFailures.join(",")}.`,
      );
    }

    this.recording = candidate;
    this.decodedByCue.clear();
    this.loopByCue.clear();
    for (const [cue, buffer] of decoded) this.decodedByCue.set(cue, buffer);
    for (const resource of profile.resources) {
      if (resource.loop !== null) {
        const buffer = decoded.get(resource.cue)!;
        this.loopByCue.set(resource.cue, Object.freeze({
          startSeconds: resource.loop.start === 0
            ? 0
            : resource.loop.start / resource.sampleRate,
          endSeconds: resource.loop.end === resource.sampleFrames
            ? buffer.length / buffer.sampleRate
            : resource.loop.end / resource.sampleRate,
        }));
      }
    }
    this.installContextLossListener();
    return audioAccepted(undefined);
  }

  preflight(commands: readonly AudioCommand[]): AudioOperationResult<AudioCommandBatch> {
    const context = this.requireRunningContext<AudioCommandBatch>();
    if (context !== null) return context;
    if (this.pending !== null) {
      return reject(
        "audio.web.overlapping-batch",
        "Only one prepared Web Audio batch capability may be pending.",
      );
    }
    const result = this.recording.preflight(commands);
    if (result.status !== "accepted") return result;
    this.pending = Object.freeze({
      capability: result.value,
      commands: Object.freeze(commands.map((command) => Object.freeze({ ...command }) as AudioCommand)),
    });
    return result;
  }

  commit(batch: AudioCommandBatch): AudioOperationResult<void> {
    const context = this.requireRunningContext<void>();
    if (context !== null) return context;
    const pending = this.pending;
    if (pending === null || pending.capability !== batch) {
      return reject(
        "audio.web.invalid-batch-capability",
        "Web Audio commit requires the exact pending one-use semantic capability.",
      );
    }
    try {
      if (this.physicalOutputState !== "move-time-suppressed") {
        this.applyCommands(pending.commands);
      }
    } catch {
      // Physical AudioNode effects cannot be rolled back. Semantic commands and
      // every Simulator owner remain detached when that external boundary fails.
      this.recording.discard(batch);
      this.pending = null;
      return this.recording.recordTerminalFault(
        "audio.web.command-commit-threw",
        "The first synchronous AudioNode or AudioParam exception is terminal; physical effects may be partial, but semantic commands and Simulator-owned frame state did not publish.",
      );
    }
    const committed = this.recording.commit(batch);
    this.pending = null;
    return committed;
  }

  discard(batch: AudioCommandBatch): AudioOperationResult<void> {
    const terminal = this.requireTerminalBeforeValidation<void>();
    if (terminal !== null) return terminal;
    if (this.pending?.capability !== batch) {
      return reject(
        "audio.web.invalid-discard-capability",
        "Only the exact pending Web Audio capability may be discarded.",
      );
    }
    const discarded = this.recording.discard(batch);
    if (discarded.status === "accepted") this.pending = null;
    return discarded;
  }

  execute(command: AudioCommand): AudioOperationResult<void> {
    const batch = this.preflight([command]);
    return batch.status === "accepted" ? this.commit(batch.value) : batch;
  }

  getBgmPlaybackState(): AudioOperationResult<"not-loaded" | "playing" | "paused" | "ended"> {
    const terminal = this.requireTerminalBeforeValidation<"not-loaded" | "playing" | "paused" | "ended">();
    if (terminal !== null) return terminal;
    const semantic = this.recording.snapshot().semantic;
    if (semantic.bgmCue === null) return audioAccepted("not-loaded");
    if (semantic.bgmPaused || semantic.allPaused) return audioAccepted("paused");
    if (this.physicalOutputState === "move-time-suppressed") return audioAccepted("playing");
    return audioAccepted(this.voices.has("bgm") ? "playing" : "ended");
  }

  getOneShotPlaybackState(voiceKey: string): AudioOperationResult<"not-started" | "playing" | "ended"> {
    const terminal = this.requireTerminalBeforeValidation<"not-started" | "playing" | "ended">();
    if (terminal !== null) return terminal;
    if (typeof voiceKey !== "string" || voiceKey.length === 0) {
      return reject("audio.web.invalid-one-shot-owner", "One-shot playback observation requires one stable non-empty owner key.");
    }
    const semantic = this.recording.getOneShotPlaybackState(voiceKey);
    if (semantic.status !== "accepted" || semantic.value === "not-started") return semantic;
    return audioAccepted(this.voices.has(`se:${voiceKey}`) ? "playing" : "ended");
  }

  publishMoveTimeOutput(seekMilliseconds: number): AudioOperationResult<void> {
    const context = this.requireRunningContext<void>();
    if (context !== null) return context;
    if (this.physicalOutputState !== "move-time-suppressed" ||
      !Number.isSafeInteger(seekMilliseconds) || seekMilliseconds < 0) {
      return reject(
        "audio.web.invalid-move-time-publication",
        "Physical MoveTime publication is one-use, reconstruction-only and requires a non-negative integer millisecond target.",
      );
    }
    const before = this.recording.snapshot();
    if (before.semantic.bgmCue === null || before.semantic.bgmPaused || before.semantic.allPaused) {
      return reject(
        "audio.web.invalid-move-time-semantic-state",
        "MoveTime publishes only one reconstructed running BGM owner; malformed or paused state cannot fall back.",
      );
    }
    const recorded = this.recording.publishMoveTimeOutput(seekMilliseconds);
    if (recorded.status !== "accepted") return recorded;
    try {
      if (before.semantic.gain !== null) {
        this.setCategoryGain(this.bgmGain!, audioFloat32FromBits(before.semantic.gain.bgmBits)!);
        this.setCategoryGain(this.seGain!, audioFloat32FromBits(before.semantic.gain.seBits)!);
      }
      this.createVoice("bgm", before.semantic.bgmCue, "bgm", 1, seekMilliseconds / 1000, null, null);
      this.physicalOutputState = "move-time-published";
      return audioAccepted(undefined);
    } catch {
      return this.recording.recordTerminalFault(
        "audio.web.move-time-publication-threw",
        "The reconstructed target BGM graph failed during one-use physical publication and is terminal.",
      );
    }
  }

  recordTerminalFault(capability: string, boundary: string): AudioOperationResult<never> {
    return this.recording.recordTerminalFault(capability, boundary);
  }

  snapshot(): AudioBackendSnapshot {
    return this.recording.snapshot();
  }

  dispose(): AudioOperationResult<void> {
    if (this.recording.snapshot().state === "disposed") return terminalDisposed();
    this.pending = null;
    let disposeFault: AudioOperationResult<never> | null = null;
    const release = (action: () => void): void => {
      try {
        action();
      } catch {
        disposeFault ??= this.recording.recordTerminalFault(
          "audio.web.dispose-node-threw",
          "The first source stop or node disconnect exception is latched while disposal continues releasing all owned capabilities.",
        );
      }
    };
    for (const voice of this.voices.values()) release(() => this.releaseVoice(voice));
    this.voices.clear();
    this.decodedByCue.clear();
    this.loopByCue.clear();
    release(() => this.bgmGain?.disconnect());
    release(() => this.seGain?.disconnect());
    this.bgmGain = null;
    this.seGain = null;
    if (this.contextListenerInstalled) {
      release(() => this.context.removeEventListener("statechange", this.onContextStateChange));
      this.contextListenerInstalled = false;
    }
    const disposed = this.recording.dispose();
    return disposeFault ?? disposed;
  }

  private applyCommands(commands: readonly AudioCommand[]): void {
    this.scheduledPauseOffset = 0;
    for (let commandIndex = 0; commandIndex < commands.length; commandIndex += 1) {
      const command = commands[commandIndex]!;
      switch (command.kind) {
        case "session.open":
        case "pool.profile":
          break;
        case "gain.set":
          this.setCategoryGain(this.bgmGain!, audioFloat32FromBits(command.bgm_bits)!);
          this.setCategoryGain(this.seGain!, audioFloat32FromBits(command.se_bits)!);
          break;
        case "bgm.load":
          this.createVoice(
            "bgm",
            command.cue,
            "bgm",
            commands[commandIndex + 1]?.kind === "bgm.pause" ? 0 : 1,
            command.seek_ms / 1000,
            null,
            null,
          );
          break;
        case "bgm.move-time-load":
          this.createVoice("bgm", command.cue, "bgm", 1, command.seek_ms / 1000, null, null);
          break;
        case "bgm.pause":
          this.pauseVoice(this.voices.get("bgm"));
          break;
        case "bgm.resume": {
          const bgm = this.voices.get("bgm");
          if (bgm !== undefined) {
            bgm.gain.gain.setValueAtTime(1, this.context.currentTime);
          }
          this.resumeVoice(bgm);
          break;
        }
        case "se.pause":
          this.forEachVoice((voice) => voice.category !== "bgm" && !voice.voiceKey.startsWith("hold:"), (voice) => this.pauseVoice(voice));
          break;
        case "se.resume":
          this.forEachVoice((voice) => voice.category !== "bgm" && !voice.voiceKey.startsWith("hold:"), (voice) => this.resumeVoice(voice));
          break;
        case "audio.pause-all":
          this.applyPauseAll(command.paused, command.delay_seconds_bits);
          break;
        case "se.play-one-shot":
          this.replaceVoice(
            `se:${command.voice_key}`,
            command.cue,
            "se",
            audioFloat32FromBits(command.volume_bits)!,
            0,
            null,
            null,
          );
          break;
        case "voice.release-live-start":
          if (this.voices.has(`se:${command.voice_key}`) || !this.decodedByCue.delete(command.cue)) {
            throw new Error("invalid live-start voice release state");
          }
          break;
        case "se.start-owned-loop": {
          const resource = this.requireLoopResource(command.cue);
          const voice = this.createVoice(
            `startup-loop:${command.owner_key}`,
            command.cue,
            "se",
            0,
            0,
            resource.startSeconds,
            resource.endSeconds,
          );
          this.beginVoiceFade(
            voice,
            audioFloat32FromBits(command.volume_bits)!,
            audioFloat32FromBits(command.fade_in_bits)!,
            false,
          );
          break;
        }
        case "se.fade-owned-loop": {
          const voice = this.voices.get(`startup-loop:${command.owner_key}`);
          if (voice === undefined) throw new Error("missing startup loop voice");
          this.beginVoiceFade(
            voice,
            audioFloat32FromBits(command.target_bits)!,
            audioFloat32FromBits(command.duration_bits)!,
            command.stop_at_zero,
          );
          break;
        }
        case "hold.start-loop": {
          const resource = this.requireLoopResource(command.cue);
          this.createVoice(
            `hold:${command.owner_key}`,
            command.cue,
            "se",
            audioFloat32FromBits(command.volume_bits)!,
            0,
            resource.startSeconds,
            resource.endSeconds,
          );
          break;
        }
        case "hold.fade": {
          const voice = this.voices.get(`hold:${command.owner_key}`);
          if (voice === undefined) throw new Error("missing Hold voice");
          this.beginVoiceFade(
            voice,
            audioFloat32FromBits(command.target_bits)!,
            audioFloat32FromBits(command.duration_bits)!,
            command.stop_at_zero,
          );
          break;
        }
        case "hold.pause":
          this.pauseVoice(this.voices.get(`hold:${command.owner_key}`));
          break;
        case "hold.resume":
          this.resumeVoice(this.voices.get(`hold:${command.owner_key}`));
          break;
      }
    }
  }

  private createVoice(
    voiceKey: string,
    cue: string,
    category: WebAudioVoice["category"],
    gainValue: number,
    offsetSeconds: number,
    loopStart: number | null,
    loopEnd: number | null,
  ): WebAudioVoice {
    if (this.voices.has(voiceKey)) throw new Error("duplicate Web Audio voice");
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(gainValue, this.context.currentTime);
    gain.connect(this.categoryGain(category));
    const voice: WebAudioVoice = {
      voiceKey,
      cue,
      category,
      gain,
      source: null,
      startedAt: this.context.currentTime,
      offsetSeconds,
      paused: false,
      loopStart,
      loopEnd,
      fade: null,
    };
    this.voices.set(voiceKey, voice);
    this.startVoice(voice);
    return voice;
  }

  private replaceVoice(
    voiceKey: string,
    cue: string,
    category: WebAudioVoice["category"],
    gainValue: number,
    offsetSeconds: number,
    loopStart: number | null,
    loopEnd: number | null,
  ): void {
    const existing = this.voices.get(voiceKey);
    if (existing !== undefined) {
      this.releaseVoice(existing);
      this.voices.delete(voiceKey);
    }
    this.createVoice(voiceKey, cue, category, gainValue, offsetSeconds, loopStart, loopEnd);
  }

  private startVoice(voice: WebAudioVoice): void {
    const buffer = this.decodedByCue.get(voice.cue);
    if (buffer === undefined) throw new Error("missing decoded cue");
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    if (voice.loopStart !== null && voice.loopEnd !== null) {
      source.loop = true;
      source.loopStart = voice.loopStart;
      source.loopEnd = voice.loopEnd;
    }
    source.connect(voice.gain);
    voice.source = source;
    voice.startedAt = this.context.currentTime;
    voice.paused = false;
    source.onended = () => {
      if (voice.source !== source || voice.paused) return;
      voice.source = null;
      if (voice.loopStart === null || voice.fade?.stopAtZero === true) {
        try {
          voice.fade = null;
          voice.gain.disconnect();
          this.voices.delete(voice.voiceKey);
        } catch {
          this.recording.recordTerminalFault(
            "audio.web.async-ended-cleanup-threw",
            "The first asynchronous ended-handler node exception is terminal and stable.",
          );
        }
      }
    };
    source.start(this.context.currentTime, normalizeOffset(voice, buffer));
    if (voice.fade !== null && voice.fade.startedAt === null) this.scheduleActiveFade(voice);
  }

  private pauseVoice(voice: WebAudioVoice | undefined): void {
    if (voice === undefined || voice.paused || voice.source === null) return;
    const now = this.context.currentTime;
    const buffer = this.decodedByCue.get(voice.cue)!;
    const elapsed = Math.max(0, now - voice.startedAt);
    voice.offsetSeconds = normalizeElapsedOffset(voice, buffer, voice.offsetSeconds + elapsed);
    this.settleCompletedFade(voice, now);
    if (voice.fade !== null && voice.fade.startedAt !== null) {
      const fadeElapsed = Math.min(voice.fade.remainingSeconds, Math.max(0, now - voice.fade.startedAt));
      const progress = voice.fade.remainingSeconds === 0 ? 1 : fadeElapsed / voice.fade.remainingSeconds;
      const current = voice.fade.startValue + (voice.fade.targetValue - voice.fade.startValue) * progress;
      voice.fade.startValue = Math.fround(current);
      voice.fade.remainingSeconds = Math.max(0, voice.fade.remainingSeconds - fadeElapsed);
      voice.fade.startedAt = null;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.fade.startValue, now);
    }
    const source = voice.source;
    voice.source = null;
    voice.paused = true;
    source.onended = null;
    source.stop(now);
    source.disconnect();
  }

  private resumeVoice(voice: WebAudioVoice | undefined): void {
    if (voice === undefined || !voice.paused) return;
    this.startVoice(voice);
  }

  private beginVoiceFade(
    voice: WebAudioVoice,
    targetValue: number,
    durationSeconds: number,
    stopAtZero: boolean,
  ): void {
    this.settleCompletedFade(voice, this.context.currentTime);
    if (voice.source === null || voice.paused || voice.fade !== null) {
      throw new Error("invalid owned-loop fade state");
    }
    voice.fade = {
      startValue: voice.gain.gain.value,
      targetValue,
      remainingSeconds: durationSeconds,
      startedAt: null,
      stopAtZero,
    };
    this.scheduleActiveFade(voice);
  }

  private settleCompletedFade(voice: WebAudioVoice, now: number): void {
    const fade = voice.fade;
    if (fade === null || fade.startedAt === null || fade.stopAtZero ||
      now - fade.startedAt < fade.remainingSeconds) return;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(fade.targetValue, now);
    voice.fade = null;
  }

  private scheduleActiveFade(voice: WebAudioVoice): void {
    const fade = voice.fade;
    if (fade === null || voice.source === null || voice.paused) throw new Error("inactive owned-loop fade");
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(fade.startValue, now);
    voice.gain.gain.linearRampToValueAtTime(fade.targetValue, now + fade.remainingSeconds);
    fade.startedAt = now;
    if (fade.stopAtZero) voice.source.stop(now + fade.remainingSeconds);
  }

  private requireLoopResource(cue: string): { readonly startSeconds: number; readonly endSeconds: number } {
    const resource = this.loopByCue.get(cue);
    if (resource === undefined) throw new Error("missing validated loop resource");
    return resource;
  }

  private applyPauseAll(paused: boolean, delayBits: string | undefined): void {
    if (delayBits === undefined) {
      this.forEachVoice(() => true, (voice) => paused ? this.pauseVoice(voice) : this.resumeVoice(voice));
      return;
    }
    const delay = audioFloat32FromBits(delayBits)!;
    this.scheduledPauseOffset += delay;
    const at = this.context.currentTime + this.scheduledPauseOffset;
    if (!paused) throw new Error("delayed resume is unsupported");
    this.bgmGain!.gain.setValueAtTime(0, at);
    this.seGain!.gain.setValueAtTime(0, at);
  }

  private setCategoryGain(node: GainNode, value: number): void {
    node.gain.cancelScheduledValues(this.context.currentTime);
    node.gain.setValueAtTime(value, this.context.currentTime);
  }

  private categoryGain(category: WebAudioVoice["category"]): GainNode {
    return category === "bgm" ? this.bgmGain! : this.seGain!;
  }

  private forEachVoice(
    predicate: (voice: WebAudioVoice) => boolean,
    action: (voice: WebAudioVoice) => void,
  ): void {
    for (const voice of [...this.voices.values()]) if (predicate(voice)) action(voice);
  }

  private releaseVoice(voice: WebAudioVoice): void {
    if (voice.source !== null) {
      const source = voice.source;
      voice.source = null;
      source.onended = null;
      source.stop(this.context.currentTime);
      source.disconnect();
    }
    voice.gain.disconnect();
  }

  private installContextLossListener(): void {
    if (this.contextListenerInstalled) return;
    this.context.addEventListener("statechange", this.onContextStateChange);
    this.contextListenerInstalled = true;
  }

  private readonly onContextStateChange = (): void => {
    if (this.recording.snapshot().state === "ready" && this.context.state === "closed") {
      this.pending = null;
      this.recording.recordTerminalFault(
        "audio.web.context-closed-after-ready",
        "A permanently closed AudioContext cannot preserve the prepared graph; temporary suspended lifecycle state remains recoverable.",
      );
    }
  };

  private requireRunningContext<T>(): AudioOperationResult<T> | null {
    const terminal = this.requireTerminalBeforeValidation<T>();
    if (terminal !== null) return terminal;
    if (this.recording.snapshot().state === "ready" && this.context.state === "closed") {
      return this.recording.recordTerminalFault(
        "audio.web.context-closed-after-ready",
        "A permanently closed AudioContext cannot preserve the prepared graph; temporary suspended lifecycle state remains recoverable.",
      );
    }
    return null;
  }

  private requireTerminalBeforeValidation<T>(): AudioOperationResult<T> | null {
    const snapshot = this.recording.snapshot();
    if (snapshot.state === "disposed") return terminalDisposed();
    if (snapshot.fault !== null) return this.currentFault<T>();
    return null;
  }

  private currentFault<T = never>(): AudioOperationResult<T> {
    const fault = this.recording.snapshot().fault!;
    return audioRejected("audio-backend-fault", fault.capability, fault.boundary);
  }
}

function validDecodedBuffer(buffer: AudioBuffer, resource: AudioResourceProfile): boolean {
  if (buffer === null || typeof buffer !== "object" ||
    !Number.isSafeInteger(buffer.sampleRate) || buffer.sampleRate <= 0 ||
    !Number.isSafeInteger(buffer.length) || buffer.length <= 0 ||
    buffer.numberOfChannels !== resource.channels) return false;
  const sourceFrames = buffer.sampleRate === resource.sampleRate
    ? buffer.length
    : Math.ceil(buffer.length * resource.sampleRate / buffer.sampleRate);
  return sourceFrames === resource.sampleFrames &&
    Number((sourceFrames / resource.sampleRate).toFixed(6)) === resource.durationSeconds;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function normalizeOffset(voice: WebAudioVoice, buffer: AudioBuffer): number {
  return normalizeElapsedOffset(voice, buffer, voice.offsetSeconds);
}

function normalizeElapsedOffset(
  voice: WebAudioVoice,
  buffer: AudioBuffer,
  offset: number,
): number {
  if (voice.loopStart !== null && voice.loopEnd !== null && offset >= voice.loopEnd) {
    return voice.loopStart + ((offset - voice.loopEnd) % (voice.loopEnd - voice.loopStart));
  }
  return Math.min(offset, Math.max(0, buffer.duration));
}

function reject(capability: string, boundary: string): AudioOperationResult<never> {
  return audioRejected("integrity-failure", capability, boundary);
}

function terminalDisposed<T = never>(): AudioOperationResult<T> {
  return audioRejected(
    "terminal-disposed",
    "audio.web.terminal-disposed",
    "Disposed Web Audio sessions reject before validation and never recreate the context.",
  );
}

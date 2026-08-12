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

interface WebAudioVoice {
  readonly voiceKey: string;
  readonly cue: string;
  readonly category: "bgm" | "se" | "voice";
  readonly gain: GainNode;
  source: AudioBufferSourceNode | null;
  startedAt: number;
  offsetSeconds: number;
  paused: boolean;
  readonly loopStart: number | null;
  readonly loopEnd: number | null;
}

interface PendingWebAudioBatch {
  readonly capability: AudioCommandBatch;
  readonly commands: readonly AudioCommand[];
}

export class WebAudioSimulatorBackend implements SimulatorAudioBackend {
  readonly id = "web-audio";

  private recording = new RecordingSimulatorAudioBackend();
  private readonly decodedByCue = new Map<string, AudioBuffer>();
  private readonly voices = new Map<string, WebAudioVoice>();
  private pending: PendingWebAudioBatch | null = null;
  private bgmGain: GainNode | null = null;
  private seGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private contextListenerInstalled = false;
  private scheduledPauseOffset = 0;

  constructor(private readonly context: AudioContext) {}

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
        const buffer = await this.context.decodeAudioData(exactArrayBuffer(bytes));
        if (!validDecodedBuffer(buffer, resource)) {
          candidate.dispose();
          return audioRejected(
            "audio-resource-decode",
            "audio.web.decoded-metadata-mismatch",
            "Browser decoded sample rate, channels and rounded gapless duration must match the current portable profile.",
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
      const voiceGain = this.context.createGain();
      temporaryGains.push(voiceGain);
      bgmGain.connect(this.context.destination);
      seGain.connect(this.context.destination);
      voiceGain.connect(this.context.destination);
      this.bgmGain = bgmGain;
      this.seGain = seGain;
      this.voiceGain = voiceGain;
    } catch {
      for (const gain of temporaryGains) {
        try { gain.disconnect(); } catch {}
      }
      this.recording = candidate;
      return this.recording.recordTerminalFault(
        "audio.web.decode-or-graph-threw",
        "A decode rejection or synchronous graph exception is the first terminal Web Audio backend fault.",
      );
    }

    this.recording = candidate;
    this.decodedByCue.clear();
    for (const [cue, buffer] of decoded) this.decodedByCue.set(cue, buffer);
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
    const committed = this.recording.commit(batch);
    if (committed.status !== "accepted") return committed;
    this.pending = null;
    try {
      this.applyCommands(pending.commands);
      return audioAccepted(undefined);
    } catch {
      return this.recording.recordTerminalFault(
        "audio.web.command-commit-threw",
        "The first synchronous AudioNode or AudioParam exception is terminal; committed semantic commands remain visible.",
      );
    }
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
    return audioAccepted(this.voices.has("bgm") ? "playing" : "ended");
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
    release(() => this.bgmGain?.disconnect());
    release(() => this.seGain?.disconnect());
    release(() => this.voiceGain?.disconnect());
    this.bgmGain = null;
    this.seGain = null;
    this.voiceGain = null;
    if (this.contextListenerInstalled) {
      release(() => this.context.removeEventListener("statechange", this.onContextStateChange));
      this.contextListenerInstalled = false;
    }
    const disposed = this.recording.dispose();
    return disposeFault ?? disposed;
  }

  private applyCommands(commands: readonly AudioCommand[]): void {
    this.scheduledPauseOffset = 0;
    for (const command of commands) {
      switch (command.kind) {
        case "session.open":
        case "pool.profile":
          break;
        case "gain.set":
          this.setCategoryGain(this.bgmGain!, audioFloat32FromBits(command.bgm_bits)!);
          this.setCategoryGain(this.seGain!, audioFloat32FromBits(command.se_bits)!);
          this.setCategoryGain(this.voiceGain!, audioFloat32FromBits(command.voice_bits)!);
          break;
        case "bgm.load":
          this.createVoice("bgm", command.cue, "bgm", 1, command.seek_ms / 1000, null, null);
          break;
        case "bgm.pause":
          this.pauseVoice(this.voices.get("bgm"));
          break;
        case "bgm.resume":
          this.resumeVoice(this.voices.get("bgm"));
          break;
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
            command.voice_key === "game-clear-voice" ? "voice" : "se",
            audioFloat32FromBits(command.volume_bits)!,
            0,
            null,
            null,
          );
          break;
        case "hold.start-loop": {
          const resource = CURRENT_LOOP_RESOURCE;
          this.createVoice(
            `hold:${command.owner_key}`,
            command.cue,
            "se",
            audioFloat32FromBits(command.volume_bits)!,
            0,
            resource.start / resource.sampleRate,
            resource.end / resource.sampleRate,
          );
          break;
        }
        case "hold.fade":
          this.fadeHold(command.owner_key, command.target_bits, command.duration_bits);
          break;
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
      if (voice.loopStart === null) {
        try {
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
  }

  private pauseVoice(voice: WebAudioVoice | undefined): void {
    if (voice === undefined || voice.paused || voice.source === null) return;
    const buffer = this.decodedByCue.get(voice.cue)!;
    const elapsed = Math.max(0, this.context.currentTime - voice.startedAt);
    voice.offsetSeconds = normalizeElapsedOffset(voice, buffer, voice.offsetSeconds + elapsed);
    const source = voice.source;
    voice.source = null;
    voice.paused = true;
    source.onended = null;
    source.stop(this.context.currentTime);
    source.disconnect();
  }

  private resumeVoice(voice: WebAudioVoice | undefined): void {
    if (voice === undefined || !voice.paused) return;
    this.startVoice(voice);
  }

  private fadeHold(ownerKey: string, targetBits: string, durationBits: string): void {
    const voice = this.voices.get(`hold:${ownerKey}`);
    if (voice === undefined || voice.source === null) throw new Error("missing Hold voice");
    const now = this.context.currentTime;
    const target = audioFloat32FromBits(targetBits)!;
    const duration = audioFloat32FromBits(durationBits)!;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(target, now + duration);
    voice.source.stop(now + duration);
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
    this.voiceGain!.gain.setValueAtTime(0, at);
  }

  private setCategoryGain(node: GainNode, value: number): void {
    node.gain.cancelScheduledValues(this.context.currentTime);
    node.gain.setValueAtTime(value, this.context.currentTime);
  }

  private categoryGain(category: WebAudioVoice["category"]): GainNode {
    return category === "bgm" ? this.bgmGain! : category === "voice" ? this.voiceGain! : this.seGain!;
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
    if (this.recording.snapshot().state === "ready" && this.context.state !== "running") {
      this.pending = null;
      this.recording.recordTerminalFault(
        "audio.web.context-lost-after-ready",
        "Context loss after ready is terminal; the backend does not resume, recreate or fall back.",
      );
    }
  };

  private requireRunningContext<T>(): AudioOperationResult<T> | null {
    const terminal = this.requireTerminalBeforeValidation<T>();
    if (terminal !== null) return terminal;
    if (this.recording.snapshot().state === "ready" && this.context.state !== "running") {
      return this.recording.recordTerminalFault(
        "audio.web.context-lost-after-ready",
        "Context loss after ready is terminal; mutating APIs reject before argument validation.",
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

const CURRENT_LOOP_RESOURCE = Object.freeze({
  start: 0,
  end: 22997,
  sampleRate: 44100,
});

function validDecodedBuffer(buffer: AudioBuffer, resource: AudioResourceProfile): boolean {
  return buffer !== null && typeof buffer === "object" &&
    buffer.sampleRate === resource.sampleRate &&
    buffer.numberOfChannels === resource.channels &&
    Number(buffer.duration.toFixed(6)) === resource.durationSeconds;
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
  return audioRejected("evidence-required", capability, boundary);
}

function terminalDisposed<T = never>(): AudioOperationResult<T> {
  return audioRejected(
    "terminal-disposed",
    "audio.web.terminal-disposed",
    "Disposed Web Audio sessions reject before validation and never recreate the context.",
  );
}

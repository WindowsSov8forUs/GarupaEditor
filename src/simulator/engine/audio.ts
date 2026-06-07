import type { SeSkinAssets } from "../../skinLoader";
import { resolveSeKind, type SeKind } from "./score";
import type { RuntimeNoteSemantic } from "./types";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private seGain: GainNode | null = null;
  private bgmVolume = 1;
  private seVolume = 1;
  private bgmBuffer: AudioBuffer | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmStartCtxTime = 0;
  private bgmOffsetSec = 0;
  private seBuffers = new Map<SeKind, AudioBuffer>();
  private decodedAudioCache = new Map<string, AudioBuffer>();

  private decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
    const normalized = base64.replace(/\s+/g, "");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  private normalizeVolumePercent(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 1;
    }
    return Math.max(0, Math.min(100, numeric)) / 100;
  }

  private applyGainVolumes(): void {
    if (this.bgmGain) {
      this.bgmGain.gain.value = this.bgmVolume;
    }
    if (this.seGain) {
      this.seGain.gain.value = this.seVolume;
    }
  }

  setVolumes(volumes: { bgmVolumePercent?: number; seVolumePercent?: number } | null | undefined): void {
    this.bgmVolume = this.normalizeVolumePercent(volumes?.bgmVolumePercent);
    this.seVolume = this.normalizeVolumePercent(volumes?.seVolumePercent);
    this.applyGainVolumes();
  }

  async ensureContext(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.ctx.destination);
    }
    if (!this.seGain) {
      this.seGain = this.ctx.createGain();
      this.seGain.connect(this.ctx.destination);
    }
    this.applyGainVolumes();
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  async loadBgmFromDataUrl(dataUrl: string): Promise<void> {
    await this.ensureContext();
    const match = dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
    if (!match || !match[2]) {
      throw new Error("Invalid BGM data URL.");
    }
    const buffer = this.decodeBase64ToArrayBuffer(match[2]);
    this.bgmBuffer = await this.ctx!.decodeAudioData(buffer.slice(0));
  }

  clearBgm(): void {
    this.bgmBuffer = null;
    this.bgmOffsetSec = 0;
  }

  async loadSeFromRuntimeAssets(runtimeSe: SeSkinAssets | null | undefined): Promise<void> {
    await this.ensureContext();
    this.seBuffers.clear();
    if (!runtimeSe) {
      return;
    }

    const normalBuffer = await this.tryLoadDataUrl(runtimeSe.rhythm.perfect);
    const flickBuffer = await this.tryLoadDataUrl(runtimeSe.rhythm.flick);
    const skillBuffer = await this.tryLoadDataUrl(runtimeSe.tapSkill);
    const directional1Buffer = await this.tryLoadDataUrl(runtimeSe.directional.directionalFL[1]);
    const directional2Buffer = await this.tryLoadDataUrl(runtimeSe.directional.directionalFL[2]);
    const directional3Buffer = await this.tryLoadDataUrl(runtimeSe.directional.directionalFL[3]);
    if (normalBuffer) {
      this.seBuffers.set("normal", normalBuffer);
    }
    if (flickBuffer) {
      this.seBuffers.set("flick", flickBuffer);
    }
    if (skillBuffer) {
      this.seBuffers.set("skill", skillBuffer);
    }
    if (directional1Buffer) {
      this.seBuffers.set("directional_fl_1", directional1Buffer);
    }
    if (directional2Buffer) {
      this.seBuffers.set("directional_fl_2", directional2Buffer);
    }
    if (directional3Buffer) {
      this.seBuffers.set("directional_fl_3", directional3Buffer);
    }
  }

  private async tryLoadDataUrl(dataUrl: string): Promise<AudioBuffer | null> {
    const normalized = dataUrl.trim();
    if (!normalized) {
      return null;
    }

    const existing = this.decodedAudioCache.get(normalized);
    if (existing) {
      return existing;
    }

    try {
      const response = await fetch(normalized);
      if (!response.ok) {
        return null;
      }
      const data = await response.arrayBuffer();
      const buffer = await this.ctx!.decodeAudioData(data.slice(0));
      this.decodedAudioCache.set(normalized, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  playBgm(): void {
    if (!this.ctx || !this.bgmBuffer) {
      return;
    }
    this.stopBgm();
    const source = this.ctx.createBufferSource();
    source.buffer = this.bgmBuffer;
    source.connect(this.bgmGain ?? this.ctx.destination);
    source.start(0, 0);
    this.bgmSource = source;
    this.bgmStartCtxTime = this.ctx.currentTime;
    this.bgmOffsetSec = 0;
  }

  pauseBgm(): void {
    if (!this.ctx || !this.bgmSource || !this.bgmBuffer) {
      return;
    }
    const playedSec = Math.max(0, this.ctx.currentTime - this.bgmStartCtxTime);
    const duration = Math.max(0, this.bgmBuffer.duration);
    this.bgmOffsetSec = Math.max(0, Math.min(duration, this.bgmOffsetSec + playedSec));
    try {
      this.bgmSource.stop();
    } catch {
      // ignored
    }
    this.bgmSource.disconnect();
    this.bgmSource = null;
  }

  resumeBgm(): void {
    if (!this.ctx || !this.bgmBuffer || this.bgmSource) {
      return;
    }
    const duration = Math.max(0, this.bgmBuffer.duration);
    if (duration <= 0) {
      return;
    }
    const offset = Math.max(0, Math.min(duration - 0.001, this.bgmOffsetSec));
    const source = this.ctx.createBufferSource();
    source.buffer = this.bgmBuffer;
    source.connect(this.bgmGain ?? this.ctx.destination);
    source.start(0, offset);
    this.bgmSource = source;
    this.bgmStartCtxTime = this.ctx.currentTime;
    this.bgmOffsetSec = offset;
  }

  stopBgm(): void {
    if (!this.bgmSource) {
      this.bgmOffsetSec = 0;
      return;
    }
    try {
      this.bgmSource.stop();
    } catch {
      // ignored
    }
    this.bgmSource.disconnect();
    this.bgmSource = null;
    this.bgmOffsetSec = 0;
  }

  playSe(note: RuntimeNoteSemantic): void {
    if (!this.ctx) {
      return;
    }
    const kind = resolveSeKind(note);
    const buffer = (kind ? this.seBuffers.get(kind) : null) ?? this.seBuffers.get("normal");
    if (!buffer) {
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.seGain ?? this.ctx.destination);
    source.start();
  }
}

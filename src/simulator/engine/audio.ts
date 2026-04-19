import type { SeSkinAssets } from "../../skinLoader";
import { resolveSeKind, type SeKind } from "./score";
import type { RuntimeNoteSemantic } from "./types";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bgmBuffer: AudioBuffer | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
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

  async ensureContext(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
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
    source.connect(this.ctx.destination);
    source.start();
    this.bgmSource = source;
  }

  stopBgm(): void {
    if (!this.bgmSource) {
      return;
    }
    try {
      this.bgmSource.stop();
    } catch {
      // ignored
    }
    this.bgmSource.disconnect();
    this.bgmSource = null;
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
    source.connect(this.ctx.destination);
    source.start();
  }
}

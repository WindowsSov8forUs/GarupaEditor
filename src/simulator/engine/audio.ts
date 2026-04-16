import type { SeSkinAssets } from "../../skinLoader";

const SE_TYPES: readonly number[] = Object.freeze(
  [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    31, 32, 33, 34, 35, 36, 37, 38, 39,
    51, 52, 53, 54, 55, 56, 57, 58, 59,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 72, 73, 74, 75, 76, 78,
    101, 102, 103, 104, 105, 106, 108, 109,
  ],
);

const FLICK_SE_TYPES = new Set<number>([2, 12, 13, 74, 102, 106]);
const SKILL_SE_TYPES = new Set<number>([11, 31, 32, 33, 34, 35, 36, 75, 76, 108, 109]);
const DIRECTIONAL_FL_1_SE_TYPES = new Set<number>([51, 61]);
const DIRECTIONAL_FL_2_SE_TYPES = new Set<number>([52, 62]);
const DIRECTIONAL_FL_3_SE_TYPES = new Set<number>([53, 54, 55, 56, 57, 58, 59, 63, 64, 65, 66, 67, 68, 69]);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bgmBuffer: AudioBuffer | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private seBuffers = new Map<number, AudioBuffer>();
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

    for (const type of SE_TYPES) {
      let buffer = normalBuffer;
      if (FLICK_SE_TYPES.has(type)) {
        buffer = flickBuffer;
      } else if (SKILL_SE_TYPES.has(type)) {
        buffer = skillBuffer;
      } else if (DIRECTIONAL_FL_1_SE_TYPES.has(type)) {
        buffer = directional1Buffer;
      } else if (DIRECTIONAL_FL_2_SE_TYPES.has(type)) {
        buffer = directional2Buffer;
      } else if (DIRECTIONAL_FL_3_SE_TYPES.has(type)) {
        buffer = directional3Buffer;
      }
      if (buffer) {
        this.seBuffers.set(type, buffer);
      }
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

  playSe(type: number): void {
    if (!this.ctx) {
      return;
    }
    const buffer = this.seBuffers.get(type) ?? this.seBuffers.get(1);
    if (!buffer) {
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start();
  }
}

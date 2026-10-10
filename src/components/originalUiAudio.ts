/** Prepared UI cues share one host audio clock. Cue limits apply to started
 * voices, never to asynchronous media-element loading requests. */
export class OriginalUiAudio {
  private readonly voices = new Map<AudioBufferSourceNode, { type: number; end: number; dispose: () => void }>();
  constructor(private readonly context: BaseAudioContext) {}

  play(type: number, buffer: AudioBuffer, volume: number, limit?: number) {
    const now = this.context.currentTime;
    // ended is delivered on the main thread and can lag behind the audio clock.
    for (const voice of this.voices.values()) if (voice.end <= now) voice.dispose();
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain); gain.connect(this.context.destination);
    const dispose = () => {
      source.onended = null;
      source.disconnect(); gain.disconnect(); this.voices.delete(source);
    };
    try {
      source.start(now);
      if (limit !== undefined) {
        const older = [...this.voices.entries()].filter(([, voice]) => voice.type === type);
        while (older.length >= limit) {
          const [node, voice] = older.shift()!;
          node.stop(now); voice.dispose();
        }
      }
      this.voices.set(source, { type, end: now + buffer.duration, dispose });
      source.onended = dispose;
    } catch (error) { dispose(); throw error; }
  }

  stop() {
    for (const [source, voice] of this.voices) { source.stop(); voice.dispose(); }
  }
}

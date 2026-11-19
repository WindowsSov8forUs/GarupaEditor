let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (value: Float32Array[]) => void; reject: (error: Error) => void }>();
const cache = new WeakMap<AudioBuffer, Map<number, Promise<AudioBuffer>>>();

function stretchOffThread(channels: Float32Array[], sampleRate: number, rate: number): Promise<Float32Array[]> {
  if (!worker) {
    worker = new Worker(new URL("./timeStretch.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; channels?: Float32Array[]; error?: string }>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.channels) request.resolve(event.data.channels);
      else request.reject(new Error(event.data.error ?? "time stretch failed"));
    };
    worker.onerror = event => {
      for (const request of pending.values()) request.reject(new Error(event.message));
      pending.clear(); worker?.terminate(); worker = null;
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try { worker!.postMessage({ id, channels, sampleRate, rate }, channels.map(channel => channel.buffer)); }
    catch (cause) { pending.delete(id); reject(cause instanceof Error ? cause : new Error(String(cause))); }
  });
}

/**
 * `buffer` played `rate` times as fast at its original pitch, as a new buffer for playback at rate 1.
 * Rate 1 returns `buffer` itself. Results are cached per buffer and rate; a failed stretch is not cached.
 */
export function stretchAudioBuffer(context: BaseAudioContext, buffer: AudioBuffer, rate: number): Promise<AudioBuffer> {
  if (rate === 1) return Promise.resolve(buffer);
  let byRate = cache.get(buffer);
  if (!byRate) { byRate = new Map(); cache.set(buffer, byRate); }
  const cached = byRate.get(rate);
  if (cached) return cached;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice());
  const task = stretchOffThread(channels, buffer.sampleRate, rate).then(stretched => {
    const result = context.createBuffer(stretched.length, stretched[0].length, buffer.sampleRate);
    stretched.forEach((channel, index) => result.copyToChannel(channel, index));
    return result;
  });
  byRate.set(rate, task);
  task.catch(() => { if (byRate!.get(rate) === task) byRate!.delete(rate); });
  return task;
}

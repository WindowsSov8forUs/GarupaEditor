/**
 * Pitch-preserving time stretch (WSOLA). `rate` > 1 shortens the audio, < 1 lengthens it; the pitch stays.
 *
 * Frames of ~46 ms are overlap-added with a periodic Hann window at half-frame hops. Each frame is taken
 * near its nominal input position, shifted within a small tolerance to the offset whose start best matches
 * the natural continuation of the previous frame, which keeps waveforms in phase across the joins.
 * The offset search runs on a decimated mono mix and is refined at full rate.
 */
export function stretchChannels(channels: readonly Float32Array[], sampleRate: number, rate: number): Float32Array[] {
  const length = channels[0]?.length ?? 0;
  if (!(rate > 0) || length === 0) throw new Error(`Invalid time stretch: rate=${rate}, length=${length}`);
  const hop = Math.max(64, Math.round(sampleRate * 0.0232));
  const frame = hop * 2;
  const tolerance = Math.max(8, Math.round(hop / 4));
  const decimation = 4;
  const outLength = Math.ceil(length / rate);
  const window = new Float32Array(frame);
  for (let n = 0; n < frame; n++) window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / frame);

  const mono = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
  const coarse = new Float32Array(Math.ceil(length / decimation));
  for (let i = 0; i < coarse.length; i++) {
    let sum = 0;
    const start = i * decimation, end = Math.min(length, start + decimation);
    for (let j = start; j < end; j++) sum += mono[j];
    coarse[i] = sum / (end - start);
  }

  // Normalised cross-correlation of `count` samples of `signal` at `a` (target) and `b` (candidate).
  const similarity = (signal: Float32Array, a: number, b: number, count: number, stride: number) => {
    let cross = 0, energy = 1e-9;
    for (let n = 0; n < count; n += stride) {
      const target = a + n < signal.length ? signal[a + n] : 0;
      const candidate = b + n < signal.length ? signal[b + n] : 0;
      cross += target * candidate; energy += candidate * candidate;
    }
    return cross / Math.sqrt(energy);
  };

  const output = channels.map(() => new Float32Array(outLength));
  const lastStart = Math.max(0, length - frame);
  let previous = 0;
  for (let k = 0; k * hop < outLength; k++) {
    const nominal = Math.round(k * hop * rate);
    let position = Math.min(nominal, lastStart);
    if (k > 0) {
      const natural = previous + hop;
      const low = Math.max(0, nominal - tolerance), high = Math.min(lastStart, nominal + tolerance);
      if (low <= high) {
        let best = Math.round(low / decimation), bestScore = -Infinity;
        const coarseNatural = Math.round(natural / decimation), coarseCount = Math.round(hop / decimation);
        for (let c = Math.ceil(low / decimation); c * decimation <= high; c++) {
          const score = similarity(coarse, coarseNatural, c, coarseCount, 2);
          if (score > bestScore) { bestScore = score; best = c; }
        }
        let fine = Math.min(high, Math.max(low, best * decimation)), fineScore = -Infinity;
        const from = Math.max(low, best * decimation - decimation), to = Math.min(high, best * decimation + decimation);
        for (let p = from; p <= to; p++) {
          const score = similarity(mono, natural, p, hop, 2);
          if (score > fineScore) { fineScore = score; fine = p; }
        }
        position = fine;
      }
    }
    previous = position;
    const target = k * hop;
    for (let c = 0; c < channels.length; c++) {
      const input = channels[c], out = output[c];
      for (let n = 0; n < frame; n++) {
        const o = target + n, i = position + n;
        if (o >= outLength) break;
        if (i >= length) break;
        // The first frame has nothing before it to overlap with, so it starts at full gain.
        out[o] += input[i] * (k === 0 && n < hop ? 1 : window[n]);
      }
    }
  }
  return output;
}

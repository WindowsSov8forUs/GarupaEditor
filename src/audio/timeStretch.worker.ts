import { stretchChannels } from "./timeStretch";

const scope = self as unknown as {
  onmessage: (event: MessageEvent<{ id: number; channels: Float32Array[]; sampleRate: number; rate: number }>) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const channels = stretchChannels(data.channels, data.sampleRate, data.rate);
    scope.postMessage({ id: data.id, channels }, channels.map(channel => channel.buffer));
  } catch (cause) {
    scope.postMessage({ id: data.id, error: String(cause) });
  }
};

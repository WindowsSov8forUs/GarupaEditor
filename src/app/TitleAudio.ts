import cueUrl from "../assets/game/title/title-start.wav?url";
import { loadEditorSettingsCache } from "./editorSettingsCache";
import { DEFAULT_SIMULATOR_MENU_SETTINGS } from "./simulator/menuSettings";

/** Bundled title cue is ready before input, independently of resource bootstrap. */
export class TitleAudio {
  private readonly context = new AudioContext({ latencyHint: "interactive" });
  private buffer: AudioBuffer | null = null;
  private gain = 0;
  private disposed = false;
  private playing = false;
  async prepare() {
    const [buffer, json] = await Promise.all([
      fetch(cueUrl).then(response => {
        if (!response.ok) throw new Error(`Title SE: ${response.status}`);
        return response.arrayBuffer();
      }).then(bytes => this.context.decodeAudioData(bytes)),
      loadEditorSettingsCache(),
    ]);
    const settings = json ? JSON.parse(json)?.appOptionSettings?.simulatorSettings : null;
    const percent = (key: "masterVolumePercent" | "systemSeVolumePercent") => {
      const value = settings?.[key] ?? DEFAULT_SIMULATOR_MENU_SETTINGS[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new Error(`Invalid ${key}`);
      return value / 100;
    };
    this.buffer = buffer;
    this.gain = percent("masterVolumePercent") * percent("systemSeVolumePercent");
  }
  async play() {
    if (this.disposed || !this.buffer || this.playing) return;
    await this.context.resume();
    if (this.disposed) return;
    const source = this.context.createBufferSource(), gain = this.context.createGain();
    source.buffer = this.buffer; gain.gain.value = this.gain;
    source.connect(gain); gain.connect(this.context.destination);
    source.onended = () => {
      source.disconnect(); gain.disconnect(); this.playing = false;
      if (this.disposed) void this.context.close();
    };
    source.start(); this.playing = true;
  }
  dispose() {
    this.disposed = true;
    // The cue outlasts the transition; allow a started voice to finish.
    if (!this.playing) void this.context.close();
  }
}

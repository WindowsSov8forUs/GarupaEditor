import type { SimulatorModeIdentity } from "../data/inGameCalculatedData";
import { evidenceRequired, ok, type SimulatorResult } from "../evidence";
import type {
  AudioCommandProducer,
  AudioOwnerTransaction,
} from "./audioCommandProducer";
export type StartupAudioPurpose = "initial" | "retry" | "move-time-reconstruction";

export type StartupAudioOwnerPhase =
  | "created"
  | "opening"
  | "playing"
  | "faulted"
  | "disposed";

export type StartupAudioTimelineEvent =
  | "bgm.prepare-paused"
  | "gaya.start"
  | "live-voice.start"
  | "live-voice.release"
  | "gaya.fade-stop-at-zero"
  | "gaya.fade-null-safe"
  | "bgm.resume"
  | "move-time.bgm.prepare-paused"
  | "move-time.bgm.resume";

export interface StartupAudioOwnerSnapshot {
  readonly purpose: StartupAudioPurpose;
  readonly phase: StartupAudioOwnerPhase;
  readonly gayaRequired: boolean;
  readonly liveVoiceRequired: boolean;
  readonly timeline: readonly StartupAudioTimelineEvent[];
}

export class StartupAudioTransition {
  private state: "pending" | "committed" | "discarded" = "pending";

  constructor(
    private readonly transaction: AudioOwnerTransaction,
    private readonly onCommit: () => void,
    private readonly onFault: () => void,
  ) {}

  commit(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return rejected(
        "startup-audio.repeated-transition-commit",
        `A startup audio transition cannot commit from ${this.state}.`,
      );
    }
    const committed = this.transaction.commit();
    if (committed.status !== "ok") {
      this.onFault();
      return committed;
    }
    this.state = "committed";
    this.onCommit();
    return ok(undefined);
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") {
      return rejected(
        "startup-audio.repeated-transition-discard",
        `A startup audio transition cannot discard from ${this.state}.`,
      );
    }
    const discarded = this.transaction.discard();
    if (discarded.status === "ok") this.state = "discarded";
    return discarded;
  }
}

export class StartupAudioOwner {
  private phaseValue: StartupAudioOwnerPhase = "created";
  private readonly timeline: StartupAudioTimelineEvent[] = [];
  private readonly gayaRequired: boolean;
  private readonly liveVoiceRequired: boolean;

  constructor(
    mode: SimulatorModeIdentity,
    private readonly purpose: StartupAudioPurpose,
    private readonly producer: AudioCommandProducer,
    private readonly liveStartVoiceCue: string | null,
    mvLive = false,
  ) {
    this.gayaRequired = purpose !== "move-time-reconstruction" &&
      mode.sessionMode === "live" && !mvLive;
    this.liveVoiceRequired = purpose !== "move-time-reconstruction" &&
      mode.sessionMode === "live" && liveStartVoiceCue !== null;
  }

  initialize(): SimulatorResult<void> {
    if (this.phaseValue !== "created") {
      return rejected(
        "startup-audio.initialize-outside-created",
        `Startup audio initialization is available only from created, not ${this.phaseValue}.`,
      );
    }
    const planned = this.purpose === "move-time-reconstruction"
      ? this.producer.preflightMoveTimeReconstructionBgm()
      : this.producer.preflightStartupOpening(
          this.gayaRequired,
          this.liveVoiceRequired ? this.liveStartVoiceCue : null,
        );
    if (planned.status !== "ok") {
      this.phaseValue = "faulted";
      return planned;
    }
    const committed = planned.value.commit();
    if (committed.status !== "ok") {
      this.phaseValue = "faulted";
      return committed;
    }
    if (this.purpose === "move-time-reconstruction") {
      this.timeline.push("move-time.bgm.prepare-paused", "move-time.bgm.resume");
      this.phaseValue = "playing";
      return ok(undefined);
    }
    this.timeline.push("bgm.prepare-paused");
    if (this.gayaRequired) this.timeline.push("gaya.start");
    if (this.liveVoiceRequired) this.timeline.push("live-voice.start");
    this.phaseValue = "opening";
    return ok(undefined);
  }

  isLiveStartVoicePlaying(): SimulatorResult<boolean> {
    if (!this.liveVoiceRequired) return ok(false);
    if (this.phaseValue !== "opening") {
      return rejected(
        "startup-audio.voice-observe-outside-opening",
        "The optional Live-start voice ended-state is observed only while the opening owner is active.",
      );
    }
    return this.producer.isLiveStartVoicePlaying();
  }

  releaseFinishedLiveStartVoice(): SimulatorResult<void> {
    if (!this.liveVoiceRequired || this.liveStartVoiceCue === null ||
      this.phaseValue !== "opening" || !this.timeline.includes("live-voice.start") ||
      this.timeline.includes("live-voice.release")) {
      return rejected(
        "startup-audio.invalid-live-voice-release",
        "Live-start voice release occurs exactly once after the prepared Live voice reports ended.",
      );
    }
    const planned = this.producer.preflightReleaseLiveStartVoice(this.liveStartVoiceCue);
    if (planned.status !== "ok") {
      this.phaseValue = "faulted";
      return planned;
    }
    const committed = planned.value.commit();
    if (committed.status !== "ok") {
      this.phaseValue = "faulted";
      return committed;
    }
    this.timeline.push("live-voice.release");
    return ok(undefined);
  }

  preflightEnterPlaying(): SimulatorResult<StartupAudioTransition> {
    if (this.phaseValue !== "opening") {
      return rejected(
        "startup-audio.enter-playing-outside-opening",
        `Playing publication requires one prepared opening owner, not ${this.phaseValue}.`,
      );
    }
    const planned = this.producer.preflightEnterStartupPlaying(this.gayaRequired);
    if (planned.status !== "ok") {
      this.phaseValue = "faulted";
      return planned;
    }
    return ok(new StartupAudioTransition(
      planned.value,
      () => {
        this.timeline.push(this.gayaRequired
          ? "gaya.fade-stop-at-zero"
          : "gaya.fade-null-safe");
        this.timeline.push("bgm.resume");
        this.phaseValue = "playing";
      },
      () => { this.phaseValue = "faulted"; },
    ));
  }

  snapshot(): StartupAudioOwnerSnapshot {
    return Object.freeze({
      purpose: this.purpose,
      phase: this.phaseValue,
      gayaRequired: this.gayaRequired,
      liveVoiceRequired: this.liveVoiceRequired,
      timeline: Object.freeze([...this.timeline]),
    });
  }

  dispose(): void {
    if (this.phaseValue === "disposed") return;
    this.phaseValue = "disposed";
  }
}

function rejected(capability: string, boundary: string) {
  return evidenceRequired(
    capability,
    ["SRA-CG01", "SRA-R01", "SD09"],
    boundary,
  );
}

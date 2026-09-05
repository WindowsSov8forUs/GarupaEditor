import { integrityFailure, ok, type SimulatorResult } from "../evidence";

export interface FrameMutationParticipant {
  readonly identity: string;
  /** Potentially failing portable/physical backend publication. */
  readonly commitExternal?: () => SimulatorResult<void>;
  /** Simulator-owned publication; exact preflight makes this structurally no-fail. */
  readonly publishOwner: () => SimulatorResult<void>;
  /** Releases one still-detached capability before owner publication. */
  readonly discard: () => SimulatorResult<void>;
}

export interface FrameMutationPlanSnapshot {
  readonly state: "pending" | "committed" | "discarded" | "faulted";
  readonly externalOrder: readonly string[];
  readonly ownerOrder: readonly string[];
  readonly committedExternal: readonly string[];
  readonly publishedOwners: readonly string[];
}

/**
 * One bounded semantic frame/substep. All parsing/allocation/backend preflight
 * has already succeeded when this plan is created. External backends publish
 * first; only after all of them succeed do Simulator-owned states publish in
 * original semantic order. Physical audio/context effects are explicitly not
 * rollbackable, but can never leave score/OneFrame/particle/HUD owners partial.
 */
export class FrameMutationPlan {
  private state: FrameMutationPlanSnapshot["state"] = "pending";
  private readonly byIdentity: ReadonlyMap<string, FrameMutationParticipant>;
  private readonly committedExternal: string[] = [];
  private readonly publishedOwners: string[] = [];

  private constructor(
    participants: readonly FrameMutationParticipant[],
    private readonly externalOrder: readonly string[],
    private readonly ownerOrder: readonly string[],
  ) {
    this.byIdentity = new Map(participants.map((participant) => [participant.identity, participant]));
  }

  static create(
    participants: readonly FrameMutationParticipant[],
    externalOrder: readonly string[],
    ownerOrder: readonly string[],
  ): SimulatorResult<FrameMutationPlan> {
    if (!Array.isArray(participants) || participants.length === 0 ||
      participants.some((participant) => participant === null || typeof participant !== "object" ||
        typeof participant.identity !== "string" || participant.identity.length === 0 ||
        typeof participant.publishOwner !== "function" || typeof participant.discard !== "function" ||
        (participant.commitExternal !== undefined && typeof participant.commitExternal !== "function"))) {
      return rejected("frame-plan.invalid-participant", "Frame mutation participants require stable identities and explicit publish/discard capabilities.");
    }
    const identities = participants.map((participant) => participant.identity);
    const known = new Set(identities);
    if (known.size !== identities.length || new Set(externalOrder).size !== externalOrder.length ||
      new Set(ownerOrder).size !== ownerOrder.length ||
      externalOrder.some((identity) => !known.has(identity) ||
        participants.find((participant) => participant.identity === identity)?.commitExternal === undefined) ||
      ownerOrder.length !== identities.length || ownerOrder.some((identity) => !known.has(identity))) {
      return rejected(
        "frame-plan.invalid-order",
        "A frame plan requires unique participants, one exact external subset and one complete owner publication order.",
      );
    }
    return ok(new FrameMutationPlan(
      Object.freeze([...participants]),
      Object.freeze([...externalOrder]),
      Object.freeze([...ownerOrder]),
    ));
  }

  commit(): SimulatorResult<void> {
    if (this.state !== "pending") return repeated("commit", this.state);
    for (const identity of this.externalOrder) {
      const committed = this.byIdentity.get(identity)!.commitExternal!();
      if (committed.status !== "ok") {
        this.state = "faulted";
        this.discardStillDetached();
        return integrityFailure(
          committed.capability,
          committed.requiredEvidence,
          this.committedExternal.length === 0
            ? committed.boundary
            : `${committed.boundary} Earlier external publications are non-rollbackable (${this.committedExternal.join(",")}); no Simulator-owned participant published.`,
        );
      }
      this.committedExternal.push(identity);
    }
    for (const identity of this.ownerOrder) {
      const published = this.byIdentity.get(identity)!.publishOwner();
      if (published.status !== "ok") {
        this.state = "faulted";
        return integrityFailure(
          "frame-plan.owner-publication-invariant",
          published.requiredEvidence,
          `Exact preflight survived every external commit, so owner publication ${identity} must be structurally no-fail. ${published.capability}: ${published.boundary}`,
        );
      }
      this.publishedOwners.push(identity);
    }
    this.state = "committed";
    return ok(undefined);
  }

  discard(): SimulatorResult<void> {
    if (this.state !== "pending") return repeated("discard", this.state);
    const failure = this.discardStillDetached();
    this.state = failure === null ? "discarded" : "faulted";
    return failure ?? ok(undefined);
  }

  snapshot(): FrameMutationPlanSnapshot {
    return Object.freeze({
      state: this.state,
      externalOrder: this.externalOrder,
      ownerOrder: this.ownerOrder,
      committedExternal: Object.freeze([...this.committedExternal]),
      publishedOwners: Object.freeze([...this.publishedOwners]),
    });
  }

  private discardStillDetached(): ReturnType<typeof integrityFailure> | null {
    const external = new Set(this.committedExternal);
    let first: ReturnType<typeof integrityFailure> | null = null;
    for (const identity of [...this.ownerOrder].reverse()) {
      if (external.has(identity)) continue;
      const discarded = this.byIdentity.get(identity)!.discard();
      if (discarded.status === "ok") continue;
      first ??= integrityFailure(
        discarded.capability,
        discarded.requiredEvidence,
        discarded.boundary,
      );
    }
    return first;
  }
}

function repeated(action: string, state: string): SimulatorResult<never> {
  return rejected("frame-plan.repeated-transition", `Frame mutation ${action} cannot run from ${state}.`);
}
function rejected<T = never>(capability: string, boundary: string): SimulatorResult<T> {
  return integrityFailure(capability, [], boundary);
}

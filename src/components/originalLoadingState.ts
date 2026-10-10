export type OriginalLoadingKind = "network" | "transmitting";
export interface OriginalLoadingScreen { generation: number; progress?: number }
export interface OriginalLoadingLease { progress(value: number): void; release(): void }

/** ScreenManager's two independent, owner-deduplicated screen layers. */
export class OriginalLoadingState {
  private readonly owners = { network: new Map<object, OriginalLoadingLease>(), transmitting: new Map<object, OriginalLoadingLease>() };
  private readonly listeners = new Set<() => void>();
  private readonly progressOwners = { network: new Map<object, number>(), transmitting: new Map<object, number>() };
  private generation = 0;
  private snapshot: Readonly<Partial<Record<OriginalLoadingKind, OriginalLoadingScreen>>> = {};
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(kind: OriginalLoadingKind, screen: OriginalLoadingScreen | undefined) {
    this.snapshot = { ...this.snapshot, [kind]: screen };
    this.listeners.forEach(listener => listener());
  }
  hold(kind: OriginalLoadingKind, owner: object): OriginalLoadingLease {
    const owners = this.owners[kind], existing = owners.get(owner);
    if (existing) return existing;
    const lease: OriginalLoadingLease = {
      progress: value => {
        const screen = this.snapshot[kind];
        if (owners.get(owner) !== lease || !screen || !Number.isFinite(value)) return;
        const progress = Math.min(1, Math.max(0, value));
        this.progressOwners[kind].delete(owner);
        this.progressOwners[kind].set(owner, progress);
        if (screen.progress !== progress) this.publish(kind, { ...screen, progress });
      },
      release: () => {
        if (owners.get(owner) !== lease) return;
        owners.delete(owner);
        this.progressOwners[kind].delete(owner);
        if (!owners.size) this.publish(kind, undefined);
        else {
          const screen = this.snapshot[kind]!;
          const values = [...this.progressOwners[kind].values()];
          const progress = values[values.length - 1];
          if (screen.progress !== progress) this.publish(kind, { ...screen, progress });
        }
      },
    };
    owners.set(owner, lease);
    if (!this.snapshot[kind]) this.publish(kind, { generation: ++this.generation });
    return lease;
  }
}

export const originalLoading = new OriginalLoadingState();

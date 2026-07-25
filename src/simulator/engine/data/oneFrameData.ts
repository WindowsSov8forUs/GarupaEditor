import type { EvidenceBound } from "../evidence";

export interface OneFrameDataPoolProfile {
  readonly capacity: EvidenceBound<number>;
}

export interface OneFrameDataHandle {
  readonly containerId: string;
}

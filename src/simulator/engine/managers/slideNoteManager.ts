import { ok, type SimulatorResult } from "../evidence";

export class SlideNoteManager {
  private initialized = false;

  initialize(): SimulatorResult<void> {
    this.initialized = true;
    return ok(undefined);
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
}

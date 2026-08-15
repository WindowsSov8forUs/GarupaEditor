import { createSimulatorModeIdentity } from "../engine/data/inGameCalculatedData";

export const LIVE_MANUAL_MODE = createSimulatorModeIdentity("live", "manual");
export const LIVE_AUTO_MODE = createSimulatorModeIdentity("live", "auto");
export const REHEARSAL_MANUAL_MODE = createSimulatorModeIdentity("rehearsal", "manual");
export const REHEARSAL_AUTO_MODE = createSimulatorModeIdentity("rehearsal", "auto");

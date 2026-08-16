# Shared chart formats

`src/chart` owns application-wide serialized chart schemas and pure format conversion utilities.

- `garupa.ts`: canonical Garupa chart JSON schema.
- `bestdori-v2.ts`: canonical Bestdori V2 chart JSON schema used by import/export flows.
- `conversion.ts`: parsing, optional BPM-zero normalization, and Garupa ↔ Bestdori V2 conversion.
- `index.ts`: the public module surface.

This module must stay independent from React, Tauri, simulator runtime types, skin resources, and editor controller state. `src/chartCore.ts` retains the editor's internal `ChartNote` model and editor/display-oriented operations; serialized format types do not belong there.

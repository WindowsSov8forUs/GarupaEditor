# Shared chart formats

`src/chart` owns application-wide serialized chart schemas and pure format conversion utilities.

- `garupa.ts`: canonical Garupa chart JSON schema.
- `bestdori-v2.ts`: canonical Bestdori V2 chart JSON schema used by import/export flows.
- `conversion.ts`: parsing, optional BPM-zero normalization, and Garupa ↔ Bestdori V2 conversion. Canonical optional `timingGroup` fields are omitted when absent/Global rather than emitted as own `undefined` properties; BPM-zero normalization preserves Slide owner groups.
- `index.ts`: the public module surface.

This module must stay independent from React, Tauri, simulator runtime types, skin resources, and editor controller state. `src/chartCore.ts` retains the editor's internal `ChartNote` model and editor/display-oriented operations; serialized format types do not belong there.

Chart metadata no longer embeds Data URLs or remote URLs. BGM, cover, MV and stage backdrop are main-program `ResourceRef` values persisted separately in `chart-resources.v5.json`; portable Garupa/Bestdori chart schemas remain resource-independent. User and provider-downloaded chart media belong to the recoverable current-session workspace, while Builtin/default Skin refs remain application resources. The one-time v2/v3/v4 migration adopts provable bytes/refs into workspace records; an ambiguous identity leaves that migration action unavailable while preserving durable data and never substitutes a default.

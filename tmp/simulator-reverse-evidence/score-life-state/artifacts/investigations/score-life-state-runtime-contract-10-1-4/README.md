# Score, Life, and State Runtime Contract — 10.1.4

This investigation re-establishes the score, Life, Skill, Fever, OneFrame, and related lifecycle surface for `jp.co.craftegg.band` 10.1.4 / code 230 / `arm64-v8a`.

## Evidence boundary

- Locked `libil2cpp.so` SHA-256: `815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F`.
- Locked `global-metadata.dat` SHA-256: `298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F`.
- All target methods are resolved independently by managed owner, method, and exact baseline signature. No fixed RVA delta is used.
- Every method range ends at the global next managed entry and has an independent byte-preserving ARM64 TSV.
- The extractor and verifier read only committed sample files. They do not consume IDA databases or untracked runtime tooling.
- Historical 10.1.3 artifacts are migration questions only. Current conclusions are backed by 10.1.4 ELF, metadata-derived dumps, and current ARM64 slices.

## Static result

`static_closure.json` closes the version rebaseline only:

- methods: `326 mapped`, `0 unknown`;
- layouts: `25 unchanged`, `0 unknown`;
- enums: `19 unchanged`, `0 unknown`;
- `version_rebaseline=closed`;
- `business_state_gate=open`;
- production authorization: `false`.

`score_life_state_static_findings.json` records the current direct conclusions, including:

- complete `OneFrameData` and `OneFrameTotalData` ABI;
- five-slot Reflect order, early `isUsing` clear, representative tie behavior, and two-stage toward-zero score conversion;
- result and standard Combo correction tables with exact Float32 bits;
- base-score Float32 operation order;
- Life fields at `+0x20`, `+0x24`, and `+0x28`, `[0, +0x28]` clamp, immortality suppression, and Game Over call point;
- the structural explanation for historical `1500/1000` without promoting that 10.1.3 observation;
- damage mapping, Never Die equality and Life `5`, fixed/rate once-heal formula, Skill `0.75f` finishing timer, Fever `2.0f`, and record counters.

These static conclusions do **not** authorize implementation. D18–D24, production BMS/master provenance, R1 traces, and BS01–BS36 remain required before code.

## Files

- `extract_score_life_state_contract.py`: deterministic 10.1.3-to-10.1.4 managed mapping and ARM64 exporter.
- `score_life_state_static_contract.json`: method, layout, enum, constant, and binary identity contract.
- `score_life_state_static_findings.json`: audited static semantic conclusions and explicit runtime blockers.
- `targets.tsv`: compact method-range index.
- `arm64/*.arm64.tsv`: one current ELF range per mapped managed method.
- `verify_score_life_state_static.py`: fail-closed verifier against the locked ELF, metadata identity, metadata-derived dump, TSV bytes, layouts, enums, rodata, and critical instruction fragments.
- `static_closure.json`: B01-only gate state.
- `SHA256SUMS`: complete hashes for the static investigation files except the checksum file itself.

## Reproduce static extraction

From the Reverse repository root on Windows:

```powershell
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/extract_score_life_state_contract.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_state_static.py
```

Expected verifier summary:

```text
verified score/life/state static contract: methods=326 layouts=25 enums=19 version_rebaseline=closed business_state_gate=open
```

The verifier fails closed for a sample hash mismatch, ambiguous or changed managed mapping, non-global method boundary, ELF/TSV byte difference, stale ARM64 slice, layout/enum/constant difference, rodata difference, missing critical instruction, or incorrectly closed business gate.

## Runtime boundary

No stage-5 runtime trace is included or claimed by this B01 package. R1 plans, capture code, raw traces, runtime verifier, master/BMS provenance, BS01–BS36, and final `closure.json` belong to B02. `business_state_gate` remains open instead of substituting static inference or a synthetic trace.

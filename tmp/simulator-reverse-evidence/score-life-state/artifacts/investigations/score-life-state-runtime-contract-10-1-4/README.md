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

These static conclusions do **not** authorize implementation. D18–D24, master/start-data provenance, R1 traces, and BS01–BS36 remain required before code. The subsequent R0 input batch locks two production BMS files but does not close D23 as a whole.

## Files

- `extract_score_life_state_contract.py`: deterministic 10.1.3-to-10.1.4 managed mapping and ARM64 exporter.
- `score_life_state_static_contract.json`: method, layout, enum, constant, and binary identity contract.
- `score_life_state_static_findings.json`: audited static semantic conclusions and explicit runtime blockers.
- `targets.tsv`: compact method-range index.
- `arm64/*.arm64.tsv`: one current ELF range per mapped managed method.
- `verify_score_life_state_static.py`: fail-closed verifier against the locked ELF, metadata identity, metadata-derived dump, TSV bytes, layouts, enums, rodata, and critical instruction fragments.
- `static_closure.json`: B01-only gate state.
- `capture_score_life_state_runtime.py`: observation-only R1 hook harness with 50 statically verified targets.
- `capture_score_life_state_multitouch_runtime.py`: independently versioned copy of the same 50 hooks; it hash-checks, pushes, executes and deletes the committed native seven-slot control while preserving old trace script hashes.
- `extract_score_life_runtime_input_provenance.py`: protobuf cache-record and BMS provenance extractor.
- `verify_score_life_runtime_inputs.py`: fail-closed R0 input/capture-target verifier.
- `verify_score_life_no_input_r1.py`: fail-closed verifier for the compressed no-input Life/Game Over R1 trace and committed capture plans.
- `verify_score_life_positive_r1.py`: fail-closed verifier for the positive Perfect/Score R1 trace and its explicit unconsumed ABI fields.
- `verify_score_life_multitouch_plan.py`: fail-closed verifier for hook identity, superseded shell control, native plan, ARM64 ELF/build provenance and SELinux restoration boundary.
- `verify_score_life_skill_r1.py`: fail-closed verifier for the active-Skill lifecycle, same-frame frozen rates, once-heal and final record trace.
- `verify_score_life_retry_lifecycle_plan.py`: fail-closed verifier for the pending non-destructive post-Game-Over Retry/reset plan.
- `runtime-inputs/bms/`: ordinary and HABAHIRO TextAssets extracted from connected-device 10.1.4 cache bundles.
- `runtime-inputs/cache-index/`: byte-preserving `AssetBundleInfo` records and structured cache provenance; account identifiers are omitted.
- `runtime_input_status.json`: D18/D22/D23 partial state and remaining runtime blockers.
- `runtime/no-input-retry-plan.json`: UI-only Retry plan from an already visible Live Failed dialog.
- `runtime/no-input-retry-life-gameover.trace.json.gz`: successful observation-only R1 trace with 1,863 contiguous events.
- `runtime/positive-retry-all-lanes-r1-plan.json`: superseded 7-second control plan, derived from the committed manual-stage seven-lane sequence; no trace from it is promoted.
- `runtime/positive-retry-all-lanes-early-r1-plan.json`: executed v2 positive judgement plan; only the pre-input wait is reduced from 7,000ms to 500ms and all 217 lane/hold controls remain unchanged.
- `runtime/positive-retry-all-lanes-early.trace.json.gz`: successful observation-only R1 trace with 2,166 contiguous events, one Perfect and reflected Score 1,404; active Skill was not observed.
- `runtime/multitouch-seven-lane-skill-r1-plan.json`: aborted shell-sendevent control; it exceeded the time bound, produced no trace and is retained only as provenance.
- `runtime/multitouch-seven-lane-native-skill-r1-plan.json`: executed native 20-second seven-lane plan (`250 × 80ms`).
- `runtime/multitouch-seven-lane-native-skill.trace.json.gz`: successful 7,122-event R1 trace covering active Skill and same-frame entry freezing.
- `runtime/multitouch-seven-lane-post-gameover-retry-r1-plan.json`: pending v3 plan preserving the native run, then observing 12 seconds after Game Over before a Retry-only reset sequence; Continue is forbidden.
- `runtime-control/multitouch_seven_lane_control.c`: fixed input-device-only control source.
- `runtime-control/multitouch_seven_lane_control.arm64`: 6,304-byte stripped ELF64 AArch64 PIE, SHA-256 `AB39066A...9C249`.
- `runtime-control/multitouch_seven_lane_control.build.json`: NDK 27.2 / Android 24 deterministic build and capability record.
- `SHA256SUMS`: complete hashes for all investigation files except the checksum file itself.

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

## Runtime input status

The R0 input batch directly pulled the app-owned external cache index and the two referenced Unity bundles from the connected 10.1.4 installation. Only the two resource-index records and extracted TextAssets are retained:

- ordinary `poppin_shuffle_special`: `418DB7F5BFC6B5431AC0ABF2FB905120BDFA8C778C35AA42418A6FA43F4094DC`;
- HABAHIRO `786_miracle_april_habahiro_special`: `43148090C40ABBD951E8D7112200BDAE9B796A8A531A0793169E0AD70C3DC159`.

Run:

```powershell
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_runtime_inputs.py
```

The R0 verifier continues to validate the device cache, both BMS inputs and all 50 observation-only hook targets. Verify both independent compressed R1 traces with:

```powershell
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_no_input_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_positive_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_skill_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_retry_lifecycle_plan.py
```

The trace was captured through an explicit non-default loopback server forwarded by ADB, using `--device-address 127.0.0.1:47913`; the transport is embedded in the trace capability record. This changes only the Frida connection path and does not alter the observation agent or game state.

The no-input retry trace directly fixes stable `InGameRecord` identity, Life initialization `1000/1000/2000`, 11 Miss projections, slot-order Life mutation to zero, inactive Skill state, and the nested single-player Game Over transition. The v2 trace additionally fixes one real-touch Perfect entry (`addScore` bits `0x44AF8052`), raw/adjusted result 4, identity Fever/Skill/ScoreUp rates, Combo/Perfect counters, reflected integer Score 1,404, ten Misses and Game Over with the score retained. Active Skill remained absent for all 220 manager updates, so D20 and active-Skill D18 remain open.

Five raw fields are explicitly not consumed: float-return hooks read generic `x0` rather than ARM64 `s0`, and two trailing `judgeFrontNote` parameters lack an independently closed hook ABI. The raw bytes are retained, but `verify_score_life_positive_r1.py` never uses those values.

The first Linux MT shell control was aborted after exceeding its execution time bound; no output trace was produced, no result is promoted, and SELinux was independently restored to Enforcing. Its replacement is a committed 6,304-byte ARM64 helper that writes only `struct input_event` records to `event2` and uses `nanosleep` for 20ms press/60ms release timing. The capture script verified the helper SHA before push, bracketed execution with temporary SELinux Permissive, restored Enforcing in `finally`, and deleted the device copy.

The resulting 7,122-event trace observes Skill Add→Begin→Playing→Finishing→None (`0→1→2→3→0`), 5.0s effective timer, 0.75s finishing timer, and fixed once-heal `800 + 300 = 1100` while the displayed base remains 1000 and the business upper limit 2000. Two entries created after Skill enqueue but before Begin froze rate 1.0 and were Reflect-consumed after state became Playing; 18 later entries froze rate 1.2/ScoreUpType1, and the first post-finish entry returned to 1.0. This partially closes D18, D14 and the Skill start/end part of D20.

The pending v3 plan changes no part of the committed native run. It adds a 12-second observation window after the previously observed Game Over, then only the same Retry and confirmation coordinates followed by reset observation. Its safety object forbids Continue and premium-currency actions. It is plan/tooling only and closes no D22 scope until a complete trace is independently verified. Fever transitions, multiple/overlapping Skill, guard/Never Die, remaining lifecycle, deck/start-data/master rows, BS01–BS36 and final `closure.json` remain open. The five ABI-unsafe fields stay unconsumed. The business gate remains open and no trace authorizes production implementation.

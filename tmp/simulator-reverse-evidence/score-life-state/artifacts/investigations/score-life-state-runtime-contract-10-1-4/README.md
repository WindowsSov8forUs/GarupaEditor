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
- production authorization: `false`;
- `BS01–BS36` partial oracle: 4 confirmed, 24 partial, 8 blocked; `unknown_fields=126`, `blocking_findings=82`.
- production chart count oracle: ordinary `979`, HABAHIRO `731`, independently derived from committed chart-structure facts under the 10.1.4 `NoteManager.analyzeBMS` ARM64 rule.

`score_life_state_static_findings.json` records the current direct conclusions, including:

- complete `OneFrameData` and `OneFrameTotalData` ABI;
- five-slot Reflect order, early `isUsing` clear, representative tie behavior, and two-stage toward-zero score conversion;
- result and standard Combo correction tables with exact Float32 bits;
- base-score Float32 operation order;
- Life fields at `+0x20`, `+0x24`, and `+0x28`, `[0, +0x28]` clamp, immortality suppression, and Game Over call point;
- the structural explanation for historical `1500/1000` without promoting that 10.1.3 observation;
- damage mapping, Never Die equality and Life `5`, fixed/rate once-heal formula, Skill `0.75f` finishing timer, Fever `2.0f`, and record counters.

These static conclusions and the partial BS01–BS36 oracle do **not** authorize implementation. D18–D24, master/start-data provenance, and every oracle case with unknown fields or blocking findings remain required before code. The subsequent R0 input batch locks two production BMS files but does not close D23 as a whole.

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
- `capture_score_life_state_initialization_profile.py`: privacy-minimized observation-only R1 collector for start-data, calculated-data, ScoreUtility static Float32 fields and Life/max-note initialization; account and deck element contents are omitted.
- `capture_score_life_deck_aggregate_profile.py`: observation-only collector for the final three cross-member Float32 accumulators and total returned by `calcTotalParameter`; member pointers, member rows and account fields are omitted.
- `verify_score_life_initialization_profile_plan.py`: pre-execution verifier for six locked ARM64 observation points, exact Retry actions, explicit transport, Enforcing precondition, privacy omissions and the no-write/no-replacement boundary.
- `verify_score_life_deck_aggregate_profile_plan.py`: pre-execution verifier for the `calcTotalParameter` entry/final-aggregate/result instruction points and the stricter no-member-row privacy projection.
- `build_score_life_initialization_profile_oracle.py`: deterministic privacy-minimized projection of the committed ordinary production initialization trace.
- `score_life_initialization_profile_oracle.json`: observed `poppin_shuffle_special` start/calculated/Life/ScoreUtility identity and exact Float32 initialization values with remaining D23 gaps.
- `verify_score_life_initialization_profile_r1.py`: independent trace/hash/order/privacy verifier with a separate Float32 recomputation of score-level rate and base score.
- `build_score_life_deck_aggregate_profile_oracle.py` and `score_life_deck_aggregate_profile_oracle.json`: deterministic projection of two identical five-member aggregate invocations without member-row disclosure.
- `verify_score_life_deck_aggregate_profile_r1.py`: independent gzip/hash/order/privacy verifier and Float32 recomputation of the final component addition order.
- `extract_score_life_master_music_profile_static.py` and `master-profile-static/`: minimal 10.1.4 ARM64/dump slices for four MasterDataManager list/get methods, `MusicData.GetPlayLevel/GetScoreLevel`, the Free Live start-data caller, four layouts and five direct accessors.
- `capture_score_life_master_music_profile.py`: observation-only natural-UI collector that filters only music ID 786 and omits title, account, room, deck and every non-target master row.
- `verify_score_life_master_music_profile_plan.py`: pre-execution verifier for the frozen RVAs/layouts/accessors, no managed invocation/write/replacement, exact UI actions and privacy projection.
- `build_score_life_master_music_profile_oracle.py` and `score_life_master_music_786_profile_oracle.json`: target-only projection of music 786 availability, five difficulty rows and the Free Live score-level fallback.
- `verify_score_life_master_music_profile_r1.py`: independent gzip/hash/order/privacy verifier for exact master values and the `GetScoreLevel -> GetPlayLevel -> RhythmGameStartData+0x70` chain.
- `capture_score_life_ordinary_auto_skill_one_note.py`: privacy-minimized Auto Live collector for anonymous Skill queue/lifecycle state, one-note maxima, damage profile and Life; member/card/skill IDs, raw managed pointers and display strings are omitted.
- `build_score_life_ordinary_auto_skill_one_note_oracle.py` and `score_life_ordinary_auto_skill_one_note_oracle.json`: deterministic projection of 979 one-note calls, six Skill lifecycles, strict/equal max retention and overheal.
- `verify_score_life_ordinary_auto_skill_one_note_r1.py`: independent plan/script hash, sequence, privacy, Skill ordering, one-note maximum and overheal verifier.
- `capture_score_life_ordinary_auto_skill_effect_profile.py`: zero-tail observation-only collector that adds only trigger-time anonymous numeric duration/once-condition/ordered active-effect projections.
- `build_score_life_ordinary_auto_skill_effect_profile_oracle.py` and `score_life_ordinary_auto_skill_effect_profile_oracle.json`: deterministic five-profile/six-lifecycle projection including fixed heals, over-Life score and continued-note-judge rows.
- `verify_score_life_ordinary_auto_skill_effect_profile_r1.py`: independent 5,497-event continuity/hash/privacy/profile/Life-transition verifier.
- `capture_score_life_rehearsal_pause_return_time_retry2.py`: rehearsal-only observer for `ExecUpdate`, aggregate Life/Game Over state, and three ReturnTime layers; supports a predeclared UI long press without managed invocation.
- `build_score_life_rehearsal_pause_return_time_oracle.py` and `score_life_rehearsal_pause_return_time_oracle.json`: deterministic pause-window, Practice Life-zero continuation and ReturnTime(5) snapshot projection.
- `verify_score_life_rehearsal_pause_return_time_r1.py`: independent 6,826-event sequence/hash/privacy/window/call-order verifier.
- `capture_score_life_ordinary_auto_skill_playing_pause.py`: ordinary Auto observer that adds `SituationSkillManager.ExecUpdate` to the established anonymous Skill/one-note projection.
- `build_score_life_ordinary_auto_skill_playing_pause_oracle.py` and `score_life_ordinary_auto_skill_playing_pause_oracle.json`: deterministic Skill-Playing settled-pause and one-frame resume projection.
- `verify_score_life_ordinary_auto_skill_playing_pause_r1.py`: independent 13,248-event continuity/hash/privacy/pause/timer/completion verifier.
- `extract_score_life_runtime_input_provenance.py`: protobuf cache-record and BMS provenance extractor.
- `verify_score_life_runtime_inputs.py`: fail-closed R0 input/capture-target verifier.
- `verify_score_life_no_input_r1.py`: fail-closed verifier for the compressed no-input Life/Game Over R1 trace and committed capture plans.
- `verify_score_life_positive_r1.py`: fail-closed verifier for the positive Perfect/Score R1 trace and its explicit unconsumed ABI fields.
- `verify_score_life_multitouch_plan.py`: fail-closed verifier for hook identity, superseded shell control, native plan, ARM64 ELF/build provenance and SELinux restoration boundary.
- `verify_score_life_skill_r1.py`: fail-closed verifier for the active-Skill lifecycle, same-frame frozen rates, once-heal and final record trace.
- `verify_score_life_retry_lifecycle_plan.py`: fail-closed verifier for the non-destructive post-Game-Over Retry/reset plan.
- `verify_score_life_retry_lifecycle_r1.py`: fail-closed verifier for the post-Game-Over gate and in-place Retry reset trace.
- `build_score_life_state_chart_count_oracle.py`: deterministic derivation of ordinary/HABAHIRO production `maxNoteCount` from frozen chart structure and the 10.1.4 ARM64 count rule.
- `score_life_state_chart_count_oracle.json`: exact family decomposition yielding ordinary `825 + 29 + 125 = 979` and HABAHIRO `598 + 58 + 75 = 731`.
- `verify_score_life_state_chart_count_oracle.py`: independent structure/hash/ARM64 verifier that does not trust the earlier prototype `max_note_count` field.
- `chart-inputs/`: byte-preserving copies of the chart-construction facts committed at `74ab76f6838847d98aae1a15741a5f024e3774ff`.
- `build_score_life_state_fixed_event_oracle.py`: deterministic builder for the fail-closed BS01–BS36 partial oracle from committed static/R1/BMS inputs.
- `score_life_state_fixed_event_oracle.json`: all 36 required case identities with evidence projections, unknown fields, and blocking findings.
- `verify_score_life_state_fixed_event_oracle.py`: independent verifier for source hashes, case coverage, critical static tables, R1 projections, and the still-open business gate.
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
- `runtime/multitouch-seven-lane-post-gameover-retry-r1-plan.json`: executed v3 plan preserving the native run, then observing 12 seconds after Game Over before a Retry-only reset sequence; Continue is forbidden.
- `runtime/multitouch-seven-lane-post-gameover-retry.trace.json.gz`: successful 6,375-event R1 trace covering the post-Game-Over gate and in-place Retry reset.
- `runtime/initialization-profile-retry-r1-plan.json`: executed Retry-only plan for `poppin_shuffle_special` SPECIAL Lv.27; Continue, premium currency, persistent user identifiers, room fields and deck contents are excluded.
- `runtime/initialization-profile-retry.trace.json.gz`: successful 11-event R1 trace covering ordinary start/calculated identity, Life/max-note initialization and ScoreUtility total/rate/base Float32 fields.
- `runtime/deck-aggregate-profile-retry-r1-plan.json`: executed Retry-only plan for aggregate component/total observation; it excludes Continue, premium currency, account fields, member pointers and member rows.
- `runtime/deck-aggregate-profile-retry.trace.json.gz`: successful 31-event R1 trace covering two identical five-member aggregate invocations and exact component/total Float32 bits.
- `runtime/master-music-786-ui-list-r1-plan.json`: executed natural-UI plan for reading only non-account music/difficulty values for limited-time music ID 786 without invoking managed methods.
- `runtime/master-music-786-ui-list.trace.json.gz`: successful 7-event R1 trace that finds music 786 in a 796-row list and projects its five target difficulty rows only.
- `runtime/ordinary-auto-skill-one-note-r1-plan.json` and Retry-2/Retry-3 plans: executed but not promoted because Frida transport exited after business completion or before initialization.
- `runtime/ordinary-auto-skill-one-note-retry4-r1-plan.json`: zero-tail plan that ends at 979 ordinary one-note leaves and six Skill finishes.
- `runtime/ordinary-auto-skill-one-note-retry4-r1.trace.json.gz`: successful 5,501-event R1 trace with five anonymous Skill aliases, six complete lifecycles and no account/member/card/skill identity fields.
- `runtime/ordinary-auto-skill-effect-profile-r1-plan.json` and `.trace.json.gz`: successful 5,497-event zero-tail R1 with five anonymous numeric master profiles, six complete lifecycles, seven ordered active rows and no identity fields.
- `runtime/band-deck-switch-skill-profile*.json`: three precommitted zero-resource plans that failed closed because navigation did not reach initialization or Band 2–5 were empty; no trace is promoted.
- `runtime/rehearsal-pause-return-time-r1-plan.json`: first zero-resource plan retained as unpromoted because no ReturnTime hook fired.
- `runtime/rehearsal-pause-return-time-retry2-r1-plan.json` and `.trace.json.gz`: successful 6,826-event Practice R1 with settled pause suppression, continued Life-zero Game Over state and nested ReturnTime(5).
- `runtime/ordinary-auto-skill-playing-pause-r1-plan.json` and `.trace.json.gz`: successful 13,248-event ordinary Auto R1; Skill-01 remains Playing across 4,878ms settled pause and an 8,048ms wall gap advances exactly one game frame/timer step.
- `score_life_state_fixed_event_oracle.json`: complete BS01–BS36 case matrix with only directly supported projections promoted.
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

The verifier fails closed for a sample hash mismatch, ambiguous or changed managed mapping, non-global method boundary, ELF/TSV byte difference, stale ARM64 slice, layout/enum/constant difference, rodata difference, missing critical instruction, stale partial-oracle case, or incorrectly closed business gate.

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
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_retry_lifecycle_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_initialization_profile_plan.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_deck_aggregate_profile_plan.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_deck_aggregate_profile_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_deck_aggregate_profile_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/extract_score_life_master_music_profile_static.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_master_music_profile_plan.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_master_music_profile_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_master_music_profile_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_ordinary_auto_skill_one_note_retry4_plan.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_ordinary_auto_skill_one_note_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_ordinary_auto_skill_one_note_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_ordinary_auto_skill_effect_profile_plan.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_ordinary_auto_skill_effect_profile_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_ordinary_auto_skill_effect_profile_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_rehearsal_pause_return_time_retry2_plan.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_rehearsal_pause_return_time_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_rehearsal_pause_return_time_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_ordinary_auto_skill_playing_pause_plan.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_ordinary_auto_skill_playing_pause_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_ordinary_auto_skill_playing_pause_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_initialization_profile_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_initialization_profile_r1.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_state_chart_count_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_state_chart_count_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/build_score_life_state_fixed_event_oracle.py
py -3.14 artifacts/investigations/score-life-state-runtime-contract-10-1-4/verify_score_life_state_fixed_event_oracle.py
```

The traces are captured through an explicit non-default loopback server forwarded by ADB, using `--device-address 127.0.0.1:47913`; the transport is embedded in each trace capability record. This changes only the Frida connection path and does not alter the observation agent or game state. Initialization, deck-aggregate and master-music plans are committed before execution and do not themselves promote any runtime value or change the open business gate. The deck-aggregate profile may close only aggregate provenance; BS03 member-row values remain fail-closed under the privacy boundary. Music ID 786 is unavailable for selection outside its limited-time window, so the master-music plan observes only list calls naturally made while reopening Free Live and never invokes a managed getter itself.

The no-input retry trace directly fixes stable `InGameRecord` identity, Life initialization `1000/1000/2000`, 11 Miss projections, slot-order Life mutation to zero, inactive Skill state, and the nested single-player Game Over transition. The v2 trace additionally fixes one real-touch Perfect entry (`addScore` bits `0x44AF8052`), raw/adjusted result 4, identity Fever/Skill/ScoreUp rates, Combo/Perfect counters, reflected integer Score 1,404, ten Misses and Game Over with the score retained. Active Skill remained absent for all 220 manager updates, so D20 and active-Skill D18 remain open.

Five raw fields are explicitly not consumed: float-return hooks read generic `x0` rather than ARM64 `s0`, and two trailing `judgeFrontNote` parameters lack an independently closed hook ABI. The raw bytes are retained, but `verify_score_life_positive_r1.py` never uses those values.

The first Linux MT shell control was aborted after exceeding its execution time bound; no output trace was produced, no result is promoted, and SELinux was independently restored to Enforcing. Its replacement is a committed 6,304-byte ARM64 helper that writes only `struct input_event` records to `event2` and uses `nanosleep` for 20ms press/60ms release timing. The capture script verified the helper SHA before push, bracketed execution with temporary SELinux Permissive, restored Enforcing in `finally`, and deleted the device copy.

The resulting 7,122-event trace observes Skill Add→Begin→Playing→Finishing→None (`0→1→2→3→0`), 5.0s effective timer, 0.75s finishing timer, and fixed once-heal `800 + 300 = 1100` while the displayed base remains 1000 and the business upper limit 2000. Two entries created after Skill enqueue but before Begin froze rate 1.0 and were Reflect-consumed after state became Playing; 18 later entries froze rate 1.2/ScoreUpType1, and the first post-finish entry returned to 1.0. This partially closes D18, D14 and the Skill start/end part of D20.

The v3 plan changes no part of the committed native run. It adds a 12-second observation window after Game Over, then only the same Retry and confirmation coordinates followed by reset observation. Its safety object forbids Continue and premium-currency actions.

The resulting 6,375-event trace observes Game Over leave followed only by the nested `AddIPower.leave`, then no hooked manager/business call for 11,875ms. Retry reuses the same `InGameRecord`; `InitializeLife` resets single Game Over `1→0`, Score/reserve `44403→0`, Life `0→1000`, max Combo `6→0`, judgement/tap/timing counts and cached Skill Life to zero while preserving displayed base 1000, business upper limit 2000 and max Note count 540 before `InitBaseScore`. This partially closes the post-Game-Over gate and Retry/reset part of D22. Score-decrease modes, seek and ReturnTime remain open; Continue remains intentionally unobserved because it consumes premium currency.

The chart-count batch consumes the two production BMS bytes already pulled from the connected 10.1.4 installation and byte-preserving chart-structure facts from the committed chart-construction investigation. The latter investigation was versioned 10.1.3, so it is used only as a parser-independent description of the identical BMS bytes: playable roots, Long roots, Slide roots, source Slide nodes, and hidden source nodes. No 10.1.3 gameplay rule or earlier prototype `max_note_count` result is consumed. The current 10.1.4 ARM64 directly supplies the count rule: retained root once, one extra Long tail, every non-hidden Slide child, directional adjacent-group sharing, then store to `InGameRecord.maxNoteCount +0x2C`. The independent verifier derives ordinary `825 + 29 + (298 - 80 - 93) = 979` and HABAHIRO `598 + 58 + (141 - 15 - 51) = 731`.

The music-786 natural-UI trace contains seven contiguous events and no managed invocation. Reopening Free Live naturally returns one 796-row music list containing target ID 786 and a target-only five-row difficulty list: Easy 7, Normal 13, Hard 20, Expert 25 and SPECIAL 26; only SPECIAL has `enableSpecialNotes=1`. All nullable `scoreLevel` raw bits are zero. Direct 10.1.4 ARM64 shows `MusicData.GetScoreLevel` falls back to `GetPlayLevel` when that nullable is absent/zero, and Free Live stores the result to `RhythmGameStartData +0x70`; the resolved SPECIAL score level is therefore 26. The target was published 2026-03-31 15:00Z and closed 2026-04-07 05:59:59Z, so runtime initialization remains unavailable outside the event window. Titles, account/room/deck fields and all non-target master rows are absent.

The initialization-profile Retry trace is privacy-minimized and contains 11 contiguous events. For `poppin_shuffle_special.bms` / `special`, it observes music ID 3, score level 27, five deck-situation and character objects without their contents, Miss/Bad damage `-100/-50`, Life `1000/1000/2000`, max Note `979`, total parameter `0x483C8A31`, score-level rate `0x3F9C28F6`, zero event parameter, ordinary base score `0x4434718E` and zero bonus base. An independent Float32 recomputation matches both rate and base bits. The follow-up 31-event deck-aggregate trace observes two identical calls over the same five-element array: component bits `0x47617330`, `0x478A9AE2`, `0x477B7FCF`, first addition `0x47FB547A`, then total `0x483C8A31`. Account identifiers, room fields, member pointers, member rows, display strings and deck element contents are absent. This closes ordinary aggregate provenance only; privacy-excluded member rows, HABAHIRO initialization and nonzero event/master profiles remain D23 blockers.

The successful zero-tail Auto trace contains 5,501 contiguous events and no capture error. It observes all 979 ordinary one-note callbacks and six ordered Skill lifecycles using five anonymous aliases, with the fourth alias recurring for the sixth Skill note. Ordinary one-note maxima progress `541@combo1 -> 703@combo82 -> 1136@combo219`; equal scores retain the earlier object and combo identity. The event-bonus one-note object remains zero under the already locked zero event parameter. Once effects directly move Life `1000 -> 1200` and `1200 -> 1500` while `playerMaxLife` remains 1000, proving ordinary overheal without exporting master/member identity. Nonzero event bonus, Skill effect master rows, overlapping Skill and Fever remain unobserved.

The BS01–BS36 oracle remains fail-closed without pretending closure: BS01 is confirmed-r1 from chart count, initialization and repeated aggregate evidence; BS05, BS06 and BS11 remain confirmed-static. Twenty cases contain only directly supported static/R1/chart projections plus explicit unknown fields or blockers; 12 cases remain blocked with no expected projection. BS03 retains exactly `profile.member_rows` and `D23-deck-member-rows-privacy`; BS02 retains unavailable runtime start-data, event parameter and base bits. BS13/BS14 now consume ordinary strict/equal one-note maxima, BS20 consumes direct overheal, and BS21/BS22 consume six successful anonymous Skill lifecycles and reservation frames. The fixed-event oracle records 135 unknown fields and 85 blocking findings overall. Fever transitions, overlapping Skill, guard/Never Die, HABAHIRO/nonzero-event/special-mode master rows and final `closure.json` remain open. The five ABI-unsafe fields stay unconsumed. The business gate remains open and no partial oracle authorizes production implementation.

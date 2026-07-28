# Flick and Timeout Paths

## Question

How do standalone Flick notes complete from moved touches, and how do Long/Slide notes resolve when their start or end windows expire without a successful touch path?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## Result

The standalone Flick and timeout-driven Long/Slide state paths are recoverable to implementation level. Combined with `../touch-note-arbitration/`, `../touch-hold-release/`, and `../judgement-result-pipeline/`, the static boundary now covers touch acquisition, move/release completion, no-input timeout, miss emission, result aggregation, and callbacks.

This is reconstructed IL2CPP behavior, not original C#. Metadata supplies method names/signatures, while exact ARM64 ranges and corrected Hex-Rays output supply control flow. Private field names and several base virtual calls remain semantic labels.

## Standalone Flick

`NoteFlick.ExecTouchMoved` compares the world-distance rate between the begin and current positions against `0.04`. On success it marks the note information as judged, calls `NoteFrontBase.judgeFrontNote` with game-note type `3`, and dispatches the virtual finish hook. The input result argument is not used; successful movement produces the front-note judgement directly.

`NoteDirectionalFlick.ExecTouchMoved` first checks the required horizontal direction, then requires a horizontal distance rate greater than `0.01`. Source note type `10` accepts movement toward decreasing X and type `11` accepts movement toward increasing X. Success marks the note judged and calls `judgeFrontNote` with game-note type `9` before the finish hook.

The `0.04` and `0.01` values are confirmed from ELF data at `0x1536820` and `0x1536940`, not inferred from rendered pseudocode. The source mapping agrees with the existing BMS investigation: `10/11` are directional left/right variants. Ambiguous BMS values `2/3` are still not renamed from this evidence alone.

## Long State Machine

`ExecuteAfterUpdate` runs the base after-update method and invokes the linked after-note's virtual after-update method. `OnUpdate` updates the linked after-note and routes force-perfect modes into `forcePerfectOnUpdate`. The force-perfect paths automatically emit Perfect when adjusted music position reaches the corresponding start/end position.

`NoteBase.ExecuteUpdate` selects the active note phase from `NoteState`; the miss exits are:

```text
WaitState -> execOverWaitState   (front/start window expired)
StopState -> execOverStopState   (after/end window expired)
```

`WaitState` compares adjusted music position against the Long front-note position using the BPM/time conversion helper and the global judgement tolerance. Once the start window is over, `execOverWaitState` fades the held sound, calculates miss damage and damage guard, halves the damage, invokes `onMiss` twice with the two halves, and deactivates the Long.

`StopState` performs the analogous comparison against the after-note position. `execOverStopState` fades the sound, calculates miss damage/guard, emits the missed after-note frame data, clears the target/effect path, and deactivates. `NoteLong.onMiss` delegates to the shared base miss construction, so its output follows the same `OneFrameData` contract documented in `../judgement-result-pipeline/`.

## Slide State Machine

`NoteSlide.OnUpdate` advances slide motion, updates every after-node, and routes force-perfect modes separately. `slidingMove` moves visible front/after meshes and respects invisible-node flags. `MoveState` and `forcePerfectMoveState` handle the transition into the judgement window and force-perfect front judgement.

`WaitState` evaluates both the current front deadline and the first visible after-node position. If the front window is over, or the next visible node has reached/passed the adjusted music position, it calls `execOverWaitState(missType: 0)`. That helper fades the slide sound, calls the already recovered `onMiss` for the current/next node pair, and then advances across invisible nodes.

`StopState` scans after-nodes for the first pending visible node. In force-perfect modes, reaching that node routes to `forcePerfectStopState`, which animates and judges it as Perfect. In ordinary mode, missed nodes are handled by the wait/miss path rather than being silently removed.

`killFromInvisibleNotesToVisibleNote` repeatedly hides and advances nodes whose information carries the invisible flag, then refreshes the active target button. This explains how a chain resumes at the next playable node after a miss or seek.

## Move-Time Refresh

`RefreshAfterMoveTime` is a seek/time-jump recovery path, not the ordinary frame timeout state machine. When the current node is alive it changes state, stops flash animation, hides affected pending nodes, skips invisible nodes, and refreshes the target lane.

`refreshTargetButton` binds the lane to the current live node and copies its target position. `onMissAfterNote` is the callback-style cleanup path for an after-node that becomes missed during this recovery: it calls `onMiss`, clears the node runtime state, hides it, fades sound, and advances when necessary.

Keeping this path separate from `WaitState` avoids conflating natural no-input misses with chart-time relocation.

## Confirmed Facts vs Inference

Confirmed:

- all 29 functions match their requested metadata boundaries;
- 27 functions decompile independently and the two non-Hex-Rays Flick entries have complete ARM64 exports;
- ordinary Flick threshold `0.04`, directional threshold `0.01`, and X-direction branches for source types `10/11`;
- standalone Flick game-note type `3` and directional Flick game-note type `9` at `judgeFrontNote`;
- Long start-timeout damage is divided into two `onMiss` calls;
- Long end timeout and Slide wait timeout emit misses through the shared frame-data path;
- Slide invisible-node skipping, target refresh, and move-time recovery are distinct from normal frame timeout.

Inferred semantic labels:

- `StartJudgeWindowExpired`, `EndJudgeWindowExpired`, and the managed names of positions at note-information offsets;
- the exact user-facing name for game-note types `3` and `9` beyond their recovered behavior;
- managed field names for Long's linked after-note at `+0x1B0` and Slide's after-note list at `+0x1B8`;
- the semantic name of Slide's per-node runtime field cleared by `onMissAfterNote`.

## Boundary Correction

IDA previously treated `NoteDirectionalFlick.judgeDirectionalFlickSucceeded @ 0x30EA05C` as part of `shouldJudgeDirectionalFlick` and merged `NoteSlide.execOverWaitState @ 0x321C4E4` into `WaitState`. Both addresses are independent metadata entries and begin with valid ARM64 function prologues.

The shared exporter now materializes entry instructions after deleting stale functions and re-establishes every requested boundary after autoanalysis. It leaves internal literal/data islands intact, preserves exception analysis, and prevents IDA tail/chunk merging from overwriting metadata adjacency.

## Remaining Work

- Normalize the managed enum names for game-note types `3` and `9` without guessing from BMS numeric values.
- Recover named field layouts/type headers for linked after-note fields and note-information positions.
- Validate timeout thresholds and simultaneous misses with a read-only runtime trace or standalone harness.
- Reconstruct chart scheduling and audio-clock correction around these note-local methods.

## Reproduction

Run the corrected exporter against the version-matched database:

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\timeout-flick-paths\export_corrected_pipeline.py).Path) $((Resolve-Path artifacts\investigations\timeout-flick-paths).Path)\decompiled" `
  samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64
```

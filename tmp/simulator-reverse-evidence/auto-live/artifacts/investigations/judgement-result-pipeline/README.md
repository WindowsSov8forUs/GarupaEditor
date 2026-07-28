# Judgement Result Pipeline

## Question

How does a playable note become a timing result, a populated `OneFrameData`, and finally score, combo, power, sound, and display updates?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## Result

This section of the rhythm engine is recoverable to implementation level. The confirmed boundary now covers ordinary and slide timing judgement, result adjustment, per-note score/combo/power construction, one-frame aggregation, record mutation, sound routing, combo/display updates, and the outward judgement callback.

It is not original C# recovery. IL2CPP metadata supplies names and signatures; ARM64 and corrected Hex-Rays output supply control flow. Delegate field names and some mode-specific branches remain semantic reconstructions.

## Confirmed Judgement

`NoteUtility.GetResult` converts the absolute time difference to a rounded 60 FPS frame distance and applies these exclusive upper bounds:

| Frame distance | Result |
| --- | --- |
| `< sweetFrame + 3` | Perfect |
| `< sweetFrame + 6` | Great |
| `< sweetFrame + 7` | Good |
| `< sweetFrame + 8` | Bad |
| otherwise | None |

For non-Perfect results, `JudgeNote` reports `Slow` when `noteJudgePos - currentPos <= 0`; otherwise it reports `Fast`. Perfect always clears the timing direction to `None`.

`CalcNoteResultType` has two paths. A `NoteSlide` delegates to `SlideNoteManager.Judge(CurrentNote.VirtualPosY, out cursor)`; other notes call `JudgeNote(InfoData.AbsolutePos, NoteManager.GetAdjustMusicPos(), InGameMusicScoreController.CurrentBPM, ...)`. The `CurrentBPM` field is confirmed at controller offset `0x1C` by its getter and setter.

## Per-Note Construction

`NoteFrontBase.judgeFrontNote` performs these operations in order:

1. Resolve `TargetCenterButton` and pass the raw result through `getNoteResultType`.
2. Compute Combo with `NoteBase.getAddCombo`: Great and Perfect produce `+1`; lower results produce `-1`.
3. Compute Power/damage and `damageGuardType` with `calcAddDamage`.
4. Compute the normal and free-live-event-bonus score bases with `calcBaseCorrectedScore`.
5. Read Fever, skill, and Crescendo score rates; `calcSkillScoreUpRate` also returns `scoreUpType`.
6. Trigger the target button animation and handle skill-note success/failure state.
7. Obtain an unused `OneFrameData`, populate it, invoke the judgement callback, and call `onFinishJudgeFrontNote(adjustedResult)`.

The corrected `OneFrameData.Setup` field mapping is:

| Offset | Value |
| --- | --- |
| `0x10` | `IsUse = true` |
| `0x14` | index |
| `0x18` | buttonTypes |
| `0x20` | addScore |
| `0x24` | addPower |
| `0x28` | addCombo |
| `0x2C` | noteType |
| `0x30` | raw result |
| `0x34` | adjusted result |
| `0x38` | feverScoreUpRate |
| `0x3C` | skillScoreUpRate |
| `0x40` | CrescendoSkillScoreUpRate |
| `0x44` | scoreUpType |
| `0x48` | absolutePos |
| `0x4C` | damageGuardType |
| `0x50` | JudgeTiming |
| `0x54` | freeLiveEventBonusAppliedAddScore |
| `0x58` | `feverScoreUpRate * skillScoreUpRate` |

`JudgeTiming` is retained only for Bad, Good, and Great. Miss and Perfect force it to `None`.

## Frame Aggregation

`ReflectOneFrameData` scans the reusable frame-data list and consumes entries whose `IsUse` flag is set. For each entry it:

- clears `IsUse`;
- updates Combo and the combo-character display;
- accumulates Power, applying damage-guard handling when necessary;
- calculates Combo correction and multiplies the truncated base score by the cached score-up rate;
- performs the same calculation for the free-live-event-bonus score;
- records per-note maximum-score information;
- optionally displays AddScore;
- increments result and Fast/Slow counters for non-`None` adjusted results; and
- tracks the strongest result, score-up type, damage guard, stage-effect level, and judge timing for `OneFrameTotalData`.

After the loop it updates the power/life and combo/all-perfect displays, then writes the aggregate `OneFrameTotalData` returned by `GetReflectOneFrameData`.

## Result Propagation

`InGameManager.onJudgeNote` first feeds the adjusted result into continuous-skill state. It then asks `TapSEStatusData.ShouldSilent(absolutePos, noteType, adjustedResult, multipleDirectionalFlickNoteCount)` whether a judgement sound should be suppressed. Directional/flick note types use `playFlickJudgeSE`; all others use `playStandardJudgeSE`.

Outside move-time mode, the manager invokes its external judgement callback with `buttonTypes`, `noteType`, `adjustedResult`, and `isSync`. Finally it resets `TapSEStatusData` with the current absolute position, flick count, note type, adjusted result, and a three-frame lifetime.

## Inference

- `getNoteResultType` applies active situation-skill transformations to the raw result. Its branch structure is recovered, but the full set of skill enum names is not yet normalized.
- The two `calcBaseCorrectedScore` calls are routed to normal score and free-live-event-bonus score respectively. Their distinct destination fields and later aggregation are confirmed; the upstream configuration fields used for each call still need naming cleanup.
- Delegate targets in `judgeFrontNote` and `onJudgeNote` are described by their argument shapes. Exact backing-field names require type-header recovery.

## Open Questions

- Recover touch ownership and lane arbitration before `CalcNoteResultType`, including multi-touch and wide-lane behavior.
- Normalize every `getNoteResultType` situation-skill branch and score-up enum.
- Recover Miss/long-note release paths and prove that they populate `OneFrameData` with the same contract.
- Validate a chart at runtime or with a standalone harness, especially the rounded-frame boundary values and simultaneous-note aggregation.

## Evidence Notes

IDA previously failed `NoteFrontBase.judgeFrontNote` because the global batch did not enforce the metadata boundary. The corrected ranges in `targets.tsv` were rebuilt explicitly and all five promoted functions match their requested start and end addresses before decompilation.

The source binary and metadata hashes are recorded in `artifacts/manifests/artifact_manifest.json`. See `pipeline.pseudocode.cs` for an implementation-oriented summary and `decompiled/` for exact corrected slices.

## Reproduction

Run the boundary exporter against the version-matched IDA database:

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\judgement-result-pipeline\export_corrected_pipeline.py).Path) $((Resolve-Path artifacts\investigations\judgement-result-pipeline).Path)\decompiled" `
  samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64
```

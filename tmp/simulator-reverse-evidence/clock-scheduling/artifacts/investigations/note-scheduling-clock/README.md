# Note Scheduling and Music Clock

## Question

Who drives note state updates, how are Move/Wait/Stop phases dispatched, and how does the engine convert frame delta, BPM, and judgement offset into the absolute position used by note judgement?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## Result

The note scheduler and its deterministic music-position clock are recoverable to implementation level. This closes the main control-flow gap above the note-local touch, timeout, and judgement investigations: `NoteManager.ExecUpdate` owns substepping and update ordering, `NoteBase.ExecuteUpdate` owns state dispatch, and `InGameMusicScoreController` owns BPM-relative position advancement.

This remains reconstructed IL2CPP behavior rather than original C#. Virtual slot names are assigned from metadata overrides and surrounding methods; several container/private field names are semantic reconstructions.

## Frame Scheduler

`NoteManager.ExecUpdate(deltaTime)` normalizes very small frames to a 60 FPS scale and selects one to four simulation substeps for larger frames. The observed thresholds are:

| Frame delta | Substeps |
| --- | --- |
| `< 0.018` | `1` |
| `0.018 .. < 0.033` | `2` |
| `0.033 .. < 0.05` | `3` |
| `>= 0.05` | `4` |

Historical counters can force the scheduler back to one step after repeated slow frames. For each substep it:

1. advances `InGameMusicScoreController`;
2. updates an auxiliary note-object list;
3. iterates the main note list in reverse and calls `NoteBase.ExecuteUpdate`;
4. collects notes that remain active;
5. invokes virtual `ExecuteAfterUpdate` on the collected notes in list order; and
6. processes note-group information.

This establishes the ordering needed for a reimplementation: music position changes before note state checks, and after-update work runs only after every main note has completed its current substep.

## Note State Dispatch

`NoteBase.ExecuteUpdate` increments total elapsed time and dispatches by the state field at `+0x50`:

| State | Virtual phase | Extra elapsed field |
| --- | --- | --- |
| `0` | MoveState | `+0x104` |
| `1` | WaitState | none in the base method |
| `2` | StopState | `+0x108` |
| `3` | Deactive, no update | none |

After Move/Wait/Stop, it calls virtual `OnUpdate`. `ChangeState` handles transition callbacks for active/deactive boundaries. Long `+0x1B0` is the linked after-note object and Slide `+0x1B8` is the after-note list; they are not state delegates. Their virtual after-update calls explain the behavior recovered in `../timeout-flick-paths/`.

`NoteLong.Activate` chooses an after-note instance from source types `0`, `1`, `2/3`, or `4/5`, binds it to the Long, and configures the held-note effect. `NoteSlide.Activate` rebuilds its after-node list, links each node to its successor, selects the end-node variant from source types `8-12`, and selects sprite/effect resources from group/type data.

## Music Position

`NoteUtility.GetBarSeconds(bpm)` is exactly:

```text
240 / bpm
```

The controller stores a bar counter and a floating progress within the bar. Both `get_MusicPos` and `get_LauncherMusicPos` return:

```text
beatProgress + UnitsPerBar * barProgress
```

`UpdateMusicScoreProgress(deltaTime)` advances the main position with `CurrentBPM` and the launcher position with its separate BPM field. In implementation terms:

```text
progress += deltaTime / (GetBarSeconds(bpm) / UnitsPerBar)
```

It carries overflow into the bar counter and then invokes the music-position callback. The `240 / BPM` numerator proves a four-quarter-note bar duration. The separate static field is now closed by `../music-bar-division-adaptive-substeps/`: its managed name is `NoteManager.MUSIC_BAR_DIVISION_COUNT` and its value is exactly `192`.

## Judgement Offset

`NoteManager.GetAdjustMusicPos` starts from `InGameMusicScoreController.MusicPos` and reads a signed judgement-offset setting. Zero returns the raw position. Positive values call `FastAbsolutePos`; negative values call `SlowAbsolutePos`.

Both helpers take the absolute frame count and simulate one `1/60` second step per frame. They look up the BPM at each traversed position, so an offset crossing a BPM-change boundary is accumulated with the correct BPM on each side. Fast advances bar/progress; Slow rewinds and borrows from the previous bar when necessary.

This means timing adjustment is not a constant position-unit addition. A compatible engine must apply a signed time offset through the tempo map.

## Note Speed

`NoteUtility.GetNoteArrivalSeconds` maps the specific-speed setting piecewise:

```text
speed <= 11.01: (speed - 1) * -0.5 + 5.5
speed >  11.01: (speed - 11) / -10 + 0.5
```

This gives the visual arrival duration used by note movement and is separate from judgement timing.

## Confirmed Facts vs Inference

Confirmed:

- all 15 promoted functions match requested/actual boundaries and decompile independently;
- music update precedes note update in every substep;
- reverse main-list update, active-note collection, then ordered after-update dispatch;
- NoteState values `0/1/2/3` route Move/Wait/Stop/Deactive behavior;
- `GetBarSeconds = 240 / BPM` and progress overflow into a bar counter;
- signed judgement offset is applied as repeated `1/60s` steps across BPM changes;
- Long linked after-note and Slide after-note list ownership established by `Activate`.

Inferred semantic labels:

- `totalElapsed`, `moveElapsed`, `stopElapsed`, and auxiliary-list names;
- exact managed callback names for the state-transition fields;
- the user-facing name of the historical slow-frame counters.

## Remaining Work

- Move-time seek and `ReturnTime` restoration are now recovered in `../move-time-state-restore/`; ordinary application pause/resume remains open.
- Simultaneous activation/update/after-update ordering is now recovered in `../simultaneous-note-ordering/`; upstream equal-position group construction remains open.
- `MUSIC_BAR_DIVISION_COUNT` and the adaptive historical counters are closed in `../music-bar-division-adaptive-substeps/`.
- The standalone clock/substep/offset validation harness is now available in `../deterministic-engine-harness/`.

## Reproduction

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\note-scheduling-clock\export_corrected_pipeline.py).Path) $((Resolve-Path artifacts\investigations\note-scheduling-clock).Path)\decompiled" `
  samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64
```

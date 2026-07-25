# Application Pause and Resume

## Question

How does ordinary application suspension and pause-menu handling stop and resume gameplay, audio, movie/stage controllers, and note-clock progression, and how is this different from move-time seek?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), `arm64-v8a`.

## Result

Application lifecycle suspension and menu pause are recoverable as a control/broadcast layer around the existing gameplay scheduler. They do not restore snapshots or directly change note/music position. Instead they gate the current game state, pause/resume global audio and registered live controllers, and return to the playing state after resume countdown.

This is reconstructed IL2CPP behavior. InGameManager method names and boundaries are confirmed. The exact managed names of several interface slots on the aggregate live controller remain inferred from call order and known implementations. The later `../ingame-playerloop-pause-gates/` investigation confirms the managed enum names and the exact first-slice update gate.

## Application Lifecycle

`OnApplicationPause(true)` calls `onSuspend`; `false` calls `onResume`.

`onSuspend` optionally suspends an auxiliary controller, invokes a stage/controller suspend path while the current game state is at most `5`, then calls slot `29` on the aggregate live controller. `onResume` calls slot `32` on the same interface.

These lifecycle callbacks do not call `NoteManager.ReturnTime`, change BPM/progress fields, or advance the gameplay clock. Their effect is mediated through game-state/update gating and controller suspension.

## Pause Menu

`onExecutePause` opens the pause UI/controller, sets the pause-state field at `+0x140` to `1`, and calls `prePauseSound`.

The sound/control sequence is:

```text
prePauseSound -> live controller slot 26
pauseSound    -> global music pause
              -> global device/audio pause
              -> live controller slot 27
              -> live controller slot 28
```

`onPauseSound` first changes the current game-state field to `7`, then executes `pauseSound`. Known implementations elsewhere include movie and stage/effect pause handlers, but their invocation here is through the aggregate interface rather than direct concrete calls.

## Resume

`onClickResume` starts the resume-countdown animation through the pause UI controller. When the countdown finishes, `onFinishResumeCountdownAnimation` sets pause state to `2`.

`resumeFromPause` is a thunk to `resumeGame`. The resume sequence is:

```text
global music resume
global device/audio resume
live controller slot 30
live controller slot 31
live controller frame/state callback(reason = 4)
current game state = 5
```

No snapshot, BPM cursor, note group index, or note pool is modified. On the next permitted live update, `NoteManager.ExecUpdate` continues from the existing clock state. This is fundamentally different from `../move-time-state-restore/`, which rewinds to a snapshot and replays frames.

## State Values and Update Gate

Confirmed managed names and numeric values:

- `CE.PauseState.Pause = 1` when the pause menu executes;
- `CE.PauseState.Resume = 2` when resume countdown finishes;
- `GameState.PauseNone = 6` and `GameState.PauseSound = 7` are the paused game states;
- `GameState.PlayingNone = 4` and `GameState.PlayingSound = 5` are the two states dispatched to `updatePlayState`.

`get_isPaused` returns true for pause states `Pause`/`Resume` or game states `PauseNone`/`PauseSound`. `InGameManager.ExecUpdate` dispatches only `PlayingNone` and `PlayingSound` to `updatePlayState`; `PauseSound` does not reach `NoteManager.ExecUpdate`. See `../ingame-playerloop-pause-gates/` for the native ranges and reproducible closure.

## Confirmed Facts vs Inference

Confirmed:

- all 12 targets match requested/actual boundaries and decompile independently;
- lifecycle pause and resume dispatch separately from the pause menu;
- explicit global music/device pause and resume order;
- pause/resume state writes and countdown boundary;
- no direct note-clock, BPM, snapshot, or note-pool mutation in this chain.

Inferred semantic labels:

- aggregate live-controller slots `26-32` as pre-pause, pause-sound, pause, resume-sound, resume, and application-resume callbacks;
- names of the auxiliary/stage controller fields in `onSuspend`;
- aggregate interface slot names remain inferred; the enum names are now confirmed by IL2CPP metadata.

## Remaining Work

- Recover the aggregate live-controller interface/type header to replace slot semantics with managed method names.
- Trace audio-device loss/reinitialization beneath the two global audio calls.
- Recover unrelated MonoBehaviour ordering only if a later slice introduces a concrete dependency on it.
- Pause freezing versus move-time rewind/replay is now validated in `../deterministic-engine-harness/`.

## Reproduction

```powershell
& 'HOST___________\IDA Professional 9.3\idat.exe' -A `
  "-S$((Resolve-Path artifacts\investigations\application-pause-resume\export_corrected_pipeline.py).Path) $((Resolve-Path artifacts\investigations\application-pause-resume).Path)\decompiled" `
  samples\jp.co.craftegg.band\10.1.3_229\extracted\libil2cpp.so.i64
```

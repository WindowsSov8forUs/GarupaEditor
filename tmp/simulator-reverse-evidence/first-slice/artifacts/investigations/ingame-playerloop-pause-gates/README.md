# In-Game PlayerLoop and Pause Gates

## Question

What is the original managed frame owner of `NoteManager.ExecUpdate`, and which confirmed game/pause states permit or block that call in the first-slice engine graph?

The investigated sample is `jp.co.craftegg.band` 10.1.3 (`229`), Unity 2022.3.62f1, `arm64-v8a`.

## G04 Result

`InGameDirector` is a `MonoBehaviour`. Its `Update @ 0x32F8C4C` loads the owned `InGameManager` and tail-calls `InGameManager.ExecUpdate @ 0x32F8C64`.

The already verified native PlayerLoop reconstruction places `Update.ScriptRunBehaviourUpdate` at Update child 1 of 4. All three statically discovered direct `PlayerLoop.SetPlayerLoop` writers preserve the retained native sibling order. The first-slice original entry chain is therefore:

```text
Update.ScriptRunBehaviourUpdate
  -> InGameDirector.Update
  -> InGameManager.ExecUpdate
  -> InGameManager.updatePlayState
  -> NoteManager.ExecUpdate
```

This closes the engine-owned phase boundary. The first slice must restore `InGameDirector.Update` as the original managed owner. Its portable host `step` remains an external frame trigger and must not be named as a Unity API.

Ordering among unrelated `MonoBehaviour.Update` callbacks is not consumed by the first-slice object graph and must not be invented. Render-thread, GPU, presentation, and capture timing remain outside this engine-only slice.

## G05 Result

IL2CPP metadata confirms the names and values:

- `GameState.PlayingNone = 4`
- `GameState.PlayingSound = 5`
- `GameState.PauseNone = 6`
- `GameState.PauseSound = 7`
- `CE.PauseState.None = 0`
- `CE.PauseState.Pause = 1`
- `CE.PauseState.Resume = 2`

`InGameManager.get_isPaused` returns true when the pause-state field is `Pause` or `Resume`, or when the current game state is `PauseNone` or `PauseSound`.

`InGameManager.ExecUpdate` dispatches `PlayingNone` and `PlayingSound` to `updatePlayState`. It does not dispatch `PauseNone` or `PauseSound` there. `updatePlayState` calls `NoteManager.ExecUpdate` only after `canThroughInputInspection` succeeds; `PlayingSound` passes that check directly, while `PlayingNone` continues through the OneFrame input-inspection list condition.

The pause transition is exact:

```text
onExecutePause
  -> PauseState = Pause
  -> prePauseSound
onPauseSound
  -> GameState = PauseSound
  -> pauseSound
```

The resume-countdown callback writes `PauseState.Resume`. During `ExecUpdate`, game-state dispatch occurs first, then the one-frame pause command is consumed. `resumeGame` ends by writing `GameState.PlayingSound`, and `ExecUpdate` resets `PauseState.None`.

The portable first-slice API does not implement pause UI or countdown. It maps `pause` and `resume` directly to the confirmed steady states `PauseSound` and `PlayingSound`; this is a host adaptation boundary, not a claim that those host methods are original APIs.

## Confirmed and Excluded

Confirmed:

- the original managed frame owner and PlayerLoop phase;
- complete names and numeric values of the first-slice playing/pause states;
- the exact `isPaused` formula;
- the game-state dispatch paths that permit or block `NoteManager.ExecUpdate`;
- the pause and resume state writes relevant to scheduler freezing and continuation.

Excluded from this slice:

- pause UI animation and resume-countdown implementation;
- concrete audio-device backend behavior;
- unrelated MonoBehaviour callback ordering without an engine-object dependency;
- rendering and device-presentation latency.

## Reproduction

```powershell
python artifacts\investigations\ingame-playerloop-pause-gates\extract_ingame_playerloop_pause_gates.py
python artifacts\investigations\ingame-playerloop-pause-gates\verify_ingame_playerloop_pause_gates.py
```

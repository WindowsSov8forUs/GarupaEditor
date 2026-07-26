# Deterministic Engine Harness

## Question

Do the recovered clock, substep, judgement-offset, pause, snapshot, and no-input replay rules form a self-consistent deterministic core suitable for a rhythm-engine reimplementation?

## Result

Yes, within the recovered scheduling boundary. A standalone Python harness reproduces the confirmed time-domain behavior and proves that continuous simulation reaches the same clock and note/command cursors as snapshot restore followed by deterministic replay.

This is a verification model, not a claim that the complete game engine has been reproduced. It deliberately excludes score, Combo, skills, rendering, audio playback, and concrete Unity pooling behavior.

## Modeled Rules

The harness imports no game code and uses no third-party packages. It models only behavior confirmed in:

- `../note-scheduling-clock/`;
- `../move-time-state-restore/`; and
- `../application-pause-resume/`.

Implemented rules:

- `GetBarSeconds = 240 / BPM`;
- music-position advancement across BPM boundaries;
- signed judgement offset as repeated `1/60s` steps;
- scheduler substep thresholds `0.018`, `0.033`, and `0.05`;
- note and command group cursors driven by music position;
- integer-second snapshots with the first-second cursor reset rule;
- backward restore from at most sixteen seconds earlier;
- replay with input sampling disabled; and
- pause as a frozen scheduler state without clock rewind.

## Validation

Run:

```powershell
Set-Location artifacts\investigations\deterministic-engine-harness
python -m unittest -v test_engine_harness.py
```

The five tests verify:

1. four-quarter-note bar timing and forward BPM crossing;
2. positive/negative frame offset round-trip across a BPM change;
3. one-to-four slow-frame substep selection;
4. pause freezing clock and note/command cursors; and
5. equality between 23 seconds of continuous simulation and snapshot restore plus replay from the matching earlier snapshot;
6. simultaneous-group activation delay followed by reverse update/after-update order; and
7. exclusion of a note that deactivates during update from the after-update pass.

The final equality compares in-game seconds, music position, note-group index, and command-group index. It also verifies that replay does not increase the live-input sample counter.

## Float Boundary Finding

The first harness run failed by exactly one second after restore. The cause was not the recovered replay algorithm: the initial model used raw `floor(inGameSeconds)` to decide whether a new integer-second snapshot should be captured. Repeated binary floating-point `1/60` additions can leave the value just below an integer.

The corrected model tracks the previously captured integer-second key and applies a small comparison tolerance at the boundary. A production reimplementation should likewise preserve an explicit snapshot-second cursor or use a fixed/integer time representation rather than infer crossings from an unqualified floating-point floor.

This finding is an implementation requirement derived from exercising the recovered algorithm, not a newly confirmed managed field in the original game.

## Recovery Assessment

The project now contains enough confirmed behavior to implement a deterministic rhythm-engine kernel for:

- tempo-map timekeeping;
- note scheduling and state phases;
- input judgement and result aggregation;
- Long/Slide/Flick completion and timeout;
- pause freezing; and
- snapshot-backed practice seeking.

What remains before claiming broad gameplay parity is primarily state breadth rather than the central scheduler: complete skill/score modes, upstream equal-position group construction order, audio synchronization/backend behavior, chart-wide asset/effect behavior, and runtime comparison against real play sessions.

## Files

- `engine_harness.py`: deterministic model.
- `test_engine_harness.py`: standard-library `unittest` suite.
- `targets.tsv`: mapping from recovered evidence to modeled behavior.
- `validation_results.json`: machine-readable validation summary.

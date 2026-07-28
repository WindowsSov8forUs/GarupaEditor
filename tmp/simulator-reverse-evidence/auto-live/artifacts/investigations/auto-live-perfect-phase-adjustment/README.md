# Auto Live Perfect Phase Adjustment

## Result

`NoteSingleBase.MoveState` now has a closed static trigger chain. It samples
`NoteManager.GetAdjustMusicPos`, waits until that adjusted score position first
reaches the note absolute position, checks `InGameCalculatedData.get_IsAutoPlay`,
and dispatches the note's `forcePerfect` virtual method in the same update.
`NoteSingleBase.forcePerfect` submits `Perfect (4)`.

`JudgementAdjustValueB` is therefore part of the formal-play particle phase
model. Each unit advances or rewinds the sampled score position by one
tempo-aware `1/60 s` step. Scanning the recovered UI range `[-5, 5]` shows
that the prior `B=0` portable range does not overlap the formal-play range,
while `B=4` moves the portable median to within `1.736498 ms` and places the
portable range inside the formal-play range.

## Boundary

`B=4` is an explanation, not a captured runtime fact. The `LiveCoreSettings`
file active during the formal recording has not yet been read, so this artifact
does not replace the earlier PlayerLoop, random-stream, particle lifecycle, or
GPU parity boundaries. Long and Slide force-perfect paths also remain
type-specific work.

Follow-up runtime evidence under `../formal-play-live-core-settings/` decrypts
the same AVD's physical `settings/lcs` file and confirms effective persisted
`B=0`. It therefore rejects the `B=4` explanation and leaves the original phase
gap open. This artifact remains the pre-capture parameter sweep rather than
rewriting that historical boundary.

The user completed another formal play before this pass, but the AVD process
was no longer connected when collection resumed. No new recording was needed
for this static phase scan; the persisted settings file can be pulled in a
later minimal read-only AVD session without replaying the song.

## Reproduce

```powershell
python analyze_auto_live_perfect_phase_adjustment.py
python verify_auto_live_perfect_phase_adjustment.py
```

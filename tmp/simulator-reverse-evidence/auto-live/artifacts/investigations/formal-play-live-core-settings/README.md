# Formal-play LiveCoreSettings

## Result

The same AVD's Live Core settings were pulled read-only after the fresh formal
play. Runtime storage maps `PersistentDataUtility.DataType.LiveCoreSettings`
value `5` to `files/settings/lcs`; the previous physical filename
`LiveCoreSettings` was incorrect.

The 48-byte ciphertext decrypts to a 41-byte
`CE.LiveCoreSettingsProtoData`. Protobuf members 3 and 36 are absent, so both
effective adjustment values are zero. The file's remote mtime predates the
formal capture and it remained the persisted settings source through the fresh
play.

## Phase Consequence

The runtime evidence rejects the earlier `B=4` explanation. With persisted
`B=0`, the portable 30 Hz particle peak range still begins `16.2892 ms` after
the formal range maximum. The next reverse boundary is therefore again exact
ParticleSystem lifecycle, update/render scheduling, random consumption,
capture sampling, or another timing input—not the secondary judgement slider.

No APK patching, process attach, hook, or process-memory write was used. A live
translated-arm object read at an exact recorded frame was not obtained, so the
artifact separately labels the persisted-source binding and that remaining
object-level boundary.

## Reproduce

```powershell
python analyze_formal_play_live_core_settings.py
python verify_formal_play_live_core_settings.py
```

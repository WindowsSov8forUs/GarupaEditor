# Auto Live Runtime Contract

## Result

This investigation promotes the managed Auto Live contract for
`jp.co.craftegg.band` 10.1.3 (229), `arm64-v8a`.

The closed path is:

```text
NoteManager adjusted music position
→ note-family Move/OnUpdate state method
→ InGameCalculatedData.get_IsAutoPlay
→ family-specific Force Perfect route
→ Perfect (4) judgement construction
→ first-unused OneFrameData slot
→ one outer-frame ReflectOneFrameData pass
```

Normal, Flick, Directional Flick, Long, and Slide remain type-specific. Long
uses `>=` for its head and strict `>` for its tail. Slide evaluates one selected
pending node per `forcePerfectOnUpdate` call. Parent Long/Slide notes own their
after objects; after objects are not roots in the NoteManager active list.

`InitOneFrameDataList` creates exactly five containers. Acquisition scans from
slot zero and returns the first `IsUse == false` object. `OneFrameData.Setup`
sets `IsUse`; reflection scans in pool order and clears each consumed flag.

## Flick correction

`NoteFlickBase.forcePerfect` first dispatches the inherited synthetic Began
route, then dispatches synthetic Moved with the family getter value. Ordinary
Flick returns `-100.0f`. Directional source type 10 returns `-500.0f`; source
type 11 returns `+500.0f`. Other directional types enter the original enum
exception route and are not accepted by the portable contract. The Began and
Moved sequence produces one judgement entry, not two.

## OneFrame stage boundary

The native judgement pipeline computes score, power, life, Skill, Fever,
Crescendo, sound, display, and record effects around the same data. Those
consumers are not replaced with zeroes here. The fixed oracle retains only the
fields independently closed for Auto Live: note identity/buttons/type,
Perfect raw and identity-adjusted result, `addCombo = 1`, absolute position,
and `JudgeTiming.None`.

## Source revision

The earlier `auto_live_perfect_phase_adjustment.json` embedded stale profiles
for its timing-chain input, and `formal_play_live_core_settings.json` retained
the historical phase-scan profile. `auto_live_runtime_contract.json` records
the actual committed blobs and the revision relation. The persisted formal
sample uses `B=0`; the former `B=4` explanation remains rejected. B=0 is a
sample setting, not a global default.

## Offline oracle

`generate_auto_live_fixed_event_trace.py` is a deterministic, backend-neutral
projection of the promoted static branches. It uses method fixtures rather
than claiming synthetic cases are runtime charts. Python is only an offline
oracle generator; GarupaEditor production and tests consume the committed JSON
and never execute this script.

## Boundaries

This contract does not claim manual input, ordinary timeout Miss, score/life,
Skill/Fever, audio, particles, rendering, Unity PlayerLoop presentation, or
GPU parity. HABAHIRO remains static-only for runtime behavior, as recorded by
the upstream simulator evidence.

## Reproduce

```powershell
python generate_auto_live_fixed_event_trace.py
python verify_auto_live_runtime_contract.py
```

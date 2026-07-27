# Clock Scheduling Handoff Report

Written 2026-07-27. One-sentence summary: **`オートライブ` causes `通信に失敗しました`;
turn it off and every live starts normally, with or without Frida attached.**

The capture window without auto-play is ~75 s before the life gauge empties, which covers every
row this investigation needs. The collector is proven on both 10.1.3 and the locked 10.1.4
baseline, with a strict automatic version guard. Both judgement-offset rows and reverse-index
ordering are closed. No ordinary capture task remains: the lower fallback thresholds are blocked
by collector perturbation/runtime reachability, while two chart-specific rows are unavailable.

---

## 1. Locked Baseline

| Item | Value |
| --- | --- |
| Package | `jp.co.craftegg.band` **`10.1.4`** / **`230`** |
| `libil2cpp.so` | `815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F` |
| Device | `FICIPZUGEIQC4P7H`, OPPO A56 5G, LineageOS 20 GSI, Android 13, arm64 |
| frida-server | `frida-server-17.15.3` on `127.0.0.1:47913` under a supervisor |
| Host Frida | Python `frida` 17.15.3 |
| Address migration | `artifacts/investigations/package-version-rebaseline-10-1-4/` — 70 hooks, 7 probes, 6 constants, 8 types, all verified |

The 10.1.3 evidence is frozen separately as its own closed sample. It is cross-version corroboration,
never merged. Everything that gates `S02` is in `closure.json` → `version_10_1_4`; the top-level
`sample_matrix` records 10.1.3 only.

## 2. What Is Frozen (promoted into the package)

### 2.1 On 10.1.4 / 230 (the locked version)

| run_id | Events | Coverage | auto-live? |
| --- | ---: | --- | --- |
| `ikuoku-cc08-run-030-120-mode` | 47,712 | 120 request, CC08 lifecycle | yes |
| `settings-run-031-high-frequency-toggle` | 176 | frame-rate UI owner | — |
| `ikuoku-cc08-run-032-scheduling-60` | 47,030 | 60 request, CC08 lifecycle, two-phase scheduling, adaptive | yes |
| `ikuoku-cc08-run-033-pause-bracket` | 56,799 | pause before, pause after | yes |

Runs 030 and 032–033 are in `build_runtime_oracle_10_1_4.py` → `version_10_1_4_runs` in
`sample_manifest.json` and pass the verifiers.

### 2.2 Promoted by the continuation pass

| Run | What it covers |
| --- | --- |
| `tentai-zero-run-034-fresh-process-manual` | Zero-BPM 60-mode (天体観測), **fresh process**, **no auto-play** — 26,072 events, 763 frames, 763 substeps, 0 adaptive decisions, 0 bucket increments |
| `ikuoku-cc08-run-035-pause-during-setup` + `run-036-pause-during-resume` | `pause_during_bpm` split capture — one PID and BPM object; Setup → frozen frame 1081 → resume → BPM 95.5 commit |
| `thesis-cc03-run-037-nonzero-60` | CC03 lifecycle on 10.1.4 |
| `ikuoku-cc08-run-057-offset-plus5` + `run-059-offset-minus5` | both judgement-offset directions across the CC08 boundary |
| `ikuoku-cc08-run-060-full-note-detail` | reverse-index Update order, 16/16 multi-member substeps |

These runs are in `RUNS` in `build_runtime_oracle_10_1_4.py`; their raw, metadata and normalized
artifacts are frozen under the investigation package.

```
py artifacts/investigations/clock-scheduling-runtime-oracle/build_runtime_oracle_10_1_4.py
```

It is the sharpest zero-BPM evidence so far: fresh process plus no auto-live, which is a strictly
cleaner boundary than the pass-2 runs had. The continuation pass updated
`closure.json` → `version_10_1_4.sample_matrix`:

- `normal_zero_bpm_60`: `confirmed`
- `auto_live` is no longer a gating collection boundary; it remains recorded on the seven pass-2
  manifest entries where it actually applies

### 2.3 On 10.1.3 / 229 (frozen, not gate)

`R01`–`R09` (pass 1), `R10`–`R22` (pass 2, 7 runs), all locked with hashes in the GarupaEditor
requirements doc. The 10.1.3 verifier stage still asserts them.

## 3. 10.1.4 Matrix — Which Rows Block `S02`

| Row | Status | Why |
| --- | --- | --- |
| `same_nonzero_120` | **confirmed** | run 030 |
| `nonzero_cc08_60` | **confirmed** | run 032 |
| `cross_bar_bpm_command` | **confirmed** | run 032 |
| `pause_before_bpm` | **confirmed** | run 033 |
| `pause_after_bpm` | **confirmed** | run 033 |
| `normal_zero_bpm_60` | **confirmed** | run 034 |
| `slow_frame_2_3_4` | observed (collector-induced) | — |
| `fallback_101_21_6` | partial (`counter[3]` confirmed) | runs 061–067 bound `counter[1]`/`counter[2]` as unreachable under required observation |
| `habahiro_zero_bpm_60` | **blocked** — chart unavailable | limited-time event, account can't select it |
| `pause_during_bpm` | **confirmed (split capture)** | runs 035–036 |
| `nonzero_cc03_60` | **confirmed** | run 037 on `087_thesis_easy` |
| `positive_offset_cross_bpm` | **confirmed** | run 057 crosses bar 15→16 and switches 99.5→95.5 inside one call |
| `negative_offset_cross_bpm_bar` | **confirmed** | run 059 crosses bar 16→15; all timed steps retain current 95.5 |
| `same_batch_multiple_bpm` | static-only | frozen from decompiler, not a capture task |
| `launcher_crosses_multiple_batches` | static-only | same |
| `counter[1]`/`counter[2]` fallback | **blocked — observation perturbs reachability** | runs 061–067 bracket heavy and light hook sets; no configuration accumulates either threshold |
| reverse-index Update | **confirmed** | run 060: 16/16 multi-member substeps match reverse list order |
| pool cursor-wrap | **blocked — production chart unavailable** | all 4,176 cached BMS scanned; maximum is 16 BPM commands, below the required 31 |

## 4. How To Capture: The One Rule That Changed Everything

**Do not turn on `オートライブ`.** It triggers a server-side consumption request that fails
persistently on this account, before the live is committed, returning `通信に失敗しました` with
no LP consumed and no crash.

This was proven by four controlled trials. The variable is `オートライブ`, not Frida (the
failure reproduces with no session attached) and not general network reachability (a live
starts normally within the same process the instant the toggle is off). The live then runs for
~75 s unattended before the gauge empties, which covers every row.

The pass-2 runs (all seven of them) used auto-play and therefore carry an `auto_live` boundary
in their evidence. Runs captured from here on do not carry that boundary.

## 5. Starting A Capture — Cookbook

### 5.1 Device is already configured

```powershell
# frida-server is running under supervisor on 127.0.0.1:47913
adb shell "ps -A | grep frida-server-17"
# adb forward is active
adb forward --list  # should show tcp:47913 tcp:47913
```

If frida-server is down:

```powershell
adb shell "su -c 'nohup setsid sh /data/local/tmp/frida-supervisor.sh /data/local/tmp/frida-server-17.15.3 47913 >/dev/null 2>&1 &'"
sleep 2
adb forward tcp:47913 tcp:47913
```

### 5.2 Capture command template

```powershell
nohup python artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py `
    --frida-remote 127.0.0.1:47913 --device-serial FICIPZUGEIQC4P7H `
    --package jp.co.craftegg.band --duration 240 `
    --profile <PROFILE> --output-dir runtime/captures/clock-scheduling/<RUN-DIR> `
    [--expected-bms artifacts/investigations/clock-scheduling-runtime-oracle/sources/<BMS>.bms.txt] `
    [--note-detail-duty 1:29] [--detail-window-on ...] [--input-on ...] [--input-after ...] `
    > runtime/captures/clock-scheduling/<RUN-DIR>.log 2>&1 &
```

The `--package` flag makes the script run `dumpsys package` to read the installed version and
select the correct address table. Version 230 is the proven one; any other version is refused.

### 5.3 Screen coordinates (rotated 1600×720, density 336)

```
┌──────────────────────────────────────────────────┐  y=0
│  ← (back) 127,47          (menu) 1470,47 ──→    │   ~50
│                                                  │
│  band list        confirm       live start /    │
│  575,262           1330,618      pause / resume  │
│  575,430    etc     2nd row:    ───────────────  │
│  575,598            1330,618    1242,589          │  ~600
│                                                  │
│  auto toggle    フリーライブ    EASY              │
│  1027,558         948,362       575,430          │
│                                                  │
│  retire/cancel    dialog OK     retry             │
│  562,440 / 681,507  914,440    916,507           │
│                                                  │
│  live bonus collect / dismiss                    │
│     798,592       1184,619                       │
│  rank-up / story skip                            │
│     798,508       915,439                        │
│  rehearsal exit / skip                           │
│     1428,55       770,55                         │
│                                                  │
│  ライブ設定 tab         演出・音量 tab            │
│     490,175              700,175                 │
│  フレームレート 60FPS/120FPS                      │
│     542,345     408,368                          │
│  judge timing + button / − button                │
│     988,341            823,341                   │
└──────────────────────────────────────────────────┘  y=720
```

### 5.4 Navigation flow to a live start

```
Home (1418,663) → フリーライブ (948,362) → pick song → confirm (1330,618)
  → ENSURE オートライブ IS OFF (label reads オートライブOFF or toggle OFF)
  → live start (1242,589)
```

Always screenshot (`adb exec-out screencap -p > file.png`) before every tap in a new flow.
Never batch taps across a screen transition. Two incidents in the log are caused by this.

## 6. Closed Rows And Explicit Boundaries

### A. `pause_during_bpm` — completed by runs 035–036

The original one-run recipe below did not survive the no-auto-live boundary: life reached zero at
frame 646, before CC08 Setup near frame 1076. The completed capture used the client Continue flow,
then repeated pause-button input after the countdown to win the UI race. Run 035 records Setup,
pause entry and a frozen resident BPM object; run 036 attaches to the same PID and object while
paused, then records resume and commit. See `summaries/pause_during_bpm_10_1_4.json` for the
machine-checked pair and its explicit input/split-capture boundary.

The initial recipe is retained for history:

```powershell
nohup python artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py `
    --frida-remote 127.0.0.1:47913 --device-serial FICIPZUGEIQC4P7H `
    --package jp.co.craftegg.band --duration 250 `
    --profile pause --note-detail-duty 1:29 `
    --input-on "bpm_object_setup_leave=input tap 1482 47" `
    --input-after "150=input tap 1033 440" `
    --expected-bms artifacts/investigations/clock-scheduling-runtime-oracle/sources/653_ikuoku_easy.bms.txt `
    --output-dir runtime/captures/clock-scheduling/n14-ikuoku-pause-during `
    > runtime/captures/clock-scheduling/n14-ikuoku-pause-during.log 2>&1 &
```

Chart: `幾億光年 EASY` (`653_ikuoku_easy`). The `--input-on` fires when the BPM object finishes
Setup (at ~frame 960, ~39 s), pausing while the command is active. `--input-after` resumes at
t+150 s. Confirm on the band-confirm screen that auto-live is off, then tap `1242,589`.

### B. `nonzero_cc03_60` — CC03 lifecycle on 10.1.4

Completed by `thesis-cc03-run-037-nonzero-60`: 36,309 events, complete metadata and zero
collector faults. The trace starts at BPM 85 (`"85"`) and records CC03 at launcher bar 7,
absolute position 1456.3175, followed by the `85 → 140` update and `on_bpm_changed` callbacks.
The run used `オートライブ OFF`; the life gauge reached zero after the target boundary, so the
client Continue flow was used to let the collector finish.

```powershell
nohup python artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py `
    --frida-remote 127.0.0.1:47913 --device-serial FICIPZUGEIQC4P7H `
    --package jp.co.craftegg.band --duration 220 `
    --profile bpm-lifecycle `
    --output-dir runtime/captures/clock-scheduling/n14-thesis-cc03 `
    > runtime/captures/clock-scheduling/n14-thesis-cc03.log 2>&1 &
```

Chart: `残酷な天使のテーゼ EASY` (`087_thesis_easy`), pick from the song list at ~575,430.
Expected: start BPM 85/"85", CC03 at bar 7 / absolute position 1344 → BPM 140/"140", launcher
lead 68. No `--expected-bms` because the frozen source was derived from the bundle, not hoisted
to the source directory yet, but the trace will record the consumed string.

### C. `normal_zero_bpm_60` warm-process — after a BPM-change chart

After run B finishes, the process now has the CC03 chart parsed, so `NoteManager+0x74 > 0`.
Navigate to `天体観測 EASY` (575,262) and capture:

```powershell
nohup python artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py `
    --frida-remote 127.0.0.1:47913 --device-serial FICIPZUGEIQC4P7H `
    --package jp.co.craftegg.band --duration 240 `
    --profile scheduling --note-detail-duty 1:29 `
    --output-dir runtime/captures/clock-scheduling/n14-tentai-zero-warm `
    > runtime/captures/clock-scheduling/n14-tentai-zero-warm.log 2>&1 &
```

Expected: frames > substeps (adaptive path engaged despite zero chart-level BPM changes).
This is the warm counterpart to the already-captured `n14-tentai-zero-manual`.

### D. `positive_offset_cross_bpm` — judge offset +5

First, set the judge offset to +5 in `ライブ設定` (490,175 → tap 988,341 five times).
Then on `幾億光年 EASY` with auto-live off:

```powershell
nohup python artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py `
    --frida-remote 127.0.0.1:47913 --device-serial FICIPZUGEIQC4P7H `
    --package jp.co.craftegg.band --duration 230 `
    --profile judge-offset --judge-arm-at-frame 300:150 `
    --judge-arm-on bpm_object_setup_leave:400 --judge-step-budget 6000 `
    --expected-bms artifacts/investigations/clock-scheduling-runtime-oracle/sources/653_ikuoku_easy.bms.txt `
    --output-dir runtime/captures/clock-scheduling/n14-ikuoku-offset-plus5 `
    > runtime/captures/clock-scheduling/n14-ikuoku-offset-plus5.log 2>&1 &
```

### E. `negative_offset_cross_bpm_bar` — judge offset −5

Set offset to −5 (823,341 ten times), then arm the probes **after** the BPM commit so the
negative-direction stepping window spans the tempo change (the one thing 10.1.3 never captured):

```powershell
nohup python artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py `
    --frida-remote 127.0.0.1:47913 --device-serial FICIPZUGEIQC4P7H `
    --package jp.co.craftegg.band --duration 230 `
    --profile judge-offset --judge-arm-on "on_bpm_changed_leave:200" --judge-step-budget 6000 `
    --expected-bms artifacts/investigations/clock-scheduling-runtime-oracle/sources/653_ikuoku_easy.bms.txt `
    --output-dir runtime/captures/clock-scheduling/n14-ikuoku-offset-minus5 `
    > runtime/captures/clock-scheduling/n14-ikuoku-offset-minus5.log 2>&1 &
```

Key difference from the pass-2 run: `--judge-arm-on "on_bpm_changed_leave:200"` instead of
`"bpm_object_setup_leave:400"`. The commit happens at bar 16 where the BPM changes from 99.5
to 95.5, so arming after it puts the sampling window where the direction change matters.

### F. Judgement offsets — completed by runs 057 and 059

`ikuoku-cc08-run-057-offset-plus5` records frame 1473 crossing bar 15→16 in one
`FastAbsolutePos(+5)` call. Its timed steps switch from BPM 99.5 to 95.5 at the boundary.

`ikuoku-cc08-run-059-offset-minus5` records frame 1452 crossing bar 16→15 in one
`SlowAbsolutePos(-5)` call after the 95.5 commit. The routine retains BPM 95.5 for every timed
step, including those whose cursor is in bar 15; it does not re-read the prior bar's 99.5 BPM.
This is a confirmed original-client result, not a missing sample.

Both valid runs used `--batch-flush-ms 25`, one quarter of the earlier 100 ms interval. This only
reduces the Frida host-event delivery component; it does not cancel adb/sendevent injection delay
or the game's next input-sampling delay. The 16-tick (`+5`) and 3-tick (`-5`) leads were empirical
for those two runs, not a reusable fixed correction. Runs 061–067 use no touch injection at all.
The game judgement offset was restored from `-5` to `0` after run 059. Do not use Continue: its
confirmation consumes 50 stars.

Don't forget to reset the judge offset to 0 afterwards (this was never documented). It's in the
same `ライブ設定` tab.

### G. Reverse-index Update — completed by run 060

`ikuoku-cc08-run-060-full-note-detail` sampled 16 substeps with two main active-list members.
After excluding nested child updates whose pointers are absent from the manager list, all 16
substeps update the main members in the exact reverse of list order.

### H. Adaptive fallback — bounded by runs 061–067

All seven fallback-tuning runs used `--batch-flush-ms 25` and no autoplay or touch injection.
The heavy minimal profile immediately perturbed frames into buckets 2/3 and reached `counter[3] =
6`; progressively lighter profiles sustained bucket 0, with run 067 producing only two isolated
bucket-2 frames. None produced a bucket-1 frame or enough bucket-2 frames to reach 21. The static
threshold comparisons are confirmed, but dynamic `counter[1]`/`counter[2]` threshold samples are
blocked by observation-induced perturbation/runtime reachability and remain fail-closed.

### I. BPM pool cursor-wrap — production chart unavailable

The frozen cache scan covers 81 musicscore bundles and 4,176 BMS assets. Of those, 445 contain
CC03/CC08 commands; the maximum is 16 commands in `477_shinjidai_*`. No production chart in the
cache can produce the 31 acquisitions required to wrap the 30-slot cursor. A synthetic chart is
not valid evidence for this row.

### Prohibited: `コンティニュー`

The failure dialog's `コンティニュー` confirmation consumes 50 stars. Do not use it. Select the
left `リタイア`, then confirm the right `リタイア`; start a fresh run if another capture is ever
required.

## 7. Updating The Frozen Evidence Package After A Capture

After each capture finishes (watch for `capture_metadata.json` to appear), promote it:

1. Add the working directory to `RUNS` in `build_runtime_oracle_10_1_4.py` with a descriptive `run_id`,
   `purpose`, `coverage` and `music_score_key`.

2. Run the builder:
   ```powershell
   py artifacts/investigations/clock-scheduling-runtime-oracle/build_runtime_oracle_10_1_4.py
   ```

3. Update `closure.json` → `version_10_1_4`:
   - Add the new run to `runs`
   - Set the corresponding `sample_matrix` row
   - If the row was `blocked-network` before, remove it from `recapture_blocker`

4. Run the offline verifier to check hashes, sequence monotonicity, version separation,
   and the locked-version assertions:
   ```powershell
   py artifacts/investigations/clock-scheduling-runtime-oracle/verify_runtime_oracle.py
   ```

5. Regenerate SHA256SUMS:
   ```powershell
   cd artifacts/investigations/clock-scheduling-runtime-oracle
   py -c "…script to regenerate sums…"  # or reuse the one-liner from the log
   ```

6. Commit with a message like `feat(runtime): 冻结 10.1.4 <description>`.

## 8. Key Files And What They Own

| Path | Role |
| --- | --- |
| `artifacts/investigations/clock-scheduling-runtime-oracle/capture_clock_scheduling_runtime.py` | The Frida capture script — agent source, host collector, DeviceInput, TraceWriter, VERSION_TABLES |
| `artifacts/investigations/clock-scheduling-runtime-oracle/closure.json` | The gate: `version_10_1_4.sample_matrix` decides `S02`. Contains full per-row status |
| `artifacts/investigations/clock-scheduling-runtime-oracle/sample_manifest.json` | Run hashes; 10.1.3 and 10.1.4 in separate keys |
| `artifacts/investigations/clock-scheduling-runtime-oracle/verify_runtime_oracle.py` | Offline verifier: sums, version pins, locked-version assertions, per-branch assertions |
| `artifacts/investigations/clock-scheduling-runtime-oracle/build_runtime_oracle_10_1_4.py` | Builder for 10.1.4 runs — streams traces, gzips, writes normalized extracts |
| `artifacts/investigations/package-version-rebaseline-10-1-4/version_map.json` | The 70+7+6 address mapping from 229→230, with word-level probe comparison |
| `artifacts/investigations/package-version-rebaseline-10-1-4/verify_version_rebaseline.py` | Offline verifier for the address map |
| `HOST________/VSCode/GarupaEditor/tmp/simulator-clock-scheduling-reverse-evidence-requirements.md` | The evidence requirements list — sections 1–26, hashes of every frozen artifact |
| `docs/CLOCK_SCHEDULING_CAPTURE_LOG.md` | The operational log — every incident, every decision |

## 9. The Capture Script's Data Flow

```
game process ←→ Frida IPC ←→ frida-server-17.15.3 (device, 127.0.0.1:47913)
                                  ↑ adb forward
                            host Python process
                                  ↓
on_message()  ──enqueue only──→  TraceWriter(threading.Thread)
                                  │ serialization, hashing, BMS side-files
                                  │ flush per batch (not per event)
                                  │ script.post() from here, not from on_message
                                  │ device input from here
                                  ↓
                            runtime_trace.jsonl  (55–72 MB per run)
                                  ↓ builder
                            traces/raw/*.jsonl.gz  (deterministic, ~1.5 MB)
                            traces/normalized/*.?.jsonl
                            summaries/*.json
```

The collector metadata records `max_queue_depth_batches` and `fault_count` per run. Every frozen
run so far reads `max_queue_depth_batches ≤ 1` and `fault_count = 0`, so host backpressure was
never the bottleneck.

The agent's `readString(pointer, limit)` has a general cap of `MAX_STRING_CHARS = 256` and a
separate `BMS_MAX_STRING_CHARS = 262144` used only for the chart text in `NoteManager.analyzeBMS`.
Do not lower or remove the BMS cap without also checking that the writer-side handler for
non-string `runtime_bms_text` (the `isinstance` guard in `_write_event`) still catches the
rejection dict and does not crash.

## 10. The `オートライブ` Incident In Full

The capture log (`docs/CLOCK_SCHEDULING_CAPTURE_LOG.md` incident 9) records this with the raw
timeline. The condensed version for a session that picks up from here:

- Live-start attempts with `オートライブ` ON fail with `通信に失敗しました`, no LP consumed,
  regardless of whether Frida is attached.
- The same live starts normally with `オートライブ` OFF, with or without Frida.
- `api.garupa.jp` curl tests from the shell UID are unreliable because Android applies VPN routing
  per UID, and the shell UID's route is not the game process's. The client's own behaviour is the
  only reliable signal.
- The earlier entries in the log that attributed these failures to VPN API routing (incident 7)
  are corrected inline. The evidence they listed (no crash, no exception, no LP consumed, retry
  reproduces) was all correct; the conclusion drawn from it was not.
- The `auto_live: true` collection boundary on the pass-2 sample manifest remains true for those
  runs but no longer applies to runs captured from here on.

## 11. General Warnings

- The capture script **refuses any package version it has no proven table for**. Touching
  `VERSION_TABLES` without re-proving every entry invalidates the version guard.
- `closure.json` now records the auto-live incident as resolved and carries no `blocked-network`
  row. No ordinary capture work remains: the remaining rows are explicit chart-availability or
  observation/runtime-reachability boundaries and stay fail-closed.
- The 10.1.3 dump (`static/il2cpp/dump/`) is the source of every tracked index in `artifacts/`.
  The 10.1.4 dump (`static/il2cpp/dump-10.1.4_230/`) was used only for the bounded clock-scheduling
  target migration. Swapping the active dump would rewrite every index and invalidate every frozen
  hash. Don't do it without a separate decision.
- The `runtime/tools/` directory is modified copies of `scan_il2cpp_object` / `scan_memory_bytes`
  from the device, not real tools. It is specifically excluded from the evidence chain.
- The HABAHIRO row is blocked by chart availability, not by a collection gap. `786 miracle_april`
  SPECIAL is exclusive to a limited-time event and cannot be selected on this account. Don't
  substitute another wide-lane chart for it. If the event returns, a single 60-mode capture on
  that chart closes it.

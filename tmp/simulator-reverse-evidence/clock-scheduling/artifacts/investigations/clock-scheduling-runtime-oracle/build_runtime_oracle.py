from __future__ import annotations

import gzip
from hashlib import sha256
import json
from pathlib import Path
import shutil
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).resolve().parent
CAPTURE_ROOT = ROOT / "runtime" / "captures" / "clock-scheduling"
RESET_PROBE_CAPTURE = CAPTURE_ROOT / "ikuoku-cc08-run-006-reset-note"

SAMPLES = {
    "cc03": {
        "capture": CAPTURE_ROOT / "thesis-cc03-run-001",
        "run_id": "thesis-cc03-run-001",
        "song_id": 87,
        "song_name": "残酷な天使のテーゼ",
        "difficulty": "easy",
        "music_score_key": "087_thesis_easy",
        "bundle_path": "musicscore/musicscore90",
        "bundle_sha256": "B46BBCB3EC4EB79D5462353AEEB4F7624032BEAFEADD298EFFF150DB4C71E538",
        "bundle_cache_key": None,
        "bundle_bms": None,
        "command": {"cc_num": 3, "bar_index": 7, "numerator": 0, "denominator": 1, "absolute_pos": 1344, "bpm": 140.0, "bpm_string": "140"},
    },
    "cc08": {
        "capture": CAPTURE_ROOT / "ikuoku-cc08-run-003",
        "run_id": "ikuoku-cc08-run-003",
        "song_id": 653,
        "song_name": "幾億光年",
        "difficulty": "easy",
        "music_score_key": "653_ikuoku_easy",
        "bundle_path": "musicscore/musicscore660",
        "bundle_sha256": "14172F64733E58E275EF7665F8A451236386B3FE1FD45C83342C23457EAC8029",
        "bundle_cache_key": "732902106be3618450695e273c48219a2d915e6f6c118b87c45586395fa85c42",
        "bundle_bms": CAPTURE_ROOT / "653_ikuoku_easy.bundle.txt",
        "command": {"cc_num": 8, "bar_index": 16, "numerator": 0, "denominator": 1, "absolute_pos": 3072, "bpm": 95.5, "bpm_string": "95.5"},
    },
}

LIFECYCLE_EVENTS = {
    "agent_ready",
    "target_frame_rate_requested",
    "factory_create_enter",
    "factory_create_leave",
    "builder_initialize_enter",
    "builder_initialize_leave",
    "director_awake_enter",
    "director_awake_leave",
    "manager_init_enter",
    "manager_init_leave",
    "analyze_bms_enter",
    "analyze_bms_leave",
    "setup_notes_enter",
    "setup_notes_leave",
    "setup_first_progress_enter",
    "setup_first_progress_leave",
    "setup_bpm_change_enter",
    "setup_bpm_change_leave",
    "bpm_pool_acquire_leave",
    "bpm_object_setup_enter",
    "bpm_object_setup_leave",
    "bpm_object_reset_enter",
    "bpm_object_reset_leave",
    "bpm_pool_reset_note_enter",
    "bpm_pool_reset_note_leave",
    "bpm_object_update_enter",
    "bpm_object_update_leave",
    "bpm_object_commit_enter",
    "update_bpm_enter",
    "update_bpm_leave",
    "on_bpm_changed_enter",
    "on_bpm_changed_leave",
    "bpm_object_commit_leave",
}


def file_digest(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_events(path: Path) -> list[dict[str, Any]]:
    events = []
    with path.open("r", encoding="utf-8") as source:
        for line in source:
            events.append(json.loads(line))
    return events


def first(events: list[dict[str, Any]], event_name: str) -> dict[str, Any]:
    return next(event for event in events if event.get("event") == event_name)


def last(events: list[dict[str, Any]], event_name: str) -> dict[str, Any]:
    return next(event for event in reversed(events) if event.get("event") == event_name)


def deterministic_gzip(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with source_path.open("rb") as source, target_path.open("wb") as target:
        with gzip.GzipFile(filename="", mode="wb", fileobj=target, mtime=0) as compressed:
            shutil.copyfileobj(source, compressed, length=1024 * 1024)


def build_sample(sample_id: str, config: dict[str, Any]) -> dict[str, Any]:
    capture = config["capture"]
    trace_path = capture / "runtime_trace.jsonl"
    metadata_path = capture / "capture_metadata.json"
    bms_path = capture / "runtime_consumed_bms_001.txt"
    events = load_events(trace_path)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    source_target = OUTPUT / "sources" / f"{config['music_score_key']}.bms.txt"
    source_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(bms_path, source_target)
    bundle_source_target = None
    if config["bundle_bms"] is not None:
        bundle_source_target = OUTPUT / "sources" / f"{config['music_score_key']}.bundle-textasset.txt"
        shutil.copyfile(config["bundle_bms"], bundle_source_target)

    metadata_target = OUTPUT / "traces" / "raw" / f"{config['run_id']}.metadata.json"
    write_json(metadata_target, metadata)
    raw_target = OUTPUT / "traces" / "raw" / f"{config['run_id']}.jsonl.gz"
    deterministic_gzip(trace_path, raw_target)

    setup = first(events, "bpm_object_setup_leave")
    commit = first(events, "bpm_object_commit_enter")
    window_frames = {
        frame
        for anchor in (setup["frame_id"], commit["frame_id"])
        for frame in range(anchor - 2, anchor + 3)
    }
    normalized = [
        event
        for event in events
        if event.get("event") in LIFECYCLE_EVENTS
        or (
            event.get("event")
            in {"frame_enter", "frame_leave", "clock_substep_enter", "clock_substep_leave", "activate_bpm_process_enter", "activate_bpm_process_leave"}
            and event.get("frame_id") in window_frames
        )
    ]
    normalized_target = OUTPUT / "traces" / "normalized" / f"{config['run_id']}.lifecycle.jsonl"
    normalized_target.parent.mkdir(parents=True, exist_ok=True)
    with normalized_target.open("w", encoding="utf-8", newline="\n") as target:
        for event in normalized:
            target.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")

    setup_first_enter = first(events, "setup_first_progress_enter")
    setup_first_leave = first(events, "setup_first_progress_leave")
    callback_enter = first(events, "on_bpm_changed_enter")
    callback_leave = first(events, "on_bpm_changed_leave")
    commit_leave = first(events, "bpm_object_commit_leave")
    update_enter = next(event for event in events if event.get("event") == "update_bpm_enter" and event.get("frame_id") == commit["frame_id"])
    update_leave = next(event for event in events if event.get("event") == "update_bpm_leave" and event.get("frame_id") == commit["frame_id"])
    pool_acquire = first(events, "bpm_pool_acquire_leave")
    first_frame = first(events, "frame_enter")
    last_frame = last(events, "frame_leave")
    substeps = [event for event in events if event.get("event") == "clock_substep_enter"]
    setup_pointer = setup["bpm_object"]["pointer"]

    lifecycle = {
        "run_id": config["run_id"],
        "command": config["command"],
        "activation": {
            "frame_id": setup["frame_id"],
            "substep_id": setup["substep_id"],
            "object_pointer": setup_pointer,
            "note_info_pointer": setup["bpm_object"]["note_info"]["pointer"],
            "active_after_setup": setup["bpm_object"]["active"],
            "pool_cursor_after_acquire": pool_acquire["manager"]["bpm_pool_cursor"],
            "active_list_after_setup": first(events, "setup_bpm_change_leave")["manager"].get("active_bpm_list"),
        },
        "commit": {
            "frame_id": commit["frame_id"],
            "substep_id": commit["substep_id"],
            "music_position_at_commit": callback_enter["manager"]["controller"]["music_absolute_pos"],
            "current_before_update": update_enter["controller"]["current_bpm"],
            "current_after_update": update_leave["controller"]["current_bpm"],
            "current_string_after_update": update_leave["controller"]["current_bpm_string"],
            "active_at_commit_enter": commit["bpm_object"]["active"],
            "active_at_callback": callback_enter["bpm_object"]["active"],
            "active_list_before_callback": callback_enter["manager"].get("active_bpm_list"),
            "active_list_after_callback": callback_leave["manager"].get("active_bpm_list"),
            "active_at_commit_leave": commit_leave["bpm_object"]["active"],
        },
        "identity_checks": {
            "same_object_through_commit": setup_pointer == commit_leave["bpm_object"]["pointer"],
            "callback_removed_immediately": callback_enter["manager"]["active_bpm_count"] == 1 and callback_leave["manager"]["active_bpm_count"] == 0,
        },
        "reset_and_reuse": {"status": "unresolved", "reason": "The current probe has no NoteBpmChange.Reset hook and the run contains only one acquire."},
    }

    initialization = {
        "run_id": config["run_id"],
        "before": setup_first_enter["controller"],
        "after": setup_first_leave["controller"],
        "launcher_lead": setup_first_leave["controller"]["launcher_absolute_pos"] - setup_first_leave["controller"]["music_absolute_pos"],
        "target_frame_rate_requests": [event["value"] for event in events if event.get("event") == "target_frame_rate_requested"],
    }

    adaptive = {
        "run_id": config["run_id"],
        "manager_bpm_change_count": first_frame["manager"]["bpm_change_count"],
        "first_performance_counters": first_frame["manager"]["performance_counters"],
        "last_performance_counters": last_frame["manager"]["performance_counters"],
        "observed_substep_ids": sorted({event["substep_id"] for event in substeps}),
        "maximum_observed_substep_id": max(event["substep_id"] for event in substeps),
        "host_delta": {"status": "unresolved", "reason": "The probe does not record the outer Unity deltaTime argument."},
        "slow_frame_2_3_4": {"status": "unresolved", "reason": "No production slow-frame sample was frozen."},
        "fallback_101_21_6": {"status": "unresolved", "reason": "The run exercises only counter[0] and does not distinguish the three fallback thresholds dynamically."},
    }

    ordering = {
        "run_id": config["run_id"],
        "activation_frame": setup["frame_id"],
        "commit_frame": commit["frame_id"],
        "activation_window": [
            {"sequence": event["sequence"], "frame_id": event["frame_id"], "substep_id": event["substep_id"], "event": event["event"]}
            for event in normalized
            if event.get("frame_id") == setup["frame_id"]
        ],
        "commit_window": [
            {"sequence": event["sequence"], "frame_id": event["frame_id"], "substep_id": event["substep_id"], "event": event["event"]}
            for event in normalized
            if event.get("frame_id") == commit["frame_id"]
        ],
        "note_update_and_after_update": {"status": "unresolved", "reason": "The current probe does not hook Note.Update or AfterUpdate."},
    }

    builder_events = [event for event in events if event.get("event") in {"factory_create_enter", "factory_create_leave", "builder_initialize_enter", "builder_initialize_leave"}]
    builder_counts = [
        {
            "sequence": event["sequence"],
            "event": event["event"],
            "is_command": event.get("is_command") if "is_command" in event else event.get("factory", {}).get("is_command"),
            "count": (event.get("builder") or event.get("factory", {}).get("builder") or {}).get("bpm_values", {}).get("count"),
        }
        for event in builder_events
    ]

    return {
        "metadata": metadata,
        "source": source_target,
        "bundle_source": bundle_source_target,
        "raw": raw_target,
        "raw_original": trace_path,
        "normalized": normalized_target,
        "initialization": initialization,
        "lifecycle": lifecycle,
        "adaptive": adaptive,
        "ordering": ordering,
        "builder_counts": builder_counts,
        "config": config,
    }


def main() -> int:
    results = {sample_id: build_sample(sample_id, config) for sample_id, config in SAMPLES.items()}

    reset_trace_path = RESET_PROBE_CAPTURE / "runtime_trace.jsonl"
    reset_metadata_path = RESET_PROBE_CAPTURE / "capture_metadata.json"
    reset_events = load_events(reset_trace_path)
    reset_metadata = json.loads(reset_metadata_path.read_text(encoding="utf-8"))
    reset_raw_target = OUTPUT / "traces" / "raw" / "ikuoku-cc08-run-006-reset-note.jsonl.gz"
    deterministic_gzip(reset_trace_path, reset_raw_target)
    write_json(OUTPUT / "traces" / "raw" / "ikuoku-cc08-run-006-reset-note.metadata.json", reset_metadata)
    reset_normalized_target = OUTPUT / "traces" / "normalized" / "ikuoku-cc08-run-006-reset-note.pool.jsonl"
    reset_selected = [
        event
        for event in reset_events
        if event.get("event") in {
            "agent_ready",
            "bpm_pool_reset_note_enter",
            "bpm_pool_reset_note_leave",
            "bpm_object_reset_enter",
            "bpm_object_reset_leave",
            "bpm_pool_acquire_leave",
            "bpm_object_setup_enter",
            "bpm_object_setup_leave",
        }
        or (event.get("event") == "hook_installed" and event.get("label") in {"NoteBpmChange.Reset", "NoteBase.ResetNote", "NoteManager.getNoteBpmChangeData"})
    ]
    reset_normalized_target.parent.mkdir(parents=True, exist_ok=True)
    with reset_normalized_target.open("w", encoding="utf-8", newline="\n") as target:
        for event in reset_selected:
            target.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")
    reset_acquire = first(reset_events, "bpm_pool_acquire_leave")
    reset_setup = first(reset_events, "bpm_object_setup_leave")
    previous_setup = results["cc08"]["lifecycle"]["activation"]
    pool_summary = {
        "schema_version": 1,
        "run_id": "ikuoku-cc08-run-006-reset-note",
        "dynamic": {
            "pool_length": reset_acquire["manager"]["bpm_pool_length"],
            "cursor_after_acquire": reset_acquire["manager"]["bpm_pool_cursor"],
            "object_pointer": reset_acquire["bpm_object"]["pointer"],
            "same_pointer_through_setup": reset_acquire["bpm_object"]["pointer"] == reset_setup["bpm_object"]["pointer"],
            "reset_override_event_count": sum(event.get("event") in {"bpm_object_reset_enter", "bpm_object_reset_leave"} for event in reset_events),
            "reset_note_event_count": sum(event.get("event") in {"bpm_pool_reset_note_enter", "bpm_pool_reset_note_leave"} for event in reset_events),
            "previous_run_manager_pointer": first(load_events(results["cc08"]["raw_original"]), "frame_enter")["manager"]["pointer"],
            "previous_run_object_pointer": previous_setup["object_pointer"],
            "new_manager_and_pool": reset_acquire["manager"]["pointer"] != first(load_events(results["cc08"]["raw_original"]), "frame_enter")["manager"]["pointer"] and reset_acquire["bpm_object"]["pointer"] != previous_setup["object_pointer"],
        },
        "static_fast_path": {
            "source": "NoteManager.getNoteBpmChangeData 0x377B80C, artifacts/rhythm/decompiled_bundles/note.c",
            "behavior": "Starting at +0x50 cursor, scan the 30-slot +0x40 pool cyclically; increment cursor and return the first object whose +0x10 active flag is false.",
            "reset_call_on_success": False,
        },
        "conclusion": {
            "fast_acquire_reset": "excluded",
            "cursor_wrap_reuse": "unresolved",
            "reason": "The production sample performs one acquire per newly constructed manager; no run reaches the 31st acquire in one 30-slot pool.",
        },
    }
    write_json(OUTPUT / "summaries" / "pool_reset_reuse.json", pool_summary)

    write_json(OUTPUT / "summaries" / "initialization.json", {"schema_version": 1, "samples": [result["initialization"] for result in results.values()]})
    write_json(
        OUTPUT / "summaries" / "bpm_lifecycle.json",
        {
            "schema_version": 1,
            "samples": [result["lifecycle"] for result in results.values()],
            "bpm_change_count_runtime_correction": {
                "status": "confirmed",
                "finding": "NoteManager +0x74 is copied from the process-history-accumulated NoteDataBMSBuilder BPM value list during the normal parse, not from the current controller command-list count.",
                "cc08_builder_events": results["cc08"]["builder_counts"],
                "cc08_manager_value": results["cc08"]["adaptive"]["manager_bpm_change_count"],
                "cc08_controller_command_count": first(load_events(results["cc08"]["raw_original"]), "frame_enter")["manager"]["controller"]["bpm_change_note_count"],
            },
        },
    )
    write_json(OUTPUT / "summaries" / "adaptive_substeps.json", {"schema_version": 1, "samples": [result["adaptive"] for result in results.values()]})
    write_json(OUTPUT / "summaries" / "scheduling_order.json", {"schema_version": 1, "samples": [result["ordering"] for result in results.values()]})
    write_json(OUTPUT / "summaries" / "pause_resume.json", {"schema_version": 1, "status": "unresolved", "reason": "The current probe lacks the GameState/PauseState gate fields required to prove freeze and in-place continuation."})
    write_json(OUTPUT / "summaries" / "judge_offset.json", {"schema_version": 1, "status": "unresolved", "reason": "No judge-offset method hooks or positive/negative cross-BPM production traces are frozen."})

    environment = {
        "schema_version": 1,
        "application": {"package": "jp.co.craftegg.band", "version_name": "10.1.3", "version_code": 229, "region": "JP", "channel": "Google Play"},
        "device": {"serial": "FICIPZUGEIQC4P7H", "model": "LineageOS GSI on ARM64", "abi": "arm64-v8a", "android": "13", "sdk": 33, "kernel": "Linux 4.14.186+ aarch64", "cpu_part": "ARM Cortex-A55 compatible, implementer 0x41 part 0xd05", "root": True, "selinux": "Enforcing"},
        "apk_files": [
            {"name": "base.apk", "bytes": 132355852, "sha256": "083AB505EEFCFC025EED8D9D722797A93AEB0D09F182A41EBB32C94928D4CC2E"},
            {"name": "split_config.arm64_v8a.apk", "bytes": 47114476, "sha256": "B9BC9DE42D63D88D958F15F306140592EA6BB093180338129A89C999439584D9"},
        ],
        "binary_files": [
            {"name": "libil2cpp.so", "bytes": 119819736, "sha256": "66C9C666C50962B662DF8D894E851C7D18F07142DCA145CFAC3D30D063D1D9FA"},
            {"name": "global-metadata.dat", "bytes": 28185252, "sha256": "B485E5BB999F491C4B5EC7850AD856122B6EAE51DD4FAA06C4063F3AFC7D87FE"},
            {"name": "libunity.so", "bytes": 25175544, "sha256": "1936D77586CC3E3856006F8B44711667E22766721DA9BB50FE0AC81178C83378"},
        ],
        "unity": {"version": "2022.3.62f1", "source": "locked extracted globalgamemanagers and existing sample manifest"},
        "il2cpp_metadata_version": {"status": "unresolved", "reason": "Not independently decoded by this runtime batch."},
        "runtime": {"pid": 10520, "libil2cpp_base_cc08": "0x738AEA8000", "frida_client_server": "17.15.3", "high_frequency_mode": False, "requested_target_frame_rate": 60},
        "collection_guardrails": {"patched_apk": False, "wrote_process_memory": False, "replaced_return_value": False, "observation_hooks_only": True},
    }
    write_json(OUTPUT / "environment.json", environment)

    manifest_samples = []
    for sample_id, result in results.items():
        config = result["config"]
        manifest_samples.append(
            {
                "sample_id": sample_id,
                "run_id": config["run_id"],
                "song_id": config["song_id"],
                "song_name": config["song_name"],
                "difficulty": config["difficulty"],
                "music_score_key": config["music_score_key"],
                "bundle_path": config["bundle_path"],
                "bundle_sha256": config["bundle_sha256"],
                "bundle_cache_key": config["bundle_cache_key"],
                "bms": {"path": result["source"].relative_to(OUTPUT).as_posix(), "bytes": result["source"].stat().st_size, "sha256": file_digest(result["source"])},
                "bundle_text_asset": None if result["bundle_source"] is None else {
                    "path": result["bundle_source"].relative_to(OUTPUT).as_posix(),
                    "bytes": result["bundle_source"].stat().st_size,
                    "sha256": file_digest(result["bundle_source"]),
                    "runtime_conversion": "strip UTF-8 BOM",
                    "matches_runtime_bms": result["bundle_source"].read_bytes().removeprefix(b"\xef\xbb\xbf") == result["source"].read_bytes(),
                },
                "raw_trace": {"path": result["raw"].relative_to(OUTPUT).as_posix(), "bytes": result["raw"].stat().st_size, "sha256": file_digest(result["raw"]), "uncompressed_bytes": result["raw_original"].stat().st_size, "uncompressed_sha256": file_digest(result["raw_original"])},
                "normalized_trace": {"path": result["normalized"].relative_to(OUTPUT).as_posix(), "bytes": result["normalized"].stat().st_size, "sha256": file_digest(result["normalized"])},
                "coverage": ["60_target_request", "dual_clock_initialization", "launcher_lead", f"CC{config['command']['cc_num']:02d}_lifecycle"],
            }
        )
    write_json(OUTPUT / "sample_manifest.json", {"schema_version": 1, "samples": manifest_samples})

    matrix = {
        "normal_zero_bpm_60": "unresolved",
        "habahiro_zero_bpm_60": "unresolved",
        "nonzero_cc03_60": "confirmed",
        "nonzero_cc08_60": "confirmed",
        "same_nonzero_120": "unresolved",
        "cross_bar_bpm_command": "confirmed",
        "same_batch_multiple_bpm": "static-only",
        "launcher_crosses_multiple_batches": "static-only",
        "slow_frame_2_3_4": "unresolved",
        "fallback_101_21_6": "unresolved",
        "pause_before_bpm": "unresolved",
        "pause_during_bpm": "unresolved",
        "pause_after_bpm": "unresolved",
        "positive_offset_cross_bpm": "unresolved",
        "negative_offset_cross_bpm_bar": "unresolved",
    }
    closure = {
        "schema_version": 1,
        "reverse_baseline_commit": "74ab76f6838847d98aae1a15741a5f024e3774ff",
        "overall_status": "unresolved",
        "s02_gate": "blocked",
        "sections": {
            "R04_environment_identity": "partial",
            "R05_static_call_graph": "confirmed-by-E01-E26",
            "R06_chart_runtime_input": "partial",
            "R07_60_120_request": "60-confirmed-120-unresolved",
            "R08_initial_dual_clock": "confirmed-for-cc03-cc08",
            "R09_substep_clock": "partial",
            "R10_bpm_lifecycle": "partial-fast-acquire-reset-excluded-cursor-wrap-reuse-unresolved",
            "R11_adaptive_substeps": "unresolved",
            "R12_two_phase_scheduling": "unresolved",
            "R13_pause_resume": "unresolved",
            "R14_judge_offset": "unresolved",
            "R15_sample_matrix": "unresolved",
            "R16_trace_schema": "partial",
            "R17_artifact_package": "confirmed",
        },
        "sample_matrix": matrix,
        "blocking_findings": [key for key, value in matrix.items() if value == "unresolved"],
        "conflicts_requiring_revision": ["The earlier static/prototype equivalence between NoteManager +0x74 and the current chart's effective BPM-command count is disproved by live builder accumulation."],
    }
    write_json(OUTPUT / "closure.json", closure)

    manifest_path = OUTPUT / "sample_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["supplemental_runs"] = [
        {
            "run_id": "ikuoku-cc08-run-006-reset-note",
            "purpose": "exclude Reset/ResetNote from the successful BPM pool acquire fast path",
            "raw_trace": {"path": reset_raw_target.relative_to(OUTPUT).as_posix(), "bytes": reset_raw_target.stat().st_size, "sha256": file_digest(reset_raw_target), "uncompressed_bytes": reset_trace_path.stat().st_size, "uncompressed_sha256": file_digest(reset_trace_path)},
            "normalized_trace": {"path": reset_normalized_target.relative_to(OUTPUT).as_posix(), "bytes": reset_normalized_target.stat().st_size, "sha256": file_digest(reset_normalized_target)},
        }
    ]
    write_json(manifest_path, manifest)

    sums = []
    for path in sorted(OUTPUT.rglob("*")):
        if path.is_file() and path.name not in {"SHA256SUMS"} and "__pycache__" not in path.parts:
            sums.append(f"{file_digest(path)}  {path.relative_to(OUTPUT).as_posix()}")
    (OUTPUT / "SHA256SUMS").write_text("\n".join(sums) + "\n", encoding="ascii", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

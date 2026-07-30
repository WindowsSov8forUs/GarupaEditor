#!/usr/bin/env python3
"""Build the fail-closed BS01-BS36 partial fixed-event oracle from committed evidence."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
LIB_SHA256 = "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
METADATA_SHA256 = "298D92CB0DC44B11681C5478F3BB08CE5476321361CE962096095CC31812961F"
SOURCE_COMMIT = "3c95190f4b6326da97e21c8e590f625a7582dc22"
SOURCES = {
    "static_contract": "score_life_state_static_contract.json",
    "static_findings": "score_life_state_static_findings.json",
    "ordinary_bms": "runtime-inputs/bms/poppin_shuffle_special.bms.txt",
    "habahiro_bms": "runtime-inputs/bms/786_miracle_april_habahiro_special.bms.txt",
    "no_input_r1": "runtime/no-input-retry-life-gameover.trace.json.gz",
    "positive_r1": "runtime/positive-retry-all-lanes-early.trace.json.gz",
    "skill_r1": "runtime/multitouch-seven-lane-native-skill.trace.json.gz",
    "retry_r1": "runtime/multitouch-seven-lane-post-gameover-retry.trace.json.gz",
    "chart_count": "score_life_state_chart_count_oracle.json",
    "initialization_profile": "score_life_initialization_profile_oracle.json",
}
REQUIREMENTS = {
    "BS01": "ordinary production chart family maxNoteCount and base-score initialization",
    "BS02": "HABAHIRO visible/invisible Slide maxNoteCount",
    "BS03": "deck three-parameter member Float32 accumulation and score-level rate",
    "BS04": "Free Live bonus zero/nonzero construction, cache, and clear",
    "BS05": "Perfect/Great/Good/Bad/Miss result correction exact bits",
    "BS06": "standard Combo every range boundary and 701+",
    "BS07": "single Normal judgement complete OneFrame business projection",
    "BS08": "Long head/tail and Slide intermediate/tail business projections",
    "BS09": "Multiple and same-position group maxNote/score deduplication identity",
    "BS10": "same-frame two-entry Combo mutation before per-entry rate selection",
    "BS11": "five-slot caller/slot order and representative strict/equal retention",
    "BS12": "sixth-slot failure and whole-domain mutation boundary",
    "BS13": "result, Combo, Fast/Slow, maxCombo, and all-perfect counters",
    "BS14": "ordinary/bonus one-note strict maximum and equal retention",
    "BS15": "Miss/Bad/Good/Great/Perfect damage and Power mapping",
    "BS16": "same-frame multi-damage Life order and zero/Game Over boundary",
    "BS17": "fixed/rate Damage Guard and guard type",
    "BS18": "Never Die nonlethal/lethal/equal boundary and resulting Life 5",
    "BS19": "fixed Life Heal and condition equality",
    "BS20": "percentage Life Heal integer order and overheal/upper limit",
    "BS21": "Skill Note success/failure/MoveTime/MultiNormal eligibility",
    "BS22": "Skill queue Begin-to-Playing-to-Finishing-to-None and 0.75 boundary",
    "BS23": "Skill Playing pause/GameOver freeze, Stop drain, and multiple queue",
    "BS24": "judge correction and first eligible active effect",
    "BS25": "damage/score over-life and under-life active effects",
    "BS26": "continuous worst-result, condition, and same-frame freeze",
    "BS27": "only-perfect, under-great-half, and ScoreUpType",
    "BS28": "Crescendo Perfect stack, clamp, reset, and non-Perfect",
    "BS29": "Fever root/tail, difficulty point, and Good/Miss no-key behavior",
    "BS30": "Fever >=80 pass, duplicate suppression, and remaining ceil",
    "BS31": "FeverReady/Start success/failure/End, reset/callback/reservation",
    "BS32": "Fever Level1 2.0 score rate and same-frame state freeze",
    "BS33": "Auto coefficient, result-correction bypass, and Combo route",
    "BS34": "Festival stage effect/bonus exclusion and Medley/Garupa ranges",
    "BS35": "Game Over 0.1 Practice/collaboration/multiplayer mode matrix",
    "BS36": "invalid profile, pause/resume, fault/dispose, and duplicate-consume atomicity",
}
REQUIRED_OUTPUTS = [
    "initialization.base_score_and_profile",
    "one_frame.entries_and_bits",
    "reflect.score_life_power_combo",
    "record.result_timing_and_one_note_max",
    "skill.queue_state_timers_and_effects",
    "fever.points_command_state_rate_reservation",
    "lifecycle.game_over_guard_never_die",
    "trace.callback_domain_order",
    "failure.before_after_and_backend_trace",
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def load_json(path: str) -> dict[str, Any]:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def load_trace(path: str) -> dict[str, Any]:
    with gzip.open(ROOT / path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def events(trace: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    return [event for event in trace["events"] if event["kind"] == kind]


def source_catalog() -> dict[str, dict[str, Any]]:
    result = {}
    for source_id, relative in SOURCES.items():
        path = ROOT / relative
        result[source_id] = {
            "path": relative,
            "bytes": path.stat().st_size,
            "sha256": digest(path),
            "source_commit": SOURCE_COMMIT,
        }
    return result


def case(
    case_id: str,
    status: str,
    evidence_ids: list[str],
    input_provenance: list[str],
    expected_source: list[str],
    expected_projection: dict[str, Any],
    unknown_fields: list[str],
    blocking_findings: list[str],
) -> dict[str, Any]:
    require(status in {"confirmed-static", "partial", "blocked"}, f"invalid status {case_id}")
    require(bool(expected_projection) or status == "blocked", f"missing projection {case_id}")
    require((not unknown_fields and not blocking_findings) == status.startswith("confirmed"), f"gate mismatch {case_id}")
    return {
        "case_id": case_id,
        "requirement": REQUIREMENTS[case_id],
        "status": status,
        "evidence_ids": evidence_ids,
        "input_provenance": input_provenance,
        "expected_source": expected_source,
        "expected_projection": expected_projection,
        "unknown_fields": unknown_fields,
        "blocking_findings": blocking_findings,
    }


def main() -> int:
    static_contract = load_json(SOURCES["static_contract"])
    static_findings = load_json(SOURCES["static_findings"])
    finding = {entry["id"]: entry for entry in static_findings["findings"]}
    no_input = load_trace(SOURCES["no_input_r1"])
    positive = load_trace(SOURCES["positive_r1"])
    skill = load_trace(SOURCES["skill_r1"])
    retry = load_trace(SOURCES["retry_r1"])
    chart_count = load_json(SOURCES["chart_count"])
    initialization_profile = load_json(SOURCES["initialization_profile"])

    require(static_contract["target"]["libil2cpp_sha256"] == LIB_SHA256, "static target differs")
    require(static_findings["sample"]["global_metadata_sha256"] == METADATA_SHA256, "metadata differs")
    for trace in (no_input, positive, skill, retry):
        require(trace["status"] == "confirmed-r1-observation-only", "trace status differs")
        require(trace["capture_error"] is None, "trace capture error")
        require(trace["sample"]["version_name"] == "10.1.4" and trace["sample"]["version_code"] == 230, "trace version differs")
        require(trace["sample"]["abi"] == "arm64-v8a" and trace["sample"]["libil2cpp_sha256"] == LIB_SHA256, "trace binary differs")
    require(
        chart_count["status"] == "confirmed-production-chart-max-note-count-10.1.4-rule"
        and chart_count["sample"]["version_name"] == "10.1.4"
        and chart_count["sample"]["version_code"] == 230
        and chart_count["unknown_fields"] == []
        and chart_count["blocking_findings"] == [],
        "chart count oracle differs",
    )
    require(
        initialization_profile["status"] == "confirmed-r1-ordinary-initialization-profile-partial-D23"
        and initialization_profile["sample"]["version_name"] == "10.1.4"
        and initialization_profile["sample"]["version_code"] == 230
        and initialization_profile["privacy"]["account_fields_included"] is False
        and initialization_profile["production_chart"]["max_note_count"] == 979
        and initialization_profile["production_chart"]["score_level"] == 27
        and initialization_profile["score_initialization"]["base_score"]["bits"] == "0x4434718E"
        and initialization_profile["business_state_gate"] == "open",
        "initialization profile oracle differs",
    )

    result_rates = finding["SLS-S03"]["conclusion"]
    combo_rates = finding["SLS-S04"]["conclusion"]
    positive_frame = next(event["frame"] for event in events(positive, "OneFrameData.Setup.leave") if event["frame"]["result"] != 0)
    positive_score = next(event for event in events(positive, "InGameRecord.AddScore.enter") if event["arg1"] != 0)
    positive_game_over = events(positive, "InGameRecord.updateGameOverState.leave")[0]["after"]
    no_input_game_over = events(no_input, "InGameRecord.updateGameOverState.leave")[0]["after"]
    skill_add = events(skill, "SituationSkillManager.AddSituationSkillToPlayList.leave")[0]
    skill_begin = events(skill, "SituationSkillManager.executeBeginSkillProcess.leave")[0]
    skill_finish = events(skill, "SituationSkillManager.processOfSkillFinished.enter")[0]
    skill_finishing = events(skill, "SituationSkillManager.executeFinishingSkillProcess.enter")[0]
    skill_none = events(skill, "SituationSkillManager.executeFinishingSkillProcess.leave")[-1]
    heal_enter = next(event for event in events(skill, "InGameRecord.AddIPower.enter") if event["arg1"] == 300)
    heal_leave = next(event for event in events(skill, "InGameRecord.AddIPower.leave") if event["arg1"] == 300)
    active_frames = [event["frame"] for event in events(skill, "OneFrameData.Setup.leave") if event["frame"]["skill_rate"]["bits"] == "0x3F99999A"]
    retry_game_over = events(retry, "InGameRecord.updateGameOverState.leave")[0]
    retry_init = events(retry, "InGameRecord.InitializeLife.leave")[-1]
    retry_markers = events(retry, "capture.marker")
    ordinary_chart_count = chart_count["charts"]["ordinary"]
    habahiro_chart_count = chart_count["charts"]["habahiro"]

    cases: list[dict[str, Any]] = []
    cases.append(case(
        "BS01",
        "partial",
        ["SLS-S05", "SLS-R1-008", "SLS-BMS-ORDINARY", "SLS-CHART-COUNT-ORDINARY"],
        ["ordinary_bms", "chart_count", "initialization_profile"],
        ["static:SLS-S05", "chart_count#charts.ordinary", "initialization_profile#ordinary"],
        {
            "production_bms_sha256": digest(ROOT / SOURCES["ordinary_bms"]),
            "production_chart_count": {
                "inputs": ordinary_chart_count["inputs"],
                "derived": ordinary_chart_count["derived"],
                "formula": ordinary_chart_count["formula"],
            },
            "observed_initialization_profile": {
                "difficulty": initialization_profile["production_chart"]["difficulty"],
                "score_level": initialization_profile["production_chart"]["score_level"],
                "max_note_count": initialization_profile["production_chart"]["max_note_count"],
                "life": initialization_profile["life_initialization"],
                "score": initialization_profile["score_initialization"],
                "mode_and_damage": initialization_profile["mode_and_damage"],
                "object_identity": initialization_profile["object_identity"],
            },
            "base_formula": finding["SLS-S05"]["conclusion"],
        },
        [],
        ["D23-master-start-data"],
    ))
    cases.append(case(
        "BS02",
        "partial",
        ["SLS-BMS-HABAHIRO", "SLS-CHART-COUNT-HABAHIRO"],
        ["habahiro_bms", "chart_count"],
        ["habahiro_bms#bytes", "chart_count#charts.habahiro"],
        {
            "production_bms_sha256": digest(ROOT / SOURCES["habahiro_bms"]),
            "production_chart_count": {
                "inputs": habahiro_chart_count["inputs"],
                "derived": habahiro_chart_count["derived"],
                "formula": habahiro_chart_count["formula"],
            },
        },
        ["initialization.base_score_bits"],
        ["D23-master-start-data"],
    ))
    cases.append(case("BS03", "partial", ["SLS-S05"], ["static_findings"], ["static:SLS-S05"], {"score_level_rate_formula": finding["SLS-S05"]["conclusion"]["score_level_rate"], "ordinary_base_formula": finding["SLS-S05"]["conclusion"]["ordinary_base"]}, ["profile.deck_members", "profile.member_parameters", "profile.score_level", "expected.float32_accumulation_bits", "expected.base_score_bits"], ["D06", "D23-master-start-data"]))
    cases.append(case("BS04", "blocked", ["D06-static"], ["static_contract"], ["static_contract#mapped Free Live methods"], {}, ["profile.event_parameter", "expected.zero_construction", "expected.nonzero_construction", "expected.cache", "expected.clear", "trace.callback_domain_order"], ["D06", "D21", "D23-master-start-data"]))
    cases.append(case("BS05", "confirmed-static", ["SLS-S03"], ["static_findings"], ["static:SLS-S03", "locked ELF VA 0x1581A14"], {"result_correction": result_rates}, [], []))
    cases.append(case("BS06", "confirmed-static", ["SLS-S04"], ["static_findings"], ["static:SLS-S04", "locked ELF VA 0x1533250"], {"combo_correction_ranges": combo_rates}, [], []))
    cases.append(case("BS07", "partial", ["SLS-S01", "SLS-R1-003"], ["positive_r1"], ["positive_r1#OneFrameData.Setup.leave:index=6", "positive_r1#InGameRecord.AddScore.enter:arg1=1404"], {"frame": positive_frame, "reflected_add_score": positive_score["arg1"], "post_game_over_record": {key: positive_game_over[key] for key in ("score", "current_life", "max_combo", "perfect_count", "miss_count", "is_single_game_over")}}, ["input_profile.deck_start_data", "input_profile.score_level", "input_profile.damage_rows", "producer_abi.judgeFrontNote_note_type", "producer_abi.judgeFrontNote_absolute_pos"], ["D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS08", "blocked", ["SLS-S01"], ["static_findings"], ["static:SLS-S01"], {}, ["one_frame.long_head", "one_frame.long_tail", "one_frame.slide_intermediate", "one_frame.slide_tail", "reflect.family_order"], ["D18-remaining", "D19", "D23-master-start-data"]))
    cases.append(case("BS09", "blocked", ["D03-static"], ["static_contract"], ["static_contract#chart counting methods"], {}, ["chart.multiple_group_identity", "chart.same_position_group_identity", "chart.max_note_deduplication", "score.group_identity"], ["D03", "D23-master-start-data"]))
    cases.append(case("BS10", "partial", ["SLS-S02", "SLS-R1-005"], ["static_findings", "skill_r1"], ["static:SLS-S02", "skill_r1#events:2189,2199,2210"], {"reflect_mutation_prefix": finding["SLS-S02"]["conclusion"]["mutation_order"][:2], "same_frame_frozen_entries": [{"sequence": sequence, "skill_rate_bits": next(event["frame"]["skill_rate"]["bits"] for event in events(skill, "OneFrameData.Setup.leave") if event["sequence"] == sequence)} for sequence in (2189, 2199)], "reflect_after_skill_begin_sequence": 2210}, ["same_frame.two_entry_combo_values", "same_frame.per_entry_combo_rate_bits", "same_frame.score_results"], ["D20-remaining", "D23-master-start-data"]))
    cases.append(case("BS11", "confirmed-static", ["SLS-S01", "SLS-S02"], ["static_findings"], ["static:SLS-S01", "static:SLS-S02"], {"slot_capacity": 5, "slot_scan": finding["SLS-S02"]["conclusion"]["slot_scan"], "clear_point": finding["SLS-S02"]["conclusion"]["clear_point"], "representative": finding["SLS-S02"]["conclusion"]["representative"]}, [], []))
    cases.append(case("BS12", "partial", ["SLS-S01"], ["static_findings"], ["static:SLS-S01"], {"slot_capacity": 5}, ["failure.sixth_slot_exception_identity", "failure.before_snapshot", "failure.after_snapshot", "failure.backend_trace", "failure.domain_mutation_boundary"], ["D20-remaining", "D21"]))
    cases.append(case("BS13", "partial", ["SLS-S12", "SLS-R1-003", "SLS-R1-007"], ["static_findings", "positive_r1", "retry_r1"], ["static:SLS-S12", "positive_r1#GameOver.leave", "retry_r1#GameOver.leave/InitializeLife.leave"], {"counter_rules": finding["SLS-S12"]["conclusion"], "positive_projection": {key: positive_game_over[key] for key in ("max_combo", "perfect_count", "great_count", "good_count", "bad_count", "miss_count", "fast_count", "slow_count")}, "retry_reset_projection": {key: retry_init["record"][key] for key in ("max_combo", "perfect_count", "great_count", "good_count", "bad_count", "miss_count", "fast_count", "slow_count")}}, ["record.all_perfect_status", "record.one_note_max_identity", "record.equal_max_retention"], ["D10", "D19"]))
    cases.append(case("BS14", "blocked", ["D10-static"], ["static_contract"], ["static_contract#CalcOneNotesMaxScoreInfo"], {}, ["record.ordinary_strict_max", "record.bonus_strict_max", "record.equal_retention", "record.callback_identity"], ["D10", "D18-remaining"]))
    cases.append(case("BS15", "partial", ["SLS-S07"], ["static_findings"], ["static:SLS-S07"], {"damage_mapping": finding["SLS-S07"]["conclusion"]}, ["profile.miss_damage", "profile.bad_damage", "one_frame.family_damage_values", "one_frame.power_values", "active_damage_effect_rows"], ["D07", "D13", "D23-master-start-data"]))
    cases.append(case("BS16", "partial", ["SLS-S02", "SLS-S06", "SLS-R1-001"], ["static_findings", "no_input_r1"], ["static:SLS-S02", "static:SLS-S06", "no_input_r1#GameOver.leave"], {"life_rule": finding["SLS-S06"]["conclusion"], "observed_single_path": {"one_frame_misses": len(events(no_input, "OneFrameData.Setup.leave")), "reflect_count": len(events(no_input, "OneFrameController.Reflect.enter")), "final_life": no_input_game_over["current_life"], "miss_count": no_input_game_over["miss_count"], "single_game_over": no_input_game_over["is_single_game_over"]}}, ["same_frame.multi_damage_entries", "same_frame.life_after_each_entry", "same_frame.game_over_call_boundary"], ["D18-remaining", "D20-remaining"]))
    cases.append(case("BS17", "blocked", ["SLS-S08"], ["static_findings"], ["static:SLS-S08"], {}, ["profile.fixed_guard_row", "profile.rate_guard_row", "one_frame.fixed_guard_type", "one_frame.rate_guard_type", "same_frame.freeze"], ["D13", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS18", "partial", ["SLS-S08"], ["static_findings"], ["static:SLS-S08"], {"never_die": finding["SLS-S08"]["conclusion"]}, ["profile.never_die_row", "manager.effect_eligibility", "runtime.nonlethal", "runtime.lethal", "runtime.equal_boundary", "same_frame.freeze"], ["D13", "D18-remaining", "D20-remaining", "D23-master-start-data"]))
    cases.append(case("BS19", "partial", ["SLS-S09", "SLS-R1-005"], ["static_findings", "skill_r1"], ["static:SLS-S09", "skill_r1#AddIPower:arg1=300"], {"fixed_formula": finding["SLS-S09"]["conclusion"]["fixed"], "condition_rule": finding["SLS-S09"]["conclusion"]["eligibility"], "observed_heal": {"sequence": [heal_enter["sequence"], heal_leave["sequence"]], "before": heal_enter["before"]["current_life"], "delta": heal_enter["arg1"], "after": heal_leave["after"]["current_life"], "displayed_base": heal_leave["after"]["displayed_or_skill_base_life"], "upper_limit": heal_leave["after"]["business_life_upper_limit"]}}, ["profile.once_effect_row", "runtime.condition_equal_boundary", "runtime.heal_callback_identity"], ["D14", "D23-master-start-data"]))
    cases.append(case("BS20", "partial", ["SLS-S06", "SLS-S09"], ["static_findings"], ["static:SLS-S06", "static:SLS-S09"], {"percentage_formula": finding["SLS-S09"]["conclusion"]["percentage"], "upper_limit_rule": finding["SLS-S09"]["conclusion"]["upper_limit"], "add_life_clamp": finding["SLS-S06"]["conclusion"]["clamp"]}, ["profile.percentage_effect_row", "runtime.percentage_heal", "runtime.overheal", "runtime.upper_limit_equal_boundary", "runtime.callback_identity"], ["D14", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS21", "partial", ["SLS-R1-005", "D11-static"], ["skill_r1", "static_contract"], ["skill_r1#AddSituationSkillToPlayList.leave:2187"], {"observed_enqueue": {"sequence": skill_add["sequence"], "state": skill_add["skill"]["state"], "playlist_size": skill_add["skill"]["playlist"]["size"]}}, ["profile.mode_eligibility", "profile.skill_chara_list", "runtime.success", "runtime.failure", "runtime.move_time", "runtime.multi_normal_identity", "runtime.duplicate_reserve"], ["D11", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS22", "partial", ["SLS-S10", "SLS-R1-005"], ["static_findings", "skill_r1"], ["static:SLS-S10", "skill_r1#Skill lifecycle events"], {"states": {"none": 0, "begin": skill_add["skill"]["state"], "playing": skill_begin["skill"]["state"], "finishing": skill_finishing["skill"]["state"], "final_none": skill_none["skill"]["state"]}, "playing_timer_bits": skill_begin["skill"]["skill_timer"]["bits"], "finish_input_timer_bits": skill_finish["skill"]["skill_timer"]["bits"], "finishing_timer_bits": skill_finishing["skill"]["finishing_timer"]["bits"], "current_identity": {"chara_index": skill_begin["skill"]["current"]["chara_index"], "skill_note_index": skill_begin["skill"]["current"]["skill_note_index"], "absolute_pos": skill_begin["skill"]["current"]["absolute_pos"]}}, ["skill.callback_identity", "skill.reservation_frame", "skill.delta_source_identity"], ["D12", "D18-remaining"]))
    cases.append(case("BS23", "blocked", ["SLS-S10"], ["static_findings"], ["static:SLS-S10"], {}, ["runtime.pause_freeze", "runtime.game_over_playing_freeze", "runtime.stop_drain", "runtime.multiple_queue", "runtime.callback_order"], ["D12", "D18-remaining", "D21", "D23-master-start-data"]))
    cases.append(case("BS24", "partial", ["SLS-R1-005", "D13-static"], ["skill_r1", "static_contract"], ["skill_r1#active OneFrameData.Setup.leave"], {"observed_active_entries": len(active_frames), "active_skill_rate_bits": active_frames[0]["skill_rate"]["bits"], "active_score_up_type": active_frames[0]["score_up_type"]}, ["profile.ordered_effect_rows", "runtime.judge_correction", "runtime.first_eligible_effect", "runtime.ineligible_predecessor"], ["D13", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS25", "blocked", ["D13-static"], ["static_contract"], ["static_contract#active damage and score methods"], {}, ["profile.over_life_damage_effect", "profile.under_life_damage_effect", "profile.over_life_score_effect", "profile.under_life_score_effect", "runtime.condition_boundaries"], ["D13", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS26", "blocked", ["D13-static"], ["static_contract"], ["static_contract#continuous Skill methods"], {}, ["profile.continuous_effect", "runtime.worst_result", "runtime.condition_boundary", "runtime.same_frame_freeze"], ["D13", "D18-remaining", "D20-remaining", "D23-master-start-data"]))
    cases.append(case("BS27", "partial", ["SLS-R1-005", "D13-static"], ["skill_r1", "static_contract"], ["skill_r1#active OneFrameData.Setup.leave"], {"observed_score_up_type": active_frames[0]["score_up_type"], "observed_rate_bits": active_frames[0]["score_up_rate"]["bits"], "active_entry_count": len(active_frames)}, ["profile.only_perfect_row", "profile.under_great_half_row", "runtime.only_perfect_boundary", "runtime.under_great_half_boundary"], ["D13", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS28", "blocked", ["D13-static"], ["static_contract"], ["static_contract#Crescendo methods"], {}, ["profile.crescendo_row", "runtime.perfect_stack", "runtime.clamp", "runtime.reset", "runtime.non_perfect"], ["D13", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS29", "partial", ["SLS-S11"], ["static_findings"], ["static:SLS-S11"], {"normal_rate_bits_le": finding["SLS-S11"]["conclusion"]["normal_bits_le"], "level_1_rate_bits_le": finding["SLS-S11"]["conclusion"]["level_1_bits_le"]}, ["profile.difficulty_points", "runtime.root_note", "runtime.tail_note", "runtime.good_no_key", "runtime.miss_no_key"], ["D15", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS30", "partial", ["SLS-S11"], ["static_findings"], ["static:SLS-S11"], {"pass_point": finding["SLS-S11"]["conclusion"]["pass_point_constant"]}, ["profile.difficulty_points", "runtime.pass_equal_boundary", "runtime.duplicate_suppression", "runtime.remaining_ceil"], ["D15", "D16", "D18-remaining", "D23-master-start-data"]))
    cases.append(case("BS31", "blocked", ["D16-static"], ["static_contract"], ["static_contract#Fever command/state methods"], {}, ["runtime.ready", "runtime.start_success", "runtime.start_failure", "runtime.end", "runtime.reset", "runtime.callback_order", "runtime.reservation_frame"], ["D16", "D18-remaining", "D20-remaining", "D23-master-start-data"]))
    cases.append(case("BS32", "partial", ["SLS-S11"], ["static_findings"], ["static:SLS-S11"], {"state_test": finding["SLS-S11"]["conclusion"]["state_test"], "normal_rate_bits_le": finding["SLS-S11"]["conclusion"]["normal_bits_le"], "level_1_rate_bits_le": finding["SLS-S11"]["conclusion"]["level_1_bits_le"]}, ["runtime.fever_start_freeze", "runtime.fever_end_freeze", "runtime.same_frame_entries", "runtime.reservation_frame"], ["D16", "D18-remaining", "D20-remaining"]))
    cases.append(case("BS33", "blocked", ["D05-static"], ["static_contract"], ["static_contract#Auto score methods"], {}, ["profile.auto_coefficient", "runtime.result_correction_bypass", "runtime.combo_route", "runtime.score_bits"], ["D05", "D17", "D23-master-start-data"]))
    cases.append(case("BS34", "blocked", ["D17-static"], ["static_contract"], ["static_contract#Festival/Medley/Garupa methods"], {}, ["profile.festival_stage_effect", "profile.festival_bonus_exclusion", "profile.medley_ranges", "profile.garupa_ranges", "runtime.no_match_behavior"], ["D17", "D23-master-start-data"]))
    cases.append(case("BS35", "blocked", ["D22-static"], ["static_contract"], ["static_contract#Game Over mode methods"], {}, ["profile.practice_mode", "profile.collaboration_mode", "profile.multiplayer_mode", "runtime.game_over_0_1_routes", "runtime.score_decrease"], ["D17", "D22-remaining", "D23-master-start-data"]))
    cases.append(case("BS36", "partial", ["SLS-R1-007"], ["retry_r1"], ["retry_r1#GameOver.leave:6366", "retry_r1#InitializeLife.leave:6373", "retry_r1#InitBaseScore.enter:6374"], {"post_game_over_hook_quiet_ms": retry_markers[5]["timestamp_ms"] - retry_game_over["timestamp_ms"], "record_identity_stable": retry_game_over["after"]["pointer"] == retry_init["record"]["pointer"], "retry_reset": {"single_game_over": [retry_game_over["after"]["is_single_game_over"], retry_init["record"]["is_single_game_over"]], "score": [retry_game_over["after"]["score"], retry_init["record"]["score"]], "life": [retry_game_over["after"]["current_life"], retry_init["record"]["current_life"]], "max_combo": [retry_game_over["after"]["max_combo"], retry_init["record"]["max_combo"]], "max_note_count": retry_init["record"]["max_note_count"]}}, ["failure.invalid_profile_atomicity", "lifecycle.pause_resume", "lifecycle.fault_dispose", "lifecycle.duplicate_consume", "lifecycle.seek", "lifecycle.return_time", "lifecycle.continue"], ["D21", "D22-remaining", "D24"]))

    require([entry["case_id"] for entry in cases] == [f"BS{index:02d}" for index in range(1, 37)], "BS case order differs")
    confirmed = [entry["case_id"] for entry in cases if entry["status"].startswith("confirmed")]
    partial = [entry["case_id"] for entry in cases if entry["status"] == "partial"]
    blocked = [entry["case_id"] for entry in cases if entry["status"] == "blocked"]
    output = {
        "schema_version": 1,
        "status": "partial-10.1.4-fixed-event-oracle-business-gate-open",
        "sample": {
            "package": "jp.co.craftegg.band",
            "version_name": "10.1.4",
            "version_code": 230,
            "abi": "arm64-v8a",
            "libil2cpp_sha256": LIB_SHA256,
            "global_metadata_sha256": METADATA_SHA256,
        },
        "source_commit": SOURCE_COMMIT,
        "generator": "build_score_life_state_fixed_event_oracle.py",
        "evidence_catalog": source_catalog(),
        "required_output_fields": REQUIRED_OUTPUTS,
        "coverage": {
            "total_cases": len(cases),
            "confirmed_cases": confirmed,
            "partial_cases": partial,
            "blocked_cases": blocked,
            "unknown_field_count": sum(len(entry["unknown_fields"]) for entry in cases),
            "blocking_finding_count": sum(len(entry["blocking_findings"]) for entry in cases),
        },
        "business_state_gate": "open",
        "production_authorization": False,
        "cases": cases,
    }
    destination = ROOT / "score_life_state_fixed_event_oracle.json"
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(
        f"score/life fixed-event oracle built: total={len(cases)} confirmed={len(confirmed)} "
        f"partial={len(partial)} blocked={len(blocked)} unknown={output['coverage']['unknown_field_count']} gate=open"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

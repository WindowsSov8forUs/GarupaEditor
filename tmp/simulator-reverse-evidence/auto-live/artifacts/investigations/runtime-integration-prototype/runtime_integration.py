"""Executable gameplay/UI/render/audio integration slice.

This module connects the recovered deterministic clock to three observable
consumers.  It is intentionally backend-neutral: render and audio state can be
replaced by Unity, Pixi, SDL, or another concrete backend without changing the
gameplay event order.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import asdict, dataclass, field, replace
from functools import cmp_to_key
from math import atan2, ceil, floor, gcd, isfinite, sqrt
from pathlib import Path
import json
import struct
import sys
from typing import Any, Callable, Iterable


HARNESS_DIR = Path(__file__).resolve().parents[1] / "deterministic-engine-harness"
sys.path.insert(0, str(HARNESS_DIR))
from engine_harness import EngineHarness, FRAME_SECONDS, TempoChange, TempoMap
from particle_simulation import (
    ParticlePrefabSimulation,
    ParticleSample,
    default_particle_profile_library,
    deterministic_particle_seed,
)


RHYTHM_SCENE_BUTTON_CENTER = 4.0
RHYTHM_SCENE_BUTTON_SPACING_X = 2.200000047683716
RHYTHM_SCENE_GOAL_Y = -3.450000047683716
RHYTHM_SCENE_LAUNCHER_Y = 5.420000076293945
RHYTHM_SCENE_LAUNCH_DISTANCE_RATE = 0.05000000074505806
RHYTHM_SCENE_NOTE_START_Y = 4.976500511169434
RHYTHM_SCENE_VANISHING_SLOPE = -1.3439395427703857
RHYTHM_SCENE_VIRTUAL_START_DELTA_X = 0.0011000001104548573
RHYTHM_SCENE_VIRTUAL_END_DELTA_X = 0.02199999988079071
RHYTHM_REFERENCE_SCREEN_SIZE_X = 9.578571319580078
HOLD_SOUND_FADE_SECONDS = 0.30000001192092896
MULTI_RANGE_NOTE_SIZE_MIN = 80.0
MULTI_RANGE_NOTE_SIZE_MAX = 150.0
STAR_UI_SCREEN_WIDTH_BASE = 1334.0
STAR_UI_SCREEN_HEIGHT_BASE = 750.0
STAR_UI_ASPECT_RATIO_BASE = 1.778666615486145
STANDARD_RESULT_CORRECTION_RATES = {
    "miss": 0.0,
    "bad": 0.0,
    "good": 0.5,
    "great": 0.8,
    "perfect": 1.1,
}
NOTE_RESULT_RANKS = {
    "miss": 0,
    "bad": 1,
    "good": 2,
    "great": 3,
    "perfect": 4,
}
STANDARD_COMBO_RATE_STEPS = (
    (0, 1.0),
    (21, 1.01),
    (51, 1.02),
    (101, 1.03),
    (151, 1.04),
    (201, 1.05),
    (251, 1.06),
    (301, 1.07),
    (401, 1.08),
    (501, 1.09),
    (601, 1.1),
    (701, 1.11),
)
IN_GAME_MODE_MULTI_TEAM_LIVE_FESTIVAL = 5
IN_GAME_MODE_GARUPA_CUP_FIRST_QUALIFICATION = 6
IN_GAME_MODE_SINGLE_MEDLEY = 11
FEVER_NOTE_POINT_TABLE = {
    "easy": {"great": 20, "perfect": 20},
    "normal": {"great": 12, "perfect": 12},
    "hard": {"great": 6, "perfect": 6},
    "expert": {"great": 4, "perfect": 4},
    "special": {"great": 4, "perfect": 4},
}
FEVER_TIME_STATE_NONE = 0
FEVER_TIME_STATE_LEVEL_ONE = 1
FEVER_TIME_STATE_FAILED = 2
FEVER_COMMAND_NONE = 0
FEVER_COMMAND_READY = 1
FEVER_COMMAND_START = 2
FEVER_COMMAND_END = 3
FEVER_LEVEL_ONE_SCORE_RATE = 2.0
SKILL_NOTE_ALWAYS_ENABLED_MODES = frozenset({1, 3, 4, 5, 10, 11, 12})
SKILL_NOTE_NETWORK_FAILURE_MODES = frozenset({2, 5})
SKILL_PLAY_STATE_NONE = 0
SKILL_PLAY_STATE_BEGIN = 1
SKILL_PLAY_STATE_PLAYING = 2
SKILL_PLAY_STATE_FINISHING = 3
SKILL_FINISHING_SECONDS = 0.75
SKILL_TIMER_FROZEN_GAME_STATES = frozenset({7, 8})
SKILL_SE_CUE_IDS = (
    "SE_RHYTHM_CUTIN_SKILL",
    "SE_RHYTHM_CUTIN_AUDIENCE",
)
FEVER_LEVEL_ONE_POINT = 80
MOVE_TIME_GAME_STATE = 14
GAMEPLAY_BUTTON_PARTICLE_RESULT_VALUES = {
    "none": -1,
    "miss": 0,
    "bad": 1,
    "good": 2,
    "great": 3,
    "perfect": 4,
}
GAMEPLAY_BUTTON_DIRECTIONAL_LEFT_TYPES = frozenset({10, 12, 14, 16})
GAMEPLAY_BUTTON_DIRECTIONAL_RIGHT_TYPES = frozenset({11, 13, 15, 17})
GAMEPLAY_BUTTON_DIRECTIONAL_LEFT_AFTER_TYPES = frozenset({2, 4, 9, 11})
GAMEPLAY_BUTTON_DIRECTIONAL_RIGHT_AFTER_TYPES = frozenset({3, 5, 10, 12})
GAMEPLAY_BUTTON_LONG_STOP_JUDGE_TYPES = frozenset({1, 2, 5, 6, 7})
GAMEPLAY_BUTTON_DIRECTIONAL_JUDGE_TYPES = frozenset({6, 7, 9, 10})
GAMEPLAY_BUTTON_FLICK_JUDGE_TYPES = frozenset({3, 5})
AUTO_LIVE_SINGLE_NOTE_KINDS = frozenset(
    {
        "tap",
        "normal",
        "flick",
        "directional_flick_left",
        "directional_flick_right",
    }
)
AUTO_LIVE_HOLD_NOTE_KINDS = frozenset({"long", "slide"})
LIFE_PRIMARY_MAX = 1_000
LIFE_SECOND_MAX = 2_000
LIFE_DANGER_COLOR_THRESHOLD = 0.2
LIFE_WARNING_THRESHOLD = 0.25
LIFE_NORMAL_GAUGE_COLOR = (110 / 255, 1.0, 105 / 255, 1.0)
LIFE_DANGEROUS_GAUGE_COLOR = (
    1.0,
    0.6000000238418579,
    0.6000000238418579,
    1.0,
)
LIFE_MULTI_DEAD_GAUGE_BASE_COLOR = (1.0, 1.0, 1.0, 1.0)


@dataclass(frozen=True)
class LifeHudVisualState:
    current_life: int = LIFE_PRIMARY_MAX
    max_life: int = LIFE_PRIMARY_MAX
    primary_fill: float = 1.0
    second_fill: float = 0.0
    gauge_color: tuple[float, float, float, float] = LIFE_NORMAL_GAUGE_COLOR
    warning_active: bool = False
    warning_sprite_enabled: bool = False
    game_over: bool = False
    gauge_base_color: tuple[float, float, float, float] = (
        LIFE_MULTI_DEAD_GAUGE_BASE_COLOR
    )


def build_life_hud_visual_state(
    current_life: int,
    max_life: int,
    damage_guard_effect_playing: bool = False,
) -> LifeHudVisualState:
    if max_life <= 0:
        raise ValueError("Life HUD max life must be positive")
    resolved_life = max(0, current_life)
    rate = resolved_life / LIFE_PRIMARY_MAX
    primary_fill = min(rate, 1.0)
    second_fill = max(rate - 1.0, 0.0)
    warning_active = primary_fill <= LIFE_WARNING_THRESHOLD
    game_over = resolved_life <= 0
    return LifeHudVisualState(
        current_life=resolved_life,
        max_life=max_life,
        primary_fill=primary_fill,
        second_fill=second_fill,
        gauge_color=(
            LIFE_DANGEROUS_GAUGE_COLOR
            if primary_fill <= LIFE_DANGER_COLOR_THRESHOLD
            else LIFE_NORMAL_GAUGE_COLOR
        ),
        warning_active=warning_active,
        warning_sprite_enabled=(warning_active and not damage_guard_effect_playing),
        game_over=game_over,
        gauge_base_color=LIFE_MULTI_DEAD_GAUGE_BASE_COLOR,
    )


def skill_note_enabled(
    in_game_mode: int,
    skill_note_index: int,
    skill_chara_list: tuple[int, ...] = (),
    my_display_index: int = 0,
) -> bool:
    if skill_note_index <= 0:
        return False
    if in_game_mode in SKILL_NOTE_ALWAYS_ENABLED_MODES:
        return True
    if in_game_mode != 2 or skill_note_index > len(skill_chara_list):
        return False
    return skill_chara_list[skill_note_index - 1] == my_display_index


def fever_note_point(difficulty: str, result: str) -> int:
    table = FEVER_NOTE_POINT_TABLE.get(difficulty.lower())
    if table is None:
        raise ValueError(f"unsupported difficulty: {difficulty}")
    return table.get(result.lower(), 0)


def additional_note_consumer_counts(notes: Iterable["NoteSpec"]) -> dict[str, int]:
    note_list = tuple(notes)
    return {
        "root_skill": sum(note.game_note_additional_type == 2 for note in note_list),
        "end_skill": sum(
            note.end_game_note_additional_type == 2 for note in note_list
        ),
        "root_fever": sum(note.game_note_additional_type == 1 for note in note_list),
        "end_fever": sum(
            note.end_game_note_additional_type == 1 for note in note_list
        ),
    }


@dataclass(frozen=True)
class ScoreConfig:
    result_rates: dict[str, float] = field(
        default_factory=lambda: dict(STANDARD_RESULT_CORRECTION_RATES)
    )
    combo_rate_steps: tuple[tuple[int, float], ...] = STANDARD_COMBO_RATE_STEPS
    auto_live_combo_coefficient: float = 1.0
    medley_combo_rates: tuple[tuple[int, int, float], ...] = ()
    garupa_cup_first_combo_rates: tuple[tuple[int, int, float], ...] = ()
    team_live_stage_type: int = 0
    team_live_judge_rates: tuple[tuple[str, float, int], ...] = ()
    team_live_stage_combo_rates: tuple[tuple[int, int, float, int], ...] = ()
    team_live_life_rates: tuple[tuple[int, int, float, int], ...] = ()

    def __post_init__(self) -> None:
        if self.auto_live_combo_coefficient < 0.0:
            raise ValueError("Auto Live Combo coefficient cannot be negative")
        for profile_name, profiles in (
            ("Medley", self.medley_combo_rates),
            ("Garupa Cup", self.garupa_cup_first_combo_rates),
        ):
            for from_combo, to_combo, score_rate in profiles:
                if from_combo > to_combo:
                    raise ValueError(f"{profile_name} Combo range is reversed")
                if score_rate < 0.0:
                    raise ValueError(f"{profile_name} Combo rate cannot be negative")
        if self.team_live_stage_type not in {0, 1, 2, 3}:
            raise ValueError("unsupported Team Live Festival stage type")

    def combo_rate(self, combo: int) -> float:
        rate = self.combo_rate_steps[0][1]
        for threshold, candidate in self.combo_rate_steps:
            if combo < threshold:
                break
            rate = candidate
        return rate

    @staticmethod
    def _range_combo_rate(
        combo: int,
        profiles: tuple[tuple[int, int, float], ...],
    ) -> float:
        for from_combo, to_combo, score_rate in profiles:
            if from_combo <= combo <= to_combo:
                return score_rate
        return 1.0

    def combo_rate_for_frame(
        self,
        combo: int,
        button_types: tuple[int, ...],
        in_game_mode: int,
        is_auto_live: bool,
    ) -> float:
        if not button_types:
            raise ValueError("OneFrameData button types cannot be empty")
        if button_types[0] == -1:
            return 1.0
        if is_auto_live:
            return self.auto_live_combo_coefficient
        if in_game_mode == IN_GAME_MODE_MULTI_TEAM_LIVE_FESTIVAL:
            return 1.0
        if in_game_mode == IN_GAME_MODE_SINGLE_MEDLEY:
            return self._range_combo_rate(combo, self.medley_combo_rates)
        if in_game_mode == IN_GAME_MODE_GARUPA_CUP_FIRST_QUALIFICATION:
            return self._range_combo_rate(combo, self.garupa_cup_first_combo_rates)
        return self.combo_rate(combo)

    def team_live_stage_effect(
        self,
        adjusted_result: str,
        combo: int,
        life: int,
        add_score: int,
    ) -> tuple[float, int]:
        judge_rate = 1.0
        judge_level = 0
        for result, score_rate, effect_level in self.team_live_judge_rates:
            if result == adjusted_result:
                judge_rate = score_rate
                judge_level = effect_level
                break
        combo_rate = 1.0
        combo_level = 0
        for from_combo, to_combo, score_rate, effect_level in (
            self.team_live_stage_combo_rates
        ):
            if from_combo <= combo <= to_combo:
                combo_rate = score_rate
                combo_level = effect_level
                break
        life_rate = 1.0
        life_level = 0
        for from_life, to_life, score_rate, effect_level in self.team_live_life_rates:
            if from_life <= life <= to_life:
                life_rate = score_rate
                life_level = effect_level
                break
        effect_level = 0
        if add_score > 0:
            if self.team_live_stage_type == 1:
                effect_level = judge_level
            elif self.team_live_stage_type == 2:
                effect_level = combo_level
            elif self.team_live_stage_type == 3:
                effect_level = life_level
        score_rate = judge_rate * combo_rate * life_rate
        if score_rate == 0.0:
            effect_level = 0
        return score_rate, effect_level


def calculate_base_score(
    total_parameter: float,
    play_level_score_rate: float,
    max_note_count: int,
) -> float:
    if max_note_count <= 0:
        raise ValueError("max note count must be positive")
    return total_parameter * play_level_score_rate / max_note_count * 3.0


def score_rate_by_music_play_level(score_level: int) -> float:
    return (score_level - 5) * 0.01 + 1.0


@dataclass(frozen=True)
class DeckScoreParameters:
    performance: float
    technique: float
    visual: float

    def __post_init__(self) -> None:
        if not all(
            isfinite(value)
            for value in (self.performance, self.technique, self.visual)
        ):
            raise ValueError("deck score parameters must be finite")

    @property
    def total(self) -> float:
        return self.performance + self.technique + self.visual


FREE_LIVE_EVENT_BONUS_EVENT_TYPES = frozenset({2, 5})
DECK_PARAMETER_NAMES = ("performance", "technique", "visual")


@dataclass(frozen=True)
class EventParameterBuffSource:
    character_match_percent: float = 0.0
    attribute_match_percent: float = 0.0
    attribute_and_character_percent: float = 0.0
    situation_match_percent: float = 0.0
    limit_break_percent: float = 0.0

    def __post_init__(self) -> None:
        if not all(isfinite(value) for value in self.values):
            raise ValueError("event parameter-buff source values must be finite")

    @property
    def values(self) -> tuple[float, ...]:
        return (
            self.character_match_percent,
            self.attribute_match_percent,
            self.attribute_and_character_percent,
            self.situation_match_percent,
            self.limit_break_percent,
        )

    @property
    def total_percent(self) -> float:
        paired_percent = (
            self.attribute_and_character_percent
            if self.character_match_percent > 0.0
            and self.attribute_match_percent > 0.0
            else 0.0
        )
        return (
            self.character_match_percent
            + self.attribute_match_percent
            + paired_percent
            + self.situation_match_percent
            + self.limit_break_percent
        )


@dataclass(frozen=True)
class EventParameterFlatBuffSource:
    event_id_matches: bool
    character_matches: bool
    attribute_matches: bool
    performance_percent: float = 0.0
    technique_percent: float = 0.0
    visual_percent: float = 0.0

    def __post_init__(self) -> None:
        if not all(
            isfinite(value)
            for value in (
                self.performance_percent,
                self.technique_percent,
                self.visual_percent,
            )
        ):
            raise ValueError("event flat-buff percentages must be finite")

    @property
    def target_parameter(self) -> str | None:
        for name in DECK_PARAMETER_NAMES:
            if getattr(self, f"{name}_percent") > 0.0:
                return name
        return None

    def value_for(self, original: DeckScoreParameters) -> float:
        if not (
            self.event_id_matches
            and self.character_matches
            and self.attribute_matches
        ):
            return 0.0
        return sum(
            getattr(original, name) * getattr(self, f"{name}_percent")
            for name in DECK_PARAMETER_NAMES
        ) / 100.0


@dataclass(frozen=True)
class FreeLiveEventBonusMemberInput:
    original: DeckScoreParameters
    area_item_fixed: DeckScoreParameters = DeckScoreParameters(0.0, 0.0, 0.0)
    area_item_rate: DeckScoreParameters = DeckScoreParameters(0.0, 0.0, 0.0)
    event_parameter_buff_percent: float = 0.0
    event_parameter_buff_source: EventParameterBuffSource | None = None
    event_parameter_flat: float = 0.0
    event_effect_parameter: str | None = None
    event_parameter_flat_source: EventParameterFlatBuffSource | None = None

    def __post_init__(self) -> None:
        if not isfinite(self.event_parameter_buff_percent):
            raise ValueError("event parameter-buff percent must be finite")
        if (
            self.event_parameter_buff_source is not None
            and self.event_parameter_buff_percent != 0.0
        ):
            raise ValueError(
                "supply either an event parameter-buff source or a total percent"
            )
        if not isfinite(self.event_parameter_flat):
            raise ValueError("event parameter flat value must be finite")
        if self.event_effect_parameter not in (*DECK_PARAMETER_NAMES, None):
            raise ValueError("unknown event-effect parameter")
        if self.event_effect_parameter is None and self.event_parameter_flat != 0.0:
            raise ValueError("nonzero event flat value requires a target parameter")
        if self.event_parameter_flat_source is not None and (
            self.event_parameter_flat != 0.0
            or self.event_effect_parameter is not None
        ):
            raise ValueError(
                "supply either an event flat-buff source or a flat value and target"
            )

    @property
    def resolved_event_parameter_buff_percent(self) -> float:
        if self.event_parameter_buff_source is not None:
            return self.event_parameter_buff_source.total_percent
        return self.event_parameter_buff_percent

    @property
    def resolved_event_parameter_flat(self) -> float:
        if self.event_parameter_flat_source is not None:
            return self.event_parameter_flat_source.value_for(self.original)
        return self.event_parameter_flat

    @property
    def resolved_event_effect_parameter(self) -> str | None:
        if self.event_parameter_flat_source is not None:
            return self.event_parameter_flat_source.target_parameter
        return self.event_effect_parameter


@dataclass(frozen=True)
class FreeLiveEventBonusMemberProfile:
    original: DeckScoreParameters
    area_item_included: DeckScoreParameters
    area_item_bonus: DeckScoreParameters
    event_buff: DeckScoreParameters
    final: DeckScoreParameters


@dataclass(frozen=True)
class FreeLiveEventBonusDeckProfile:
    event_type: int
    applied: bool
    members: tuple[FreeLiveEventBonusMemberProfile, ...]
    original_total: DeckScoreParameters
    area_item_total: DeckScoreParameters
    event_buff_total: DeckScoreParameters
    final_total: DeckScoreParameters

    @property
    def total_parameter(self) -> float:
        return self.final_total.total if self.applied else 0.0


@dataclass
class FreeLiveEventBonusStartDataState:
    total_parameter: float = 0.0

    def apply_deck_profile(self, profile: FreeLiveEventBonusDeckProfile) -> None:
        if profile.applied:
            self.total_parameter = profile.total_parameter

    def clear_after_rhythm_game(self) -> None:
        self.total_parameter = 0.0


def _score_parameters_from_values(values: Iterable[float]) -> DeckScoreParameters:
    performance, technique, visual = values
    return DeckScoreParameters(performance, technique, visual)


def construct_free_live_event_bonus_deck(
    event_type: int,
    members: Iterable[FreeLiveEventBonusMemberInput],
) -> FreeLiveEventBonusDeckProfile:
    sources = tuple(members)
    zero = DeckScoreParameters(0.0, 0.0, 0.0)
    if event_type not in FREE_LIVE_EVENT_BONUS_EVENT_TYPES:
        return FreeLiveEventBonusDeckProfile(
            event_type=event_type,
            applied=False,
            members=(),
            original_total=zero,
            area_item_total=zero,
            event_buff_total=zero,
            final_total=zero,
        )

    profiles = []
    for source in sources:
        original_values = tuple(
            getattr(source.original, name) for name in DECK_PARAMETER_NAMES
        )
        area_item_included_values = tuple(
            (original + getattr(source.area_item_fixed, name))
            * (getattr(source.area_item_rate, name) + 1.0)
            for name, original in zip(DECK_PARAMETER_NAMES, original_values)
        )
        area_item_bonus_values = tuple(
            included - original
            for included, original in zip(
                area_item_included_values,
                original_values,
            )
        )
        event_multiplier = (
            source.resolved_event_parameter_buff_percent + 100.0
        ) / 100.0
        event_buff_values = []
        for name, original in zip(DECK_PARAMETER_NAMES, original_values):
            percent_delta = original * event_multiplier - original
            flat_delta = (
                source.resolved_event_parameter_flat
                if source.resolved_event_effect_parameter == name
                else 0.0
            )
            event_buff_values.append(percent_delta + flat_delta)
        final_values = tuple(
            original + area_bonus + event_buff
            for original, area_bonus, event_buff in zip(
                original_values,
                area_item_bonus_values,
                event_buff_values,
            )
        )
        profiles.append(
            FreeLiveEventBonusMemberProfile(
                original=source.original,
                area_item_included=_score_parameters_from_values(
                    area_item_included_values
                ),
                area_item_bonus=_score_parameters_from_values(area_item_bonus_values),
                event_buff=_score_parameters_from_values(event_buff_values),
                final=_score_parameters_from_values(final_values),
            )
        )

    def aggregate(attribute: str) -> DeckScoreParameters:
        return _score_parameters_from_values(
            sum(getattr(getattr(profile, attribute), name) for profile in profiles)
            for name in DECK_PARAMETER_NAMES
        )

    return FreeLiveEventBonusDeckProfile(
        event_type=event_type,
        applied=True,
        members=tuple(profiles),
        original_total=aggregate("original"),
        area_item_total=aggregate("area_item_bonus"),
        event_buff_total=aggregate("event_buff"),
        final_total=aggregate("final"),
    )


@dataclass(frozen=True)
class BaseScoreProfile:
    total_parameter: float
    score_level: int
    max_note_count: int
    free_live_event_bonus_total_parameter: float
    base_score: float
    free_live_event_bonus_base_score: float


def unity_mathf_approximately(left: float, right: float) -> bool:
    difference = abs(right - left)
    tolerance = max(1.0e-6 * max(abs(left), abs(right)), 1.12103877e-44)
    return difference < tolerance


def max_note_count_from_notes(notes: Iterable["NoteSpec"]) -> int:
    count = 0
    for note in notes:
        count += 1
        if note.kind == "long" and note.end_position is not None:
            count += 1
        elif note.kind == "slide" and note.end_position is not None:
            visibility = note.intermediate_invisible or (
                False,
            ) * len(note.intermediate_positions)
            count += sum(not invisible for invisible in visibility)
            if not note.end_invisible:
                count += 1
    return count


def initialize_base_scores(
    deck_members: Iterable[DeckScoreParameters],
    score_level: int,
    notes: Iterable["NoteSpec"],
    free_live_event_bonus_total_parameter: float = 0.0,
    free_live_event_bonus_deck_profile: FreeLiveEventBonusDeckProfile | None = None,
) -> BaseScoreProfile:
    members = tuple(deck_members)
    chart_notes = tuple(notes)
    total_parameter = sum(member.total for member in members)
    max_note_count = max_note_count_from_notes(chart_notes)
    if max_note_count <= 0:
        raise ValueError("base-score initialization requires at least one Note")
    if free_live_event_bonus_deck_profile is not None:
        if free_live_event_bonus_total_parameter != 0.0:
            raise ValueError(
                "supply either a Free Live event-bonus deck profile or a total parameter"
            )
        free_live_event_bonus_total_parameter = (
            free_live_event_bonus_deck_profile.total_parameter
        )
    if not isfinite(free_live_event_bonus_total_parameter):
        raise ValueError("Free Live event-bonus total parameter must be finite")
    play_level_rate = score_rate_by_music_play_level(score_level)
    bonus_base_score = (
        0.0
        if unity_mathf_approximately(
            free_live_event_bonus_total_parameter,
            0.0,
        )
        else calculate_base_score(
            free_live_event_bonus_total_parameter,
            play_level_rate,
            max_note_count,
        )
    )
    return BaseScoreProfile(
        total_parameter=total_parameter,
        score_level=score_level,
        max_note_count=max_note_count,
        free_live_event_bonus_total_parameter=(
            free_live_event_bonus_total_parameter
        ),
        base_score=calculate_base_score(
            total_parameter,
            play_level_rate,
            max_note_count,
        ),
        free_live_event_bonus_base_score=bonus_base_score,
    )


def score_utility_get_base_score(
    base_score: float,
    *,
    is_multi_play_game_over: bool,
    is_single_play_game_over: bool,
    in_game_mode: int,
    is_enable_practice: bool,
    is_collabo_original_music: bool,
) -> float:
    if is_multi_play_game_over and in_game_mode != 5:
        return base_score * 0.1
    if is_single_play_game_over and (
        is_enable_practice or is_collabo_original_music
    ):
        return base_score * 0.1
    return base_score


@dataclass(frozen=True)
class OrthographicCameraProfile:
    viewport_width: int
    viewport_height: int
    orthographic_size: float = 1.0
    center: tuple[float, float] = (0.0, 0.0)

    def __post_init__(self) -> None:
        if self.viewport_width <= 0 or self.viewport_height <= 0:
            raise ValueError("camera viewport size must be positive")
        if self.orthographic_size <= 0:
            raise ValueError("orthographic size must be positive")

    def screen_size_world(self) -> tuple[float, float]:
        return (
            self.orthographic_size * self.viewport_width / self.viewport_height,
            self.orthographic_size,
        )

    def world_to_pixel(self, position: tuple[float, float]) -> tuple[float, float]:
        half_width, half_height = self.screen_size_world()
        return (
            (position[0] - self.center[0] + half_width)
            / (2.0 * half_width)
            * self.viewport_width,
            (half_height - (position[1] - self.center[1]))
            / (2.0 * half_height)
            * self.viewport_height,
        )

    def pixel_to_world(self, position: tuple[float, float]) -> tuple[float, float]:
        half_width, half_height = self.screen_size_world()
        return (
            position[0] / self.viewport_width * (2.0 * half_width)
            - half_width
            + self.center[0],
            half_height
            - position[1] / self.viewport_height * (2.0 * half_height)
            + self.center[1],
        )


@dataclass(frozen=True)
class RenderProjectionConfig:
    local_scale_x: float = 0.5
    screen_to_safe_area_ratio: float = 1.0
    screen_width_adjust_rate: float = 1.0
    screen_size_x: float | None = None
    ui_screen_width: float | None = None
    ui_screen_height: float | None = None
    ui_safe_area_width: float | None = None
    ui_safe_area_height: float | None = None
    note_size: float = 100.0
    multi_range_notes: bool = False
    specific_speed: float = 10.0
    note_start_y: float | None = None
    goal_y: float = RHYTHM_SCENE_GOAL_Y
    high_aspect_ratio: float = 0.0
    perspective_scale_enabled: bool = True
    virtual_lane_start_delta_x: float | None = None
    virtual_lane_end_delta_x: float = RHYTHM_SCENE_VIRTUAL_END_DELTA_X
    long_note_line_brightness: int = 100
    launch_distance_rate: float = RHYTHM_SCENE_LAUNCH_DISTANCE_RATE
    sudden_rate: int = 0
    sudden_top_y: float = 1.0
    sudden_bottom_y: float = 0.0
    sync_line_enabled: bool = True
    multiple_flick_back_lines_enabled: bool = True
    directional_flick_skin_bundle: str | None = None
    note_skin_bundle: str | None = None
    note_color_enabled: bool = False
    slide_virtual_perfect_line: float | None = None
    slide_adjust_value_b: int = 0
    slide_root_line_inactive: bool = False

    @classmethod
    def from_orthographic_camera(
        cls,
        camera: OrthographicCameraProfile,
        **overrides: object,
    ) -> "RenderProjectionConfig":
        screen_size_x, _ = camera.screen_size_world()
        values: dict[str, object] = {
            "screen_size_x": screen_size_x,
            "ui_screen_width": float(camera.viewport_width),
            "ui_screen_height": float(camera.viewport_height),
        }
        values.update(overrides)
        return cls(**values)

    def screen_width_adjust_rate_value(self) -> float:
        if self.screen_size_x is None:
            return self.screen_width_adjust_rate
        if self.screen_size_x <= 0:
            raise ValueError("screen size X must be positive")
        return self.screen_size_x / RHYTHM_REFERENCE_SCREEN_SIZE_X

    def normalized_note_size(self) -> float:
        note_size = self.note_size
        if self.multi_range_notes:
            note_size = min(
                max(note_size, MULTI_RANGE_NOTE_SIZE_MIN),
                MULTI_RANGE_NOTE_SIZE_MAX,
            )
        return note_size / 100.0

    def note_setting_scale_value(self) -> float:
        return self.screen_width_adjust_rate_value() * self.normalized_note_size()

    def _ui_safe_area_metrics(self) -> tuple[float, float, float, float] | None:
        if self.ui_screen_width is None and self.ui_screen_height is None:
            if self.ui_safe_area_width is not None or self.ui_safe_area_height is not None:
                raise ValueError("UI safe-area size requires UI screen size")
            return None
        if self.ui_screen_width is None or self.ui_screen_height is None:
            raise ValueError("UI screen width and height must be provided together")
        screen_width = self.ui_screen_width
        screen_height = self.ui_screen_height
        if screen_width <= 0 or screen_height <= 0:
            raise ValueError("UI screen size must be positive")
        safe_area_width = (
            screen_width
            if self.ui_safe_area_width is None
            else self.ui_safe_area_width
        )
        safe_area_height = (
            screen_height
            if self.ui_safe_area_height is None
            else self.ui_safe_area_height
        )
        if (
            safe_area_width <= 0
            or safe_area_height <= 0
            or safe_area_width > screen_width
            or safe_area_height > screen_height
        ):
            raise ValueError("UI safe-area size must fit inside UI screen size")
        return screen_width, screen_height, safe_area_width, safe_area_height

    def vertical_fit_screen_ratio_value(self) -> float:
        metrics = self._ui_safe_area_metrics()
        if metrics is None:
            return 1.0
        screen_width, screen_height, _, _ = metrics
        screen_ratio_x = screen_width / STAR_UI_SCREEN_WIDTH_BASE
        return screen_height / (screen_ratio_x * STAR_UI_SCREEN_HEIGHT_BASE)

    def screen_to_safe_area_ratio_value(self) -> float:
        metrics = self._ui_safe_area_metrics()
        if metrics is None:
            if self.screen_to_safe_area_ratio <= 0:
                raise ValueError("screen-to-safe-area ratio must be positive")
            return self.screen_to_safe_area_ratio
        screen_width, screen_height, safe_area_width, safe_area_height = metrics
        vertical_fit_ratio = self.vertical_fit_screen_ratio_value()
        full_safe_area = (
            int(safe_area_width) == int(screen_width)
            and int(safe_area_height) == int(screen_height)
        )
        if full_safe_area:
            aspect_ratio = screen_width / screen_height
            if aspect_ratio > STAR_UI_ASPECT_RATIO_BASE:
                return vertical_fit_ratio
            return 1.0
        ratio = min(
            safe_area_width / screen_width,
            safe_area_height / screen_height,
        )
        screen_ratio_x = screen_width / STAR_UI_SCREEN_WIDTH_BASE
        screen_ratio_y = screen_height / STAR_UI_SCREEN_HEIGHT_BASE
        if screen_ratio_x >= screen_ratio_y:
            ratio *= vertical_fit_ratio
        return ratio

    def safe_area_to_screen_ratio_value(self) -> float:
        return 1.0 / self.screen_to_safe_area_ratio_value()

    def particle_scale_value(self) -> float:
        return (
            self.note_setting_scale_value()
            * self.screen_to_safe_area_ratio_value()
        )

    def button_center_x(self, lane: int, width: int = 1) -> float:
        if lane == 0:
            return 0.0
        if width < 1 or lane < 1 or lane + width - 1 > 7:
            raise ValueError("scene button range must stay inside ButtonType 1..7")
        center = lane + (width - 1) * 0.5
        return (
            (center - RHYTHM_SCENE_BUTTON_CENTER)
            * RHYTHM_SCENE_BUTTON_SPACING_X
            * self.screen_width_adjust_rate_value()
        )

    def note_start_x(self, lane: int, width: int = 1) -> float:
        return self.button_center_x(lane, width) * self.launch_distance_rate

    def goal_position_y(self) -> float:
        return self.goal_y * self.screen_width_adjust_rate_value()

    def note_start_position_y(self) -> float:
        if self.note_start_y is not None:
            return self.note_start_y * self.screen_width_adjust_rate_value()
        goal_y = self.goal_position_y()
        vanishing_y = self.vanishing_position_y()
        return goal_y + (1.0 - self.launch_distance_rate) * (
            vanishing_y - goal_y
        )

    def vanishing_position_y(self) -> float:
        return self.goal_position_y() + self.button_center_x(
            1
        ) * RHYTHM_SCENE_VANISHING_SLOPE

    def virtual_lane_start_delta_x_value(self) -> float:
        if self.virtual_lane_start_delta_x is not None:
            return (
                self.virtual_lane_start_delta_x
                * self.screen_width_adjust_rate_value()
            )
        return self.virtual_lane_end_delta_x_value() * self.launch_distance_rate

    def virtual_lane_end_delta_x_value(self) -> float:
        return (
            self.virtual_lane_end_delta_x
            * self.screen_width_adjust_rate_value()
        )


@dataclass(frozen=True)
class ResourceBinding:
    resource_id: str
    path: str | None
    resource_type: str
    source_url: str | None = None
    source_sha256: str | None = None
    atlas_manifest_url: str | None = None
    atlas_manifest_sha256: str | None = None
    atlas_sprite_names: tuple[str, ...] = ()

    @property
    def has_verified_external_source(self) -> bool:
        return self.source_url is not None and self.source_sha256 is not None


@dataclass(frozen=True)
class NoteSkinProfile:
    bundle_name: str
    sprite_names: frozenset[str]


@dataclass(frozen=True)
class JudgeCueAudioProfile:
    cue_name: str
    cue_sheet: str
    codec: str
    sample_rate: int
    channels: int
    total_samples: int
    embedded_offset: int
    encoded_bytes: int
    loop_start: int | None = None
    loop_end: int | None = None
    cue_id: int = 0
    length_ms: int = 0
    memory_awb_id: int = 0
    loop_flag: int = 1
    reference_type: int = 3
    playback_ratio: int = 100

    @property
    def duration_seconds(self) -> float:
        return self.total_samples / self.sample_rate

    @property
    def event_command_hex(self) -> str:
        return f"07d0040002{self.cue_id:04x}000000"

    @property
    def sequence_command_hex(self) -> str:
        return f"004f050004{self.cue_id:04x}00006f0400002710"


@dataclass(frozen=True)
class JudgeCueSheetProfile:
    name: str
    format_version: int
    version_string: str
    acb_volume: float
    cue_priority_type: int
    num_cue_limit: int
    num_cue_limit_list_works: int
    num_cue_limit_node_works: int
    output_reference: str
    aisac_table_bytes: int = 0
    global_aisac_reference_table_bytes: int = 0
    action_track_table_bytes: int = 0


@dataclass(frozen=True)
class SkillCueAudioProfile:
    cue_name: str
    cue_sheet: str
    cue_index: int
    cue_id: int
    length_ms: int
    sequence_index: int
    track_index: int
    track_event_index: int
    synth_index: int
    waveform_index: int
    memory_awb_id: int
    codec: str
    sample_rate: int
    channels: int
    total_samples: int
    embedded_offset: int
    encoded_bytes: int
    output_reference: str
    mp3_sha256: str
    loop_flag: int = 1
    reference_type: int = 3
    playback_ratio: int = 100

    @property
    def duration_seconds(self) -> float:
        return self.total_samples / self.sample_rate

    @property
    def event_command_hex(self) -> str:
        return f"07d0040002{self.cue_index:04x}000000"

    @property
    def sequence_command_hex(self) -> str:
        return "006f0400002710"


@dataclass(frozen=True)
class JudgeAudioGlobalProfile:
    name: str
    format_version: int
    version_string: str
    file_size: int
    sha256: str
    md5: str
    internal_md5: str
    bundle_name: str
    bundle_catalog_hash: str
    bundle_crc: int
    bundle_size: int
    text_asset_path_id: int
    output_bus_name: str
    bus_volume: float
    pan3d_volume: float
    pan3d_angle: float
    pan3d_distance: float
    dsp_settings: tuple[tuple[str, int, int, int], ...]
    category_name: str
    category_id: int
    category_group_index: int
    categories_parallel_playback: int
    voice_limit_group_name: str
    voice_limit_max_numbers: int
    aisac_controls: tuple[tuple[str, int], ...]
    global_aisac_count: int
    selector_count: int
    graph_count: int
    dsp_fx_count: int
    bus_link_count: int
    cue_sheet_build_acf_md5: str
    cue_sheet_build_acf_md5_matches: bool
    bootstrap_scene_file: str
    bootstrap_scene_sha256: str
    bootstrap_cri_atom_path_id: int
    bootstrap_acf_file: str
    bootstrap_cue_sheet_count: int
    serialized_dsp_bus_setting: str | None
    dynamic_acf_registration_method: str
    managed_game_dsp_attach_call_count: int
    native_runtime_dsp_attachment_observed: bool


@dataclass(frozen=True)
class AudioResourcePoolProfile:
    count: int
    source_component: str
    android_low_latency_voice_pool: bool


@dataclass(frozen=True)
class JudgeAudioPlaybackParameters:
    volume: float
    pitch: float
    pan3d_distance: float
    pan3d_angle: float
    start_time_ms: int
    loop: bool
    use_3d_positioning: bool
    android_low_latency_voice_pool: bool
    requested_sound_renderer_type: int
    matching_static_voice_pool_available: bool


@dataclass(frozen=True)
class JudgeAudioPlayerProfile:
    bgm_pool: AudioResourcePoolProfile
    se_pool: AudioResourcePoolProfile
    se_one_shot_pool: AudioResourcePoolProfile
    voice_pool: AudioResourcePoolProfile
    low_latency_live_core_enabled: bool
    android_sonic_sync_enabled: bool
    ios_sonic_sync_enabled: bool
    output_sampling_rate: int
    server_frequency: float
    standard_memory_voices: int
    standard_streaming_voices: int
    android_buffering_time_ms: int
    android_start_buffering_time_ms: int
    android_low_latency_memory_voices: int
    android_low_latency_streaming_voices: int
    android_uses_fast_mixer: bool
    android_force_asr: bool
    android_uses_aaudio: bool
    android_stream_type: int
    default_sound_renderer_type: int
    standard_voice_pool_sound_renderer_type: int
    android_low_latency_voice_pool_sound_renderer_type: int
    managed_manual_standard_voice_pool_constructor_call_count: int
    native_cross_renderer_voice_pool_fallback: bool
    runtime_voice_pool_selection_observed: bool

    @staticmethod
    def channel_volume(master_volume: float, option_volume: float) -> float:
        return master_volume * option_volume

    def has_matching_voice_pool(self, sound_renderer_type: int) -> bool:
        if sound_renderer_type == self.standard_voice_pool_sound_renderer_type:
            return self.standard_memory_voices + self.standard_streaming_voices > 0
        if sound_renderer_type == self.android_low_latency_voice_pool_sound_renderer_type:
            return (
                self.android_low_latency_memory_voices
                + self.android_low_latency_streaming_voices
                > 0
            )
        return False

    def resolve_se_playback(
        self,
        master_volume: float,
        se_option_volume: float,
        requested_volume: float = 1.0,
        pitch: float = 0.0,
        pan: float = 0.0,
        seek_time_ms: int = 0,
    ) -> JudgeAudioPlaybackParameters:
        requested_sound_renderer_type = (
            self.android_low_latency_voice_pool_sound_renderer_type
            if self.se_pool.android_low_latency_voice_pool
            else self.default_sound_renderer_type
        )
        return JudgeAudioPlaybackParameters(
            volume=self.channel_volume(master_volume, se_option_volume)
            * requested_volume,
            pitch=pitch,
            pan3d_distance=0.0 if pan == 0.0 else 1.0,
            pan3d_angle=pan,
            start_time_ms=seek_time_ms,
            loop=False,
            use_3d_positioning=False,
            android_low_latency_voice_pool=(
                self.se_pool.android_low_latency_voice_pool
            ),
            requested_sound_renderer_type=requested_sound_renderer_type,
            matching_static_voice_pool_available=self.has_matching_voice_pool(
                requested_sound_renderer_type
            ),
        )


@dataclass(frozen=True)
class RhythmAdjustLatencyProfile:
    division_rate: int = 100
    beat_per_second: float = 2.0
    beat_per_frame: float = 0.033333335
    invalid_result: int = 99999
    judgement_count: int = 4
    android_wait_seconds: float = 0.5
    playing_seconds: float = 6.5
    reverberation_wait_seconds: float = 1.0
    managed_latency_estimator_initialize_call_count: int = 0
    runtime_latency_estimator_initialization_observed: bool = False

    def music_bar_division(self, external_beat_division: int) -> int:
        return self.division_rate * external_beat_division

    def progress_per_frame(self, external_beat_division: int) -> int:
        music_bar_division = self.music_bar_division(external_beat_division)
        quarter_bar = _truncating_int_division(music_bar_division, 4)
        return int(_float32(_float32(quarter_bar) * _float32(self.beat_per_frame)))


def _float32(value: float | int) -> float:
    return struct.unpack("<f", struct.pack("<f", value))[0]


def _truncating_int_division(numerator: int, denominator: int) -> int:
    if denominator == 0:
        raise ZeroDivisionError("integer division by zero")
    quotient = abs(numerator) // abs(denominator)
    return -quotient if (numerator < 0) != (denominator < 0) else quotient


def rhythm_adjust_phase(music_timer: float, music_bar_division: int) -> int:
    if music_bar_division <= 0:
        raise ValueError("music_bar_division must be positive")
    doubled_timer = _float32(_float32(music_timer) + _float32(music_timer))
    scaled = _float32(
        doubled_timer * _float32(_truncating_int_division(music_bar_division, 4))
    )
    return int(scaled) % music_bar_division


def rhythm_adjust_judgement(
    target_phase: int, current_phase: int, progress_per_frame: int
) -> int:
    return _truncating_int_division(target_phase - current_phase, progress_per_frame)


def rhythm_adjust_average(
    judgements: Iterable[int], invalid_result: int = 99999
) -> int:
    valid = tuple(value for value in judgements if value != invalid_result)
    if not valid:
        return 0
    average = _float32(_float32(sum(valid)) / _float32(len(valid)))
    return int(round(average))


@dataclass(frozen=True)
class JudgementTimingAdjustmentProfile:
    primary_min: int = -30
    primary_max: int = 30
    secondary_min: int = -5
    secondary_max: int = 5
    milliseconds_per_frame: float = 16.667

    def primary_music_start_delay_frames(self, value: int) -> int:
        return max(value, 0)

    def primary_gameplay_start_delay_frames(self, value: int) -> int:
        return max(-value, 0)

    def primary_music_tolerance_ms(self, value: int) -> int:
        scaled = _float32(_float32(value) * _float32(self.milliseconds_per_frame))
        return int(scaled)

    def done_slider_normalized(self, value: int) -> float:
        return _float32(
            _float32(value + self.primary_max)
            / _float32(self.primary_max - self.primary_min)
        )

    def done_slider_value(self, normalized: float) -> int:
        centered = _float32(_float32(normalized) - _float32(0.5))
        scaled = _float32(
            centered * _float32(self.primary_max - self.primary_min)
        )
        return int(round(scaled))

    @staticmethod
    def secondary_dictionary_index(base_index: int, value: int) -> int:
        return base_index - value

    @staticmethod
    def secondary_stop_delay_limit(value: int) -> int:
        return 6 - value if value < 0 else 0


@dataclass(frozen=True)
class PersistentSettingsSaveProfile:
    live_core_data_type: int = 5
    save_directory_name: str = "settings"
    live_core_file_name: str = "lcs"
    crypt_key: str = "12345678abdegopq"
    aes_key_size: int = 128
    aes_mode: int = 1
    aes_padding: int = 5
    null_iv: bool = True
    no_backup_flag: bool = True

    @property
    def live_core_relative_path_components(self) -> tuple[str, str]:
        return (self.save_directory_name, self.live_core_file_name)

    @property
    def transaction_steps(self) -> tuple[str, ...]:
        return (
            "serialize",
            "aes_encrypt",
            "ensure_directory",
            "resolve_file_path",
            "write_all_bytes",
        )


@dataclass
class FrameRateControlState:
    android_api_level: int = 30
    current_activity_available: bool = True
    surface_view_available: bool = True
    surface_available: bool = True
    surface_valid: bool = True
    init_display_refresh_rate: float = 0.0
    application_target_frame_rate: int = -1
    requested_surface_frame_rate: float | None = None
    applied_surface_frame_rate: float | None = None
    surface_frame_rate_compatibility: int | None = None
    refresh_rate_setter_created: bool = False
    surface_callback_registered: bool = False
    high_frequency_mode: bool = False

    def refresh_rate_init(self, numerator: int, denominator: int) -> float:
        if numerator < 0 or denominator <= 0:
            raise ValueError(
                "refresh-rate ratio must contain unsigned numerator and positive denominator"
            )
        ratio = float(numerator) / float(denominator)
        self.init_display_refresh_rate = _float32(round(ratio, 1))
        selected_rate = max(
            self.init_display_refresh_rate,
            _float32(self.application_target_frame_rate),
        )
        self._plugin_refresh_rate_init(selected_rate)
        return selected_rate

    def set_target_frame_rate(self, frame_rate: int) -> float:
        self.application_target_frame_rate = frame_rate
        selected_rate = max(
            self.init_display_refresh_rate,
            _float32(frame_rate),
        )
        self._plugin_set_refresh_rate(selected_rate)
        return selected_rate

    def set_high_frequency_mode(self, value: bool) -> None:
        self.high_frequency_mode = bool(value)

    def initialize_gameplay_frame_rate(self) -> float:
        frame_rate = 120 if self.high_frequency_mode else 60
        return self.set_target_frame_rate(frame_rate)

    def surface_created(self, valid: bool = True) -> None:
        self.surface_available = True
        self.surface_valid = valid
        if self.requested_surface_frame_rate is not None:
            self._setter_set_frame_rate(self.requested_surface_frame_rate)

    def surface_destroyed(self) -> None:
        self.surface_available = False
        self.surface_valid = False

    def _plugin_refresh_rate_init(self, frame_rate: float) -> None:
        if self.refresh_rate_setter_created or not self.current_activity_available:
            return
        if not self.surface_view_available:
            return
        self.refresh_rate_setter_created = True
        self.surface_callback_registered = True
        self.requested_surface_frame_rate = 0.0
        if self.surface_available and self.surface_valid:
            self._setter_set_frame_rate(frame_rate)

    def _plugin_set_refresh_rate(self, frame_rate: float) -> None:
        if self.refresh_rate_setter_created:
            self._setter_set_frame_rate(frame_rate)

    def _setter_set_frame_rate(self, frame_rate: float) -> None:
        self.requested_surface_frame_rate = _float32(frame_rate)
        if (
            self.surface_available
            and self.surface_valid
            and self.android_api_level >= 30
        ):
            self.applied_surface_frame_rate = self.requested_surface_frame_rate
            self.surface_frame_rate_compatibility = 0


def secondary_adjusted_music_position(
    current_position: float,
    value: int,
    advance_one_frame: Callable[[float], float],
    rewind_one_frame: Callable[[float], float],
) -> float:
    position = current_position
    step = advance_one_frame if value > 0 else rewind_one_frame
    for _ in range(abs(value)):
        position = step(position)
    return position


def secondary_slide_release_result(result: str, value: int) -> str:
    return "perfect" if value >= 1 else result


@dataclass(frozen=True)
class MaterialBinding:
    role: str
    material_resource_path: str
    texture_resource_name: str | None
    material_field: str
    texture_field: str | None
    renderer_property: str = "MeshRenderer.sharedMaterial"
    material_asset_name: str | None = None
    material_asset_entry: str | None = None
    shader_name: str | None = None
    serialized_float_properties: tuple[tuple[str, float], ...] = ()


NOTE_MESH_MATERIAL_BINDINGS = {
    "long": MaterialBinding(
        role="long_note_mesh",
        material_resource_path="Materials/BMS/longNoteBelt",
        texture_resource_name="longNoteLine",
        material_field="LongNoteMeshMaterial",
        texture_field="longNoteMeshTexture",
        material_asset_name="longNoteBelt",
        material_asset_entry="assets/bin/Data/67de6f2cbabf54e29a283226b31c406d",
        shader_name="star/Star Transparent Colored",
        serialized_float_properties=(("_Threshold", 2000.0),),
    ),
    "slide": MaterialBinding(
        role="curve_slide_note_mesh",
        material_resource_path="Materials/BMS/curveSlideNoteBelt",
        texture_resource_name="longNoteLine2",
        material_field="CurveSlideNoteMeshMaterial",
        texture_field="curveSlideNoteMeshTexture",
        material_asset_name="curveSlideNoteBelt",
        material_asset_entry="assets/bin/Data/53bccb404867c416193664ae3e58688b",
        shader_name="star/Star Transparent Colored",
        serialized_float_properties=(("_Threshold", 704.72900390625),),
    ),
}

STAR_TRANSPARENT_COLORED_SHADER_NAME = "star/Star Transparent Colored"
STAR_TRANSPARENT_COLORED_DEFAULT_THRESHOLD = 750.0
MULTIPLE_FLICK_BACK_LINE_SHADER_NAME = STAR_TRANSPARENT_COLORED_SHADER_NAME
MULTIPLE_FLICK_BACK_LINE_SERIALIZED_THRESHOLD = 750.0


SYNC_NOTE_LINE_BINDING = MaterialBinding(
    role="sync_note_line",
    material_resource_path="Materials/BMS/SyncNoteLine",
    texture_resource_name=None,
    material_field="SyncNoteLineMaterial",
    texture_field="syncLineSprite.texture",
    renderer_property="LineRenderer.material",
    material_asset_name="SyncNoteLine",
    material_asset_entry="assets/bin/Data/3f60f90d3b06d4b45b1c82db0745afd3",
    shader_name=STAR_TRANSPARENT_COLORED_SHADER_NAME,
    serialized_float_properties=(
        ("_Threshold", STAR_TRANSPARENT_COLORED_DEFAULT_THRESHOLD),
    ),
)


MULTIPLE_FLICK_BACK_LINE_BINDINGS = {
    "left": MaterialBinding(
        role="multiple_directional_flick_back_line_left",
        material_resource_path="Materials/BMS/MultipleDirectionalFlickNoteLineLeft",
        texture_resource_name="FlickNoteLine_l",
        material_field="MultipleDirectionalFlickBackLineLeftMaterial",
        texture_field="directionalFlickNoteSkinAssetLoader:FlickNoteLine_l",
        renderer_property="LineRenderer.material",
        material_asset_name="MultipleDirectionalFlickNoteLineLeft",
        material_asset_entry="assets/bin/Data/ea1bbffe7edf24fc781052f1eaae2ff2",
        shader_name=MULTIPLE_FLICK_BACK_LINE_SHADER_NAME,
        serialized_float_properties=(
            ("_Threshold", MULTIPLE_FLICK_BACK_LINE_SERIALIZED_THRESHOLD),
        ),
    ),
    "right": MaterialBinding(
        role="multiple_directional_flick_back_line_right",
        material_resource_path="Materials/BMS/MultipleDirectionalFlickNoteLineRight",
        texture_resource_name="FlickNoteLine_r",
        material_field="MultipleDirectionalFlickBackLineRightMaterial",
        texture_field="directionalFlickNoteSkinAssetLoader:FlickNoteLine_r",
        renderer_property="LineRenderer.material",
        material_asset_name="MultipleDirectionalFlickNoteLineRight",
        material_asset_entry="assets/bin/Data/9f17aae32df0a431996639e57b2056d2",
        shader_name=MULTIPLE_FLICK_BACK_LINE_SHADER_NAME,
        serialized_float_properties=(
            ("_Threshold", MULTIPLE_FLICK_BACK_LINE_SERIALIZED_THRESHOLD),
        ),
    ),
}


@dataclass(frozen=True)
class MultipleFlickBackLineTextureProfile:
    bundle_name: str
    width: int
    height: int
    left_sha256: str
    right_sha256: str
    edge_rgb: dict[str, tuple[int, int, int]]
    core_rgb: dict[str, tuple[int, int, int]]
    alpha_by_png_row: tuple[int, ...]
    core_png_rows: tuple[int, int] = (19, 58)


@dataclass(frozen=True)
class TextureSamplingSettings:
    filter_mode: str
    wrap_u: str
    wrap_v: str
    wrap_w: str
    mip_count: int
    color_space: str
    readable: bool
    streaming_mipmaps: bool


@dataclass(frozen=True)
class NoteMeshTextureProfile:
    bundle_name: str
    resource_name: str
    width: int
    height: int
    path_id: int
    catalog_hash: str
    bundle_size: int
    bestdori_png_url: str
    bestdori_png_size: int
    bestdori_png_sha256: str
    rgba_sha256: str
    settings: TextureSamplingSettings


@dataclass(frozen=True)
class SyncLineTextureProfile:
    bundle_name: str
    resource_name: str
    sprite_path_id: int
    texture_path_id: int
    width: int
    height: int
    border: tuple[float, float, float, float]
    pixels_to_units: float
    pivot: tuple[float, float]
    extrude: int
    catalog_hash: str
    bundle_size: int
    rgba_sha256: str
    bestdori_png_url: str
    bestdori_png_size: int
    bestdori_png_sha256: str
    bestdori_rgba_sha256: str
    bestdori_different_transparent_pixels: int
    settings: TextureSamplingSettings


NOTE_MESH_TEXTURE_SETTINGS = TextureSamplingSettings(
    filter_mode="Bilinear",
    wrap_u="Clamp",
    wrap_v="Clamp",
    wrap_w="Clamp",
    mip_count=1,
    color_space="sRGB",
    readable=False,
    streaming_mipmaps=False,
)


NOTE_MESH_TEXTURE_PROFILE_DATA = {
    "skin01": {
        "catalog_hash": "12e90c8fc44f07f4cb7e96c0aa02ac0f4e0dc8aa9c1480a7a48b07c6fac9cd52",
        "bundle_size": 801954,
        "textures": {
            "longNoteLine": (
                7402371502708414576,
                2078,
                "969a24cf8d809636cb69b718f98726cf7b5f98e07e2531b3e6d229b2d5271deb",
                "76052d299dabf781a1c7a414ec675453f66c1d3609f1d15c6ccb22c1c76547af",
            ),
            "longNoteLine2": (
                7231487970219150393,
                1682,
                "81bebee2f5857f7f283d64cf93f9aa958cc1d54f03d3677deab77b9d629ad62b",
                "18affeea7c46a6c4dc3ba00b2b11646b7d021206a784f2c05c32ca7dcf7b5895",
            ),
        },
    },
    "skin02": {
        "catalog_hash": "6a2f39beee1c40bd2b88d606f4037a3dc1d3fd8404ec6b9b1d5ac69df73be735",
        "bundle_size": 376949,
        "textures": {
            "longNoteLine": (
                7115473423217960143,
                2102,
                "c752cd7f7aefc3271de76d6b7fb72121ab0d06d48230d1d8268d4ed5ecc46078",
                "f15f09de148acd90f174f4df043476c5d8d6cd2b92dfb0089c950d20c246697d",
            ),
            "longNoteLine2": (
                7681460310394702558,
                1687,
                "50837c74df501d84f77adc40c2883ee5d0d447b2b0ea48e7b07b76e50d144b34",
                "511fb3ecec309f9363a5482077205c6b3b40de0087b215229b946d2cb3476a3b",
            ),
        },
    },
    "skin03": {
        "catalog_hash": "a2a9a185ce44cddec96ef6b9d966ac0d1f332b7ccacf8f4fc105dd6d6e7e5e01",
        "bundle_size": 679905,
        "textures": {
            "longNoteLine": (
                -5384168800491679840,
                2090,
                "e1b4d6216df307e98eefd3b748a46a326ba8a53da0cd7b6002152d38b9fb817f",
                "037bd34c7820e338ec791a9d0fe4514c2a98bf793e68baf9f258f192326ec636",
            ),
            "longNoteLine2": (
                -9216925932615564254,
                1370,
                "f4becada04fd76ca6d41d56d17e9fa9dac51a659e4defd0a9a22c58a7c71694a",
                "c283824f32cbef8e5f7cd147dc32d6916208619f2c721d1fa15d11e7d8fee0db",
            ),
        },
    },
    "skin05": {
        "catalog_hash": "913ab9b16813df9da6ed65fde5759014b094853a74dfab3e3384aa43da9137d8",
        "bundle_size": 433413,
        "textures": {
            "longNoteLine": (
                -2369832090390666976,
                2087,
                "8bb2e1321806a795d9ff2e0796a989f00652983ff6fd905da892fd3f9bb3d1c7",
                "dca89cfc96d278a2118037bcd0b2e2652fd3a60cf422c780bcda6207266a9ba2",
            ),
            "longNoteLine2": (
                2188917847325838634,
                1663,
                "9c5cff1c92e8a2962fdbf42b430e97d9cf53bf8f4e519416c2d9135d112879a4",
                "d9474f7601d68da22872063841c2ae1684094a6c5ad37197567e6b8635aa5c83",
            ),
        },
    },
    "skin06": {
        "catalog_hash": "549d20ef5623d400f0dd2b668ef7a97709e92ef0b5f4ea2304e448b18cae8926",
        "bundle_size": 621746,
        "textures": {
            "longNoteLine": (
                2317461052419606043,
                2087,
                "8bb2e1321806a795d9ff2e0796a989f00652983ff6fd905da892fd3f9bb3d1c7",
                "dca89cfc96d278a2118037bcd0b2e2652fd3a60cf422c780bcda6207266a9ba2",
            ),
            "longNoteLine2": (
                -1870017609642881545,
                1663,
                "9c5cff1c92e8a2962fdbf42b430e97d9cf53bf8f4e519416c2d9135d112879a4",
                "d9474f7601d68da22872063841c2ae1684094a6c5ad37197567e6b8635aa5c83",
            ),
        },
    },
}


NOTE_MESH_TEXTURE_PROFILES = {
    skin: {
        resource_name: NoteMeshTextureProfile(
            bundle_name=f"ingameskin/noteskin/{skin}",
            resource_name=resource_name,
            width=146,
            height=205,
            path_id=texture_data[0],
            catalog_hash=profile_data["catalog_hash"],
            bundle_size=profile_data["bundle_size"],
            bestdori_png_url=(
                "https://bestdori.com/assets/jp/ingameskin/noteskin/"
                f"{skin}_rip/{resource_name}.png"
            ),
            bestdori_png_size=texture_data[1],
            bestdori_png_sha256=texture_data[2],
            rgba_sha256=texture_data[3],
            settings=NOTE_MESH_TEXTURE_SETTINGS,
        )
        for resource_name, texture_data in profile_data["textures"].items()
    }
    for skin, profile_data in NOTE_MESH_TEXTURE_PROFILE_DATA.items()
}


SYNC_LINE_TEXTURE_PROFILE_DATA = {
    "skin01": (3900388501102407585, 6770427564816064149),
    "skin02": (-5581389045460939523, -1748296204291858652),
    "skin03": (-1865298259689949843, 3271271210675296447),
    "skin05": (-1742044168669423302, 4282140477508076397),
    "skin06": (-8467063578377139492, -2687789864710615216),
}


SYNC_LINE_TEXTURE_PROFILES = {
    skin: SyncLineTextureProfile(
        bundle_name=f"ingameskin/noteskin/{skin}",
        resource_name="simultaneous_line",
        sprite_path_id=path_ids[0],
        texture_path_id=path_ids[1],
        width=10,
        height=27,
        border=(3.0, 0.0, 3.0, 0.0),
        pixels_to_units=66.0,
        pivot=(0.5, 0.5),
        extrude=1,
        catalog_hash=NOTE_MESH_TEXTURE_PROFILE_DATA[skin]["catalog_hash"],
        bundle_size=NOTE_MESH_TEXTURE_PROFILE_DATA[skin]["bundle_size"],
        rgba_sha256="c4a6e2e10a78101a0708133e02df74a40c81984bc165594db958698d9f09e3f6",
        bestdori_png_url=(
            "https://bestdori.com/assets/jp/ingameskin/noteskin/"
            f"{skin}_rip/simultaneous_line.png"
        ),
        bestdori_png_size=408,
        bestdori_png_sha256=(
            "1c9f1d79986f609733810d1068a927d895d9da2e6366c2c5d68c975caeb1bd88"
        ),
        bestdori_rgba_sha256=(
            "2c3dc5bcfc51c6c173bc0748bce8e56cb56cbaa130ae19402120bb5068547b0d"
        ),
        bestdori_different_transparent_pixels=20,
        settings=NOTE_MESH_TEXTURE_SETTINGS,
    )
    for skin, path_ids in SYNC_LINE_TEXTURE_PROFILE_DATA.items()
}


MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW = (
    2,
    5,
    10,
    16,
    24,
    34,
    45,
    58,
    68,
    78,
    86,
    92,
    97,
    100,
) + (102,) * 5 + (245,) * 5 + (204,) * 30 + (245,) * 5 + (102,) * 5 + (
    100,
    97,
    92,
    86,
    78,
    68,
    58,
    45,
    34,
    24,
    16,
    10,
    5,
    2,
)


MULTIPLE_FLICK_BACK_LINE_TEXTURE_PROFILES = {
    "directionalflickskin00": MultipleFlickBackLineTextureProfile(
        bundle_name="ingameskin/noteskin/directionalflickskin00",
        width=10,
        height=78,
        left_sha256="257b6afa33af37201bf6593c555c0b2d8efdcc38c75231957e9603762bb4dec2",
        right_sha256="a1ea528785383f0b2b25e28a1dbb14d26c672a922c31b0cf569941735ac0ac91",
        edge_rgb={"left": (126, 77, 241), "right": (250, 115, 86)},
        core_rgb={"left": (167, 133, 248), "right": (255, 173, 140)},
        alpha_by_png_row=MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW,
    ),
    "directionalflickskin01": MultipleFlickBackLineTextureProfile(
        bundle_name="ingameskin/noteskin/directionalflickskin01",
        width=10,
        height=78,
        left_sha256="8fd63e1bbc36a73de6c19d8c3b2a5307ff0eeb7a0c45e6c958bb493da463cbdf",
        right_sha256="1d2e8029c94ab38b9515f57ae6429d8e2784d5cf4e626619e1d082d454efeaf0",
        edge_rgb={"left": (25, 148, 255), "right": (255, 45, 48)},
        core_rgb={"left": (79, 183, 255), "right": (255, 105, 91)},
        alpha_by_png_row=MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW,
    ),
    "directionalflickskin02": MultipleFlickBackLineTextureProfile(
        bundle_name="ingameskin/noteskin/directionalflickskin02",
        width=10,
        height=78,
        left_sha256="90a77aade6b9d11fd39ebe6bcd78fbaeeeb4cdf1625bc57ee51d299a038d8c4a",
        right_sha256="aed2a218fecad2e82b6bc5a70b4eb35f1e8bd5ddb90e3dbedced97d6a5857188",
        edge_rgb={"left": (161, 70, 247), "right": (255, 93, 35)},
        core_rgb={"left": (191, 128, 252), "right": (255, 158, 91)},
        alpha_by_png_row=MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW,
    ),
    "directionalflickskin03": MultipleFlickBackLineTextureProfile(
        bundle_name="ingameskin/noteskin/directionalflickskin03",
        width=10,
        height=78,
        left_sha256="8fd63e1bbc36a73de6c19d8c3b2a5307ff0eeb7a0c45e6c958bb493da463cbdf",
        right_sha256="1d2e8029c94ab38b9515f57ae6429d8e2784d5cf4e626619e1d082d454efeaf0",
        edge_rgb={"left": (25, 148, 255), "right": (255, 45, 48)},
        core_rgb={"left": (79, 183, 255), "right": (255, 105, 91)},
        alpha_by_png_row=MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW,
    ),
    "directionalflickskin04": MultipleFlickBackLineTextureProfile(
        bundle_name="ingameskin/noteskin/directionalflickskin04",
        width=10,
        height=78,
        left_sha256="9cd8bd045d02b7666b1f8b88682108c3efc66624a79b74a6ff5a6a3cf19634ff",
        right_sha256="1d2e8029c94ab38b9515f57ae6429d8e2784d5cf4e626619e1d082d454efeaf0",
        edge_rgb={"left": (78, 93, 255), "right": (255, 45, 48)},
        core_rgb={"left": (137, 148, 255), "right": (255, 105, 91)},
        alpha_by_png_row=MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW,
    ),
    "directionalflickskin_persona": MultipleFlickBackLineTextureProfile(
        bundle_name="ingameskin/noteskin/directionalflickskin_persona",
        width=10,
        height=78,
        left_sha256="35895622030ac75af21dbd8f234b19f17b11b496670637cc0a6d2d9428aea8a5",
        right_sha256="bea79a2c268acd315dae8a2bfeab7da1c9cd69551823c63bbc649f138613ef6a",
        edge_rgb={"left": (0, 131, 244), "right": (255, 56, 56)},
        core_rgb={"left": (33, 142, 255), "right": (255, 121, 121)},
        alpha_by_png_row=MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW,
    ),
}


MULTIPLE_FLICK_BACK_LINE_TEXTURE_SETTINGS = {
    "directionalflickskin00": TextureSamplingSettings(
        filter_mode="Bilinear",
        wrap_u="Clamp",
        wrap_v="Clamp",
        wrap_w="Clamp",
        mip_count=1,
        color_space="sRGB",
        readable=True,
        streaming_mipmaps=False,
    ),
    "directionalflickskin01": TextureSamplingSettings(
        filter_mode="Bilinear",
        wrap_u="Clamp",
        wrap_v="Clamp",
        wrap_w="Clamp",
        mip_count=1,
        color_space="sRGB",
        readable=True,
        streaming_mipmaps=False,
    ),
    "directionalflickskin02": TextureSamplingSettings(
        filter_mode="Bilinear",
        wrap_u="Clamp",
        wrap_v="Clamp",
        wrap_w="Clamp",
        mip_count=1,
        color_space="sRGB",
        readable=False,
        streaming_mipmaps=False,
    ),
    "directionalflickskin03": TextureSamplingSettings(
        filter_mode="Bilinear",
        wrap_u="Clamp",
        wrap_v="Clamp",
        wrap_w="Clamp",
        mip_count=1,
        color_space="sRGB",
        readable=False,
        streaming_mipmaps=False,
    ),
    "directionalflickskin04": TextureSamplingSettings(
        filter_mode="Bilinear",
        wrap_u="Clamp",
        wrap_v="Clamp",
        wrap_w="Clamp",
        mip_count=1,
        color_space="sRGB",
        readable=False,
        streaming_mipmaps=False,
    ),
    "directionalflickskin_persona": TextureSamplingSettings(
        filter_mode="Bilinear",
        wrap_u="Clamp",
        wrap_v="Clamp",
        wrap_w="Clamp",
        mip_count=1,
        color_space="sRGB",
        readable=True,
        streaming_mipmaps=False,
    ),
}


def note_mesh_texture_profile(
    bundle_name: str,
    resource_name: str,
) -> NoteMeshTextureProfile:
    skin = bundle_name.rsplit("/", 1)[-1]
    try:
        return NOTE_MESH_TEXTURE_PROFILES[skin][resource_name]
    except KeyError as error:
        raise ValueError(
            f"unrecovered note-skin texture: {bundle_name}/{resource_name}"
        ) from error


def note_mesh_texture_profile_for_binding(
    bundle_name: str | None,
    material_binding: MaterialBinding | None,
) -> NoteMeshTextureProfile | None:
    if bundle_name is None or material_binding is None:
        return None
    return note_mesh_texture_profile(
        bundle_name,
        material_binding.texture_resource_name,
    )


def sync_line_texture_profile(bundle_name: str) -> SyncLineTextureProfile:
    skin = bundle_name.rsplit("/", 1)[-1]
    try:
        return SYNC_LINE_TEXTURE_PROFILES[skin]
    except KeyError as error:
        raise ValueError(
            f"unrecovered sync-line texture: {bundle_name}/simultaneous_line"
        ) from error


def multiple_flick_back_line_texture_profile(
    bundle_name: str,
) -> MultipleFlickBackLineTextureProfile:
    rip_name = bundle_name.rsplit("/", 1)[-1]
    try:
        return MULTIPLE_FLICK_BACK_LINE_TEXTURE_PROFILES[rip_name]
    except KeyError as error:
        raise ValueError(f"unrecovered directional Flick skin bundle: {bundle_name}") from error


def multiple_flick_back_line_texture_texel(
    profile: MultipleFlickBackLineTextureProfile,
    side: str,
    png_row: int,
) -> tuple[float, float, float, float]:
    if side not in {"left", "right"}:
        raise ValueError("multiple-Flick back-line texture side must be left or right")
    if not 0 <= png_row < profile.height:
        raise ValueError("multiple-Flick back-line PNG row is out of range")
    rgb = (
        profile.core_rgb[side]
        if profile.core_png_rows[0] <= png_row <= profile.core_png_rows[1]
        else profile.edge_rgb[side]
    )
    return tuple(component / 255.0 for component in (*rgb, profile.alpha_by_png_row[png_row]))


def multiple_flick_back_line_texture_sample(
    profile: MultipleFlickBackLineTextureProfile,
    side: str,
    u: float,
    v: float,
) -> tuple[float, float, float, float]:
    rip_name = profile.bundle_name.rsplit("/", 1)[-1]
    try:
        settings = MULTIPLE_FLICK_BACK_LINE_TEXTURE_SETTINGS[rip_name]
    except KeyError as error:
        raise ValueError(
            f"unrecovered directional Flick texture settings: {profile.bundle_name}"
        ) from error
    return sample_bilinear_clamp_srgb(
        lambda _x, png_row: multiple_flick_back_line_texture_texel(
            profile,
            side,
            png_row,
        ),
        profile.width,
        profile.height,
        u,
        v,
        settings,
    )


def sample_bilinear_clamp_srgb(
    texel: Callable[[int, int], tuple[float, float, float, float]],
    width: int,
    height: int,
    u: float,
    v: float,
    settings: TextureSamplingSettings,
) -> tuple[float, float, float, float]:
    """Sample top-left RGBA texels with Unity Bilinear/Clamp/sRGB semantics."""
    if width <= 0 or height <= 0:
        raise ValueError("texture dimensions must be positive")
    if (
        settings.filter_mode != "Bilinear"
        or settings.wrap_u != "Clamp"
        or settings.wrap_v != "Clamp"
        or settings.color_space != "sRGB"
        or settings.mip_count != 1
    ):
        raise ValueError("unsupported texture sampling settings")
    return sample_bilinear_srgb(texel, width, height, u, v, settings)


def sample_bilinear_srgb(
    texel: Callable[[int, int], tuple[float, float, float, float]],
    width: int,
    height: int,
    u: float,
    v: float,
    settings: TextureSamplingSettings,
) -> tuple[float, float, float, float]:
    """Sample one top-left RGBA mip level with Unity bilinear/sRGB semantics."""
    if width <= 0 or height <= 0:
        raise ValueError("texture dimensions must be positive")
    if (
        settings.filter_mode != "Bilinear"
        or settings.wrap_u not in {"Repeat", "Clamp"}
        or settings.wrap_v not in {"Repeat", "Clamp"}
        or settings.color_space != "sRGB"
    ):
        raise ValueError("unsupported texture sampling settings")
    if not isfinite(u) or not isfinite(v):
        raise ValueError("texture UV must be finite")
    sampled_u = min(max(u, 0.0), 1.0) if settings.wrap_u == "Clamp" else u
    sampled_v = min(max(v, 0.0), 1.0) if settings.wrap_v == "Clamp" else v
    png_x = sampled_u * width - 0.5
    png_y = (1.0 - sampled_v) * height - 0.5
    first_unclamped_x = floor(png_x)
    first_unclamped_y = floor(png_y)
    x_blend = png_x - first_unclamped_x
    y_blend = png_y - first_unclamped_y

    def index(value: int, size: int, wrap: str) -> int:
        if wrap == "Repeat":
            return value % size
        return min(max(value, 0), size - 1)

    first_x = index(first_unclamped_x, width, settings.wrap_u)
    second_x = index(first_unclamped_x + 1, width, settings.wrap_u)
    first_y = index(first_unclamped_y, height, settings.wrap_v)
    second_y = index(first_unclamped_y + 1, height, settings.wrap_v)

    def linear_texel(png_x: int, png_y: int) -> tuple[float, float, float, float]:
        encoded = texel(png_x, png_y)

        def srgb_to_linear(component: float) -> float:
            if component <= 0.04045:
                return component / 12.92
            return ((component + 0.055) / 1.055) ** 2.4

        return tuple(srgb_to_linear(component) for component in encoded[:3]) + (encoded[3],)

    top_left = linear_texel(first_x, first_y)
    top_right = linear_texel(second_x, first_y)
    bottom_left = linear_texel(first_x, second_y)
    bottom_right = linear_texel(second_x, second_y)

    def interpolate(
        first: tuple[float, float, float, float],
        second: tuple[float, float, float, float],
        blend: float,
    ) -> tuple[float, float, float, float]:
        return tuple(
            first[index] + (second[index] - first[index]) * blend
            for index in range(4)
        )

    top = interpolate(top_left, top_right, x_blend)
    bottom = interpolate(bottom_left, bottom_right, x_blend)
    return interpolate(top, bottom, y_blend)


def note_mesh_texture_sample(
    profile: NoteMeshTextureProfile,
    rgba: bytes,
    u: float,
    v: float,
) -> tuple[float, float, float, float]:
    """Sample decoded Bestdori/original RGBA bytes through confirmed settings."""
    expected_size = profile.width * profile.height * 4
    if len(rgba) != expected_size:
        raise ValueError(
            f"decoded texture has {len(rgba)} bytes; expected {expected_size}"
        )

    def texel(png_x: int, png_y: int) -> tuple[float, float, float, float]:
        offset = (png_y * profile.width + png_x) * 4
        return tuple(component / 255.0 for component in rgba[offset : offset + 4])

    return sample_bilinear_clamp_srgb(
        texel,
        profile.width,
        profile.height,
        u,
        v,
        profile.settings,
    )


def sync_line_texture_sample(
    profile: SyncLineTextureProfile,
    rgba: bytes,
    u: float,
    v: float,
) -> tuple[float, float, float, float]:
    expected_size = profile.width * profile.height * 4
    if len(rgba) != expected_size:
        raise ValueError(
            f"decoded sync-line texture has {len(rgba)} bytes; expected {expected_size}"
        )

    def texel(png_x: int, png_y: int) -> tuple[float, float, float, float]:
        offset = (png_y * profile.width + png_x) * 4
        return tuple(component / 255.0 for component in rgba[offset : offset + 4])

    return sample_bilinear_clamp_srgb(
        texel,
        profile.width,
        profile.height,
        u,
        v,
        profile.settings,
    )


def note_mesh_material_binding(
    note_kind: str,
    is_curved: bool = False,
) -> MaterialBinding | None:
    """Select the material passed to NoteMesh.SetMaterial before activation."""
    if note_kind not in ("long", "slide"):
        return None
    return NOTE_MESH_MATERIAL_BINDINGS["slide" if is_curved else "long"]


class ResourceCatalog:
    def __init__(
        self,
        notes: dict[str, ResourceBinding],
        cues: dict[str, ResourceBinding],
        note_skin_profiles: dict[str, NoteSkinProfile] | None = None,
        music: dict[str, ResourceBinding] | None = None,
    ):
        self.notes = notes
        self.cues = cues
        self.note_skin_profiles = note_skin_profiles or {}
        self.music = music or {}

    @classmethod
    def from_dict(cls, data: dict[str, object]) -> "ResourceCatalog":
        def decode(section: str) -> dict[str, ResourceBinding]:
            values = data.get(section, {})
            if not isinstance(values, dict):
                raise ValueError(f"resource section {section} must be an object")
            return {
                role: ResourceBinding(
                    resource_id=value["resource_id"],
                    path=value.get("path"),
                    resource_type=value["resource_type"],
                    source_url=value.get("source_url"),
                    source_sha256=value.get("source_sha256"),
                    atlas_manifest_url=value.get("atlas_manifest_url"),
                    atlas_manifest_sha256=value.get("atlas_manifest_sha256"),
                    atlas_sprite_names=tuple(value.get("atlas_sprite_names", ())),
                )
                for role, value in values.items()
            }

        profile_values = data.get("note_skin_profiles", {})
        if not isinstance(profile_values, dict):
            raise ValueError("note_skin_profiles must be an object")
        profiles = {
            name: NoteSkinProfile(
                bundle_name=value["bundle_name"],
                sprite_names=frozenset(value.get("sprite_names", ())),
            )
            for name, value in profile_values.items()
        }
        return cls(decode("notes"), decode("cues"), profiles, decode("music"))

    @classmethod
    def load(cls, path: Path) -> "ResourceCatalog":
        return cls.from_dict(json.loads(path.read_text(encoding="utf-8")))

    def unresolved(self) -> list[str]:
        missing = []
        for section, bindings in (
            ("notes", self.notes),
            ("cues", self.cues),
            ("music", self.music),
        ):
            for role, binding in bindings.items():
                if binding.path is None and not binding.has_verified_external_source:
                    missing.append(f"{section}.{role}")
        return sorted(missing)

    def missing_files(self, base_dir: Path) -> list[str]:
        missing = []
        for section, bindings in (
            ("notes", self.notes),
            ("cues", self.cues),
            ("music", self.music),
        ):
            for role, binding in bindings.items():
                if binding.path is not None and not (base_dir / binding.path.split("#", 1)[0]).is_file():
                    missing.append(f"{section}.{role}:{binding.path}")
        return sorted(missing)

    def note_resource(
        self,
        note_kind: str,
        button_types: tuple[int, ...] = (),
        is_range_key: bool = False,
    ) -> str | None:
        base = note_file_name_base(note_kind)
        return self.sprite_resource(base, button_types, is_range_key)

    def sprite_resource(
        self,
        base: str,
        button_types: tuple[int, ...] = (),
        is_range_key: bool | None = None,
        note_skin_profile: str = "normal",
    ) -> str | None:
        base_binding = self.notes.get(base)
        binding = base_binding
        if binding is None:
            binding = self.notes.get("default")
        if binding is None:
            return None
        if base_binding is None:
            return binding.resource_id
        parameters = NOTE_FILE_MAP_PARAMETERS.get(base)
        if parameters is None or not button_types:
            return binding.resource_id
        mapping = create_note_filename_map(base, *parameters)
        if is_range_key is None:
            is_range_key = not parameters[0]
        key = (
            str(len(button_types))
            if is_range_key
            else "_".join(str(button) for button in button_types)
        )
        resource_id = mapping.get(key)
        if resource_id is None:
            return None
        if not self.note_skin_profiles:
            return resource_id
        resolved_profile = (
            "directional"
            if base
            in {
                "note_flick_l",
                "note_flick_r",
                "note_flick_top_l",
                "note_flick_top_r",
            }
            else note_skin_profile
        )
        profile = self.note_skin_profiles.get(resolved_profile)
        if profile is None or resource_id not in profile.sprite_names:
            return None
        return resource_id

    def cue_resource(self, role: str, fallback: str) -> str:
        binding = self.cues.get(role)
        return binding.resource_id if binding is not None else fallback

    def music_resource(self, role: str) -> str | None:
        binding = self.music.get(role)
        return binding.resource_id if binding is not None else None

    def judge_cue_resource(
        self,
        result: str,
        note_kind: str,
        sound_effect_type: int | None = None,
        multiple_note_count: int = 1,
    ) -> str | None:
        """Resolve the confirmed InGameManager judge-SE route.

        The ELF relocation targets expose the concrete CRI cue strings.  The
        catalog roles retain their native slots while the fallbacks remain
        executable without local ACB binaries.
        """
        result_role = JUDGE_RESULT_CUE_ROLES.get(result)
        if result_role is None:
            return None
        if "flick" not in note_kind:
            return self.cue_resource(result_role, result)
        flick_role = flick_cue_role(sound_effect_type, multiple_note_count)
        flick_cue = self.cue_resource(flick_role, FLICK_CUE_NAMES[flick_role])
        result_cue = self.cue_resource(result_role, result)
        return f"{flick_cue}|{result_cue}"


JUDGE_RESULT_CUE_ROLES = {
    "good": "judge_result_good_ptr_06c9ebe8",
    "perfect": "judge_result_perfect_ptr_06c9ebf0",
    "great": "judge_result_great_ptr_06c9ebf8",
}


FLICK_CUE_NAMES = {
    "flick_cue_default_ptr_06c9ebc8": "flick",
    "flick_cue_directional_ptr_06c9ebd0": "directional_fl",
    "flick_cue_multiple_3_7_ptr_06c9ebd8": "directional_fl_3",
    "flick_cue_multiple_2_ptr_06c9ebe0": "directional_fl_2",
}


JUDGE_CUE_AUDIO_PROFILES = {
    "SE_RHYTHM_TAP_LONG": JudgeCueAudioProfile(
        "SE_RHYTHM_TAP_LONG", "TapSE", "CRI HCA", 44100, 1, 23253, 3872, 9920,
        0, 22997, cue_id=5, length_ms=0xFFFFFFFF, memory_awb_id=0, loop_flag=2
    ),
    "flick": JudgeCueAudioProfile(
        "flick", "TapSE", "CRI HCA", 44100, 1, 51968, 13792, 17504,
        cue_id=0, length_ms=1178, memory_awb_id=1
    ),
    "game_button": JudgeCueAudioProfile(
        "game_button", "TapSE", "CRI HCA", 44100, 1, 8800, 31296, 3168,
        cue_id=1, length_ms=199, memory_awb_id=2
    ),
    "good": JudgeCueAudioProfile(
        "good", "TapSE", "CRI HCA", 44100, 1, 22039, 34464, 7616,
        cue_id=2, length_ms=499, memory_awb_id=3
    ),
    "great": JudgeCueAudioProfile(
        "great", "TapSE", "CRI HCA", 44100, 1, 22044, 42080, 7616,
        cue_id=3, length_ms=499, memory_awb_id=4
    ),
    "perfect": JudgeCueAudioProfile(
        "perfect", "TapSE", "CRI HCA", 44100, 1, 33001, 49696, 12448,
        cue_id=4, length_ms=748, memory_awb_id=5
    ),
    "directional_fl": JudgeCueAudioProfile(
        "directional_fl", "DirectionalFlickSE", "CRI HCA", 48000, 1, 51968, 3552, 13152,
        cue_id=0, length_ms=1082, memory_awb_id=0
    ),
    "directional_fl_2": JudgeCueAudioProfile(
        "directional_fl_2", "DirectionalFlickSE", "CRI HCA", 48000, 1, 51968, 16704, 13152,
        cue_id=1, length_ms=1082, memory_awb_id=1
    ),
    "directional_fl_3": JudgeCueAudioProfile(
        "directional_fl_3", "DirectionalFlickSE", "CRI HCA", 48000, 1, 62472, 29856, 16640,
        cue_id=2, length_ms=1301, memory_awb_id=2
    ),
}


JUDGE_CUE_SHEET_PROFILES = {
    "TapSE": JudgeCueSheetProfile(
        "TapSE", 19399168, "ACB Format/PC Ver.1.28.02 Build:", 1.0, 255, 0, 6, 24, "MasterOut"
    ),
    "DirectionalFlickSE": JudgeCueSheetProfile(
        "DirectionalFlickSE", 19399168, "ACB Format/PC Ver.1.28.02 Build:", 1.0, 255, 0, 3, 12, "MasterOut"
    ),
}


SKILL_CUE_AUDIO_PROFILES = {
    "SE_RHYTHM_CUTIN_SKILL": SkillCueAudioProfile(
        "SE_RHYTHM_CUTIN_SKILL",
        "RhythmGameSE",
        8,
        70,
        3788,
        8,
        8,
        15,
        8,
        8,
        4,
        "CRI HCA",
        44100,
        1,
        167076,
        216128,
        56032,
        "MasterOut",
        "cf0339fc1c2291d803455076403e963d612a7b6b6e9a456a6bb48737014c3c2f",
    ),
    "SE_RHYTHM_CUTIN_AUDIENCE": SkillCueAudioProfile(
        "SE_RHYTHM_CUTIN_AUDIENCE",
        "RhythmGameSE",
        7,
        69,
        4466,
        7,
        7,
        14,
        7,
        7,
        3,
        "CRI HCA",
        44100,
        1,
        196980,
        150208,
        65920,
        "MasterOut",
        "abd069b4fadb057aaa9e48012d6dcb28df3c3b0c7bdb55894b717fde13c62776",
    ),
}


JUDGE_AUDIO_GLOBAL_PROFILE = JudgeAudioGlobalProfile(
    name="TutorialProject",
    format_version=18022400,
    version_string="ACF Format/PC Ver.1.13.00 Build:",
    file_size=3840,
    sha256="e2836153476a84d4b74c0fd91e5d1db5ad0bb430f1c8c984b0071fb509055994",
    md5="7f0d74c1751f71abfbf2d62d1ddfae8b",
    internal_md5="ec0b9928ae6dc0344474093549f0c75d",
    bundle_name="sound/common",
    bundle_catalog_hash="e171fe46461a3f33a1cd9a4bf9c8af3c976046ccb221619c8fd6c9c66deeaabe",
    bundle_crc=3963497081,
    bundle_size=1210887,
    text_asset_path_id=-2370862989034713582,
    output_bus_name="MasterOut",
    bus_volume=0.8999999761581421,
    pan3d_volume=1.0,
    pan3d_angle=0.0,
    pan3d_distance=1.0,
    dsp_settings=(
        ("DspBusSetting_0", 0, 1, 0),
        ("DspBusSetting_1", 1, 1, 0),
    ),
    category_name="Category_0",
    category_id=0,
    category_group_index=0,
    categories_parallel_playback=4,
    voice_limit_group_name="VoiceLimitGroup_0",
    voice_limit_max_numbers=3,
    aisac_controls=(
        ("Any", 1000),
        ("Distance", 1001),
        *((f"AisacControl{index:02d}", 1000 + index) for index in range(2, 16)),
    ),
    global_aisac_count=0,
    selector_count=0,
    graph_count=0,
    dsp_fx_count=0,
    bus_link_count=0,
    cue_sheet_build_acf_md5="0732ec49d2ccbf42c60e6b0367b7e6fe",
    cue_sheet_build_acf_md5_matches=False,
    bootstrap_scene_file="level3",
    bootstrap_scene_sha256="c626e705ce3691a53f4ddb811f479e847b70060934bd36148ecdccf83dff8b9c",
    bootstrap_cri_atom_path_id=1063,
    bootstrap_acf_file="TutorialProject.acf",
    bootstrap_cue_sheet_count=0,
    serialized_dsp_bus_setting=None,
    dynamic_acf_registration_method="CE.SoundManager.<LoadSoundBundleAsync>d__51.MoveNext",
    managed_game_dsp_attach_call_count=0,
    native_runtime_dsp_attachment_observed=False,
)


JUDGE_AUDIO_PLAYER_PROFILE = JudgeAudioPlayerProfile(
    bgm_pool=AudioResourcePoolProfile(8, "BgmCriAtomSource", False),
    se_pool=AudioResourcePoolProfile(12, "CriAtomSource", True),
    se_one_shot_pool=AudioResourcePoolProfile(1, "CriAtomSource", True),
    voice_pool=AudioResourcePoolProfile(8, "CriAtomSource", False),
    low_latency_live_core_enabled=True,
    android_sonic_sync_enabled=True,
    ios_sonic_sync_enabled=True,
    output_sampling_rate=32000,
    server_frequency=60.0,
    standard_memory_voices=16,
    standard_streaming_voices=8,
    android_buffering_time_ms=133,
    android_start_buffering_time_ms=100,
    android_low_latency_memory_voices=0,
    android_low_latency_streaming_voices=0,
    android_uses_fast_mixer=True,
    android_force_asr=True,
    android_uses_aaudio=False,
    android_stream_type=0,
    default_sound_renderer_type=2,
    standard_voice_pool_sound_renderer_type=2,
    android_low_latency_voice_pool_sound_renderer_type=1,
    managed_manual_standard_voice_pool_constructor_call_count=0,
    native_cross_renderer_voice_pool_fallback=False,
    runtime_voice_pool_selection_observed=False,
)


def judge_cue_audio_profile(cue_name: str) -> JudgeCueAudioProfile:
    try:
        return JUDGE_CUE_AUDIO_PROFILES[cue_name]
    except KeyError as error:
        raise ValueError(f"unrecovered judge cue audio profile: {cue_name}") from error


def judge_cue_sheet_profile(cue_sheet: str) -> JudgeCueSheetProfile:
    try:
        return JUDGE_CUE_SHEET_PROFILES[cue_sheet]
    except KeyError as error:
        raise ValueError(f"unrecovered judge cue sheet profile: {cue_sheet}") from error


def skill_cue_audio_profile(cue_name: str) -> SkillCueAudioProfile:
    try:
        return SKILL_CUE_AUDIO_PROFILES[cue_name]
    except KeyError as error:
        raise ValueError(f"unrecovered skill cue audio profile: {cue_name}") from error


def judge_audio_global_profile() -> JudgeAudioGlobalProfile:
    return JUDGE_AUDIO_GLOBAL_PROFILE


def judge_audio_player_profile() -> JudgeAudioPlayerProfile:
    return JUDGE_AUDIO_PLAYER_PROFILE


def flick_cue_role(sound_effect_type: int | None, multiple_note_count: int) -> str:
    """Select the concrete cue-name slot used by playFlickJudgeSE.

    Types 7/10 use special two-note and three-to-seven-note routes.  Count one
    falls through to the same route as types 6/9 in the recovered switch.
    """
    if sound_effect_type in (7, 10):
        if multiple_note_count == 2:
            return "flick_cue_multiple_2_ptr_06c9ebe0"
        if 3 <= multiple_note_count <= 7:
            return "flick_cue_multiple_3_7_ptr_06c9ebd8"
        return "flick_cue_directional_ptr_06c9ebd0"
    if sound_effect_type in (6, 9):
        return "flick_cue_directional_ptr_06c9ebd0"
    return "flick_cue_default_ptr_06c9ebc8"


def note_file_name_base(note_kind: str) -> str:
    """Map runtime semantics to confirmed NoteImageController base strings."""
    if note_kind in ("tap", "normal"):
        return "note_normal"
    if note_kind == "skill":
        return "note_skill"
    if note_kind == "long":
        return "note_long"
    if note_kind == "slide":
        return "note_slide_among"
    if note_kind in ("directional_flick_left", "flick_left"):
        return "note_flick_l"
    if note_kind in ("directional_flick_right", "flick_right"):
        return "note_flick_r"
    if note_kind == "flick_top_left":
        return "note_flick_top_l"
    if note_kind == "flick_top_right":
        return "note_flick_top_r"
    if note_kind == "flick_top":
        return "note_flick_top"
    if "flick" in note_kind:
        return "note_flick"
    return "note_normal"


def note_sprite_key(
    note_kind: str,
    note_color_enabled: bool = False,
    short_rhythm_under_8beat: bool = False,
) -> str:
    """Select the key passed by the concrete front-note setupNoteSprite path."""
    if note_kind in ("tap", "normal"):
        if note_color_enabled and short_rhythm_under_8beat:
            return "note_normal_16"
        return "note_normal"
    if note_kind in ("long", "slide"):
        return "note_long"
    return note_file_name_base(note_kind)


def note_sprite_resource_id(
    sprite_key: str,
    button_types: tuple[int, ...],
) -> str:
    """Resolve a confirmed NoteImageController filename without an asset catalog."""
    parameters = NOTE_FILE_MAP_PARAMETERS.get(sprite_key)
    if parameters is None or not button_types:
        return sprite_key
    mapping = create_note_filename_map(sprite_key, *parameters)
    key = (
        "_".join(str(button) for button in button_types)
        if parameters[0]
        else str(len(button_types))
        if parameters[1]
        else "-1"
    )
    return mapping.get(key, sprite_key)


NOTE_FILE_MAP_PARAMETERS: dict[str, tuple[bool, int]] = {
    "note_normal": (True, 0),
    "note_normal_16": (True, 0),
    "note_skill": (True, 0),
    "note_long": (True, 0),
    "note_long_flash": (True, 0),
    "note_flick": (True, 0),
    "note_flick_l": (True, 0),
    "note_flick_r": (True, 0),
    "note_slide_among": (False, 7),
    "note_flick_top": (False, 3),
    "note_flick_top_l": (False, 0),
    "note_flick_top_r": (False, 0),
}

MUSIC_BAR_DIVISION_COUNT = 192
BEZIER_SAMPLE_COUNT = 200
BEZIER_POSITION_QUANTUM = MUSIC_BAR_DIVISION_COUNT >> 6
BEZIER_LANE_KEY_CODES = (36, 31, 32, 33, 34, 35, 38)
BEZIER_CONTROL_WAV_NAMES = frozenset(
    {
        "cont_bezier_back_a",
        "cont_bezier_back_b",
        "cont_bezier_front_a",
        "cont_bezier_front_b",
        "cont_force_back_a",
        "cont_force_back_b",
        "cont_force_front_a",
        "cont_force_front_b",
    }
)
BEZIER_FORCE_FRONT_WAV_NAMES = frozenset(
    {"cont_force_front_a", "cont_force_front_b"}
)
BEZIER_FORCE_BACK_WAV_NAMES = frozenset(
    {"cont_force_back_a", "cont_force_back_b"}
)
BEZIER_SLIDE_A_WAV_NAMES = frozenset(
    {
        "slide_a",
        "slide_end_a",
        "slide_end_dir_flick_l_a",
        "slide_end_dir_flick_r_a",
        "slide_end_flick_a",
    }
)
BEZIER_SLIDE_B_WAV_NAMES = frozenset(
    {
        "slide_b",
        "slide_end_b",
        "slide_end_dir_flick_l_b",
        "slide_end_dir_flick_r_b",
        "slide_end_flick_b",
    }
)
BEZIER_WAV_DECORATIONS = (
    ".wav",
    "fever_note_",
    "_fever_note",
    "lane_change_",
    "_lane_change",
    "_skill",
    "_fever",
    "skill_",
    "fever_",
)
BEZIER_CONTROL_A_WAV_NAMES = frozenset(
    name for name in BEZIER_CONTROL_WAV_NAMES if name.endswith("_a")
)
BEZIER_CONTROL_B_WAV_NAMES = frozenset(
    name for name in BEZIER_CONTROL_WAV_NAMES if name.endswith("_b")
)
BEZIER_GENERATED_WAV_RANGES = (
    ("0S", "slide_a", "LS"),
    ("27", "slide_a", "RS"),
    ("3M", "slide_b", "LS"),
    ("51", "slide_b", "RS"),
)
MUSIC_SCORE_LANE_NUMBER_BY_KEY_CODE = {
    11: 1,
    12: 2,
    13: 3,
    14: 4,
    15: 5,
    16: 0,
    17: -1,
    18: 6,
    31: 1,
    32: 2,
    33: 3,
    34: 4,
    35: 5,
    36: 0,
    37: -1,
    38: 6,
    51: 1,
    52: 2,
    53: 3,
    54: 4,
    55: 5,
    56: 0,
    57: -1,
    58: 6,
}


def _try_parse_int32(value: str) -> int | None:
    try:
        parsed = int(value.strip(), 10)
    except ValueError:
        return None
    if not -(1 << 31) <= parsed < (1 << 31):
        return None
    return parsed


def _convert_base36_to_int(value: str) -> int:
    return int(value, 36)


def _convert_int_to_base36_pair(value: int) -> str:
    if not 0 <= value < 36 * 36:
        raise ValueError("native WAV keys require a two-digit base-36 value")
    digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return digits[value // 36] + digits[value % 36]


@dataclass
class MusicScoreHeaderState:
    wav_file_names: dict[str, str] = field(default_factory=dict)
    additive_wav_file_names: dict[str, str] = field(default_factory=dict)
    is_multi_range: bool = False

    def get_file_name(self, key: str) -> str:
        if key in self.wav_file_names:
            return self.wav_file_names[key]
        return self.additive_wav_file_names.get(key, "")

    def add_wav(self, key: int, wav_name: str) -> None:
        wav_key = _convert_int_to_base36_pair(key)
        if wav_key in self.additive_wav_file_names:
            raise ValueError(f"duplicate additive WAV key {wav_key}")
        self.additive_wav_file_names[wav_key] = wav_name

    def parse(self, lines: tuple[str, ...]) -> tuple[str, ...]:
        result: list[str] = []
        for line in lines:
            if (
                len(line) >= 2
                and line.startswith("#")
                and _try_parse_int32(line[1:]) is not None
            ):
                continue
            if len(line) >= 8:
                if "#HABAHIRO" in line:
                    self.is_multi_range = True
                if line.startswith("#WAV"):
                    key = line[4:6]
                    wav_name = line[7:].strip()
                    if key in self.wav_file_names:
                        raise ValueError(f"duplicate primary WAV key {key}")
                    self.wav_file_names[key] = wav_name
            result.append(line)
        return tuple(result)

    def has_control_key(self) -> bool:
        return any(
            control_name in wav_name
            for wav_name in self.wav_file_names.values()
            for control_name in BEZIER_CONTROL_WAV_NAMES
        )

    def reparse(self, lines: tuple[str, ...]) -> tuple[str, ...]:
        self.wav_file_names.clear()
        result: list[str] = []
        inside_wav_block = False
        for line in lines:
            if (
                len(line) >= 2
                and line.startswith("#")
                and _try_parse_int32(line[1:]) is not None
            ):
                continue
            if len(line) >= 8 and line.startswith("#WAV"):
                key = line[4:6]
                wav_name = line[7:].strip()
                if key in self.wav_file_names:
                    raise ValueError(f"duplicate primary WAV key {key}")
                self.wav_file_names[key] = wav_name
                inside_wav_block = True
            elif inside_wav_block:
                result.extend(
                    f"#WAV{key} {wav_name}"
                    for key, wav_name in self.additive_wav_file_names.items()
                )
                inside_wav_block = False
            if any(control_name in line for control_name in BEZIER_CONTROL_WAV_NAMES):
                continue
            result.append(line)
        return tuple(result)


@dataclass(frozen=True)
class BezierMusicScoreNote:
    note_id: str
    wav_name: str
    absolute_pos: int
    bar_number: int
    lane_id_str: str
    lane_id: int
    numerator: int
    denominator: int
    multi_range_width: int = 1

    @property
    def line_info(self) -> str:
        return f"#{self.bar_number:03d}{self.lane_id_str}:"

    def chart_note(self) -> BezierChartNote:
        return BezierChartNote(
            note_id=self.note_id,
            wav_name=self.wav_name,
            absolute_pos=self.absolute_pos,
            lane_absolute_pos=float(self.lane_id),
            multi_range_width=self.multi_range_width,
        )


@dataclass(frozen=True)
class BezierSourceNote:
    absolute_pos: int
    lane_absolute_pos: float
    multi_range_width: int = 1


@dataclass(frozen=True)
class BezierChartNote:
    note_id: str
    wav_name: str
    absolute_pos: int
    lane_absolute_pos: float
    multi_range_width: int = 1

    def source_note(self) -> BezierSourceNote:
        return BezierSourceNote(
            self.absolute_pos,
            self.lane_absolute_pos,
            self.multi_range_width,
        )


@dataclass(frozen=True)
class BezierExpandedNote:
    absolute_pos: int
    bar_number: int
    lane_id: str
    line_info: str
    note_wav_name: str
    is_slide_group_a: bool
    lane_absolute_pos: float
    multi_range_width: int
    diff_volume: int
    is_right_control: bool


@dataclass(frozen=True)
class BezierExpandedSegment:
    start_index: int
    control_index: int
    end_index: int
    is_slide_group_a: bool
    notes: tuple[BezierExpandedNote, ...]


def _quadratic_bezier(start: float, control: float, end: float, t: float) -> float:
    first = start + t * (control - start)
    second = control + t * (end - control)
    return first + t * (second - first)


def _quantize_bezier_position(position: float) -> int:
    quotient = int(position / BEZIER_POSITION_QUANTUM)
    base = quotient * BEZIER_POSITION_QUANTUM
    integer_remainder = int(position - base)
    if integer_remainder >= BEZIER_POSITION_QUANTUM * 0.5:
        base += BEZIER_POSITION_QUANTUM
    return base


def _bezier_note_wav_name(is_slide_group_a: bool, diff_volume: int) -> str:
    group = "slide_a" if is_slide_group_a else "slide_b"
    if diff_volume == 0:
        return f"{group}.wav"
    side = "RS" if diff_volume > 0 else "LS"
    return f"{group}_{side}{abs(diff_volume):02d}.wav"


def _build_bezier_expanded_note(
    absolute_pos: int,
    lane_absolute_pos: float,
    *,
    is_slide_group_a: bool,
    multi_range_width: int,
    is_right_control: bool,
) -> BezierExpandedNote:
    rounded_lane = int(round(lane_absolute_pos))
    if not 0 <= rounded_lane < len(BEZIER_LANE_KEY_CODES):
        raise ValueError(
            f"Bezier lane {rounded_lane} is outside the native 0..6 key table"
        )
    diff_volume = int((lane_absolute_pos - rounded_lane) * 100.0)
    lane_id = str(BEZIER_LANE_KEY_CODES[rounded_lane])
    bar_number = absolute_pos // MUSIC_BAR_DIVISION_COUNT
    return BezierExpandedNote(
        absolute_pos=absolute_pos,
        bar_number=bar_number,
        lane_id=lane_id,
        line_info=f"#{bar_number:03d}{lane_id}:",
        note_wav_name=_bezier_note_wav_name(is_slide_group_a, diff_volume),
        is_slide_group_a=is_slide_group_a,
        lane_absolute_pos=lane_absolute_pos,
        multi_range_width=multi_range_width,
        diff_volume=diff_volume,
        is_right_control=is_right_control,
    )


def normalize_bezier_wav_name(wav_name: str) -> str:
    result = wav_name
    for decoration in BEZIER_WAV_DECORATIONS:
        result = result.replace(decoration, "")
    return result


def bezier_slide_group(wav_name: str) -> bool | None:
    normalized = normalize_bezier_wav_name(wav_name)
    if normalized in BEZIER_SLIDE_A_WAV_NAMES:
        return True
    if normalized in BEZIER_SLIDE_B_WAV_NAMES:
        return False
    return None


def is_bezier_control_wav(wav_name: str) -> bool:
    return wav_name in BEZIER_CONTROL_WAV_NAMES


def sort_force_control_notes(
    notes: tuple[BezierChartNote, ...],
) -> tuple[BezierChartNote, ...]:
    result = list(notes)
    force_controls = tuple(
        note
        for note in result
        if note.wav_name
        in (BEZIER_FORCE_FRONT_WAV_NAMES | BEZIER_FORCE_BACK_WAV_NAMES)
    )
    for force_control in force_controls:
        force_index = next(
            index for index, note in enumerate(result) if note is force_control
        )
        if force_control.wav_name in BEZIER_FORCE_FRONT_WAV_NAMES:
            target_index = next(
                (
                    index
                    for index, note in enumerate(result)
                    if note.absolute_pos < force_control.absolute_pos
                    and bezier_slide_group(note.wav_name) is not None
                ),
                None,
            )
            if target_index is None:
                raise ValueError(
                    f"{force_control.note_id}: force-front control has no earlier Slide"
                )
            result.pop(force_index)
            if force_index < target_index:
                target_index -= 1
            result.insert(target_index, force_control)
        else:
            target_index = next(
                (
                    index
                    for index in range(len(result) - 1, -1, -1)
                    if result[index].absolute_pos > force_control.absolute_pos
                    and bezier_slide_group(result[index].wav_name) is not None
                ),
                None,
            )
            if target_index is None:
                raise ValueError(
                    f"{force_control.note_id}: force-back control has no later Slide"
                )
            result.pop(force_index)
            if force_index < target_index:
                target_index -= 1
            result.insert(target_index + 1, force_control)
    return tuple(result)


def expand_bezier_segment(
    start: BezierSourceNote,
    control: BezierSourceNote,
    end: BezierSourceNote,
    *,
    is_slide_group_a: bool,
    is_multi_range: bool = False,
) -> tuple[BezierExpandedNote, ...]:
    if min(start.absolute_pos, control.absolute_pos, end.absolute_pos) < 0:
        raise ValueError("Bezier positions must be non-negative")
    if start.multi_range_width < 1 or end.multi_range_width < 1:
        raise ValueError("Bezier multi-range widths must be positive")

    start_lane = start.lane_absolute_pos
    control_lane = control.lane_absolute_pos
    end_lane = end.lane_absolute_pos
    is_right_control = start_lane < control_lane and end_lane < control_lane
    if is_multi_range and is_right_control:
        start_lane += start.multi_range_width - 1
        end_lane += end.multi_range_width - 1

    expanded: list[BezierExpandedNote] = []
    for sample_index in range(1, BEZIER_SAMPLE_COUNT):
        t = min(max(sample_index / float(BEZIER_SAMPLE_COUNT), 0.0), 1.0)
        absolute_pos = _quantize_bezier_position(
            _quadratic_bezier(
                float(start.absolute_pos),
                float(control.absolute_pos),
                float(end.absolute_pos),
                t,
            )
        )
        if absolute_pos in (start.absolute_pos, end.absolute_pos):
            continue

        lane_absolute_pos = _quadratic_bezier(
            start_lane,
            control_lane,
            end_lane,
            t,
        )
        expanded.append(
            _build_bezier_expanded_note(
                absolute_pos,
                lane_absolute_pos,
                is_slide_group_a=is_slide_group_a,
                multi_range_width=start.multi_range_width,
                is_right_control=is_right_control,
            )
        )
    return tuple(expanded)


def collapse_bezier_samples(
    notes: tuple[BezierExpandedNote, ...],
) -> tuple[BezierExpandedNote, ...]:
    groups: dict[tuple[int, bool], list[BezierExpandedNote]] = {}
    for note in notes:
        groups.setdefault((note.absolute_pos, note.is_slide_group_a), []).append(
            note
        )
    collapsed: list[BezierExpandedNote] = []
    for group in groups.values():
        first = group[0]
        average_lane = sum(note.lane_absolute_pos for note in group) / len(group)
        collapsed.append(
            _build_bezier_expanded_note(
                first.absolute_pos,
                average_lane,
                is_slide_group_a=first.is_slide_group_a,
                multi_range_width=first.multi_range_width,
                is_right_control=first.is_right_control,
            )
        )
    return tuple(collapsed)


def reduce_bezier_samples(
    notes: tuple[BezierExpandedNote, ...],
) -> tuple[BezierExpandedNote, ...]:
    reduction_indices: set[int] = set()
    consecutive_reductions = 0
    if len(notes) >= 4:
        current_index = 1
        while current_index < len(notes) - 2:
            previous_index = current_index - consecutive_reductions - 1
            previous = notes[previous_index]
            current = notes[current_index]
            following = notes[current_index + 1]
            should_reduce = (
                previous.diff_volume
                == current.diff_volume
                == following.diff_volume
            )
            if not should_reduce:
                previous_angle = atan2(
                    current.absolute_pos - previous.absolute_pos,
                    current.diff_volume - previous.diff_volume,
                )
                following_angle = atan2(
                    following.absolute_pos - current.absolute_pos,
                    following.diff_volume - current.diff_volume,
                )
                should_reduce = (
                    abs(following_angle * 57.296 - previous_angle * 57.296)
                    < 2.0
                )
            if should_reduce:
                reduction_indices.add(current_index)
                consecutive_reductions += 1
            else:
                consecutive_reductions = 0
            current_index += 1
    retained = [
        note for index, note in enumerate(notes) if index not in reduction_indices
    ]
    retained.sort(key=lambda note: note.diff_volume)
    return tuple(retained)


def postprocess_bezier_samples(
    notes: tuple[BezierExpandedNote, ...],
    *,
    is_multi_range: bool = False,
) -> tuple[BezierExpandedNote, ...]:
    reduced = reduce_bezier_samples(collapse_bezier_samples(notes))
    if not is_multi_range:
        return reduced
    expanded: list[BezierExpandedNote] = []
    seen: set[tuple[str, int, int]] = set()
    for note in reduced:
        candidates = [note]
        for width_index in range(2, note.multi_range_width + 1):
            offset = float(width_index - 1)
            if note.is_right_control:
                offset = -offset
            candidates.append(
                _build_bezier_expanded_note(
                    note.absolute_pos,
                    note.lane_absolute_pos + offset,
                    is_slide_group_a=note.is_slide_group_a,
                    multi_range_width=note.multi_range_width,
                    is_right_control=note.is_right_control,
                )
            )
        for candidate in candidates:
            key = (
                candidate.line_info,
                candidate.absolute_pos,
                candidate.bar_number,
            )
            if key in seen:
                continue
            seen.add(key)
            expanded.append(candidate)
    return tuple(expanded)


def expand_bezier_triplets(
    notes: tuple[BezierChartNote, ...],
    *,
    is_multi_range: bool = False,
) -> tuple[BezierExpandedSegment, ...]:
    segments: list[BezierExpandedSegment] = []
    for start_index in range(max(len(notes) - 2, 0)):
        control_index = start_index + 1
        end_index = start_index + 2
        start = notes[start_index]
        control = notes[control_index]
        end = notes[end_index]
        start_group = bezier_slide_group(start.wav_name)
        if (
            start_group is None
            or not is_bezier_control_wav(control.wav_name)
            or bezier_slide_group(end.wav_name) is not start_group
        ):
            continue
        segments.append(
            BezierExpandedSegment(
                start_index=start_index,
                control_index=control_index,
                end_index=end_index,
                is_slide_group_a=start_group,
                notes=expand_bezier_segment(
                    start.source_note(),
                    control.source_note(),
                    end.source_note(),
                    is_slide_group_a=start_group,
                    is_multi_range=is_multi_range,
                ),
            )
        )
    return tuple(segments)


def convert_bezier_chart_notes(
    notes: tuple[BezierChartNote, ...],
    *,
    is_multi_range: bool = False,
) -> tuple[BezierExpandedNote, ...]:
    ordered = sort_force_control_notes(notes)
    raw = tuple(
        note
        for segment in expand_bezier_triplets(
            ordered, is_multi_range=is_multi_range
        )
        for note in segment.notes
    )
    return postprocess_bezier_samples(raw, is_multi_range=is_multi_range)


def serialize_bezier_music_score_lines(
    notes: tuple[BezierExpandedNote, ...],
    wav_keys: dict[str, str],
) -> tuple[str, ...]:
    grouped: dict[str, list[BezierExpandedNote]] = {}
    for note in notes:
        grouped.setdefault(note.line_info, []).append(note)

    result: list[str] = []
    for line_info, group in grouped.items():
        fractions: list[tuple[BezierExpandedNote, int, int]] = []
        for note in group:
            relative_position = note.absolute_pos % MUSIC_BAR_DIVISION_COUNT
            if relative_position == 0:
                numerator, denominator = 0, 1
            else:
                divisor = gcd(relative_position, MUSIC_BAR_DIVISION_COUNT)
                numerator = relative_position // divisor
                denominator = MUSIC_BAR_DIVISION_COUNT // divisor
            fractions.append((note, numerator, denominator))
        max_denominator = max(denominator for _, _, denominator in fractions)
        values: list[str] = []
        for slot_index in range(max_denominator):
            matching = next(
                (
                    item
                    for item in fractions
                    if (MUSIC_BAR_DIVISION_COUNT // max_denominator) * slot_index
                    == (MUSIC_BAR_DIVISION_COUNT // item[2]) * item[1]
                ),
                None,
            )
            if matching is None:
                values.append("00")
                continue
            wav_name = matching[0].note_wav_name
            if wav_name not in wav_keys:
                raise ValueError(f"missing WAV key for {wav_name}")
            values.append(wav_keys[wav_name])
        result.append(line_info + "".join(values))
    return tuple(result)


def parse_bezier_music_score_notes(
    lines: tuple[str, ...], header: MusicScoreHeaderState
) -> tuple[BezierMusicScoreNote, ...]:
    notes: list[BezierMusicScoreNote] = []
    for line in lines:
        if (
            len(line) < 6
            or not line.startswith("#")
            or _try_parse_int32(line[1:6]) is None
        ):
            continue
        if len(line) < 7:
            continue
        line_info = line[:7]
        bar_number = _try_parse_int32(line_info[1:4])
        if bar_number is None or bar_number < 0:
            raise ValueError(f"invalid music-score bar number in {line_info}")
        lane_id_str = line_info[4:6]
        lane_key_code = _try_parse_int32(lane_id_str)
        if lane_key_code is None:
            raise ValueError(f"invalid music-score lane id {lane_id_str}")
        lane_id = MUSIC_SCORE_LANE_NUMBER_BY_KEY_CODE.get(lane_key_code, -1)
        note_data = line[7:]
        denominator = len(note_data) // 2
        if denominator == 0:
            continue
        for numerator in range(denominator):
            note_id = note_data[numerator * 2 : numerator * 2 + 2]
            if note_id == "00":
                continue
            absolute_pos = (
                MUSIC_BAR_DIVISION_COUNT * numerator // denominator
                + MUSIC_BAR_DIVISION_COUNT * bar_number
            )
            divisor = gcd(
                absolute_pos - MUSIC_BAR_DIVISION_COUNT * bar_number,
                MUSIC_BAR_DIVISION_COUNT,
            )
            reduced_numerator = (
                absolute_pos - MUSIC_BAR_DIVISION_COUNT * bar_number
            ) // divisor
            reduced_denominator = MUSIC_BAR_DIVISION_COUNT // divisor
            notes.append(
                BezierMusicScoreNote(
                    note_id=note_id,
                    wav_name=normalize_bezier_wav_name(
                        header.get_file_name(note_id)
                    ),
                    absolute_pos=absolute_pos,
                    bar_number=bar_number,
                    lane_id_str=lane_id_str,
                    lane_id=lane_id,
                    numerator=reduced_numerator,
                    denominator=reduced_denominator,
                )
            )
    return tuple(notes)


def _register_generated_bezier_wavs(header: MusicScoreHeaderState) -> None:
    if "slide_a_LS01.wav" in header.wav_file_names.values():
        return
    for index in range(1, 51):
        for start_key, group_name, side in BEZIER_GENERATED_WAV_RANGES:
            header.add_wav(
                _convert_base36_to_int(start_key) + index - 1,
                f"{group_name}_{side}{index:02d}.wav",
            )


def _first_control_key(
    header: MusicScoreHeaderState, control_name: str
) -> int:
    for key, wav_name in header.wav_file_names.items():
        if control_name in wav_name:
            return _convert_base36_to_int(key)
    return 0


def _compare_music_score_notes(
    left: BezierMusicScoreNote,
    right: BezierMusicScoreNote,
    front_control_key: int,
    back_control_key: int,
) -> int:
    position_difference = left.absolute_pos - right.absolute_pos
    if position_difference:
        return position_difference
    left_key = _convert_base36_to_int(left.note_id)
    right_key = _convert_base36_to_int(right.note_id)
    if left_key == back_control_key:
        return 1
    if right_key == back_control_key:
        return -1
    if left_key != front_control_key:
        return 1 if right_key == front_control_key else 0
    return -1


def _sort_force_music_score_notes(
    notes: tuple[BezierMusicScoreNote, ...],
) -> tuple[BezierMusicScoreNote, ...]:
    result = list(notes)
    force_controls = tuple(
        note
        for note in result
        if note.wav_name
        in (BEZIER_FORCE_FRONT_WAV_NAMES | BEZIER_FORCE_BACK_WAV_NAMES)
    )
    for force_control in force_controls:
        force_index = next(
            index for index, note in enumerate(result) if note is force_control
        )
        if force_control.wav_name in BEZIER_FORCE_FRONT_WAV_NAMES:
            target_index = next(
                (
                    index
                    for index, note in enumerate(result)
                    if note.absolute_pos < force_control.absolute_pos
                    and bezier_slide_group(note.wav_name) is not None
                ),
                None,
            )
            if target_index is None:
                raise ValueError(
                    f"{force_control.note_id}: force-front control has no earlier Slide"
                )
            result.pop(force_index)
            if force_index < target_index:
                target_index -= 1
            result.insert(target_index, force_control)
        else:
            target_index = next(
                (
                    index
                    for index in range(len(result) - 1, -1, -1)
                    if result[index].absolute_pos > force_control.absolute_pos
                    and bezier_slide_group(result[index].wav_name) is not None
                ),
                None,
            )
            if target_index is None:
                raise ValueError(
                    f"{force_control.note_id}: force-back control has no later Slide"
                )
            result.pop(force_index)
            if force_index < target_index:
                target_index -= 1
            result.insert(target_index + 1, force_control)
    return tuple(result)


def _sort_bezier_music_score_group(
    notes: tuple[BezierMusicScoreNote, ...],
    front_control_key: int,
    back_control_key: int,
) -> tuple[BezierMusicScoreNote, ...]:
    ordered = tuple(
        sorted(
            notes,
            key=cmp_to_key(
                lambda left, right: _compare_music_score_notes(
                    left,
                    right,
                    front_control_key,
                    back_control_key,
                )
            ),
        )
    )
    return _sort_force_music_score_notes(ordered)


def _merge_multi_range_slide_notes(
    notes: tuple[BezierMusicScoreNote, ...],
) -> tuple[BezierMusicScoreNote, ...]:
    ordered = sorted(notes, key=lambda note: (note.absolute_pos, note.lane_id))
    merged: list[BezierMusicScoreNote] = []
    for note in ordered:
        if merged:
            previous = merged[-1]
            if (
                previous.absolute_pos == note.absolute_pos
                and previous.lane_id + previous.multi_range_width == note.lane_id
            ):
                merged[-1] = replace(
                    previous,
                    multi_range_width=previous.multi_range_width + 1,
                )
                continue
        merged.append(note)
    return tuple(merged)


def _partition_bezier_music_score_notes(
    notes: tuple[BezierMusicScoreNote, ...],
    header: MusicScoreHeaderState,
) -> tuple[
    tuple[BezierMusicScoreNote, ...],
    tuple[BezierMusicScoreNote, ...],
    tuple[BezierMusicScoreNote, ...],
]:
    default_notes: list[BezierMusicScoreNote] = []
    group_a: list[BezierMusicScoreNote] = []
    group_b: list[BezierMusicScoreNote] = []
    if header.is_multi_range:
        slide_a: list[BezierMusicScoreNote] = []
        slide_b: list[BezierMusicScoreNote] = []
        control_a: list[BezierMusicScoreNote] = []
        control_b: list[BezierMusicScoreNote] = []
        for note in notes:
            if bezier_slide_group(note.wav_name) is True:
                slide_a.append(note)
            elif note.wav_name in BEZIER_CONTROL_A_WAV_NAMES:
                control_a.append(note)
            elif bezier_slide_group(note.wav_name) is False:
                slide_b.append(note)
            elif note.wav_name in BEZIER_CONTROL_B_WAV_NAMES:
                control_b.append(note)
            else:
                default_notes.append(note)
        group_a.extend(_merge_multi_range_slide_notes(tuple(slide_a)))
        group_a.extend(control_a)
        group_b.extend(_merge_multi_range_slide_notes(tuple(slide_b)))
        group_b.extend(control_b)
    else:
        for note in notes:
            if (
                bezier_slide_group(note.wav_name) is True
                or note.wav_name in BEZIER_CONTROL_A_WAV_NAMES
            ):
                group_a.append(note)
            elif (
                bezier_slide_group(note.wav_name) is False
                or note.wav_name in BEZIER_CONTROL_B_WAV_NAMES
            ):
                group_b.append(note)
            else:
                default_notes.append(note)
    sorted_a = _sort_bezier_music_score_group(
        tuple(group_a),
        _first_control_key(header, "cont_bezier_front_a"),
        _first_control_key(header, "cont_bezier_back_a"),
    )
    sorted_b = _sort_bezier_music_score_group(
        tuple(group_b),
        _first_control_key(header, "cont_bezier_front_b"),
        _first_control_key(header, "cont_bezier_back_b"),
    )
    return tuple(default_notes), sorted_a, sorted_b


def _find_wav_key(header: MusicScoreHeaderState, wav_name: str) -> str | None:
    for key, candidate in header.wav_file_names.items():
        if candidate == wav_name:
            return key
    for key, candidate in header.additive_wav_file_names.items():
        if candidate == wav_name:
            return key
    return None


def _serialize_bezier_music_score_group(
    source_notes: tuple[BezierMusicScoreNote, ...],
    generated_notes: tuple[BezierExpandedNote, ...],
    header: MusicScoreHeaderState,
) -> tuple[str, ...]:
    grouped: dict[str, list[tuple[int, int, str]]] = {}
    for note in source_notes:
        grouped.setdefault(note.line_info, []).append(
            (note.numerator, note.denominator, note.note_id)
        )
    for note in generated_notes:
        relative_position = note.absolute_pos % MUSIC_BAR_DIVISION_COUNT
        divisor = gcd(relative_position, MUSIC_BAR_DIVISION_COUNT)
        numerator = relative_position // divisor
        denominator = MUSIC_BAR_DIVISION_COUNT // divisor
        wav_key = _find_wav_key(header, note.note_wav_name)
        if wav_key is None:
            raise ValueError(f"missing WAV key for {note.note_wav_name}")
        entries = grouped.setdefault(note.line_info, [])
        if any(
            (MUSIC_BAR_DIVISION_COUNT // existing_denominator)
            * existing_numerator
            == (MUSIC_BAR_DIVISION_COUNT // denominator) * numerator
            for existing_numerator, existing_denominator, _ in entries
        ):
            continue
        entries.append((numerator, denominator, wav_key))
    result: list[str] = []
    for line_info, entries in grouped.items():
        max_denominator = max(denominator for _, denominator, _ in entries)
        values: list[str] = []
        for slot_index in range(max_denominator):
            matching = next(
                (
                    entry
                    for entry in entries
                    if (MUSIC_BAR_DIVISION_COUNT // max_denominator) * slot_index
                    == (MUSIC_BAR_DIVISION_COUNT // entry[1]) * entry[0]
                ),
                None,
            )
            values.append("00" if matching is None else matching[2])
        result.append(line_info + "".join(values))
    return tuple(result)


def convert_bezier_music_score_text(
    lines: tuple[str, ...],
) -> tuple[str, ...] | None:
    header = MusicScoreHeaderState()
    header.parse(lines)
    if not header.has_control_key():
        return None
    _register_generated_bezier_wavs(header)
    notes = parse_bezier_music_score_notes(lines, header)
    default_notes, group_a, group_b = _partition_bezier_music_score_notes(
        notes, header
    )
    generated_a = convert_bezier_chart_notes(
        tuple(note.chart_note() for note in group_a),
        is_multi_range=header.is_multi_range,
    )
    generated_b = convert_bezier_chart_notes(
        tuple(note.chart_note() for note in group_b),
        is_multi_range=header.is_multi_range,
    )
    converted_lines = (
        _serialize_bezier_music_score_group(default_notes, (), header)
        + _serialize_bezier_music_score_group(group_a, generated_a, header)
        + _serialize_bezier_music_score_group(group_b, generated_b, header)
    )
    return header.reparse(lines) + converted_lines


@dataclass(frozen=True)
class BMSNoteMaterialRecord:
    bar_index: int
    numerator: int
    denominator: int
    button_type: int
    fire_note_type: int
    game_note_type: int
    game_note_additional_type: int
    sound_value: str
    cc_num: int
    is_invisible: bool
    play_music_list: tuple[str, ...] = ()
    sound_value_list: tuple[str, ...] = ()
    bpm: float = 0.0
    bpm_string: str = ""
    virtual_lane_direction: int = 0
    virtual_lane_distance: int = 0
    source_order: int = -1

    @property
    def absolute_pos(self) -> int:
        return (
            MUSIC_BAR_DIVISION_COUNT * self.numerator // self.denominator
            + MUSIC_BAR_DIVISION_COUNT * self.bar_index
        )


@dataclass(frozen=True)
class BMSNoteMaterialParseResult:
    lines: tuple[str, ...]
    materials: tuple[BMSNoteMaterialRecord, ...]
    bpm_changes: tuple[BMSNoteMaterialRecord, ...]
    wav_file_names: dict[str, str]
    bar_magnifications: dict[int, float]
    is_multi_range: bool
    start_bpm: float | None = None
    start_bpm_string: str = ""


_BMS_MULTI_RANGE_BUTTON_TYPES = (
    0,
    1,
    2,
    3,
    4,
    0,
    -1,
    5,
    6,
    -1,
    8,
    9,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    0,
    1,
    2,
    3,
    4,
    0,
    -1,
    5,
    6,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    0,
    1,
    2,
    3,
    4,
    0,
    -1,
    5,
    6,
    -1,
    8,
    9,
)


_BMS_NORMAL_BUTTON_TYPES = (
    1,
    2,
    3,
    4,
    5,
    0,
    -1,
    6,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1,
    2,
    3,
    4,
    5,
    0,
    -1,
    6,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1,
    2,
    3,
    4,
    5,
    0,
    -1,
    6,
)


def _bms_button_type(cc_num: int, is_multi_range: bool) -> int:
    index = cc_num - 11
    button_types = (
        _BMS_MULTI_RANGE_BUTTON_TYPES
        if is_multi_range
        else _BMS_NORMAL_BUTTON_TYPES
    )
    return button_types[index] if 0 <= index < len(button_types) else -1


def _multi_range_lane_from_cc(cc_num: int) -> int | None:
    return {
        11: 1,
        12: 2,
        13: 3,
        14: 4,
        15: 5,
        16: 0,
        18: 6,
    }.get(cc_num % 20)


def _bms_sound_value(wav_name: str) -> str:
    return wav_name.removesuffix(".wav")


def _bms_fire_note_type(sound_value: str, front_note_type: int) -> int:
    if sound_value in ("flick", "fever_note_flick"):
        return -1 if front_note_type == 1 else 2
    if "directional_fl_l" in sound_value or "directional_fl_r" in sound_value:
        return 5
    if "slide_a" in sound_value:
        return 3
    if any(
        value in sound_value
        for value in (
            "slide_end_a",
            "slide_end_flick_a",
        )
    ) or sound_value in (
        "long_end_dir_flick_l",
        "long_end_dir_flick_r",
        "slide_end_dir_flick_l_a",
        "slide_end_dir_flick_r_a",
    ):
        return -1
    if "slide_b" in sound_value:
        return 4
    if any(
        value in sound_value
        for value in (
            "slide_end_b",
            "slide_end_flick_b",
        )
    ) or sound_value in (
        "slide_end_dir_flick_l_b",
        "slide_end_dir_flick_r_b",
    ):
        return -1
    if sound_value == "add_long_dir_flick":
        return 7
    if sound_value == "add_slide_dir_flick":
        return 8
    return front_note_type


def _bms_game_note_type(sound_value: str, front_note_type: int) -> int:
    if sound_value in ("flick", "fever_note_flick"):
        return 3 if front_note_type == 1 else 2
    if sound_value == "slide_end_dir_flick_l_a":
        return 14
    if sound_value == "slide_end_dir_flick_r_a":
        return 15
    if sound_value == "slide_end_dir_flick_l_b":
        return 16
    if sound_value == "slide_end_dir_flick_r_b":
        return 17
    if "slide_end_flick_a" in sound_value:
        return 8
    if "slide_end_flick_b" in sound_value:
        return 9
    if "slide_end_a" in sound_value:
        return 6
    if "slide_end_b" in sound_value:
        return 7
    if "slide_a" in sound_value:
        return 4
    if "slide_b" in sound_value:
        return 5
    if "directional_fl_l" in sound_value:
        return 10
    if "directional_fl_r" in sound_value:
        return 11
    if sound_value == "long_end_dir_flick_l":
        return 12
    if sound_value == "long_end_dir_flick_r":
        return 13
    if sound_value == "add_long_dir_flick":
        return 24
    if sound_value == "add_slide_dir_flick":
        return 25
    return 1 if front_note_type == 1 else 0 if front_note_type == 0 else -1


def _bms_game_note_additional_type(sound_value: str) -> int:
    if "fever" in sound_value:
        return 1
    if "skill" in sound_value:
        return 2
    if "lane_change" in sound_value:
        return 4
    return 0


def _bms_virtual_lane(sound_value: str, game_note_type: int) -> tuple[int, int]:
    if game_note_type not in (4, 5):
        return 0, 0
    if "LS" in sound_value:
        direction = 1
    elif "RS" in sound_value:
        direction = 2
    else:
        return 0, 0
    suffix = sound_value[10:]
    try:
        return direction, int(suffix)
    except ValueError:
        return direction, 0


def parse_bms_note_materials(
    source_lines: tuple[str, ...],
    *,
    convert_bezier: bool = True,
) -> BMSNoteMaterialParseResult:
    lines = source_lines
    if convert_bezier:
        converted = convert_bezier_music_score_text(source_lines)
        if converted is not None:
            lines = converted

    wav_file_names: dict[str, str] = {
        line[4:6]: line[7:].strip()
        for line in lines
        if len(line) >= 8 and line.startswith("#WAV")
    }
    specific_bpms: dict[str, tuple[float, str]] = {}
    start_bpm: float | None = None
    start_bpm_string = ""
    for line in lines:
        if line.startswith("#BPM "):
            bpm_string = line[5:].strip()
            try:
                start_bpm = float(bpm_string)
                start_bpm_string = bpm_string
            except ValueError:
                pass
            continue
        if len(line) < 8 or not line.startswith("#BPM"):
            continue
        bpm_key = line[4:6]
        if len(bpm_key) != 2 or not bpm_key.isalnum():
            continue
        bpm_string = line[7:].strip()
        try:
            specific_bpms[bpm_key] = (float(bpm_string), bpm_string)
        except ValueError:
            continue
    bar_magnifications: dict[int, float] = {}
    materials_by_button_and_position: dict[
        tuple[int, ...], BMSNoteMaterialRecord
    ] = {}
    bpm_materials: list[BMSNoteMaterialRecord] = []
    is_multi_range = any("#HABAHIRO" in line for line in lines)
    source_order = 0
    for line in lines:
        if len(line) >= 8 and line.startswith("#WAV"):
            continue
        if (
            len(line) < 7
            or not line.startswith("#")
            or not line[1:4].isdigit()
            or not line[4:6].isdigit()
            or line[6] != ":"
        ):
            continue
        bar_index = int(line[1:4])
        cc_num = int(line[4:6])
        value = line[7:]
        if cc_num == 2:
            try:
                bar_magnifications[bar_index] = float(value)
            except ValueError:
                pass
            continue
        if cc_num in (3, 8):
            denominator = len(value) // 2
            if denominator == 0:
                continue
            for numerator in range(denominator):
                note_id = value[numerator * 2 : numerator * 2 + 2]
                if note_id == "00":
                    continue
                if cc_num == 3:
                    try:
                        bpm = float(int(note_id, 16))
                    except ValueError:
                        continue
                    bpm_string = str(int(bpm))
                else:
                    specific_bpm = specific_bpms.get(note_id)
                    if specific_bpm is None:
                        continue
                    bpm, bpm_string = specific_bpm
                bpm_materials.append(
                    BMSNoteMaterialRecord(
                        bar_index=bar_index,
                        numerator=numerator,
                        denominator=denominator,
                        button_type=-1,
                        fire_note_type=-1,
                        game_note_type=3,
                        game_note_additional_type=0,
                        sound_value="",
                        cc_num=cc_num,
                        is_invisible=False,
                        bpm=bpm,
                        bpm_string=bpm_string,
                        source_order=source_order,
                    )
                )
                source_order += 1
            continue
        if cc_num in (4, 5, 6, 7, 9):
            continue
        button_type = _bms_button_type(cc_num, is_multi_range)
        front_note_type = -1 if cc_num == 1 else 1 if 50 <= cc_num < 62 else 0
        denominator = len(value) // 2
        if denominator == 0:
            continue
        for numerator in range(denominator):
            note_id = value[numerator * 2 : numerator * 2 + 2]
            if note_id == "00":
                continue
            sound_value = _bms_sound_value(wav_file_names.get(note_id, ""))
            game_note_type = _bms_game_note_type(sound_value, front_note_type)
            virtual_direction, virtual_distance = _bms_virtual_lane(
                sound_value, game_note_type
            )
            material = BMSNoteMaterialRecord(
                bar_index=bar_index,
                numerator=numerator,
                denominator=denominator,
                button_type=button_type,
                fire_note_type=_bms_fire_note_type(
                    sound_value, front_note_type
                ),
                game_note_type=game_note_type,
                game_note_additional_type=_bms_game_note_additional_type(
                    sound_value
                ),
                sound_value=sound_value,
                cc_num=cc_num,
                is_invisible=31 <= cc_num < 37 or (cc_num & ~1) == 38,
                play_music_list=(note_id,),
                sound_value_list=(sound_value,),
                virtual_lane_direction=virtual_direction,
                virtual_lane_distance=virtual_distance,
                source_order=source_order,
            )
            source_order += 1
            key = (
                (button_type, material.absolute_pos, cc_num)
                if is_multi_range and _multi_range_lane_from_cc(cc_num) is not None
                else (button_type, material.absolute_pos)
            )
            existing = materials_by_button_and_position.get(key)
            if existing is None:
                materials_by_button_and_position[key] = material
            elif cc_num == 1:
                materials_by_button_and_position[key] = replace(
                    existing,
                    play_music_list=existing.play_music_list + (note_id,),
                    sound_value_list=existing.sound_value_list + (sound_value,),
                )

    materials = tuple(
        sorted(
            materials_by_button_and_position.values(),
            key=lambda material: (
                material.absolute_pos,
                material.button_type,
                material.cc_num,
            ),
        )
    )
    return BMSNoteMaterialParseResult(
        lines=lines,
        materials=materials,
        bpm_changes=tuple(
            sorted(
                bpm_materials,
                key=lambda material: (
                    material.absolute_pos,
                    material.source_order,
                ),
            )
        ),
        wav_file_names=wav_file_names,
        bar_magnifications=bar_magnifications,
        is_multi_range=is_multi_range,
        start_bpm=start_bpm,
        start_bpm_string=start_bpm_string,
    )


def create_note_filename_map(
    base: str, need_button: bool, max_variant: int
) -> dict[str, str]:
    if need_button:
        result: dict[str, str] = {}
        for width in range(1, 8):
            for start in range(0, 8 - width):
                buttons = tuple(range(start, start + width))
                key = "_".join(str(button) for button in buttons)
                result[key] = f"{base}_{key}"
        return result
    if max_variant:
        return {
            str(width): base if width == 1 else f"{base}_{min(width, max_variant)}"
            for width in range(1, 8)
        }
    return {"-1": base}


@dataclass(frozen=True)
class SlideTailSideNodeSpec:
    node_id: str
    button_index: int
    game_note_type: int
    source_order: int | None = None


@dataclass(frozen=True)
class NoteInformationRecord:
    note_id: str
    button_type: int
    game_note_type: int
    absolute_pos: int
    button_types: tuple[int, ...] = ()
    fire_note_type: int = -1
    after_note_type: int = -1
    after_note_absolute_pos: int = -1
    short_rhythm_under_8beat: bool = False
    after_note_short_rhythm_under_8beat: bool = False
    is_invisible: bool = False
    is_slide_note_head: bool = False
    is_multi_range_combine: bool = False
    virtual_lane_direction: int = 0
    virtual_lane_distance: int = 0
    game_note_additional_type: int = 0
    game_note_additional_type_long_end: int = 0
    skill_note_index: int = 0
    skill_after_note_index: int = 0
    slide_note_list: tuple["NoteInformationRecord", ...] = ()
    source_order: int | None = None
    sound_effect_type: int | None = None
    sound_value: str = ""
    sound_value_list: tuple[str, ...] = ()
    cc_num: int = 0
    cc_nums: tuple[int, ...] = ()
    after_note_button_types: tuple[int, ...] = ()
    after_note_cc_nums: tuple[int, ...] = ()
    bar_index: int = 0
    numerator: int = 0
    denominator: int = 1
    bpm: float = 0.0
    bpm_string: str = ""


@dataclass(frozen=True)
class NoteBatchInformationRecord:
    bar_index: int
    numerator: int
    denominator: int
    absolute_pos: int
    information_list: tuple[NoteInformationRecord, ...]


@dataclass(frozen=True)
class SyncEndpointSpec:
    note_id: str
    endpoint: str
    node_id: str | None = None


@dataclass(frozen=True)
class SyncConnectionSpec:
    owner: SyncEndpointSpec
    target: SyncEndpointSpec
    edge_margin: float = 0.0


_LONG_NOTE_TYPES = frozenset((1, 3, 12, 13))
_SLIDE_A_NOTE_TYPES = frozenset((4, 6, 8, 14, 15))
_SLIDE_B_NOTE_TYPES = frozenset((5, 7, 9, 16, 17))
_SLIDE_TERMINAL_AFTER_TYPES = {
    6: -1,
    7: -1,
    8: 8,
    9: 8,
    14: 9,
    16: 9,
    15: 10,
    17: 10,
}


def _note_information_from_material(
    material: BMSNoteMaterialRecord,
    source_order: int,
    skill_note_index: int,
    is_multi_range: bool,
) -> NoteInformationRecord:
    return NoteInformationRecord(
        note_id=(
            f"bms-{material.bar_index}-{material.numerator}-"
            f"{material.denominator}-{material.button_type}-{source_order}"
        ),
        button_type=material.button_type,
        button_types=(material.button_type,),
        game_note_type=material.game_note_type,
        fire_note_type=material.fire_note_type,
        absolute_pos=material.absolute_pos,
        short_rhythm_under_8beat=(
            8 * material.numerator % material.denominator > 0
        ),
        is_invisible=material.is_invisible,
        virtual_lane_direction=material.virtual_lane_direction,
        virtual_lane_distance=material.virtual_lane_distance,
        game_note_additional_type=material.game_note_additional_type,
        skill_note_index=skill_note_index,
        source_order=source_order,
        sound_value=material.sound_value,
        sound_value_list=material.sound_value_list,
        cc_num=material.cc_num,
        cc_nums=(
            (material.cc_num,)
            if is_multi_range
            and _multi_range_lane_from_cc(material.cc_num) is not None
            else ()
        ),
        bar_index=material.bar_index,
        numerator=material.numerator,
        denominator=material.denominator,
        bpm=material.bpm,
        bpm_string=material.bpm_string,
    )


def _pair_long_note_records(
    records: list[NoteInformationRecord],
) -> list[NoteInformationRecord]:
    updates: dict[str, NoteInformationRecord] = {}
    by_button: dict[tuple[int, int], list[NoteInformationRecord]] = {}
    for record in records:
        if record.game_note_type in _LONG_NOTE_TYPES:
            by_button.setdefault((record.button_type, record.cc_num), []).append(record)
    for button_records in by_button.values():
        for index in range(0, len(button_records) - 1, 2):
            head = button_records[index]
            terminal = button_records[index + 1]
            after_note_type = {3: 1, 12: 2, 13: 3}.get(
                terminal.game_note_type,
                0,
            )
            updates[head.note_id] = replace(
                updates.get(head.note_id, head),
                after_note_type=after_note_type,
                after_note_absolute_pos=terminal.absolute_pos,
                after_note_button_types=(
                    terminal.button_types or (terminal.button_type,)
                ),
                after_note_cc_nums=terminal.cc_nums,
                after_note_short_rhythm_under_8beat=(
                    terminal.short_rhythm_under_8beat
                ),
                game_note_additional_type_long_end=(
                    terminal.game_note_additional_type
                ),
                skill_after_note_index=(
                    terminal.skill_note_index
                    if terminal.game_note_additional_type == 2
                    else 0
                ),
            )
            updates[terminal.note_id] = replace(
                terminal,
                button_type=-1,
                button_types=(-1,),
            )
    return [updates.get(record.note_id, record) for record in records]


def _setup_slide_family(
    records: list[NoteInformationRecord],
    family_types: frozenset[int],
    *,
    is_multi_range: bool = False,
) -> list[NoteInformationRecord]:
    updates: dict[str, NoteInformationRecord] = {}
    active: list[NoteInformationRecord] = []
    family_records = [
        record for record in records if record.game_note_type in family_types
    ]
    for family_index, original in enumerate(family_records):
        record = updates.get(original.note_id, original)
        if not active:
            if record.game_note_type not in (4, 5):
                continue
            active = [record]
            continue

        matching_index = next(
            (
                index
                for index, node in enumerate(active)
                if is_multi_range and node.absolute_pos == record.absolute_pos
            ),
            None,
        )
        if matching_index is not None:
            matching = active[matching_index]
            matching_buttons = tuple(
                sorted(
                    set(matching.button_types or (matching.button_type,))
                    | set(record.button_types or (record.button_type,))
                )
            )
            matching = replace(
                matching,
                button_types=matching_buttons,
                cc_nums=tuple(sorted(set(matching.cc_nums) | set(record.cc_nums))),
                skill_note_index=(
                    record.skill_note_index
                    if record.skill_note_index != 0
                    else matching.skill_note_index
                ),
            )
            active[matching_index] = matching
            updates[matching.note_id] = matching
            updates[record.note_id] = replace(
                record,
                is_multi_range_combine=True,
            )
        else:
            previous = active[-1]
            previous = replace(
                updates.get(previous.note_id, previous),
                game_note_additional_type_long_end=(
                    record.game_note_additional_type
                ),
                after_note_short_rhythm_under_8beat=(
                    record.short_rhythm_under_8beat
                ),
            )
            active[-1] = previous
            updates[previous.note_id] = previous
            active.append(record)
        if record.game_note_type not in _SLIDE_TERMINAL_AFTER_TYPES:
            continue
        head = updates.get(active[0].note_id, active[0])
        nodes = tuple(updates.get(node.note_id, node) for node in active[1:])
        updates[head.note_id] = replace(
            head,
            is_slide_note_head=True,
            after_note_type=_SLIDE_TERMINAL_AFTER_TYPES[record.game_note_type],
            slide_note_list=nodes,
        )
        next_game_note_type = (
            family_records[family_index + 1].game_note_type
            if family_index + 1 < len(family_records)
            else None
        )
        if next_game_note_type != record.game_note_type:
            active = []
    return [updates.get(record.note_id, record) for record in records]


def _combine_multi_range_run(
    records: list[NoteInformationRecord], start_index: int, end_index: int
) -> None:
    if start_index > end_index:
        return
    first = records[start_index]
    last = records[end_index]
    center_button = (first.button_type + last.button_type) // 2
    representative_index = next(
        (
            index
            for index, record in enumerate(records)
            if record.button_type == center_button
        ),
        None,
    )
    if representative_index is None:
        return
    representative = records[representative_index]
    buttons = set(representative.button_types or (representative.button_type,))
    cc_nums = set(representative.cc_nums)
    after_note_buttons = set(representative.after_note_button_types)
    after_note_cc_nums = set(representative.after_note_cc_nums)
    sound_values = list(representative.sound_value_list)
    for index in range(start_index, end_index + 1):
        source = records[index]
        if source.button_type == center_button:
            continue
        buttons.update(source.button_types or (source.button_type,))
        cc_nums.update(source.cc_nums)
        after_note_buttons.update(source.after_note_button_types)
        after_note_cc_nums.update(source.after_note_cc_nums)
        if source.virtual_lane_direction != 0:
            representative = replace(
                representative,
                virtual_lane_direction=source.virtual_lane_direction,
            )
        if source.virtual_lane_distance != 0:
            representative = replace(
                representative,
                virtual_lane_distance=source.virtual_lane_distance,
            )
        if source.skill_note_index != 0:
            representative = replace(
                representative,
                skill_note_index=source.skill_note_index,
            )
        if source.skill_after_note_index != 0:
            representative = replace(
                representative,
                skill_after_note_index=source.skill_after_note_index,
            )
        sound_values.extend(source.sound_value_list)
        records[index] = replace(source, is_multi_range_combine=True)
    records[representative_index] = replace(
        representative,
        button_types=tuple(sorted(buttons)),
        cc_nums=tuple(sorted(cc_nums)),
        after_note_button_types=tuple(sorted(after_note_buttons)),
        after_note_cc_nums=tuple(sorted(after_note_cc_nums)),
        sound_value_list=tuple(sound_values),
    )


def _combine_multi_range_batch(
    batch: NoteBatchInformationRecord,
) -> NoteBatchInformationRecord:
    records = list(batch.information_list)
    previous: NoteInformationRecord | None = None
    run_start = 0
    previous_index = -1
    run_type = -1
    for index, current in enumerate(records):
        excluded_type = 4 <= current.game_note_type < 26
        if excluded_type:
            if run_type != -1:
                _combine_multi_range_run(records, run_start, previous_index)
            previous = None
            run_start = 0
            run_type = -1
            previous_index = index
            continue
        if current.game_note_type == 1 and current.button_type == -1:
            previous_index = index
            continue
        continues = (
            previous is not None
            and current.game_note_type == run_type
            and current.button_type == previous.button_type + 1
        )
        if not continues:
            if run_type != -1:
                _combine_multi_range_run(records, run_start, previous_index)
            run_start = index
            run_type = current.game_note_type
        previous = current
        if index == len(records) - 1:
            _combine_multi_range_run(records, run_start, index)
        previous_index = index
    return replace(batch, information_list=tuple(records))


def _is_directional_flick_record(record: NoteInformationRecord) -> bool:
    return (
        5 <= record.fire_note_type <= 9
        or record.after_note_type in (2, 3, 4, 5, 9, 10, 11, 12)
        or record.game_note_type in (24, 25)
    )


def _directional_endpoint_position(record: NoteInformationRecord) -> int:
    if record.slide_note_list:
        return record.slide_note_list[-1].absolute_pos
    return record.after_note_absolute_pos


def _directional_endpoint_button(record: NoteInformationRecord) -> int:
    if record.fire_note_type in (3, 4) and record.slide_note_list:
        return record.slide_note_list[-1].button_type
    return record.button_type


def _is_adjacent_directional_record(
    source: NoteInformationRecord,
    target: NoteInformationRecord,
    family_fire_note_type: int,
    direction: str,
) -> bool:
    difference = _directional_endpoint_button(source) - _directional_endpoint_button(
        target
    )
    if source.fire_note_type == family_fire_note_type:
        return (
            1 <= difference <= 2
            if direction == "left"
            else -2 <= difference <= -1
        )
    if target.fire_note_type == family_fire_note_type:
        return (
            -2 <= difference <= -1
            if direction == "left"
            else 1 <= difference <= 2
        )
    return abs(difference) == 1


def _directional_group_kind(record: NoteInformationRecord) -> tuple[str, int] | None:
    if record.game_note_type in (18, 24) or record.after_note_type in (2, 4):
        return "left", 1
    if record.game_note_type in (19, 24) or record.after_note_type in (3, 5):
        return "right", 1
    if record.game_note_type in (20, 25) or (
        record.after_note_type in (9, 11) and record.fire_note_type == 3
    ):
        return "left", 3
    if record.game_note_type in (21, 25) or (
        record.after_note_type in (10, 12) and record.fire_note_type == 3
    ):
        return "right", 3
    if record.game_note_type in (22, 25) or (
        record.after_note_type in (9, 11) and record.fire_note_type == 4
    ):
        return "left", 4
    if record.game_note_type in (23, 25) or (
        record.after_note_type in (10, 12) and record.fire_note_type == 4
    ):
        return "right", 4
    return None


def _matches_directional_group_kind(
    record: NoteInformationRecord, direction: str, family_fire_note_type: int
) -> bool:
    if family_fire_note_type == 1:
        if record.game_note_type == 24:
            return True
        return (
            record.game_note_type == (18 if direction == "left" else 19)
            or record.after_note_type
            in ((2, 4) if direction == "left" else (3, 5))
        )
    if record.game_note_type == 25:
        return True
    game_note_type = {
        ("left", 3): 20,
        ("right", 3): 21,
        ("left", 4): 22,
        ("right", 4): 23,
    }[(direction, family_fire_note_type)]
    after_note_types = (9, 11) if direction == "left" else (10, 12)
    return record.game_note_type == game_note_type or (
        record.after_note_type in after_note_types
        and record.fire_note_type == family_fire_note_type
    )


def _is_same_direction_group(
    source: NoteInformationRecord, target: NoteInformationRecord
) -> bool:
    source_kind = _directional_group_kind(source)
    if source_kind is None:
        return False
    direction, family_fire_note_type = source_kind
    if not _matches_directional_group_kind(
        target, direction, family_fire_note_type
    ):
        return False
    return _is_adjacent_directional_record(
        source,
        target,
        family_fire_note_type,
        direction,
    )


def _multiple_directional_types(
    source: NoteInformationRecord,
) -> tuple[int, int, int, bool] | None:
    if source.after_note_type in (2, 4):
        return 4, 18, 4, True
    if source.after_note_type in (3, 5):
        return 5, 19, 5, True
    if source.after_note_type in (9, 11):
        if source.fire_note_type == 3:
            return 11, 20, 8, True
        if source.fire_note_type == 4:
            return 11, 22, 9, True
        return 11, -1, -1, False
    if source.after_note_type in (10, 12):
        if source.fire_note_type == 3:
            return 12, 21, 8, True
        if source.fire_note_type == 4:
            return 12, 23, 9, True
        return 12, -1, -1, False
    return None


def _setup_multiple_directional_flick_notes(
    batches: tuple[NoteBatchInformationRecord, ...],
) -> tuple[NoteBatchInformationRecord, ...]:
    updates = {
        record.note_id: record
        for batch in batches
        for record in batch.information_list
    }
    group_roots: list[str] = []
    for batch in batches:
        records = batch.information_list
        for index, original in enumerate(records):
            current = updates.get(original.note_id, original)
            if not _is_directional_flick_record(current):
                continue
            current_button = current.button_type
            for root_id in group_roots:
                source = updates[root_id]
                if _directional_endpoint_position(source) < current.absolute_pos:
                    continue
                if not _is_same_direction_group(source, current):
                    continue
                replacement_types = _multiple_directional_types(source)
                if replacement_types is None:
                    continue
                after_note_type, game_note_type, fire_note_type, replace_types = (
                    replacement_types
                )
                source_button = (
                    source.slide_note_list[-1].button_type
                    if source.is_slide_note_head and source.slide_note_list
                    else source.button_type
                )
                if current_button == source_button:
                    continue
                source = replace(source, after_note_type=after_note_type)
                current = replace(current, after_note_type=after_note_type)
                if replace_types:
                    current = replace(
                        current,
                        game_note_type=game_note_type,
                        fire_note_type=fire_note_type,
                    )
                updates[root_id] = source
                updates[current.note_id] = current

            for candidate_original in records[index + 1 :]:
                candidate = updates.get(
                    candidate_original.note_id, candidate_original
                )
                current = updates.get(current.note_id, current)
                if (
                    candidate.game_note_type == current.game_note_type
                    and candidate.fire_note_type in (5, 6)
                    and abs(candidate.button_type - current.button_type) == 1
                ):
                    current = replace(current, fire_note_type=6)
                    candidate = replace(candidate, fire_note_type=6)
                    updates[current.note_id] = current
                    updates[candidate.note_id] = candidate

            current = updates.get(current.note_id, current)
            if (
                current.game_note_type not in range(18, 24)
                and current.after_note_type != -1
            ):
                group_roots.append(current.note_id)

    return tuple(
        replace(
            batch,
            information_list=tuple(
                updates.get(record.note_id, record)
                for record in batch.information_list
            ),
        )
        for batch in batches
    )


def bms_materials_to_information_batches(
    parse_result: BMSNoteMaterialParseResult,
) -> tuple[NoteBatchInformationRecord, ...]:
    records: list[NoteInformationRecord] = []
    skill_note_index = 0
    for fallback_order, material in enumerate(parse_result.materials):
        source_order = (
            material.source_order
            if material.source_order >= 0
            else fallback_order
        )
        if material.game_note_additional_type == 2:
            skill_note_index += 1
        records.append(
            _note_information_from_material(
                material,
                source_order,
                skill_note_index if material.game_note_additional_type == 2 else 0,
                parse_result.is_multi_range,
            )
        )

    records = _pair_long_note_records(records)
    records = _setup_slide_family(
        records,
        _SLIDE_A_NOTE_TYPES,
        is_multi_range=parse_result.is_multi_range,
    )
    records = _setup_slide_family(
        records,
        _SLIDE_B_NOTE_TYPES,
        is_multi_range=parse_result.is_multi_range,
    )
    fallback_order = len(parse_result.materials)
    records.extend(
        _note_information_from_material(
            material,
            (
                material.source_order
                if material.source_order >= 0
                else fallback_order + index
            ),
            0,
            parse_result.is_multi_range,
        )
        for index, material in enumerate(parse_result.bpm_changes)
    )

    records_by_position: dict[int, list[NoteInformationRecord]] = {}
    for record in records:
        records_by_position.setdefault(record.absolute_pos, []).append(record)

    batches: list[NoteBatchInformationRecord] = []
    for absolute_pos, position_records in sorted(records_by_position.items()):
        first = position_records[0]
        batches.append(
            NoteBatchInformationRecord(
                bar_index=first.bar_index,
                numerator=first.numerator,
                denominator=first.denominator,
                absolute_pos=absolute_pos,
                information_list=tuple(position_records),
            )
        )
    if parse_result.is_multi_range:
        batches = [_combine_multi_range_batch(batch) for batch in batches]

    filtered_batches: list[NoteBatchInformationRecord] = []
    for batch in batches:
        filtered = tuple(
            record
            for record in batch.information_list
            if not (
                record.game_note_type in _LONG_NOTE_TYPES
                and record.button_type == -1
                and record.cc_num not in (3, 8)
            )
            and not (
                record.game_note_type in (
                    _SLIDE_A_NOTE_TYPES | _SLIDE_B_NOTE_TYPES
                )
                and not record.is_slide_note_head
            )
            and not record.is_multi_range_combine
            and not (
                record.game_note_type == 0
                and not record.sound_value
                and not any(record.sound_value_list)
            )
            and not (
                record.game_note_type not in _LONG_NOTE_TYPES
                and record.button_type == -1
                and not record.sound_value
                and not record.sound_value_list
                and record.cc_num not in (3, 8)
            )
        )
        if not filtered:
            continue
        filtered_batches.append(
            replace(batch, information_list=filtered)
        )
    return _setup_multiple_directional_flick_notes(tuple(filtered_batches))


@dataclass(frozen=True)
class NoteSpec:
    note_id: str
    position: float
    lane: int
    kind: str = "tap"
    end_position: float | None = None
    width: int = 1
    intermediate_positions: tuple[float, ...] = ()
    end_gesture: str = "release"
    multiple_note_count: int = 1
    sound_effect_type: int | None = None
    mesh_width_type: int | None = None
    special_mesh_width: bool = False
    mesh_width_progress: float = 0.0
    base_score: float = 1_000
    free_live_event_bonus_base_score: float = 0
    miss_damage: int = 100
    virtual_lane_direction: str = "none"
    virtual_lane_distance: int = 0
    end_virtual_lane_direction: str = "none"
    end_virtual_lane_distance: int = 0
    mesh_color: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0)
    is_curved: bool = False
    sync_target_id: str | None = None
    sync_target_endpoint: str = "front"
    end_sync_target_id: str | None = None
    end_sync_target_endpoint: str = "front"
    sync_edge_margin: float = 0.0
    sync_connections: tuple[SyncConnectionSpec, ...] = ()
    game_note_type: int | None = None
    flick_back_line_target_id: str | None = None
    after_note_type: int | None = None
    short_rhythm_under_8beat: bool = False
    intermediate_lanes: tuple[int, ...] = ()
    intermediate_widths: tuple[int, ...] = ()
    intermediate_invisible: tuple[bool, ...] = ()
    end_lane: int | None = None
    end_width: int | None = None
    end_game_note_type: int | None = None
    multiple_left_count: int = 0
    multiple_right_count: int = 0
    multiple_back_line_active: bool = False
    multiple_side_nodes: tuple[SlideTailSideNodeSpec, ...] = ()
    end_source_order: int | None = None
    directional_anchor_lane: int | None = None
    game_note_additional_type: int = 0
    end_game_note_additional_type: int = 0
    skill_note_index: int = 0
    skill_after_note_index: int = 0
    cc_nums: tuple[int, ...] = ()
    intermediate_cc_nums: tuple[tuple[int, ...], ...] = ()
    end_cc_nums: tuple[int, ...] = ()
    end_invisible: bool = False


@dataclass(frozen=True)
class LaneChangeCommandSpec:
    command_id: str
    position: float
    source_lane: int
    cc_nums: tuple[int, ...] = ()
    additional_type: int = 4


@dataclass(frozen=True)
class BpmChangeCommandSpec:
    command_id: str
    position: float
    bar_index: int
    numerator: int
    denominator: int
    bpm: float
    bpm_string: str
    cc_num: int
    source_order: int


@dataclass(frozen=True)
class GameplayChartSpec:
    notes: tuple[NoteSpec, ...]
    lane_change_commands: tuple[LaneChangeCommandSpec, ...]
    bpm_change_commands: tuple[BpmChangeCommandSpec, ...] = ()
    start_bpm: float | None = None
    start_bpm_string: str = ""
    is_multi_range: bool = False


TERMINAL_OR_ADDITIONAL_GAME_NOTE_TYPES = frozenset(range(3, 26)) - {4, 5, 10, 11}
AFTER_NOTE_END_GESTURES = {
    -1: "release",
    0: "release",
    1: "flick",
    2: "directional_left",
    3: "directional_right",
    4: "multiple_left",
    5: "multiple_right",
    6: "release",
    7: "release",
    8: "flick",
    9: "directional_left",
    10: "directional_right",
    11: "multiple_left",
    12: "multiple_right",
}
LONG_END_GAME_NOTE_TYPES = {
    0: 1,
    1: 3,
    2: 12,
    3: 13,
    4: 12,
    5: 13,
}
LONG_MULTIPLE_ADD_TYPES = {4: 18, 5: 19}
SLIDE_MULTIPLE_ADD_TYPES = {14: 20, 15: 21, 16: 22, 17: 23}
MULTIPLE_AFTER_NOTE_TYPES = frozenset((4, 5, 11, 12))
SYNC_ENDPOINT_NAMES = frozenset(
    (
        "front",
        "front_left",
        "front_right",
        "end",
        "end_left",
        "end_right",
    )
)


def _record_button_span(record: NoteInformationRecord) -> tuple[int, int]:
    buttons = record.button_types or (record.button_type,)
    if any(button < 0 or button > 6 for button in buttons):
        raise ValueError(f"{record.note_id}: button types must stay inside 0..6")
    ordered = tuple(sorted(set(buttons)))
    if len(ordered) != len(buttons):
        raise ValueError(f"{record.note_id}: button types must be unique")
    if ordered[-1] - ordered[0] + 1 != len(ordered):
        raise ValueError(f"{record.note_id}: button types must be contiguous")
    return ordered[0], len(ordered)


def _record_anchor_lane(record: NoteInformationRecord) -> int:
    if record.cc_nums:
        lane = _multi_range_lane_from_cc(record.cc_num)
        if lane is None:
            raise ValueError(f"{record.note_id}: unsupported multi-range anchor CC")
        return lane
    return record.button_type


def _record_multi_range_lane_span(
    record: NoteInformationRecord,
) -> tuple[int, int] | None:
    if not record.cc_nums:
        return None
    lanes = tuple(_multi_range_lane_from_cc(cc_num) for cc_num in record.cc_nums)
    if any(lane is None for lane in lanes):
        raise ValueError(f"{record.note_id}: unsupported multi-range CC family")
    ordered = tuple(sorted(set(lanes)))
    if len(ordered) != len(lanes):
        raise ValueError(f"{record.note_id}: multi-range lanes must be unique")
    if ordered[-1] - ordered[0] + 1 != len(ordered):
        return None
    return ordered[0], len(ordered)


def _virtual_lane_name(direction: int) -> str:
    try:
        return {0: "none", 1: "left", 2: "right"}[direction]
    except KeyError as error:
        raise ValueError(f"unsupported VirtualLaneDirection: {direction}") from error


def _matching_records(
    records: tuple[NoteInformationRecord, ...],
    absolute_pos: int,
    game_note_type: int,
) -> tuple[NoteInformationRecord, ...]:
    return tuple(
        record
        for record in records
        if record.absolute_pos == absolute_pos
        and record.game_note_type == game_note_type
    )


def _contiguous_additional_records(
    records: tuple[NoteInformationRecord, ...],
    absolute_pos: int,
    game_note_type: int,
    root_lane: int,
) -> tuple[NoteInformationRecord, ...]:
    candidates = _matching_records(records, absolute_pos, game_note_type)
    by_lane: dict[int, NoteInformationRecord] = {}
    for candidate in candidates:
        lane, width = _record_button_span(candidate)
        if width != 1:
            raise ValueError(
                f"{candidate.note_id}: directional additional node must be one lane"
            )
        lane = _record_anchor_lane(candidate)
        if lane in by_lane:
            raise ValueError(
                "directional additional nodes must be unique at each lane"
            )
        by_lane[lane] = candidate
    connected: list[NoteInformationRecord] = []
    lane = root_lane - 1
    while lane in by_lane:
        connected.append(by_lane[lane])
        lane -= 1
    lane = root_lane + 1
    while lane in by_lane:
        connected.append(by_lane[lane])
        lane += 1
    return tuple(
        sorted(
            connected,
            key=lambda candidate: _record_button_span(candidate)[0],
        )
    )


def _standalone_directional_groups(
    records: tuple[NoteInformationRecord, ...],
) -> dict[str, tuple[NoteInformationRecord, ...]]:
    groups_by_member: dict[str, tuple[NoteInformationRecord, ...]] = {}
    for game_note_type in (10, 11):
        by_lane: dict[int, NoteInformationRecord] = {}
        for record in records:
            if record.game_note_type != game_note_type:
                continue
            lane, width = _record_button_span(record)
            if width != 1:
                raise ValueError(
                    f"{record.note_id}: ungrouped directional Flick must occupy one lane"
                )
            lane = _record_anchor_lane(record)
            if lane in by_lane:
                raise ValueError(
                    "directional Flick roots must be unique at each lane"
                )
            by_lane[lane] = record
        component: list[NoteInformationRecord] = []
        previous_lane: int | None = None
        for lane, record in sorted(by_lane.items()):
            if previous_lane is not None and lane != previous_lane + 1:
                materialized = tuple(component)
                for member in materialized:
                    groups_by_member[member.note_id] = materialized
                component = []
            component.append(record)
            previous_lane = lane
        if component:
            materialized = tuple(component)
            for member in materialized:
                groups_by_member[member.note_id] = materialized
    return groups_by_member


def note_spec_from_information(
    record: NoteInformationRecord,
    related_records: tuple[NoteInformationRecord, ...] = (),
) -> NoteSpec | None:
    if record.game_note_type == -1:
        return None
    if record.game_note_type in TERMINAL_OR_ADDITIONAL_GAME_NOTE_TYPES:
        return None
    if record.game_note_type in (4, 5) and not (
        record.is_slide_note_head or record.slide_note_list
    ):
        return None
    if record.game_note_type not in (0, 1, 2, 4, 5, 10, 11):
        raise ValueError(
            f"{record.note_id}: unsupported root GameNoteType {record.game_note_type}"
        )

    lane, width = _record_button_span(record)
    virtual_lane_direction = _virtual_lane_name(record.virtual_lane_direction)
    common = {
        "note_id": record.note_id,
        "position": float(record.absolute_pos),
        "lane": lane,
        "width": width,
        "sound_effect_type": record.sound_effect_type,
        "virtual_lane_direction": virtual_lane_direction,
        "virtual_lane_distance": record.virtual_lane_distance,
        "game_note_type": record.game_note_type,
        "after_note_type": (
            record.after_note_type if record.after_note_type >= 0 else None
        ),
        "short_rhythm_under_8beat": record.short_rhythm_under_8beat,
        "game_note_additional_type": record.game_note_additional_type,
        "skill_note_index": record.skill_note_index,
        "cc_nums": record.cc_nums,
    }

    if record.game_note_type == 0:
        return NoteSpec(kind="normal", **common)
    if record.game_note_type == 2:
        return NoteSpec(kind="flick", **common)
    if record.game_note_type in (10, 11):
        direction = "left" if record.game_note_type == 10 else "right"
        additional_type = 18 if direction == "left" else 19
        directional_span = _record_multi_range_lane_span(record) or (lane, width)
        additional_records = _contiguous_additional_records(
            related_records,
            record.absolute_pos,
            additional_type,
            directional_span[0],
        )
        return NoteSpec(
            kind=f"directional_flick_{direction}",
            multiple_note_count=1 + len(additional_records),
            directional_anchor_lane=_record_anchor_lane(record),
            **{
                **common,
                "lane": directional_span[0],
                "width": directional_span[1],
            },
        )

    try:
        end_gesture = AFTER_NOTE_END_GESTURES[record.after_note_type]
    except KeyError as error:
        raise ValueError(
            f"{record.note_id}: unsupported AfterNoteType {record.after_note_type}"
        ) from error

    if record.game_note_type == 1:
        if record.after_note_absolute_pos <= record.absolute_pos:
            raise ValueError(
                f"{record.note_id}: Long end position must follow its head"
            )
        end_game_note_type = LONG_END_GAME_NOTE_TYPES.get(record.after_note_type)
        additional_type = LONG_MULTIPLE_ADD_TYPES.get(record.after_note_type)
        additional_records = (
            _contiguous_additional_records(
                related_records,
                record.after_note_absolute_pos,
                additional_type,
                lane,
            )
            if additional_type is not None
            else ()
        )
        terminal_record = replace(
            record,
            button_type=(
                record.after_note_button_types[0]
                if record.after_note_button_types
                else record.button_type
            ),
            button_types=(
                record.after_note_button_types
                if record.after_note_button_types
                else record.button_types
            ),
            cc_nums=record.after_note_cc_nums,
        )
        end_lane, end_width = _record_button_span(terminal_record)
        return NoteSpec(
            kind="long",
            end_position=float(record.after_note_absolute_pos),
            end_gesture=end_gesture,
            end_lane=end_lane,
            end_width=end_width,
            end_cc_nums=record.after_note_cc_nums,
            end_game_note_type=end_game_note_type,
            end_game_note_additional_type=(
                record.game_note_additional_type_long_end
            ),
            skill_after_note_index=record.skill_after_note_index,
            multiple_note_count=1 + len(additional_records),
            **common,
        )

    if not record.slide_note_list:
        raise ValueError(f"{record.note_id}: Slide head has no slideNoteList")
    terminal = record.slide_note_list[-1]
    intermediate = record.slide_note_list[:-1]
    if terminal.absolute_pos <= record.absolute_pos:
        raise ValueError(f"{record.note_id}: Slide end position must follow its head")
    positions = tuple(float(node.absolute_pos) for node in intermediate)
    if any(
        next_position <= current_position
        for current_position, next_position in zip(
            (float(record.absolute_pos), *positions),
            (*positions, float(terminal.absolute_pos)),
        )
    ):
        raise ValueError(f"{record.note_id}: slideNoteList positions must increase")
    intermediate_spans = tuple(_record_button_span(node) for node in intermediate)
    end_lane, end_width = _record_button_span(terminal)
    side_records: tuple[NoteInformationRecord, ...] = ()
    expected_add_type = SLIDE_MULTIPLE_ADD_TYPES.get(terminal.game_note_type)
    if record.after_note_type in (11, 12):
        if expected_add_type is None:
            raise ValueError(
                f"{record.note_id}: multiple Slide tail has incompatible GameNoteType"
            )
        side_records = _contiguous_additional_records(
            related_records,
            terminal.absolute_pos,
            expected_add_type,
            end_lane,
        )
    side_nodes = tuple(
        SlideTailSideNodeSpec(
            node_id=side.note_id,
            button_index=_record_button_span(side)[0],
            game_note_type=side.game_note_type,
            source_order=side.source_order,
        )
        for side in side_records
    )
    multiple_left_count = sum(node.button_index < end_lane for node in side_nodes)
    multiple_right_count = len(side_nodes) - multiple_left_count
    return NoteSpec(
        kind="slide",
        end_position=float(terminal.absolute_pos),
        intermediate_positions=positions,
        intermediate_lanes=tuple(span[0] for span in intermediate_spans),
        intermediate_widths=tuple(span[1] for span in intermediate_spans),
        intermediate_invisible=tuple(node.is_invisible for node in intermediate),
        intermediate_cc_nums=tuple(node.cc_nums for node in intermediate),
        end_gesture=end_gesture,
        end_lane=end_lane,
        end_width=end_width,
        end_cc_nums=terminal.cc_nums,
        end_invisible=terminal.is_invisible,
        end_game_note_type=terminal.game_note_type,
        end_game_note_additional_type=terminal.game_note_additional_type,
        skill_after_note_index=terminal.skill_note_index,
        end_virtual_lane_direction=_virtual_lane_name(
            terminal.virtual_lane_direction
        ),
        end_virtual_lane_distance=terminal.virtual_lane_distance,
        multiple_note_count=1 + len(side_nodes),
        multiple_left_count=multiple_left_count,
        multiple_right_count=multiple_right_count,
        multiple_back_line_active=bool(side_nodes),
        multiple_side_nodes=side_nodes,
        end_source_order=terminal.source_order,
        is_curved=record.game_note_type == 5,
        **common,
    )


@dataclass(frozen=True)
class _SyncAfterCandidate:
    note_id: str
    absolute_position: float
    after_note_type: int


def _sync_endpoint_base(endpoint: SyncEndpointSpec) -> str:
    return "end" if endpoint.endpoint.startswith("end") else "front"


def _sync_endpoint_horizontal_key(
    endpoint: SyncEndpointSpec,
    note: NoteSpec,
) -> float:
    base = _sync_endpoint_base(endpoint)
    lane = note.lane
    width = note.width
    if base == "end":
        lane = note.end_lane if note.end_lane is not None else lane
        width = note.end_width if note.end_width is not None else width
    if endpoint.endpoint.endswith("_left"):
        if base == "end" and note.end_gesture == "multiple_left":
            return float(lane - (note.multiple_note_count - 1))
        return float(lane)
    if endpoint.endpoint.endswith("_right"):
        if base == "end" and note.end_gesture == "multiple_right":
            return float(lane + width - 1 + (note.multiple_note_count - 1))
        return float(lane + width - 1)
    return lane + (width - 1) / 2


def _far_sync_endpoint(
    endpoint: SyncEndpointSpec,
    note: NoteSpec,
    side: str,
) -> SyncEndpointSpec:
    base = _sync_endpoint_base(endpoint)
    if base == "front":
        if not (
            note.multiple_note_count > 1
            and note.kind in (
                "directional_flick_left",
                "directional_flick_right",
            )
        ):
            return endpoint
        return SyncEndpointSpec(note.note_id, f"front_{side}")
    if not (
        note.multiple_note_count > 1
        and note.end_gesture in ("multiple_left", "multiple_right")
    ):
        return endpoint
    node_id = None
    if note.multiple_side_nodes:
        node = (
            min(note.multiple_side_nodes, key=lambda item: item.button_index)
            if side == "left"
            else max(note.multiple_side_nodes, key=lambda item: item.button_index)
        )
        end_lane = note.end_lane if note.end_lane is not None else note.lane
        end_width = note.end_width if note.end_width is not None else note.width
        root_edge = end_lane if side == "left" else end_lane + end_width - 1
        if (
            side == "left" and node.button_index < root_edge
        ) or (
            side == "right" and node.button_index > root_edge
        ):
            node_id = node.node_id
    return SyncEndpointSpec(note.note_id, f"end_{side}", node_id)


def _expand_sync_connection_to_far_endpoints(
    connection: SyncConnectionSpec,
    specs_by_id: dict[str, NoteSpec],
) -> SyncConnectionSpec:
    owner_note = specs_by_id[connection.owner.note_id]
    target_note = specs_by_id[connection.target.note_id]
    owner_key = _sync_endpoint_horizontal_key(connection.owner, owner_note)
    target_key = _sync_endpoint_horizontal_key(connection.target, target_note)
    owner_side, target_side = (
        ("left", "right")
        if owner_key <= target_key
        else ("right", "left")
    )
    return replace(
        connection,
        owner=_far_sync_endpoint(connection.owner, owner_note, owner_side),
        target=_far_sync_endpoint(connection.target, target_note, target_side),
    )


def _apply_endpoint_sync_connections(
    projected_batches: tuple[tuple[float, tuple[NoteSpec, ...]], ...],
) -> tuple[NoteSpec, ...]:
    specs = tuple(
        spec for _, batch_specs in projected_batches for spec in batch_specs
    )
    specs_by_id = {spec.note_id: spec for spec in specs}
    candidates: list[_SyncAfterCandidate] = []
    connections_by_owner: dict[str, list[SyncConnectionSpec]] = {}

    def add_connection(connection: SyncConnectionSpec) -> None:
        expanded = _expand_sync_connection_to_far_endpoints(
            connection,
            specs_by_id,
        )
        connections_by_owner.setdefault(
            expanded.owner.note_id,
            [],
        ).append(expanded)

    for absolute_position, batch_specs in projected_batches:
        candidates = [
            candidate
            for candidate in candidates
            if candidate.absolute_position >= absolute_position
        ]
        previous_front: NoteSpec | None = None
        for spec in batch_specs:
            candidate_index = next(
                (
                    index
                    for index, candidate in enumerate(candidates)
                    if candidate.absolute_position == absolute_position
                ),
                None,
            )
            if candidate_index is not None:
                candidate = candidates.pop(candidate_index)
                add_connection(
                    SyncConnectionSpec(
                        SyncEndpointSpec(candidate.note_id, "end"),
                        SyncEndpointSpec(spec.note_id, "front"),
                        specs_by_id[candidate.note_id].sync_edge_margin,
                    )
                )
            elif previous_front is not None:
                add_connection(
                    SyncConnectionSpec(
                        SyncEndpointSpec(spec.note_id, "front"),
                        SyncEndpointSpec(previous_front.note_id, "front"),
                        spec.sync_edge_margin,
                    )
                )
            previous_front = spec
            if (
                spec.end_position is not None
                and spec.after_note_type is not None
                and spec.end_position > spec.position
            ):
                candidates.append(
                    _SyncAfterCandidate(
                        spec.note_id,
                        spec.end_position,
                        spec.after_note_type,
                    )
                )

        arriving_candidates = [
            candidate
            for candidate in candidates
            if candidate.absolute_position == absolute_position
        ]
        if len(arriving_candidates) >= 2:
            first, second = arriving_candidates[:2]
            add_connection(
                SyncConnectionSpec(
                    SyncEndpointSpec(second.note_id, "end"),
                    SyncEndpointSpec(first.note_id, "end"),
                    specs_by_id[second.note_id].sync_edge_margin,
                )
            )
            if (
                first.after_note_type not in MULTIPLE_AFTER_NOTE_TYPES
                and second.after_note_type not in MULTIPLE_AFTER_NOTE_TYPES
            ):
                candidates.remove(first)
                candidates.remove(second)

    integrated: list[NoteSpec] = []
    for spec in specs:
        connections = tuple(connections_by_owner.get(spec.note_id, ()))
        front_connection = next(
            (
                connection
                for connection in connections
                if _sync_endpoint_base(connection.owner) == "front"
            ),
            None,
        )
        end_connection = next(
            (
                connection
                for connection in connections
                if _sync_endpoint_base(connection.owner) == "end"
            ),
            None,
        )
        integrated.append(
            replace(
                spec,
                sync_target_id=(
                    front_connection.target.note_id
                    if front_connection is not None
                    else None
                ),
                sync_target_endpoint=(
                    front_connection.target.endpoint
                    if front_connection is not None
                    else "front"
                ),
                end_sync_target_id=(
                    end_connection.target.note_id
                    if end_connection is not None
                    else None
                ),
                end_sync_target_endpoint=(
                    end_connection.target.endpoint
                    if end_connection is not None
                    else "front"
                ),
                sync_connections=connections,
            )
        )
    return tuple(integrated)


def gameplay_chart_from_information_batches(
    batches: Iterable[NoteBatchInformationRecord],
) -> GameplayChartSpec:
    materialized_batches: list[
        tuple[float, tuple[NoteInformationRecord, ...]]
    ] = []
    source_order = 0
    for batch in batches:
        order_by_id: dict[str, int] = {}
        for record in batch.information_list:
            if record.note_id in order_by_id:
                raise ValueError("NoteInformation record ids must be unique per batch")
            order_by_id[record.note_id] = (
                record.source_order
                if record.source_order is not None
                else source_order
            )
            source_order += 1

        def materialize(record: NoteInformationRecord) -> NoteInformationRecord:
            return replace(
                record,
                source_order=(
                    record.source_order
                    if record.source_order is not None
                    else order_by_id.get(record.note_id)
                ),
                slide_note_list=tuple(
                    materialize(node) for node in record.slide_note_list
                ),
            )

        materialized_batches.append(
            (
                float(batch.absolute_pos),
                tuple(materialize(record) for record in batch.information_list),
            )
        )

    projected_batches: list[tuple[float, tuple[NoteSpec, ...]]] = []
    lane_change_commands: list[LaneChangeCommandSpec] = []
    bpm_change_commands: list[BpmChangeCommandSpec] = []
    bpm_change_positions: set[int] = set()
    seen_ids: set[str] = set()
    for absolute_position, records in materialized_batches:
        batch_specs: list[NoteSpec] = []
        directional_groups = _standalone_directional_groups(records)
        for record in records:
            if record.cc_num in (3, 8):
                if record.bpm <= 0:
                    raise ValueError(f"{record.note_id}: BPM must be positive")
                if record.denominator <= 0:
                    raise ValueError(
                        f"{record.note_id}: BPM denominator must be positive"
                    )
                if record.absolute_pos in bpm_change_positions:
                    continue
                bpm_change_positions.add(record.absolute_pos)
                if record.note_id in seen_ids:
                    raise ValueError("generated chart ids must be globally unique")
                seen_ids.add(record.note_id)
                bpm_change_commands.append(
                    BpmChangeCommandSpec(
                        command_id=record.note_id,
                        position=float(record.absolute_pos),
                        bar_index=record.bar_index,
                        numerator=record.numerator,
                        denominator=record.denominator,
                        bpm=record.bpm,
                        bpm_string=record.bpm_string,
                        cc_num=record.cc_num,
                        source_order=(
                            record.source_order
                            if record.source_order is not None
                            else source_order
                        ),
                    )
                )
                continue
            if record.game_note_additional_type == 4:
                if record.game_note_type != 0:
                    raise ValueError(
                        f"{record.note_id}: lane-change command must use GameNoteType 0"
                    )
                if record.note_id in seen_ids:
                    raise ValueError("generated chart ids must be globally unique")
                seen_ids.add(record.note_id)
                lane_change_commands.append(
                    LaneChangeCommandSpec(
                        command_id=record.note_id,
                        position=float(record.absolute_pos),
                        source_lane=_record_anchor_lane(record),
                        cc_nums=record.cc_nums,
                        additional_type=record.game_note_additional_type,
                    )
                )
                continue
            directional_group = directional_groups.get(record.note_id)
            if directional_group is not None:
                representative = (
                    directional_group[-1]
                    if directional_group[0].game_note_type == 10
                    else directional_group[0]
                )
                if record.note_id != representative.note_id:
                    continue
                record = replace(
                    representative,
                    button_types=tuple(
                        sorted(
                            {
                                _record_button_span(member)[0]
                                for member in directional_group
                            }
                        )
                    ),
                    cc_nums=tuple(
                        sorted(
                            {
                                cc_num
                                for member in directional_group
                                for cc_num in member.cc_nums
                            }
                        )
                    ),
                )
            spec = note_spec_from_information(record, records)
            if spec is None:
                continue
            if directional_group is not None:
                spec = replace(
                    spec,
                    multiple_note_count=max(
                        spec.multiple_note_count, len(directional_group)
                    ),
                )
            if spec.note_id in seen_ids:
                raise ValueError("generated chart ids must be globally unique")
            seen_ids.add(spec.note_id)
            batch_specs.append(spec)
        projected_batches.append((absolute_position, tuple(batch_specs)))
    return GameplayChartSpec(
        notes=_apply_endpoint_sync_connections(tuple(projected_batches)),
        lane_change_commands=tuple(lane_change_commands),
        bpm_change_commands=tuple(bpm_change_commands),
    )


def gameplay_chart_from_bms(
    parse_result: BMSNoteMaterialParseResult,
) -> GameplayChartSpec:
    chart = gameplay_chart_from_information_batches(
        bms_materials_to_information_batches(parse_result)
    )
    return replace(
        chart,
        start_bpm=parse_result.start_bpm,
        start_bpm_string=parse_result.start_bpm_string,
        is_multi_range=parse_result.is_multi_range,
    )


def tempo_map_from_chart(chart: GameplayChartSpec) -> TempoMap:
    if chart.start_bpm is None or chart.start_bpm <= 0:
        raise ValueError("BMS chart must define a positive #BPM start value")
    changes = [TempoChange(0.0, chart.start_bpm)]
    changes.extend(
        TempoChange(command.position, command.bpm)
        for command in chart.bpm_change_commands
    )
    return TempoMap(changes, units_per_bar=MUSIC_BAR_DIVISION_COUNT)


def tempo_map_from_bms(parse_result: BMSNoteMaterialParseResult) -> TempoMap:
    return tempo_map_from_chart(gameplay_chart_from_bms(parse_result))


def note_specs_from_information_batches(
    batches: Iterable[NoteBatchInformationRecord],
) -> tuple[NoteSpec, ...]:
    return gameplay_chart_from_information_batches(batches).notes


@dataclass(frozen=True)
class GameplayEvent:
    sequence: int
    kind: str
    note_id: str | None = None
    note_kind: str | None = None
    lane: int | None = None
    position: float | None = None
    result: str | None = None
    timing: str | None = None
    phase: str | None = None
    slide_miss_type: str | None = None
    slide_miss_code: int | None = None
    command_id: str | None = None
    skill_note_index: int | None = None
    point: int | None = None
    total: int | None = None
    rest_note_count: int | None = None
    bpm: float | None = None
    bpm_string: str | None = None
    skill_id: int | None = None
    game_frame: int | None = None
    duration: float | None = None
    is_encore: bool | None = None
    cue: str | None = None
    life_before: int | None = None
    life_after: int | None = None
    display_index: int | None = None
    fever_state_before: int | None = None
    fever_state_after: int | None = None
    life_heal: bool | None = None
    damage_guard: bool | None = None
    never_die: bool | None = None
    score_up: bool | None = None
    judge_adjust: bool | None = None
    psyllium: bool | None = None


@dataclass
class OneNoteMaxScoreInfo:
    score: int = 0
    combo: int = 0
    skill_factor: float = 0.0
    notes_type: str | None = None
    is_fever: bool = False


@dataclass
class ComboHudVisualState:
    normal_visible: bool = True
    normal_hide_elapsed: float = 0.0
    normal_scale_elapsed: float = 1.0
    all_perfect_enabled: bool = False
    all_perfect_status: int = 0
    all_perfect_visible: bool = False
    all_perfect_hide_elapsed: float = 0.0
    all_perfect_scale_elapsed: float = 1.0
    all_perfect_alpha_elapsed: float = 0.0


@dataclass
class AddScoreHudVisualState:
    active: bool = False
    score: int = 0
    score_up_type: int = 0
    depth: int = 0
    elapsed: float = 0.0
    local_y: float = -50.0
    alpha: float = 0.0


@dataclass
class ResultHudVisualState:
    visible: bool = False
    elapsed: float = 0.0
    judgement: str | None = None
    judge_timing: str | None = None
    score_up_type: int = 0
    rate_up_value: float = 0.0


@dataclass
class HudState:
    score: int = 0
    score_visible: bool = False
    combo: int = 0
    life: int = 1_000
    max_life: int = 1_000
    life_visual: LifeHudVisualState = field(default_factory=LifeHudVisualState)
    judgement: str | None = None
    add_score: int = 0
    free_live_event_bonus_score: int = 0
    one_note_max_score: OneNoteMaxScoreInfo = field(
        default_factory=OneNoteMaxScoreInfo
    )
    free_live_event_bonus_one_note_max_score: OneNoteMaxScoreInfo = field(
        default_factory=OneNoteMaxScoreInfo
    )
    combo_visual: ComboHudVisualState = field(default_factory=ComboHudVisualState)
    add_score_visuals: list[AddScoreHudVisualState] = field(
        default_factory=lambda: [AddScoreHudVisualState() for _ in range(4)]
    )
    result_visual: ResultHudVisualState = field(default_factory=ResultHudVisualState)


@dataclass
class MeshGeometry:
    vertices: tuple[tuple[float, float, float], ...]
    triangles: tuple[int, ...]
    uvs: tuple[tuple[float, float], ...] = ()
    colors: tuple[tuple[float, float, float, float], ...] = ()
    material_id: str | None = None
    material_binding: MaterialBinding | None = None
    shader_parameters: dict[str, float] = field(default_factory=dict)
    texture_profile: NoteMeshTextureProfile | None = None


@dataclass(frozen=True)
class SyncLineGeometry:
    target_note_ids: tuple[str, str]
    positions: tuple[tuple[float, float, float], tuple[float, float, float]]
    width: float
    enabled: bool
    serialized_game_object_active: bool = True
    serialized_transform_local_position: tuple[float, float, float] = (
        0.0,
        0.0,
        0.9900000095367432,
    )
    serialized_transform_local_scale: tuple[float, float, float] = (
        0.800000011920929,
        0.800000011920929,
        1.0,
    )
    position_count: int = 2
    use_world_space: bool = True
    loop: bool = False
    width_multiplier: float = 1.0
    serialized_width_curve: tuple[tuple[float, float], ...] = (
        (0.0, 0.2800000011920929),
        (1.0, 0.2800000011920929),
    )
    serialized_color_gradient: tuple[tuple[float, float, float, float], ...] = (
        (1.0, 1.0, 1.0, 1.0),
        (1.0, 1.0, 1.0, 1.0),
    )
    num_corner_vertices: int = 0
    num_cap_vertices: int = 0
    alignment: int = 0
    alignment_name: str = "View"
    texture_mode: int = 0
    texture_mode_name: str = "Stretch"
    texture_scale: tuple[float, float] = (1.0, 1.0)
    cast_shadows: int = 0
    receive_shadows: int = 0
    motion_vectors: int = 0
    light_probe_usage: int = 0
    reflection_probe_usage: int = 0
    rendering_layer_mask: int = 1
    generate_lighting_data: bool = False
    mask_interaction: int = 0
    apply_active_color_space: bool = False
    material_id: str = "resources:Materials/BMS/SyncNoteLine"
    material_binding: MaterialBinding = SYNC_NOTE_LINE_BINDING
    sorting_order: int = 69
    shader_parameters: dict[str, float] = field(default_factory=dict)
    shader_name: str = STAR_TRANSPARENT_COLORED_SHADER_NAME
    serialized_threshold_default: float = (
        STAR_TRANSPARENT_COLORED_DEFAULT_THRESHOLD
    )
    texture_profile: SyncLineTextureProfile | None = None


@dataclass(frozen=True)
class FlickBackLineGeometry:
    target_note_ids: tuple[str, str]
    positions: tuple[tuple[float, float, float], tuple[float, float, float]]
    width: float
    enabled: bool
    side: str
    material_id: str
    material_binding: MaterialBinding
    texture_profile: MultipleFlickBackLineTextureProfile | None = None
    mesh: MeshGeometry | None = None
    shader_parameters: dict[str, float] = field(default_factory=dict)
    shader_name: str = MULTIPLE_FLICK_BACK_LINE_SHADER_NAME
    serialized_threshold_default: float = (
        MULTIPLE_FLICK_BACK_LINE_SERIALIZED_THRESHOLD
    )


LEFT_MULTIPLE_FLICK_GAME_NOTE_TYPES = (10, 14, 16, 18, 20, 22)
RIGHT_MULTIPLE_FLICK_GAME_NOTE_TYPES = (11, 15, 17, 19, 21, 23)
LEFT_MULTIPLE_FLICK_AFTER_NOTE_TYPES = (4, 11)
RIGHT_MULTIPLE_FLICK_AFTER_NOTE_TYPES = (5, 12)


def multiple_flick_back_line_side(
    game_note_type: int | None,
    after_note_type: int | None = None,
) -> str:
    """Select the left/right material branch used by setupMaterial."""
    if game_note_type in LEFT_MULTIPLE_FLICK_GAME_NOTE_TYPES:
        return "left"
    if game_note_type in RIGHT_MULTIPLE_FLICK_GAME_NOTE_TYPES:
        return "right"
    if game_note_type is None and after_note_type in LEFT_MULTIPLE_FLICK_AFTER_NOTE_TYPES:
        return "left"
    if game_note_type is None and after_note_type in RIGHT_MULTIPLE_FLICK_AFTER_NOTE_TYPES:
        return "right"
    raise ValueError("unsupported multiple directional Flick back-line type")


def build_multiple_flick_back_line_geometry(
    target_note_ids: tuple[str, str],
    position_a: tuple[float, float] | tuple[float, float, float],
    position_b: tuple[float, float] | tuple[float, float, float],
    scale_x_a: float,
    game_note_type_a: int | None,
    after_note_type_a: int | None = None,
    shader_threshold: float | None = None,
    texture_bundle_name: str | None = None,
) -> FlickBackLineGeometry:
    """Build the recovered sorted two-point multiple-Flick back line."""
    points = sorted(
        (
            (
                position_a[0],
                position_a[1],
                position_a[2] if len(position_a) == 3 else 0.0,
            ),
            (
                position_b[0],
                position_b[1],
                position_b[2] if len(position_b) == 3 else 0.0,
            ),
        ),
        key=lambda point: point[0],
    )
    side = multiple_flick_back_line_side(game_note_type_a, after_note_type_a)
    binding = MULTIPLE_FLICK_BACK_LINE_BINDINGS[side]
    shader_parameters = (
        {"_Threshold": shader_threshold} if shader_threshold is not None else {}
    )
    geometry = FlickBackLineGeometry(
        target_note_ids,
        (points[0], points[1]),
        scale_x_a * 0.75,
        True,
        side,
        f"resources:{binding.material_resource_path}",
        binding,
        (
            multiple_flick_back_line_texture_profile(texture_bundle_name)
            if texture_bundle_name is not None
            else None
        ),
        None,
        shader_parameters,
    )
    return replace(
        geometry,
        mesh=build_multiple_flick_back_line_textured_quad(geometry),
    )


def build_multiple_flick_back_line_textured_quad(
    geometry: FlickBackLineGeometry,
    view_direction: tuple[float, float, float] = (0.0, 0.0, 1.0),
) -> MeshGeometry:
    """Build a camera-facing, Stretch-mode equivalent quad for the two-point line."""
    start, end = geometry.positions
    tangent = tuple(end[index] - start[index] for index in range(3))
    tangent_length = sqrt(sum(component * component for component in tangent))
    if tangent_length == 0.0:
        raise ValueError("multiple-Flick back-line endpoints must be distinct")
    tangent = tuple(component / tangent_length for component in tangent)
    side = (
        view_direction[1] * tangent[2] - view_direction[2] * tangent[1],
        view_direction[2] * tangent[0] - view_direction[0] * tangent[2],
        view_direction[0] * tangent[1] - view_direction[1] * tangent[0],
    )
    side_length = sqrt(sum(component * component for component in side))
    if side_length == 0.0:
        raise ValueError("view direction must not be parallel to the back line")
    half_width = geometry.width * 0.5
    side = tuple(component / side_length * half_width for component in side)
    vertices = (
        tuple(start[index] - side[index] for index in range(3)),
        tuple(start[index] + side[index] for index in range(3)),
        tuple(end[index] - side[index] for index in range(3)),
        tuple(end[index] + side[index] for index in range(3)),
    )
    return MeshGeometry(
        vertices,
        (0, 2, 1, 1, 2, 3),
        ((0.0, 0.0), (0.0, 1.0), (1.0, 0.0), (1.0, 1.0)),
        material_id=geometry.material_id,
        material_binding=geometry.material_binding,
        shader_parameters=geometry.shader_parameters,
    )


def shade_star_transparent_colored(
    sampled_rgba: tuple[float, float, float, float],
    vertex_rgba: tuple[float, float, float, float],
    fragment_y: float,
    threshold: float,
    lod: int = 200,
) -> tuple[float, float, float, float]:
    """Evaluate the recovered GLES fragment path for the shared gameplay Shader."""
    if lod == 100:
        clamped_vertex = tuple(
            min(max(component, 0.0), 1.0) for component in vertex_rgba
        )
        return tuple(
            sample * vertex
            for sample, vertex in zip(sampled_rgba, clamped_vertex)
        )
    if lod != 200:
        raise ValueError("star/Star Transparent Colored LOD must be 100 or 200")
    color = tuple(
        sample * vertex for sample, vertex in zip(sampled_rgba, vertex_rgba)
    )
    alpha = color[3]
    polynomial = alpha * 0.305299997 + 0.682200015
    polynomial = alpha * polynomial + 0.0125000002
    polynomial = alpha * polynomial - alpha
    polynomial = polynomial * 0.349999994 + alpha
    gamma = 0.0 if alpha == 0.0 else abs(alpha) ** 0.416700006
    gamma = min(max(gamma * 1.05499995 - 0.0549999997, 0.0), 1.0)
    base = (gamma - alpha) * 0.649999976 + alpha
    luminance = (
        color[0] * 0.212599993
        + color[1] * 0.715200007
        + color[2] * 0.0722000003
    )
    output_alpha = luminance * (polynomial - base) + base
    if threshold < fragment_y:
        output_alpha = 0.0
    return color[0], color[1], color[2], output_alpha


def shade_multiple_flick_back_line(
    sampled_rgba: tuple[float, float, float, float],
    vertex_rgba: tuple[float, float, float, float],
    fragment_y: float,
    threshold: float,
    lod: int = 200,
) -> tuple[float, float, float, float]:
    """Evaluate the shared Shader for a multiple-direction Flick back line."""
    return shade_star_transparent_colored(
        sampled_rgba,
        vertex_rgba,
        fragment_y,
        threshold,
        lod,
    )


def sync_line_edge_margin(
    edge_margin: float,
    game_note_type: int | None,
) -> float:
    """Return the NoteSyncLine margin, excluding directional types 10..19."""
    if game_note_type is not None and 10 <= game_note_type <= 19:
        return 0.0
    return edge_margin


def build_sync_line_geometry(
    target_note_ids: tuple[str, str],
    position_a: tuple[float, float],
    position_b: tuple[float, float],
    scale_x_a: float,
    scale_x_b: float,
    edge_margin: float,
    game_note_type_a: int | None = None,
    game_note_type_b: int | None = None,
    shader_threshold: float | None = None,
    texture_profile: SyncLineTextureProfile | None = None,
) -> SyncLineGeometry:
    """Build the recovered two-point NoteSyncLine renderer state."""
    point_a = [position_a[0], position_a[1], 0.0]
    point_b = [position_b[0], position_b[1], 0.0]
    if edge_margin > 0.0:
        margin_a = sync_line_edge_margin(edge_margin, game_note_type_a) * scale_x_a
        margin_b = sync_line_edge_margin(edge_margin, game_note_type_b) * scale_x_b
        direction = 1.0 if point_a[0] <= point_b[0] else -1.0
        point_a[0] += margin_a * direction
        point_b[0] -= margin_b * direction
    shader_parameters = (
        {"_Threshold": shader_threshold} if shader_threshold is not None else {}
    )
    return SyncLineGeometry(
        target_note_ids,
        (tuple(point_a), tuple(point_b)),
        scale_x_a * 0.28,
        True,
        shader_parameters=shader_parameters,
        texture_profile=texture_profile,
    )


def build_note_strip_uvs(pair_count: int) -> tuple[tuple[float, float], ...]:
    """Build the recovered left/right UV pairs for a NoteMesh strip."""
    if pair_count < 2:
        raise ValueError("note strip must contain at least two UV pairs")
    return tuple(
        coordinate
        for section in range(pair_count)
        for coordinate in (
            (0.0, section / (pair_count - 1)),
            (1.0, section / (pair_count - 1)),
        )
    )


def build_note_mesh_colors(
    vertex_count: int,
    long_note_line_brightness: int,
) -> tuple[tuple[float, float, float, float], ...]:
    """Build NoteMesh colors using LongNoteLineBrightness as alpha."""
    color = (1.0, 1.0, 1.0, long_note_line_brightness / 100.0)
    return (color,) * vertex_count


def setup_note_mesh_color(
    colors: tuple[tuple[float, float, float, float], ...],
    activation_color: tuple[float, float, float, float],
) -> tuple[tuple[float, float, float, float], ...]:
    """Apply NoteMesh.SetupMeshColor RGB while preserving initialized alpha."""
    red, green, blue, _ = activation_color
    return tuple((red, green, blue, alpha) for _, _, _, alpha in colors)


def get_sudden_pos(
    launch_distance_rate: float,
    sudden_rate: int,
    sudden_top_y: float,
    sudden_bottom_y: float,
) -> float:
    """Recovered InGameCalculatedData.GetSuddenPos behavior."""
    ratio = sudden_rate / 100.0
    if ratio != 0.0:
        ratio = launch_distance_rate + (1.0 - launch_distance_rate) * ratio
    ratio = min(max(ratio, 0.0), 1.0)
    return sudden_top_y + (sudden_bottom_y - sudden_top_y) * ratio


def build_advanced_note_strip(
    front_left: tuple[float, float],
    front_right: tuple[float, float],
    after_left: tuple[float, float],
    after_right: tuple[float, float],
    long_note_line_brightness: int = 100,
    mesh_color: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0),
    material_id: str = "serialized:normalMaterial_",
    material_binding: MaterialBinding | None = None,
    shader_threshold: float | None = None,
    texture_profile: NoteMeshTextureProfile | None = None,
) -> MeshGeometry:
    """Build the recovered 42-vertex/20-segment NoteMeshAdvanced strip."""
    if material_binding is not None:
        material_id = f"resources:{material_binding.material_resource_path}"
    vertices: list[tuple[float, float, float]] = []
    for section in range(21):
        rate = section / 20.0  # recovered code advances by 2/40
        for front, after in ((front_left, after_left), (front_right, after_right)):
            vertices.append(
                (
                    front[0] * (1.0 - rate) + after[0] * rate,
                    front[1] * (1.0 - rate) + after[1] * rate,
                    0.0,
                )
            )
    triangles: list[int] = []
    for section in range(20):
        left = section * 2
        triangles.extend((left, left + 2, left + 1, left + 1, left + 2, left + 3))
    shader_parameters = (
        {"_Threshold": shader_threshold} if shader_threshold is not None else {}
    )
    return MeshGeometry(
        tuple(vertices),
        tuple(triangles),
        build_note_strip_uvs(21),
        setup_note_mesh_color(
            build_note_mesh_colors(42, long_note_line_brightness),
            mesh_color,
        ),
        material_id,
        material_binding,
        shader_parameters,
        texture_profile,
    )


def mesh_width_rate(
    note_type: int | None,
    special_width_enabled: bool = False,
    width_progress: float = 0.0,
) -> float:
    """Recovered NoteMesh.GetMeshWidthRate behavior."""
    if not special_width_enabled:
        return 1.0
    if note_type == 2:
        return 1.05
    if note_type is not None and 3 <= note_type <= 7:
        return 1.05 + min(max(width_progress, 0.0), 1.0) * 0.03
    return 1.0


def project_note_boundary(
    position: tuple[float, float],
    local_scale_x: float,
    button_count: int,
    screen_to_safe_area_ratio: float,
    width_rate: float = 1.0,
) -> tuple[tuple[float, float], tuple[float, float]]:
    """Project a note Transform into the recovered left/right mesh boundary."""
    half_width = (
        local_scale_x * button_count * screen_to_safe_area_ratio * width_rate
    )
    return (
        (position[0] - half_width, position[1]),
        (position[0] + half_width, position[1]),
    )


def note_arrival_seconds(specific_speed: float) -> float:
    """Recovered NoteUtility.GetNoteArrivalSeconds piecewise mapping."""
    if specific_speed <= 11.01:
        return (specific_speed - 1.0) * -0.5 + 5.5
    return (specific_speed - 11.0) / -10.0 + 0.5


def calc_progress_rate(
    progress_rate: float,
    arrival_seconds: float,
    delta_time: float,
    real_move_second: float,
) -> float:
    """Recovered NoteUtility.CalcProgressRate behavior."""
    if arrival_seconds == 0:
        raise ValueError("arrival seconds must be non-zero")
    if progress_rate == 0.0:
        return real_move_second / arrival_seconds
    return progress_rate + delta_time / arrival_seconds


def seconds_between_positions(tempo_map: TempoMap, start: float, end: float) -> float:
    if end <= start:
        return 0.0
    seconds = 0.0
    current = start
    for change in tempo_map.changes[1:]:
        if change.position <= current:
            continue
        boundary = min(change.position, end)
        units_per_second = tempo_map.units_per_bar * tempo_map.bpm_at(current) / 240.0
        seconds += (boundary - current) / units_per_second
        current = boundary
        if current >= end:
            return seconds
    units_per_second = tempo_map.units_per_bar * tempo_map.bpm_at(current) / 240.0
    return seconds + (end - current) / units_per_second


def signed_seconds_between_positions(
    tempo_map: TempoMap, start: float, end: float
) -> float:
    if end >= start:
        return seconds_between_positions(tempo_map, start, end)
    return -seconds_between_positions(tempo_map, end, start)


def virtual_lane_note_x(
    distance_delta_x: float,
    base_x: float,
    direction: str,
    distance: int,
) -> float:
    """Recovered NoteUtility.GetVirtualLaneNotePosX direction branches."""
    offset = distance * distance_delta_x
    if direction == "left":
        return base_x - offset
    if direction == "right":
        return base_x + offset
    if direction == "none":
        return base_x
    raise ValueError(f"unknown virtual lane direction: {direction}")


def calc_note_position(
    goal: tuple[float, float],
    start: tuple[float, float],
    progress_rate: float,
    virtual_lane_direction: str = "none",
    virtual_lane_distance: int = 0,
    virtual_lane_start_delta_x: float = 0.0,
    virtual_lane_end_delta_x: float = 0.0,
) -> tuple[float, float]:
    """Recovered NoteUtility.CalcNotePosition including virtual-lane X."""
    start_x = virtual_lane_note_x(
        virtual_lane_start_delta_x,
        start[0],
        virtual_lane_direction,
        virtual_lane_distance,
    )
    goal_x = virtual_lane_note_x(
        virtual_lane_end_delta_x,
        goal[0],
        virtual_lane_direction,
        virtual_lane_distance,
    )
    curve = 1.1 ** ((progress_rate - 1.0) * 50.0)
    return (
        start_x + curve * (goal_x - start_x),
        start[1] - abs((start[1] - goal[1]) * curve),
    )


SCALE_MIN_RATIO_LIST = (0.98, 0.988, 0.9898, 0.9899, 0.991, 0.9915, 0.9917)


def calc_note_scale(
    y: float,
    launcher_y: float,
    target_center_y: float,
    note_setting_scale: float,
    button_count: int,
    high_aspect_ratio: float,
) -> float:
    """Recovered NoteBase.calcNoteScale uniform X/Y scale."""
    if not 1 <= button_count <= len(SCALE_MIN_RATIO_LIST):
        raise ValueError("button count must be in recovered range 1..7")
    denominator = abs(launcher_y - target_center_y)
    if denominator == 0:
        raise ValueError("launcher and target center Y must differ")
    vertical_rate = note_setting_scale * abs(launcher_y - y) / denominator
    aspect = min(max(high_aspect_ratio, 0.0), 1.0)
    scale_min_ratio = SCALE_MIN_RATIO_LIST[button_count - 1]
    aspect_ratio = aspect * (scale_min_ratio - 0.996) + 0.996
    return vertical_rate * aspect_ratio + (1.0 - aspect_ratio)


def calculate_after_note_virtual_scale(
    note_setting_scale: float,
    launcher_local_y: float,
    target_center_world_y: float,
    after_note_local_y: float,
    safe_area_to_screen_ratio: float,
) -> float:
    """Recovered NoteMesh.calcurateAfterNoteVirtualScale relation."""
    scaled_launcher_y = launcher_local_y * safe_area_to_screen_ratio
    scaled_target_y = target_center_world_y * safe_area_to_screen_ratio
    denominator = abs(scaled_launcher_y - scaled_target_y)
    if denominator == 0:
        raise ValueError("scaled launcher and target center Y must differ")
    return (
        note_setting_scale
        * abs(scaled_launcher_y - after_note_local_y)
        / denominator
    )


def get_after_note_scale(
    after_note_state: str,
    local_scale_x: float,
    note_setting_scale: float,
    launcher_local_y: float,
    target_center_world_y: float,
    after_note_local_y: float,
    safe_area_to_screen_ratio: float,
) -> float:
    """Recovered NoteMesh.getAfterNoteScale Wait-state branch."""
    if after_note_state != "wait":
        return local_scale_x
    return calculate_after_note_virtual_scale(
        note_setting_scale,
        launcher_local_y,
        target_center_world_y,
        after_note_local_y,
        safe_area_to_screen_ratio,
    )


@dataclass
class NoteMeshRuntimeState:
    state: str = "deactive"
    renderer_enabled: bool = False
    local_position: tuple[float, float, float] = (50.0, 50.0, 0.0)
    local_scale: tuple[float, float, float] = (1.0, 1.0, 1.0)
    has_front_note_ref: bool = False
    has_after_note_ref: bool = False


def activate_note_mesh(state: NoteMeshRuntimeState) -> NoteMeshRuntimeState:
    """Apply the recovered NoteMesh.Activate lifecycle writes."""
    return NoteMeshRuntimeState(
        state="active",
        renderer_enabled=True,
        local_position=(0.0, 0.0, state.local_position[2]),
        local_scale=(1.0, 1.0, 1.0),
        has_front_note_ref=True,
        has_after_note_ref=True,
    )


def deactivate_note_mesh(state: NoteMeshRuntimeState) -> NoteMeshRuntimeState:
    """Apply the recovered NoteMesh.Deactivate lifecycle writes."""
    return NoteMeshRuntimeState(
        state="deactive",
        renderer_enabled=False,
        local_position=(50.0, 50.0, state.local_position[2]),
        local_scale=(1.0, 1.0, 1.0),
        has_front_note_ref=False,
        has_after_note_ref=False,
    )


def hide_note_mesh_renderer(state: NoteMeshRuntimeState) -> NoteMeshRuntimeState:
    """Apply NoteSlideAfter.KillMesh without releasing the pooled mesh."""
    return NoteMeshRuntimeState(
        state=state.state,
        renderer_enabled=False,
        local_position=state.local_position,
        local_scale=state.local_scale,
        has_front_note_ref=state.has_front_note_ref,
        has_after_note_ref=state.has_after_note_ref,
    )


def note_mesh_should_update(state: NoteMeshRuntimeState) -> bool:
    """Match the early-return gates in NoteMeshAdvanced.OnUpdate."""
    return state.state != "deactive" and state.renderer_enabled


def slide_segment_id(note_id: str, index: int) -> str:
    return f"{note_id}:segment:{index}"


@dataclass(frozen=True)
class SlideMoveState:
    note_state: str
    is_real_line: bool
    is_progress_over_line: bool
    is_over_line: bool
    kill_mesh: bool
    snap_to_visual_target: bool


@dataclass(frozen=True)
class SlideStopState:
    visible_after_index: int | None
    movable_after_index: int | None
    action: str
    rebind_visual_target: bool
    hide_sprite: bool
    kill_after_mesh: bool


SLIDE_AFTER_MISS_TYPES = {
    3: "after_slower",
    4: "after_through",
    5: "after_force",
    6: "after_through_flick",
}
SLIDE_AFTER_MISS_SECOND_INTERVAL = 0.21666667


def slide_after_miss_type(miss_type: int) -> str:
    try:
        return SLIDE_AFTER_MISS_TYPES[miss_type]
    except KeyError as error:
        raise ValueError(f"unsupported SlideNoteMissType: {miss_type}") from error


@dataclass(frozen=True)
class SlideStopMissState:
    miss_code: int | None
    miss_type: str | None
    frame_counter: float
    adjustment_counter: int
    adjustment_delay_active: bool
    change_to_waiting_deactive: bool


def note_manager_execute_frame(delta_time: float, update_steps: int = 1) -> float:
    if delta_time < 0.0:
        raise ValueError("NoteManager delta time cannot be negative")
    if update_steps not in {1, 2, 3, 4}:
        raise ValueError("NoteManager update steps must be in recovered range 1..4")
    frame = 1.0 if delta_time > FRAME_SECONDS else delta_time * 60.0
    return frame / update_steps


@dataclass(frozen=True)
class NoteManagerPerformanceState:
    counters: tuple[int, int, int, int] = (0, 0, 0, 0)
    update_steps: int = 1
    substep_delta_time: float = 0.0
    substep_execute_frame: float = 0.0


def advance_note_manager_performance(
    state: NoteManagerPerformanceState,
    delta_time: float,
    bpm_change_count: int,
) -> NoteManagerPerformanceState:
    if bpm_change_count < 0:
        raise ValueError("NoteManager BPM change count cannot be negative")
    counters = list(state.counters)
    update_steps = 1
    if bpm_change_count >= 1:
        if delta_time < 0.018:
            bucket = 0
            update_steps = 1
        elif delta_time < 0.033:
            bucket = 1
            update_steps = 2
        elif delta_time < 0.05:
            bucket = 2
            update_steps = 3
        else:
            bucket = 3
            update_steps = 4
        counters[bucket] += 1
        if counters[0] > 100 or counters[1] > 20 or counters[2] >= 6:
            update_steps = 1
    return NoteManagerPerformanceState(
        counters=tuple(counters),
        update_steps=update_steps,
        substep_delta_time=delta_time / update_steps,
        substep_execute_frame=note_manager_execute_frame(delta_time, update_steps),
    )


def evaluate_slide_stop_miss(
    *,
    current_state: str,
    has_judge: bool,
    has_after_note: bool,
    visible_after_state: str | None,
    judgement_adjust_value_b: int,
    adjustment_counter: int,
    root_game_note_type: int | None,
    frame_counter: float,
    execute_frame: float,
    elapsed_seconds: float,
    elapsed_distance: float,
    visible_after_remaining_distance: float | None,
) -> SlideStopMissState:
    if current_state not in {
        "move",
        "wait",
        "stop",
        "deactive",
        "waiting_deactive",
    }:
        raise ValueError(f"unsupported Slide After state: {current_state}")
    if visible_after_state not in {
        None,
        "move",
        "wait",
        "stop",
        "deactive",
        "waiting_deactive",
    }:
        raise ValueError(f"unsupported visible Slide After state: {visible_after_state}")
    if adjustment_counter < 0 or frame_counter < 0.0 or execute_frame < 0.0:
        raise ValueError("Slide Stop counters cannot be negative")

    adjustment_limit = 6 - judgement_adjust_value_b
    adjustment_ready = (
        judgement_adjust_value_b >= 0 or adjustment_counter >= adjustment_limit
    )
    if (
        visible_after_state in {"stop", "deactive", "waiting_deactive"}
        and not has_judge
        and current_state != "waiting_deactive"
        and adjustment_ready
    ):
        return SlideStopMissState(
            3,
            slide_after_miss_type(3),
            frame_counter,
            adjustment_counter,
            False,
            True,
        )

    if (
        has_after_note
        and visible_after_state is not None
        and judgement_adjust_value_b < 0
        and adjustment_counter < adjustment_limit
    ):
        return SlideStopMissState(
            None,
            None,
            frame_counter,
            adjustment_counter + 1,
            True,
            False,
        )
    if has_judge:
        return SlideStopMissState(
            None, None, frame_counter, adjustment_counter, False, False
        )

    if not has_after_note and root_game_note_type == 8:
        frame_counter += execute_frame
        miss_code = 6 if frame_counter >= 7.0 else None
        return SlideStopMissState(
            miss_code,
            slide_after_miss_type(miss_code) if miss_code is not None else None,
            frame_counter,
            adjustment_counter,
            False,
            miss_code is not None,
        )

    if elapsed_seconds > SLIDE_AFTER_MISS_SECOND_INTERVAL:
        return SlideStopMissState(
            4,
            slide_after_miss_type(4),
            frame_counter,
            adjustment_counter,
            False,
            True,
        )
    if has_after_note and (
        visible_after_remaining_distance is None
        or (
            visible_after_remaining_distance > 0.0
            and elapsed_distance > visible_after_remaining_distance
        )
    ):
        return SlideStopMissState(
            5,
            slide_after_miss_type(5),
            frame_counter,
            adjustment_counter,
            False,
            True,
        )
    return SlideStopMissState(
        None, None, frame_counter, adjustment_counter, False, False
    )


@dataclass(frozen=True)
class SlideAfterLifecycleState:
    state: str = "waiting_deactive"
    sprite_renderer_enabled: bool = False
    mesh_state: NoteMeshRuntimeState = field(
        default_factory=lambda: NoteMeshRuntimeState(renderer_enabled=False)
    )
    has_root_note_ref: bool = True
    has_front_note_ref: bool = True
    has_after_note_ref: bool = True
    local_position: tuple[float, float, float] = (0.0, 0.0, 0.0)


def deactivate_slide_after_node(
    state: SlideAfterLifecycleState,
) -> SlideAfterLifecycleState:
    """Apply the root-owned NoteSlideAfter Deactivate cascade."""
    return SlideAfterLifecycleState(
        state="deactive",
        sprite_renderer_enabled=False,
        mesh_state=deactivate_note_mesh(state.mesh_state),
        has_root_note_ref=False,
        has_front_note_ref=False,
        has_after_note_ref=False,
        local_position=(50.0, 50.0, state.local_position[2]),
    )


def evaluate_slide_stop_state(
    current_index: int,
    states: tuple[str, ...],
    invisible: tuple[bool, ...],
) -> SlideStopState:
    if len(states) != len(invisible):
        raise ValueError("Slide Stop states and visibility must have equal lengths")
    if not 0 <= current_index < len(states):
        raise ValueError("Slide Stop current index is out of range")
    direct_after_index = current_index + 1
    if direct_after_index >= len(states):
        return SlideStopState(None, None, "wait_for_miss", False, False, False)
    visible_after_index = direct_after_index
    while visible_after_index < len(states) and invisible[visible_after_index]:
        visible_after_index += 1
    if visible_after_index >= len(states):
        visible_after_index = None
    movable_after_index = direct_after_index
    while (
        movable_after_index < len(states) - 1
        and states[movable_after_index] in {"stop", "deactive", "waiting_deactive"}
    ):
        movable_after_index += 1
    if visible_after_index is None:
        action = "wait_for_miss"
    elif states[visible_after_index] in {"move", "wait"}:
        action = "move_to_after"
    else:
        action = "waiting_deactive"
    return SlideStopState(
        visible_after_index=visible_after_index,
        movable_after_index=movable_after_index,
        action=action,
        rebind_visual_target=direct_after_index != movable_after_index,
        hide_sprite=action == "waiting_deactive",
        kill_after_mesh=action == "waiting_deactive",
    )


def move_to_next_after_note_x(
    current_transform_x: float,
    current_visual_x: float,
    after_visual_x: float,
    delta_time: float,
    total_seconds: float,
) -> float:
    if total_seconds <= 0.0:
        return after_visual_x
    step = (after_visual_x - current_visual_x) * delta_time / total_seconds
    moved = current_transform_x + step
    if step >= 0.0:
        return min(moved, after_visual_x)
    return max(moved, after_visual_x)


def evaluate_slide_move_state(
    progress: float,
    current_y: float,
    target_center_y: float,
    virtual_perfect_line: float,
    exist_after_note: bool,
    root_note_state: str,
    adjust_value_b: int,
    root_line_inactive: bool = False,
) -> SlideMoveState:
    """Evaluate the recovered NoteSlideAfter.MoveState line and Stop gates."""
    if root_note_state not in {
        "move",
        "wait",
        "stop",
        "deactive",
        "waiting_deactive",
    }:
        raise ValueError(f"unsupported root note state: {root_note_state}")
    is_real_line = root_line_inactive
    if root_note_state in {"wait", "stop", "waiting_deactive"} and exist_after_note:
        is_real_line = True
    elif not exist_after_note and adjust_value_b >= 1:
        is_real_line = True
    is_progress_over_line = progress > 1.0
    is_over_line = (
        is_progress_over_line and target_center_y <= virtual_perfect_line
    )
    kill_mesh = is_over_line and current_y < target_center_y
    return SlideMoveState(
        note_state="stop" if is_over_line else "move",
        is_real_line=is_real_line,
        is_progress_over_line=is_progress_over_line,
        is_over_line=is_over_line,
        kill_mesh=kill_mesh,
        snap_to_visual_target=is_over_line and is_real_line,
    )


FLICK_ICON_ANIMATION_DURATION = 0.3333333432674408
FLICK_ICON_ANIMATION_PROFILES: dict[str, dict[str, tuple[float, float]]] = {
    "FlickNoteIcon": {
        "m_LocalPosition.x": (0.0, 0.0),
        "m_LocalPosition.y": (0.699999988079071, 1.7999998331069946),
    },
    "FlickNoteIconLeft": {
        "m_LocalPosition.x": (-1.600000023841858, -2.0999996662139893),
        "m_LocalPosition.y": (0.0, 0.0),
    },
    "FlickNoteIconRight": {
        "m_LocalPosition.x": (1.600000023841858, 2.0999996662139893),
        "m_LocalPosition.y": (0.0, 0.0),
    },
}


@dataclass(frozen=True)
class FlickIconTransform:
    local_position: tuple[float, float]
    local_scale: tuple[float, float]
    local_rotation_degrees: float


def evaluate_flick_icon_animation(
    animator_state: str,
    elapsed_seconds: float,
) -> FlickIconTransform:
    try:
        profile = FLICK_ICON_ANIMATION_PROFILES[animator_state]
    except KeyError as error:
        raise ValueError(f"unrecovered Flick icon animation: {animator_state}") from error
    local_time = max(0.0, elapsed_seconds) % FLICK_ICON_ANIMATION_DURATION
    return FlickIconTransform(
        local_position=tuple(
            profile[f"m_LocalPosition.{axis}"][0]
            + profile[f"m_LocalPosition.{axis}"][1] * local_time
            for axis in "xy"
        ),
        local_scale=(1.0, 1.0),
        local_rotation_degrees=0.0,
    )


@dataclass(frozen=True)
class FlickIconRenderState:
    resource_id: str
    enabled: bool
    sorting_order: int
    animator_state: str
    animator_elapsed_seconds: float
    local_position: tuple[float, float]
    local_scale: tuple[float, float] = (1.0, 1.0)
    local_rotation_degrees: float = 0.0


@dataclass(frozen=True)
class FrontFlickIconVisualRoute:
    sprite_key: str
    sorting_order: int
    animator_state: str
    is_range_key: bool


def front_flick_icon_visual_route(
    note_kind: str,
    main_sorting_order: int = 70,
) -> FrontFlickIconVisualRoute | None:
    if note_kind in ("directional_flick_left", "flick_left"):
        return FrontFlickIconVisualRoute(
            "note_flick_top_l", 71, "FlickNoteIconLeft", False
        )
    if note_kind in ("directional_flick_right", "flick_right"):
        return FrontFlickIconVisualRoute(
            "note_flick_top_r", 71, "FlickNoteIconRight", False
        )
    if "flick" in note_kind:
        return FrontFlickIconVisualRoute(
            "note_flick_top", main_sorting_order, "FlickNoteIcon", True
        )
    return None


def flick_icon_render_state(
    route: FrontFlickIconVisualRoute,
    resource_id: str | None,
    elapsed_seconds: float,
    enabled: bool = True,
) -> FlickIconRenderState | None:
    if resource_id is None:
        return None
    transform = evaluate_flick_icon_animation(
        route.animator_state,
        elapsed_seconds,
    )
    return FlickIconRenderState(
        resource_id=resource_id,
        enabled=enabled,
        sorting_order=route.sorting_order,
        animator_state=route.animator_state,
        animator_elapsed_seconds=elapsed_seconds,
        local_position=transform.local_position,
        local_scale=transform.local_scale,
        local_rotation_degrees=transform.local_rotation_degrees,
    )


@dataclass
class RenderNote:
    note_id: str
    lane: int
    kind: str
    progress: float
    resource_id: str | None = None
    mesh: MeshGeometry | None = None
    position: tuple[float, float] | None = None
    scale_x: float = 1.0
    sprite_key: str | None = None
    sprite_renderer_enabled: bool = True
    flick_icon_enabled: bool = False
    sorting_order: int = 70
    flick_icon: FlickIconRenderState | None = None


@dataclass
class SlideNodeRenderState:
    node_id: str
    parent_note_id: str
    index: int
    absolute_position: float
    lane: int
    width: int
    progress: float
    position: tuple[float, float]
    scale_x: float
    state: str = "move"
    exist_after_note: bool = False
    virtual_perfect_line: float = 0.0
    is_real_line: bool = False
    is_progress_over_line: bool = False
    is_over_line: bool = False
    kill_mesh: bool = False
    visible_after_node_id: str | None = None
    movable_after_node_id: str | None = None
    stop_action: str | None = None
    sprite_key: str = "note_slide_among"
    resource_id: str | None = None
    sprite_renderer_enabled: bool = True
    sorting_order: int = 70


@dataclass
class SlideTailVisualRoute:
    subclass: str | None
    sprite_key: str | None
    icon_sprite_key: str | None
    flick_icon_enabled: bool
    flick_icon_sorting_order: int | None
    directional_animation: str | None


def slide_tail_subclass_from_after_note_type(
    after_note_type: int | None,
) -> str | None:
    if after_note_type == 8:
        return "flick"
    if after_note_type in (9, 10):
        return "directional_flick"
    if after_note_type in (11, 12):
        return "multiple_directional_flick"
    return None


def slide_tail_visual_route(
    game_note_type: int | None,
    end_gesture: str,
    after_note_type: int | None = None,
) -> SlideTailVisualRoute:
    subclass = slide_tail_subclass_from_after_note_type(after_note_type)
    if after_note_type is None:
        if end_gesture == "flick":
            subclass = "flick"
        elif end_gesture.startswith("directional_"):
            subclass = "directional_flick"
        elif end_gesture.startswith("multiple_"):
            subclass = "multiple_directional_flick"
    if subclass == "flick":
        return SlideTailVisualRoute(
            "flick",
            "note_flick",
            "note_flick_top",
            True,
            None,
            None,
        )
    if subclass is None:
        return SlideTailVisualRoute(None, None, None, False, None, None)
    if game_note_type in (14, 16):
        return SlideTailVisualRoute(
            subclass,
            "note_flick_l",
            "note_flick_top_l",
            True,
            71,
            "FlickNoteIconLeft",
        )
    if game_note_type in (15, 17):
        return SlideTailVisualRoute(
            subclass,
            "note_flick_r",
            "note_flick_top_r",
            True,
            71,
            "FlickNoteIconRight",
        )
    return SlideTailVisualRoute(subclass, None, None, False, 71, None)


def multiple_directional_side_visual_route(
    game_note_type: int | None,
) -> SlideTailVisualRoute:
    if game_note_type in (20, 22):
        return SlideTailVisualRoute(
            "side_visual",
            "note_flick_l",
            "note_flick_top_l",
            True,
            71,
            "FlickNoteIconLeft",
        )
    if game_note_type in (21, 23):
        return SlideTailVisualRoute(
            "side_visual",
            "note_flick_r",
            "note_flick_top_r",
            True,
            71,
            "FlickNoteIconRight",
        )
    raise ValueError("unsupported multiple-direction side visual type")


MULTIPLE_DIRECTIONAL_FLICK_Z_STEP = 9.999999747378752e-06


def multiple_directional_flick_side_z_positions(
    game_note_type: int | None,
    left_count: int,
    right_count: int,
    root_z: float = 0.0,
) -> tuple[tuple[float, ...], tuple[float, ...]]:
    if game_note_type in (14, 16, 20, 22):
        left_step = -MULTIPLE_DIRECTIONAL_FLICK_Z_STEP
        right_step = MULTIPLE_DIRECTIONAL_FLICK_Z_STEP
    elif game_note_type in (15, 17, 21, 23):
        left_step = MULTIPLE_DIRECTIONAL_FLICK_Z_STEP
        right_step = -MULTIPLE_DIRECTIONAL_FLICK_Z_STEP
    else:
        return (), ()
    left_positions = tuple(
        root_z + left_step * index for index in range(1, left_count + 1)
    )
    right_positions = tuple(
        root_z + right_step * index for index in range(1, right_count + 1)
    )
    return left_positions, right_positions


@dataclass(frozen=True)
class SlideTailConnectionNodeState:
    node_id: str
    role: str
    button_index: int
    game_note_type: int | None
    z_position: float
    scale_x: float
    x_position: float | None = None
    position: tuple[float, float] | None = None
    sprite_key: str | None = None
    resource_id: str | None = None
    sorting_order: int = 70
    flick_icon: FlickIconRenderState | None = None
    left_visual_id: str | None = None
    right_visual_id: str | None = None
    left_after_id: str | None = None
    right_after_id: str | None = None
    far_left_after_id: str | None = None
    far_right_after_id: str | None = None
    state: str = "move"
    sprite_enabled: bool = True
    result_used: bool = False


@dataclass(frozen=True)
class SlideTailBackLineLinkState:
    line_id: str
    owner_node_id: str
    target_node_id: str
    side: str
    material_id: str
    material_binding: MaterialBinding
    shader_parameters: dict[str, float]
    active: bool = True
    renderer_enabled: bool = True
    positions: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
    ] = ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
    width: float = 0.0


@dataclass(frozen=True)
class SlideTailConnectionGraph:
    root_node_id: str
    nodes: tuple[SlideTailConnectionNodeState, ...]
    back_lines: tuple[SlideTailBackLineLinkState, ...]
    active_node_order: tuple[str, ...]
    active_node_order_source: str
    root_side_references_active: bool = True


SLIDE_TAIL_ADD_TYPE_BY_END_TYPE = {
    14: 20,
    15: 21,
    16: 22,
    17: 23,
}


def _slide_tail_propagated_node_ids(
    nodes: tuple[SlideTailConnectionNodeState, ...]
    | list[SlideTailConnectionNodeState],
    node_id: str,
) -> set[str]:
    node_by_id = {node.node_id: node for node in nodes}
    initiating_node = node_by_id.get(node_id)
    if initiating_node is None:
        raise ValueError("Slide tail connection node does not exist")
    if initiating_node.role == "tail":
        return set(node_by_id)
    propagated_node_ids: set[str] = set()
    pending_node_ids = [node_id]
    while pending_node_ids:
        current_node_id = pending_node_ids.pop()
        if current_node_id in propagated_node_ids:
            continue
        propagated_node_ids.add(current_node_id)
        current_node = node_by_id[current_node_id]
        for neighbor_id in (
            current_node.left_visual_id,
            current_node.right_visual_id,
        ):
            if neighbor_id is not None:
                pending_node_ids.append(neighbor_id)
    return propagated_node_ids


def build_slide_tail_connection_graph(
    root_node_id: str,
    root_button_index: int,
    root_game_note_type: int,
    side_nodes: tuple[SlideTailSideNodeSpec, ...],
    state: str = "move",
    root_z: float = 0.0,
    root_scale_x: float = 1.0,
    root_source_order: int | None = None,
    shader_threshold: float = 1.0,
    button_x: Callable[[int], float] | None = None,
) -> SlideTailConnectionGraph:
    expected_side_type = SLIDE_TAIL_ADD_TYPE_BY_END_TYPE.get(root_game_note_type)
    if expected_side_type is None:
        raise ValueError("unsupported terminal multiple-direction GameNoteType")
    node_ids = [node.node_id for node in side_nodes]
    button_indices = [node.button_index for node in side_nodes]
    if root_node_id in node_ids or len(set(node_ids)) != len(node_ids):
        raise ValueError("multiple-direction side node ids must be unique")
    if root_button_index in button_indices or len(set(button_indices)) != len(
        button_indices
    ):
        raise ValueError("multiple-direction side buttons must be unique")
    if any(node.game_note_type != expected_side_type for node in side_nodes):
        raise ValueError("side node GameNoteType does not match terminal family")
    all_buttons = button_indices + [root_button_index]
    if max(all_buttons) - min(all_buttons) + 1 != len(all_buttons):
        raise ValueError("multiple-direction side graph must be button-contiguous")

    source_orders = [root_source_order, *(node.source_order for node in side_nodes)]
    if any(order is None for order in source_orders):
        if not all(order is None for order in source_orders):
            raise ValueError(
                "multiple-direction source order must be provided for every node"
            )
        active_node_order_source = "compatibility_button_order"
        launch_node_order = ()
    else:
        concrete_source_orders = tuple(int(order) for order in source_orders)
        if len(set(concrete_source_orders)) != len(concrete_source_orders):
            raise ValueError("multiple-direction source orders must be unique")
        active_node_order_source = "confirmed_chart_order"
        launch_node_order = tuple(
            node_id
            for _, node_id in sorted(
                (
                    (int(root_source_order), root_node_id),
                    *((int(node.source_order), node.node_id) for node in side_nodes),
                )
            )
        )

    side_by_button = {node.button_index: node for node in side_nodes}
    increasing_z_step = (
        MULTIPLE_DIRECTIONAL_FLICK_Z_STEP
        if root_game_note_type in (14, 16)
        else -MULTIPLE_DIRECTIONAL_FLICK_Z_STEP
    )
    graph_nodes: list[SlideTailConnectionNodeState] = []
    for button_index in sorted(all_buttons):
        side_node = side_by_button.get(button_index)
        if side_node is None:
            graph_nodes.append(
                SlideTailConnectionNodeState(
                    root_node_id,
                    "tail",
                    root_button_index,
                    root_game_note_type,
                    root_z,
                    root_scale_x,
                    x_position=(
                        button_x(root_button_index)
                        if button_x is not None
                        else None
                    ),
                    left_visual_id=(
                        side_by_button[root_button_index - 1].node_id
                        if root_button_index - 1 in side_by_button
                        else None
                    ),
                    right_visual_id=(
                        side_by_button[root_button_index + 1].node_id
                        if root_button_index + 1 in side_by_button
                        else None
                    ),
                    state=state,
                )
            )
            continue
        graph_nodes.append(
            SlideTailConnectionNodeState(
                side_node.node_id,
                "visual",
                button_index,
                side_node.game_note_type,
                root_z
                + (button_index - root_button_index) * increasing_z_step,
                root_scale_x,
                x_position=(button_x(button_index) if button_x is not None else None),
                left_visual_id=(
                    side_by_button[button_index - 1].node_id
                    if button_index - 1 in side_by_button
                    else None
                ),
                right_visual_id=(
                    side_by_button[button_index + 1].node_id
                    if button_index + 1 in side_by_button
                    else None
                ),
                left_after_id=(
                    root_node_id if button_index - 1 == root_button_index else None
                ),
                right_after_id=(
                    root_node_id if button_index + 1 == root_button_index else None
                ),
                far_left_after_id=(
                    root_node_id if root_button_index < button_index else None
                ),
                far_right_after_id=(
                    root_node_id if root_button_index > button_index else None
                ),
                state=state,
            )
        )

    if not launch_node_order:
        launch_node_order = tuple(node.node_id for node in graph_nodes)
    moved_node_ids: set[str] = set()
    active_node_order_list: list[str] = []
    for node_id in launch_node_order:
        if node_id in moved_node_ids:
            continue
        active_node_order_list.append(node_id)
        moved_node_ids.update(
            _slide_tail_propagated_node_ids(graph_nodes, node_id)
        )
    active_node_order = tuple(active_node_order_list)

    back_lines: list[SlideTailBackLineLinkState] = []
    node_id_by_button = {
        node.button_index: node.node_id for node in graph_nodes
    }
    node_by_id = {node.node_id: node for node in graph_nodes}

    def create_back_line(
        owner_node_id: str,
        target_node_id: str,
    ) -> SlideTailBackLineLinkState:
        owner = node_by_id[owner_node_id]
        target = node_by_id[target_node_id]
        side = multiple_flick_back_line_side(owner.game_note_type)
        material_binding = MULTIPLE_FLICK_BACK_LINE_BINDINGS[side]
        positions = tuple(
            sorted(
                (
                    (
                        owner.x_position
                        if owner.x_position is not None
                        else float(owner.button_index),
                        0.0,
                        owner.z_position,
                    ),
                    (
                        target.x_position
                        if target.x_position is not None
                        else float(target.button_index),
                        0.0,
                        target.z_position,
                    ),
                ),
                key=lambda position: position[0],
            )
        )
        return SlideTailBackLineLinkState(
            f"{owner_node_id}->{target_node_id}",
            owner_node_id,
            target_node_id,
            side,
            f"resources:{material_binding.material_resource_path}",
            material_binding,
            {"_Threshold": shader_threshold},
            positions=positions,
        )

    for left_button, right_button in zip(
        sorted(all_buttons), sorted(all_buttons)[1:]
    ):
        left_id = node_id_by_button[left_button]
        right_id = node_id_by_button[right_button]
        if root_button_index in (left_button, right_button):
            target_id = right_id if left_id == root_node_id else left_id
            back_lines.append(create_back_line(root_node_id, target_id))
        else:
            back_lines.extend(
                (
                    create_back_line(left_id, right_id),
                    create_back_line(right_id, left_id),
                )
            )
    return SlideTailConnectionGraph(
        root_node_id,
        tuple(graph_nodes),
        tuple(back_lines),
        active_node_order,
        active_node_order_source,
    )


def bind_slide_tail_connection_visuals(
    graph: SlideTailConnectionGraph,
    root_position: tuple[float, float],
    elapsed_seconds: float,
    resource_catalog: ResourceCatalog | None = None,
    note_skin_profile: str = "normal",
) -> SlideTailConnectionGraph:
    nodes: list[SlideTailConnectionNodeState] = []
    for node in graph.nodes:
        position = (
            root_position
            if node.role == "tail"
            else (
                node.x_position
                if node.x_position is not None
                else float(node.button_index),
                root_position[1],
            )
        )
        if node.role == "tail":
            nodes.append(replace(node, position=position))
            continue
        route = multiple_directional_side_visual_route(node.game_note_type)
        buttons = (node.button_index,)
        resource_id = (
            resource_catalog.sprite_resource(
                route.sprite_key,
                buttons,
                is_range_key=False,
                note_skin_profile=note_skin_profile,
            )
            if resource_catalog is not None
            else note_sprite_resource_id(route.sprite_key, buttons)
        )
        icon_resource_id = (
            resource_catalog.sprite_resource(
                route.icon_sprite_key,
                (),
                is_range_key=False,
                note_skin_profile=note_skin_profile,
            )
            if resource_catalog is not None
            else note_sprite_resource_id(route.icon_sprite_key, ())
        )
        nodes.append(
            replace(
                node,
                position=position,
                sprite_key=route.sprite_key,
                resource_id=resource_id,
                sorting_order=70,
                flick_icon=flick_icon_render_state(
                    FrontFlickIconVisualRoute(
                        route.icon_sprite_key,
                        route.flick_icon_sorting_order or 71,
                        route.directional_animation or "FlickNoteIcon",
                        False,
                    ),
                    icon_resource_id,
                    elapsed_seconds,
                    enabled=node.sprite_enabled,
                ),
            )
        )
    return replace(graph, nodes=tuple(nodes))


@dataclass
class SlideTailRuntimeState:
    node_id: str
    parent_note_id: str
    absolute_position: float
    lane: int
    width: int
    progress: float
    position: tuple[float, float]
    scale_x: float
    state: str
    game_note_type: int | None
    end_game_note_type: int | None
    end_gesture: str
    frame_counter: float = 0.0
    miss_type: str | None = None
    miss_code: int | None = None
    subclass: str | None = None
    sprite_key: str | None = None
    resource_id: str | None = None
    sprite_renderer_enabled: bool = True
    sorting_order: int = 70
    icon_sprite_key: str | None = None
    flick_icon_enabled: bool = False
    flick_icon_sorting_order: int | None = None
    directional_animation: str | None = None
    flick_icon: FlickIconRenderState | None = None
    multiple_left_count: int = 0
    multiple_right_count: int = 0
    side_notes_state: str | None = None
    side_notes_sprite_enabled: bool = False
    back_line_active: bool = False
    left_side_z_positions: tuple[float, ...] = ()
    right_side_z_positions: tuple[float, ...] = ()
    side_connection_graph: SlideTailConnectionGraph | None = None


def _set_slide_tail_connection_state(
    graph: SlideTailConnectionGraph,
    node_id: str,
    state: str,
) -> SlideTailConnectionGraph:
    propagated_node_ids = _slide_tail_propagated_node_ids(graph.nodes, node_id)
    active_node_order = graph.active_node_order
    if state == "deactive":
        active_node_order = tuple(
            active_node_id
            for active_node_id in active_node_order
            if active_node_id != node_id
        )
    elif state == "move" and node_id not in active_node_order:
        active_node_order += (node_id,)
    return replace(
        graph,
        nodes=tuple(
            replace(node, state=state)
            if node.node_id in propagated_node_ids
            else node
            for node in graph.nodes
        ),
        active_node_order=active_node_order,
    )


def set_slide_tail_note_state(
    tail: SlideTailRuntimeState,
    state: str,
) -> SlideTailRuntimeState:
    side_state = (
        state
        if tail.multiple_left_count > 0 or tail.multiple_right_count > 0
        else None
    )
    graph = tail.side_connection_graph
    if graph is not None:
        graph = _set_slide_tail_connection_state(
            graph,
            graph.root_node_id,
            state,
        )
    return replace(
        tail,
        state=state,
        side_notes_state=side_state,
        side_connection_graph=graph,
    )


def disable_slide_tail_side_sprites(
    tail: SlideTailRuntimeState,
) -> SlideTailRuntimeState:
    graph = tail.side_connection_graph
    if graph is not None:
        graph = replace(
            graph,
            nodes=tuple(
                replace(node, sprite_enabled=False)
                if node.role == "visual"
                else node
                for node in graph.nodes
            ),
            back_lines=tuple(
                replace(
                    back_line,
                    active=False,
                    renderer_enabled=False,
                )
                for back_line in graph.back_lines
            ),
        )
    return replace(
        tail,
        side_notes_sprite_enabled=False,
        back_line_active=False,
        side_connection_graph=graph,
    )


def consume_slide_tail_connection_side(
    graph: SlideTailConnectionGraph,
    side: str,
) -> SlideTailConnectionGraph:
    if side not in {"left", "right"}:
        raise ValueError("side must be left or right")
    root = next(
        node for node in graph.nodes if node.node_id == graph.root_node_id
    )
    target_id = (
        root.left_visual_id if side == "left" else root.right_visual_id
    )
    if target_id is None:
        return graph
    consumed_ids = {
        node.node_id
        for node in graph.nodes
        if node.role == "visual"
        and (
            node.button_index < root.button_index
            if side == "left"
            else node.button_index > root.button_index
        )
    }
    nodes: list[SlideTailConnectionNodeState] = []
    for node in graph.nodes:
        if node.node_id in consumed_ids:
            nodes.append(
                replace(
                    node,
                    left_visual_id=None,
                    right_visual_id=None,
                    left_after_id=None,
                    right_after_id=None,
                    state="deactive",
                    sprite_enabled=False,
                    result_used=True,
                )
            )
        elif node.node_id == graph.root_node_id:
            nodes.append(
                replace(
                    node,
                    left_visual_id=(
                        None if side == "left" else node.left_visual_id
                    ),
                    right_visual_id=(
                        None if side == "right" else node.right_visual_id
                    ),
                )
            )
        else:
            nodes.append(node)
    back_lines = tuple(
        replace(
            back_line,
            active=(
                False
                if back_line.owner_node_id in consumed_ids
                else back_line.active
            ),
            renderer_enabled=(
                False
                if back_line.owner_node_id in consumed_ids
                else back_line.renderer_enabled
            ),
        )
        for back_line in graph.back_lines
    )
    root_state = next(
        node for node in nodes if node.node_id == graph.root_node_id
    )
    return replace(
        graph,
        nodes=tuple(nodes),
        back_lines=back_lines,
        active_node_order=tuple(
            node_id
            for node_id in graph.active_node_order
            if node_id not in consumed_ids
        ),
        root_side_references_active=(
            root_state.left_visual_id is not None
            or root_state.right_visual_id is not None
        ),
    )


def advance_slide_tail_connection_graph(
    graph: SlideTailConnectionGraph,
) -> SlideTailConnectionGraph:
    line_owner_node_ids = {line.owner_node_id for line in graph.back_lines}
    owner_node_ids = tuple(
        node_id
        for node_id in graph.active_node_order
        if node_id in line_owner_node_ids
    )
    for owner_node_id in owner_node_ids:
        graph = advance_slide_tail_connection_owner(graph, owner_node_id)
    return graph


def advance_slide_tail_connection_owner(
    graph: SlideTailConnectionGraph,
    owner_node_id: str,
) -> SlideTailConnectionGraph:
    node_by_id = {node.node_id: node for node in graph.nodes}
    back_lines: list[SlideTailBackLineLinkState] = []
    for back_line in graph.back_lines:
        if not back_line.active or back_line.owner_node_id != owner_node_id:
            back_lines.append(back_line)
            continue
        owner = node_by_id.get(back_line.owner_node_id)
        target = node_by_id.get(back_line.target_node_id)
        if owner is None or target is None:
            back_lines.append(back_line)
            continue
        if owner.state != "move" or target.state != "move":
            back_lines.append(
                replace(
                    back_line,
                    active=(
                        False
                        if owner.state == "deactive" or target.state == "deactive"
                        else back_line.active
                    ),
                    renderer_enabled=False,
                )
            )
            continue
        positions = tuple(
            sorted(
                (
                    (
                        owner.position[0]
                        if owner.position is not None
                        else owner.x_position
                        if owner.x_position is not None
                        else float(owner.button_index),
                        owner.position[1] if owner.position is not None else 0.0,
                        owner.z_position,
                    ),
                    (
                        target.position[0]
                        if target.position is not None
                        else target.x_position
                        if target.x_position is not None
                        else float(target.button_index),
                        target.position[1] if target.position is not None else 0.0,
                        target.z_position,
                    ),
                ),
                key=lambda position: position[0],
            )
        )
        back_lines.append(
            replace(
                back_line,
                renderer_enabled=True,
                positions=positions,
                width=owner.scale_x * 0.75,
            )
        )
    return replace(graph, back_lines=tuple(back_lines))


def advance_slide_tail_back_lines(
    tail: SlideTailRuntimeState,
) -> SlideTailRuntimeState:
    graph = tail.side_connection_graph
    if graph is None:
        return tail
    graph = advance_slide_tail_connection_graph(graph)
    return replace(
        tail,
        back_line_active=any(line.active for line in graph.back_lines),
        side_connection_graph=graph,
    )


@dataclass(frozen=True)
class NoteManagerSubstepPhaseTrace:
    substep_index: int
    active_order_before: tuple[str, ...]
    active_order_after: tuple[str, ...]
    update_order: tuple[str, ...]
    after_update_order: tuple[str, ...]
    phase_sequence: tuple[str, ...]


@dataclass(frozen=True)
class NoteManagerTwoPhaseTrace:
    slide_tail: SlideTailRuntimeState
    substeps: tuple[NoteManagerSubstepPhaseTrace, ...]


def set_slide_tail_connection_node_state(
    slide_tail: SlideTailRuntimeState,
    node_id: str,
    state: str,
) -> SlideTailRuntimeState:
    graph = slide_tail.side_connection_graph
    if graph is None:
        raise ValueError("Slide tail must expose a connection graph")
    graph = _set_slide_tail_connection_state(
        graph,
        node_id,
        state,
    )
    if node_id == graph.root_node_id:
        return replace(slide_tail, state=state, side_connection_graph=graph)
    return replace(slide_tail, side_connection_graph=graph)


def advance_note_manager_two_phase_substeps(
    slide_tail: SlideTailRuntimeState,
    update_steps: int,
    update_node: Callable[
        [int, str, SlideTailRuntimeState], SlideTailRuntimeState
    ]
    | None = None,
) -> NoteManagerTwoPhaseTrace:
    if update_steps not in {1, 2, 3, 4}:
        raise ValueError("NoteManager update steps must be in recovered range 1..4")
    graph = slide_tail.side_connection_graph
    if graph is None:
        raise ValueError("scheduled Slide tail must expose a connection graph")
    graph_node_ids = {node.node_id for node in graph.nodes}

    current_tail = slide_tail
    substep_traces: list[NoteManagerSubstepPhaseTrace] = []
    for substep_index in range(update_steps):
        graph = current_tail.side_connection_graph
        active_order_before = graph.active_node_order
        if len(set(active_order_before)) != len(active_order_before):
            raise ValueError("scheduled Note node ids must be unique")
        if not set(active_order_before).issubset(graph_node_ids):
            raise ValueError("scheduled Note node ids must exist in the connection graph")
        update_order: list[str] = []
        after_node_ids: list[str] = []
        phase_sequence: list[str] = []
        active_index = len(active_order_before) - 1
        while active_index >= 0:
            graph = current_tail.side_connection_graph
            active_node_order = graph.active_node_order
            if active_index >= len(active_node_order):
                raise IndexError(
                    "live active Note removal invalidated the native reverse index"
                )
            node_id = active_node_order[active_index]
            node_before_update = next(
                node for node in graph.nodes if node.node_id == node_id
            )
            if update_node is not None:
                updated_tail = update_node(substep_index, node_id, current_tail)
                if updated_tail.node_id != current_tail.node_id:
                    raise ValueError("NoteManager update cannot change tail identity")
                current_tail = updated_tail
            graph = current_tail.side_connection_graph
            node_after_update = next(
                node for node in graph.nodes if node.node_id == node_id
            )
            update_order.append(node_id)
            phase_sequence.append(f"update:{node_id}")
            owns_back_line = any(
                line.owner_node_id == node_id for line in graph.back_lines
            )
            if (
                node_before_update.role == "tail"
                and node_before_update.state == "move"
                and owns_back_line
            ):
                graph = advance_slide_tail_connection_owner(graph, node_id)
                current_tail = replace(
                    current_tail,
                    back_line_active=any(line.active for line in graph.back_lines),
                    side_connection_graph=graph,
                )
                phase_sequence.append(f"update_back_line:{node_id}")
            if node_after_update.state != "deactive":
                after_node_ids.append(node_id)
            active_index -= 1

        after_update_order: list[str] = []
        for node_id in after_node_ids:
            graph = current_tail.side_connection_graph
            node = next(node for node in graph.nodes if node.node_id == node_id)
            after_update_order.append(node_id)
            phase_sequence.append(f"after_update:{node_id}")
            owns_back_line = any(
                line.owner_node_id == node_id for line in graph.back_lines
            )
            if node.role == "visual" and owns_back_line:
                graph = advance_slide_tail_connection_owner(graph, node_id)
                current_tail = replace(
                    current_tail,
                    back_line_active=any(line.active for line in graph.back_lines),
                    side_connection_graph=graph,
                )
                phase_sequence.append(f"after_back_line:{node_id}")
        substep_traces.append(
            NoteManagerSubstepPhaseTrace(
                substep_index,
                active_order_before,
                current_tail.side_connection_graph.active_node_order,
                tuple(update_order),
                tuple(after_update_order),
                tuple(phase_sequence),
            )
        )
    return NoteManagerTwoPhaseTrace(
        current_tail,
        tuple(substep_traces),
    )


def consume_slide_tail_side_notes(
    tail: SlideTailRuntimeState,
    side: str,
) -> SlideTailRuntimeState:
    if side not in {"left", "right"}:
        raise ValueError("side must be left or right")
    graph = tail.side_connection_graph
    if graph is not None:
        graph = consume_slide_tail_connection_side(graph, side)
        root = next(
            node for node in graph.nodes if node.node_id == graph.root_node_id
        )
        remaining_nodes = tuple(
            node
            for node in graph.nodes
            if node.role == "visual" and not node.result_used
        )
        left_nodes = tuple(
            sorted(
                (
                    node
                    for node in remaining_nodes
                    if node.button_index < root.button_index
                ),
                key=lambda node: root.button_index - node.button_index,
            )
        )
        right_nodes = tuple(
            sorted(
                (
                    node
                    for node in remaining_nodes
                    if node.button_index > root.button_index
                ),
                key=lambda node: node.button_index - root.button_index,
            )
        )
        return replace(
            tail,
            multiple_left_count=len(left_nodes),
            multiple_right_count=len(right_nodes),
            side_notes_state=("partially_used" if remaining_nodes else "used"),
            side_notes_sprite_enabled=bool(remaining_nodes),
            back_line_active=any(line.active for line in graph.back_lines),
            left_side_z_positions=tuple(node.z_position for node in left_nodes),
            right_side_z_positions=tuple(node.z_position for node in right_nodes),
            side_connection_graph=graph,
        )
    if side == "left":
        return replace(
            tail,
            multiple_left_count=0,
            left_side_z_positions=(),
            side_notes_state=(
                "partially_used" if tail.multiple_right_count else "used"
            ),
            side_notes_sprite_enabled=tail.multiple_right_count > 0,
        )
    return replace(
        tail,
        multiple_right_count=0,
        right_side_z_positions=(),
        side_notes_state=(
            "partially_used" if tail.multiple_left_count else "used"
        ),
        side_notes_sprite_enabled=tail.multiple_left_count > 0,
    )


def change_slide_tail_side_notes_used(
    tail: SlideTailRuntimeState,
) -> SlideTailRuntimeState:
    tail = consume_slide_tail_side_notes(tail, "left")
    tail = consume_slide_tail_side_notes(tail, "right")
    return replace(tail, side_notes_state="used", side_notes_sprite_enabled=False)


@dataclass(frozen=True)
class SlideEndpointProjection:
    node_id: str
    absolute_position: float
    lane: int
    width: int
    progress: float
    state: str
    position: tuple[float, float]
    scale_x: float
    is_real_line: bool = False
    is_progress_over_line: bool = False
    is_over_line: bool = False
    kill_mesh: bool = False


@dataclass
class SlideMeshSegmentState:
    segment_id: str
    parent_note_id: str
    index: int
    front_node_id: str
    after_node_id: str
    front_absolute_position: float
    after_absolute_position: float
    front_lane: int
    after_lane: int
    front_width: int
    after_width: int
    mesh: MeshGeometry


@dataclass(frozen=True)
class GamePlayButtonParticleRoute:
    result_prefab: str | None
    result_route: str | None
    tap_keep_prefab: str | None
    stop_tap_keep: bool
    range_index: int
    directional_index: int | None = None


@dataclass
class ParticleSystemState:
    instance_id: str
    prefab_name: str
    lane: int
    route: str
    range_index: int
    active: bool = True
    playing: bool = False
    play_generation: int = 0
    stop_generation: int = 0
    clear_generation: int = 0
    last_result: str | None = None
    last_judge_note_type: int | None = None
    last_game_note_type: int | None = None
    elapsed_seconds: float = 0.0
    particle_count: int = 0
    deterministic_seed: int = 0
    origin: tuple[float, float] = (0.0, 0.0)
    scale: float = 1.0
    visible: bool = True


@dataclass(frozen=True)
class ParticlePlaybackEvent:
    instance_id: str
    prefab_name: str
    lane: int
    route: str
    result: str
    judge_note_type: int
    game_note_type: int | None
    range_index: int
    play_generation: int


def _range_particle_prefab(base_name: str, range_length: int) -> str:
    if not 1 <= range_length <= 7:
        raise ValueError("particle range length must stay inside 1..7")
    return base_name if range_length == 1 else f"{base_name}{range_length}"


def _directional_particle_index(count: int) -> int:
    if count < 0:
        raise ValueError("multiple directional Flick count cannot be negative")
    if count <= 1:
        return 0
    if count == 2:
        return 1
    return 2


def game_play_button_particle_route(
    result: str,
    judge_note_type: int,
    game_note_type: int | None,
    is_skill_note: bool = False,
    multiple_directional_flick_note_count: int = 0,
    range_length: int = 1,
) -> GamePlayButtonParticleRoute:
    result = result.lower()
    if result not in GAMEPLAY_BUTTON_PARTICLE_RESULT_VALUES:
        raise ValueError(f"unsupported GamePlayButton particle result: {result}")
    if not 1 <= range_length <= 7:
        raise ValueError("particle range length must stay inside 1..7")
    stop_tap_keep = judge_note_type in GAMEPLAY_BUTTON_LONG_STOP_JUDGE_TYPES
    tap_keep_prefab = (
        _range_particle_prefab("effect_TapKeep", range_length)
        if judge_note_type == 4
        else None
    )

    if is_skill_note:
        base_name = {
            "none": "effect_tap",
            "good": "effect_tap_skill_good",
            "great": "effect_tap_skill_great",
            "perfect": "effect_tap_skill_perfect",
        }.get(result)
        if base_name is None:
            return GamePlayButtonParticleRoute(
                None, None, tap_keep_prefab, stop_tap_keep, range_length - 1
            )
        prefab = (
            base_name
            if result == "none"
            else _range_particle_prefab(base_name, range_length)
        )
        return GamePlayButtonParticleRoute(
            prefab,
            "skill",
            tap_keep_prefab,
            stop_tap_keep,
            range_length - 1,
        )

    if judge_note_type in GAMEPLAY_BUTTON_DIRECTIONAL_JUDGE_TYPES:
        if result not in {"good", "great", "perfect"}:
            return GamePlayButtonParticleRoute(
                None, None, tap_keep_prefab, stop_tap_keep, range_length - 1
            )
        if game_note_type in GAMEPLAY_BUTTON_DIRECTIONAL_LEFT_TYPES:
            side = "l"
        elif game_note_type in GAMEPLAY_BUTTON_DIRECTIONAL_RIGHT_TYPES:
            side = "r"
        else:
            return GamePlayButtonParticleRoute(
                None, None, tap_keep_prefab, stop_tap_keep, range_length - 1
            )
        directional_index = _directional_particle_index(
            multiple_directional_flick_note_count
        )
        suffix = "" if directional_index == 0 else f"_{directional_index + 1}"
        return GamePlayButtonParticleRoute(
            f"effect_tap_directional_flick_{side}{suffix}",
            f"directional_{'left' if side == 'l' else 'right'}",
            tap_keep_prefab,
            stop_tap_keep,
            range_length - 1,
            directional_index,
        )

    if judge_note_type in GAMEPLAY_BUTTON_FLICK_JUDGE_TYPES:
        prefab = (
            _range_particle_prefab("effect_tap_swipe", range_length)
            if result in {"good", "great", "perfect"}
            else None
        )
        return GamePlayButtonParticleRoute(
            prefab,
            "flick" if prefab is not None else None,
            tap_keep_prefab,
            stop_tap_keep,
            range_length - 1,
        )

    base_name = {
        "none": "effect_tap",
        "good": "effect_tap_good",
        "great": "effect_tap_great",
        "perfect": "effect_tap_perfect",
    }.get(result)
    if base_name is None:
        return GamePlayButtonParticleRoute(
            None, None, tap_keep_prefab, stop_tap_keep, range_length - 1
        )
    prefab = (
        base_name
        if result == "none"
        else _range_particle_prefab(base_name, range_length)
    )
    return GamePlayButtonParticleRoute(
        prefab,
        "normal",
        tap_keep_prefab,
        stop_tap_keep,
        range_length - 1,
    )


def game_play_button_directional_finger_particle(
    result: str,
    game_note_type: int | None,
    current_game_state: int = 0,
    after_note_type: int = -1,
) -> tuple[str, str] | None:
    if current_game_state == MOVE_TIME_GAME_STATE:
        return None
    if result.lower() not in {"good", "great", "perfect"}:
        return None
    if after_note_type in GAMEPLAY_BUTTON_DIRECTIONAL_LEFT_AFTER_TYPES:
        return (
            "effect_tap_directional_flick_l_finger",
            "directional_finger_left",
        )
    if after_note_type in GAMEPLAY_BUTTON_DIRECTIONAL_RIGHT_AFTER_TYPES:
        return (
            "effect_tap_directional_flick_r_finger",
            "directional_finger_right",
        )
    if after_note_type != -1:
        return None
    if game_note_type in GAMEPLAY_BUTTON_DIRECTIONAL_LEFT_TYPES:
        return (
            "effect_tap_directional_flick_l_finger",
            "directional_finger_left",
        )
    if game_note_type in GAMEPLAY_BUTTON_DIRECTIONAL_RIGHT_TYPES:
        return (
            "effect_tap_directional_flick_r_finger",
            "directional_finger_right",
        )
    return None


def gameplay_button_judge_note_type(
    note: NoteSpec,
    result: str,
    phase: str,
) -> int:
    if phase == "intermediate":
        return 8
    if phase == "head":
        if note.end_position is not None:
            return 1 if result == "miss" else 4
        if "directional_flick" in note.kind:
            return 10 if note.multiple_note_count > 1 else 9
        if "flick" in note.kind:
            return 3
        return 0
    if phase != "tail":
        raise ValueError(f"unsupported particle judgement phase: {phase}")
    if result == "miss":
        return 1
    if note.end_gesture.startswith("multiple_"):
        return 7
    if note.end_gesture.startswith("directional_"):
        return 6
    if note.end_gesture == "flick":
        return 5
    return 2


@dataclass
class RenderState:
    notes: dict[str, RenderNote] = field(default_factory=dict)
    slide_nodes: dict[str, SlideNodeRenderState] = field(default_factory=dict)
    slide_tails: dict[str, SlideTailRuntimeState] = field(default_factory=dict)
    slide_segments: dict[str, SlideMeshSegmentState] = field(default_factory=dict)
    particles: list[str] = field(default_factory=list)
    particle_systems: dict[str, ParticleSystemState] = field(default_factory=dict)
    particle_events: list[ParticlePlaybackEvent] = field(default_factory=list)
    particle_samples: dict[str, list[ParticleSample]] = field(default_factory=dict)
    mesh_states: dict[str, NoteMeshRuntimeState] = field(default_factory=dict)
    sync_lines: dict[str, SyncLineGeometry] = field(default_factory=dict)
    flick_back_lines: dict[str, FlickBackLineGeometry] = field(default_factory=dict)
    field_line_skin: str = "pre_habahiro"
    habahiro_flash_playing: bool = False


@dataclass(frozen=True)
class AudioPlaybackEvent:
    time_seconds: float
    action: str
    cue_names: tuple[str, ...] = ()
    note_id: str | None = None
    volume: float = 1.0
    pitch: float = 0.0
    pan3d_distance: float = 0.0
    pan3d_angle: float = 0.0
    start_time_ms: int = 0
    fade_seconds: float = 0.0


@dataclass
class AudioState:
    music_paused: bool = False
    music_resource_id: str | None = None
    music_volume: float = 1.0
    active_holds: set[str] = field(default_factory=set)
    cues: list[str] = field(default_factory=list)
    events: list[AudioPlaybackEvent] = field(default_factory=list)


SKILL_UI_ANIMATION_PROFILES: dict[str, dict[str, object]] = {
    "LifeHealGauge": {
        "duration": 1.0,
        "loop": False,
        "curves": {
            "SpriteIcon.m_LocalScale.x": (
                (0.0, (0.0, 0.0, 2.25, 1.0)),
                (0.6666666865348816, (0.0, 0.0, 0.0, 2.5)),
            ),
            "SpriteIcon.m_LocalScale.y": (
                (0.0, (0.0, 0.0, 2.25, 1.0)),
                (0.6666666865348816, (0.0, 0.0, 0.0, 2.5)),
            ),
            "SpriteIcon.m_LocalScale.z": (
                (0.0, (0.0, 0.0, 0.0, 1.0)),
                (0.6666666865348816, (0.0, 0.0, 0.0, 1.0)),
            ),
            "SpriteBase.mColor.a": (
                (0.0, (-4.148148536682129, 3.1111114025115967, 0.6666666865348816, 0.5)),
                (0.75, (37.333335876464844, -18.666664123535156, -1.6666666269302368, 1.0)),
                (1.0, (0.0, 0.0, 0.0, 0.0)),
            ),
            "SpriteIcon.mColor.a": (
                (0.0, (0.0, 0.0, -1.5, 1.0)),
                (0.6666666865348816, (0.0, 0.0, 0.0, 0.0)),
            ),
        },
        "constants": {
            "SpriteIcon.mColor.r": 1.0,
            "SpriteIcon.mColor.g": 1.0,
            "SpriteIcon.mColor.b": 1.0,
        },
    },
    "DamageGuard": {
        "duration": 1.0,
        "loop": True,
        "curves": {
            "SpriteBase.mColor.a": (
                (0.0, (-4.148148536682129, 3.1111114025115967, 0.6666666865348816, 0.5)),
                (0.75, (37.333335876464844, -18.666664123535156, -1.6666666269302368, 1.0)),
                (1.0, (0.0, 0.0, 0.0, 0.0)),
            ),
        },
        "constants": {},
    },
    "ScoreUpGauge": {
        "duration": 0.75,
        "loop": True,
        "curves": {
            "SpriteIcon.m_LocalScale.x": (
                (0.0, (0.0, 0.0, 1.3333333730697632, 1.0)),
                (0.75, (0.0, 0.0, 0.0, 2.0)),
            ),
            "SpriteIcon.m_LocalScale.y": (
                (0.0, (0.0, 0.0, 1.3333333730697632, 1.0)),
                (0.75, (0.0, 0.0, 0.0, 2.0)),
            ),
            "SpriteIcon.m_LocalScale.z": (
                (0.0, (0.0, 0.0, 0.0, 1.0)),
                (0.75, (0.0, 0.0, 0.0, 1.0)),
            ),
            "SpriteBase.mColor.a": (
                (0.0, (-32.0, 8.0, 2.0, 0.5)),
                (0.25, (32.0, -16.0, 0.0, 1.0)),
                (0.5, (0.0, 0.0, -2.0, 0.5)),
                (0.75, (0.0, 0.0, 0.0, 0.0)),
            ),
            "SpriteIcon.mColor.a": (
                (0.0, (0.0, 0.0, -1.3333333730697632, 1.0)),
                (0.75, (0.0, 0.0, 0.0, 0.0)),
            ),
        },
        "constants": {
            "SpriteIcon.mColor.r": 1.0,
            "SpriteIcon.mColor.g": 1.0,
            "SpriteIcon.mColor.b": 1.0,
        },
    },
    "SkillAdjustEffect": {
        "duration": 0.9833333492279053,
        "loop": True,
        "curves": {
            "m_Color.a": (
                (0.0, (0.0, 0.0, -0.0, 0.699999988079071)),
                (0.25, (1.5658713579177856, -0.9134251475334167, -0.514285683631897, 0.699999988079071)),
                (0.8333333134651184, (-88.6244888305664, 13.293678283691406, 1.9999994039535522, 0.4000000059604645)),
                (0.9833333492279053, (0.0, 0.0, 0.0, 0.699999988079071)),
            ),
        },
        "constants": {
            "m_Color.r": 1.0,
            "m_Color.g": 1.0,
            "m_Color.b": 1.0,
        },
    },
}


def evaluate_streamed_animation(
    profile: dict[str, object], elapsed_seconds: float
) -> dict[str, float]:
    duration = float(profile["duration"])
    local_time = max(0.0, elapsed_seconds)
    if bool(profile["loop"]) and duration > 0.0:
        local_time %= duration
    else:
        local_time = min(local_time, duration)
    values = dict(profile["constants"])
    for channel, keys in profile["curves"].items():
        key_time, coefficients = keys[0]
        for candidate_time, candidate_coefficients in keys[1:]:
            if candidate_time > local_time:
                break
            key_time = candidate_time
            coefficients = candidate_coefficients
        delta = local_time - key_time
        coefficient_0, coefficient_1, coefficient_2, coefficient_3 = coefficients
        values[channel] = (
            ((coefficient_0 * delta + coefficient_1) * delta + coefficient_2)
            * delta
            + coefficient_3
        )
    return values


def evaluate_skill_ui_animation(
    state_name: str,
    elapsed_seconds: float,
) -> dict[str, float]:
    try:
        profile = SKILL_UI_ANIMATION_PROFILES[state_name]
    except KeyError as error:
        raise ValueError(f"unrecovered Skill UI animation: {state_name}") from error
    return evaluate_streamed_animation(profile, elapsed_seconds)


COMBO_NUMBER_SCALE_PROFILE: dict[str, object] = {
    "duration": 1.0,
    "loop": False,
    "curves": {
        "m_LocalScale.x": (
            (0.0, (-1036.800048828125, 129.60000610351562, 0.0, 0.800000011920929)),
            (0.0833333358168602, (0.0, 0.0, -1.200000286102295, 1.100000023841858)),
            (0.1666666716337204, (0.0, 0.0, 0.0, 1.0)),
        ),
        "m_LocalScale.y": (
            (0.0, (-1036.800048828125, 129.60000610351562, 0.0, 0.800000011920929)),
            (0.0833333358168602, (0.0, 0.0, -1.200000286102295, 1.100000023841858)),
            (0.1666666716337204, (0.0, 0.0, 0.0, 1.0)),
        ),
    },
    "constants": {"m_LocalScale.z": 1.0},
}


ALL_PERFECT_ALPHA_PROFILE: dict[str, object] = {
    "duration": 0.8333333134651184,
    "loop": True,
    "curves": {
        "mColor.a": (
            (0.0, (13.82400131225586, -8.640000343322754, 0.0, 1.0)),
            (0.4166666567325592, (-13.82400131225586, 8.640000343322754, 0.0, 0.5)),
            (0.8333333134651184, (0.0, 0.0, 0.0, 1.0)),
        ),
    },
    "constants": {},
}


def evaluate_combo_number_scale(elapsed_seconds: float) -> float:
    return evaluate_streamed_animation(
        COMBO_NUMBER_SCALE_PROFILE, elapsed_seconds
    )["m_LocalScale.x"]


def evaluate_all_perfect_alpha(elapsed_seconds: float) -> float:
    return evaluate_streamed_animation(
        ALL_PERFECT_ALPHA_PROFILE, elapsed_seconds
    )["mColor.a"]


def format_score_hud_digits(score: int) -> tuple[tuple[str, str], ...]:
    digits = f"{max(0, score):08d}"[-8:]
    first_number = next(
        (index for index, digit in enumerate(digits) if digit != "0"),
        len(digits) - 1,
    )
    return tuple(
        (digit, "pink" if index >= first_number else "gray")
        for index, digit in enumerate(digits)
    )


@dataclass
class SkillVisualState:
    life_heal_animation: bool = False
    damage_guard_animation: bool = False
    never_die_animation: bool = False
    life_animator_state: str | None = None
    life_gauge_sprite: str | None = None
    life_icon_sprite: str | None = None
    life_icon_color: tuple[float, float, float, float] | None = None
    life_animator_enabled: bool = False
    life_animator_elapsed: float = 0.0
    life_game_object_active: bool = False
    life_warning_blink_refreshed: bool = False
    score_up_animation: bool = False
    score_animator_state: str | None = None
    score_gauge_effect_active: bool = False
    score_animator_enabled: bool = False
    score_animator_elapsed: float = 0.0
    judge_adjust_animation: bool = False
    judge_animator_state: str | None = None
    judge_animator_enabled: bool = False
    judge_animator_elapsed: float = 0.0
    judge_game_object_active: bool = False
    psyllium_skill_mode: bool = False
    psyllium_mode: str = "normal"
    psyllium_color_source: str | None = None
    psyllium_restore_before_color: bool = False
    psyllium_restore_smooth: bool | None = None
    heal_callback_count: int = 0


@dataclass
class OneFrameData:
    is_use: bool
    index: int
    button_types: tuple[int, ...]
    add_score: float
    add_power: int
    add_combo: int
    note_type: str
    raw_result: str
    adjusted_result: str
    fever_score_up_rate: float = 1.0
    skill_score_up_rate: float = 1.0
    crescendo_score_up_rate: float = 1.0
    crescendo_skill_score_up_rate: float = 0.0
    score_up_type: int = 0
    absolute_position: float = 0.0
    damage_guard_type: int = 0
    judge_timing: str | None = None
    free_live_event_bonus_add_score: float = 0
    cached_score_up_rate: float = 1.0
    damage: int = 0
    never_die_skill: bool = False


@dataclass
class OneFrameTotalData:
    entry_count: int
    add_score: int
    add_power: int
    add_combo: int
    representative_result: str
    judge_timing: str | None
    free_live_event_bonus_add_score: int = 0
    stage_effect_level: int = 0
    score_up_type: int = 0
    crescendo_skill_score_up_rate: float = 0.0


@dataclass
class TouchBinding:
    finger_id: int
    note_id: str
    start_x: float
    move_grace: float = 8.0
    move_succeeded: bool = False


@dataclass
class HabahiroLaneChangeState:
    flash_enabled: bool
    flash_playing: bool = False
    line_image_changed: bool = False
    next_command_index: int = 0
    animation_play_count: int = 0
    change_lane_event_count: int = 0


@dataclass(frozen=True)
class SkillPlayRequest:
    skill_note_index: int
    absolute_position: float
    situation_skill_index: int
    character_index: int
    character_info_index: int
    playback_spec: "SkillPlaybackSpec | None" = None


@dataclass(frozen=True)
class SkillActivateEffectSpec:
    effect_type: str
    value_type: str = "rate"
    condition: str = "miss"
    value: float = 0.0
    condition_life: int = 0
    unification_value: float = 0.0
    unification_satisfied: bool = False
    stack_value: float = 0.0
    max_value: int = 0

    def __post_init__(self) -> None:
        if self.effect_type not in {
            "score",
            "damage",
            "heal",
            "judge",
            "score_over_life",
            "score_under_life",
            "score_continued_note_judge",
            "score_rate_up_with_perfect",
            "score_only_perfect",
            "never_die",
            "score_under_great_half",
        }:
            raise ValueError("unsupported Skill activate-effect type")
        if self.value_type not in {"none", "real_value", "rate"}:
            raise ValueError("unsupported Skill activate-effect value type")
        if self.condition not in NOTE_RESULT_RANKS:
            raise ValueError("unsupported Skill activate-effect condition")
        if not all(
            isfinite(value)
            for value in (self.value, self.unification_value, self.stack_value)
        ):
            raise ValueError("Skill activate-effect values must be finite")
        if self.condition_life < 0 or self.stack_value < 0 or self.max_value < 0:
            raise ValueError("Skill activate-effect limits cannot be negative")


def calculate_base_corrected_score(
    base_score: float,
    result: str,
    *,
    in_game_mode: int,
    is_auto_live: bool,
    result_rates: dict[str, float],
    active_effects: Iterable[SkillActivateEffectSpec] = (),
) -> float:
    if result not in NOTE_RESULT_RANKS:
        raise ValueError(f"unsupported Note result: {result}")
    score = base_score
    if in_game_mode != 5 and not is_auto_live:
        score = float(int(score * result_rates.get(result, 0.0)))
    result_rank = NOTE_RESULT_RANKS[result]
    for effect in active_effects:
        if (
            effect.effect_type == "score"
            and effect.value_type == "real_value"
            and NOTE_RESULT_RANKS[effect.condition] <= result_rank
        ):
            score += int(effect.value)
    return score


@dataclass(frozen=True)
class SkillPlaybackSpec:
    situation_skill_index: int
    skill_id: int
    duration: float
    once_effect_type: str = "none"
    once_effect_value_type: str = "none"
    once_effect_value: int = 0
    once_effect_condition_life_type: str = "none"
    once_effect_condition_life: int = 0
    activate_effects: tuple[SkillActivateEffectSpec, ...] = ()

    def __post_init__(self) -> None:
        if self.duration < 0:
            raise ValueError("skill duration cannot be negative")
        if self.once_effect_type not in {"none", "life"}:
            raise ValueError("unsupported once-effect type")
        if self.once_effect_value_type not in {"none", "real_value", "rate"}:
            raise ValueError("unsupported once-effect value type")
        if self.once_effect_condition_life_type not in {"none", "under_life"}:
            raise ValueError("unsupported once-effect life condition")
        if self.once_effect_value < 0 or self.once_effect_condition_life < 0:
            raise ValueError("skill once-effect values cannot be negative")


@dataclass
class SkillRuntimeState:
    play_list: list[SkillPlayRequest] = field(default_factory=list)
    skill_play_state: int = SKILL_PLAY_STATE_NONE
    network_played_skill_note: int | None = None
    network_skill_failed: bool = False
    current_playing_skill: SkillPlayRequest | None = None
    skill_timer: float = 0.0
    skill_finishing_timer: float = 0.0
    skill_effective_timer: float = 0.0
    game_frame_counter: int = 0
    cached_life_when_skill_played: int | None = None
    judge_continuous_result_type: str | None = None
    crescendo_skill_score_up_rate: float = 0.0
    reservation_target_frame: int | None = None
    reservation_skill_note_index: int | None = None
    reservation_is_encore: bool = False
    skill_note_states: dict[int, int] = field(default_factory=dict)
    registered_skill_note_indices: list[int] = field(default_factory=list)
    notes_info_reset_count: int = 0


@dataclass
class FeverRuntimeState:
    fever_time_state: int = 0
    fever_time_command_type: int = FEVER_COMMAND_NONE
    my_fever_point: int = 0
    last_point: int = 0
    rest_note_count: int | None = None
    team_display_indices: tuple[int, ...] = ()
    member_points: dict[int, int] = field(default_factory=dict)
    pass_conditions: dict[int, int] = field(default_factory=dict)
    reservation_target_frame: int | None = None
    reservation_command_type: int = FEVER_COMMAND_NONE
    reservation_after_state: int = FEVER_TIME_STATE_NONE


@dataclass
class BpmRuntimeState:
    basic_bpm: float
    basic_bpm_string: str
    current_bpm: float
    current_bpm_string: str
    next_bpm: float | None = None
    next_bpm_string: str | None = None
    next_command_index: int = 0
    applied_command_ids: list[str] = field(default_factory=list)


class RuntimeIntegration:
    """Fan recovered gameplay events out to UI, render, and audio state."""

    @classmethod
    def from_chart(
        cls,
        chart: GameplayChartSpec,
        **kwargs: Any,
    ) -> "RuntimeIntegration":
        return cls(
            tempo_map_from_chart(chart),
            chart.notes,
            lane_change_commands=chart.lane_change_commands,
            bpm_change_commands=chart.bpm_change_commands,
            basic_bpm=chart.start_bpm,
            basic_bpm_string=chart.start_bpm_string,
            is_multi_range=chart.is_multi_range,
            **kwargs,
        )

    def __init__(
        self,
        tempo_map: TempoMap,
        notes: Iterable[NoteSpec],
        sweet_frame: int = 0,
        score_config: ScoreConfig | None = None,
        resource_catalog: ResourceCatalog | None = None,
        render_projection: RenderProjectionConfig | None = None,
        lane_change_commands: Iterable[LaneChangeCommandSpec] = (),
        bpm_change_commands: Iterable[BpmChangeCommandSpec] = (),
        basic_bpm: float | None = None,
        basic_bpm_string: str = "",
        in_game_mode: int = 1,
        is_auto_live: bool = False,
        judgement_adjust_value_b: int | None = None,
        difficulty: str = "expert",
        skill_chara_list: tuple[int, ...] = (),
        skill_playback_specs: Iterable[SkillPlaybackSpec] = (),
        skill_se_cue_ids: tuple[str | None, str | None] = SKILL_SE_CUE_IDS,
        is_enable_practice: bool = False,
        player_max_life: int = 1_000,
        my_display_index: int = 0,
        game_state: int = 4,
        fever_time_state: int = 0,
        fever_team_display_indices: tuple[int, ...] = (),
        deck_score_parameters: Iterable[DeckScoreParameters] | None = None,
        music_score_level: int | None = None,
        free_live_event_bonus_total_parameter: float = 0.0,
        free_live_event_bonus_deck_profile: FreeLiveEventBonusDeckProfile | None = None,
        is_multi_play_game_over: bool = False,
        is_single_play_game_over: bool = False,
        is_collabo_original_music: bool = False,
        is_multi_range: bool = False,
        all_perfect_status_display_mode: bool = False,
        enable_to_show_fast_slow: bool = True,
        master_volume: float = 1.0,
        se_option_volume: float = 1.0,
        bgm_option_volume: float = 1.0,
        bgm_resource_id: str | None = None,
    ) -> None:
        if (
            master_volume < 0.0
            or se_option_volume < 0.0
            or bgm_option_volume < 0.0
        ):
            raise ValueError("audio option volumes cannot be negative")
        self.master_volume = master_volume
        self.se_option_volume = se_option_volume
        self.bgm_option_volume = bgm_option_volume
        self.bgm_resource_id = bgm_resource_id
        resolved_render_projection = render_projection or RenderProjectionConfig()
        resolved_adjust_value_b = (
            resolved_render_projection.slide_adjust_value_b
            if judgement_adjust_value_b is None
            else judgement_adjust_value_b
        )
        if not -5 <= resolved_adjust_value_b <= 5:
            raise ValueError("JudgementAdjustValueB must be in recovered range -5..5")
        if resolved_render_projection.slide_adjust_value_b != resolved_adjust_value_b:
            resolved_render_projection = replace(
                resolved_render_projection,
                slide_adjust_value_b=resolved_adjust_value_b,
            )
        self.render_projection = resolved_render_projection
        self.judgement_adjust_value_b = resolved_adjust_value_b
        self.is_multi_range = is_multi_range
        self.enable_to_show_fast_slow = enable_to_show_fast_slow
        self.note_skin_profile = "habahiro" if is_multi_range else "normal"
        resolved_notes = tuple(notes)
        if (deck_score_parameters is None) != (music_score_level is None):
            raise ValueError(
                "deck score parameters and music score level must be supplied together"
            )
        self.base_score_profile: BaseScoreProfile | None = None
        if deck_score_parameters is not None and music_score_level is not None:
            self.base_score_profile = initialize_base_scores(
                deck_score_parameters,
                music_score_level,
                resolved_notes,
                free_live_event_bonus_total_parameter,
                free_live_event_bonus_deck_profile,
            )
            resolved_notes = tuple(
                replace(
                    note,
                    base_score=self.base_score_profile.base_score,
                    free_live_event_bonus_base_score=(
                        self.base_score_profile.free_live_event_bonus_base_score
                    ),
                )
                for note in resolved_notes
            )
        self.notes = tuple(sorted(resolved_notes, key=lambda note: note.position))
        self.lane_change_commands = tuple(
            sorted(lane_change_commands, key=lambda command: command.position)
        )
        self.bpm_change_commands = tuple(
            sorted(
                bpm_change_commands,
                key=lambda command: (
                    command.position,
                    command.source_order,
                ),
            )
        )
        if len(self.lane_change_commands) > 1:
            raise ValueError(
                "recovered ButtonManager supports one HABAHIRO lane-change command"
            )
        if any(command.additional_type != 4 for command in self.lane_change_commands):
            raise ValueError("lane-change command must use additional type 4")
        if any(command.position < 0 for command in self.lane_change_commands):
            raise ValueError("lane-change command position cannot be negative")
        if any(command.position < 0 for command in self.bpm_change_commands):
            raise ValueError("BPM-change command position cannot be negative")
        if any(command.bpm <= 0 for command in self.bpm_change_commands):
            raise ValueError("BPM-change command BPM must be positive")
        if len({command.position for command in self.bpm_change_commands}) != len(
            self.bpm_change_commands
        ):
            raise ValueError(
                "recovered activation keeps only the first BPM command per batch"
            )
        resolved_basic_bpm = (
            tempo_map.changes[0].bpm if basic_bpm is None else basic_bpm
        )
        if resolved_basic_bpm <= 0:
            raise ValueError("basic BPM must be positive")
        if basic_bpm is not None and tempo_map.changes[0].bpm != basic_bpm:
            raise ValueError("tempo map start must match the basic BPM")
        for command in self.bpm_change_commands:
            if tempo_map.bpm_at(command.position) != command.bpm:
                raise ValueError(
                    f"tempo map does not contain BPM command {command.command_id}"
                )
        self._notes_by_id = {note.note_id: note for note in self.notes}
        if len(self._notes_by_id) != len(self.notes):
            raise ValueError("note ids must be unique")
        normalized_difficulty = difficulty.lower()
        if normalized_difficulty not in FEVER_NOTE_POINT_TABLE:
            raise ValueError(f"unsupported difficulty: {difficulty}")
        self.in_game_mode = in_game_mode
        self.is_auto_live = is_auto_live
        self.is_multi_play_game_over = is_multi_play_game_over
        self.is_single_play_game_over = is_single_play_game_over
        self.is_collabo_original_music = is_collabo_original_music
        self.difficulty = normalized_difficulty
        self.skill_chara_list = tuple(skill_chara_list)
        playback_specs = tuple(skill_playback_specs)
        self.skill_playback_specs = {
            spec.situation_skill_index: spec for spec in playback_specs
        }
        if len(self.skill_playback_specs) != len(playback_specs):
            raise ValueError("skill playback situation indices must be unique")
        if len(skill_se_cue_ids) != 2:
            raise ValueError("skill SE cue ids must contain primary and secondary")
        if player_max_life <= 0:
            raise ValueError("player max life must be positive")
        self.skill_se_cue_ids = skill_se_cue_ids
        self.is_enable_practice = is_enable_practice
        self.player_max_life = player_max_life
        self.my_display_index = my_display_index
        self.game_state = game_state
        self.skill_runtime = SkillRuntimeState()
        if fever_time_state not in {
            FEVER_TIME_STATE_NONE,
            FEVER_TIME_STATE_LEVEL_ONE,
            FEVER_TIME_STATE_FAILED,
        }:
            raise ValueError("unsupported Fever time state")
        resolved_fever_team = fever_team_display_indices or (my_display_index,)
        if len(set(resolved_fever_team)) != len(resolved_fever_team):
            raise ValueError("Fever team display indices must be unique")
        if any(index < 0 for index in resolved_fever_team):
            raise ValueError("Fever team display indices cannot be negative")
        if my_display_index not in resolved_fever_team:
            raise ValueError("Fever team must include the local display index")
        self.fever_runtime = FeverRuntimeState(
            fever_time_state=fever_time_state,
            team_display_indices=tuple(resolved_fever_team),
            member_points={index: 0 for index in resolved_fever_team},
            pass_conditions={
                index: FEVER_TIME_STATE_NONE for index in resolved_fever_team
            },
        )
        self.bpm_runtime = BpmRuntimeState(
            basic_bpm=resolved_basic_bpm,
            basic_bpm_string=basic_bpm_string or str(resolved_basic_bpm),
            current_bpm=resolved_basic_bpm,
            current_bpm_string=basic_bpm_string or str(resolved_basic_bpm),
        )
        self._update_next_bpm()
        self._root_skill_note_ids = {
            note.note_id
            for note in self.notes
            if note.game_note_additional_type == 2
            and skill_note_enabled(
                in_game_mode,
                note.skill_note_index,
                self.skill_chara_list,
                my_display_index,
            )
        }
        self._root_fever_note_ids = {
            note.note_id
            for note in self.notes
            if note.game_note_additional_type == 1 and fever_time_state == 0
        }
        self._tail_fever_note_ids = {
            note.note_id
            for note in self.notes
            if note.end_game_note_additional_type == 1 and fever_time_state == 0
        }
        side_node_ids: set[str] = set()
        for note in self.notes:
            if not 1 <= note.width <= 7:
                raise ValueError("note width must be in recovered range 1..7")
            if note.end_width is not None and not 1 <= note.end_width <= 7:
                raise ValueError("slide end width must be in recovered range 1..7")
            if note.intermediate_widths and any(
                not 1 <= width <= 7 for width in note.intermediate_widths
            ):
                raise ValueError(
                    "slide intermediate widths must be in recovered range 1..7"
                )
            if note.sync_target_id is not None and (
                note.sync_target_id == note.note_id
                or note.sync_target_id not in self._notes_by_id
            ):
                raise ValueError("sync target must reference another note")
            if note.sync_edge_margin < 0.0:
                raise ValueError("sync edge margin cannot be negative")
            if note.flick_back_line_target_id is not None:
                if (
                    note.flick_back_line_target_id == note.note_id
                    or note.flick_back_line_target_id not in self._notes_by_id
                ):
                    raise ValueError("Flick back-line target must reference another note")
                multiple_flick_back_line_side(
                    note.game_note_type,
                    note.after_note_type,
                )
            if note.intermediate_positions and (
                note.end_position is None
                or any(
                    position <= note.position or position >= note.end_position
                    for position in note.intermediate_positions
                )
                or any(
                    next_position <= current_position
                    for current_position, next_position in zip(
                        note.intermediate_positions,
                        note.intermediate_positions[1:],
                    )
                )
            ):
                raise ValueError(
                    "slide intermediate positions must increase between head and tail"
                )
            for values, label in (
                (note.intermediate_lanes, "lanes"),
                (note.intermediate_widths, "widths"),
                (note.intermediate_invisible, "visibility flags"),
            ):
                if values and len(values) != len(note.intermediate_positions):
                    raise ValueError(
                        f"slide intermediate {label} must match intermediate positions"
                    )
            if note.end_gesture not in {
                "release",
                "flick",
                "directional_left",
                "directional_right",
                "multiple_left",
                "multiple_right",
            }:
                raise ValueError(f"unsupported end gesture: {note.end_gesture}")
            if note.multiple_note_count < 1:
                raise ValueError("multiple note count must be positive")
            if note.multiple_left_count < 0 or note.multiple_right_count < 0:
                raise ValueError("multiple directional side counts cannot be negative")
            if note.multiple_side_nodes:
                if note.kind != "slide" or note.end_position is None:
                    raise ValueError(
                        "multiple directional side graph requires a Slide tail"
                    )
                current_ids = {node.node_id for node in note.multiple_side_nodes}
                if (
                    len(current_ids) != len(note.multiple_side_nodes)
                    or current_ids & side_node_ids
                    or current_ids & self._notes_by_id.keys()
                ):
                    raise ValueError(
                        "multiple directional side node ids must be globally unique"
                    )
                side_node_ids.update(current_ids)
                tail_game_note_type = (
                    note.end_game_note_type
                    if note.end_game_note_type is not None
                    else note.game_note_type
                )
                if tail_game_note_type is None:
                    raise ValueError(
                        "multiple directional side graph requires terminal GameNoteType"
                    )
                graph = build_slide_tail_connection_graph(
                    f"{note.note_id}:tail",
                    note.end_lane if note.end_lane is not None else note.lane,
                    tail_game_note_type,
                    note.multiple_side_nodes,
                    root_source_order=note.end_source_order,
                    button_x=self.render_projection.button_center_x,
                )
                derived_left_count = sum(
                    node.role == "visual"
                    and node.button_index
                    < (note.end_lane if note.end_lane is not None else note.lane)
                    for node in graph.nodes
                )
                derived_right_count = len(note.multiple_side_nodes) - derived_left_count
                if note.multiple_left_count not in (0, derived_left_count) or (
                    note.multiple_right_count not in (0, derived_right_count)
                ):
                    raise ValueError(
                        "flattened side counts disagree with the connection graph"
                    )
        for note in self.notes:
            for connection in note.sync_connections:
                if connection.owner.note_id != note.note_id:
                    raise ValueError(
                        "sync connection must be stored on its owner note"
                    )
                if (
                    connection.target.note_id == note.note_id
                    or connection.target.note_id not in self._notes_by_id
                ):
                    raise ValueError(
                        "sync connection target must reference another note"
                    )
                for endpoint in (connection.owner, connection.target):
                    if endpoint.endpoint not in SYNC_ENDPOINT_NAMES:
                        raise ValueError("unsupported sync endpoint")
                    endpoint_note = self._notes_by_id[endpoint.note_id]
                    if (
                        endpoint.endpoint.startswith("end")
                        and endpoint_note.end_position is None
                    ):
                        raise ValueError("end sync endpoint requires a note end")
                    if endpoint.node_id is not None and endpoint.node_id not in {
                        node.node_id for node in endpoint_note.multiple_side_nodes
                    }:
                        raise ValueError(
                            "sync endpoint node must belong to its note"
                        )
                if connection.edge_margin < 0.0:
                    raise ValueError("sync connection edge margin cannot be negative")
        self.engine = EngineHarness(
            tempo_map,
            (note.position for note in self.notes),
            (),
        )
        self.hud = HudState(
            life=player_max_life,
            max_life=player_max_life,
            life_visual=build_life_hud_visual_state(
                player_max_life,
                player_max_life,
            ),
            score_visible=True,
            combo_visual=ComboHudVisualState(
                normal_visible=False,
                normal_scale_elapsed=0.0,
                all_perfect_enabled=all_perfect_status_display_mode,
                all_perfect_status=1 if all_perfect_status_display_mode else 0,
                all_perfect_scale_elapsed=0.0,
            ),
        )
        self.render = RenderState()
        self._particle_profile_library = default_particle_profile_library()
        self._particle_simulations: dict[str, ParticlePrefabSimulation] = {}
        self.habahiro_lane_change = HabahiroLaneChangeState(
            flash_enabled=bool(self.lane_change_commands)
        )
        for note in self.notes:
            if note.end_position is None:
                continue
            if note.kind == "long":
                self.render.mesh_states[note.note_id] = NoteMeshRuntimeState()
            elif note.kind == "slide":
                for index in range(len(note.intermediate_positions) + 1):
                    self.render.mesh_states[
                        slide_segment_id(note.note_id, index)
                    ] = NoteMeshRuntimeState()
        self.audio = AudioState(
            music_resource_id=bgm_resource_id,
            music_volume=judge_audio_player_profile().channel_volume(
                master_volume,
                bgm_option_volume,
            ),
        )
        self.skill_visuals = SkillVisualState()
        self.events: list[GameplayEvent] = []
        self._judged: set[str] = set()
        self._started_holds: set[str] = set()
        self._owned_notes: dict[str, int] = {}
        self._touches: dict[int, TouchBinding] = {}
        self._intermediate_index: dict[str, int] = {
            note.note_id: 0 for note in self.notes if note.intermediate_positions
        }
        self._judged_intermediate_nodes: set[tuple[str, float]] = set()
        self._slide_stop_adjustment_counters: dict[tuple[str, float], int] = {}
        self._slide_stop_frame_counters: dict[tuple[str, float], float] = {}
        self._sequence = 0
        self._frame_data: list[OneFrameData] = []
        self._frame_data_index = 0
        self._defer_reflection = 0
        self.last_frame_total: OneFrameTotalData | None = None
        self._next_add_score_visual = 0
        self._next_add_score_depth = 0
        self.score_config = score_config or ScoreConfig()
        self.resource_catalog = resource_catalog
        self.fever_score_up_rate = (
            FEVER_LEVEL_ONE_SCORE_RATE
            if fever_time_state == FEVER_TIME_STATE_LEVEL_ONE
            else 1.0
        )
        self.skill_score_up_rate = 1.0
        self.crescendo_score_up_rate = 1.0
        self.never_die_skill = False
        self.sweet_frame = sweet_frame
        self.note_manager_performance = NoteManagerPerformanceState()
        self._flick_icon_elapsed_seconds = 0.0

    def update(self, delta_time: float) -> None:
        if self.engine.paused:
            return
        self._update_combo_hud_clocks(delta_time)
        self._update_score_result_hud_clocks(delta_time)
        self._update_skill_visual_clocks(delta_time)
        self._flick_icon_elapsed_seconds += delta_time
        self.note_manager_performance = advance_note_manager_performance(
            self.note_manager_performance,
            delta_time,
            len(self.bpm_change_commands),
        )
        before = self.engine.clock.music_position
        self.engine.update(delta_time)
        after = self.engine.clock.music_position
        self._update_particle_simulations(delta_time)
        self._update_skill_playback(delta_time)
        self._apply_bpm_changes(after)
        self._start_habahiro_lane_change(after)
        self._refresh_visible_notes(after, delta_time)
        self._resolve_auto_live_notes(after)
        for note in self.notes:
            if note.note_id in self._judged:
                continue
            if note.note_id in self._started_holds:
                if self.is_auto_live and note.kind in AUTO_LIVE_HOLD_NOTE_KINDS:
                    continue
                self._expire_intermediate_nodes(note, after, delta_time)
                if (
                    note.end_position is not None
                    and after > note.end_position
                ):
                    if note.kind == "slide":
                        self._expire_slide_tail(note, after, delta_time)
                    elif self._frame_distance_at(note.end_position, after) >= sweet_frame_limit(1):
                        self._resolve(note, "miss", "slow", phase="tail")
                continue
            if after > note.position and self._frame_distance(note, after) >= sweet_frame_limit(
                self.sweet_frame
            ):
                self._resolve(note, "miss", "slow", phase="head")

    def _resolve_auto_live_notes(self, music_position: float) -> None:
        if not self.is_auto_live:
            return
        adjusted_position = self.engine.tempo_map.offset_frames(
            music_position,
            self.judgement_adjust_value_b,
        )
        with self.input_frame():
            for note in self.notes:
                if note.note_id in self._judged:
                    continue
                if note.note_id not in self._started_holds:
                    if adjusted_position < note.position:
                        continue
                    if (
                        note.end_position is None
                        and note.kind in AUTO_LIVE_SINGLE_NOTE_KINDS
                    ) or (
                        note.end_position is not None
                        and note.kind in AUTO_LIVE_HOLD_NOTE_KINDS
                    ):
                        self._resolve(note, "perfect", None, phase="head")
                    continue
                if note.kind == "slide":
                    intermediate_index = self._intermediate_index.get(
                        note.note_id,
                        0,
                    )
                    if intermediate_index < len(note.intermediate_positions):
                        node_position = note.intermediate_positions[
                            intermediate_index
                        ]
                        if adjusted_position >= node_position:
                            self._intermediate_index[note.note_id] = (
                                intermediate_index + 1
                            )
                            self._apply_intermediate_result(
                                note,
                                node_position,
                                "perfect",
                                None,
                            )
                        continue
                if (
                    note.kind in AUTO_LIVE_HOLD_NOTE_KINDS
                    and note.end_position is not None
                    and adjusted_position >= note.end_position
                ):
                    self._resolve(note, "perfect", None, phase="tail")

    def habahiro_change_lane_animation_event(self) -> bool:
        if (
            self.engine.paused
            or not self.habahiro_lane_change.flash_playing
            or self.habahiro_lane_change.line_image_changed
        ):
            return False
        self.habahiro_lane_change.line_image_changed = True
        self.habahiro_lane_change.change_lane_event_count += 1
        self.render.field_line_skin = "habahiro"
        command = self.lane_change_commands[
            self.habahiro_lane_change.next_command_index - 1
        ]
        self._emit(
            "lane_change_applied",
            command_id=command.command_id,
            lane=command.source_lane,
            position=command.position,
        )
        return True

    def touch_began(self, finger_id: int, lane: int, x: float = 0.0) -> str | None:
        """Acquire the nearest hittable note for a lane, matching Began arbitration."""
        if self.engine.paused or finger_id in self._touches:
            return None
        position = self.engine.clock.music_position
        candidates = []
        for note in self.notes:
            if note.note_id in self._judged or note.note_id in self._owned_notes:
                continue
            if not (note.lane <= lane < note.lane + note.width):
                continue
            result, timing = self._result_for(note, position)
            if result is not None:
                candidates.append((abs(note.position - position), note, result, timing))
        if not candidates:
            self._record_audio_event("tap:empty", "control")
            return None
        _, note, result, timing = min(candidates, key=lambda item: item[0])
        self._owned_notes[note.note_id] = finger_id
        self._touches[finger_id] = TouchBinding(finger_id, note.note_id, x)
        if "flick" not in note.kind:
            self._resolve(note, result, timing, phase="head")
            if note.end_position is None:
                self.touch_ended(finger_id)
        return note.note_id

    def touch_moved(
        self,
        finger_id: int,
        x: float,
        inside_lane: bool = True,
        delta_time: float = FRAME_SECONDS,
    ) -> bool:
        binding = self._touches.get(finger_id)
        if binding is None:
            return False
        note = self._notes_by_id[binding.note_id]
        binding.move_grace = 8.0 if inside_lane else binding.move_grace - delta_time
        if note.note_id in self._started_holds:
            if self._judge_intermediate_node(note):
                return True
            if self._intermediate_index.get(note.note_id, 0) < len(
                note.intermediate_positions
            ):
                return False
            return self._try_complete_end_gesture(binding, note, x)
        distance = x - binding.start_x
        threshold = 0.01 if note.kind.startswith("directional_flick") else 0.04
        if note.kind == "directional_flick_left" and distance >= -threshold:
            return False
        if note.kind == "directional_flick_right" and distance <= threshold:
            return False
        if note.kind == "flick" and abs(distance) <= threshold:
            return False
        result, timing = self._result_for(note, self.engine.clock.music_position)
        if result is None:
            return False
        self._resolve(note, result, timing, phase="head")
        self.touch_ended(finger_id)
        return True

    def touch_ended(self, finger_id: int) -> str | None:
        binding = self._touches.pop(finger_id, None)
        if binding is None:
            return None
        self._owned_notes.pop(binding.note_id, None)
        note = self._notes_by_id[binding.note_id]
        if note.note_id not in self._started_holds or note.end_position is None:
            return None
        result, timing = self._result_for_position(
            note.end_position, self.engine.clock.music_position, sweet_frame=1
        )
        if binding.move_grace <= 0:
            result, timing = None, None
        if note.end_gesture != "release" and not binding.move_succeeded:
            result, timing = None, None
        self._resolve(
            note,
            result or "miss",
            timing if result is not None else "fast",
            phase="tail",
        )
        return result or "miss"

    def _try_complete_end_gesture(
        self, binding: TouchBinding, note: NoteSpec, x: float
    ) -> bool:
        if note.end_gesture == "release" or binding.move_grace <= 0:
            return False
        result, _ = self._result_for_position(
            note.end_position or note.position,
            self.engine.clock.music_position,
            sweet_frame=1,
        )
        if result is None:
            return False
        distance = x - binding.start_x
        required = 0.04
        direction = 0
        if note.end_gesture.startswith("directional_"):
            required = 0.01
            direction = -1 if note.end_gesture.endswith("left") else 1
        elif note.end_gesture.startswith("multiple_"):
            required = (note.multiple_note_count - 1) * 0.01 + 0.01
            direction = -1 if note.end_gesture.endswith("left") else 1
        if direction < 0 and distance >= -required:
            return False
        if direction > 0 and distance <= required:
            return False
        if direction == 0 and abs(distance) <= required:
            return False
        binding.move_succeeded = True
        self._emit(
            "synthetic_touch_end",
            note_id=note.note_id,
            note_kind=note.kind,
            lane=note.lane,
            position=note.end_position,
            phase="tail",
        )
        self.touch_ended(binding.finger_id)
        return True

    def _judge_intermediate_node(self, note: NoteSpec) -> bool:
        index = self._intermediate_index.get(note.note_id, 0)
        if index >= len(note.intermediate_positions):
            return False
        node_position = note.intermediate_positions[index]
        result, timing = self._result_for_position(
            node_position, self.engine.clock.music_position, self.sweet_frame
        )
        if result != "perfect":
            return False
        self._intermediate_index[note.note_id] = index + 1
        self._apply_intermediate_result(note, node_position, result, timing)
        return True

    def apply_slide_after_miss(
        self,
        note_id: str,
        node_position: float,
        miss_type: int,
    ) -> bool:
        """Submit the shared onMissAfterNote path with its callback reason."""
        note = self._notes_by_id[note_id]
        if note.kind != "slide" or node_position not in note.intermediate_positions:
            raise ValueError("Slide After miss target is not an intermediate node")
        miss_name = slide_after_miss_type(miss_type)
        applied = self._apply_intermediate_result(
            note,
            node_position,
            "miss",
            "slow",
            slide_miss_type=miss_name,
            slide_miss_code=miss_type,
        )
        if applied:
            node_index = note.intermediate_positions.index(node_position)
            self._intermediate_index[note.note_id] = max(
                self._intermediate_index[note.note_id], node_index + 1
            )
        return applied

    def _expire_intermediate_nodes(
        self,
        note: NoteSpec,
        position: float,
        delta_time: float,
    ) -> None:
        index = self._intermediate_index.get(note.note_id, 0)
        while index < len(note.intermediate_positions):
            node_position = note.intermediate_positions[index]
            node_id = f"{note.note_id}:intermediate:{index}"
            render_node = self.render.slide_nodes.get(node_id)
            if (
                position <= node_position
                or render_node is None
                or render_node.state not in {"stop", "waiting_deactive"}
            ):
                break
            visible_after_position = note.end_position
            for after_index in range(index + 1, len(note.intermediate_positions)):
                is_invisible = (
                    note.intermediate_invisible[after_index]
                    if note.intermediate_invisible
                    else False
                )
                if not is_invisible:
                    visible_after_position = note.intermediate_positions[after_index]
                    break
            node_key = (note.note_id, node_position)
            stop_state = evaluate_slide_stop_miss(
                current_state=(
                    "stop"
                    if render_node.stop_action == "waiting_deactive"
                    else render_node.state
                ),
                has_judge=node_key in self._judged_intermediate_nodes,
                has_after_note=True,
                visible_after_state=(
                    "stop" if render_node.stop_action == "waiting_deactive" else "move"
                ),
                judgement_adjust_value_b=self.render_projection.slide_adjust_value_b,
                adjustment_counter=self._slide_stop_adjustment_counters.get(node_key, 0),
                root_game_note_type=note.game_note_type,
                frame_counter=self._slide_stop_frame_counters.get(node_key, 0.0),
                execute_frame=delta_time / FRAME_SECONDS,
                elapsed_seconds=signed_seconds_between_positions(
                    self.engine.tempo_map, node_position, position
                ),
                elapsed_distance=position - node_position,
                visible_after_remaining_distance=(
                    visible_after_position - position
                    if visible_after_position is not None
                    else None
                ),
            )
            self._slide_stop_adjustment_counters[node_key] = (
                stop_state.adjustment_counter
            )
            self._slide_stop_frame_counters[node_key] = stop_state.frame_counter
            if stop_state.miss_code is None:
                break
            self.apply_slide_after_miss(note.note_id, node_position, stop_state.miss_code)
            index += 1
            self._intermediate_index[note.note_id] = index

    def _apply_intermediate_result(
        self,
        note: NoteSpec,
        node_position: float,
        result: str,
        timing: str | None,
        slide_miss_type: str | None = None,
        slide_miss_code: int | None = None,
    ) -> bool:
        node_key = (note.note_id, node_position)
        if node_key in self._judged_intermediate_nodes:
            return False
        self._judged_intermediate_nodes.add(node_key)
        node_index = note.intermediate_positions.index(node_position)
        segment_id = slide_segment_id(note.note_id, node_index)
        self.render.slide_segments.pop(segment_id, None)
        mesh_state = self.render.mesh_states.get(segment_id)
        if mesh_state is not None:
            self.render.mesh_states[segment_id] = hide_note_mesh_renderer(mesh_state)
        self.render.slide_nodes = {
            node_id: node
            for node_id, node in self.render.slide_nodes.items()
            if not (
                node.parent_note_id == note.note_id
                and node.absolute_position == node_position
            )
        }
        raw_result = result
        result = self._correct_result_with_skill(raw_result)
        self._submit_frame_data(
            note,
            raw_result,
            result,
            timing,
            "intermediate",
            note.miss_damage // 5 if result == "miss" else 0,
            node_position,
        )
        self._play_gameplay_button_particles(
            note,
            result,
            "intermediate",
            node_position=node_position,
        )
        self.render.particles.append(f"judge:{note.lane}:intermediate:{result}")
        self._emit(
            "judge",
            note_id=note.note_id,
            note_kind=note.kind,
            lane=note.lane,
            position=node_position,
            result=result,
            timing=timing,
            phase="intermediate",
            slide_miss_type=slide_miss_type,
            slide_miss_code=slide_miss_code,
        )
        return True

    def _expire_slide_tail(
        self,
        note: NoteSpec,
        position: float,
        delta_time: float,
    ) -> None:
        if note.end_position is None or self._intermediate_index.get(
            note.note_id, 0
        ) < len(note.intermediate_positions):
            return
        tail = self.render.slide_tails.get(note.note_id)
        if tail is None or tail.state != "stop":
            return
        tail_key = (note.note_id, note.end_position)
        stop_state = evaluate_slide_stop_miss(
            current_state=tail.state,
            has_judge=note.note_id in self._judged,
            has_after_note=False,
            visible_after_state=None,
            judgement_adjust_value_b=self.render_projection.slide_adjust_value_b,
            adjustment_counter=self._slide_stop_adjustment_counters.get(tail_key, 0),
            root_game_note_type=note.game_note_type,
            frame_counter=self._slide_stop_frame_counters.get(tail_key, 0.0),
            execute_frame=note_manager_execute_frame(delta_time),
            elapsed_seconds=signed_seconds_between_positions(
                self.engine.tempo_map, note.end_position, position
            ),
            elapsed_distance=position - note.end_position,
            visible_after_remaining_distance=None,
        )
        self._slide_stop_adjustment_counters[tail_key] = stop_state.adjustment_counter
        self._slide_stop_frame_counters[tail_key] = stop_state.frame_counter
        tail.frame_counter = stop_state.frame_counter
        tail.miss_type = stop_state.miss_type
        tail.miss_code = stop_state.miss_code
        if stop_state.miss_code is not None:
            self._resolve(
                note,
                "miss",
                "slow",
                phase="tail",
                slide_miss_type=stop_state.miss_type,
                slide_miss_code=stop_state.miss_code,
            )

    def pause(self) -> None:
        if self.engine.paused:
            return
        self.engine.paused = True
        self.audio.music_paused = True
        self._emit("pause")
        self._record_audio_event("music:pause", "control")

    def _record_audio_event(
        self,
        legacy_cue: str,
        action: str,
        cue_names: tuple[str, ...] = (),
        note_id: str | None = None,
        requested_volume: float = 1.0,
        pitch: float = 0.0,
        pan: float = 0.0,
        seek_time_ms: int = 0,
        fade_seconds: float = 0.0,
    ) -> None:
        if fade_seconds < 0.0:
            raise ValueError("audio fade duration cannot be negative")
        playback = judge_audio_player_profile().resolve_se_playback(
            self.master_volume,
            self.se_option_volume,
            requested_volume,
            pitch,
            pan,
            seek_time_ms,
        )
        self.audio.cues.append(legacy_cue)
        self.audio.events.append(
            AudioPlaybackEvent(
                time_seconds=self.engine.clock.in_game_seconds,
                action=action,
                cue_names=cue_names,
                note_id=note_id,
                volume=playback.volume,
                pitch=playback.pitch,
                pan3d_distance=playback.pan3d_distance,
                pan3d_angle=playback.pan3d_angle,
                start_time_ms=playback.start_time_ms,
                fade_seconds=fade_seconds,
            )
        )

    def _refresh_life_hud_visual_state(self) -> None:
        self.hud.life_visual = build_life_hud_visual_state(
            self.hud.life,
            self.hud.max_life,
            self.skill_visuals.damage_guard_animation,
        )

    def _update_skill_visual_clocks(self, delta_time: float) -> None:
        if delta_time < 0.0:
            raise ValueError("Skill visual delta time cannot be negative")
        if self.skill_visuals.life_animator_enabled:
            self.skill_visuals.life_animator_elapsed += delta_time
        if self.skill_visuals.score_animator_enabled:
            self.skill_visuals.score_animator_elapsed += delta_time
        if self.skill_visuals.judge_animator_enabled:
            self.skill_visuals.judge_animator_elapsed += delta_time

    def resume(self) -> None:
        if not self.engine.paused:
            return
        self.audio.music_paused = False
        self._record_audio_event("music:resume", "control")
        self.engine.paused = False
        self._emit("resume")

    @contextmanager
    def input_frame(self):
        self._defer_reflection += 1
        try:
            yield self
        finally:
            self._defer_reflection -= 1
            if self._defer_reflection == 0:
                self.reflect_one_frame_data()

    def reflect_one_frame_data(self) -> OneFrameTotalData | None:
        entries = [entry for entry in self._frame_data if entry.is_use]
        if not entries:
            return None
        previous_combo = self.hud.combo
        self.hud.add_score = 0
        free_live_event_bonus_add_score = 0
        stage_effect_level = 0
        for entry in entries:
            entry.is_use = False
            self.hud.combo = (
                self.hud.combo + entry.add_combo if entry.add_combo > 0 else 0
            )
            combo_rate = self.score_config.combo_rate_for_frame(
                self.hud.combo,
                entry.button_types,
                self.in_game_mode,
                self.is_auto_live,
            )
            combo_corrected = int(entry.add_score * combo_rate)
            corrected_score = int(
                combo_corrected
                * entry.cached_score_up_rate
                * entry.crescendo_score_up_rate
            )
            free_live_combo_corrected = int(
                entry.free_live_event_bonus_add_score * combo_rate
            )
            corrected_free_live_event_bonus_score = int(
                free_live_combo_corrected
                * entry.cached_score_up_rate
                * entry.crescendo_score_up_rate
            )
            if self.in_game_mode == IN_GAME_MODE_MULTI_TEAM_LIVE_FESTIVAL:
                stage_rate, entry_stage_effect_level = (
                    self.score_config.team_live_stage_effect(
                        entry.adjusted_result,
                        self.hud.combo,
                        self.hud.life,
                        entry.add_score,
                    )
                )
                corrected_score = int(corrected_score * stage_rate)
                stage_effect_level = max(
                    stage_effect_level,
                    entry_stage_effect_level,
                )
            self._update_one_note_max_score(
                self.hud.one_note_max_score,
                corrected_score,
                entry,
            )
            self._update_one_note_max_score(
                self.hud.free_live_event_bonus_one_note_max_score,
                corrected_free_live_event_bonus_score,
                entry,
            )
            self.hud.score += corrected_score
            self.hud.add_score += corrected_score
            self.hud.free_live_event_bonus_score += (
                corrected_free_live_event_bonus_score
            )
            free_live_event_bonus_add_score += corrected_free_live_event_bonus_score
            damage = entry.damage
            if entry.never_die_skill and damage >= self.hud.life:
                damage = max(0, self.hud.life - 5)
                entry.damage_guard_type = 2
            self.hud.life = max(0, self.hud.life - damage)
        self._refresh_life_hud_visual_state()
        rank = {"miss": 0, "bad": 1, "good": 2, "great": 3, "perfect": 4}
        representative = max(entries, key=lambda entry: rank[entry.raw_result])
        self.hud.judgement = representative.adjusted_result
        self._update_combo_hud(
            previous_combo,
            tuple(entry.adjusted_result for entry in entries),
        )
        self.last_frame_total = OneFrameTotalData(
            entry_count=len(entries),
            add_score=self.hud.add_score,
            add_power=sum(entry.add_power for entry in entries),
            add_combo=sum(entry.add_combo for entry in entries),
            representative_result=representative.adjusted_result,
            judge_timing=representative.judge_timing,
            free_live_event_bonus_add_score=free_live_event_bonus_add_score,
            stage_effect_level=stage_effect_level,
            score_up_type=representative.score_up_type,
            crescendo_skill_score_up_rate=(
                representative.crescendo_skill_score_up_rate
            ),
        )
        self._show_add_score_hud(self.last_frame_total)
        self._show_result_hud(self.last_frame_total)
        return self.last_frame_total

    def _show_add_score_hud(self, frame: OneFrameTotalData) -> None:
        if frame.add_score == 0 and frame.score_up_type != 3:
            return
        visual = self.hud.add_score_visuals[self._next_add_score_visual]
        visual.active = True
        visual.score = frame.add_score
        visual.score_up_type = frame.score_up_type
        visual.depth = self._next_add_score_depth
        visual.elapsed = 0.0
        visual.local_y = -50.0
        visual.alpha = 0.6
        self._next_add_score_visual = (
            self._next_add_score_visual + 1
        ) % len(self.hud.add_score_visuals)
        self._next_add_score_depth = (self._next_add_score_depth + 1) & 7

    def _show_result_hud(self, frame: OneFrameTotalData) -> None:
        visual = self.hud.result_visual
        visual.visible = True
        visual.elapsed = 0.0
        visual.judgement = frame.representative_result
        visual.judge_timing = (
            frame.judge_timing if self.enable_to_show_fast_slow else None
        )
        visual.score_up_type = frame.score_up_type
        visual.rate_up_value = frame.crescendo_skill_score_up_rate

    def _update_score_result_hud_clocks(self, delta_time: float) -> None:
        phase_duration = 0.14000000059604645
        for visual in self.hud.add_score_visuals:
            if not visual.active:
                continue
            visual.elapsed += delta_time
            if visual.elapsed < phase_duration:
                visual.alpha = 0.2 + 0.8 * visual.elapsed / phase_duration
                visual.local_y += 8.0
            elif visual.elapsed < phase_duration * 2.0:
                visual.alpha = 1.0
                visual.local_y += 1.0
            elif visual.elapsed < phase_duration * 3.0:
                visual.alpha = 1.0 - (
                    visual.elapsed - phase_duration * 2.0
                ) / phase_duration
                visual.local_y += 1.0
            else:
                visual.active = False
                visual.alpha = 0.0
                visual.local_y = 0.0
        result = self.hud.result_visual
        if result.visible:
            result.elapsed += delta_time
            if result.elapsed >= 1.0:
                result.visible = False

    def _update_combo_hud_clocks(self, delta_time: float) -> None:
        visual = self.hud.combo_visual
        if visual.normal_visible:
            visual.normal_hide_elapsed += delta_time
            visual.normal_scale_elapsed += delta_time
            if visual.normal_hide_elapsed > 1.0:
                visual.normal_visible = False
        if visual.all_perfect_enabled:
            visual.all_perfect_alpha_elapsed += delta_time
        if visual.all_perfect_visible:
            visual.all_perfect_hide_elapsed += delta_time
            visual.all_perfect_scale_elapsed += delta_time
            if visual.all_perfect_hide_elapsed > 1.0:
                visual.all_perfect_visible = False

    def _update_combo_hud(
        self, previous_combo: int, adjusted_results: tuple[str, ...]
    ) -> None:
        visual = self.hud.combo_visual
        combo_changed = self.hud.combo != previous_combo
        if self.hud.combo <= 0:
            visual.normal_visible = False
            visual.normal_hide_elapsed = 0.0
            visual.all_perfect_visible = False
            visual.all_perfect_hide_elapsed = 0.0
        elif combo_changed:
            if not visual.normal_visible:
                visual.normal_scale_elapsed = 0.0
            visual.normal_visible = True
            visual.normal_hide_elapsed = 0.0
        if not visual.all_perfect_enabled:
            return
        if any(result in {"miss", "bad", "good", "great"} for result in adjusted_results):
            visual.all_perfect_status = 0
        if self.hud.combo <= 0 or visual.all_perfect_status != 1:
            visual.all_perfect_visible = False
            visual.all_perfect_hide_elapsed = 0.0
        elif combo_changed:
            visual.all_perfect_visible = True
            visual.all_perfect_hide_elapsed = 0.0
            visual.all_perfect_scale_elapsed = 0.0

    def _update_one_note_max_score(
        self,
        target: OneNoteMaxScoreInfo,
        add_score: int,
        entry: OneFrameData,
    ) -> None:
        if target.score >= add_score:
            return
        target.score = add_score
        target.combo = self.hud.combo
        target.skill_factor = entry.skill_score_up_rate
        target.notes_type = entry.adjusted_result
        target.is_fever = entry.fever_score_up_rate > 1.0

    def snapshot(self) -> dict[str, object]:
        return {
            "clock": {
                "seconds": self.engine.clock.in_game_seconds,
                "music_position": self.engine.clock.music_position,
            },
            "judgement_adjust_value_b": self.judgement_adjust_value_b,
            "note_manager": asdict(self.note_manager_performance),
            "habahiro_lane_change": asdict(self.habahiro_lane_change),
            "bpm": asdict(self.bpm_runtime),
            "skill": asdict(self.skill_runtime),
            "skill_visuals": asdict(self.skill_visuals),
            "fever": asdict(self.fever_runtime),
            "hud": asdict(self.hud),
            "render": {
                "notes": [
                    asdict(note)
                    for note in sorted(
                        self.render.notes.values(), key=lambda item: item.note_id
                    )
                ],
                "slide_nodes": [
                    asdict(node)
                    for node in sorted(
                        self.render.slide_nodes.values(),
                        key=lambda item: (item.parent_note_id, item.index),
                    )
                ],
                "slide_tails": [
                    asdict(tail)
                    for tail in sorted(
                        self.render.slide_tails.values(),
                        key=lambda item: item.parent_note_id,
                    )
                ],
                "slide_segments": [
                    asdict(segment)
                    for segment in sorted(
                        self.render.slide_segments.values(),
                        key=lambda item: (item.parent_note_id, item.index),
                    )
                ],
                "particles": list(self.render.particles),
                "particle_systems": {
                    instance_id: asdict(state)
                    for instance_id, state in sorted(
                        self.render.particle_systems.items()
                    )
                },
                "particle_events": [
                    asdict(event) for event in self.render.particle_events
                ],
                "particle_samples": {
                    instance_id: [
                        {
                            "particle_id": particle.particle_id,
                            "system_path": particle.system_path,
                            "age": particle.age,
                            "lifetime": particle.lifetime,
                            "position": particle.position,
                            "velocity": particle.velocity,
                            "size": particle.size,
                            "color": particle.color,
                            "rotation": particle.rotation,
                            "uv_frame": particle.uv_frame,
                            "uv_tiles": particle.uv_tiles,
                            "renderer_profile": particle.renderer_profile,
                            "material_names": particle.material_names,
                            "sorting_order": particle.sorting_order,
                            "render_mode": particle.render_mode,
                            "render_alignment": particle.render_alignment,
                            "velocity_scale": particle.velocity_scale,
                            "length_scale": particle.length_scale,
                        }
                        for particle in particles
                    ]
                    for instance_id, particles in sorted(
                        self.render.particle_samples.items()
                    )
                },
                "mesh_states": {
                    note_id: asdict(state)
                    for note_id, state in sorted(self.render.mesh_states.items())
                },
                "sync_lines": {
                    line_id: asdict(line)
                    for line_id, line in sorted(self.render.sync_lines.items())
                },
                "flick_back_lines": {
                    line_id: asdict(line)
                    for line_id, line in sorted(self.render.flick_back_lines.items())
                },
                "field_line_skin": self.render.field_line_skin,
                "habahiro_flash_playing": self.render.habahiro_flash_playing,
            },
            "audio": {
                "music_paused": self.audio.music_paused,
                "active_holds": sorted(self.audio.active_holds),
                "cues": list(self.audio.cues),
            },
            "events": [asdict(event) for event in self.events],
            "last_frame_total": (
                asdict(self.last_frame_total) if self.last_frame_total is not None else None
            ),
        }

    def restore_bpm_state(self, position: float) -> None:
        if position < 0:
            raise ValueError("BPM restore position cannot be negative")
        state = self.bpm_runtime
        state.current_bpm = state.basic_bpm
        state.current_bpm_string = state.basic_bpm_string
        state.next_command_index = 0
        state.applied_command_ids.clear()
        while state.next_command_index < len(self.bpm_change_commands):
            command = self.bpm_change_commands[state.next_command_index]
            if command.position > position:
                break
            state.current_bpm = command.bpm
            state.current_bpm_string = command.bpm_string
            state.applied_command_ids.append(command.command_id)
            state.next_command_index += 1
        self._update_next_bpm()

    def _update_next_bpm(self) -> None:
        state = self.bpm_runtime
        if state.next_command_index >= len(self.bpm_change_commands):
            state.next_bpm = None
            state.next_bpm_string = None
            return
        command = self.bpm_change_commands[state.next_command_index]
        state.next_bpm = command.bpm
        state.next_bpm_string = command.bpm_string

    def _apply_bpm_changes(self, position: float) -> None:
        state = self.bpm_runtime
        while state.next_command_index < len(self.bpm_change_commands):
            command = self.bpm_change_commands[state.next_command_index]
            if command.position > position:
                break
            state.current_bpm = command.bpm
            state.current_bpm_string = command.bpm_string
            state.applied_command_ids.append(command.command_id)
            state.next_command_index += 1
            self._emit(
                "bpm_changed",
                command_id=command.command_id,
                position=command.position,
                bpm=command.bpm,
                bpm_string=command.bpm_string,
            )
        self._update_next_bpm()

    def _start_habahiro_lane_change(self, position: float) -> None:
        state = self.habahiro_lane_change
        if (
            not state.flash_enabled
            or state.flash_playing
            or state.line_image_changed
            or state.next_command_index >= len(self.lane_change_commands)
        ):
            return
        command = self.lane_change_commands[state.next_command_index]
        if position < command.position:
            return
        state.flash_playing = True
        state.animation_play_count += 1
        state.next_command_index += 1
        self.render.habahiro_flash_playing = True
        self._emit(
            "lane_change_flash_started",
            command_id=command.command_id,
            lane=command.source_lane,
            position=command.position,
        )

    def _refresh_visible_notes(self, position: float, delta_time: float) -> None:
        visible: dict[str, RenderNote] = {}
        slide_nodes: dict[str, SlideNodeRenderState] = {}
        slide_tails: dict[str, SlideTailRuntimeState] = {}
        slide_segments: dict[str, SlideMeshSegmentState] = {}
        active_mesh_ids: set[str] = set()
        goal_y = self.render_projection.goal_position_y()
        note_start_y = self.render_projection.note_start_position_y()
        note_setting_scale = self.render_projection.note_setting_scale_value()
        virtual_lane_start_delta_x = (
            self.render_projection.virtual_lane_start_delta_x_value()
        )
        virtual_lane_end_delta_x = (
            self.render_projection.virtual_lane_end_delta_x_value()
        )
        arrival_seconds = note_arrival_seconds(self.render_projection.specific_speed)
        for note in self.notes:
            if note.note_id in self._judged:
                continue
            remaining_seconds = seconds_between_positions(
                self.engine.tempo_map, position, note.position
            )
            progress = 1.0 - remaining_seconds / arrival_seconds
            if note.note_id in self._started_holds:
                progress = 1.0
            if note.note_id in self._started_holds or 0.0 <= progress <= 1.0:
                note_goal_x = self.render_projection.button_center_x(
                    note.lane, note.width
                )
                note_start_x = self.render_projection.note_start_x(
                    note.lane, note.width
                )
                note_position = calc_note_position(
                    (note_goal_x, goal_y),
                    (note_start_x, note_start_y),
                    progress,
                    note.virtual_lane_direction,
                    note.virtual_lane_distance,
                    virtual_lane_start_delta_x,
                    virtual_lane_end_delta_x,
                )
                note_scale_x = self.render_projection.local_scale_x
                if self.render_projection.perspective_scale_enabled:
                    note_scale_x = calc_note_scale(
                        note_position[1],
                        note_start_y,
                        goal_y,
                        note_setting_scale,
                        note.width,
                        self.render_projection.high_aspect_ratio,
                    )
                mesh = None
                if note.end_position is not None and note.kind == "long":
                    mesh_state = activate_note_mesh(self.render.mesh_states[note.note_id])
                    self.render.mesh_states[note.note_id] = mesh_state
                    active_mesh_ids.add(note.note_id)
                    end_remaining_seconds = seconds_between_positions(
                        self.engine.tempo_map, position, note.end_position
                    )
                    end_progress = 1.0 - end_remaining_seconds / arrival_seconds
                    after_position = calc_note_position(
                        (note_goal_x, goal_y),
                        (note_start_x, note_start_y),
                        end_progress,
                        note.end_virtual_lane_direction,
                        note.end_virtual_lane_distance,
                        virtual_lane_start_delta_x,
                        virtual_lane_end_delta_x,
                    )
                    after_note_state = "move"
                    if end_progress < 0.0:
                        after_note_state = "wait"
                        after_position = (
                            note_start_x,
                            note_start_y,
                        )
                    width_rate = mesh_width_rate(
                        note.mesh_width_type,
                        note.special_mesh_width,
                        note.mesh_width_progress,
                    )
                    front_scale_x = note_scale_x
                    after_scale_x = self.render_projection.local_scale_x
                    if self.render_projection.perspective_scale_enabled:
                        after_scale_x = calc_note_scale(
                            after_position[1],
                            note_start_y,
                            goal_y,
                            note_setting_scale,
                            note.width,
                            self.render_projection.high_aspect_ratio,
                        )
                        safe_area_to_screen_ratio = (
                            self.render_projection.safe_area_to_screen_ratio_value()
                        )
                        after_scale_x = get_after_note_scale(
                            after_note_state,
                            after_scale_x,
                            note_setting_scale,
                            note_start_y,
                            goal_y,
                            after_position[1],
                            safe_area_to_screen_ratio,
                        )
                    front_left, front_right = project_note_boundary(
                        note_position,
                        front_scale_x,
                        note.width,
                        self.render_projection.screen_to_safe_area_ratio_value(),
                        width_rate,
                    )
                    after_left, after_right = project_note_boundary(
                        after_position,
                        after_scale_x,
                        note.width,
                        self.render_projection.screen_to_safe_area_ratio_value(),
                        width_rate,
                    )
                    if note_mesh_should_update(mesh_state):
                        material_binding = note_mesh_material_binding(
                            note.kind,
                            note.is_curved,
                        )
                        mesh = build_advanced_note_strip(
                            front_left,
                            front_right,
                            after_left,
                            after_right,
                            self.render_projection.long_note_line_brightness,
                            mesh_color=note.mesh_color,
                            material_binding=material_binding,
                            texture_profile=note_mesh_texture_profile_for_binding(
                                self.render_projection.note_skin_bundle,
                                material_binding,
                            ),
                            shader_threshold=get_sudden_pos(
                                self.render_projection.launch_distance_rate,
                                self.render_projection.sudden_rate,
                                self.render_projection.sudden_top_y,
                                self.render_projection.sudden_bottom_y,
                            ),
                        )
                button_types = tuple(range(note.lane, note.lane + note.width))
                sprite_key = note_sprite_key(
                    "skill" if note.note_id in self._root_skill_note_ids else note.kind,
                    self.render_projection.note_color_enabled,
                    note.short_rhythm_under_8beat,
                )
                resource_id = (
                    self.resource_catalog.sprite_resource(
                        sprite_key,
                        button_types,
                        note_skin_profile=self.note_skin_profile,
                    )
                    if self.resource_catalog is not None
                    else note_sprite_resource_id(sprite_key, button_types)
                )
                flick_icon_route = front_flick_icon_visual_route(note.kind)
                icon_resource_id = None
                if flick_icon_route is not None:
                    icon_button_types = (
                        button_types if flick_icon_route.is_range_key else ()
                    )
                    icon_resource_id = (
                        self.resource_catalog.sprite_resource(
                            flick_icon_route.sprite_key,
                            icon_button_types,
                            is_range_key=flick_icon_route.is_range_key,
                            note_skin_profile=self.note_skin_profile,
                        )
                        if self.resource_catalog is not None
                        else note_sprite_resource_id(
                            flick_icon_route.sprite_key,
                            icon_button_types,
                        )
                    )
                visible[note.note_id] = RenderNote(
                    note_id=note.note_id,
                    lane=note.lane,
                    kind=note.kind,
                    progress=progress,
                    resource_id=resource_id,
                    mesh=mesh,
                    position=note_position,
                    scale_x=note_scale_x,
                    sprite_key=sprite_key,
                    sprite_renderer_enabled=True,
                    flick_icon_enabled="flick" in note.kind,
                    sorting_order=70,
                    flick_icon=(
                        flick_icon_render_state(
                            flick_icon_route,
                            icon_resource_id,
                            self._flick_icon_elapsed_seconds,
                        )
                        if flick_icon_route is not None
                        else None
                    ),
                )
            stop_killed_segment_ids: set[str] = set()
            if note.kind == "slide" and note.intermediate_positions:
                first_active_index = self._intermediate_index.get(note.note_id, 0)
                after_positions = note.intermediate_positions + (note.end_position,)
                after_lanes = (
                    note.intermediate_lanes
                    if note.intermediate_lanes
                    else (note.lane,) * len(note.intermediate_positions)
                ) + (note.end_lane if note.end_lane is not None else note.lane,)
                after_widths = (
                    note.intermediate_widths
                    if note.intermediate_widths
                    else (note.width,) * len(note.intermediate_positions)
                ) + (note.end_width if note.end_width is not None else note.width,)
                after_invisible = (
                    note.intermediate_invisible
                    if note.intermediate_invisible
                    else (False,) * len(note.intermediate_positions)
                ) + (False,)
                virtual_perfect_line = (
                    self.render_projection.slide_virtual_perfect_line
                    if self.render_projection.slide_virtual_perfect_line is not None
                    else goal_y
                )
                root_note_state = (
                    "stop" if note.note_id in self._started_holds else "move"
                )
                after_states = []
                for after_index, (after_position, after_lane, after_width) in enumerate(
                    zip(after_positions, after_lanes, after_widths)
                ):
                    after_remaining_seconds = signed_seconds_between_positions(
                        self.engine.tempo_map, position, after_position
                    )
                    after_progress = 1.0 - after_remaining_seconds / arrival_seconds
                    if after_progress < 0.0:
                        after_states.append("wait")
                        continue
                    after_goal_x = self.render_projection.button_center_x(
                        after_lane, after_width
                    )
                    after_render_position = calc_note_position(
                        (after_goal_x, goal_y),
                        (
                            self.render_projection.note_start_x(
                                after_lane, after_width
                            ),
                            note_start_y,
                        ),
                        after_progress,
                    )
                    after_states.append(
                        evaluate_slide_move_state(
                            after_progress,
                            after_render_position[1],
                            goal_y,
                            virtual_perfect_line,
                            after_index < len(after_positions) - 1,
                            root_note_state,
                            self.render_projection.slide_adjust_value_b,
                            self.render_projection.slide_root_line_inactive,
                        ).note_state
                    )
                for index in range(first_active_index, len(note.intermediate_positions)):
                    node_absolute_position = note.intermediate_positions[index]
                    node_remaining_seconds = signed_seconds_between_positions(
                        self.engine.tempo_map, position, node_absolute_position
                    )
                    node_progress = 1.0 - node_remaining_seconds / arrival_seconds
                    if node_progress < 0.0:
                        continue
                    node_lane = (
                        note.intermediate_lanes[index]
                        if note.intermediate_lanes
                        else note.lane
                    )
                    node_width = (
                        note.intermediate_widths[index]
                        if note.intermediate_widths
                        else note.width
                    )
                    node_goal_x = self.render_projection.button_center_x(
                        node_lane, node_width
                    )
                    node_position = calc_note_position(
                        (node_goal_x, goal_y),
                        (
                            self.render_projection.note_start_x(
                                node_lane, node_width
                            ),
                            note_start_y,
                        ),
                        node_progress,
                    )
                    exist_after_note = True
                    move_state = evaluate_slide_move_state(
                        node_progress,
                        node_position[1],
                        goal_y,
                        virtual_perfect_line,
                        exist_after_note,
                        root_note_state,
                        self.render_projection.slide_adjust_value_b,
                        self.render_projection.slide_root_line_inactive,
                    )
                    if move_state.snap_to_visual_target:
                        node_position = (
                            node_goal_x,
                            goal_y,
                        )
                    visible_after_node_id = None
                    movable_after_node_id = None
                    stop_action = None
                    if move_state.note_state == "stop":
                        stop_state = evaluate_slide_stop_state(
                            index,
                            tuple(after_states),
                            after_invisible,
                        )
                        stop_action = stop_state.action
                        if stop_state.visible_after_index is not None:
                            visible_after_node_id = (
                                f"{note.note_id}:intermediate:"
                                f"{stop_state.visible_after_index}"
                                if stop_state.visible_after_index
                                < len(note.intermediate_positions)
                                else f"{note.note_id}:tail"
                            )
                        if stop_state.movable_after_index is not None:
                            movable_after_node_id = (
                                f"{note.note_id}:intermediate:"
                                f"{stop_state.movable_after_index}"
                                if stop_state.movable_after_index
                                < len(note.intermediate_positions)
                                else f"{note.note_id}:tail"
                            )
                        if stop_state.action == "move_to_after":
                            movable_index = stop_state.movable_after_index
                            if movable_index is not None:
                                prior_node = self.render.slide_nodes.get(
                                    f"{note.note_id}:intermediate:{index}"
                                )
                                current_transform_x = (
                                    prior_node.position[0]
                                    if prior_node is not None
                                    else node_position[0]
                                )
                                direct_after_index = index + 1
                                current_visual_x = (
                                    self.render_projection.button_center_x(
                                        after_lanes[direct_after_index],
                                        after_widths[direct_after_index],
                                    )
                                    if stop_state.rebind_visual_target
                                    else node_goal_x
                                )
                                total_seconds = seconds_between_positions(
                                    self.engine.tempo_map,
                                    node_absolute_position,
                                    after_positions[movable_index],
                                )
                                node_position = (
                                    move_to_next_after_note_x(
                                        current_transform_x,
                                        current_visual_x,
                                        self.render_projection.button_center_x(
                                            after_lanes[movable_index],
                                            after_widths[movable_index],
                                        ),
                                        delta_time,
                                        total_seconds,
                                    ),
                                    goal_y,
                                )
                        elif stop_state.action == "waiting_deactive":
                            stop_killed_segment_ids.add(
                                slide_segment_id(note.note_id, index + 1)
                            )
                    node_scale_x = self.render_projection.local_scale_x
                    if self.render_projection.perspective_scale_enabled:
                        node_scale_x = calc_note_scale(
                            node_position[1],
                            note_start_y,
                            goal_y,
                            note_setting_scale,
                            node_width,
                            self.render_projection.high_aspect_ratio,
                        )
                    is_invisible = (
                        note.intermediate_invisible[index]
                        if note.intermediate_invisible
                        else False
                    )
                    button_types = tuple(range(node_lane, node_lane + node_width))
                    resource_id = None
                    if not is_invisible:
                        resource_id = (
                            self.resource_catalog.sprite_resource(
                                "note_slide_among",
                                button_types,
                                True,
                                self.note_skin_profile,
                            )
                            if self.resource_catalog is not None
                            else note_sprite_resource_id(
                                "note_slide_among", button_types
                            )
                        )
                    node_id = f"{note.note_id}:intermediate:{index}"
                    slide_nodes[node_id] = SlideNodeRenderState(
                        node_id=node_id,
                        parent_note_id=note.note_id,
                        index=index,
                        absolute_position=node_absolute_position,
                        lane=node_lane,
                        width=node_width,
                        progress=node_progress,
                        position=node_position,
                        scale_x=node_scale_x,
                        state=move_state.note_state,
                        exist_after_note=exist_after_note,
                        virtual_perfect_line=virtual_perfect_line,
                        is_real_line=move_state.is_real_line,
                        is_progress_over_line=move_state.is_progress_over_line,
                        is_over_line=move_state.is_over_line,
                        kill_mesh=move_state.kill_mesh,
                        visible_after_node_id=visible_after_node_id,
                        movable_after_node_id=movable_after_node_id,
                        stop_action=stop_action,
                        resource_id=resource_id,
                        sprite_renderer_enabled=(
                            not is_invisible and stop_action != "waiting_deactive"
                        ),
                    )
                    if stop_action == "waiting_deactive":
                        slide_nodes[node_id].state = "waiting_deactive"
            if note.kind == "slide" and note.end_position is not None:
                tail_lane = note.end_lane if note.end_lane is not None else note.lane
                tail_width = note.end_width if note.end_width is not None else note.width
                tail_remaining_seconds = signed_seconds_between_positions(
                    self.engine.tempo_map, position, note.end_position
                )
                tail_progress = 1.0 - tail_remaining_seconds / arrival_seconds
                tail_goal_x = self.render_projection.button_center_x(
                    tail_lane, tail_width
                )
                tail_position = calc_note_position(
                    (tail_goal_x, goal_y),
                    (
                        self.render_projection.note_start_x(tail_lane, tail_width),
                        note_start_y,
                    ),
                    tail_progress,
                )
                virtual_perfect_line = (
                    self.render_projection.slide_virtual_perfect_line
                    if self.render_projection.slide_virtual_perfect_line is not None
                    else goal_y
                )
                root_note_state = (
                    "stop" if note.note_id in self._started_holds else "move"
                )
                tail_move_state = evaluate_slide_move_state(
                    tail_progress,
                    tail_position[1],
                    goal_y,
                    virtual_perfect_line,
                    False,
                    root_note_state,
                    self.render_projection.slide_adjust_value_b,
                    self.render_projection.slide_root_line_inactive,
                )
                if tail_move_state.snap_to_visual_target:
                    tail_position = (tail_goal_x, goal_y)
                tail_scale_x = self.render_projection.local_scale_x
                if self.render_projection.perspective_scale_enabled:
                    tail_scale_x = calc_note_scale(
                        tail_position[1],
                        note_start_y,
                        goal_y,
                        note_setting_scale,
                        tail_width,
                        self.render_projection.high_aspect_ratio,
                    )
                tail_key = (note.note_id, note.end_position)
                tail_game_note_type = (
                    note.end_game_note_type
                    if note.end_game_note_type is not None
                    else note.game_note_type
                )
                tail_visual = slide_tail_visual_route(
                    tail_game_note_type,
                    note.end_gesture,
                    note.after_note_type,
                )
                side_connection_graph = None
                multiple_left_count = note.multiple_left_count
                multiple_right_count = note.multiple_right_count
                if note.multiple_side_nodes and tail_game_note_type is not None:
                    side_connection_graph = build_slide_tail_connection_graph(
                        f"{note.note_id}:tail",
                        tail_lane,
                        tail_game_note_type,
                        note.multiple_side_nodes,
                        tail_move_state.note_state,
                        root_scale_x=tail_scale_x,
                        root_source_order=note.end_source_order,
                        shader_threshold=get_sudden_pos(
                            self.render_projection.launch_distance_rate,
                            self.render_projection.sudden_rate,
                            self.render_projection.sudden_top_y,
                            self.render_projection.sudden_bottom_y,
                        ),
                        button_x=self.render_projection.button_center_x,
                    )
                    side_connection_graph = bind_slide_tail_connection_visuals(
                        side_connection_graph,
                        tail_position,
                        self._flick_icon_elapsed_seconds,
                        self.resource_catalog,
                        self.note_skin_profile,
                    )
                    side_connection_graph = advance_slide_tail_connection_graph(
                        side_connection_graph
                    )
                    visual_nodes = tuple(
                        node
                        for node in side_connection_graph.nodes
                        if node.role == "visual"
                    )
                    multiple_left_count = sum(
                        node.button_index < tail_lane for node in visual_nodes
                    )
                    multiple_right_count = (
                        len(visual_nodes) - multiple_left_count
                    )
                relevant_side_count = 0
                if tail_game_note_type in (14, 16):
                    relevant_side_count = multiple_left_count
                elif tail_game_note_type in (15, 17):
                    relevant_side_count = multiple_right_count
                side_note_count = multiple_left_count + multiple_right_count
                if side_connection_graph is None:
                    left_side_z_positions, right_side_z_positions = (
                        multiple_directional_flick_side_z_positions(
                            tail_game_note_type,
                            multiple_left_count,
                            multiple_right_count,
                        )
                    )
                else:
                    left_side_z_positions = tuple(
                        node.z_position
                        for node in sorted(
                            (
                                node
                                for node in side_connection_graph.nodes
                                if node.role == "visual"
                                and node.button_index < tail_lane
                            ),
                            key=lambda node: tail_lane - node.button_index,
                        )
                    )
                    right_side_z_positions = tuple(
                        node.z_position
                        for node in sorted(
                            (
                                node
                                for node in side_connection_graph.nodes
                                if node.role == "visual"
                                and node.button_index > tail_lane
                            ),
                            key=lambda node: node.button_index - tail_lane,
                        )
                    )
                slide_tails[note.note_id] = SlideTailRuntimeState(
                    node_id=f"{note.note_id}:tail",
                    parent_note_id=note.note_id,
                    absolute_position=note.end_position,
                    lane=tail_lane,
                    width=tail_width,
                    progress=tail_progress,
                    position=tail_position,
                    scale_x=tail_scale_x,
                    state=tail_move_state.note_state,
                    game_note_type=note.game_note_type,
                    end_game_note_type=tail_game_note_type,
                    end_gesture=note.end_gesture,
                    frame_counter=self._slide_stop_frame_counters.get(tail_key, 0.0),
                    subclass=tail_visual.subclass,
                    sprite_key=tail_visual.sprite_key,
                    resource_id=(
                        self.resource_catalog.sprite_resource(
                            tail_visual.sprite_key,
                            tuple(range(tail_lane, tail_lane + tail_width)),
                            is_range_key=False,
                            note_skin_profile=self.note_skin_profile,
                        )
                        if self.resource_catalog is not None
                        and tail_visual.sprite_key is not None
                        else note_sprite_resource_id(
                            tail_visual.sprite_key,
                            tuple(range(tail_lane, tail_lane + tail_width)),
                        )
                        if tail_visual.sprite_key is not None
                        else None
                    ),
                    icon_sprite_key=tail_visual.icon_sprite_key,
                    flick_icon_enabled=(
                        tail_visual.flick_icon_enabled
                        and (
                            tail_visual.subclass != "multiple_directional_flick"
                            or relevant_side_count == 0
                        )
                    ),
                    flick_icon_sorting_order=(
                        tail_visual.flick_icon_sorting_order
                    ),
                    directional_animation=tail_visual.directional_animation,
                    flick_icon=(
                        flick_icon_render_state(
                            FrontFlickIconVisualRoute(
                                tail_visual.icon_sprite_key,
                                tail_visual.flick_icon_sorting_order or 70,
                                tail_visual.directional_animation
                                or "FlickNoteIcon",
                                tail_visual.directional_animation is None,
                            ),
                            (
                                self.resource_catalog.sprite_resource(
                                    tail_visual.icon_sprite_key,
                                    (
                                        tuple(
                                            range(
                                                tail_lane,
                                                tail_lane + tail_width,
                                            )
                                        )
                                        if tail_visual.directional_animation is None
                                        else ()
                                    ),
                                    is_range_key=(
                                        tail_visual.directional_animation is None
                                    ),
                                    note_skin_profile=self.note_skin_profile,
                                )
                                if self.resource_catalog is not None
                                else note_sprite_resource_id(
                                    tail_visual.icon_sprite_key,
                                    (
                                        tuple(
                                            range(
                                                tail_lane,
                                                tail_lane + tail_width,
                                            )
                                        )
                                        if tail_visual.directional_animation is None
                                        else ()
                                    ),
                                )
                            ),
                            self._flick_icon_elapsed_seconds,
                            enabled=(
                                tail_visual.flick_icon_enabled
                                and (
                                    tail_visual.subclass
                                    != "multiple_directional_flick"
                                    or relevant_side_count == 0
                                )
                            ),
                        )
                        if tail_visual.icon_sprite_key is not None
                        else None
                    ),
                    multiple_left_count=multiple_left_count,
                    multiple_right_count=multiple_right_count,
                    side_notes_state=(
                        tail_move_state.note_state if side_note_count else None
                    ),
                    side_notes_sprite_enabled=side_note_count > 0,
                    back_line_active=(
                        note.multiple_back_line_active
                        or bool(
                            side_connection_graph
                            and side_connection_graph.back_lines
                        )
                    ),
                    left_side_z_positions=left_side_z_positions,
                    right_side_z_positions=right_side_z_positions,
                    side_connection_graph=side_connection_graph,
                )
            if (
                note.kind == "slide"
                and note.end_position is not None
                and (note.note_id in self._started_holds or 0.0 <= progress <= 1.0)
            ):
                endpoint_specs = [
                    (
                        f"{note.note_id}:head",
                        note.position,
                        note.lane,
                        note.width,
                        note.virtual_lane_direction,
                        note.virtual_lane_distance,
                    )
                ]
                endpoint_specs.extend(
                    (
                        f"{note.note_id}:intermediate:{index}",
                        absolute_position,
                        note.intermediate_lanes[index]
                        if note.intermediate_lanes
                        else note.lane,
                        note.intermediate_widths[index]
                        if note.intermediate_widths
                        else note.width,
                        "none",
                        0,
                    )
                    for index, absolute_position in enumerate(
                        note.intermediate_positions
                    )
                )
                endpoint_specs.append(
                    (
                        f"{note.note_id}:tail",
                        note.end_position,
                        note.end_lane if note.end_lane is not None else note.lane,
                        note.end_width if note.end_width is not None else note.width,
                        note.end_virtual_lane_direction,
                        note.end_virtual_lane_distance,
                    )
                )
                projected_endpoints = []
                for endpoint_index, (
                    endpoint_id,
                    absolute_position,
                    lane,
                    width,
                    virtual_direction,
                    virtual_distance,
                ) in enumerate(endpoint_specs):
                    remaining_seconds = signed_seconds_between_positions(
                        self.engine.tempo_map, position, absolute_position
                    )
                    endpoint_progress = 1.0 - remaining_seconds / arrival_seconds
                    if (
                        endpoint_id.endswith(":head")
                        and note.note_id in self._started_holds
                    ):
                        endpoint_progress = 1.0
                    clamped_progress = max(endpoint_progress, 0.0)
                    if endpoint_index == 0:
                        clamped_progress = min(clamped_progress, 1.0)
                    endpoint_goal_x = self.render_projection.button_center_x(
                        lane, width
                    )
                    endpoint_position = calc_note_position(
                        (endpoint_goal_x, goal_y),
                        (
                            self.render_projection.note_start_x(lane, width),
                            note_start_y,
                        ),
                        clamped_progress,
                        virtual_direction,
                        virtual_distance,
                        virtual_lane_start_delta_x,
                        virtual_lane_end_delta_x,
                    )
                    endpoint_state = "wait" if endpoint_progress < 0.0 else "move"
                    is_real_line = False
                    is_progress_over_line = False
                    is_over_line = False
                    kill_mesh = False
                    if endpoint_index > 0 and endpoint_progress >= 0.0:
                        virtual_perfect_line = (
                            self.render_projection.slide_virtual_perfect_line
                            if self.render_projection.slide_virtual_perfect_line
                            is not None
                            else goal_y
                        )
                        move_state = evaluate_slide_move_state(
                            endpoint_progress,
                            endpoint_position[1],
                            goal_y,
                            virtual_perfect_line,
                            endpoint_index < len(endpoint_specs) - 1,
                            "stop"
                            if note.note_id in self._started_holds
                            else "move",
                            self.render_projection.slide_adjust_value_b,
                            self.render_projection.slide_root_line_inactive,
                        )
                        endpoint_state = move_state.note_state
                        is_real_line = move_state.is_real_line
                        is_progress_over_line = move_state.is_progress_over_line
                        is_over_line = move_state.is_over_line
                        kill_mesh = move_state.kill_mesh
                        if move_state.snap_to_visual_target:
                            endpoint_position = (
                                endpoint_goal_x,
                                goal_y,
                            )
                    endpoint_scale_x = self.render_projection.local_scale_x
                    if self.render_projection.perspective_scale_enabled:
                        endpoint_scale_x = calc_note_scale(
                            endpoint_position[1],
                            note_start_y,
                            goal_y,
                            note_setting_scale,
                            width,
                            self.render_projection.high_aspect_ratio,
                        )
                    projected_endpoints.append(
                        SlideEndpointProjection(
                            node_id=endpoint_id,
                            absolute_position=absolute_position,
                            lane=lane,
                            width=width,
                            progress=endpoint_progress,
                            state=endpoint_state,
                            position=endpoint_position,
                            scale_x=endpoint_scale_x,
                            is_real_line=is_real_line,
                            is_progress_over_line=is_progress_over_line,
                            is_over_line=is_over_line,
                            kill_mesh=kill_mesh,
                        )
                    )
                first_active_segment = self._intermediate_index.get(note.note_id, 0)
                width_rate = mesh_width_rate(
                    note.mesh_width_type,
                    note.special_mesh_width,
                    note.mesh_width_progress,
                )
                for index, (front, after) in enumerate(
                    zip(projected_endpoints, projected_endpoints[1:])
                ):
                    segment_id = slide_segment_id(note.note_id, index)
                    active_mesh_ids.add(segment_id)
                    mesh_state = self.render.mesh_states[segment_id]
                    if (
                        index < first_active_segment
                        or after.kill_mesh
                        or segment_id in stop_killed_segment_ids
                    ):
                        self.render.mesh_states[segment_id] = hide_note_mesh_renderer(
                            activate_note_mesh(mesh_state)
                        )
                        continue
                    mesh_state = activate_note_mesh(mesh_state)
                    self.render.mesh_states[segment_id] = mesh_state
                    after_scale_x = after.scale_x
                    if self.render_projection.perspective_scale_enabled:
                        after_scale_x = get_after_note_scale(
                            after.state,
                            after_scale_x,
                            note_setting_scale,
                            note_start_y,
                            goal_y,
                            after.position[1],
                            self.render_projection.safe_area_to_screen_ratio_value(),
                        )
                    front_left, front_right = project_note_boundary(
                        front.position,
                        front.scale_x,
                        front.width,
                        self.render_projection.screen_to_safe_area_ratio_value(),
                        width_rate,
                    )
                    after_left, after_right = project_note_boundary(
                        after.position,
                        after_scale_x,
                        after.width,
                        self.render_projection.screen_to_safe_area_ratio_value(),
                        width_rate,
                    )
                    material_binding = note_mesh_material_binding(
                        note.kind,
                        note.is_curved,
                    )
                    mesh = build_advanced_note_strip(
                        front_left,
                        front_right,
                        after_left,
                        after_right,
                        self.render_projection.long_note_line_brightness,
                        mesh_color=note.mesh_color,
                        material_binding=material_binding,
                        texture_profile=note_mesh_texture_profile_for_binding(
                            self.render_projection.note_skin_bundle,
                            material_binding,
                        ),
                        shader_threshold=get_sudden_pos(
                            self.render_projection.launch_distance_rate,
                            self.render_projection.sudden_rate,
                            self.render_projection.sudden_top_y,
                            self.render_projection.sudden_bottom_y,
                        ),
                    )
                    slide_segments[segment_id] = SlideMeshSegmentState(
                        segment_id=segment_id,
                        parent_note_id=note.note_id,
                        index=index,
                        front_node_id=front.node_id,
                        after_node_id=after.node_id,
                        front_absolute_position=front.absolute_position,
                        after_absolute_position=after.absolute_position,
                        front_lane=front.lane,
                        after_lane=after.lane,
                        front_width=front.width,
                        after_width=after.width,
                        mesh=mesh,
                    )
        sync_lines: dict[str, SyncLineGeometry] = {}
        processed_sync_pairs: set[tuple[str, str]] = set()

        def resolve_sync_endpoint(
            endpoint: SyncEndpointSpec,
        ) -> tuple[
            str,
            tuple[float, float],
            float,
            int | None,
        ] | None:
            note = self._notes_by_id[endpoint.note_id]
            base = _sync_endpoint_base(endpoint)
            endpoint_position: tuple[float, float] | None = None
            endpoint_scale = self.render_projection.local_scale_x
            game_note_type = note.game_note_type
            if base == "front":
                render_note = visible.get(note.note_id)
                if (
                    render_note is None
                    or render_note.position is None
                    or note.note_id in self._started_holds
                ):
                    return None
                endpoint_position = render_note.position
                endpoint_scale = render_note.scale_x
            else:
                if note.end_position is None:
                    return None
                game_note_type = (
                    note.end_game_note_type
                    if note.end_game_note_type is not None
                    else note.game_note_type
                )
                slide_tail = slide_tails.get(note.note_id)
                if slide_tail is not None:
                    if slide_tail.state != "move":
                        return None
                    endpoint_position = slide_tail.position
                    endpoint_scale = slide_tail.scale_x
                else:
                    if (
                        note.note_id not in self._started_holds
                        and note.note_id not in visible
                    ):
                        return None
                    end_lane = (
                        note.end_lane if note.end_lane is not None else note.lane
                    )
                    end_width = (
                        note.end_width if note.end_width is not None else note.width
                    )
                    remaining_seconds = signed_seconds_between_positions(
                        self.engine.tempo_map,
                        position,
                        note.end_position,
                    )
                    end_progress = 1.0 - remaining_seconds / arrival_seconds
                    if not 0.0 <= end_progress <= 1.0:
                        return None
                    endpoint_position = calc_note_position(
                        (
                            self.render_projection.button_center_x(
                                end_lane,
                                end_width,
                            ),
                            goal_y,
                        ),
                        (
                            self.render_projection.note_start_x(
                                end_lane,
                                end_width,
                            ),
                            note_start_y,
                        ),
                        end_progress,
                    )
                    if self.render_projection.perspective_scale_enabled:
                        endpoint_scale = calc_note_scale(
                            endpoint_position[1],
                            note_start_y,
                            goal_y,
                            note_setting_scale,
                            end_width,
                            self.render_projection.high_aspect_ratio,
                        )
            endpoint_id = (
                note.note_id
                if endpoint.endpoint == "front"
                else f"{note.note_id}:{endpoint.endpoint}"
            )
            if endpoint.node_id is not None:
                endpoint_id = endpoint.node_id
            if endpoint.endpoint.endswith(("_left", "_right")):
                endpoint_lane = int(_sync_endpoint_horizontal_key(endpoint, note))
                endpoint_absolute_position = (
                    note.position if base == "front" else note.end_position
                )
                endpoint_remaining_seconds = signed_seconds_between_positions(
                    self.engine.tempo_map,
                    position,
                    endpoint_absolute_position,
                )
                endpoint_progress = (
                    1.0 - endpoint_remaining_seconds / arrival_seconds
                )
                endpoint_position = calc_note_position(
                    (
                        self.render_projection.button_center_x(endpoint_lane),
                        goal_y,
                    ),
                    (
                        self.render_projection.note_start_x(endpoint_lane),
                        note_start_y,
                    ),
                    endpoint_progress,
                )
            return endpoint_id, endpoint_position, endpoint_scale, game_note_type

        if self.render_projection.sync_line_enabled:
            for note in self.notes:
                connections = note.sync_connections
                if not connections:
                    fallback_connections: list[SyncConnectionSpec] = []
                    if note.sync_target_id is not None:
                        fallback_connections.append(
                            SyncConnectionSpec(
                                SyncEndpointSpec(note.note_id, "front"),
                                SyncEndpointSpec(
                                    note.sync_target_id,
                                    note.sync_target_endpoint,
                                ),
                                note.sync_edge_margin,
                            )
                        )
                    if note.end_sync_target_id is not None:
                        fallback_connections.append(
                            SyncConnectionSpec(
                                SyncEndpointSpec(note.note_id, "end"),
                                SyncEndpointSpec(
                                    note.end_sync_target_id,
                                    note.end_sync_target_endpoint,
                                ),
                                note.sync_edge_margin,
                            )
                        )
                    connections = tuple(fallback_connections)
                for connection in connections:
                    resolved_owner = resolve_sync_endpoint(connection.owner)
                    resolved_target = resolve_sync_endpoint(connection.target)
                    if resolved_owner is None or resolved_target is None:
                        continue
                    owner_id, owner_position, owner_scale, owner_type = (
                        resolved_owner
                    )
                    target_id, target_position, target_scale, target_type = (
                        resolved_target
                    )
                    pair = tuple(sorted((owner_id, target_id)))
                    if pair in processed_sync_pairs:
                        continue
                    processed_sync_pairs.add(pair)
                    line_id = "|".join(pair)
                    sync_lines[line_id] = build_sync_line_geometry(
                        (owner_id, target_id),
                        owner_position,
                        target_position,
                        owner_scale,
                        target_scale,
                        connection.edge_margin,
                        owner_type,
                        target_type,
                        get_sudden_pos(
                            self.render_projection.launch_distance_rate,
                            self.render_projection.sudden_rate,
                            self.render_projection.sudden_top_y,
                            self.render_projection.sudden_bottom_y,
                        ),
                        (
                            sync_line_texture_profile(
                                self.render_projection.note_skin_bundle
                            )
                            if self.render_projection.note_skin_bundle is not None
                            else None
                        ),
                    )
        flick_back_lines: dict[str, FlickBackLineGeometry] = {}
        processed_flick_pairs: set[tuple[str, str]] = set()
        if self.render_projection.multiple_flick_back_lines_enabled:
            for note in self.notes:
                if note.flick_back_line_target_id is None:
                    continue
                pair = tuple(sorted((note.note_id, note.flick_back_line_target_id)))
                if pair in processed_flick_pairs:
                    continue
                processed_flick_pairs.add(pair)
                target = self._notes_by_id[note.flick_back_line_target_id]
                render_a = visible.get(note.note_id)
                render_b = visible.get(target.note_id)
                if (
                    render_a is None
                    or render_b is None
                    or render_a.position is None
                    or render_b.position is None
                    or note.note_id in self._started_holds
                    or target.note_id in self._started_holds
                ):
                    continue
                line_id = "|".join(pair)
                flick_back_lines[line_id] = build_multiple_flick_back_line_geometry(
                    (note.note_id, target.note_id),
                    render_a.position,
                    render_b.position,
                    render_a.scale_x,
                    note.game_note_type,
                    note.after_note_type,
                    get_sudden_pos(
                        self.render_projection.launch_distance_rate,
                        self.render_projection.sudden_rate,
                        self.render_projection.sudden_top_y,
                        self.render_projection.sudden_bottom_y,
                    ),
                    self.render_projection.directional_flick_skin_bundle,
                )
            for tail in slide_tails.values():
                graph = tail.side_connection_graph
                if graph is None:
                    continue
                nodes = {node.node_id: node for node in graph.nodes}
                for line in graph.back_lines:
                    if (
                        not line.active
                        or not line.renderer_enabled
                        or line.width <= 0.0
                    ):
                        continue
                    owner = nodes[line.owner_node_id]
                    target = nodes[line.target_node_id]
                    if owner.position is None or target.position is None:
                        continue
                    line_id = f"{tail.node_id}:{line.line_id}"
                    flick_back_lines[line_id] = build_multiple_flick_back_line_geometry(
                        (owner.node_id, target.node_id),
                        line.positions[0],
                        line.positions[1],
                        owner.scale_x,
                        owner.game_note_type,
                        shader_threshold=line.shader_parameters.get("_Threshold"),
                        texture_bundle_name=(
                            self.render_projection.directional_flick_skin_bundle
                        ),
                    )
        for note_id, mesh_state in self.render.mesh_states.items():
            if note_id not in active_mesh_ids and mesh_state.state != "deactive":
                self.render.mesh_states[note_id] = deactivate_note_mesh(mesh_state)
        self.render.notes = visible
        self.render.slide_nodes = slide_nodes
        self.render.slide_tails = slide_tails
        self.render.slide_segments = slide_segments
        self.render.sync_lines = sync_lines
        self.render.flick_back_lines = flick_back_lines

    @staticmethod
    def _particle_instance_id(lane: int, prefab_name: str) -> str:
        return f"button:{lane}:{prefab_name}"

    @staticmethod
    def _particle_game_note_type(note: NoteSpec, phase: str) -> int | None:
        game_note_type = (
            note.end_game_note_type if phase == "tail" else note.game_note_type
        )
        if game_note_type is not None:
            return game_note_type
        gesture = note.end_gesture if phase == "tail" else note.kind
        if gesture.endswith("left"):
            return 14 if note.kind == "slide" else 12 if phase == "tail" else 10
        if gesture.endswith("right"):
            return 15 if note.kind == "slide" else 13 if phase == "tail" else 11
        return None

    @staticmethod
    def _particle_lane_and_width(
        note: NoteSpec,
        phase: str,
        node_position: float | None,
    ) -> tuple[int, int]:
        if phase == "tail":
            return (
                note.end_lane if note.end_lane is not None else note.lane,
                note.end_width if note.end_width is not None else note.width,
            )
        if phase == "intermediate" and node_position is not None:
            index = note.intermediate_positions.index(node_position)
            lane = (
                note.intermediate_lanes[index]
                if index < len(note.intermediate_lanes)
                else note.lane
            )
            width = (
                note.intermediate_widths[index]
                if index < len(note.intermediate_widths)
                else note.width
            )
            return lane, width
        return note.lane, note.width

    @staticmethod
    def _particle_is_skill_note(note: NoteSpec, phase: str) -> bool:
        return (
            note.end_game_note_additional_type == 2
            if phase == "tail"
            else note.game_note_additional_type == 2
        )

    @staticmethod
    def _particle_multiple_directional_count(note: NoteSpec, phase: str) -> int:
        if phase != "tail":
            return note.multiple_note_count
        side_count = note.multiple_left_count + note.multiple_right_count
        return max(note.multiple_note_count, side_count + 1 if side_count else 0)

    def _particle_state(
        self,
        lane: int,
        prefab_name: str,
        route: str,
        range_index: int,
    ) -> ParticleSystemState:
        instance_id = self._particle_instance_id(lane, prefab_name)
        state = self.render.particle_systems.get(instance_id)
        if state is None:
            state = ParticleSystemState(
                instance_id,
                prefab_name,
                lane,
                route,
                range_index,
                origin=(
                    self.render_projection.button_center_x(lane, range_index + 1),
                    self.render_projection.goal_position_y(),
                ),
                scale=self.render_projection.particle_scale_value(),
            )
            self.render.particle_systems[instance_id] = state
        return state

    def _play_particle_state(
        self,
        state: ParticleSystemState,
        result: str,
        judge_note_type: int,
        game_note_type: int | None,
    ) -> bool:
        if state.playing:
            return False
        if state.active:
            state.stop_generation += 1
            state.clear_generation += 1
        state.playing = True
        state.play_generation += 1
        state.last_result = result
        state.last_judge_note_type = judge_note_type
        state.last_game_note_type = game_note_type
        self._start_particle_simulation(state)
        self.render.particle_events.append(
            ParticlePlaybackEvent(
                state.instance_id,
                state.prefab_name,
                state.lane,
                state.route,
                result,
                judge_note_type,
                game_note_type,
                state.range_index,
                state.play_generation,
            )
        )
        return True

    def _play_tap_keep_state(
        self,
        state: ParticleSystemState,
        result: str,
        judge_note_type: int,
        game_note_type: int | None,
    ) -> None:
        state.active = True
        state.playing = True
        state.play_generation += 1
        state.last_result = result
        state.last_judge_note_type = judge_note_type
        state.last_game_note_type = game_note_type
        self._start_particle_simulation(state)
        self.render.particle_events.append(
            ParticlePlaybackEvent(
                state.instance_id,
                state.prefab_name,
                state.lane,
                state.route,
                result,
                judge_note_type,
                game_note_type,
                state.range_index,
                state.play_generation,
            )
        )

    def complete_particle(self, lane: int, prefab_name: str) -> bool:
        state = self.render.particle_systems.get(
            self._particle_instance_id(lane, prefab_name)
        )
        if state is None or not state.playing:
            return False
        state.playing = False
        self._clear_particle_simulation(state)
        return True

    def _start_particle_simulation(self, state: ParticleSystemState) -> None:
        seed = deterministic_particle_seed(state.instance_id, state.play_generation)
        simulation = self._particle_profile_library.start(state.prefab_name, seed)
        self._particle_simulations[state.instance_id] = simulation
        state.elapsed_seconds = 0.0
        state.deterministic_seed = seed
        state.particle_count = simulation.particle_count
        self.render.particle_samples[state.instance_id] = [
            particle
            for emitter in simulation.emitters
            for particle in emitter.particles
        ]

    def _clear_particle_simulation(self, state: ParticleSystemState) -> None:
        simulation = self._particle_simulations.pop(state.instance_id, None)
        if simulation is not None:
            self._particle_profile_library.clear(simulation)
        state.particle_count = 0
        self.render.particle_samples.pop(state.instance_id, None)

    def _update_particle_simulations(self, delta_time: float) -> None:
        for instance_id, simulation in tuple(self._particle_simulations.items()):
            state = self.render.particle_systems[instance_id]
            if not state.playing:
                continue
            self._particle_profile_library.advance(
                simulation, delta_time, visible=state.visible
            )
            state.elapsed_seconds = simulation.elapsed
            state.particle_count = simulation.particle_count
            self.render.particle_samples[instance_id] = [
                particle
                for emitter in simulation.emitters
                for particle in emitter.particles
            ]
            if simulation.completed:
                state.playing = False
                self._particle_simulations.pop(instance_id)
                if not self.render.particle_samples[instance_id]:
                    self.render.particle_samples.pop(instance_id)

    def _stop_tap_keep_particles(self, lane: int) -> None:
        for state in self.render.particle_systems.values():
            if state.lane != lane or state.route != "tap_keep" or not state.playing:
                continue
            state.playing = False
            state.stop_generation += 1
            state.clear_generation += 1
            state.active = False
            self._clear_particle_simulation(state)

    def _play_gameplay_button_particles(
        self,
        note: NoteSpec,
        result: str,
        phase: str,
        node_position: float | None = None,
    ) -> GamePlayButtonParticleRoute:
        lane, range_length = self._particle_lane_and_width(
            note, phase, node_position
        )
        judge_note_type = gameplay_button_judge_note_type(note, result, phase)
        game_note_type = self._particle_game_note_type(note, phase)
        route = game_play_button_particle_route(
            result,
            judge_note_type,
            game_note_type,
            self._particle_is_skill_note(note, phase),
            self._particle_multiple_directional_count(note, phase),
            range_length,
        )
        if route.stop_tap_keep:
            self._stop_tap_keep_particles(lane)
        if route.tap_keep_prefab is not None:
            state = self._particle_state(
                lane,
                route.tap_keep_prefab,
                "tap_keep",
                route.range_index,
            )
            self._play_tap_keep_state(
                state, result, judge_note_type, game_note_type
            )
        if route.result_prefab is not None and route.result_route is not None:
            state = self._particle_state(
                lane,
                route.result_prefab,
                route.result_route,
                route.range_index,
            )
            self._play_particle_state(
                state, result, judge_note_type, game_note_type
            )
        if phase == "head" and "directional_flick" in note.kind:
            finger_route = game_play_button_directional_finger_particle(
                result,
                game_note_type,
            )
            if finger_route is not None:
                prefab_name, route_name = finger_route
                state = self._particle_state(
                    lane,
                    prefab_name,
                    route_name,
                    0,
                )
                self._play_particle_state(
                    state, result, judge_note_type, game_note_type
                )
        return route

    def _resolve(
        self,
        note: NoteSpec,
        result: str,
        timing: str | None,
        phase: str,
        slide_miss_type: str | None = None,
        slide_miss_code: int | None = None,
    ) -> None:
        raw_result = result
        result = self._correct_result_with_skill(raw_result)
        is_hold_head = note.end_position is not None and phase == "head" and result != "miss"
        if is_hold_head:
            self._started_holds.add(note.note_id)
        else:
            self._judged.add(note.note_id)
            self._started_holds.discard(note.note_id)
        owner = None if is_hold_head else self._owned_notes.pop(note.note_id, None)
        if owner is not None:
            self._touches.pop(owner, None)
        if not is_hold_head:
            self.render.notes.pop(note.note_id, None)
            self.render.slide_nodes = {
                node_id: node
                for node_id, node in self.render.slide_nodes.items()
                if node.parent_note_id != note.note_id
            }
            self.render.slide_segments = {
                segment_id: segment
                for segment_id, segment in self.render.slide_segments.items()
                if segment.parent_note_id != note.note_id
            }
            self.render.slide_tails.pop(note.note_id, None)
            for segment_index in range(len(note.intermediate_positions) + 1):
                segment_id = slide_segment_id(note.note_id, segment_index)
                mesh_state = self.render.mesh_states.get(segment_id)
                if mesh_state is not None:
                    self.render.mesh_states[segment_id] = deactivate_note_mesh(
                        mesh_state
                    )
        self._consume_additional_note(note, result, phase)
        self._submit_frame_data(
            note,
            raw_result,
            result,
            timing,
            phase,
            note.miss_damage if result == "miss" else 0,
        )
        self._play_gameplay_button_particles(note, result, phase)
        self.render.particles.append(f"judge:{note.lane}:{phase}:{result}")
        self._emit(
            "judge",
            note_id=note.note_id,
            note_kind=note.kind,
            lane=note.lane,
            position=(note.end_position if phase == "tail" else note.position),
            result=result,
            timing=timing,
            phase=phase,
            slide_miss_type=slide_miss_type,
            slide_miss_code=slide_miss_code,
        )
        if result == "miss":
            if note.note_id in self.audio.active_holds:
                self.audio.active_holds.remove(note.note_id)
                self._record_audio_event(
                    f"hold:fade:{note.note_id}",
                    "loop_stop",
                    note_id=note.note_id,
                    fade_seconds=HOLD_SOUND_FADE_SECONDS,
                )
            return
        cue = None
        if self.resource_catalog is not None:
            cue = self.resource_catalog.judge_cue_resource(
                result,
                note.kind,
                note.sound_effect_type,
                note.multiple_note_count,
            )
        if cue is None and result in JUDGE_RESULT_CUE_ROLES:
            cue = f"judge:{'flick' if 'flick' in note.kind else 'standard'}"
        if cue is not None:
            self._record_audio_event(cue, "play", tuple(cue.split("|")))
        if is_hold_head:
            self.audio.active_holds.add(note.note_id)
            hold_cue = "cue.hold.loop"
            if self.resource_catalog is not None:
                hold_cue = self.resource_catalog.cue_resource(
                    "hold_loop",
                    hold_cue,
                )
            self._record_audio_event(
                f"hold:start:{note.note_id}",
                "loop_start",
                (hold_cue,),
                note.note_id,
            )
        elif phase == "tail" and note.note_id in self.audio.active_holds:
            self.audio.active_holds.remove(note.note_id)
            self._record_audio_event(
                f"hold:fade:{note.note_id}",
                "loop_stop",
                note_id=note.note_id,
                fade_seconds=HOLD_SOUND_FADE_SECONDS,
            )

    def _update_skill_playback(self, delta_time: float) -> None:
        state = self.skill_runtime
        state.game_frame_counter += 1
        if state.skill_play_state == SKILL_PLAY_STATE_BEGIN:
            self._execute_begin_skill_process()
        elif state.skill_play_state == SKILL_PLAY_STATE_PLAYING:
            self._execute_playing_skill_process(delta_time)
        elif state.skill_play_state == SKILL_PLAY_STATE_FINISHING:
            self._execute_finishing_skill_process(delta_time)

    def _execute_begin_skill_process(self) -> None:
        state = self.skill_runtime
        if not state.play_list:
            state.current_playing_skill = None
            state.skill_play_state = SKILL_PLAY_STATE_NONE
            return
        request = state.play_list[0]
        spec = request.playback_spec
        if spec is None:
            raise ValueError(
                "skill playback requires master-data duration and once-effect fields"
            )
        state.current_playing_skill = request
        state.skill_note_states[request.skill_note_index - 1] = 1
        self._process_skill_triggered(request, spec)
        state.skill_play_state = SKILL_PLAY_STATE_PLAYING

    def _process_skill_triggered(
        self,
        request: SkillPlayRequest,
        spec: SkillPlaybackSpec,
    ) -> None:
        state = self.skill_runtime
        state.cached_life_when_skill_played = self.hud.life
        cues = self.skill_se_cue_ids[: 1 if self.is_enable_practice else 2]
        for cue in cues:
            if cue is not None:
                self._record_audio_event(cue, "play", (cue,))
            self._emit(
                "skill_se_played",
                skill_note_index=request.skill_note_index,
                skill_id=spec.skill_id,
                cue=cue,
            )
        state.judge_continuous_result_type = "perfect"
        state.crescendo_skill_score_up_rate = 0.0
        state.skill_timer = spec.duration
        state.skill_effective_timer = 0.0
        state.reservation_target_frame = state.game_frame_counter + 1
        state.reservation_skill_note_index = request.skill_note_index
        state.reservation_is_encore = request.skill_note_index == 6
        self._emit(
            "skill_started",
            skill_note_index=request.skill_note_index,
            skill_id=spec.skill_id,
            game_frame=state.game_frame_counter,
            duration=spec.duration,
            is_encore=state.reservation_is_encore,
        )
        self._play_skill_visuals(spec)
        self._play_once_effect_skill(spec)

    def _play_skill_visuals(self, spec: SkillPlaybackSpec) -> None:
        heal_animation = (
            spec.once_effect_type == "life"
            and spec.once_effect_value >= 1
            and (
                spec.once_effect_condition_life_type != "under_life"
                or self.hud.life < spec.once_effect_condition_life
            )
        )
        damage_guard_animation = any(
            effect.effect_type == "damage"
            and effect.value_type == "rate"
            and effect.value == 0.0
            for effect in spec.activate_effects
        )
        never_die_animation = any(
            effect.effect_type == "never_die" for effect in spec.activate_effects
        )
        score_up_animation = any(
            effect.effect_type
            in {
                "score",
                "score_over_life",
                "score_under_life",
                "score_continued_note_judge",
                "score_rate_up_with_perfect",
                "score_only_perfect",
                "score_under_great_half",
            }
            and effect.value > 0.0
            for effect in spec.activate_effects
        ) and not (
            spec.once_effect_condition_life_type == "under_life"
            and self.hud.life < spec.once_effect_condition_life
        )
        judge_adjust_animation = any(
            effect.effect_type == "judge" for effect in spec.activate_effects
        )
        previous = self.skill_visuals
        life_animator_state = previous.life_animator_state
        life_gauge_sprite = previous.life_gauge_sprite
        life_icon_sprite = previous.life_icon_sprite
        life_icon_color = previous.life_icon_color
        life_animator_enabled = previous.life_animator_enabled
        life_game_object_active = previous.life_game_object_active
        life_warning_blink_refreshed = False
        if never_die_animation:
            life_animator_state = "DamageGuard"
            life_gauge_sprite = "effect_health_guts_outline"
            life_icon_sprite = ""
            life_icon_color = (1.0, 1.0, 1.0, 0.0)
            life_animator_enabled = True
            life_game_object_active = True
            life_warning_blink_refreshed = True
        if heal_animation:
            life_animator_state = "LifeHealGauge"
            life_gauge_sprite = "UI_effect_life_plus_gauge"
            life_icon_sprite = "UI_effect_life_plus_icon"
            life_icon_color = (1.0, 1.0, 1.0, 1.0)
            life_animator_enabled = True
            life_game_object_active = True
        if damage_guard_animation:
            life_animator_state = "DamageGuard"
            life_gauge_sprite = "effect_health_guard_outline"
            life_icon_sprite = ""
            life_icon_color = (1.0, 1.0, 1.0, 0.0)
            life_animator_enabled = True
            life_game_object_active = True
            life_warning_blink_refreshed = True
        self.skill_visuals = SkillVisualState(
            life_heal_animation=heal_animation,
            damage_guard_animation=damage_guard_animation,
            never_die_animation=never_die_animation,
            life_animator_state=life_animator_state,
            life_gauge_sprite=life_gauge_sprite,
            life_icon_sprite=life_icon_sprite,
            life_icon_color=life_icon_color,
            life_animator_enabled=life_animator_enabled,
            life_animator_elapsed=(
                0.0
                if life_animator_enabled
                else previous.life_animator_elapsed
            ),
            life_game_object_active=life_game_object_active,
            life_warning_blink_refreshed=life_warning_blink_refreshed,
            score_up_animation=score_up_animation,
            score_animator_state=(
                "ScoreUpGauge"
                if score_up_animation
                else previous.score_animator_state
            ),
            score_gauge_effect_active=score_up_animation,
            score_animator_enabled=score_up_animation,
            score_animator_elapsed=(
                0.0
                if score_up_animation
                else previous.score_animator_elapsed
            ),
            judge_adjust_animation=judge_adjust_animation,
            judge_animator_state=(
                "SkillAdjustEffect"
                if judge_adjust_animation
                else previous.judge_animator_state
            ),
            judge_animator_enabled=judge_adjust_animation,
            judge_animator_elapsed=(
                0.0
                if judge_adjust_animation
                else previous.judge_animator_elapsed
            ),
            judge_game_object_active=judge_adjust_animation,
            psyllium_skill_mode=True,
            psyllium_mode="skill",
            psyllium_color_source=(
                f"situation_skill_index:{spec.situation_skill_index}"
            ),
            heal_callback_count=previous.heal_callback_count,
        )
        self._refresh_life_hud_visual_state()
        self._emit(
            "skill_visuals_started",
            life_heal=heal_animation,
            damage_guard=damage_guard_animation,
            never_die=never_die_animation,
            score_up=score_up_animation,
            judge_adjust=judge_adjust_animation,
            psyllium=True,
        )

    def _play_once_effect_skill(self, spec: SkillPlaybackSpec) -> None:
        if spec.once_effect_type != "life":
            return
        if (
            spec.once_effect_condition_life_type == "under_life"
            and self.hud.life >= spec.once_effect_condition_life
        ):
            return
        if spec.once_effect_value_type == "real_value":
            amount = spec.once_effect_value
        elif spec.once_effect_value_type == "rate":
            amount = self.player_max_life * spec.once_effect_value // 100
        else:
            return
        life_before = self.hud.life
        self.hud.life = min(self.player_max_life, self.hud.life + amount)
        self._refresh_life_hud_visual_state()
        self.skill_visuals.heal_callback_count += 1
        self._emit(
            "skill_life_restored",
            skill_id=spec.skill_id,
            life_before=life_before,
            life_after=self.hud.life,
        )

    def _execute_playing_skill_process(self, delta_time: float) -> None:
        state = self.skill_runtime
        if state.skill_timer <= 0.0:
            self._finish_current_skill(enter_finishing=True)
            return
        if self.game_state in SKILL_TIMER_FROZEN_GAME_STATES:
            return
        state.skill_timer -= delta_time
        state.skill_effective_timer += delta_time

    def _finish_current_skill(self, enter_finishing: bool) -> None:
        state = self.skill_runtime
        request = state.current_playing_skill
        if request is None and state.play_list:
            request = state.play_list[0]
        state.skill_timer = 0.0
        if request is not None:
            self._finish_skill_visuals()
            state.registered_skill_note_indices.append(request.skill_note_index)
            self._emit(
                "skill_finished",
                skill_note_index=request.skill_note_index,
                skill_id=(
                    request.playback_spec.skill_id
                    if request.playback_spec is not None
                    else None
                ),
            )
        if state.play_list:
            state.play_list.pop(0)
        state.current_playing_skill = None
        if enter_finishing:
            state.skill_finishing_timer = SKILL_FINISHING_SECONDS
            state.skill_play_state = SKILL_PLAY_STATE_FINISHING

    def _finish_skill_visuals(self) -> None:
        visuals = self.skill_visuals
        was_playing = any(
            (
                visuals.life_heal_animation,
                visuals.damage_guard_animation,
                visuals.never_die_animation,
                visuals.score_up_animation,
                visuals.judge_adjust_animation,
                visuals.psyllium_skill_mode,
            )
        )
        fever_active = (
            self.fever_runtime.fever_time_state == FEVER_TIME_STATE_LEVEL_ONE
        )
        visuals.life_heal_animation = False
        visuals.damage_guard_animation = False
        visuals.never_die_animation = False
        visuals.life_animator_enabled = False
        visuals.life_animator_elapsed = 0.0
        visuals.life_game_object_active = False
        visuals.life_warning_blink_refreshed = True
        visuals.score_up_animation = False
        visuals.score_gauge_effect_active = False
        visuals.score_animator_enabled = False
        visuals.score_animator_elapsed = 0.0
        visuals.judge_adjust_animation = False
        visuals.judge_animator_enabled = False
        visuals.judge_animator_elapsed = 0.0
        visuals.judge_game_object_active = False
        visuals.psyllium_skill_mode = False
        visuals.psyllium_mode = "fever" if fever_active else "normal"
        visuals.psyllium_restore_before_color = not fever_active
        visuals.psyllium_restore_smooth = False if not fever_active else None
        if not fever_active:
            visuals.psyllium_color_source = "before_color_array"
        self._refresh_life_hud_visual_state()
        if was_playing:
            self._emit("skill_visuals_finished")

    def _execute_finishing_skill_process(self, delta_time: float) -> None:
        state = self.skill_runtime
        if state.skill_finishing_timer <= 0.0:
            state.skill_play_state = (
                SKILL_PLAY_STATE_BEGIN
                if state.play_list
                else SKILL_PLAY_STATE_NONE
            )
            return
        state.skill_finishing_timer -= delta_time

    def stop_skill_playback(self) -> None:
        state = self.skill_runtime
        state.skill_play_state = SKILL_PLAY_STATE_NONE
        while state.play_list:
            state.current_playing_skill = state.play_list[0]
            self._finish_current_skill(enter_finishing=False)
        state.current_playing_skill = None
        state.skill_timer = 0.0
        state.skill_finishing_timer = 0.0
        state.registered_skill_note_indices.clear()
        state.notes_info_reset_count += 1
        self._emit("skill_playback_stopped")

    def update_fever_member_point(
        self,
        display_index: int,
        point: int,
    ) -> None:
        state = self.fever_runtime
        if display_index not in state.member_points:
            raise ValueError("Fever point update requires an own-team display index")
        if point < 0:
            raise ValueError("Fever point cannot be negative")
        state.member_points[display_index] = point
        if display_index == self.my_display_index:
            state.my_fever_point = point
        if (
            point >= FEVER_LEVEL_ONE_POINT
            and state.pass_conditions[display_index] != FEVER_TIME_STATE_LEVEL_ONE
        ):
            state.pass_conditions[display_index] = FEVER_TIME_STATE_LEVEL_ONE
            self._emit(
                "fever_pass_condition_changed",
                display_index=display_index,
                fever_state_after=FEVER_TIME_STATE_LEVEL_ONE,
                rest_note_count=0,
            )

    def start_fever_time_command(
        self,
        command_type: int,
        game_frame_counter: int | None = None,
    ) -> None:
        if command_type not in {
            FEVER_COMMAND_NONE,
            FEVER_COMMAND_READY,
            FEVER_COMMAND_START,
            FEVER_COMMAND_END,
        }:
            raise ValueError("unsupported Fever command type")
        state = self.fever_runtime
        before_state = state.fever_time_state
        state.fever_time_command_type = command_type
        if command_type == FEVER_COMMAND_START:
            passed_members = sum(
                condition == FEVER_TIME_STATE_LEVEL_ONE
                for condition in state.pass_conditions.values()
            )
            state.fever_time_state = (
                FEVER_TIME_STATE_LEVEL_ONE
                if passed_members >= len(state.team_display_indices)
                else FEVER_TIME_STATE_FAILED
            )
            self._reset_fever_points()
            self._reset_fever_pass_conditions()
        elif command_type == FEVER_COMMAND_END:
            self._reset_fever_points()
            state.fever_time_state = FEVER_TIME_STATE_NONE
        self.fever_score_up_rate = (
            FEVER_LEVEL_ONE_SCORE_RATE
            if state.fever_time_state == FEVER_TIME_STATE_LEVEL_ONE
            else 1.0
        )
        self._emit(
            "fever_command_changed",
            command_id={
                FEVER_COMMAND_NONE: "None",
                FEVER_COMMAND_READY: "FeverReady",
                FEVER_COMMAND_START: "FeverStart",
                FEVER_COMMAND_END: "FeverEnd",
            }[command_type],
            fever_state_before=before_state,
            fever_state_after=state.fever_time_state,
        )
        current_frame = (
            self.skill_runtime.game_frame_counter
            if game_frame_counter is None
            else game_frame_counter
        )
        state.reservation_target_frame = current_frame + 1
        state.reservation_command_type = command_type
        state.reservation_after_state = state.fever_time_state

    def _reset_fever_points(self) -> None:
        state = self.fever_runtime
        state.my_fever_point = 0
        state.last_point = 0
        state.rest_note_count = None
        state.member_points = {index: 0 for index in state.team_display_indices}

    def _reset_fever_pass_conditions(self) -> None:
        state = self.fever_runtime
        state.pass_conditions = {
            index: FEVER_TIME_STATE_NONE for index in state.team_display_indices
        }

    def _consume_additional_note(
        self,
        note: NoteSpec,
        result: str,
        phase: str,
    ) -> None:
        if phase == "head" and note.note_id in self._root_skill_note_ids:
            if result in ("great", "perfect"):
                if self.game_state != MOVE_TIME_GAME_STATE:
                    request = self._build_skill_play_request(note)
                    self.skill_runtime.play_list.append(request)
                    if self.skill_runtime.skill_play_state == SKILL_PLAY_STATE_NONE:
                        self.skill_runtime.skill_play_state = SKILL_PLAY_STATE_BEGIN
                    if self.in_game_mode == 2:
                        self.skill_runtime.network_played_skill_note = (
                            note.skill_note_index
                        )
                    self._emit(
                        "skill_note_enqueued",
                        note_id=note.note_id,
                        skill_note_index=note.skill_note_index,
                        position=note.position,
                    )
            else:
                if self.in_game_mode in SKILL_NOTE_NETWORK_FAILURE_MODES:
                    self.skill_runtime.network_skill_failed = True
                self._emit(
                    "skill_note_failed",
                    note_id=note.note_id,
                    skill_note_index=note.skill_note_index,
                    result=result,
                )

        fever_ids = (
            self._root_fever_note_ids if phase == "head" else self._tail_fever_note_ids
        )
        if note.note_id not in fever_ids:
            return
        point = fever_note_point(self.difficulty, result)
        if point == 0:
            return
        self.fever_runtime.my_fever_point += point
        self.fever_runtime.last_point = point
        self.fever_runtime.rest_note_count = max(
            ceil(
                (FEVER_LEVEL_ONE_POINT - self.fever_runtime.my_fever_point)
                / point
            ),
            0,
        )
        self.update_fever_member_point(
            self.my_display_index,
            self.fever_runtime.my_fever_point,
        )
        self._emit(
            "fever_point_added",
            note_id=note.note_id,
            phase=phase,
            point=point,
            total=self.fever_runtime.my_fever_point,
            rest_note_count=self.fever_runtime.rest_note_count,
        )

    def _build_skill_play_request(self, note: NoteSpec) -> SkillPlayRequest:
        if self.in_game_mode == 2:
            situation_skill_index = 0
            return SkillPlayRequest(
                skill_note_index=note.skill_note_index,
                absolute_position=note.position,
                situation_skill_index=situation_skill_index,
                character_index=self.my_display_index,
                character_info_index=2,
                playback_spec=self.skill_playback_specs.get(situation_skill_index),
            )
        if not 0 < note.skill_note_index <= len(self.skill_chara_list):
            raise ValueError(
                "skill character list must contain every enabled skill-note index"
            )
        character_index = self.skill_chara_list[note.skill_note_index - 1]
        situation_skill_index = character_index
        return SkillPlayRequest(
            skill_note_index=note.skill_note_index,
            absolute_position=note.position,
            situation_skill_index=situation_skill_index,
            character_index=character_index,
            character_info_index=character_index,
            playback_spec=self.skill_playback_specs.get(situation_skill_index),
        )

    def _submit_frame_data(
        self,
        note: NoteSpec,
        raw_result: str,
        adjusted_result: str,
        timing: str | None,
        phase: str,
        damage: int,
        position: float | None = None,
    ) -> None:
        self._frame_data_index += 1
        absolute_position = (
            position
            if position is not None
            else note.end_position
            if phase == "tail"
            else note.position
        )
        adjusted_damage, damage_guard_type, never_die_skill = (
            self._calculate_skill_damage(damage)
        )
        skill_score_up_rate, score_up_type = self._calculate_skill_score_rate(
            adjusted_result
        )
        active_skill = self._active_skill_spec()
        active_effects = active_skill.activate_effects if active_skill else ()
        base_score = score_utility_get_base_score(
            note.base_score,
            is_multi_play_game_over=self.is_multi_play_game_over,
            is_single_play_game_over=self.is_single_play_game_over,
            in_game_mode=self.in_game_mode,
            is_enable_practice=self.is_enable_practice,
            is_collabo_original_music=self.is_collabo_original_music,
        )
        free_live_event_bonus_base_score = score_utility_get_base_score(
            note.free_live_event_bonus_base_score,
            is_multi_play_game_over=self.is_multi_play_game_over,
            is_single_play_game_over=self.is_single_play_game_over,
            in_game_mode=self.in_game_mode,
            is_enable_practice=self.is_enable_practice,
            is_collabo_original_music=self.is_collabo_original_music,
        )
        self._frame_data.append(
            OneFrameData(
                is_use=True,
                index=self._frame_data_index,
                button_types=tuple(range(note.lane, note.lane + note.width)),
                add_score=calculate_base_corrected_score(
                    base_score,
                    adjusted_result,
                    in_game_mode=self.in_game_mode,
                    is_auto_live=self.is_auto_live,
                    result_rates=self.score_config.result_rates,
                    active_effects=active_effects,
                ),
                free_live_event_bonus_add_score=calculate_base_corrected_score(
                    free_live_event_bonus_base_score,
                    adjusted_result,
                    in_game_mode=self.in_game_mode,
                    is_auto_live=self.is_auto_live,
                    result_rates=self.score_config.result_rates,
                    active_effects=active_effects,
                ),
                add_power=-adjusted_damage,
                add_combo=1 if adjusted_result in ("perfect", "great") else -1,
                note_type=f"{note.kind}:{phase}",
                raw_result=raw_result,
                adjusted_result=adjusted_result,
                fever_score_up_rate=self.fever_score_up_rate,
                skill_score_up_rate=skill_score_up_rate,
                crescendo_score_up_rate=self.crescendo_score_up_rate,
                crescendo_skill_score_up_rate=(
                    self.skill_runtime.crescendo_skill_score_up_rate
                ),
                score_up_type=score_up_type,
                absolute_position=absolute_position,
                damage_guard_type=damage_guard_type,
                judge_timing=(
                    timing
                    if adjusted_result in ("bad", "good", "great")
                    else None
                ),
                cached_score_up_rate=(
                    self.fever_score_up_rate * skill_score_up_rate
                ),
                damage=adjusted_damage,
                never_die_skill=never_die_skill,
            )
        )
        if self._defer_reflection == 0:
            self.reflect_one_frame_data()

    def _active_skill_spec(self) -> SkillPlaybackSpec | None:
        request = self.skill_runtime.current_playing_skill
        return request.playback_spec if request is not None else None

    def _correct_result_with_skill(self, result: str) -> str:
        spec = self._active_skill_spec()
        if spec is None:
            return result
        result_rank = NOTE_RESULT_RANKS[result]
        for effect in spec.activate_effects:
            if (
                effect.effect_type == "judge"
                and NOTE_RESULT_RANKS[effect.condition] <= result_rank
            ):
                return "perfect"
        return result

    def _calculate_skill_damage(self, damage: int) -> tuple[int, int, bool]:
        spec = self._active_skill_spec()
        if spec is None:
            return damage, 0, self.never_die_skill
        native_add_damage = -damage
        damage_guard_type = 0
        never_die_skill = False
        for effect in spec.activate_effects:
            if effect.effect_type == "never_die":
                damage_guard_type = 2
                never_die_skill = True
            elif effect.effect_type == "damage":
                if effect.value_type == "real_value":
                    native_add_damage += int(effect.value)
                elif effect.value_type == "rate" and native_add_damage < 0:
                    native_add_damage = int(
                        effect.value * native_add_damage / 100.0
                    )
                    if effect.value == 0.0 and self.hud.life >= 1:
                        damage_guard_type = 1
        return max(0, -native_add_damage), damage_guard_type, never_die_skill

    def _calculate_skill_score_rate(self, result: str) -> tuple[float, int]:
        spec = self._active_skill_spec()
        if spec is None:
            return self.skill_score_up_rate, 0
        rate = self.skill_score_up_rate
        score_up_type = 0
        result_rank = NOTE_RESULT_RANKS[result]
        continuous_condition_failed = False
        for effect in spec.activate_effects:
            if effect.value_type != "rate":
                continue
            effect_type = effect.effect_type
            if effect_type == "score":
                if NOTE_RESULT_RANKS[effect.condition] > result_rank:
                    continue
                score_up_type = 2 if effect.condition == "perfect" else 1
            elif effect_type == "score_over_life":
                if self.hud.life < effect.condition_life:
                    continue
                score_up_type = (
                    1
                    if spec.once_effect_condition_life_type == "under_life"
                    else 2
                )
            elif effect_type == "score_under_life":
                if self.hud.life >= effect.condition_life:
                    continue
                score_up_type = 1
            elif effect_type == "score_continued_note_judge":
                current = self.skill_runtime.judge_continuous_result_type or "perfect"
                if result_rank < NOTE_RESULT_RANKS[current]:
                    current = result
                    self.skill_runtime.judge_continuous_result_type = result
                if NOTE_RESULT_RANKS[effect.condition] > NOTE_RESULT_RANKS[current]:
                    continuous_condition_failed = True
                    continue
                value = (
                    effect.unification_value
                    if effect.unification_satisfied
                    else effect.value
                )
                return 1.0 + value / 100.0, 2
            elif effect_type == "score_rate_up_with_perfect":
                score_up_type = 5
                if result == "perfect":
                    accumulated = (
                        self.skill_runtime.crescendo_skill_score_up_rate
                        + effect.stack_value
                    )
                    maximum = effect.max_value - (rate - 1.0) * 100.0
                    self.skill_runtime.crescendo_skill_score_up_rate = min(
                        accumulated,
                        maximum,
                    )
                return (
                    rate
                    + self.skill_runtime.crescendo_skill_score_up_rate / 100.0,
                    score_up_type,
                )
            elif effect_type == "score_only_perfect":
                if result != "perfect":
                    return 0.0, 3 if result in ("good", "great") else 0
                score_up_type = 2
            elif effect_type == "score_under_great_half":
                if result != "perfect":
                    return 0.5 if result in ("good", "great") else 0.0, (
                        4 if result in ("good", "great") else 0
                    )
                score_up_type = 2
            else:
                continue
            value = (
                effect.value
                if continuous_condition_failed or not effect.unification_satisfied
                else effect.unification_value
            )
            rate *= 1.0 + value / 100.0
        return rate, score_up_type

    def _result_for(self, note: NoteSpec, position: float) -> tuple[str | None, str | None]:
        return self._result_for_position(note.position, position, self.sweet_frame)

    def _result_for_position(
        self, target_position: float, position: float, sweet_frame: int
    ) -> tuple[str | None, str | None]:
        frames = self._frame_distance_at(target_position, position)
        if frames < sweet_frame + 3:
            return "perfect", None
        if frames < sweet_frame + 6:
            result = "great"
        elif frames < sweet_frame + 7:
            result = "good"
        elif frames < sweet_frame + 8:
            result = "bad"
        else:
            return None, None
        return result, "slow" if target_position - position <= 0 else "fast"

    def _frame_distance(self, note: NoteSpec, position: float) -> int:
        return self._frame_distance_at(note.position, position)

    def _frame_distance_at(self, target_position: float, position: float) -> int:
        bpm = self.engine.tempo_map.bpm_at(target_position)
        units_per_second = self.engine.tempo_map.units_per_bar * bpm / 240.0
        return floor(abs(target_position - position) / units_per_second * 60.0 + 0.5)

    def _emit(self, kind: str, **values: object) -> None:
        self._sequence += 1
        self.events.append(GameplayEvent(self._sequence, kind, **values))


def build_demo() -> RuntimeIntegration:
    runtime = RuntimeIntegration(
        TempoMap([TempoChange(0, 120), TempoChange(480, 180)]),
        [
            NoteSpec("tap-left", 120, 1),
            NoteSpec("flick-right", 240, 6, "flick"),
            NoteSpec("long-center", 360, 3, "long", 540),
        ],
    )
    for frame in range(5 * 60):
        runtime.update(FRAME_SECONDS)
        if frame == 59:
            runtime.touch_began(0, 1)
        elif frame == 119:
            runtime.touch_began(0, 6)
            runtime.touch_moved(0, 0.05)
        elif frame == 179:
            runtime.touch_began(0, 3)
    runtime.pause()
    runtime.update(1.0)
    runtime.resume()
    for _ in range(2 * 60):
        runtime.update(FRAME_SECONDS)
    return runtime


def sweet_frame_limit(sweet_frame: int) -> int:
    return sweet_frame + 8


if __name__ == "__main__":
    print(json.dumps(build_demo().snapshot(), ensure_ascii=False, indent=2))

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import json
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parent))
from runtime_integration import (
    FRAME_SECONDS,
    BEZIER_LANE_KEY_CODES,
    BEZIER_POSITION_QUANTUM,
    MUSIC_BAR_DIVISION_COUNT,
    BezierChartNote,
    BezierMusicScoreNote,
    BezierSourceNote,
    MusicScoreHeaderState,
    NoteBatchInformationRecord,
    NoteInformationRecord,
    NoteSpec,
    DeckScoreParameters,
    BaseScoreProfile,
    EventParameterBuffSource,
    EventParameterFlatBuffSource,
    FreeLiveEventBonusMemberInput,
    FreeLiveEventBonusDeckProfile,
    FreeLiveEventBonusStartDataState,
    OneFrameData,
    LaneChangeCommandSpec,
    SlideTailSideNodeSpec,
    RuntimeIntegration,
    ResourceCatalog,
    RenderProjectionConfig,
    RHYTHM_REFERENCE_SCREEN_SIZE_X,
    STAR_UI_SCREEN_WIDTH_BASE,
    NoteMeshRuntimeState,
    MULTIPLE_DIRECTIONAL_FLICK_Z_STEP,
    NOTE_MESH_MATERIAL_BINDINGS,
    NOTE_MESH_TEXTURE_PROFILES,
    NOTE_MESH_TEXTURE_SETTINGS,
    SYNC_NOTE_LINE_BINDING,
    SYNC_LINE_TEXTURE_PROFILES,
    STAR_TRANSPARENT_COLORED_SHADER_NAME,
    MULTIPLE_FLICK_BACK_LINE_BINDINGS,
    MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW,
    MULTIPLE_FLICK_BACK_LINE_TEXTURE_PROFILES,
    MULTIPLE_FLICK_BACK_LINE_TEXTURE_SETTINGS,
    MULTIPLE_FLICK_BACK_LINE_SERIALIZED_THRESHOLD,
    MULTIPLE_FLICK_BACK_LINE_SHADER_NAME,
    activate_note_mesh,
    build_advanced_note_strip,
    build_life_hud_visual_state,
    build_multiple_flick_back_line_geometry,
    build_multiple_flick_back_line_textured_quad,
    build_sync_line_geometry,
    build_slide_tail_connection_graph,
    build_note_mesh_colors,
    build_note_strip_uvs,
    deactivate_note_mesh,
    deactivate_slide_after_node,
    change_slide_tail_side_notes_used,
    consume_slide_tail_connection_side,
    consume_slide_tail_side_notes,
    disable_slide_tail_side_sprites,
    hide_note_mesh_renderer,
    get_sudden_pos,
    note_mesh_should_update,
    setup_note_mesh_color,
    shade_multiple_flick_back_line,
    shade_star_transparent_colored,
    sync_line_edge_margin,
    sync_line_texture_profile,
    sync_line_texture_sample,
    mesh_width_rate,
    multiple_flick_back_line_side,
    multiple_flick_back_line_texture_profile,
    multiple_flick_back_line_texture_sample,
    multiple_flick_back_line_texture_texel,
    multiple_directional_flick_side_z_positions,
    multiple_directional_side_visual_route,
    note_mesh_material_binding,
    note_mesh_texture_profile,
    note_mesh_texture_sample,
    note_sprite_key,
    note_sprite_resource_id,
    project_note_boundary,
    sample_bilinear_clamp_srgb,
    note_arrival_seconds,
    calc_progress_rate,
    calc_note_position,
    virtual_lane_note_x,
    calc_note_scale,
    calculate_after_note_virtual_scale,
    get_after_note_scale,
    judge_cue_audio_profile,
    judge_cue_sheet_profile,
    skill_cue_audio_profile,
    evaluate_skill_ui_animation,
    evaluate_all_perfect_alpha,
    evaluate_combo_number_scale,
    format_score_hud_digits,
    evaluate_flick_icon_animation,
    front_flick_icon_visual_route,
    judge_audio_global_profile,
    judge_audio_player_profile,
    RhythmAdjustLatencyProfile,
    JudgementTimingAdjustmentProfile,
    PersistentSettingsSaveProfile,
    FrameRateControlState,
    secondary_adjusted_music_position,
    secondary_slide_release_result,
    rhythm_adjust_average,
    rhythm_adjust_judgement,
    rhythm_adjust_phase,
    evaluate_slide_move_state,
    evaluate_slide_stop_state,
    evaluate_slide_stop_miss,
    SlideAfterLifecycleState,
    SCALE_MIN_RATIO_LIST,
    seconds_between_positions,
    signed_seconds_between_positions,
    move_to_next_after_note_x,
    note_manager_execute_frame,
    advance_note_manager_performance,
    advance_note_manager_two_phase_substeps,
    advance_slide_tail_back_lines,
    advance_slide_tail_connection_owner,
    NoteManagerPerformanceState,
    slide_after_miss_type,
    slide_tail_visual_route,
    slide_tail_subclass_from_after_note_type,
    set_slide_tail_connection_node_state,
    set_slide_tail_note_state,
    SLIDE_AFTER_MISS_SECOND_INTERVAL,
    flick_cue_role,
    note_file_name_base,
    note_spec_from_information,
    gameplay_chart_from_information_batches,
    gameplay_chart_from_bms,
    game_play_button_directional_finger_particle,
    game_play_button_particle_route,
    gameplay_button_judge_note_type,
    note_specs_from_information_batches,
    tempo_map_from_bms,
    ScoreConfig,
    STANDARD_COMBO_RATE_STEPS,
    STANDARD_RESULT_CORRECTION_RATES,
    FEVER_NOTE_POINT_TABLE,
    FEVER_TIME_STATE_NONE,
    FEVER_TIME_STATE_LEVEL_ONE,
    FEVER_TIME_STATE_FAILED,
    FEVER_COMMAND_READY,
    FEVER_COMMAND_START,
    FEVER_COMMAND_END,
    FEVER_LEVEL_ONE_SCORE_RATE,
    additional_note_consumer_counts,
    calculate_base_score,
    calculate_base_corrected_score,
    construct_free_live_event_bonus_deck,
    initialize_base_scores,
    max_note_count_from_notes,
    score_utility_get_base_score,
    unity_mathf_approximately,
    fever_note_point,
    score_rate_by_music_play_level,
    skill_note_enabled,
    SkillActivateEffectSpec,
    SkillPlaybackSpec,
    SKILL_PLAY_STATE_NONE,
    SKILL_PLAY_STATE_BEGIN,
    SKILL_PLAY_STATE_PLAYING,
    SKILL_PLAY_STATE_FINISHING,
    SKILL_FINISHING_SECONDS,
    SKILL_SE_CUE_IDS,
    BpmChangeCommandSpec,
    create_note_filename_map,
    expand_bezier_segment,
    expand_bezier_triplets,
    normalize_bezier_wav_name,
    collapse_bezier_samples,
    bms_materials_to_information_batches,
    convert_bezier_chart_notes,
    convert_bezier_music_score_text,
    parse_bms_note_materials,
    parse_bezier_music_score_notes,
    postprocess_bezier_samples,
    reduce_bezier_samples,
    serialize_bezier_music_score_lines,
    sort_force_control_notes,
    TempoChange,
    TempoMap,
    LIFE_DANGEROUS_GAUGE_COLOR,
    LIFE_NORMAL_GAUGE_COLOR,
)
from extract_note_filename_bases import extract


class RuntimeIntegrationTests(unittest.TestCase):
    def make_runtime(self) -> RuntimeIntegration:
        return RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec("tap", 120, 1),
                NoteSpec("flick", 240, 6, "flick"),
                NoteSpec("long", 360, 3, "long", 480),
            ],
        )

    def make_active_skill_runtime(
        self,
        effects: tuple[SkillActivateEffectSpec, ...],
        life: int = 1_000,
        once_effect_condition_life_type: str = "none",
    ) -> tuple[RuntimeIntegration, NoteSpec]:
        skill_note = NoteSpec(
            "activate-skill",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        target = NoteSpec("skill-target", 10_000, 3)
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [skill_note, target],
            skill_chara_list=(4,),
            skill_playback_specs=(
                SkillPlaybackSpec(
                    4,
                    900,
                    10.0,
                    once_effect_condition_life_type=once_effect_condition_life_type,
                    activate_effects=effects,
                ),
            ),
        )
        runtime.hud.life = life
        runtime._resolve(skill_note, "perfect", None, "head")
        runtime.update(0.0)
        self.assertEqual(
            runtime.skill_runtime.skill_play_state,
            SKILL_PLAY_STATE_PLAYING,
        )
        return runtime, target

    def test_auto_live_resolves_normal_at_adjusted_position_crossing(self) -> None:
        note = NoteSpec("auto-normal", 120, 2, "normal")
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=True,
        )

        for _ in range(59):
            runtime.update(FRAME_SECONDS)
        self.assertNotIn(note.note_id, runtime._judged)
        runtime.update(FRAME_SECONDS)

        self.assertIn(note.note_id, runtime._judged)
        judge = next(event for event in runtime.events if event.kind == "judge")
        self.assertEqual((judge.result, judge.phase), ("perfect", "head"))

    def test_auto_live_positive_b_advances_crossing_by_four_frames(self) -> None:
        note = NoteSpec("auto-b-four", 120, 2, "normal")
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=True,
            judgement_adjust_value_b=4,
        )

        for _ in range(55):
            runtime.update(FRAME_SECONDS)
        self.assertNotIn(note.note_id, runtime._judged)
        runtime.update(FRAME_SECONDS)

        self.assertIn(note.note_id, runtime._judged)
        self.assertAlmostEqual(runtime.engine.clock.in_game_seconds, 56 / 60)
        self.assertEqual(runtime.render_projection.slide_adjust_value_b, 4)

    def test_non_auto_live_does_not_resolve_at_note_crossing(self) -> None:
        note = NoteSpec("manual-normal", 120, 2, "normal")
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=False,
        )

        for _ in range(60):
            runtime.update(FRAME_SECONDS)

        self.assertNotIn(note.note_id, runtime._judged)
        self.assertFalse(any(event.kind == "judge" for event in runtime.events))

    def test_auto_live_simultaneous_notes_share_one_frame_total(self) -> None:
        notes = (
            NoteSpec("auto-left", 120, 1, "normal"),
            NoteSpec("auto-right", 120, 5, "normal"),
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            notes,
            is_auto_live=True,
        )

        for _ in range(60):
            runtime.update(FRAME_SECONDS)

        self.assertEqual(runtime.last_frame_total.entry_count, 2)
        self.assertEqual(runtime.last_frame_total.add_combo, 2)
        self.assertEqual(runtime.hud.combo, 2)

    def test_auto_live_particle_play_generation_occurs_once(self) -> None:
        note = NoteSpec("auto-particle", 120, 2, "normal")
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=True,
        )

        for _ in range(60):
            runtime.update(FRAME_SECONDS)
        perfect_states = [
            state
            for state in runtime.render.particle_systems.values()
            if state.prefab_name == "effect_tap_perfect"
        ]
        self.assertEqual(len(perfect_states), 1)
        self.assertEqual(perfect_states[0].play_generation, 1)

        runtime.update(FRAME_SECONDS)
        self.assertEqual(perfect_states[0].play_generation, 1)

    def test_judgement_adjust_value_b_rejects_out_of_range_values(self) -> None:
        for value in (-6, 6):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "range -5..5"):
                    RuntimeIntegration(
                        TempoMap([TempoChange(0, 120)]),
                        [],
                        judgement_adjust_value_b=value,
                    )

    def test_auto_live_long_resolves_head_and_tail_at_adjusted_crossings(self) -> None:
        note = NoteSpec("auto-long", 120, 2, "long", 240)
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=True,
            judgement_adjust_value_b=4,
        )

        for _ in range(56):
            runtime.update(FRAME_SECONDS)
        self.assertIn(note.note_id, runtime._started_holds)
        self.assertNotIn(note.note_id, runtime._judged)

        for _ in range(59):
            runtime.update(FRAME_SECONDS)
        self.assertNotIn(note.note_id, runtime._judged)
        runtime.update(FRAME_SECONDS)

        self.assertIn(note.note_id, runtime._judged)
        self.assertEqual(
            [(event.result, event.phase) for event in runtime.events if event.kind == "judge"],
            [("perfect", "head"), ("perfect", "tail")],
        )

    def test_auto_live_slide_advances_one_pending_node_per_update(self) -> None:
        note = NoteSpec(
            "auto-slide",
            120,
            2,
            "slide",
            240,
            intermediate_positions=(180, 181),
            intermediate_lanes=(3, 4),
            intermediate_widths=(1, 1),
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=True,
        )

        for _ in range(100):
            runtime.update(FRAME_SECONDS)

        intermediate_events = [
            event
            for event in runtime.events
            if event.kind == "judge" and event.phase == "intermediate"
        ]
        self.assertEqual(len(intermediate_events), 2)
        self.assertEqual([event.result for event in intermediate_events], ["perfect", "perfect"])
        self.assertEqual(runtime._intermediate_index[note.note_id], 2)
        self.assertNotIn(note.note_id, runtime._judged)

        for _ in range(20):
            runtime.update(FRAME_SECONDS)
        self.assertIn(note.note_id, runtime._judged)
        self.assertEqual(
            [event.phase for event in runtime.events if event.kind == "judge"],
            ["head", "intermediate", "intermediate", "tail"],
        )

    def test_auto_live_slide_does_not_consume_two_nodes_in_one_update(self) -> None:
        note = NoteSpec(
            "auto-slide-large-frame",
            120,
            2,
            "slide",
            240,
            intermediate_positions=(180, 181),
            intermediate_lanes=(3, 4),
            intermediate_widths=(1, 1),
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=True,
        )

        runtime.update(1.6)
        self.assertIn(note.note_id, runtime._started_holds)
        self.assertEqual(runtime._intermediate_index[note.note_id], 0)
        runtime.update(FRAME_SECONDS)
        self.assertEqual(runtime._intermediate_index[note.note_id], 1)
        runtime.update(FRAME_SECONDS)
        self.assertEqual(runtime._intermediate_index[note.note_id], 2)

    def test_auto_live_simultaneous_hold_heads_share_frame_total(self) -> None:
        notes = (
            NoteSpec("auto-long-left", 120, 1, "long", 240),
            NoteSpec("auto-slide-right", 120, 5, "slide", 240),
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            notes,
            is_auto_live=True,
        )

        for _ in range(60):
            runtime.update(FRAME_SECONDS)

        self.assertEqual(runtime.last_frame_total.entry_count, 2)
        self.assertEqual(runtime.hud.combo, 2)

    def test_auto_live_flick_uses_adjusted_crossing_and_flick_cue(self) -> None:
        note = NoteSpec("auto-flick", 120, 2, "flick")
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=True,
            judgement_adjust_value_b=4,
        )

        for _ in range(56):
            runtime.update(FRAME_SECONDS)

        judge = next(event for event in runtime.events if event.kind == "judge")
        self.assertEqual((judge.result, judge.phase), ("perfect", "head"))
        self.assertIn("judge:flick", runtime.audio.cues)
        self.assertAlmostEqual(runtime.engine.clock.in_game_seconds, 56 / 60)

    def test_auto_live_directional_flick_starts_result_and_finger_particles(self) -> None:
        note = NoteSpec("auto-directional", 120, 2, "directional_flick_left")
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            is_auto_live=True,
        )

        for _ in range(60):
            runtime.update(FRAME_SECONDS)

        prefabs = {
            state.prefab_name: state.play_generation
            for state in runtime.render.particle_systems.values()
        }
        self.assertEqual(prefabs["effect_tap_directional_flick_l"], 1)
        self.assertEqual(prefabs["effect_tap_directional_flick_l_finger"], 1)

    def test_auto_live_normal_and_flick_share_frame_total(self) -> None:
        notes = (
            NoteSpec("auto-normal-frame", 120, 1, "normal"),
            NoteSpec("auto-flick-frame", 120, 5, "flick"),
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            notes,
            is_auto_live=True,
        )

        for _ in range(60):
            runtime.update(FRAME_SECONDS)

        self.assertEqual(runtime.last_frame_total.entry_count, 2)
        self.assertEqual(runtime.hud.combo, 2)

    def test_note_information_record_maps_normal_wide_lane_and_virtual_lane(self) -> None:
        normal = note_spec_from_information(
            NoteInformationRecord(
                "wide-skill",
                2,
                0,
                120,
                button_types=(1, 2, 3),
                short_rhythm_under_8beat=True,
                virtual_lane_direction=1,
                virtual_lane_distance=4,
                game_note_additional_type=2,
            )
        )
        self.assertIsNotNone(normal)
        assert normal is not None
        self.assertEqual(normal.kind, "normal")
        self.assertEqual((normal.lane, normal.width), (1, 3))
        self.assertEqual(normal.virtual_lane_direction, "left")
        self.assertEqual(normal.virtual_lane_distance, 4)
        self.assertTrue(normal.short_rhythm_under_8beat)
        self.assertEqual(normal.game_note_additional_type, 2)

    def test_note_information_record_rejects_noncontiguous_buttons(self) -> None:
        with self.assertRaisesRegex(ValueError, "must be contiguous"):
            note_spec_from_information(
                NoteInformationRecord(
                    "bad-range",
                    1,
                    0,
                    120,
                    button_types=(1, 3),
                )
            )

    def test_note_information_long_pair_maps_terminal_gesture(self) -> None:
        root = NoteInformationRecord(
            "long-root",
            4,
            1,
            120,
            after_note_type=4,
            after_note_absolute_pos=360,
            game_note_additional_type=1,
            game_note_additional_type_long_end=2,
            skill_after_note_index=7,
        )
        related = (
            root,
            NoteInformationRecord("long-terminal", -1, 12, 360),
            NoteInformationRecord("long-add", 3, 18, 360),
        )
        spec = note_spec_from_information(root, related)
        self.assertIsNotNone(spec)
        assert spec is not None
        self.assertEqual(spec.kind, "long")
        self.assertEqual(spec.end_position, 360.0)
        self.assertEqual((spec.end_lane, spec.end_width), (4, 1))
        self.assertEqual(spec.end_gesture, "multiple_left")
        self.assertEqual(spec.end_game_note_type, 12)
        self.assertEqual(spec.multiple_note_count, 2)
        self.assertEqual(spec.game_note_additional_type, 1)
        self.assertEqual(spec.end_game_note_additional_type, 2)
        self.assertEqual(spec.skill_after_note_index, 7)

    def test_standalone_directional_group_preserves_directional_anchor(self) -> None:
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord("left-side", 1, 10, 120),
                        NoteInformationRecord("left-anchor", 2, 10, 120),
                        NoteInformationRecord("right-anchor", 4, 11, 120),
                        NoteInformationRecord("right-side", 5, 11, 120),
                    ),
                ),
            )
        )
        self.assertEqual(
            tuple(
                (
                    spec.note_id,
                    spec.lane,
                    spec.width,
                    spec.directional_anchor_lane,
                )
                for spec in specs
            ),
            (
                ("left-anchor", 1, 2, 2),
                ("right-anchor", 4, 2, 4),
            ),
        )

    def test_note_information_batch_builds_slide_graph_from_chart_order(self) -> None:
        intermediate = NoteInformationRecord(
            "slide-middle",
            2,
            4,
            240,
            button_types=(2, 3),
            is_invisible=True,
        )
        terminal = NoteInformationRecord(
            "slide-terminal",
            4,
            14,
            360,
            virtual_lane_direction=2,
            virtual_lane_distance=5,
        )
        root = NoteInformationRecord(
            "slide-root",
            1,
            4,
            120,
            after_note_type=11,
            is_slide_note_head=True,
            virtual_lane_direction=1,
            virtual_lane_distance=2,
            slide_note_list=(intermediate, terminal),
        )
        side_left = NoteInformationRecord("slide-side-left", 2, 20, 360)
        side_middle = NoteInformationRecord("slide-side-middle", 3, 20, 360)
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (root, intermediate, terminal, side_left, side_middle),
                ),
            )
        )
        self.assertEqual(len(specs), 1)
        spec = specs[0]
        self.assertEqual(spec.kind, "slide")
        self.assertEqual(spec.intermediate_positions, (240.0,))
        self.assertEqual(spec.intermediate_lanes, (2,))
        self.assertEqual(spec.intermediate_widths, (2,))
        self.assertEqual(spec.intermediate_invisible, (True,))
        self.assertEqual((spec.end_lane, spec.end_width), (4, 1))
        self.assertEqual(spec.end_game_note_type, 14)
        self.assertEqual(spec.end_gesture, "multiple_left")
        self.assertEqual(spec.end_virtual_lane_direction, "right")
        self.assertEqual(spec.end_virtual_lane_distance, 5)
        self.assertEqual(spec.multiple_left_count, 2)
        self.assertEqual(spec.multiple_right_count, 0)
        self.assertEqual(spec.multiple_note_count, 3)
        self.assertEqual(spec.end_source_order, 2)
        self.assertEqual(
            tuple(node.source_order for node in spec.multiple_side_nodes),
            (3, 4),
        )
        runtime = RuntimeIntegration(TempoMap([TempoChange(0, 120)]), specs)
        self.assertEqual(runtime.notes, specs)

    def test_note_information_separates_lane_change_command(self) -> None:
        chart = gameplay_chart_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord("front-left", 1, 0, 120),
                        NoteInformationRecord(
                            "habahiro-change",
                            2,
                            0,
                            120,
                            game_note_additional_type=4,
                            sound_value="lane_change",
                            cc_num=13,
                            cc_nums=(13,),
                        ),
                        NoteInformationRecord("front-right", 5, 0, 120),
                    ),
                ),
            )
        )
        self.assertEqual(
            tuple(note.note_id for note in chart.notes),
            ("front-left", "front-right"),
        )
        self.assertEqual(chart.notes[1].sync_target_id, "front-left")
        self.assertEqual(
            chart.lane_change_commands,
            (
                LaneChangeCommandSpec(
                    "habahiro-change",
                    120.0,
                    3,
                    (13,),
                ),
            ),
        )
        self.assertEqual(
            note_specs_from_information_batches(
                (
                    NoteBatchInformationRecord(
                        0,
                        1,
                        1,
                        120,
                        (
                            NoteInformationRecord(
                                "habahiro-change",
                                2,
                                0,
                                120,
                                game_note_additional_type=4,
                                cc_num=13,
                                cc_nums=(13,),
                            ),
                        ),
                    ),
                )
            ),
            (),
        )

    def test_bms_chart_separates_first_bpm_command_per_batch(self) -> None:
        parsed = parse_bms_note_materials(
            (
                "#BPM 120",
                "#BPM0A 180.5",
                "#WAV01 normal.wav",
                "#00108:0A",
                "#00103:78",
                "#00111:01",
            ),
            convert_bezier=False,
        )
        chart = gameplay_chart_from_bms(parsed)
        self.assertEqual((chart.start_bpm, chart.start_bpm_string), (120.0, "120"))
        self.assertEqual(tuple(note.note_id for note in chart.notes), ("bms-1-0-1-1-2",))
        self.assertEqual(len(chart.bpm_change_commands), 1)
        command = chart.bpm_change_commands[0]
        self.assertEqual(
            (
                command.position,
                command.bpm,
                command.bpm_string,
                command.cc_num,
            ),
            (192.0, 180.5, "180.5", 8),
        )
        tempo_map = tempo_map_from_bms(parsed)
        self.assertEqual(tempo_map.units_per_bar, 192)
        self.assertEqual(
            tuple((change.position, change.bpm) for change in tempo_map.changes),
            ((0.0, 120.0), (192.0, 180.5)),
        )

    def test_bms_chart_preserves_multi_range_noteskin_route(self) -> None:
        parsed = parse_bms_note_materials(
            (
                "#HABAHIRO",
                "#BPM 120",
                "#WAV01 normal.wav",
                "#00111:01",
            ),
            convert_bezier=False,
        )
        chart = gameplay_chart_from_bms(parsed)
        self.assertTrue(chart.is_multi_range)
        runtime = RuntimeIntegration.from_chart(chart)
        self.assertTrue(runtime.is_multi_range)
        self.assertEqual(runtime.note_skin_profile, "habahiro")

    def test_note_information_batch_filters_terminal_and_additional_nodes(self) -> None:
        root = NoteInformationRecord("directional", 4, 10, 120)
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        root,
                        NoteInformationRecord("directional-add", 3, 18, 120),
                        NoteInformationRecord("separate-group-add", 1, 18, 120),
                        NoteInformationRecord("long-end", -1, 3, 240),
                    ),
                ),
            )
        )
        self.assertEqual(len(specs), 1)
        self.assertEqual(specs[0].kind, "directional_flick_left")
        self.assertEqual(specs[0].multiple_note_count, 2)

    def test_note_information_batch_connects_simple_fronts_in_source_order(self) -> None:
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord("source-first", 6, 0, 120),
                        NoteInformationRecord("source-second", 2, 2, 120),
                        NoteInformationRecord("source-third", 4, 0, 120),
                    ),
                ),
            )
        )
        self.assertEqual(
            tuple((spec.note_id, spec.sync_target_id) for spec in specs),
            (
                ("source-first", None),
                ("source-second", "source-first"),
                ("source-third", "source-second"),
            ),
        )

    def test_note_information_batch_connects_long_tail_before_front_chain(self) -> None:
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord(
                            "long-before",
                            1,
                            1,
                            120,
                            after_note_type=0,
                            after_note_absolute_pos=240,
                        ),
                    ),
                ),
                NoteBatchInformationRecord(
                    0,
                    2,
                    1,
                    240,
                    (
                        NoteInformationRecord("tail-peer-a", 3, 0, 240),
                        NoteInformationRecord("tail-peer-b", 5, 0, 240),
                    ),
                ),
            )
        )
        self.assertEqual(
            tuple(
                (
                    spec.note_id,
                    spec.sync_target_id,
                    spec.end_sync_target_id,
                )
                for spec in specs
            ),
            (
                ("long-before", None, "tail-peer-a"),
                ("tail-peer-a", None, None),
                ("tail-peer-b", "tail-peer-a", None),
            ),
        )
        tail_connection = specs[0].sync_connections[0]
        self.assertEqual(tail_connection.owner.endpoint, "end")
        self.assertEqual(tail_connection.target.endpoint, "front")

    def test_note_information_batch_reconnects_multiple_directional_far_edge(self) -> None:
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord("ordinary", 1, 0, 120),
                        NoteInformationRecord(
                            "multiple-root",
                            4,
                            10,
                            120,
                            fire_note_type=6,
                        ),
                        NoteInformationRecord(
                            "multiple-add",
                            3,
                            18,
                            120,
                            fire_note_type=6,
                        ),
                    ),
                ),
            )
        )
        self.assertEqual(len(specs), 2)
        self.assertEqual(
            tuple(spec.sync_target_id for spec in specs),
            (None, "ordinary"),
        )
        connection = specs[1].sync_connections[0]
        self.assertEqual(connection.owner.endpoint, "front_right")
        self.assertEqual(connection.target.endpoint, "front")

    def test_note_information_batch_pairs_two_ordinary_long_ends(self) -> None:
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord(
                            "long-a",
                            1,
                            1,
                            120,
                            after_note_type=0,
                            after_note_absolute_pos=240,
                        ),
                    ),
                ),
                NoteBatchInformationRecord(
                    0,
                    3,
                    2,
                    180,
                    (
                        NoteInformationRecord(
                            "long-b",
                            5,
                            1,
                            180,
                            after_note_type=0,
                            after_note_absolute_pos=240,
                        ),
                    ),
                ),
                NoteBatchInformationRecord(0, 2, 1, 240, ()),
            )
        )
        self.assertEqual(len(specs), 2)
        self.assertEqual(specs[0].end_sync_target_id, None)
        self.assertEqual(specs[1].end_sync_target_id, "long-a")
        connection = specs[1].sync_connections[0]
        self.assertEqual(connection.owner.endpoint, "end")
        self.assertEqual(connection.target.endpoint, "end")

    def test_note_information_batch_selects_long_multiple_far_end(self) -> None:
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord(
                            "long-multiple",
                            4,
                            1,
                            120,
                            after_note_type=4,
                            after_note_absolute_pos=240,
                        ),
                        NoteInformationRecord("long-side-near", 3, 18, 240),
                        NoteInformationRecord("long-side-far", 2, 18, 240),
                    ),
                ),
                NoteBatchInformationRecord(
                    0,
                    2,
                    1,
                    240,
                    (NoteInformationRecord("tail-peer", 6, 0, 240),),
                ),
            )
        )
        self.assertEqual(len(specs), 2)
        self.assertEqual(specs[0].multiple_note_count, 3)
        connection = specs[0].sync_connections[0]
        self.assertEqual(connection.owner.endpoint, "end_left")
        self.assertIsNone(connection.owner.node_id)
        self.assertEqual(connection.target.note_id, "tail-peer")

    def test_note_information_batch_selects_slide_far_side_node(self) -> None:
        terminal = NoteInformationRecord("slide-terminal", 4, 14, 240)
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord(
                            "slide-multiple",
                            4,
                            4,
                            120,
                            after_note_type=11,
                            is_slide_note_head=True,
                            slide_note_list=(terminal,),
                        ),
                        terminal,
                        NoteInformationRecord("slide-side-near", 3, 20, 240),
                        NoteInformationRecord("slide-side-far", 2, 20, 240),
                    ),
                ),
                NoteBatchInformationRecord(
                    0,
                    2,
                    1,
                    240,
                    (NoteInformationRecord("slide-tail-peer", 6, 0, 240),),
                ),
            )
        )
        self.assertEqual(len(specs), 2)
        connection = specs[0].sync_connections[0]
        self.assertEqual(connection.owner.endpoint, "end_left")
        self.assertEqual(connection.owner.node_id, "slide-side-far")
        self.assertEqual(connection.target.note_id, "slide-tail-peer")

    def test_bezier_segment_uses_native_bar_and_lane_constants(self) -> None:
        notes = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 1.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=True,
        )
        self.assertEqual(MUSIC_BAR_DIVISION_COUNT, 192)
        self.assertEqual(BEZIER_POSITION_QUANTUM, 3)
        self.assertEqual(BEZIER_LANE_KEY_CODES, (36, 31, 32, 33, 34, 35, 38))
        self.assertTrue(notes)
        self.assertTrue(all(note.absolute_pos % 3 == 0 for note in notes))
        self.assertTrue(all(note.lane_id == "31" for note in notes))
        self.assertTrue(all(note.note_wav_name == "slide_a.wav" for note in notes))

    def test_bezier_segment_skips_quantized_start_and_end(self) -> None:
        notes = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 1.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=False,
        )
        self.assertNotIn(0, {note.absolute_pos for note in notes})
        self.assertNotIn(192, {note.absolute_pos for note in notes})
        middle = next(note for note in notes if note.absolute_pos == 96)
        self.assertEqual((middle.bar_number, middle.line_info), (0, "#00031:"))
        self.assertEqual(middle.note_wav_name, "slide_b.wav")

    def test_bezier_lane_midpoint_uses_to_even_and_signed_diff(self) -> None:
        left = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 2.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=True,
        )
        right = expand_bezier_segment(
            BezierSourceNote(0, 2.0),
            BezierSourceNote(96, 3.0),
            BezierSourceNote(192, 2.0),
            is_slide_group_a=True,
        )
        left_middle = max(
            (note for note in left if note.absolute_pos == 96),
            key=lambda note: note.lane_absolute_pos,
        )
        right_middle = max(
            (note for note in right if note.absolute_pos == 96),
            key=lambda note: note.lane_absolute_pos,
        )
        self.assertEqual(left_middle.lane_absolute_pos, 1.5)
        self.assertEqual((left_middle.lane_id, left_middle.diff_volume), ("32", -50))
        self.assertEqual(left_middle.note_wav_name, "slide_a_LS50.wav")
        self.assertEqual(right_middle.lane_absolute_pos, 2.5)
        self.assertEqual((right_middle.lane_id, right_middle.diff_volume), ("32", 50))
        self.assertEqual(right_middle.note_wav_name, "slide_a_RS50.wav")

    def test_bezier_multi_range_uses_right_edges_for_right_control(self) -> None:
        notes = expand_bezier_segment(
            BezierSourceNote(0, 1.0, 2),
            BezierSourceNote(96, 3.0),
            BezierSourceNote(192, 1.0, 2),
            is_slide_group_a=False,
            is_multi_range=True,
        )
        middle = max(
            (note for note in notes if note.absolute_pos == 96),
            key=lambda note: note.lane_absolute_pos,
        )
        self.assertTrue(middle.is_right_control)
        self.assertEqual(middle.lane_absolute_pos, 2.5)
        self.assertEqual(middle.multi_range_width, 2)
        self.assertEqual(middle.note_wav_name, "slide_b_RS50.wav")

    def test_bezier_segment_rejects_lane_outside_native_key_table(self) -> None:
        with self.assertRaisesRegex(ValueError, "native 0..6 key table"):
            expand_bezier_segment(
                BezierSourceNote(0, 7.0),
                BezierSourceNote(96, 7.0),
                BezierSourceNote(192, 7.0),
                is_slide_group_a=True,
            )

    def test_bezier_wav_normalization_matches_native_replace_chain(self) -> None:
        self.assertEqual(
            normalize_bezier_wav_name("skill_slide_end_flick_a_fever.wav"),
            "slide_end_flick_a",
        )
        self.assertEqual(
            normalize_bezier_wav_name("fever_note_slide_b_lane_change.wav"),
            "slide_b",
        )

    def test_bezier_triplets_require_adjacent_control_and_matching_group(self) -> None:
        notes = (
            BezierChartNote("start-a", "slide_a.wav", 0, 1.0),
            BezierChartNote("control-a", "cont_bezier_front_a", 96, 2.0),
            BezierChartNote("end-a", "slide_end_flick_a.wav", 192, 1.0),
            BezierChartNote("control-b", "cont_bezier_front_b", 288, 3.0),
            BezierChartNote("end-b", "slide_end_b.wav", 384, 2.0),
        )
        segments = expand_bezier_triplets(notes)
        self.assertEqual(len(segments), 1)
        self.assertEqual(
            (
                segments[0].start_index,
                segments[0].control_index,
                segments[0].end_index,
            ),
            (0, 1, 2),
        )
        self.assertTrue(segments[0].is_slide_group_a)

    def test_bezier_triplets_accept_decorated_slide_b_wavs(self) -> None:
        segments = expand_bezier_triplets(
            (
                BezierChartNote("start", "fever_slide_b.wav", 0, 2.0),
                BezierChartNote("control", "cont_force_back_b", 96, 1.0),
                BezierChartNote(
                    "end", "skill_slide_end_dir_flick_r_b.wav", 192, 2.0
                ),
            )
        )
        self.assertEqual(len(segments), 1)
        self.assertFalse(segments[0].is_slide_group_a)
        self.assertTrue(segments[0].notes)

    def test_force_controls_move_across_native_slide_predicates(self) -> None:
        early_slide = BezierChartNote("early", "slide_a.wav", 0, 1.0)
        force_front = BezierChartNote(
            "front", "cont_force_front_a", 96, 2.0
        )
        force_back = BezierChartNote("back", "cont_force_back_b", 96, 2.0)
        late_slide = BezierChartNote("late", "slide_b.wav", 192, 3.0)
        sorted_notes = sort_force_control_notes(
            (early_slide, force_front, force_back, late_slide)
        )
        self.assertEqual(
            tuple(note.note_id for note in sorted_notes),
            ("front", "early", "late", "back"),
        )

    def test_bezier_score_line_uses_max_denominator_and_zero_slots(self) -> None:
        generated = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 1.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=True,
        )
        selected = tuple(
            next(note for note in generated if note.absolute_pos == position)
            for position in (48, 96, 144)
        )
        lines = serialize_bezier_music_score_lines(selected, {"slide_a.wav": "01"})
        self.assertEqual(lines, ("#00031:00010101",))

    def test_bezier_score_line_requires_registered_wav_key(self) -> None:
        generated = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 1.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=True,
        )
        middle = next(note for note in generated if note.absolute_pos == 96)
        with self.assertRaisesRegex(ValueError, "missing WAV key"):
            serialize_bezier_music_score_lines((middle,), {})

    def test_bezier_duplicate_positions_collapse_to_average_lane(self) -> None:
        generated = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 3.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=True,
        )
        position_samples = tuple(
            note for note in generated if note.absolute_pos == 96
        )
        collapsed = collapse_bezier_samples(generated)
        middle = next(note for note in collapsed if note.absolute_pos == 96)
        self.assertGreater(len(position_samples), 1)
        self.assertAlmostEqual(
            middle.lane_absolute_pos,
            sum(note.lane_absolute_pos for note in position_samples)
            / len(position_samples),
        )

    def test_bezier_straight_diff_line_reduces_to_native_three_points(self) -> None:
        generated = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 1.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=True,
        )
        collapsed = collapse_bezier_samples(generated)
        reduced = reduce_bezier_samples(collapsed)
        self.assertGreater(len(collapsed), 3)
        self.assertEqual(len(reduced), 3)
        self.assertTrue(all(note.diff_volume == 0 for note in reduced))
        self.assertEqual(
            tuple(note.absolute_pos for note in reduced),
            (3, 186, 189),
        )

    def test_bezier_reduction_sorts_retained_points_by_diff_volume(self) -> None:
        generated = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 2.7),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=True,
        )
        reduced = reduce_bezier_samples(collapse_bezier_samples(generated))
        self.assertEqual(
            tuple(note.diff_volume for note in reduced),
            tuple(sorted(note.diff_volume for note in reduced)),
        )

    def test_bezier_multi_range_support_expands_toward_control_inside(self) -> None:
        right_control = expand_bezier_segment(
            BezierSourceNote(0, 1.0, 3),
            BezierSourceNote(96, 4.0),
            BezierSourceNote(192, 1.0, 3),
            is_slide_group_a=True,
            is_multi_range=True,
        )
        processed = postprocess_bezier_samples(
            right_control, is_multi_range=True
        )
        by_position: dict[int, list[float]] = {}
        for note in processed:
            by_position.setdefault(note.absolute_pos, []).append(
                note.lane_absolute_pos
            )
        sample_lanes = next(
            lanes for lanes in by_position.values() if len(lanes) == 3
        )
        self.assertAlmostEqual(sample_lanes[0] - sample_lanes[1], 1.0)
        self.assertAlmostEqual(sample_lanes[1] - sample_lanes[2], 1.0)

    def test_bezier_chart_conversion_runs_order_expand_and_reduce(self) -> None:
        converted = convert_bezier_chart_notes(
            (
                BezierChartNote("start", "slide_a.wav", 0, 1.0),
                BezierChartNote("control", "cont_bezier_front_a", 96, 1.0),
                BezierChartNote("end", "slide_end_a.wav", 192, 1.0),
            )
        )
        self.assertEqual(len(converted), 3)
        self.assertTrue(all(note.note_wav_name == "slide_a.wav" for note in converted))

    def test_bezier_duplicate_collapse_keeps_slide_groups_separate(self) -> None:
        group_a = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 2.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=True,
        )
        group_b = expand_bezier_segment(
            BezierSourceNote(0, 1.0),
            BezierSourceNote(96, 2.0),
            BezierSourceNote(192, 1.0),
            is_slide_group_a=False,
        )
        collapsed = collapse_bezier_samples(group_a + group_b)
        middle = tuple(note for note in collapsed if note.absolute_pos == 96)
        self.assertEqual(len(middle), 2)
        self.assertEqual(
            {note.is_slide_group_a for note in middle},
            {False, True},
        )

    def test_bezier_multi_range_left_control_expands_positive_lanes(self) -> None:
        left_control = expand_bezier_segment(
            BezierSourceNote(0, 4.0, 3),
            BezierSourceNote(96, 1.0),
            BezierSourceNote(192, 4.0, 3),
            is_slide_group_a=False,
            is_multi_range=True,
        )
        processed = postprocess_bezier_samples(left_control, is_multi_range=True)
        by_position: dict[int, list[float]] = {}
        for note in processed:
            by_position.setdefault(note.absolute_pos, []).append(
                note.lane_absolute_pos
            )
        sample_lanes = next(
            lanes for lanes in by_position.values() if len(lanes) == 3
        )
        self.assertAlmostEqual(sample_lanes[1] - sample_lanes[0], 1.0)
        self.assertAlmostEqual(sample_lanes[2] - sample_lanes[1], 1.0)

    def test_music_score_header_parse_recovers_wavs_and_multi_range(self) -> None:
        header = MusicScoreHeaderState()
        parsed = header.parse(
            (
                "#TITLE demo",
                "#WAV01 slide_a.wav",
                "#WAV02 cont_bezier_front_a.wav",
                "#HABAHIRO",
                "#123",
                "#00036:01",
            )
        )
        self.assertEqual(header.wav_file_names["01"], "slide_a.wav")
        self.assertTrue(header.is_multi_range)
        self.assertTrue(header.has_control_key())
        self.assertNotIn("#123", parsed)
        self.assertIn("#00036:01", parsed)

    def test_music_score_header_reparse_inserts_additive_wavs(self) -> None:
        lines = (
            "#WAV01 slide_a.wav",
            "#WAV02 cont_bezier_front_a.wav",
            "#TITLE demo",
            "#00036:01",
        )
        header = MusicScoreHeaderState()
        header.parse(lines)
        header.add_wav(28, "slide_a_LS01.wav")
        reparsed = header.reparse(lines)
        self.assertEqual(
            reparsed[:3],
            (
                "#WAV01 slide_a.wav",
                "#WAV0S slide_a_LS01.wav",
                "#TITLE demo",
            ),
        )
        self.assertNotIn("#WAV02 cont_bezier_front_a.wav", reparsed)

    def test_music_score_note_parser_uses_native_position_and_lane_table(self) -> None:
        header = MusicScoreHeaderState()
        lines = (
            "#WAV01 slide_a.wav",
            "#00236:0100",
            "#00231:0001",
        )
        header.parse(lines)
        notes = parse_bezier_music_score_notes(lines, header)
        self.assertEqual(
            notes,
            (
                BezierMusicScoreNote(
                    "01", "slide_a", 384, 2, "36", 0, 0, 1
                ),
                BezierMusicScoreNote(
                    "01", "slide_a", 480, 2, "31", 1, 1, 2
                ),
            ),
        )

    def test_music_score_text_converter_returns_none_without_control(self) -> None:
        self.assertIsNone(
            convert_bezier_music_score_text(
                ("#WAV01 slide_a.wav", "#00036:01")
            )
        )

    def test_music_score_text_converter_rebuilds_headers_and_body(self) -> None:
        source = (
            "#TITLE demo",
            "#WAV01 slide_a.wav",
            "#WAV02 cont_bezier_front_a.wav",
            "#WAV03 cont_bezier_back_a.wav",
            "#00036:01",
            "#00033:0002",
            "#00136:01",
        )
        converted = convert_bezier_music_score_text(source)
        self.assertIsNotNone(converted)
        assert converted is not None
        additive_headers = tuple(
            line
            for line in converted
            if line.startswith("#WAV")
            and ("slide_a_L" in line or "slide_a_R" in line or "slide_b_" in line)
        )
        self.assertEqual(len(additive_headers), 200)
        self.assertIn("#WAV0S slide_a_LS01.wav", converted)
        self.assertIn("#WAV6E slide_b_RS50.wav", converted)
        self.assertNotIn("#WAV02 cont_bezier_front_a.wav", converted)
        self.assertGreater(
            sum(line.startswith("#00036:") for line in converted),
            1,
        )
        self.assertTrue(any(line.startswith("#00031:") for line in converted))

    def test_music_score_text_converter_merges_multi_range_source_lanes(
        self,
    ) -> None:
        source = (
            "#TITLE multi",
            "#HABAHIRO",
            "#WAV01 slide_a.wav",
            "#WAV02 cont_bezier_front_a.wav",
            "#WAV03 cont_bezier_back_a.wav",
            "#00036:01",
            "#00031:01",
            "#00033:0002",
            "#00136:01",
            "#00131:01",
        )
        converted = convert_bezier_music_score_text(source)
        self.assertIsNotNone(converted)
        assert converted is not None
        self.assertEqual(converted.count("#00136:01"), 2)
        self.assertEqual(converted.count("#00131:01"), 1)

    def test_music_score_text_converter_expands_multi_range_support_lanes(
        self,
    ) -> None:
        source = (
            "#HABAHIRO",
            "#WAV01 slide_a.wav",
            "#WAV02 cont_bezier_front_a.wav",
            "#WAV03 cont_bezier_back_a.wav",
            "#00036:01",
            "#00031:01",
            "#00033:0002",
            "#00136:01",
            "#00131:01",
        )
        converted = convert_bezier_music_score_text(source)
        self.assertIsNotNone(converted)
        assert converted is not None
        self.assertTrue(
            any(
                line.startswith("#00031:") and line != "#00031:01"
                for line in converted
            )
        )
        self.assertTrue(any(line.startswith("#00032:") for line in converted))

    def test_bms_material_parser_uses_normal_and_multi_range_button_tables(
        self,
    ) -> None:
        normal = parse_bms_note_materials(
            (
                "#WAV01 normal.wav",
                "#00111:01",
                "#00218:01",
            ),
            convert_bezier=False,
        )
        self.assertEqual(
            tuple(material.button_type for material in normal.materials),
            (1, 6),
        )

        multi_range = parse_bms_note_materials(
            (
                "#HABAHIRO",
                "#WAV01 normal.wav",
                "#00111:01",
                "#00218:01",
                "#00321:01",
                "#00422:01",
            ),
            convert_bezier=False,
        )
        self.assertEqual(
            tuple(material.button_type for material in multi_range.materials),
            (0, 5, 8, 9),
        )

    def test_multi_range_parser_preserves_cc_collision_and_source_lanes(
        self,
    ) -> None:
        parsed = parse_bms_note_materials(
            (
                "#HABAHIRO",
                "#WAV01 normal.wav",
                "#00111:01",
                "#00112:01",
                "#00116:01",
            ),
            convert_bezier=False,
        )
        self.assertEqual(
            tuple((material.cc_num, material.button_type) for material in parsed.materials),
            ((11, 0), (16, 0), (12, 1)),
        )
        specs = note_specs_from_information_batches(
            bms_materials_to_information_batches(parsed)
        )
        self.assertEqual(
            tuple((spec.cc_nums, spec.lane, spec.width) for spec in specs),
            (((11, 12), 0, 2), ((16,), 0, 1)),
        )

    def test_multi_range_long_pairing_keeps_equal_internal_buttons_separate(
        self,
    ) -> None:
        parsed = parse_bms_note_materials(
            (
                "#HABAHIRO",
                "#WAV01 long.wav",
                "#WAV02 flick.wav",
                "#00151:01",
                "#00156:01",
                "#00251:02",
                "#00256:02",
            ),
            convert_bezier=False,
        )
        specs = note_specs_from_information_batches(
            bms_materials_to_information_batches(parsed)
        )
        self.assertEqual(
            tuple(
                (spec.cc_nums, spec.end_cc_nums, spec.end_position)
                for spec in specs
            ),
            (((51,), (51,), 384.0), ((56,), (56,), 384.0)),
        )

    def test_multi_range_directional_group_uses_cc_anchor_and_width(
        self,
    ) -> None:
        parsed = parse_bms_note_materials(
            (
                "#HABAHIRO",
                "#WAV01 directional_fl_l.wav",
                "#00111:01",
                "#00116:01",
            ),
            convert_bezier=False,
        )
        specs = note_specs_from_information_batches(
            bms_materials_to_information_batches(parsed)
        )
        self.assertEqual(len(specs), 1)
        self.assertEqual(
            (
                specs[0].kind,
                specs[0].directional_anchor_lane,
                specs[0].lane,
                specs[0].width,
                specs[0].cc_nums,
            ),
            ("directional_flick_left", 1, 0, 2, (11, 16)),
        )

    def test_multi_range_slide_preserves_node_cc_lane_sets(self) -> None:
        parsed = parse_bms_note_materials(
            (
                "#HABAHIRO",
                "#WAV01 slide_a.wav",
                "#WAV02 slide_end_a.wav",
                "#00111:01",
                "#00116:01",
                "#00213:02",
                "#00214:02",
            ),
            convert_bezier=False,
        )
        specs = note_specs_from_information_batches(
            bms_materials_to_information_batches(parsed)
        )
        self.assertEqual(len(specs), 1)
        self.assertEqual(
            (specs[0].cc_nums, specs[0].end_cc_nums),
            ((11, 16), (13, 14)),
        )

    def test_bms_material_parser_maps_sound_types_and_virtual_lanes(self) -> None:
        result = parse_bms_note_materials(
            (
                "#WAV01 slide_a_LS12.wav",
                "#WAV02 slide_b_RS07.wav",
                "#WAV03 slide_end_flick_a.wav",
                "#WAV04 add_long_dir_flick.wav",
                "#00111:01",
                "#00212:02",
                "#00313:03",
                "#00414:04",
            ),
            convert_bezier=False,
        )
        self.assertEqual(
            tuple(
                (
                    material.fire_note_type,
                    material.game_note_type,
                    material.virtual_lane_direction,
                    material.virtual_lane_distance,
                )
                for material in result.materials
            ),
            (
                (3, 4, 1, 12),
                (4, 5, 2, 7),
                (-1, 8, 0, 0),
                (7, 24, 0, 0),
            ),
        )

    def test_bms_material_parser_preserves_first_duplicate_note(self) -> None:
        result = parse_bms_note_materials(
            (
                "#WAV01 normal.wav",
                "#WAV02 flick.wav",
                "#00111:01",
                "#00111:02",
            ),
            convert_bezier=False,
        )
        self.assertEqual(len(result.materials), 1)
        self.assertEqual(result.materials[0].sound_value, "normal")
        self.assertEqual(result.materials[0].play_music_list, ("01",))

    def test_bms_material_parser_merges_duplicate_bgm_lists(self) -> None:
        result = parse_bms_note_materials(
            (
                "#WAV01 bgm_a.wav",
                "#WAV02 bgm_b.wav",
                "#00101:01",
                "#00101:02",
            ),
            convert_bezier=False,
        )
        self.assertEqual(len(result.materials), 1)
        self.assertEqual(result.materials[0].play_music_list, ("01", "02"))
        self.assertEqual(result.materials[0].sound_value_list, ("bgm_a", "bgm_b"))

    def test_bms_material_parser_marks_all_invisible_channels(self) -> None:
        result = parse_bms_note_materials(
            (
                "#WAV01 normal.wav",
                "#00131:01",
                "#00236:01",
                "#00338:01",
                "#00439:01",
            ),
            convert_bezier=False,
        )
        self.assertEqual(len(result.materials), 4)
        self.assertTrue(all(material.is_invisible for material in result.materials))

    def test_bms_material_parser_builds_direct_and_indexed_bpm_materials(
        self,
    ) -> None:
        result = parse_bms_note_materials(
            (
                "#BPM 90.25",
                "#BPM0A 150.5",
                "#00103:78",
                "#00208:0A",
            ),
            convert_bezier=False,
        )
        self.assertEqual(
            tuple(
                (material.cc_num, material.bpm, material.bpm_string)
                for material in result.bpm_changes
            ),
            ((3, 120.0, "120"), (8, 150.5, "150.5")),
        )
        self.assertEqual((result.start_bpm, result.start_bpm_string), (90.25, "90.25"))
        self.assertLess(
            result.bpm_changes[0].source_order,
            result.bpm_changes[1].source_order,
        )

    def test_bms_material_batches_pair_long_and_build_slide_members(self) -> None:
        parsed = parse_bms_note_materials(
            (
                "#WAV01 long.wav",
                "#WAV02 flick.wav",
                "#WAV03 slide_a.wav",
                "#WAV04 slide_end_flick_a.wav",
                "#00103:78",
                "#00151:01",
                "#00112:03",
                "#00251:02",
                "#00213:03",
                "#00314:04",
            ),
            convert_bezier=False,
        )
        batches = bms_materials_to_information_batches(parsed)
        self.assertEqual(tuple(batch.absolute_pos for batch in batches), (192,))
        records = batches[0].information_list
        long_note = next(record for record in records if record.game_note_type == 1)
        slide = next(record for record in records if record.game_note_type == 4)
        bpm_change = next(record for record in records if record.cc_num in (3, 8))
        self.assertEqual((bpm_change.bpm, bpm_change.bpm_string), (120.0, "120"))
        self.assertEqual((long_note.after_note_type, long_note.after_note_absolute_pos), (1, 384))
        self.assertEqual(slide.after_note_type, 8)
        self.assertEqual(
            tuple(node.absolute_pos for node in slide.slide_note_list),
            (384, 576),
        )

    def test_bms_batches_group_only_adjacent_same_directional_roots(self) -> None:
        parsed = parse_bms_note_materials(
            (
                "#WAV01 directional_fl_l.wav",
                "#WAV02 directional_fl_r.wav",
                "#00111:01",
                "#00112:01",
                "#00114:01",
                "#00115:02",
            ),
            convert_bezier=False,
        )
        records = bms_materials_to_information_batches(parsed)[0].information_list
        self.assertEqual(
            tuple(
                (record.button_type, record.game_note_type, record.fire_note_type)
                for record in records
            ),
            (
                (1, 10, 6),
                (2, 10, 6),
                (4, 10, 5),
                (5, 11, 5),
            ),
        )

    def test_bms_batches_map_long_and_slide_multiple_direction_additions(
        self,
    ) -> None:
        parsed = parse_bms_note_materials(
            (
                "#WAV01 long.wav",
                "#WAV02 long_end_dir_flick_l.wav",
                "#WAV03 add_long_dir_flick.wav",
                "#WAV04 slide_a.wav",
                "#WAV05 slide_end_dir_flick_r_a.wav",
                "#WAV06 add_slide_dir_flick.wav",
                "#00152:01",
                "#00252:02",
                "#00251:03",
                "#00313:04",
                "#00415:05",
                "#00418:06",
            ),
            convert_bezier=False,
        )
        records = tuple(
            record
            for batch in bms_materials_to_information_batches(parsed)
            for record in batch.information_list
        )
        long_root = next(record for record in records if record.game_note_type == 1)
        long_add = next(record for record in records if record.game_note_type == 18)
        slide_root = next(record for record in records if record.game_note_type == 4)
        slide_add = next(record for record in records if record.game_note_type == 21)
        self.assertEqual(long_root.after_note_type, 4)
        self.assertEqual((long_add.after_note_type, long_add.fire_note_type), (4, 4))
        self.assertEqual(slide_root.after_note_type, 12)
        self.assertEqual((slide_add.after_note_type, slide_add.fire_note_type), (12, 8))

    def test_bms_batches_filter_empty_normal_but_keep_empty_long(self) -> None:
        parsed = parse_bms_note_materials(
            (
                "#00111:01",
                "#00152:01",
                "#00252:01",
            ),
            convert_bezier=False,
        )
        specs = note_specs_from_information_batches(
            bms_materials_to_information_batches(parsed)
        )
        self.assertEqual(len(specs), 1)
        self.assertEqual(specs[0].kind, "long")

    def make_multiple_slide_tail(
        self,
        source_orders: tuple[int, int, int, int] = (0, 1, 2, 3),
    ):
        runtime = self.make_multiple_slide_runtime(source_orders)
        return runtime.render.slide_tails["multiple-tail"]

    def make_multiple_slide_runtime(
        self,
        source_orders: tuple[int, int, int, int] = (0, 1, 2, 3),
    ) -> RuntimeIntegration:
        left_far_order, left_near_order, root_order, right_order = source_orders
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "multiple-tail",
                    120,
                    1,
                    "slide",
                    240,
                    end_gesture="multiple_left",
                    game_note_type=4,
                    after_note_type=11,
                    end_game_note_type=14,
                    end_source_order=root_order,
                    end_lane=3,
                    multiple_side_nodes=(
                        SlideTailSideNodeSpec(
                            "multiple-left-far", 1, 20, left_far_order
                        ),
                        SlideTailSideNodeSpec(
                            "multiple-left-near", 2, 20, left_near_order
                        ),
                        SlideTailSideNodeSpec(
                            "multiple-right", 4, 20, right_order
                        ),
                    ),
                )
            ],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(1, 1)
        return runtime

    def advance(self, runtime: RuntimeIntegration, seconds: float) -> None:
        for _ in range(round(seconds / FRAME_SECONDS)):
            runtime.update(FRAME_SECONDS)

    def test_runtime_starts_habahiro_flash_at_absolute_position(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (),
            lane_change_commands=(
                LaneChangeCommandSpec("habahiro-change", 120, 3, (13,)),
            ),
        )
        self.advance(runtime, 0.5)
        self.assertFalse(runtime.habahiro_lane_change.flash_playing)
        self.advance(runtime, 0.5)
        self.assertTrue(runtime.habahiro_lane_change.flash_playing)
        self.assertEqual(runtime.habahiro_lane_change.animation_play_count, 1)
        self.assertTrue(runtime.render.habahiro_flash_playing)
        self.assertEqual(runtime.events[-1].kind, "lane_change_flash_started")
        self.assertEqual(runtime.events[-1].position, 120)

    def test_runtime_waits_for_habahiro_change_lane_animation_event(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (),
            lane_change_commands=(
                LaneChangeCommandSpec("habahiro-change", 120, 3, (13,)),
            ),
        )
        self.advance(runtime, 1.25)
        self.assertEqual(runtime.render.field_line_skin, "pre_habahiro")
        self.assertFalse(runtime.habahiro_lane_change.line_image_changed)
        self.advance(runtime, 1.0)
        self.assertEqual(runtime.render.field_line_skin, "pre_habahiro")
        self.assertEqual(runtime.habahiro_lane_change.animation_play_count, 1)

    def test_runtime_habahiro_change_lane_event_swaps_skin_once(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (),
            lane_change_commands=(
                LaneChangeCommandSpec("habahiro-change", 120, 3, (13,)),
            ),
        )
        self.advance(runtime, 1.25)
        self.assertTrue(runtime.habahiro_change_lane_animation_event())
        self.assertFalse(runtime.habahiro_change_lane_animation_event())
        self.assertEqual(runtime.render.field_line_skin, "habahiro")
        self.assertTrue(runtime.habahiro_lane_change.line_image_changed)
        self.assertEqual(runtime.habahiro_lane_change.change_lane_event_count, 1)
        self.assertEqual(
            [event.kind for event in runtime.events],
            ["lane_change_flash_started", "lane_change_applied"],
        )

    def test_single_clock_drives_hud_render_and_audio(self) -> None:
        runtime = self.make_runtime()
        self.advance(runtime, 1.0)
        self.assertEqual(runtime.touch_began(0, 1), "tap")

        self.assertEqual(runtime.hud.score, 1100)
        self.assertEqual(runtime.hud.combo, 1)
        self.assertEqual(runtime.hud.judgement, "perfect")
        self.assertIn("flick", runtime.render.notes)
        self.assertIn("judge:1:head:perfect", runtime.render.particles)
        self.assertEqual(runtime.audio.cues, ["judge:standard"])
        self.assertEqual([event.kind for event in runtime.events], ["judge"])
        self.assertEqual(runtime.events[0].result, "perfect")

    def test_combo_animation_matches_recovered_scale_and_alpha_keys(self) -> None:
        self.assertAlmostEqual(evaluate_combo_number_scale(0.0), 0.8)
        self.assertAlmostEqual(evaluate_combo_number_scale(1.0 / 12.0), 1.1)
        self.assertAlmostEqual(evaluate_combo_number_scale(1.0 / 6.0), 1.0)
        self.assertAlmostEqual(evaluate_all_perfect_alpha(0.0), 1.0)
        self.assertAlmostEqual(evaluate_all_perfect_alpha(5.0 / 12.0), 0.5)
        self.assertAlmostEqual(evaluate_all_perfect_alpha(5.0 / 6.0), 1.0)

    def test_score_hud_formats_eight_digits_with_gray_leading_zeroes(self) -> None:
        self.assertEqual(
            format_score_hud_digits(12_345),
            (
                ("0", "gray"),
                ("0", "gray"),
                ("0", "gray"),
                ("1", "pink"),
                ("2", "pink"),
                ("3", "pink"),
                ("4", "pink"),
                ("5", "pink"),
            ),
        )
        self.assertEqual(format_score_hud_digits(0)[-1], ("0", "pink"))

    def test_add_score_and_result_hud_follow_recovered_lifetimes(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (NoteSpec("tap", 120, 1, "tap"),),
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 1)
        add_score = runtime.hud.add_score_visuals[0]
        result = runtime.hud.result_visual
        self.assertTrue(add_score.active)
        self.assertEqual(add_score.score, 1_100)
        self.assertEqual(add_score.depth, 0)
        self.assertEqual(add_score.local_y, -50.0)
        self.assertEqual(add_score.alpha, 0.6)
        self.assertTrue(result.visible)
        self.assertEqual(result.judgement, "perfect")

        runtime.update(FRAME_SECONDS)
        self.assertEqual(add_score.local_y, -42.0)
        self.assertGreater(add_score.alpha, 0.2)
        self.advance(runtime, 0.5)
        self.assertFalse(add_score.active)
        self.advance(runtime, 0.5)
        self.assertFalse(result.visible)

    def test_result_fast_slow_gate_suppresses_timing_sprite_only(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (NoteSpec("tap", 120, 1, "tap"),),
            enable_to_show_fast_slow=False,
        )
        self.advance(runtime, 1.0 - 5 * FRAME_SECONDS)
        runtime.touch_began(0, 1)
        self.assertEqual(runtime.hud.result_visual.judgement, "great")
        self.assertIsNone(runtime.hud.result_visual.judge_timing)

    def test_combo_visibility_expires_one_second_after_latest_change(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (
                NoteSpec("first", 120, 1, "tap"),
                NoteSpec("second", 210, 2, "tap"),
            ),
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 1)
        self.advance(runtime, 0.75)
        runtime.touch_began(1, 2)
        self.advance(runtime, 0.5)
        self.assertTrue(runtime.hud.combo_visual.normal_visible)
        self.advance(runtime, 0.6)
        self.assertFalse(runtime.hud.combo_visual.normal_visible)

    def test_pause_freezes_combo_visibility_and_animation_clocks(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (NoteSpec("tap", 120, 1, "tap"),),
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 1)
        self.advance(runtime, 0.25)
        runtime.pause()
        frozen = runtime.hud.combo_visual
        hide_elapsed = frozen.normal_hide_elapsed
        scale_elapsed = frozen.normal_scale_elapsed
        runtime.update(10.0)
        self.assertEqual(frozen.normal_hide_elapsed, hide_elapsed)
        self.assertEqual(frozen.normal_scale_elapsed, scale_elapsed)
        self.assertTrue(frozen.normal_visible)

    def test_all_perfect_combo_replays_scale_then_great_clears_status(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (
                NoteSpec("perfect", 120, 1, "tap"),
                NoteSpec("great", 240, 2, "tap"),
            ),
            all_perfect_status_display_mode=True,
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 1)
        visual = runtime.hud.combo_visual
        self.assertTrue(visual.all_perfect_visible)
        self.assertEqual(visual.all_perfect_scale_elapsed, 0.0)
        self.advance(runtime, 1.0 - 5 * FRAME_SECONDS)
        runtime.touch_began(1, 2)
        self.assertEqual(runtime.hud.judgement, "great")
        self.assertEqual(visual.all_perfect_status, 0)
        self.assertFalse(visual.all_perfect_visible)

    def test_perfect_preserves_all_perfect_status(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            (NoteSpec("tap", 120, 1, "tap"),),
            all_perfect_status_display_mode=True,
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 1)
        self.assertEqual(runtime.hud.combo_visual.all_perfect_status, 1)
        self.assertTrue(runtime.hud.combo_visual.all_perfect_visible)

    def test_note_kind_selects_cue_and_hold_has_lifecycle(self) -> None:
        runtime = self.make_runtime()
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 1)
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 6)
        self.assertTrue(runtime.touch_moved(0, 0.05))
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 3)
        self.advance(runtime, 1.0)
        self.assertEqual(runtime.touch_ended(0), "perfect")
        self.advance(runtime, 0.1)

        self.assertEqual(runtime.hud.score, 4400)
        self.assertEqual(runtime.hud.combo, 4)
        self.assertIn("judge:flick", runtime.audio.cues)
        self.assertIn("hold:start:long", runtime.audio.cues)
        self.assertIn("hold:fade:long", runtime.audio.cues)
        self.assertEqual(runtime.audio.active_holds, set())
        self.assertEqual(
            [event.kind for event in runtime.events],
            [
                "judge",
                "judge",
                "judge",
                "judge",
            ],
        )
        self.assertEqual([event.phase for event in runtime.events], ["head", "head", "head", "tail"])

    def test_pause_freezes_all_consumers_and_resume_order(self) -> None:
        runtime = self.make_runtime()
        self.advance(runtime, 0.5)
        runtime.pause()
        frozen = runtime.snapshot()
        runtime.update(10.0)

        self.assertEqual(runtime.engine.clock.music_position, frozen["clock"]["music_position"])
        self.assertEqual(runtime.hud.score, frozen["hud"]["score"])
        self.assertTrue(runtime.audio.music_paused)

        runtime.resume()
        self.advance(runtime, 0.5)
        self.assertEqual(runtime.audio.cues[:2], ["music:pause", "music:resume"])
        self.assertEqual([event.kind for event in runtime.events[:2]], ["pause", "resume"])
        runtime.touch_began(0, 1)
        self.assertEqual(runtime.hud.score, 1100)

    def test_event_sequence_is_deterministic(self) -> None:
        first = self.make_runtime()
        second = self.make_runtime()
        for runtime in (first, second):
            self.advance(runtime, 1.0)
            runtime.touch_began(0, 1)
            self.advance(runtime, 3.1)
        self.assertEqual(first.snapshot(), second.snapshot())

    def test_recovered_frame_windows_and_timeout_miss(self) -> None:
        runtime = self.make_runtime()
        self.advance(runtime, 1.0 - 5 * FRAME_SECONDS)
        runtime.touch_began(0, 1)
        self.assertEqual(runtime.hud.judgement, "great")
        self.assertEqual(runtime.events[-1].kind, "judge")
        self.assertEqual(runtime.events[-1].result, "great")
        self.assertEqual(runtime.events[-1].timing, "fast")

        self.advance(runtime, 1.25)
        self.assertEqual(runtime.hud.judgement, "miss")
        self.assertEqual(runtime.hud.combo, 0)
        self.assertEqual(runtime.hud.life, 900)

    def test_early_hold_release_misses_tail_and_fades_sound(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("long", 120, 3, "long", 240)],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(7, 3)
        self.assertIn("long", runtime.audio.active_holds)
        self.advance(runtime, 0.25)

        self.assertEqual(runtime.touch_ended(7), "miss")
        self.assertEqual(runtime.events[-1].phase, "tail")
        self.assertEqual(runtime.events[-1].result, "miss")
        self.assertEqual(runtime.events[-1].position, 240)
        self.assertNotIn("long", runtime.audio.active_holds)
        self.assertIn("hold:fade:long", runtime.audio.cues)
        self.assertEqual(runtime.hud.life, 900)

    def test_held_tail_times_out_without_release(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("long", 120, 3, "long", 240)],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(3, 3)
        self.advance(runtime, 1.2)

        self.assertEqual(runtime.events[-1].phase, "tail")
        self.assertEqual(runtime.events[-1].result, "miss")
        self.assertNotIn("long", runtime.audio.active_holds)

    def test_lane_width_ownership_and_empty_tap(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("wide", 120, 2, width=3)],
        )
        self.advance(runtime, 1.0)
        self.assertEqual(runtime.touch_began(4, 4), "wide")
        self.assertIsNone(runtime.touch_began(5, 4))
        self.assertIn("tap:empty", runtime.audio.cues)

    def test_slide_intermediate_nodes_are_judged_during_move(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("slide", 120, 2, "slide", 360, 1, (240,))],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(1, 2)
        self.advance(runtime, 1.0)

        self.assertTrue(runtime.touch_moved(1, 0.1))
        self.assertEqual(runtime.events[-1].phase, "intermediate")
        self.assertEqual(runtime.events[-1].result, "perfect")
        self.assertIn("judge:2:intermediate:perfect", runtime.render.particles)
        self.advance(runtime, 1.0)
        self.assertEqual(runtime.touch_ended(1), "perfect")

    def test_missed_slide_intermediate_uses_one_fifth_damage(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("slide", 120, 2, "slide", 360, 1, (240,))],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(1, 2)
        self.advance(runtime, 1.25)

        intermediate = [event for event in runtime.events if event.phase == "intermediate"]
        self.assertEqual(len(intermediate), 1)
        self.assertEqual(intermediate[0].result, "miss")
        self.assertEqual(runtime.hud.life, 980)

    def test_slide_stop_after_through_uses_distinct_miss_interval(self) -> None:
        at_boundary = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=True,
            visible_after_state="move",
            judgement_adjust_value_b=0,
            adjustment_counter=0,
            root_game_note_type=None,
            frame_counter=0.0,
            execute_frame=1.0,
            elapsed_seconds=SLIDE_AFTER_MISS_SECOND_INTERVAL,
            elapsed_distance=10.0,
            visible_after_remaining_distance=20.0,
        )
        after_boundary = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=True,
            visible_after_state="move",
            judgement_adjust_value_b=0,
            adjustment_counter=0,
            root_game_note_type=None,
            frame_counter=0.0,
            execute_frame=1.0,
            elapsed_seconds=SLIDE_AFTER_MISS_SECOND_INTERVAL + 0.0001,
            elapsed_distance=10.0,
            visible_after_remaining_distance=20.0,
        )
        self.assertIsNone(at_boundary.miss_code)
        self.assertEqual(after_boundary.miss_code, 4)
        self.assertEqual(after_boundary.miss_type, "after_through")

    def test_slide_stop_after_force_uses_visible_successor_midpoint(self) -> None:
        before_midpoint = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=True,
            visible_after_state="move",
            judgement_adjust_value_b=0,
            adjustment_counter=0,
            root_game_note_type=None,
            frame_counter=0.0,
            execute_frame=1.0,
            elapsed_seconds=0.1,
            elapsed_distance=9.0,
            visible_after_remaining_distance=11.0,
        )
        after_midpoint = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=True,
            visible_after_state="move",
            judgement_adjust_value_b=0,
            adjustment_counter=0,
            root_game_note_type=None,
            frame_counter=0.0,
            execute_frame=1.0,
            elapsed_seconds=0.1,
            elapsed_distance=11.0,
            visible_after_remaining_distance=9.0,
        )
        no_visible_after = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=True,
            visible_after_state=None,
            judgement_adjust_value_b=0,
            adjustment_counter=0,
            root_game_note_type=None,
            frame_counter=0.0,
            execute_frame=1.0,
            elapsed_seconds=0.1,
            elapsed_distance=1.0,
            visible_after_remaining_distance=None,
        )
        self.assertIsNone(before_midpoint.miss_code)
        self.assertEqual(after_midpoint.miss_code, 5)
        self.assertEqual(no_visible_after.miss_code, 5)

    def test_slide_stop_after_slower_waits_for_negative_adjustment(self) -> None:
        delayed = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=True,
            visible_after_state="stop",
            judgement_adjust_value_b=-2,
            adjustment_counter=7,
            root_game_note_type=None,
            frame_counter=0.0,
            execute_frame=1.0,
            elapsed_seconds=0.0,
            elapsed_distance=0.0,
            visible_after_remaining_distance=1.0,
        )
        ready = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=True,
            visible_after_state="stop",
            judgement_adjust_value_b=-2,
            adjustment_counter=8,
            root_game_note_type=None,
            frame_counter=0.0,
            execute_frame=1.0,
            elapsed_seconds=0.0,
            elapsed_distance=0.0,
            visible_after_remaining_distance=1.0,
        )
        self.assertTrue(delayed.adjustment_delay_active)
        self.assertEqual(delayed.adjustment_counter, 8)
        self.assertIsNone(delayed.miss_code)
        self.assertEqual(ready.miss_code, 3)

    def test_terminal_type_eight_uses_dedicated_seven_frame_route(self) -> None:
        before = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=False,
            visible_after_state=None,
            judgement_adjust_value_b=0,
            adjustment_counter=0,
            root_game_note_type=8,
            frame_counter=5.5,
            execute_frame=1.0,
            elapsed_seconds=1.0,
            elapsed_distance=100.0,
            visible_after_remaining_distance=None,
        )
        after = evaluate_slide_stop_miss(
            current_state="stop",
            has_judge=False,
            has_after_note=False,
            visible_after_state=None,
            judgement_adjust_value_b=0,
            adjustment_counter=0,
            root_game_note_type=8,
            frame_counter=before.frame_counter,
            execute_frame=0.5,
            elapsed_seconds=1.0,
            elapsed_distance=100.0,
            visible_after_remaining_distance=None,
        )
        self.assertIsNone(before.miss_code)
        self.assertEqual(before.frame_counter, 6.5)
        self.assertEqual(after.miss_code, 6)
        self.assertEqual(after.miss_type, "after_through_flick")

    def test_note_manager_execute_frame_clamps_and_splits_substeps(self) -> None:
        self.assertAlmostEqual(note_manager_execute_frame(FRAME_SECONDS), 1.0)
        self.assertEqual(note_manager_execute_frame(0.05), 1.0)
        self.assertAlmostEqual(note_manager_execute_frame(FRAME_SECONDS / 2), 0.5)
        self.assertAlmostEqual(note_manager_execute_frame(0.05, 4), 0.25)

    def test_note_manager_performance_buckets_select_one_to_four_steps(self) -> None:
        initial = NoteManagerPerformanceState()
        one = advance_note_manager_performance(initial, 0.017, 1)
        two = advance_note_manager_performance(initial, 0.02, 1)
        three = advance_note_manager_performance(initial, 0.04, 1)
        four = advance_note_manager_performance(initial, 0.06, 1)
        self.assertEqual(one.counters, (1, 0, 0, 0))
        self.assertEqual(two.counters, (0, 1, 0, 0))
        self.assertEqual(three.counters, (0, 0, 1, 0))
        self.assertEqual(four.counters, (0, 0, 0, 1))
        self.assertEqual(
            (one.update_steps, two.update_steps, three.update_steps, four.update_steps),
            (1, 2, 3, 4),
        )

    def test_note_manager_performance_history_forces_single_step(self) -> None:
        first_bucket = advance_note_manager_performance(
            NoteManagerPerformanceState(counters=(100, 0, 0, 0)), 0.06, 1
        )
        second_bucket = advance_note_manager_performance(
            NoteManagerPerformanceState(counters=(0, 20, 0, 0)), 0.02, 1
        )
        third_bucket = advance_note_manager_performance(
            NoteManagerPerformanceState(counters=(0, 0, 5, 0)), 0.04, 1
        )
        self.assertEqual(first_bucket.update_steps, 4)
        first_bucket = advance_note_manager_performance(first_bucket, 0.017, 1)
        self.assertEqual(first_bucket.counters[0], 101)
        self.assertEqual(first_bucket.update_steps, 1)
        self.assertEqual(second_bucket.counters[1], 21)
        self.assertEqual(second_bucket.update_steps, 1)
        self.assertEqual(third_bucket.counters[2], 6)
        self.assertEqual(third_bucket.update_steps, 1)

    def test_note_manager_performance_is_disabled_without_bpm_changes(self) -> None:
        state = advance_note_manager_performance(
            NoteManagerPerformanceState(), 0.06, 0
        )
        self.assertEqual(state.counters, (0, 0, 0, 0))
        self.assertEqual(state.update_steps, 1)
        self.assertEqual(state.substep_delta_time, 0.06)
        self.assertEqual(state.substep_execute_frame, 1.0)

    def test_runtime_snapshot_exposes_note_manager_performance_state(self) -> None:
        runtime = self.make_runtime()
        runtime.update(0.02)
        snapshot = runtime.snapshot()
        self.assertEqual(snapshot["note_manager"]["counters"], (0, 0, 0, 0))
        self.assertEqual(snapshot["note_manager"]["update_steps"], 1)
        self.assertAlmostEqual(snapshot["note_manager"]["substep_delta_time"], 0.02)
        self.assertAlmostEqual(snapshot["note_manager"]["substep_execute_frame"], 1.0)

    def test_runtime_bpm_command_changes_state_at_absolute_position(self) -> None:
        command = BpmChangeCommandSpec(
            "bpm-96",
            96.0,
            0,
            1,
            2,
            180.5,
            "180.5",
            8,
            0,
        )
        runtime = RuntimeIntegration(
            TempoMap(
                [TempoChange(0, 120), TempoChange(96, 180.5)],
                units_per_bar=192,
            ),
            (),
            bpm_change_commands=(command,),
            basic_bpm=120,
            basic_bpm_string="120",
        )
        runtime.update(0.99)
        self.assertEqual(runtime.bpm_runtime.current_bpm, 120)
        self.assertEqual(runtime.bpm_runtime.next_bpm, 180.5)
        runtime.update(0.02)
        self.assertEqual(
            (
                runtime.bpm_runtime.current_bpm,
                runtime.bpm_runtime.current_bpm_string,
                runtime.bpm_runtime.next_bpm,
                runtime.bpm_runtime.applied_command_ids,
            ),
            (180.5, "180.5", None, ["bpm-96"]),
        )
        event = next(event for event in runtime.events if event.kind == "bpm_changed")
        self.assertEqual(
            (event.command_id, event.position, event.bpm, event.bpm_string),
            ("bpm-96", 96.0, 180.5, "180.5"),
        )
        self.assertGreater(sum(runtime.note_manager_performance.counters), 0)

    def test_runtime_bpm_state_rebuilds_after_backward_restore(self) -> None:
        commands = (
            BpmChangeCommandSpec("bpm-a", 96.0, 0, 1, 2, 180, "180", 3, 0),
            BpmChangeCommandSpec("bpm-b", 288.0, 1, 1, 2, 240, "240", 3, 1),
        )
        runtime = RuntimeIntegration(
            TempoMap(
                [
                    TempoChange(0, 120),
                    TempoChange(96, 180),
                    TempoChange(288, 240),
                ],
                units_per_bar=192,
            ),
            (),
            bpm_change_commands=commands,
            basic_bpm=120,
            basic_bpm_string="120",
        )
        runtime.restore_bpm_state(300)
        self.assertEqual(
            (runtime.bpm_runtime.current_bpm, runtime.bpm_runtime.next_bpm),
            (240, None),
        )
        runtime.restore_bpm_state(100)
        self.assertEqual(
            (
                runtime.bpm_runtime.current_bpm,
                runtime.bpm_runtime.next_bpm,
                runtime.bpm_runtime.applied_command_ids,
            ),
            (180, 240, ["bpm-a"]),
        )

    def test_slide_tail_is_exposed_as_standalone_runtime_node(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("tail-node", 120, 1, "slide", 240, end_lane=4, end_width=2)],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(1, 1)
        self.advance(runtime, 0.9)
        tail = runtime.render.slide_tails["tail-node"]
        self.assertEqual(tail.node_id, "tail-node:tail")
        self.assertEqual(tail.lane, 4)
        self.assertEqual(tail.width, 2)
        self.assertEqual(tail.state, "move")
        self.advance(runtime, 0.11)
        self.assertEqual(runtime.render.slide_tails["tail-node"].state, "stop")

    def test_ordinary_flick_slide_tail_uses_shared_flick_visuals(self) -> None:
        route = slide_tail_visual_route(None, "flick")
        self.assertEqual(route.subclass, "flick")
        self.assertEqual(route.sprite_key, "note_flick")
        self.assertEqual(route.icon_sprite_key, "note_flick_top")
        self.assertTrue(route.flick_icon_enabled)
        self.assertIsNone(route.directional_animation)

    def test_slide_tail_after_note_type_selects_exact_factory_subclass(self) -> None:
        expected = {
            8: "flick",
            9: "directional_flick",
            10: "directional_flick",
            11: "multiple_directional_flick",
            12: "multiple_directional_flick",
        }
        for after_note_type, subclass in expected.items():
            self.assertEqual(
                slide_tail_subclass_from_after_note_type(after_note_type),
                subclass,
            )
        self.assertIsNone(slide_tail_subclass_from_after_note_type(7))

    def test_after_note_type_overrides_compatibility_end_gesture(self) -> None:
        route = slide_tail_visual_route(14, "release", after_note_type=11)
        self.assertEqual(route.subclass, "multiple_directional_flick")
        self.assertEqual(route.sprite_key, "note_flick_l")

    def test_left_multiple_direction_accumulates_confirmed_z_step(self) -> None:
        left, right = multiple_directional_flick_side_z_positions(14, 2, 3)
        self.assertEqual(
            left,
            (-MULTIPLE_DIRECTIONAL_FLICK_Z_STEP, -2 * MULTIPLE_DIRECTIONAL_FLICK_Z_STEP),
        )
        self.assertEqual(
            right,
            (
                MULTIPLE_DIRECTIONAL_FLICK_Z_STEP,
                2 * MULTIPLE_DIRECTIONAL_FLICK_Z_STEP,
                3 * MULTIPLE_DIRECTIONAL_FLICK_Z_STEP,
            ),
        )

    def test_right_multiple_direction_reverses_confirmed_z_step(self) -> None:
        left, right = multiple_directional_flick_side_z_positions(17, 1, 1, 0.5)
        self.assertEqual(left, (0.5 + MULTIPLE_DIRECTIONAL_FLICK_Z_STEP,))
        self.assertEqual(right, (0.5 - MULTIPLE_DIRECTIONAL_FLICK_Z_STEP,))

    def test_slide_tail_connection_graph_matches_native_edge_ownership(self) -> None:
        graph = build_slide_tail_connection_graph(
            "tail",
            3,
            14,
            (
                SlideTailSideNodeSpec("left-far", 1, 20),
                SlideTailSideNodeSpec("left-near", 2, 20),
                SlideTailSideNodeSpec("right", 4, 20),
            ),
        )
        nodes = {node.node_id: node for node in graph.nodes}
        self.assertEqual(nodes["tail"].left_visual_id, "left-near")
        self.assertEqual(nodes["tail"].right_visual_id, "right")
        self.assertEqual(nodes["left-near"].right_after_id, "tail")
        self.assertEqual(nodes["left-far"].far_right_after_id, "tail")
        self.assertEqual(nodes["right"].left_after_id, "tail")
        self.assertEqual(nodes["right"].far_left_after_id, "tail")
        self.assertEqual(
            {(line.owner_node_id, line.target_node_id) for line in graph.back_lines},
            {
                ("left-far", "left-near"),
                ("left-near", "left-far"),
                ("tail", "left-near"),
                ("tail", "right"),
            },
        )
        self.assertTrue(all(line.side == "left" for line in graph.back_lines))
        self.assertTrue(
            all(
                line.material_binding
                is MULTIPLE_FLICK_BACK_LINE_BINDINGS["left"]
                for line in graph.back_lines
            )
        )
        self.assertTrue(
            all(line.shader_parameters == {"_Threshold": 1.0} for line in graph.back_lines)
        )

    def test_slide_tail_connection_graph_applies_owner_material_and_threshold(self) -> None:
        graph = build_slide_tail_connection_graph(
            "tail",
            3,
            15,
            (
                SlideTailSideNodeSpec("left", 2, 21),
                SlideTailSideNodeSpec("right", 4, 21),
            ),
            shader_threshold=4.25,
        )
        self.assertTrue(all(line.side == "right" for line in graph.back_lines))
        self.assertTrue(
            all(
                line.material_id
                == "resources:Materials/BMS/MultipleDirectionalFlickNoteLineRight"
                for line in graph.back_lines
            )
        )
        self.assertTrue(
            all(
                line.shader_parameters == {"_Threshold": 4.25}
                for line in graph.back_lines
            )
        )

    def test_slide_tail_connection_graph_rejects_wrong_add_type(self) -> None:
        with self.assertRaises(ValueError):
            build_slide_tail_connection_graph(
                "tail",
                3,
                14,
                (SlideTailSideNodeSpec("wrong", 2, 21),),
            )

    def test_slide_tail_connection_graph_rejects_button_gap(self) -> None:
        with self.assertRaises(ValueError):
            build_slide_tail_connection_graph(
                "tail",
                3,
                14,
                (SlideTailSideNodeSpec("gap", 1, 20),),
            )

    def test_left_directional_slide_tail_routes_types_fourteen_and_sixteen(self) -> None:
        for game_note_type in (14, 16):
            route = slide_tail_visual_route(game_note_type, "directional_left")
            self.assertEqual(route.sprite_key, "note_flick_l")
            self.assertEqual(route.icon_sprite_key, "note_flick_top_l")
            self.assertEqual(route.directional_animation, "FlickNoteIconLeft")
            self.assertEqual(route.flick_icon_sorting_order, 71)

    def test_right_directional_slide_tail_routes_types_fifteen_and_seventeen(self) -> None:
        for game_note_type in (15, 17):
            route = slide_tail_visual_route(game_note_type, "directional_right")
            self.assertEqual(route.sprite_key, "note_flick_r")
            self.assertEqual(route.icon_sprite_key, "note_flick_top_r")
            self.assertEqual(route.directional_animation, "FlickNoteIconRight")
            self.assertEqual(route.flick_icon_sorting_order, 71)

    def test_multiple_directional_side_visual_routes_types_twenty_through_twenty_three(
        self,
    ) -> None:
        for game_note_type in (20, 22):
            route = multiple_directional_side_visual_route(game_note_type)
            self.assertEqual(route.sprite_key, "note_flick_l")
            self.assertEqual(route.icon_sprite_key, "note_flick_top_l")
            self.assertEqual(route.directional_animation, "FlickNoteIconLeft")
            self.assertEqual(route.flick_icon_sorting_order, 71)
        for game_note_type in (21, 23):
            route = multiple_directional_side_visual_route(game_note_type)
            self.assertEqual(route.sprite_key, "note_flick_r")
            self.assertEqual(route.icon_sprite_key, "note_flick_top_r")
            self.assertEqual(route.directional_animation, "FlickNoteIconRight")
            self.assertEqual(route.flick_icon_sorting_order, 71)

    def test_multiple_directional_tail_exposes_side_chain_visual_state(self) -> None:
        tail = self.make_multiple_slide_tail()
        self.assertEqual(tail.subclass, "multiple_directional_flick")
        self.assertEqual(tail.game_note_type, 4)
        self.assertEqual(tail.end_game_note_type, 14)
        self.assertEqual(tail.multiple_left_count, 2)
        self.assertEqual(tail.multiple_right_count, 1)
        self.assertEqual(tail.side_notes_state, "move")
        self.assertTrue(tail.side_notes_sprite_enabled)
        self.assertTrue(tail.back_line_active)
        self.assertFalse(tail.flick_icon_enabled)
        self.assertEqual(
            tail.left_side_z_positions,
            (-MULTIPLE_DIRECTIONAL_FLICK_Z_STEP, -2 * MULTIPLE_DIRECTIONAL_FLICK_Z_STEP),
        )
        self.assertEqual(
            tail.right_side_z_positions,
            (MULTIPLE_DIRECTIONAL_FLICK_Z_STEP,),
        )
        graph = tail.side_connection_graph
        self.assertIsNotNone(graph)
        self.assertEqual(len(graph.nodes), 4)
        self.assertEqual(len(graph.back_lines), 4)
        self.assertEqual(
            graph.active_node_order,
            (
                "multiple-left-far",
                "multiple-tail:tail",
            ),
        )
        self.assertEqual(graph.active_node_order_source, "confirmed_chart_order")
        self.assertTrue(all(line.active for line in graph.back_lines))
        self.assertTrue(all(line.renderer_enabled for line in graph.back_lines))
        nodes = {node.node_id: node for node in graph.nodes}
        active_owner_ids = set(graph.active_node_order)
        for line in graph.back_lines:
            expected_width = (
                nodes[line.owner_node_id].scale_x * 0.75
                if line.owner_node_id in active_owner_ids
                else 0.0
            )
            self.assertAlmostEqual(line.width, expected_width)
        self.assertTrue(
            all(line.positions[0][0] <= line.positions[1][0] for line in graph.back_lines)
        )
        root = nodes[graph.root_node_id]
        visual_nodes = tuple(node for node in graph.nodes if node.role == "visual")
        self.assertTrue(all(node.position[1] == root.position[1] for node in visual_nodes))
        self.assertEqual(
            {node.node_id: node.resource_id for node in visual_nodes},
            {
                "multiple-left-far": "note_flick_l_1",
                "multiple-left-near": "note_flick_l_2",
                "multiple-right": "note_flick_l_4",
            },
        )
        self.assertTrue(all(node.sorting_order == 70 for node in visual_nodes))
        self.assertTrue(all(node.flick_icon is not None for node in visual_nodes))
        self.assertTrue(
            all(node.flick_icon.resource_id == "note_flick_top_l" for node in visual_nodes)
        )
        self.assertTrue(
            all(node.flick_icon.sorting_order == 71 for node in visual_nodes)
        )
        self.assertTrue(
            all(
                node.flick_icon.animator_state == "FlickNoteIconLeft"
                for node in visual_nodes
            )
        )

    def test_multiple_directional_back_lines_update_move_geometry_and_width(self) -> None:
        tail = advance_slide_tail_back_lines(self.make_multiple_slide_tail())
        nodes = {
            node.node_id: node for node in tail.side_connection_graph.nodes
        }
        active_owner_ids = set(tail.side_connection_graph.active_node_order)
        for line in tail.side_connection_graph.back_lines:
            self.assertTrue(line.active)
            if line.owner_node_id in active_owner_ids:
                self.assertTrue(line.renderer_enabled)
                self.assertAlmostEqual(
                    line.width,
                    nodes[line.owner_node_id].scale_x * 0.75,
                )
            else:
                self.assertTrue(line.renderer_enabled)
                self.assertEqual(line.width, 0.0)
            self.assertLessEqual(line.positions[0][0], line.positions[1][0])

    def test_multiple_directional_back_lines_swap_complete_world_vectors(self) -> None:
        tail = self.make_multiple_slide_tail()
        graph = tail.side_connection_graph
        line = next(
            line
            for line in graph.back_lines
            if line.owner_node_id in graph.active_node_order
        )
        nodes = tuple(
            replace(node, position=(4.0, 2.5), z_position=0.125)
            if node.node_id == line.owner_node_id
            else replace(node, position=(-2.0, 7.5), z_position=-0.25)
            if node.node_id == line.target_node_id
            else node
            for node in graph.nodes
        )
        graph = advance_slide_tail_connection_owner(
            replace(graph, nodes=nodes),
            line.owner_node_id,
        )
        updated = next(item for item in graph.back_lines if item.line_id == line.line_id)
        self.assertEqual(
            updated.positions,
            ((-2.0, 7.5, -0.25), (4.0, 2.5, 0.125)),
        )

    def test_multiple_directional_back_lines_follow_dynamic_world_y(self) -> None:
        tail = advance_slide_tail_back_lines(self.make_multiple_slide_tail())
        graph = tail.side_connection_graph
        line = next(
            line
            for line in graph.back_lines
            if line.owner_node_id in graph.active_node_order
        )
        original = next(item for item in graph.back_lines if item.line_id == line.line_id)
        target_before = next(
            node for node in graph.nodes if node.node_id == line.target_node_id
        )
        nodes = tuple(
            replace(node, position=(node.position[0], node.position[1] + 3.25))
            if node.node_id == line.target_node_id
            else node
            for node in graph.nodes
        )
        graph = advance_slide_tail_connection_owner(
            replace(graph, nodes=nodes),
            line.owner_node_id,
        )
        updated = next(item for item in graph.back_lines if item.line_id == line.line_id)
        self.assertNotEqual(updated.positions, original.positions)
        self.assertIn(
            target_before.position[1] + 3.25,
            tuple(point[1] for point in updated.positions),
        )

    def test_multiple_directional_back_lines_hide_stop_without_deactivate(self) -> None:
        tail = advance_slide_tail_back_lines(self.make_multiple_slide_tail())
        active_owner_ids = set(tail.side_connection_graph.active_node_order)
        tail = set_slide_tail_note_state(tail, "stop")
        tail = advance_slide_tail_back_lines(tail)
        self.assertTrue(all(line.active for line in tail.side_connection_graph.back_lines))
        self.assertTrue(
            all(
                line.renderer_enabled is False
                for line in tail.side_connection_graph.back_lines
                if line.owner_node_id in active_owner_ids
            )
        )
        self.assertTrue(
            all(
                line.renderer_enabled is True
                for line in tail.side_connection_graph.back_lines
                if line.owner_node_id not in active_owner_ids
            )
        )

    def test_note_manager_substep_updates_only_active_stop_line_owners(self) -> None:
        tail = advance_slide_tail_back_lines(self.make_multiple_slide_tail())
        graph = tail.side_connection_graph
        root = next(node for node in graph.nodes if node.role == "tail")
        active_owner_ids = set(graph.active_node_order)

        def update_root(
            _substep: int,
            node_id: str,
            current_tail,
        ):
            if node_id == root.node_id:
                return set_slide_tail_note_state(current_tail, "stop")
            return current_tail

        trace = advance_note_manager_two_phase_substeps(
            tail,
            1,
            update_root,
        )
        updated_tail = trace.slide_tail
        self.assertTrue(
            all(line.active for line in updated_tail.side_connection_graph.back_lines)
        )
        self.assertTrue(
            all(
                not line.renderer_enabled
                for line in updated_tail.side_connection_graph.back_lines
                if line.owner_node_id in active_owner_ids
            )
        )
        self.assertTrue(
            all(
                line.renderer_enabled is True and line.width == 0.0
                for line in updated_tail.side_connection_graph.back_lines
                if line.owner_node_id not in active_owner_ids
            )
        )
        root_update_index = trace.substeps[0].phase_sequence.index(
            f"update:{root.node_id}"
        )
        self.assertEqual(
            trace.substeps[0].phase_sequence[root_update_index + 1],
            f"update_back_line:{root.node_id}",
        )

    def test_back_line_prefab_defaults_match_serialized_evidence(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_prefab_defaults.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(
            evidence["source"]["zip_entry"],
            "assets/bin/Data/b9163b90ea8e34687964fab5c20b6b8d",
        )
        self.assertTrue(evidence["game_object"]["active"])
        self.assertTrue(evidence["line_renderer"]["enabled"])
        self.assertEqual(
            evidence["line_renderer"]["material_slots"],
            [{"file_id": 0, "path_id": 0}],
        )
        self.assertEqual(evidence["line_renderer"]["sorting_order"], 0)
        self.assertEqual(
            [key["value"] for key in evidence["line_renderer"]["width_curve"]],
            [0.2800000011920929, 0.2800000011920929],
        )

    def test_back_line_material_shader_assets_match_integrated_bindings(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_material_shader.json")
            .read_text(encoding="utf-8")
        )
        for side in ("left", "right"):
            binding = MULTIPLE_FLICK_BACK_LINE_BINDINGS[side]
            material = evidence["materials"][side]
            self.assertEqual(binding.material_asset_name, material["name"])
            self.assertEqual(binding.material_asset_entry, material["zip_entry"])
            self.assertEqual(binding.shader_name, evidence["shader"]["name"])
            self.assertEqual(
                binding.texture_resource_name,
                "FlickNoteLine_l" if side == "left" else "FlickNoteLine_r",
            )
            self.assertEqual(
                binding.texture_field,
                "directionalFlickNoteSkinAssetLoader:"
                + binding.texture_resource_name,
            )
            self.assertEqual(
                binding.serialized_float_properties,
                (("_Threshold", MULTIPLE_FLICK_BACK_LINE_SERIALIZED_THRESHOLD),),
            )
        self.assertEqual(
            MULTIPLE_FLICK_BACK_LINE_SHADER_NAME,
            "star/Star Transparent Colored",
        )
        self.assertEqual(
            evidence["shader"]["shared_pass_state"]["z_write"],
            0.0,
        )
        self.assertEqual(
            evidence["shader"]["shared_pass_state"]["cull"],
            0.0,
        )

    def test_long_slide_and_sync_materials_share_recovered_shader(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("note_mesh_material_shader_assets.json")
            .read_text(encoding="utf-8")
        )
        bindings = {
            "long_note_mesh": NOTE_MESH_MATERIAL_BINDINGS["long"],
            "curve_slide_note_mesh": NOTE_MESH_MATERIAL_BINDINGS["slide"],
            "sync_note_line": SYNC_NOTE_LINE_BINDING,
        }
        for role, binding in bindings.items():
            material = evidence["materials"][role]
            self.assertEqual(binding.material_asset_name, material["name"])
            self.assertEqual(binding.material_asset_entry, material["zip_entry"])
            self.assertEqual(
                binding.shader_name,
                STAR_TRANSPARENT_COLORED_SHADER_NAME,
            )
            self.assertEqual(
                binding.serialized_float_properties,
                (("_Threshold", material["threshold"]),),
            )
        line = build_sync_line_geometry(
            ("a", "b"),
            (0.0, 0.0),
            (1.0, 0.0),
            1.0,
            1.0,
            0.0,
            shader_threshold=4.0,
        )
        self.assertEqual(line.material_binding, SYNC_NOTE_LINE_BINDING)
        self.assertEqual(line.shader_name, STAR_TRANSPARENT_COLORED_SHADER_NAME)
        sample = (0.2, 0.4, 0.6, 0.5)
        vertex = (0.5, 1.0, 0.25, 0.8)
        self.assertEqual(
            shade_star_transparent_colored(sample, vertex, 5.0, 10.0),
            shade_multiple_flick_back_line(sample, vertex, 5.0, 10.0),
        )

    def test_back_line_texture_boundary_routes_external_skin_textures(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_texture_boundary.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(evidence["apk_scan"]["serialized_asset_hits"], 0)
        self.assertEqual(
            evidence["directional_skin_bundle"]["bundle_name_format"],
            "ingameskin/noteskin/directionalflick{0}",
        )
        self.assertIn(
            "FlickNoteLine_l",
            evidence["load_resources"]["left"],
        )
        self.assertIn(
            "0x330B5A4",
            evidence["load_resources"]["right"],
        )

    def test_back_line_shader_programs_match_recovered_fragment_paths(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_shader_programs.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(evidence["lod_200"]["texture_samples"], 1)
        self.assertEqual(evidence["lod_200"]["threshold_comparisons"], 1)
        self.assertEqual(evidence["lod_100"]["threshold_comparisons"], 0)
        shaded = shade_multiple_flick_back_line(
            (0.2, 0.4, 0.6, 0.5),
            (0.5, 1.0, 0.25, 0.8),
            5.0,
            10.0,
        )
        self.assertEqual(shaded[:3], (0.1, 0.4, 0.15))
        self.assertAlmostEqual(shaded[3], 0.48786146083075893)
        clipped = shade_multiple_flick_back_line(
            (1.0, 1.0, 1.0, 1.0),
            (1.0, 1.0, 1.0, 1.0),
            5.0,
            4.999,
        )
        self.assertEqual(clipped, (1.0, 1.0, 1.0, 0.0))
        fallback = shade_multiple_flick_back_line(
            (0.2, 0.4, 0.6, 0.5),
            (2.0, -1.0, 0.5, 1.5),
            5.0,
            0.0,
            lod=100,
        )
        self.assertEqual(fallback, (0.2, 0.0, 0.3, 0.5))
        with self.assertRaises(ValueError):
            shade_multiple_flick_back_line(
                (1.0, 1.0, 1.0, 1.0),
                (1.0, 1.0, 1.0, 1.0),
                0.0,
                0.0,
                lod=300,
            )

    def test_back_line_vulkan_modules_match_gles_semantics(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_shader_programs.json")
            .read_text(encoding="utf-8")
        )
        vulkan = evidence["platform_blocks"][1]
        self.assertEqual(vulkan["platform"], "kShaderCompPlatformVulkan")
        self.assertEqual(vulkan["container"]["active_snippets"], 2)
        self.assertEqual(vulkan["container"]["decoded_magic"], "0x07230203")
        snippets = [
            snippet
            for program in vulkan["lod_programs"]
            for snippet in program["snippets"]
        ]
        self.assertEqual(
            [(snippet["stage"], snippet["decoded_size"]) for snippet in snippets],
            [
                ("vertex", 3196),
                ("fragment", 3888),
                ("vertex", 2956),
                ("fragment", 972),
            ],
        )
        cross_check = evidence["vulkan_cross_check"]
        self.assertEqual(
            cross_check["lod_200_fragment"]["image_sample_implicit_lod_count"],
            1,
        )
        self.assertEqual(
            cross_check["lod_200_fragment"][
                "ordered_greater_than_or_equal_count"
            ],
            1,
        )
        self.assertEqual(cross_check["lod_200_fragment"]["select_count"], 1)
        self.assertEqual(
            cross_check["lod_100_fragment"]["threshold_comparison_count"],
            0,
        )

    def test_back_line_external_texture_profiles_feed_shader_input(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_texture_pixels.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(evidence["common_png"]["width"], 10)
        self.assertEqual(evidence["common_png"]["height"], 78)
        self.assertEqual(len(evidence["profiles"]), 6)
        self.assertEqual(len(MULTIPLE_FLICK_BACK_LINE_TEXTURE_PROFILES), 6)
        manifest = json.loads(
            Path(__file__).with_name("resource_manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["version"], 70)
        self.assertEqual(
            len(
                manifest["external_texture_profiles"][
                    "multiple_directional_flick_back_line"
                ]["bundle_names"]
            ),
            6,
        )
        self.assertEqual(len(MULTIPLE_FLICK_BACK_LINE_ALPHA_BY_PNG_ROW), 78)
        profile = multiple_flick_back_line_texture_profile(
            "ingameskin/noteskin/directionalflickskin00"
        )
        self.assertIs(profile, MULTIPLE_FLICK_BACK_LINE_TEXTURE_PROFILES["directionalflickskin00"])
        self.assertEqual(
            multiple_flick_back_line_texture_texel(profile, "left", 0),
            (126 / 255, 77 / 255, 241 / 255, 2 / 255),
        )
        self.assertEqual(
            multiple_flick_back_line_texture_texel(profile, "right", 24),
            (1.0, 173 / 255, 140 / 255, 204 / 255),
        )
        for png_row in range(profile.height):
            self.assertEqual(
                multiple_flick_back_line_texture_texel(profile, "left", png_row),
                multiple_flick_back_line_texture_texel(
                    profile,
                    "left",
                    profile.height - 1 - png_row,
                ),
            )
        shaded = shade_multiple_flick_back_line(
            multiple_flick_back_line_texture_texel(profile, "left", 24),
            (1.0, 1.0, 1.0, 1.0),
            0.0,
            1.0,
        )
        self.assertEqual(shaded[:3], (167 / 255, 133 / 255, 248 / 255))
        with self.assertRaises(ValueError):
            multiple_flick_back_line_texture_profile("directionalflickskin99")
        with self.assertRaises(ValueError):
            multiple_flick_back_line_texture_texel(profile, "left", 78)

    def test_back_line_bundle_url_chain_records_superseded_import_boundary(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_asset_bundle_acquisition.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(
            evidence["url_base_algorithm"]["canonical_directory_template"],
            "https://content.garupa.jp/Release/{dataVersion}_{versionHash}/Android",
        )
        self.assertEqual(
            evidence["bundle_url_algorithm"]["canonical_template"],
            "https://content.garupa.jp/Release/{dataVersion}_{versionHash}/Android/"
            "{bundleName}?t={localNow:yyyyMMddHHmmss}",
        )
        self.assertEqual(
            evidence["bestdori_and_local_cache_boundary"]["local_cached_bundle_format"],
            "UTF-8 JSON export of the Unity AssetBundle object, beginning with "
            "{\"Base\":{\"m_Name\":...",
        )
        self.assertIn(
            "m_FilterMode",
            evidence["bestdori_and_local_cache_boundary"]["missing_texture_fields"],
        )
        self.assertEqual(
            evidence["superseded_by"],
            "multiple_flick_back_line_original_texture_settings.json",
        )

    def test_back_line_original_bundle_confirms_texture_import_settings(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_original_texture_settings.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(
            evidence["application_response_crypto"]["decoded_top_level"]["dataVersion"],
            "10.1.0.200",
        )
        self.assertEqual(
            evidence["original_bundle_acquisition"]["sha256"],
            "0689538620373dad6040ba91fc14eb6db83f928cc82130f3e344dd7bdd9d8365",
        )
        self.assertIn(
            "Range",
            evidence["asset_bundle_downloader"]["absent_in_recovered_request_path"],
        )
        for name in ("FlickNoteLine_l", "FlickNoteLine_r"):
            texture = evidence["serialized_textures"][name]
            self.assertEqual(texture["m_TextureFormat"]["meaning"], "RGBA32")
            self.assertEqual(texture["m_TextureSettings.m_FilterMode"]["meaning"], "Bilinear")
            self.assertEqual(texture["m_MipCount"], 1)
            self.assertEqual(texture["m_TextureSettings.m_WrapU"]["meaning"], "Clamp")
            self.assertEqual(texture["m_TextureSettings.m_WrapV"]["meaning"], "Clamp")
            self.assertEqual(texture["m_TextureSettings.m_WrapW"]["meaning"], "Clamp")
            self.assertEqual(texture["m_ColorSpace"]["meaning"], "sRGB")
            self.assertTrue(texture["m_IsReadable"])
            self.assertFalse(texture["m_StreamingMipmaps"])

    def test_back_line_confirmed_sampler_clamps_decodes_srgb_and_filters(self) -> None:
        profile = multiple_flick_back_line_texture_profile(
            "ingameskin/noteskin/directionalflickskin00"
        )
        row_24_center_v = 1.0 - 24.5 / profile.height
        sampled = multiple_flick_back_line_texture_sample(
            profile,
            "right",
            -1.0,
            row_24_center_v,
        )
        self.assertAlmostEqual(sampled[0], 1.0)
        self.assertAlmostEqual(sampled[1], ((173 / 255 + 0.055) / 1.055) ** 2.4)
        self.assertAlmostEqual(sampled[2], ((140 / 255 + 0.055) / 1.055) ** 2.4)
        self.assertAlmostEqual(sampled[3], 204 / 255)

        row_18_19_boundary_v = 1.0 - 19.0 / profile.height
        boundary = multiple_flick_back_line_texture_sample(
            profile,
            "left",
            2.0,
            row_18_19_boundary_v,
        )
        edge = multiple_flick_back_line_texture_sample(
            profile,
            "left",
            0.5,
            1.0 - 18.5 / profile.height,
        )
        core = multiple_flick_back_line_texture_sample(
            profile,
            "left",
            0.5,
            1.0 - 19.5 / profile.height,
        )
        for index in range(4):
            self.assertAlmostEqual(boundary[index], (edge[index] + core[index]) / 2.0)

        for confirmed_profile in MULTIPLE_FLICK_BACK_LINE_TEXTURE_PROFILES.values():
            multiple_flick_back_line_texture_sample(
                confirmed_profile,
                "left",
                0.5,
                0.5,
            )

    def test_back_line_cross_skin_settings_preserve_readable_partition(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("multiple_flick_back_line_cross_skin_texture_settings.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(len(evidence["bundles"]), 6)
        self.assertEqual(len(MULTIPLE_FLICK_BACK_LINE_TEXTURE_SETTINGS), 6)
        self.assertEqual(
            set(evidence["readable_partition"]["true"]),
            {
                "directionalflickskin00",
                "directionalflickskin01",
                "directionalflickskin_persona",
            },
        )
        self.assertEqual(
            set(evidence["readable_partition"]["false"]),
            {
                "directionalflickskin02",
                "directionalflickskin03",
                "directionalflickskin04",
            },
        )
        for name, bundle in evidence["bundles"].items():
            settings = MULTIPLE_FLICK_BACK_LINE_TEXTURE_SETTINGS[name]
            self.assertEqual(settings.filter_mode, "Bilinear")
            self.assertEqual(settings.wrap_u, "Clamp")
            self.assertEqual(settings.wrap_v, "Clamp")
            self.assertEqual(settings.wrap_w, "Clamp")
            self.assertEqual(settings.mip_count, 1)
            self.assertEqual(settings.color_space, "sRGB")
            self.assertEqual(settings.readable, bundle["m_IsReadable"])
            self.assertFalse(settings.streaming_mipmaps)

    def test_terminal_side_consumption_releases_bridge_in_same_update(self) -> None:
        tail = advance_slide_tail_back_lines(self.make_multiple_slide_tail())
        graph = tail.side_connection_graph
        root = next(node for node in graph.nodes if node.role == "tail")
        target_id = "multiple-right"

        def consume_right_side(
            _substep: int,
            node_id: str,
            current_tail,
        ):
            if node_id == root.node_id:
                return consume_slide_tail_side_notes(current_tail, "right")
            return current_tail

        trace = advance_note_manager_two_phase_substeps(
            tail,
            1,
            consume_right_side,
        )
        graph = trace.slide_tail.side_connection_graph
        lines = {
            (line.owner_node_id, line.target_node_id): line
            for line in graph.back_lines
        }
        bridge = lines[(root.node_id, target_id)]
        self.assertFalse(bridge.active)
        self.assertFalse(bridge.renderer_enabled)

    def test_terminal_line_waits_when_target_deactivates_after_root_update(self) -> None:
        tail = advance_slide_tail_back_lines(
            self.make_multiple_slide_tail((1, 0, 2, 3))
        )
        graph = tail.side_connection_graph
        root = next(node for node in graph.nodes if node.role == "tail")
        target_id = "multiple-left-near"

        def deactivate_target(
            _substep: int,
            node_id: str,
            current_tail,
        ):
            if node_id == target_id:
                return set_slide_tail_connection_node_state(
                    current_tail,
                    node_id,
                    "deactive",
                )
            return current_tail

        first_trace = advance_note_manager_two_phase_substeps(
            tail,
            1,
            deactivate_target,
        )
        graph = first_trace.slide_tail.side_connection_graph
        first_bridge = next(
            line
            for line in graph.back_lines
            if line.owner_node_id == root.node_id
            and line.target_node_id == target_id
        )
        self.assertTrue(first_bridge.active)
        self.assertTrue(first_bridge.renderer_enabled)

        second_trace = advance_note_manager_two_phase_substeps(
            first_trace.slide_tail,
            1,
        )
        graph = second_trace.slide_tail.side_connection_graph
        second_bridge = next(
            line
            for line in graph.back_lines
            if line.owner_node_id == root.node_id
            and line.target_node_id == target_id
        )
        self.assertFalse(second_bridge.active)
        self.assertFalse(second_bridge.renderer_enabled)

    def test_note_manager_excludes_deactive_root_from_after_phase(self) -> None:
        tail = advance_slide_tail_back_lines(self.make_multiple_slide_tail())
        root = next(
            node
            for node in tail.side_connection_graph.nodes
            if node.role == "tail"
        )
        trace = advance_note_manager_two_phase_substeps(
            tail,
            1,
            lambda _substep, node_id, current: (
                set_slide_tail_connection_node_state(current, node_id, "deactive")
                if node_id == root.node_id
                else current
            ),
        )
        self.assertNotIn(root.node_id, trace.substeps[0].after_update_order)
        root_update_index = trace.substeps[0].phase_sequence.index(
            f"update:{root.node_id}"
        )
        self.assertEqual(
            trace.substeps[0].phase_sequence[root_update_index + 1],
            f"update_back_line:{root.node_id}",
        )
        self.assertTrue(
            all(
                not line.active and not line.renderer_enabled
                for line in trace.slide_tail.side_connection_graph.back_lines
                if line.owner_node_id == root.node_id
            )
        )

    def test_note_manager_finishes_all_updates_before_any_after_update(self) -> None:
        tail = self.make_multiple_slide_tail()
        trace = advance_note_manager_two_phase_substeps(
            tail,
            1,
        )
        self.assertEqual(
            trace.substeps[0].update_order,
            (
                "multiple-tail:tail",
                "multiple-left-far",
            ),
        )
        phase_sequence = trace.substeps[0].phase_sequence
        first_after_index = next(
            index
            for index, phase in enumerate(phase_sequence)
            if phase.startswith("after_update:")
        )
        self.assertTrue(
            all(
                phase.startswith("update:") or phase.startswith("update_back_line:")
                for phase in phase_sequence[:first_after_index]
            )
        )

    def test_note_manager_repeats_two_phases_inside_every_substep(self) -> None:
        tail = self.make_multiple_slide_tail()
        trace = advance_note_manager_two_phase_substeps(
            tail,
            4,
        )
        self.assertEqual(len(trace.substeps), 4)
        for substep_index, substep in enumerate(trace.substeps):
            self.assertEqual(substep.substep_index, substep_index)
            self.assertEqual(
                substep.update_order,
                (
                    "multiple-tail:tail",
                    "multiple-left-far",
                ),
            )
            self.assertEqual(
                substep.after_update_order,
                (
                    "multiple-tail:tail",
                    "multiple-left-far",
                ),
            )
            self.assertEqual(
                substep.phase_sequence,
                (
                    "update:multiple-tail:tail",
                    "update_back_line:multiple-tail:tail",
                    "update:multiple-left-far",
                    "after_update:multiple-tail:tail",
                    "after_update:multiple-left-far",
                    "after_back_line:multiple-left-far",
                ),
            )

    def test_note_manager_drops_self_deactive_node_before_next_substep(self) -> None:
        tail = self.make_multiple_slide_tail()
        target_id = "multiple-left-far"

        def deactivate_once(substep_index, node_id, current_tail):
            if substep_index == 0 and node_id == target_id:
                return set_slide_tail_connection_node_state(
                    current_tail,
                    node_id,
                    "deactive",
                )
            return current_tail

        trace = advance_note_manager_two_phase_substeps(
            tail,
            2,
            deactivate_once,
        )
        self.assertIn(target_id, trace.substeps[0].active_order_before)
        self.assertNotIn(target_id, trace.substeps[0].active_order_after)
        self.assertNotIn(target_id, trace.substeps[1].active_order_before)
        self.assertNotIn(target_id, trace.substeps[1].update_order)

    def test_terminal_state_propagation_mutates_only_root_membership(self) -> None:
        tail = self.make_multiple_slide_tail()
        graph = tail.side_connection_graph
        root_id = graph.root_node_id
        preserved_order = tuple(
            node_id for node_id in graph.active_node_order if node_id != root_id
        )

        tail = set_slide_tail_note_state(tail, "deactive")
        graph = tail.side_connection_graph
        self.assertTrue(all(node.state == "deactive" for node in graph.nodes))
        self.assertEqual(graph.active_node_order, preserved_order)

        tail = set_slide_tail_note_state(tail, "move")
        graph = tail.side_connection_graph
        self.assertTrue(all(node.state == "move" for node in graph.nodes))
        self.assertEqual(graph.active_node_order, preserved_order + (root_id,))

    def test_visual_state_propagation_keeps_other_side_membership(self) -> None:
        tail = self.make_multiple_slide_tail()
        initiating_id = "multiple-left-near"
        tail = set_slide_tail_connection_node_state(
            tail,
            initiating_id,
            "deactive",
        )
        graph = tail.side_connection_graph
        nodes = {node.node_id: node for node in graph.nodes}
        self.assertEqual(nodes["multiple-left-far"].state, "deactive")
        self.assertEqual(nodes[initiating_id].state, "deactive")
        self.assertEqual(nodes[graph.root_node_id].state, "move")
        self.assertEqual(nodes["multiple-right"].state, "move")
        self.assertIn("multiple-left-far", graph.active_node_order)
        self.assertNotIn(initiating_id, graph.active_node_order)

    def test_propagated_deactive_side_members_run_in_next_substep(self) -> None:
        tail = self.make_multiple_slide_tail()
        root_id = tail.side_connection_graph.root_node_id

        def deactivate_root_once(substep_index, node_id, current_tail):
            if substep_index == 0 and node_id == root_id:
                return set_slide_tail_note_state(current_tail, "deactive")
            return current_tail

        trace = advance_note_manager_two_phase_substeps(
            tail,
            2,
            deactivate_root_once,
        )
        self.assertEqual(
            trace.substeps[1].active_order_before,
            ("multiple-left-far",),
        )
        self.assertEqual(
            trace.substeps[1].update_order,
            ("multiple-left-far",),
        )
        self.assertEqual(trace.substeps[1].after_update_order, ())

    def test_move_reactivation_appends_missing_active_node_once(self) -> None:
        tail = self.make_multiple_slide_tail()
        target_id = "multiple-left-near"
        tail = set_slide_tail_connection_node_state(tail, target_id, "deactive")
        order_without_target = tail.side_connection_graph.active_node_order
        self.assertNotIn(target_id, order_without_target)

        tail = set_slide_tail_connection_node_state(tail, target_id, "move")
        self.assertEqual(
            tail.side_connection_graph.active_node_order,
            order_without_target + (target_id,),
        )
        tail = set_slide_tail_connection_node_state(tail, target_id, "move")
        self.assertEqual(
            tail.side_connection_graph.active_node_order.count(target_id),
            1,
        )

    def test_after_array_retains_node_deactivated_by_later_update(self) -> None:
        tail = self.make_multiple_slide_tail()
        root_id = tail.side_connection_graph.root_node_id
        later_visual_id = "multiple-left-far"

        def later_visual_deactivates_root(_substep, node_id, current_tail):
            if node_id == later_visual_id:
                return set_slide_tail_note_state(current_tail, "deactive")
            return current_tail

        trace = advance_note_manager_two_phase_substeps(
            tail,
            1,
            later_visual_deactivates_root,
        )
        self.assertIn(root_id, trace.substeps[0].after_update_order)
        self.assertNotIn(root_id, trace.substeps[0].active_order_after)

    def test_terminal_first_activation_suppresses_every_visual(self) -> None:
        graph = self.make_multiple_slide_tail((1, 2, 0, 3)).side_connection_graph
        self.assertEqual(graph.active_node_order, (graph.root_node_id,))

    def test_visual_components_before_terminal_each_add_one_member(self) -> None:
        graph = self.make_multiple_slide_tail((0, 3, 2, 1)).side_connection_graph
        self.assertEqual(
            graph.active_node_order,
            (
                "multiple-left-far",
                "multiple-right",
                graph.root_node_id,
            ),
        )

    def test_connection_graph_compatibility_order_is_not_confirmed(self) -> None:
        graph = build_slide_tail_connection_graph(
            "tail",
            3,
            14,
            (SlideTailSideNodeSpec("left", 2, 20),),
        )
        self.assertEqual(graph.active_node_order, ("left", "tail"))
        self.assertEqual(
            graph.active_node_order_source,
            "compatibility_button_order",
        )

    def test_connection_graph_rejects_partial_source_order(self) -> None:
        with self.assertRaises(ValueError):
            build_slide_tail_connection_graph(
                "tail",
                3,
                14,
                (SlideTailSideNodeSpec("left", 2, 20),),
                root_source_order=1,
            )

    def test_connection_graph_rejects_duplicate_source_order(self) -> None:
        with self.assertRaises(ValueError):
            build_slide_tail_connection_graph(
                "tail",
                3,
                14,
                (SlideTailSideNodeSpec("left", 2, 20, 1),),
                root_source_order=1,
            )

    def test_multiple_directional_tail_propagates_note_state(self) -> None:
        tail = set_slide_tail_note_state(self.make_multiple_slide_tail(), "stop")
        self.assertEqual(tail.state, "stop")
        self.assertEqual(tail.side_notes_state, "stop")
        self.assertTrue(
            all(node.state == "stop" for node in tail.side_connection_graph.nodes)
        )

    def test_multiple_directional_tail_sprite_disabled_hides_side_chain(self) -> None:
        tail = disable_slide_tail_side_sprites(self.make_multiple_slide_tail())
        self.assertFalse(tail.side_notes_sprite_enabled)
        self.assertFalse(tail.back_line_active)
        self.assertEqual(tail.multiple_left_count, 2)
        self.assertEqual(tail.multiple_right_count, 1)
        self.assertTrue(
            all(
                not node.sprite_enabled
                for node in tail.side_connection_graph.nodes
                if node.role == "visual"
            )
        )
        self.assertTrue(
            all(not line.active for line in tail.side_connection_graph.back_lines)
        )

    def test_multiple_directional_tail_change_used_clears_side_references(self) -> None:
        tail = change_slide_tail_side_notes_used(self.make_multiple_slide_tail())
        self.assertEqual(tail.multiple_left_count, 0)
        self.assertEqual(tail.multiple_right_count, 0)
        self.assertEqual(tail.side_notes_state, "used")
        self.assertFalse(tail.side_notes_sprite_enabled)
        self.assertFalse(tail.side_connection_graph.root_side_references_active)
        root = next(
            node
            for node in tail.side_connection_graph.nodes
            if node.role == "tail"
        )
        self.assertIsNone(root.left_visual_id)
        self.assertIsNone(root.right_visual_id)
        visual_nodes = tuple(
            node
            for node in tail.side_connection_graph.nodes
            if node.role == "visual"
        )
        self.assertTrue(all(node.result_used for node in visual_nodes))
        self.assertTrue(all(node.state == "deactive" for node in visual_nodes))
        root_lines = tuple(
            line
            for line in tail.side_connection_graph.back_lines
            if line.owner_node_id == root.node_id
        )
        self.assertTrue(all(line.active for line in root_lines))
        self.assertTrue(all(line.renderer_enabled for line in root_lines))
        self.assertTrue(
            all(line.width == root.scale_x * 0.75 for line in root_lines)
        )

    def test_multiple_directional_tail_can_consume_only_left_side(self) -> None:
        tail = advance_slide_tail_back_lines(self.make_multiple_slide_tail())
        tail = consume_slide_tail_side_notes(tail, "left")
        self.assertEqual(tail.multiple_left_count, 0)
        self.assertEqual(tail.multiple_right_count, 1)
        self.assertEqual(tail.side_notes_state, "partially_used")
        nodes = {node.node_id: node for node in tail.side_connection_graph.nodes}
        self.assertTrue(nodes["multiple-left-far"].result_used)
        self.assertTrue(nodes["multiple-left-near"].result_used)
        self.assertEqual(nodes["multiple-left-near"].state, "deactive")
        self.assertFalse(nodes["multiple-right"].result_used)
        self.assertEqual(nodes["multiple-right"].state, "move")
        root = nodes[tail.side_connection_graph.root_node_id]
        self.assertIsNone(root.left_visual_id)
        self.assertEqual(root.right_visual_id, "multiple-right")
        lines = {
            (line.owner_node_id, line.target_node_id): line
            for line in tail.side_connection_graph.back_lines
        }
        self.assertFalse(lines[("multiple-left-far", "multiple-left-near")].active)
        self.assertFalse(lines[("multiple-left-near", "multiple-left-far")].active)
        self.assertTrue(lines[(root.node_id, "multiple-left-near")].active)
        self.assertTrue(
            lines[(root.node_id, "multiple-left-near")].renderer_enabled
        )
        self.assertTrue(lines[(root.node_id, "multiple-right")].renderer_enabled)
        tail = advance_slide_tail_back_lines(tail)
        lines = {
            (line.owner_node_id, line.target_node_id): line
            for line in tail.side_connection_graph.back_lines
        }
        self.assertFalse(lines[(root.node_id, "multiple-left-near")].active)
        self.assertFalse(
            lines[(root.node_id, "multiple-left-near")].renderer_enabled
        )

    def test_multiple_directional_tail_can_consume_only_right_side(self) -> None:
        tail = consume_slide_tail_side_notes(self.make_multiple_slide_tail(), "right")
        self.assertEqual(tail.multiple_left_count, 2)
        self.assertEqual(tail.multiple_right_count, 0)
        nodes = {node.node_id: node for node in tail.side_connection_graph.nodes}
        self.assertTrue(nodes["multiple-right"].result_used)
        self.assertFalse(nodes["multiple-left-near"].result_used)
        root = nodes[tail.side_connection_graph.root_node_id]
        self.assertEqual(root.left_visual_id, "multiple-left-near")
        self.assertIsNone(root.right_visual_id)

    def test_consume_slide_tail_connection_side_rejects_invalid_side(self) -> None:
        graph = self.make_multiple_slide_tail().side_connection_graph
        with self.assertRaises(ValueError):
            consume_slide_tail_connection_side(graph, "center")

    def test_slide_tail_after_through_replaces_generic_nine_frame_timeout(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("tail-through", 120, 1, "slide", 240)],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(1, 1)
        self.advance(runtime, 1.15)
        tail_events = [event for event in runtime.events if event.phase == "tail"]
        self.assertEqual(tail_events, [])
        self.advance(runtime, 0.1)
        tail_events = [event for event in runtime.events if event.phase == "tail"]
        self.assertEqual(len(tail_events), 1)
        self.assertEqual(tail_events[0].slide_miss_code, 4)
        self.assertEqual(tail_events[0].slide_miss_type, "after_through")
        self.assertEqual(runtime.hud.life, 900)

    def test_type_eight_slide_tail_accumulates_execute_frame_to_seven(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("tail-flick", 120, 1, "slide", 240, game_note_type=8)],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(1, 1)
        self.advance(runtime, 1.0)
        for _ in range(6):
            runtime.update(FRAME_SECONDS)
        self.assertEqual(
            [event for event in runtime.events if event.phase == "tail"], []
        )
        runtime.update(FRAME_SECONDS)
        tail_events = [event for event in runtime.events if event.phase == "tail"]
        self.assertEqual(len(tail_events), 1)
        self.assertEqual(tail_events[0].slide_miss_code, 6)
        self.assertEqual(tail_events[0].slide_miss_type, "after_through_flick")
        self.assertEqual(runtime.hud.life, 900)

    def test_runtime_does_not_submit_slide_miss_at_eight_frame_boundary(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("late-slide", 120, 2, "slide", 360, 1, (240,))],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(1, 2)
        self.advance(runtime, 1.15)
        intermediate = [event for event in runtime.events if event.phase == "intermediate"]
        self.assertEqual(intermediate, [])
        self.advance(runtime, 0.1)
        intermediate = [event for event in runtime.events if event.phase == "intermediate"]
        self.assertEqual(len(intermediate), 1)
        self.assertEqual(intermediate[0].slide_miss_code, 4)

    def test_lane_grace_expires_while_touch_is_outside(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("long", 120, 3, "long", 1_200)],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(9, 3)
        for _ in range(9):
            runtime.touch_moved(9, 0.0, inside_lane=False, delta_time=1.0)

        self.assertEqual(runtime.touch_ended(9), "miss")
        self.assertNotIn("long", runtime.audio.active_holds)

    def test_flick_tail_synthesizes_touch_end(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("long-flick", 120, 3, "long", 240, 1, (), "flick")],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(2, 3, x=0.0)
        self.advance(runtime, 1.0)

        self.assertFalse(runtime.touch_moved(2, 0.04))
        self.assertTrue(runtime.touch_moved(2, 0.041))
        self.assertEqual(runtime.events[-2].kind, "synthetic_touch_end")
        self.assertEqual(runtime.events[-1].phase, "tail")
        self.assertEqual(runtime.events[-1].result, "perfect")

    def test_directional_tail_rejects_wrong_direction_and_physical_release(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "slide-left",
                    120,
                    3,
                    "slide",
                    240,
                    1,
                    (),
                    "directional_left",
                )
            ],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(2, 3, x=0.0)
        self.advance(runtime, 1.0)

        self.assertFalse(runtime.touch_moved(2, 0.02))
        self.assertEqual(runtime.touch_ended(2), "miss")
        self.assertEqual(runtime.events[-1].result, "miss")

    def test_multiple_direction_threshold_scales_with_note_count(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "long-multi",
                    120,
                    3,
                    "long",
                    240,
                    1,
                    (),
                    "multiple_right",
                    3,
                )
            ],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(2, 3, x=0.0)
        self.advance(runtime, 1.0)

        self.assertFalse(runtime.touch_moved(2, 0.03))
        self.assertTrue(runtime.touch_moved(2, 0.031))
        self.assertEqual(runtime.events[-1].result, "perfect")

    def test_simultaneous_notes_reflect_as_one_frame_total(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("left", 120, 1), NoteSpec("right", 120, 5)],
        )
        self.advance(runtime, 1.0)
        with runtime.input_frame():
            runtime.touch_began(1, 1)
            runtime.touch_began(2, 5)
            self.assertEqual(runtime.hud.score, 0)

        self.assertEqual(runtime.hud.score, 2200)
        self.assertEqual(runtime.hud.combo, 2)
        self.assertEqual(runtime.last_frame_total.entry_count, 2)
        self.assertEqual(runtime.last_frame_total.add_score, 2200)

    def test_frame_total_selects_best_raw_result(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("great", 110, 1), NoteSpec("perfect", 120, 5)],
        )
        self.advance(runtime, 1.0)
        with runtime.input_frame():
            runtime.touch_began(1, 1)
            runtime.touch_began(2, 5)

        self.assertEqual(runtime.last_frame_total.entry_count, 2)
        self.assertEqual(runtime.last_frame_total.representative_result, "perfect")
        self.assertEqual(runtime.hud.judgement, "perfect")

    def test_standard_result_correction_rates_match_native_table(self) -> None:
        self.assertEqual(
            STANDARD_RESULT_CORRECTION_RATES,
            {
                "miss": 0.0,
                "bad": 0.0,
                "good": 0.5,
                "great": 0.8,
                "perfect": 1.1,
            },
        )

    def test_standard_combo_rates_match_native_thresholds(self) -> None:
        config = ScoreConfig()
        self.assertEqual(STANDARD_COMBO_RATE_STEPS[0], (0, 1.0))
        for combo, expected in (
            (20, 1.0),
            (21, 1.01),
            (50, 1.01),
            (51, 1.02),
            (600, 1.09),
            (601, 1.1),
            (700, 1.1),
            (701, 1.11),
        ):
            self.assertAlmostEqual(config.combo_rate(combo), expected)

    def test_special_mode_combo_rate_dispatch_matches_native_order(self) -> None:
        config = ScoreConfig(
            auto_live_combo_coefficient=0.7,
            medley_combo_rates=((0, 49, 1.2), (50, 99, 1.4)),
            garupa_cup_first_combo_rates=((0, 9, 0.9), (10, 99, 1.3)),
        )
        self.assertEqual(config.combo_rate_for_frame(50, (-1,), 11, True), 1.0)
        self.assertEqual(config.combo_rate_for_frame(50, (1,), 11, True), 0.7)
        self.assertEqual(config.combo_rate_for_frame(50, (1,), 5, False), 1.0)
        self.assertEqual(config.combo_rate_for_frame(49, (1,), 11, False), 1.2)
        self.assertEqual(config.combo_rate_for_frame(50, (1,), 11, False), 1.4)
        self.assertEqual(config.combo_rate_for_frame(100, (1,), 11, False), 1.0)
        self.assertEqual(config.combo_rate_for_frame(9, (1,), 6, False), 0.9)
        self.assertEqual(config.combo_rate_for_frame(10, (1,), 6, False), 1.3)
        self.assertEqual(config.combo_rate_for_frame(100, (1,), 6, False), 1.0)
        self.assertEqual(config.combo_rate_for_frame(51, (1,), 7, False), 1.02)
        with self.assertRaisesRegex(ValueError, "button types"):
            config.combo_rate_for_frame(1, (), 1, False)

    def test_medley_combo_rate_is_applied_during_reflection(self) -> None:
        note = NoteSpec("medley-score", 120, 1, base_score=1_000)
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            in_game_mode=11,
            score_config=ScoreConfig(medley_combo_rates=((1, 10, 1.5),)),
        )
        runtime._resolve(note, "perfect", None, "head")
        self.assertEqual(runtime.hud.combo, 1)
        self.assertEqual(runtime.hud.score, 1_650)

    def test_team_live_stage_effect_excludes_free_live_bonus_score(self) -> None:
        note = NoteSpec(
            "festival-score",
            120,
            1,
            base_score=1_000,
            free_live_event_bonus_base_score=500,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            in_game_mode=5,
            score_config=ScoreConfig(
                team_live_stage_type=2,
                team_live_judge_rates=(("perfect", 2.0, 1),),
                team_live_stage_combo_rates=((1, 10, 3.0, 2),),
                team_live_life_rates=((1, 1_000, 4.0, 3),),
            ),
        )
        runtime._resolve(note, "perfect", None, "head")
        self.assertEqual(runtime.hud.score, 24_000)
        self.assertEqual(runtime.hud.free_live_event_bonus_score, 500)
        self.assertEqual(runtime.last_frame_total.add_score, 24_000)
        self.assertEqual(
            runtime.last_frame_total.free_live_event_bonus_add_score,
            500,
        )
        self.assertEqual(runtime.last_frame_total.stage_effect_level, 2)
        self.assertEqual(runtime.hud.one_note_max_score.score, 24_000)
        self.assertEqual(runtime.hud.one_note_max_score.combo, 1)
        self.assertEqual(runtime.hud.one_note_max_score.skill_factor, 1.0)
        self.assertEqual(runtime.hud.one_note_max_score.notes_type, "perfect")
        self.assertFalse(runtime.hud.one_note_max_score.is_fever)
        self.assertEqual(
            runtime.hud.free_live_event_bonus_one_note_max_score.score,
            500,
        )

    def test_one_note_max_score_keeps_first_equal_score(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
        )
        target = runtime.hud.one_note_max_score
        target.score = 100
        target.combo = 7
        entry = OneFrameData(
            True,
            1,
            (1,),
            100,
            0,
            1,
            "tap",
            "perfect",
            "perfect",
            skill_score_up_rate=2.0,
        )
        runtime.hud.combo = 8
        runtime._update_one_note_max_score(target, 100, entry)
        self.assertEqual(target.score, 100)
        self.assertEqual(target.combo, 7)
        self.assertEqual(target.skill_factor, 0.0)

    def test_team_live_zero_rate_clears_stage_effect_level(self) -> None:
        config = ScoreConfig(
            team_live_stage_type=1,
            team_live_judge_rates=(("perfect", 0.0, 4),),
        )
        self.assertEqual(
            config.team_live_stage_effect("perfect", 1, 1_000, 100),
            (0.0, 0),
        )
        self.assertEqual(
            config.team_live_stage_effect("perfect", 1, 1_000, 0),
            (0.0, 0),
        )

    def test_calculate_base_score_matches_score_utility_formula(self) -> None:
        self.assertEqual(calculate_base_score(10_000, 1.2, 300), 120.0)
        with self.assertRaisesRegex(ValueError, "max note count"):
            calculate_base_score(10_000, 1.2, 0)

    def test_chart_max_note_count_matches_native_root_and_after_rules(self) -> None:
        notes = (
            NoteSpec("normal", 100, 1),
            NoteSpec("directional", 200, 2, "directional_flick_left"),
            NoteSpec("long", 300, 3, "long", 400),
            NoteSpec(
                "slide",
                500,
                1,
                "slide",
                800,
                intermediate_positions=(600, 700),
                intermediate_invisible=(False, True),
            ),
        )
        self.assertEqual(max_note_count_from_notes(notes), 7)
        self.assertEqual(
            max_note_count_from_notes(
                (NoteSpec("default-visible", 1, 1, "slide", 4, 1, (2, 3)),)
            ),
            4,
        )
        self.assertEqual(
            max_note_count_from_notes((replace(notes[-1], end_invisible=True),)),
            2,
        )

    def test_initialize_base_scores_uses_deck_chart_and_bonus_inputs(self) -> None:
        notes = (
            NoteSpec("normal", 100, 1),
            NoteSpec("long", 200, 2, "long", 300),
        )
        profile = initialize_base_scores(
            (
                DeckScoreParameters(1_000, 2_000, 3_000),
                DeckScoreParameters(500, 1_000, 2_500),
            ),
            25,
            notes,
            5_000,
        )
        self.assertIsInstance(profile, BaseScoreProfile)
        self.assertEqual(profile.total_parameter, 10_000)
        self.assertEqual(profile.max_note_count, 3)
        self.assertEqual(profile.base_score, 12_000)
        self.assertEqual(profile.free_live_event_bonus_base_score, 6_000)
        self.assertTrue(unity_mathf_approximately(1.0e-45, 0.0))
        self.assertEqual(
            initialize_base_scores((), 5, (NoteSpec("one", 1, 1),)).free_live_event_bonus_base_score,
            0.0,
        )

    def test_free_live_event_bonus_deck_reproduces_native_component_order(self) -> None:
        profile = construct_free_live_event_bonus_deck(
            2,
            (
                FreeLiveEventBonusMemberInput(
                    original=DeckScoreParameters(1_000, 2_000, 3_000),
                    area_item_fixed=DeckScoreParameters(100, 0, 50),
                    area_item_rate=DeckScoreParameters(0.1, 0.2, 0.0),
                    event_parameter_buff_percent=20,
                    event_parameter_flat=250,
                    event_effect_parameter="technique",
                ),
            ),
        )
        self.assertIsInstance(profile, FreeLiveEventBonusDeckProfile)
        self.assertTrue(profile.applied)
        self.assertEqual(profile.original_total.total, 6_000)
        self.assertAlmostEqual(profile.area_item_total.total, 660)
        self.assertAlmostEqual(profile.event_buff_total.total, 1_450)
        self.assertAlmostEqual(profile.total_parameter, 8_110)
        self.assertAlmostEqual(profile.members[0].final.performance, 1_410)
        self.assertAlmostEqual(profile.members[0].final.technique, 3_050)
        self.assertAlmostEqual(profile.members[0].final.visual, 3_650)

    def test_event_parameter_buff_source_matches_native_conditional_sum(self) -> None:
        full = EventParameterBuffSource(
            character_match_percent=10,
            attribute_match_percent=20,
            attribute_and_character_percent=30,
            situation_match_percent=5,
            limit_break_percent=7,
        )
        self.assertEqual(full.total_percent, 72)
        self.assertEqual(
            EventParameterBuffSource(
                character_match_percent=10,
                attribute_and_character_percent=30,
            ).total_percent,
            10,
        )
        profile = construct_free_live_event_bonus_deck(
            2,
            (
                FreeLiveEventBonusMemberInput(
                    original=DeckScoreParameters(1_000, 2_000, 3_000),
                    event_parameter_buff_source=full,
                ),
            ),
        )
        self.assertAlmostEqual(profile.event_buff_total.total, 4_320)
        self.assertAlmostEqual(profile.total_parameter, 10_320)

    def test_event_parameter_flat_source_matches_native_weighted_target(self) -> None:
        source = EventParameterFlatBuffSource(
            event_id_matches=True,
            character_matches=True,
            attribute_matches=True,
            performance_percent=10,
            technique_percent=20,
            visual_percent=30,
        )
        self.assertEqual(source.target_parameter, "performance")
        profile = construct_free_live_event_bonus_deck(
            5,
            (
                FreeLiveEventBonusMemberInput(
                    original=DeckScoreParameters(1_000, 2_000, 3_000),
                    event_parameter_flat_source=source,
                ),
            ),
        )
        self.assertAlmostEqual(profile.event_buff_total.total, 1_400)
        self.assertAlmostEqual(profile.members[0].final.performance, 2_400)
        self.assertAlmostEqual(profile.total_parameter, 7_400)
        self.assertEqual(
            replace(source, event_id_matches=False).value_for(
                DeckScoreParameters(1_000, 2_000, 3_000)
            ),
            0.0,
        )

    def test_free_live_event_bonus_setup_accepts_only_versus_and_festival(self) -> None:
        member = FreeLiveEventBonusMemberInput(
            original=DeckScoreParameters(1_000, 2_000, 3_000)
        )
        for event_type in (2, 5):
            self.assertEqual(
                construct_free_live_event_bonus_deck(event_type, (member,)).total_parameter,
                6_000,
            )
        for event_type in (0, 1, 3, 4, 6):
            profile = construct_free_live_event_bonus_deck(event_type, (member,))
            self.assertFalse(profile.applied)
            self.assertEqual(profile.total_parameter, 0.0)
            self.assertEqual(profile.members, ())

    def test_free_live_event_bonus_start_data_clears_after_rhythm_game(self) -> None:
        state = FreeLiveEventBonusStartDataState()
        profile = construct_free_live_event_bonus_deck(
            5,
            (
                FreeLiveEventBonusMemberInput(
                    original=DeckScoreParameters(1_000, 2_000, 3_000)
                ),
            ),
        )
        state.apply_deck_profile(profile)
        self.assertEqual(state.total_parameter, 6_000)
        state.clear_after_rhythm_game()
        self.assertEqual(state.total_parameter, 0.0)

    def test_noneligible_bonus_setup_does_not_overwrite_start_data(self) -> None:
        state = FreeLiveEventBonusStartDataState(6_000)
        state.apply_deck_profile(
            construct_free_live_event_bonus_deck(
                1,
                (
                    FreeLiveEventBonusMemberInput(
                        original=DeckScoreParameters(1_000, 2_000, 3_000)
                    ),
                ),
            )
        )
        self.assertEqual(state.total_parameter, 6_000)

    def test_base_score_initialization_consumes_structured_bonus_deck(self) -> None:
        bonus_profile = construct_free_live_event_bonus_deck(
            5,
            (
                FreeLiveEventBonusMemberInput(
                    original=DeckScoreParameters(1_000, 2_000, 3_000),
                    event_parameter_buff_percent=10,
                ),
            ),
        )
        profile = initialize_base_scores(
            (DeckScoreParameters(1_000, 1_000, 1_000),),
            5,
            (NoteSpec("one", 1, 1),),
            free_live_event_bonus_deck_profile=bonus_profile,
        )
        self.assertAlmostEqual(profile.free_live_event_bonus_total_parameter, 6_600)
        self.assertAlmostEqual(profile.free_live_event_bonus_base_score, 19_800)
        with self.assertRaises(ValueError):
            initialize_base_scores(
                (),
                5,
                (NoteSpec("one", 1, 1),),
                1.0,
                bonus_profile,
            )

    def test_runtime_can_construct_per_note_base_scores_from_chart_profile(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("normal", 100, 1), NoteSpec("long", 200, 2, "long", 300)],
            deck_score_parameters=(DeckScoreParameters(1_000, 1_000, 1_000),),
            music_score_level=5,
            free_live_event_bonus_total_parameter=1_500,
        )
        self.assertEqual(runtime.base_score_profile.max_note_count, 3)
        self.assertTrue(all(note.base_score == 3_000 for note in runtime.notes))
        self.assertTrue(
            all(
                note.free_live_event_bonus_base_score == 1_500
                for note in runtime.notes
            )
        )

    def test_get_base_score_matches_game_over_mode_matrix(self) -> None:
        common = {
            "base_score": 1_000.0,
            "is_multi_play_game_over": False,
            "is_single_play_game_over": False,
            "in_game_mode": 1,
            "is_enable_practice": False,
            "is_collabo_original_music": False,
        }
        self.assertEqual(score_utility_get_base_score(**common), 1_000)
        self.assertEqual(
            score_utility_get_base_score(
                **{**common, "is_multi_play_game_over": True}
            ),
            100,
        )
        self.assertEqual(
            score_utility_get_base_score(
                **{
                    **common,
                    "is_multi_play_game_over": True,
                    "in_game_mode": 5,
                }
            ),
            1_000,
        )
        for flag in ("is_enable_practice", "is_collabo_original_music"):
            self.assertEqual(
                score_utility_get_base_score(
                    **{
                        **common,
                        "is_single_play_game_over": True,
                        flag: True,
                    }
                ),
                100,
            )

    def test_base_correction_skips_result_rate_for_auto_and_festival(self) -> None:
        rates = {"perfect": 1.1}
        self.assertEqual(
            calculate_base_corrected_score(
                1_000,
                "perfect",
                in_game_mode=1,
                is_auto_live=False,
                result_rates=rates,
            ),
            1_100,
        )
        for mode, auto in ((5, False), (1, True)):
            self.assertEqual(
                calculate_base_corrected_score(
                    1_000,
                    "perfect",
                    in_game_mode=mode,
                    is_auto_live=auto,
                    result_rates=rates,
                ),
                1_000,
            )

    def test_real_value_score_skill_adds_after_result_correction(self) -> None:
        effect = SkillActivateEffectSpec(
            "score",
            value_type="real_value",
            condition="great",
            value=123.9,
        )
        self.assertEqual(
            calculate_base_corrected_score(
                1_000,
                "perfect",
                in_game_mode=1,
                is_auto_live=False,
                result_rates={"perfect": 1.1},
                active_effects=(effect,),
            ),
            1_223,
        )
        self.assertEqual(
            calculate_base_corrected_score(
                1_000,
                "good",
                in_game_mode=1,
                is_auto_live=False,
                result_rates={"good": 0.5},
                active_effects=(effect,),
            ),
            500,
        )

        runtime, target = self.make_active_skill_runtime((effect,))
        score_before = runtime.hud.score
        runtime._resolve(target, "perfect", None, "head")
        self.assertEqual(runtime._frame_data[-1].add_score, 1_223)
        self.assertEqual(runtime.hud.score - score_before, 1_223)

    def test_music_play_level_score_rate_matches_native_linear_rule(self) -> None:
        self.assertEqual(score_rate_by_music_play_level(5), 1.0)
        self.assertEqual(score_rate_by_music_play_level(25), 1.2)

    def test_score_pipeline_combines_result_combo_and_skill_rates(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("scored", 120, 1, base_score=2_000)],
            score_config=ScoreConfig(
                combo_rate_steps=((0, 1.0), (1, 1.1)),
            ),
        )
        runtime.fever_score_up_rate = 1.5
        runtime.skill_score_up_rate = 2.0
        runtime.crescendo_score_up_rate = 1.1
        self.advance(runtime, 1.0 - 5 * FRAME_SECONDS)
        runtime.touch_began(1, 1)

        # Great: 2000 * 0.8 = 1600; Combo 1 rate 1.1 is truncated,
        # then Fever * Skill and Crescendo are applied.
        self.assertEqual(runtime.hud.score, 5808)
        self.assertEqual(runtime.last_frame_total.add_score, 5808)

    def test_skill_note_enabled_matches_native_mode_matrix(self) -> None:
        for mode in (1, 3, 4, 5, 10, 11, 12):
            self.assertTrue(skill_note_enabled(mode, 1))
        for mode in (0, 6, 7, 8, 9):
            self.assertFalse(skill_note_enabled(mode, 1))
        self.assertTrue(skill_note_enabled(2, 2, (4, 7), 7))
        self.assertFalse(skill_note_enabled(2, 2, (4, 7), 4))
        self.assertFalse(skill_note_enabled(2, 3, (4, 7), 7))

    def test_skill_note_sprite_requires_local_mode_eligibility(self) -> None:
        note = NoteSpec(
            "skill",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        enabled = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            in_game_mode=2,
            skill_chara_list=(3,),
            my_display_index=3,
        )
        disabled = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            in_game_mode=2,
            skill_chara_list=(3,),
            my_display_index=2,
        )
        self.advance(enabled, 0.5)
        self.advance(disabled, 0.5)
        self.assertEqual(enabled.render.notes["skill"].sprite_key, "note_skill")
        self.assertEqual(disabled.render.notes["skill"].sprite_key, "note_normal")

    def test_skill_great_and_perfect_enqueue_before_judgement(self) -> None:
        for result in ("great", "perfect"):
            note = NoteSpec(
                result,
                120,
                2,
                game_note_additional_type=2,
                skill_note_index=1,
            )
            runtime = RuntimeIntegration(
                TempoMap([TempoChange(0, 120)]),
                [note],
                skill_chara_list=(4,),
            )
            runtime._resolve(note, result, None, "head")
            self.assertEqual(len(runtime.skill_runtime.play_list), 1)
            request = runtime.skill_runtime.play_list[0]
            self.assertEqual(request.skill_note_index, 1)
            self.assertEqual(request.absolute_position, 120)
            self.assertEqual(request.situation_skill_index, 4)
            self.assertEqual(request.character_index, 4)
            self.assertEqual(request.character_info_index, 4)
            self.assertEqual(runtime.skill_runtime.skill_play_state, 1)
            self.assertEqual(
                [event.kind for event in runtime.events],
                ["skill_note_enqueued", "judge"],
            )

    def test_skill_good_bad_and_miss_use_failure_route(self) -> None:
        for result in ("good", "bad", "miss"):
            note = NoteSpec(
                result,
                120,
                2,
                game_note_additional_type=2,
                skill_note_index=1,
            )
            runtime = RuntimeIntegration(
                TempoMap([TempoChange(0, 120)]),
                [note],
                skill_chara_list=(4,),
            )
            runtime._resolve(note, result, None, "head")
            self.assertEqual(runtime.skill_runtime.play_list, [])
            self.assertEqual(runtime.events[0].kind, "skill_note_failed")
            self.assertEqual(runtime.events[0].result, result)

    def test_skill_success_during_move_time_is_not_enqueued_or_failed(self) -> None:
        note = NoteSpec(
            "move-time-skill",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            game_state=14,
        )
        runtime._resolve(note, "perfect", None, "head")
        self.assertEqual(runtime.skill_runtime.play_list, [])
        self.assertEqual([event.kind for event in runtime.events], ["judge"])

    def test_multi_normal_skill_reserves_played_note_and_fixed_character_info(self) -> None:
        note = NoteSpec(
            "multi-skill",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=2,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            in_game_mode=2,
            skill_chara_list=(1, 3),
            my_display_index=3,
        )
        runtime._resolve(note, "perfect", None, "head")
        request = runtime.skill_runtime.play_list[0]
        self.assertEqual(request.situation_skill_index, 0)
        self.assertEqual(request.character_index, 3)
        self.assertEqual(request.character_info_index, 2)
        self.assertEqual(runtime.skill_runtime.network_played_skill_note, 2)

    def test_skill_failure_reserves_network_flag_only_for_modes_two_and_five(self) -> None:
        for mode, expected in ((1, False), (2, True), (5, True)):
            note = NoteSpec(
                f"failed-{mode}",
                120,
                2,
                game_note_additional_type=2,
                skill_note_index=1,
            )
            runtime = RuntimeIntegration(
                TempoMap([TempoChange(0, 120)]),
                [note],
                in_game_mode=mode,
                skill_chara_list=(0,),
                my_display_index=0,
            )
            runtime._resolve(note, "good", None, "head")
            self.assertEqual(runtime.skill_runtime.network_skill_failed, expected)

    def test_skill_playlist_begin_sets_runtime_state_and_reservation(self) -> None:
        note = NoteSpec(
            "skill-playback",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            skill_playback_specs=(SkillPlaybackSpec(4, 101, 1.5),),
            skill_se_cue_ids=("skill-primary", "skill-secondary"),
        )
        runtime._resolve(note, "perfect", None, "head")
        self.assertEqual(runtime.skill_runtime.skill_play_state, SKILL_PLAY_STATE_BEGIN)
        runtime.update(0.1)
        state = runtime.skill_runtime
        self.assertEqual(state.skill_play_state, SKILL_PLAY_STATE_PLAYING)
        self.assertEqual(state.current_playing_skill.skill_note_index, 1)
        self.assertEqual(state.skill_note_states, {0: 1})
        self.assertEqual(state.cached_life_when_skill_played, 1000)
        self.assertEqual(state.judge_continuous_result_type, "perfect")
        self.assertEqual(state.skill_timer, 1.5)
        self.assertEqual(state.skill_effective_timer, 0.0)
        self.assertEqual(state.reservation_target_frame, 2)
        self.assertEqual(state.reservation_skill_note_index, 1)
        self.assertFalse(state.reservation_is_encore)
        self.assertEqual(runtime.audio.cues[-2:], ["skill-primary", "skill-secondary"])
        self.assertEqual(
            [event.kind for event in runtime.events[-4:]],
            [
                "skill_se_played",
                "skill_se_played",
                "skill_started",
                "skill_visuals_started",
            ],
        )

    def test_skill_se_uses_concrete_cues_and_skips_audience_in_practice(self) -> None:
        note = NoteSpec(
            "skill-practice-se",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        normal = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            skill_playback_specs=(SkillPlaybackSpec(4, 111, 1.0),),
        )
        normal._resolve(note, "perfect", None, "head")
        normal.update(0.0)
        self.assertEqual(normal.audio.cues[-2:], list(SKILL_SE_CUE_IDS))
        self.assertEqual(
            [event.cue for event in normal.events if event.kind == "skill_se_played"],
            list(SKILL_SE_CUE_IDS),
        )

        practice = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            skill_playback_specs=(SkillPlaybackSpec(4, 111, 1.0),),
            is_enable_practice=True,
        )
        practice._resolve(note, "perfect", None, "head")
        practice.update(0.0)
        self.assertEqual(
            [cue for cue in practice.audio.cues if cue.startswith("SE_RHYTHM_CUTIN")],
            [SKILL_SE_CUE_IDS[0]],
        )

    def test_skill_se_profiles_match_original_acb_and_exported_mp3(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name("skill_se_acb_profile.json").read_text(
                encoding="utf-8"
            )
        )
        manifest = json.loads(
            Path(__file__).with_name("resource_manifest.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(manifest["version"], 70)
        self.assertEqual(manifest["skill_se_acb_source"], "skill_se_acb_profile.json")
        self.assertEqual(
            manifest["audio_cue_assets"]["skill_cues"]["acb_sha256"],
            evidence["sources"]["text_asset"]["sha256"],
        )
        for cue_name, recorded in evidence["cues"].items():
            profile = skill_cue_audio_profile(cue_name)
            self.assertEqual(profile.cue_sheet, "RhythmGameSE")
            self.assertEqual(profile.cue_index, recorded["cue_index"])
            self.assertEqual(profile.cue_id, recorded["cue_id"])
            self.assertEqual(profile.length_ms, recorded["length_ms"])
            self.assertEqual(profile.sequence_index, recorded["sequence_index"])
            self.assertEqual(profile.track_index, recorded["track_index"])
            self.assertEqual(profile.track_event_index, recorded["track_event_index"])
            self.assertEqual(profile.synth_index, recorded["synth_index"])
            self.assertEqual(profile.waveform_index, recorded["waveform_index"])
            self.assertEqual(profile.memory_awb_id, recorded["memory_awb_id"])
            self.assertEqual(profile.codec, recorded["codec"])
            self.assertEqual(profile.sample_rate, recorded["sample_rate"])
            self.assertEqual(profile.channels, recorded["channels"])
            self.assertEqual(profile.total_samples, recorded["total_samples"])
            self.assertEqual(profile.embedded_offset, recorded["offset"])
            self.assertEqual(profile.encoded_bytes, recorded["encoded_bytes"])
            self.assertEqual(profile.loop_flag, recorded["loop_flag"])
            self.assertEqual(profile.output_reference, recorded["output_reference"])
            self.assertEqual(profile.mp3_sha256, recorded["bestdori_mp3_sha256"])
            self.assertEqual(profile.event_command_hex, recorded["event_command_hex"])
            self.assertEqual(
                profile.sequence_command_hex,
                recorded["sequence_command_hex"],
            )
            self.assertAlmostEqual(
                profile.duration_seconds,
                recorded["total_samples"] / recorded["sample_rate"],
            )
        with self.assertRaisesRegex(ValueError, "unrecovered skill cue"):
            skill_cue_audio_profile("unknown")

    def test_skill_playing_timer_freezes_only_for_native_game_states(self) -> None:
        note = NoteSpec(
            "skill-freeze",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            skill_playback_specs=(SkillPlaybackSpec(4, 102, 1.0),),
        )
        runtime._resolve(note, "perfect", None, "head")
        runtime.update(0.1)
        for game_state in (7, 8):
            runtime.game_state = game_state
            runtime.update(0.2)
        self.assertEqual(runtime.skill_runtime.skill_timer, 1.0)
        self.assertEqual(runtime.skill_runtime.skill_effective_timer, 0.0)
        runtime.game_state = 4
        runtime.update(0.2)
        self.assertAlmostEqual(runtime.skill_runtime.skill_timer, 0.8)
        self.assertAlmostEqual(runtime.skill_runtime.skill_effective_timer, 0.2)

    def test_skill_finishing_delay_preserves_playlist_order(self) -> None:
        first = NoteSpec(
            "skill-first",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        second = NoteSpec(
            "skill-second",
            240,
            3,
            game_note_additional_type=2,
            skill_note_index=2,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [first, second],
            skill_chara_list=(4, 5),
            skill_playback_specs=(
                SkillPlaybackSpec(4, 103, 0.0),
                SkillPlaybackSpec(5, 104, 1.0),
            ),
        )
        runtime._resolve(first, "perfect", None, "head")
        runtime._resolve(second, "perfect", None, "head")
        runtime.update(0.1)
        runtime.update(0.1)
        state = runtime.skill_runtime
        self.assertEqual(state.skill_play_state, SKILL_PLAY_STATE_FINISHING)
        self.assertEqual(state.skill_finishing_timer, SKILL_FINISHING_SECONDS)
        self.assertEqual(state.registered_skill_note_indices, [1])
        self.assertEqual([item.skill_note_index for item in state.play_list], [2])
        runtime.update(SKILL_FINISHING_SECONDS)
        self.assertEqual(state.skill_play_state, SKILL_PLAY_STATE_FINISHING)
        runtime.update(0.01)
        self.assertEqual(state.skill_play_state, SKILL_PLAY_STATE_BEGIN)
        runtime.update(0.01)
        self.assertEqual(state.skill_play_state, SKILL_PLAY_STATE_PLAYING)
        self.assertEqual(state.current_playing_skill.skill_note_index, 2)

    def test_skill_once_effect_restores_real_and_rate_life(self) -> None:
        for value_type, value, expected in (
            ("real_value", 120, 520),
            ("rate", 25, 650),
        ):
            note = NoteSpec(
                f"skill-heal-{value_type}",
                120,
                2,
                game_note_additional_type=2,
                skill_note_index=1,
            )
            runtime = RuntimeIntegration(
                TempoMap([TempoChange(0, 120)]),
                [note],
                skill_chara_list=(4,),
                skill_playback_specs=(
                    SkillPlaybackSpec(
                        4,
                        105,
                        1.0,
                        once_effect_type="life",
                        once_effect_value_type=value_type,
                        once_effect_value=value,
                        once_effect_condition_life_type="under_life",
                        once_effect_condition_life=500,
                    ),
                ),
            )
            runtime.hud.life = 400
            runtime._resolve(note, "perfect", None, "head")
            runtime.update(0.1)
            self.assertEqual(runtime.hud.life, expected)
            event = next(
                event for event in runtime.events if event.kind == "skill_life_restored"
            )
            self.assertEqual((event.life_before, event.life_after), (400, expected))

    def test_skill_once_effect_obeys_under_life_condition(self) -> None:
        note = NoteSpec(
            "skill-heal-blocked",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            skill_playback_specs=(
                SkillPlaybackSpec(
                    4,
                    106,
                    1.0,
                    once_effect_type="life",
                    once_effect_value_type="real_value",
                    once_effect_value=200,
                    once_effect_condition_life_type="under_life",
                    once_effect_condition_life=500,
                ),
            ),
        )
        runtime.hud.life = 500
        runtime._resolve(note, "perfect", None, "head")
        runtime.update(0.1)
        self.assertEqual(runtime.hud.life, 500)
        self.assertNotIn(
            "skill_life_restored", [event.kind for event in runtime.events]
        )

    def test_stop_skill_playback_drains_queue_and_resets_note_info(self) -> None:
        notes = [
            NoteSpec(
                f"skill-stop-{index}",
                120 * index,
                index,
                game_note_additional_type=2,
                skill_note_index=index,
            )
            for index in (1, 2)
        ]
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            notes,
            skill_chara_list=(4, 5),
            skill_playback_specs=(
                SkillPlaybackSpec(4, 107, 1.0),
                SkillPlaybackSpec(5, 108, 1.0),
            ),
        )
        for note in notes:
            runtime._resolve(note, "perfect", None, "head")
        runtime.update(0.1)
        runtime.stop_skill_playback()
        state = runtime.skill_runtime
        self.assertEqual(state.skill_play_state, SKILL_PLAY_STATE_NONE)
        self.assertEqual(state.play_list, [])
        self.assertIsNone(state.current_playing_skill)
        self.assertEqual(state.registered_skill_note_indices, [])
        self.assertEqual(state.notes_info_reset_count, 1)
        self.assertEqual(
            [event.kind for event in runtime.events[-5:]],
            [
                "skill_visuals_started",
                "skill_visuals_finished",
                "skill_finished",
                "skill_finished",
                "skill_playback_stopped",
            ],
        )

    def test_skill_playback_requires_master_data_profile(self) -> None:
        note = NoteSpec(
            "skill-missing-profile",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
        )
        runtime._resolve(note, "perfect", None, "head")
        with self.assertRaisesRegex(ValueError, "master-data duration"):
            runtime.update(0.1)

    def test_skill_visuals_low_life_plays_heal_and_suppresses_score(self) -> None:
        note = NoteSpec(
            "skill-visual-low-life",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            skill_playback_specs=(
                SkillPlaybackSpec(
                    4,
                    109,
                    1.0,
                    once_effect_type="life",
                    once_effect_value_type="real_value",
                    once_effect_value=100,
                    once_effect_condition_life_type="under_life",
                    once_effect_condition_life=500,
                    activate_effects=(SkillActivateEffectSpec("score", value=20),),
                ),
            ),
        )
        runtime.hud.life = 400
        runtime._resolve(note, "perfect", None, "head")
        runtime.update(0.0)
        visuals = runtime.skill_visuals
        self.assertTrue(visuals.life_heal_animation)
        self.assertFalse(visuals.score_up_animation)
        self.assertTrue(visuals.psyllium_skill_mode)
        self.assertEqual(visuals.life_animator_state, "LifeHealGauge")
        self.assertEqual(visuals.life_gauge_sprite, "UI_effect_life_plus_gauge")
        self.assertEqual(visuals.life_icon_sprite, "UI_effect_life_plus_icon")
        self.assertEqual(visuals.life_icon_color, (1.0, 1.0, 1.0, 1.0))
        self.assertTrue(visuals.life_animator_enabled)
        self.assertTrue(visuals.life_game_object_active)
        self.assertFalse(visuals.life_warning_blink_refreshed)
        self.assertEqual(visuals.heal_callback_count, 1)
        event = next(
            event for event in runtime.events if event.kind == "skill_visuals_started"
        )
        self.assertEqual((event.life_heal, event.score_up, event.psyllium), (True, False, True))

    def test_life_heal_clip_evaluates_scale_and_alpha_polynomials(self) -> None:
        start = evaluate_skill_ui_animation("LifeHealGauge", 0.0)
        self.assertEqual(start["SpriteIcon.m_LocalScale.x"], 1.0)
        self.assertEqual(start["SpriteBase.mColor.a"], 0.5)
        self.assertEqual(start["SpriteIcon.mColor.a"], 1.0)
        self.assertEqual(start["SpriteIcon.mColor.r"], 1.0)
        peak = evaluate_skill_ui_animation("LifeHealGauge", 2.0 / 3.0)
        self.assertAlmostEqual(peak["SpriteIcon.m_LocalScale.x"], 2.5)
        self.assertAlmostEqual(peak["SpriteBase.mColor.a"], 1.098079588678148)
        self.assertAlmostEqual(peak["SpriteIcon.mColor.a"], 0.0)
        stopped = evaluate_skill_ui_animation("LifeHealGauge", 2.0)
        self.assertEqual(stopped["SpriteIcon.m_LocalScale.x"], 2.5)
        self.assertEqual(stopped["SpriteBase.mColor.a"], 0.0)

    def test_life_controller_resource_path_preserves_runtime_boundary(self) -> None:
        manifest = json.loads(
            Path(__file__).with_name("resource_manifest.json").read_text(
                encoding="utf-8"
            )
        )
        binding_path = Path(__file__).parent / manifest[
            "skill_ui_life_controller_binding_source"
        ]
        binding = json.loads(binding_path.read_text(encoding="utf-8"))
        self.assertEqual(
            binding["resource_manager"]["resource_path"],
            "animation/rhythmgame/skilleffect/lifehealgauge",
        )
        self.assertEqual(binding["resource_manager"]["external_file_id"], 492)
        self.assertIsNone(binding["scene_evidence"]["animator"]["controller"])
        self.assertEqual(binding["setter_scan"]["life_gauge_callers"], [])
        self.assertFalse(binding["avd_used"])

    def test_damage_guard_clip_loops_at_one_second(self) -> None:
        peak = evaluate_skill_ui_animation("DamageGuard", 0.75)
        self.assertEqual(peak["SpriteBase.mColor.a"], 1.0)
        looped = evaluate_skill_ui_animation("DamageGuard", 1.0)
        self.assertEqual(looped["SpriteBase.mColor.a"], 0.5)

    def test_score_up_clip_evaluates_scale_and_alpha_polynomials(self) -> None:
        quarter = evaluate_skill_ui_animation("ScoreUpGauge", 0.25)
        self.assertAlmostEqual(quarter["SpriteIcon.m_LocalScale.x"], 4.0 / 3.0)
        self.assertEqual(quarter["SpriteBase.mColor.a"], 1.0)
        self.assertAlmostEqual(quarter["SpriteIcon.mColor.a"], 2.0 / 3.0)
        half = evaluate_skill_ui_animation("ScoreUpGauge", 0.5)
        self.assertAlmostEqual(half["SpriteIcon.m_LocalScale.x"], 5.0 / 3.0)
        self.assertEqual(half["SpriteBase.mColor.a"], 0.5)
        self.assertAlmostEqual(half["SpriteIcon.mColor.a"], 1.0 / 3.0)

    def test_judge_adjust_clip_evaluates_color_and_loop_boundary(self) -> None:
        quarter = evaluate_skill_ui_animation("SkillAdjustEffect", 0.25)
        self.assertAlmostEqual(quarter["m_Color.a"], 0.7)
        self.assertEqual(quarter["m_Color.r"], 1.0)
        late = evaluate_skill_ui_animation(
            "SkillAdjustEffect", 0.8333333134651184
        )
        self.assertAlmostEqual(late["m_Color.a"], 0.4)
        looped = evaluate_skill_ui_animation(
            "SkillAdjustEffect", 0.9833333492279053
        )
        self.assertAlmostEqual(looped["m_Color.a"], 0.7)
        with self.assertRaisesRegex(ValueError, "unrecovered Skill UI animation"):
            evaluate_skill_ui_animation("Unknown", 0.0)

    def test_skill_visuals_high_life_skips_heal_and_plays_score(self) -> None:
        note = NoteSpec(
            "skill-visual-high-life",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            skill_playback_specs=(
                SkillPlaybackSpec(
                    4,
                    110,
                    1.0,
                    once_effect_type="life",
                    once_effect_value_type="real_value",
                    once_effect_value=100,
                    once_effect_condition_life_type="under_life",
                    once_effect_condition_life=500,
                    activate_effects=(SkillActivateEffectSpec("score", value=20),),
                ),
            ),
        )
        runtime.hud.life = 600
        runtime._resolve(note, "perfect", None, "head")
        runtime.update(0.0)
        visuals = runtime.skill_visuals
        self.assertFalse(visuals.life_heal_animation)
        self.assertTrue(visuals.score_up_animation)
        self.assertEqual(visuals.heal_callback_count, 0)

    def test_skill_visuals_can_play_guard_never_die_and_judge_together(self) -> None:
        runtime, _ = self.make_active_skill_runtime(
            (
                SkillActivateEffectSpec("damage", "rate", value=0),
                SkillActivateEffectSpec("never_die", value_type="none"),
                SkillActivateEffectSpec("judge", condition="great"),
            )
        )
        visuals = runtime.skill_visuals
        self.assertTrue(visuals.damage_guard_animation)
        self.assertTrue(visuals.never_die_animation)
        self.assertTrue(visuals.judge_adjust_animation)
        event = next(
            event for event in runtime.events if event.kind == "skill_visuals_started"
        )
        self.assertEqual(
            (event.damage_guard, event.never_die, event.judge_adjust),
            (True, True, True),
        )

    def test_skill_life_visuals_apply_never_die_heal_guard_overwrite_order(self) -> None:
        note = NoteSpec(
            "skill-visual-overwrite-order",
            120,
            2,
            game_note_additional_type=2,
            skill_note_index=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            skill_chara_list=(4,),
            skill_playback_specs=(
                SkillPlaybackSpec(
                    4,
                    111,
                    1.0,
                    once_effect_type="life",
                    once_effect_value_type="real_value",
                    once_effect_value=100,
                    activate_effects=(
                        SkillActivateEffectSpec("never_die", value_type="none"),
                        SkillActivateEffectSpec("damage", "rate", value=0),
                    ),
                ),
            ),
        )
        runtime._resolve(note, "perfect", None, "head")
        runtime.update(0.0)
        visuals = runtime.skill_visuals
        self.assertTrue(visuals.never_die_animation)
        self.assertTrue(visuals.life_heal_animation)
        self.assertTrue(visuals.damage_guard_animation)
        self.assertEqual(visuals.life_animator_state, "DamageGuard")
        self.assertEqual(visuals.life_gauge_sprite, "effect_health_guard_outline")
        self.assertEqual(visuals.life_icon_sprite, "")
        self.assertEqual(visuals.life_icon_color, (1.0, 1.0, 1.0, 0.0))
        self.assertTrue(visuals.life_warning_blink_refreshed)

    def test_skill_score_and_judge_visuals_use_exact_states_and_disable(self) -> None:
        runtime, _ = self.make_active_skill_runtime(
            (
                SkillActivateEffectSpec("score", value=20),
                SkillActivateEffectSpec("judge", condition="great"),
            )
        )
        visuals = runtime.skill_visuals
        self.assertEqual(visuals.score_animator_state, "ScoreUpGauge")
        self.assertTrue(visuals.score_gauge_effect_active)
        self.assertTrue(visuals.score_animator_enabled)
        self.assertEqual(visuals.score_animator_elapsed, 0.0)
        self.assertEqual(visuals.judge_animator_state, "SkillAdjustEffect")
        self.assertTrue(visuals.judge_animator_enabled)
        self.assertEqual(visuals.judge_animator_elapsed, 0.0)
        self.assertTrue(visuals.judge_game_object_active)
        runtime.update(0.25)
        self.assertEqual(visuals.score_animator_elapsed, 0.25)
        self.assertEqual(visuals.judge_animator_elapsed, 0.25)
        runtime.pause()
        runtime.update(0.5)
        self.assertEqual(visuals.score_animator_elapsed, 0.25)
        self.assertEqual(visuals.judge_animator_elapsed, 0.25)
        runtime.resume()
        runtime.stop_skill_playback()
        self.assertEqual(visuals.score_animator_state, "ScoreUpGauge")
        self.assertFalse(visuals.score_gauge_effect_active)
        self.assertFalse(visuals.score_animator_enabled)
        self.assertEqual(visuals.score_animator_elapsed, 0.0)
        self.assertEqual(visuals.judge_animator_state, "SkillAdjustEffect")
        self.assertFalse(visuals.judge_animator_enabled)
        self.assertEqual(visuals.judge_animator_elapsed, 0.0)
        self.assertFalse(visuals.judge_game_object_active)

    def test_skill_visuals_always_enter_psyllium_mode_and_reset_on_finish(self) -> None:
        runtime, _ = self.make_active_skill_runtime(())
        self.assertTrue(runtime.skill_visuals.psyllium_skill_mode)
        runtime.skill_visuals.heal_callback_count = 2
        runtime.stop_skill_playback()
        self.assertFalse(runtime.skill_visuals.psyllium_skill_mode)
        self.assertEqual(runtime.skill_visuals.psyllium_mode, "normal")
        self.assertEqual(
            runtime.skill_visuals.psyllium_color_source,
            "before_color_array",
        )
        self.assertTrue(runtime.skill_visuals.psyllium_restore_before_color)
        self.assertFalse(runtime.skill_visuals.psyllium_restore_smooth)
        self.assertFalse(runtime.skill_visuals.life_heal_animation)
        self.assertFalse(runtime.skill_visuals.damage_guard_animation)
        self.assertFalse(runtime.skill_visuals.never_die_animation)
        self.assertFalse(runtime.skill_visuals.score_up_animation)
        self.assertFalse(runtime.skill_visuals.judge_adjust_animation)
        self.assertEqual(runtime.skill_visuals.heal_callback_count, 2)
        self.assertIn(
            "skill_visuals_finished", [event.kind for event in runtime.events]
        )

    def test_skill_psyllium_finish_keeps_fever_mode_without_color_restore(self) -> None:
        runtime, _ = self.make_active_skill_runtime(())
        runtime.fever_runtime.fever_time_state = FEVER_TIME_STATE_LEVEL_ONE
        runtime.stop_skill_playback()
        visuals = runtime.skill_visuals
        self.assertEqual(visuals.psyllium_mode, "fever")
        self.assertEqual(visuals.psyllium_color_source, "situation_skill_index:4")
        self.assertFalse(visuals.psyllium_restore_before_color)
        self.assertIsNone(visuals.psyllium_restore_smooth)

    def test_skill_judge_effect_promotes_matching_result_before_consumers(self) -> None:
        runtime, target = self.make_active_skill_runtime(
            (SkillActivateEffectSpec("judge", condition="great"),)
        )
        runtime._resolve(target, "great", "fast", "head")
        frame = runtime._frame_data[-1]
        self.assertEqual((frame.raw_result, frame.adjusted_result), ("great", "perfect"))
        self.assertEqual(frame.add_combo, 1)
        self.assertIsNone(frame.judge_timing)
        self.assertEqual(runtime.hud.judgement, "perfect")

    def test_skill_damage_effect_supports_real_rate_and_zero_guard(self) -> None:
        cases = (
            (SkillActivateEffectSpec("damage", "real_value", value=25), 75, 0),
            (SkillActivateEffectSpec("damage", "rate", value=50), 50, 0),
            (SkillActivateEffectSpec("damage", "rate", value=0), 0, 1),
        )
        for effect, expected_damage, expected_guard in cases:
            runtime, target = self.make_active_skill_runtime((effect,), life=500)
            runtime._resolve(target, "miss", "slow", "head")
            frame = runtime._frame_data[-1]
            self.assertEqual(frame.damage, expected_damage)
            self.assertEqual(frame.add_power, -expected_damage)
            self.assertEqual(frame.damage_guard_type, expected_guard)
            self.assertEqual(runtime.hud.life, 500 - expected_damage)
        runtime, target = self.make_active_skill_runtime(
            (
                SkillActivateEffectSpec("damage", "real_value", value=200),
                SkillActivateEffectSpec("damage", "real_value", value=-200),
            ),
            life=500,
        )
        runtime._resolve(target, "miss", "slow", "head")
        self.assertEqual(runtime._frame_data[-1].damage, 100)

    def test_skill_never_die_leaves_five_life_only_for_lethal_damage(self) -> None:
        effect = SkillActivateEffectSpec("never_die", value_type="none")
        lethal, target = self.make_active_skill_runtime((effect,), life=80)
        lethal._resolve(target, "miss", "slow", "head")
        self.assertEqual(lethal.hud.life, 5)
        self.assertTrue(lethal._frame_data[-1].never_die_skill)
        self.assertEqual(lethal._frame_data[-1].damage_guard_type, 2)

        nonlethal, target = self.make_active_skill_runtime((effect,), life=200)
        nonlethal._resolve(target, "miss", "slow", "head")
        self.assertEqual(nonlethal.hud.life, 100)
        self.assertEqual(nonlethal._frame_data[-1].damage_guard_type, 2)

    def test_skill_score_effect_applies_result_and_life_conditions(self) -> None:
        cases = (
            (SkillActivateEffectSpec("score", condition="great", value=20), 500, "great", 1.2, 1),
            (SkillActivateEffectSpec("score", condition="perfect", value=20), 500, "perfect", 1.2, 2),
            (SkillActivateEffectSpec("score_over_life", value=30, condition_life=500), 500, "great", 1.3, 2),
            (SkillActivateEffectSpec("score_under_life", value=40, condition_life=500), 499, "great", 1.4, 1),
        )
        for effect, life, result, expected_rate, expected_type in cases:
            runtime, target = self.make_active_skill_runtime((effect,), life=life)
            runtime._resolve(target, result, None, "head")
            frame = runtime._frame_data[-1]
            self.assertAlmostEqual(frame.skill_score_up_rate, expected_rate)
            self.assertEqual(frame.score_up_type, expected_type)

    def test_score_over_life_uses_once_effect_condition_for_score_type(self) -> None:
        runtime, target = self.make_active_skill_runtime(
            (
                SkillActivateEffectSpec(
                    "score_over_life",
                    value=25,
                    condition_life=500,
                ),
            ),
            once_effect_condition_life_type="under_life",
        )
        runtime._resolve(target, "perfect", None, "head")
        self.assertEqual(runtime._frame_data[-1].score_up_type, 1)

    def test_continuous_judge_effect_tracks_worst_result_and_unification(self) -> None:
        runtime, target = self.make_active_skill_runtime(
            (
                SkillActivateEffectSpec(
                    "score_continued_note_judge",
                    condition="great",
                    value=50,
                    unification_value=80,
                    unification_satisfied=True,
                ),
            )
        )
        runtime._resolve(target, "great", None, "head")
        self.assertEqual(runtime.skill_runtime.judge_continuous_result_type, "great")
        self.assertAlmostEqual(runtime._frame_data[-1].skill_score_up_rate, 1.8)
        self.assertEqual(runtime._frame_data[-1].score_up_type, 2)

    def test_failed_continuous_gate_forces_later_normal_effect_value(self) -> None:
        runtime, target = self.make_active_skill_runtime(
            (
                SkillActivateEffectSpec(
                    "score_continued_note_judge",
                    condition="perfect",
                    value=50,
                ),
                SkillActivateEffectSpec(
                    "score",
                    condition="miss",
                    value=20,
                    unification_value=100,
                    unification_satisfied=True,
                ),
            )
        )
        runtime._resolve(target, "great", None, "head")
        self.assertAlmostEqual(runtime._frame_data[-1].skill_score_up_rate, 1.2)

    def test_crescendo_effect_stacks_only_on_perfect_and_respects_cap(self) -> None:
        runtime, target = self.make_active_skill_runtime(
            (
                SkillActivateEffectSpec(
                    "score_rate_up_with_perfect",
                    value=0,
                    stack_value=10,
                    max_value=30,
                ),
            )
        )
        rates = []
        for result in ("perfect", "great", "perfect", "perfect", "perfect"):
            runtime._resolve(target, result, None, "head")
            rates.append(runtime._frame_data[-1].skill_score_up_rate)
        self.assertEqual(rates, [1.1, 1.1, 1.2, 1.3, 1.3])
        self.assertEqual(runtime.skill_runtime.crescendo_skill_score_up_rate, 30)
        self.assertTrue(all(frame.score_up_type == 5 for frame in runtime._frame_data[-5:]))
        self.assertEqual(runtime.last_frame_total.crescendo_skill_score_up_rate, 30)
        self.assertEqual(runtime.hud.result_visual.rate_up_value, 30)

    def test_perfect_only_and_under_great_half_score_routes(self) -> None:
        cases = (
            ("score_only_perfect", "perfect", 1.5, 2),
            ("score_only_perfect", "great", 0.0, 3),
            ("score_only_perfect", "bad", 0.0, 0),
            ("score_under_great_half", "perfect", 1.5, 2),
            ("score_under_great_half", "good", 0.5, 4),
            ("score_under_great_half", "miss", 0.0, 0),
        )
        for effect_type, result, expected_rate, expected_type in cases:
            runtime, target = self.make_active_skill_runtime(
                (SkillActivateEffectSpec(effect_type, value=50),)
            )
            runtime._resolve(target, result, None, "head")
            frame = runtime._frame_data[-1]
            self.assertAlmostEqual(frame.skill_score_up_rate, expected_rate)
            self.assertEqual(frame.score_up_type, expected_type)

    def test_fever_note_point_table_matches_all_difficulties(self) -> None:
        self.assertEqual(
            FEVER_NOTE_POINT_TABLE,
            {
                "easy": {"great": 20, "perfect": 20},
                "normal": {"great": 12, "perfect": 12},
                "hard": {"great": 6, "perfect": 6},
                "expert": {"great": 4, "perfect": 4},
                "special": {"great": 4, "perfect": 4},
            },
        )
        for difficulty, point in (
            ("easy", 20),
            ("normal", 12),
            ("hard", 6),
            ("expert", 4),
            ("special", 4),
        ):
            self.assertEqual(fever_note_point(difficulty, "great"), point)
            self.assertEqual(fever_note_point(difficulty, "perfect"), point)

    def test_fever_good_bad_and_miss_add_no_points(self) -> None:
        for result in ("good", "bad", "miss"):
            note = NoteSpec(
                result,
                120,
                2,
                game_note_additional_type=1,
            )
            runtime = RuntimeIntegration(
                TempoMap([TempoChange(0, 120)]),
                [note],
            )
            runtime._resolve(note, result, None, "head")
            self.assertEqual(runtime.fever_runtime.my_fever_point, 0)
            self.assertNotIn(
                "fever_point_added", [event.kind for event in runtime.events]
            )

    def test_root_fever_perfect_adds_point_and_progress(self) -> None:
        note = NoteSpec(
            "root-fever",
            120,
            2,
            game_note_additional_type=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            difficulty="expert",
        )
        runtime._resolve(note, "perfect", None, "head")
        self.assertEqual(runtime.fever_runtime.my_fever_point, 4)
        self.assertEqual(runtime.fever_runtime.rest_note_count, 19)
        self.assertEqual(runtime.events[0].kind, "fever_point_added")
        self.assertEqual(runtime.events[0].phase, "head")

    def test_terminal_fever_perfect_uses_tail_additional_type(self) -> None:
        note = NoteSpec(
            "tail-fever",
            120,
            2,
            "long",
            240,
            end_game_note_additional_type=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            difficulty="normal",
        )
        runtime._resolve(note, "perfect", None, "tail")
        self.assertEqual(runtime.fever_runtime.my_fever_point, 12)
        self.assertEqual(runtime.fever_runtime.rest_note_count, 6)
        self.assertEqual(runtime.events[0].phase, "tail")

    def test_non_none_fever_state_does_not_mark_fever_notes(self) -> None:
        note = NoteSpec(
            "inactive-fever",
            120,
            2,
            game_note_additional_type=1,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
            fever_time_state=1,
        )
        runtime._resolve(note, "perfect", None, "head")
        self.assertEqual(runtime.fever_runtime.my_fever_point, 0)

    def test_fever_score_rate_matches_recovered_state_gate(self) -> None:
        normal = RuntimeIntegration(TempoMap([TempoChange(0, 120)]), [])
        fever = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
            fever_time_state=FEVER_TIME_STATE_LEVEL_ONE,
        )
        failed = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
            fever_time_state=FEVER_TIME_STATE_FAILED,
        )
        self.assertEqual(normal.fever_score_up_rate, 1.0)
        self.assertEqual(fever.fever_score_up_rate, FEVER_LEVEL_ONE_SCORE_RATE)
        self.assertEqual(failed.fever_score_up_rate, 1.0)

    def test_fever_member_reaching_eighty_sets_pass_condition_once(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
            my_display_index=2,
            fever_team_display_indices=(2, 4),
        )
        runtime.update_fever_member_point(2, 79)
        self.assertEqual(runtime.fever_runtime.pass_conditions[2], 0)
        runtime.update_fever_member_point(2, 80)
        runtime.update_fever_member_point(2, 90)
        self.assertEqual(
            runtime.fever_runtime.pass_conditions[2],
            FEVER_TIME_STATE_LEVEL_ONE,
        )
        events = [
            event
            for event in runtime.events
            if event.kind == "fever_pass_condition_changed"
        ]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].display_index, 2)

    def test_fever_ready_reserves_next_frame_without_changing_state(self) -> None:
        runtime = RuntimeIntegration(TempoMap([TempoChange(0, 120)]), [])
        runtime.start_fever_time_command(FEVER_COMMAND_READY, game_frame_counter=41)
        state = runtime.fever_runtime
        self.assertEqual(state.fever_time_state, FEVER_TIME_STATE_NONE)
        self.assertEqual(state.reservation_target_frame, 42)
        self.assertEqual(state.reservation_command_type, FEVER_COMMAND_READY)
        self.assertEqual(state.reservation_after_state, FEVER_TIME_STATE_NONE)
        event = runtime.events[-1]
        self.assertEqual(event.command_id, "FeverReady")
        self.assertEqual(event.fever_state_before, FEVER_TIME_STATE_NONE)
        self.assertEqual(event.fever_state_after, FEVER_TIME_STATE_NONE)

    def test_fever_start_succeeds_when_every_team_member_passed(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
            fever_team_display_indices=(0, 1),
        )
        runtime.update_fever_member_point(0, 80)
        runtime.update_fever_member_point(1, 100)
        runtime.start_fever_time_command(FEVER_COMMAND_START, game_frame_counter=50)
        state = runtime.fever_runtime
        self.assertEqual(state.fever_time_state, FEVER_TIME_STATE_LEVEL_ONE)
        self.assertEqual(runtime.fever_score_up_rate, FEVER_LEVEL_ONE_SCORE_RATE)
        self.assertEqual(state.member_points, {0: 0, 1: 0})
        self.assertEqual(state.pass_conditions, {0: 0, 1: 0})
        self.assertEqual(state.reservation_target_frame, 51)
        self.assertEqual(state.reservation_after_state, FEVER_TIME_STATE_LEVEL_ONE)

    def test_fever_start_fails_when_team_pass_count_is_short(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
            fever_team_display_indices=(0, 1),
        )
        runtime.update_fever_member_point(0, 80)
        runtime.start_fever_time_command(FEVER_COMMAND_START)
        self.assertEqual(
            runtime.fever_runtime.fever_time_state,
            FEVER_TIME_STATE_FAILED,
        )
        self.assertEqual(runtime.fever_score_up_rate, 1.0)

    def test_fever_end_resets_points_state_and_score_rate(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
            fever_time_state=FEVER_TIME_STATE_LEVEL_ONE,
        )
        runtime.fever_runtime.my_fever_point = 64
        runtime.fever_runtime.member_points[0] = 64
        runtime.start_fever_time_command(FEVER_COMMAND_END)
        state = runtime.fever_runtime
        self.assertEqual(state.fever_time_state, FEVER_TIME_STATE_NONE)
        self.assertEqual(state.my_fever_point, 0)
        self.assertEqual(state.member_points, {0: 0})
        self.assertEqual(runtime.fever_score_up_rate, 1.0)

    def test_additional_note_consumer_counts_separate_root_and_terminal(self) -> None:
        counts = additional_note_consumer_counts(
            (
                NoteSpec(
                    "root-skill",
                    120,
                    1,
                    game_note_additional_type=2,
                    skill_note_index=1,
                ),
                NoteSpec(
                    "root-fever",
                    240,
                    2,
                    game_note_additional_type=1,
                ),
                NoteSpec(
                    "tail-fever",
                    360,
                    3,
                    "long",
                    480,
                    end_game_note_additional_type=1,
                ),
            )
        )
        self.assertEqual(
            counts,
            {"root_skill": 1, "end_skill": 0, "root_fever": 1, "end_fever": 1},
        )

    def test_never_die_damage_guard_leaves_five_life(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("miss", 120, 1, miss_damage=100)],
        )
        runtime.hud.life = 50
        runtime.never_die_skill = True
        self.advance(runtime, 1.2)

        self.assertEqual(runtime.hud.life, 5)
        self.assertEqual(runtime._frame_data[-1].damage_guard_type, 2)

    def test_without_never_die_damage_can_reach_zero(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("miss", 120, 1, miss_damage=100)],
        )
        runtime.hud.life = 50
        self.advance(runtime, 1.2)
        self.assertEqual(runtime.hud.life, 0)

    def test_checked_in_resource_manifest_reports_no_unresolved_bindings(self) -> None:
        catalog = ResourceCatalog.load(Path(__file__).with_name("resource_manifest.json"))
        self.assertEqual(catalog.unresolved(), [])
        self.assertNotIn("notes.note_long", catalog.unresolved())

    def test_checked_in_resource_manifest_binds_verified_audio_mirrors(self) -> None:
        profile = json.loads(
            (
                Path(__file__).parents[1]
                / "judge-cue-portable-resources/judge_cue_portable_resources.json"
            ).read_text(encoding="utf-8")
        )
        catalog = ResourceCatalog.load(Path(__file__).with_name("resource_manifest.json"))
        self.assertEqual(set(catalog.cues), set(profile["resources"]))
        for role, recorded in profile["resources"].items():
            binding = catalog.cues[role]
            self.assertTrue(binding.has_verified_external_source)
            self.assertEqual(binding.resource_id, recorded["resource_id"])
            self.assertEqual(binding.source_url, recorded["source_url"])
            self.assertEqual(binding.source_sha256, recorded["source_sha256"])

    def test_checked_in_resource_manifest_binds_verified_note_atlases(self) -> None:
        catalog = ResourceCatalog.load(Path(__file__).with_name("resource_manifest.json"))
        normal = catalog.notes["note_normal"]
        directional = catalog.notes["note_flick_l"]
        self.assertTrue(normal.has_verified_external_source)
        self.assertEqual(normal.atlas_sprite_names[0], "note_normal_0")
        self.assertEqual(normal.atlas_sprite_names[-1], "note_normal_6")
        self.assertTrue(directional.has_verified_external_source)
        self.assertEqual(directional.atlas_sprite_names[0], "note_flick_l_0")
        self.assertEqual(directional.atlas_sprite_names[-1], "note_flick_l_6")

    def test_resource_catalog_binds_render_notes_and_audio_cues(self) -> None:
        catalog = ResourceCatalog.from_dict(
            {
                "notes": {
                    "default": {
                        "resource_id": "sprite.tap.real",
                        "path": "notes/tap.png",
                        "resource_type": "UnityEngine.Sprite",
                    }
                },
                "cues": {
                    "judge_result_perfect_ptr_06c9ebf0": {
                        "resource_id": "cue.tap.perfect",
                        "path": "audio/live.acb#tap_perfect",
                        "resource_type": "CRIWARE.Cue",
                    }
                },
            }
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("tap", 120, 1)],
            resource_catalog=catalog,
        )
        self.advance(runtime, 0.5)
        self.assertEqual(runtime.render.notes["tap"].resource_id, "sprite.tap.real")
        self.assertEqual(len(catalog.missing_files(Path(__file__).parent)), 2)
        self.advance(runtime, 0.5)
        runtime.touch_began(1, 1)
        self.assertIn("cue.tap.perfect", runtime.audio.cues)

    def test_standard_judge_cue_routes_only_good_great_perfect(self) -> None:
        catalog = ResourceCatalog.from_dict({"notes": {}, "cues": {}})
        self.assertEqual(catalog.judge_cue_resource("good", "tap"), "good")
        self.assertEqual(catalog.judge_cue_resource("great", "tap"), "great")
        self.assertEqual(catalog.judge_cue_resource("perfect", "tap"), "perfect")
        self.assertIsNone(catalog.judge_cue_resource("bad", "tap"))
        self.assertIsNone(catalog.judge_cue_resource("miss", "tap"))

    def test_flick_cue_routes_type_and_multiple_count_boundaries(self) -> None:
        self.assertEqual(flick_cue_role(None, 1), "flick_cue_default_ptr_06c9ebc8")
        self.assertEqual(flick_cue_role(6, 1), "flick_cue_directional_ptr_06c9ebd0")
        self.assertEqual(flick_cue_role(9, 1), "flick_cue_directional_ptr_06c9ebd0")
        self.assertEqual(flick_cue_role(7, 1), "flick_cue_directional_ptr_06c9ebd0")
        self.assertEqual(flick_cue_role(7, 2), "flick_cue_multiple_2_ptr_06c9ebe0")
        self.assertEqual(flick_cue_role(10, 3), "flick_cue_multiple_3_7_ptr_06c9ebd8")
        self.assertEqual(flick_cue_role(10, 7), "flick_cue_multiple_3_7_ptr_06c9ebd8")
        self.assertEqual(flick_cue_role(10, 8), "flick_cue_directional_ptr_06c9ebd0")

    def test_flick_judge_route_combines_bundle_and_result_cue(self) -> None:
        catalog = ResourceCatalog.from_dict({"notes": {}, "cues": {}})
        self.assertEqual(
            catalog.judge_cue_resource("perfect", "flick", 7, 2),
            "directional_fl_2|perfect",
        )

    def test_judge_audio_evidence_matches_manifest_cues(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name("judge_cue_audio_assets.json").read_text(encoding="utf-8")
        )
        manifest = json.loads(
            Path(__file__).with_name("resource_manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            manifest["audio_cue_assets"]["source"],
            "judge_cue_acb_runtime_assets.json",
        )
        self.assertEqual(
            manifest["audio_cue_assets"]["exported_source"],
            "judge_cue_audio_assets.json",
        )
        self.assertEqual(
            {binding["resource_id"] for binding in manifest["cues"].values()} - {"cue.hold.loop"},
            {
                relocation["value"]
                for relocation in evidence["native"]["actual_relocations"].values()
            },
        )

    def test_judge_cue_audio_profiles_match_original_acb_streams(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name("judge_cue_acb_runtime_assets.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(set(evidence["streams"]), {
            "SE_RHYTHM_TAP_LONG",
            "flick",
            "game_button",
            "good",
            "great",
            "perfect",
            "directional_fl",
            "directional_fl_2",
            "directional_fl_3",
        })
        for cue_name, recorded in evidence["streams"].items():
            profile = judge_cue_audio_profile(cue_name)
            self.assertEqual(profile.cue_sheet, recorded["cue_sheet"])
            self.assertEqual(profile.codec, recorded["codec"])
            self.assertEqual(profile.sample_rate, recorded["sample_rate"])
            self.assertEqual(profile.channels, recorded["channels"])
            self.assertEqual(profile.total_samples, recorded["total_samples"])
            self.assertEqual(profile.embedded_offset, recorded["offset"])
            self.assertEqual(profile.encoded_bytes, recorded["encoded_bytes"])
            self.assertEqual(profile.loop_start, recorded["loop_start"])
            self.assertEqual(profile.loop_end, recorded["loop_end"])
            self.assertAlmostEqual(
                profile.duration_seconds,
                recorded["total_samples"] / recorded["sample_rate"],
            )
        with self.assertRaisesRegex(ValueError, "unrecovered judge cue"):
            judge_cue_audio_profile("unknown")

    def test_judge_cue_profiles_match_acb_playback_controls(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name("judge_cue_acb_playback_controls.json").read_text(
                encoding="utf-8"
            )
        )
        for cue_sheet, recorded in evidence["cue_sheets"].items():
            profile = judge_cue_sheet_profile(cue_sheet)
            self.assertEqual(profile.format_version, recorded["format_version"])
            self.assertEqual(profile.version_string, recorded["version_string"])
            self.assertEqual(profile.acb_volume, recorded["acb_volume"])
            self.assertEqual(profile.cue_priority_type, recorded["cue_priority_type"])
            self.assertEqual(profile.num_cue_limit, recorded["num_cue_limit"])
            self.assertEqual(
                profile.num_cue_limit_list_works,
                recorded["num_cue_limit_list_works"],
            )
            self.assertEqual(
                profile.num_cue_limit_node_works,
                recorded["num_cue_limit_node_works"],
            )
            self.assertEqual(profile.output_reference, recorded["output_reference"])
            self.assertEqual(profile.aisac_table_bytes, recorded["aisac_table_bytes"])
            self.assertEqual(
                profile.global_aisac_reference_table_bytes,
                recorded["global_aisac_reference_table_bytes"],
            )
            self.assertEqual(
                profile.action_track_table_bytes,
                recorded["action_track_table_bytes"],
            )
        for cue_name, recorded in evidence["cues"].items():
            profile = judge_cue_audio_profile(cue_name)
            self.assertEqual(profile.cue_id, recorded["cue_id"])
            self.assertEqual(profile.length_ms, recorded["length_ms"])
            self.assertEqual(profile.memory_awb_id, recorded["memory_awb_id"])
            self.assertEqual(profile.loop_flag, recorded["loop_flag"])
            self.assertEqual(
                profile.event_command_hex,
                f"07d0040002{recorded['cue_index']:04x}000000",
            )
            self.assertEqual(
                profile.sequence_command_hex,
                f"004f050004{recorded['cue_index']:04x}00006f0400002710",
            )
        with self.assertRaisesRegex(ValueError, "unrecovered judge cue sheet"):
            judge_cue_sheet_profile("unknown")

    def test_judge_audio_global_profile_matches_current_acf_and_identity_boundary(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name("judge_audio_global_acf.json").read_text(
                encoding="utf-8"
            )
        )
        profile = judge_audio_global_profile()
        current = evidence["current_runtime_acf"]
        bundle = evidence["runtime_bundle"]
        master = evidence["master_output"]
        category = evidence["category"]
        voice_limit = evidence["voice_limit_group"]
        identity = evidence["judge_cue_sheet_build_acf_identity"]
        self.assertEqual(profile.name, current["name"])
        self.assertEqual(profile.format_version, current["format_version"])
        self.assertEqual(profile.version_string, current["version_string"])
        self.assertEqual(profile.file_size, current["file_size"])
        self.assertEqual(profile.sha256, current["sha256"])
        self.assertEqual(profile.md5, current["md5"])
        self.assertEqual(profile.internal_md5, current["internal_md5"])
        self.assertEqual(profile.bundle_name, bundle["bundle_name"])
        self.assertEqual(profile.bundle_catalog_hash, bundle["catalog_hash"])
        self.assertEqual(profile.bundle_crc, bundle["crc"])
        self.assertEqual(profile.bundle_size, bundle["file_size"])
        self.assertEqual(profile.text_asset_path_id, bundle["acf_text_asset_path_id"])
        self.assertEqual(profile.output_bus_name, master["bus_name"])
        self.assertEqual(profile.bus_volume, master["volume"])
        self.assertEqual(profile.pan3d_volume, master["pan3d_volume"])
        self.assertEqual(profile.pan3d_angle, master["pan3d_angle"])
        self.assertEqual(profile.pan3d_distance, master["pan3d_distance"])
        self.assertEqual(
            profile.dsp_settings,
            tuple(
                (row["name"], row["start_index"], row["num_buses"], row["num_snapshots"])
                for row in evidence["dsp_settings"]
            ),
        )
        self.assertEqual(profile.category_name, category["name"])
        self.assertEqual(profile.category_id, category["id"])
        self.assertEqual(profile.category_group_index, category["group_index"])
        self.assertEqual(
            profile.categories_parallel_playback,
            category["categories_parallel_playback"],
        )
        self.assertEqual(profile.voice_limit_group_name, voice_limit["name"])
        self.assertEqual(profile.voice_limit_max_numbers, voice_limit["max_numbers"])
        self.assertEqual(profile.aisac_controls, tuple(map(tuple, evidence["aisac_controls"])))
        self.assertEqual(profile.global_aisac_count, 0)
        self.assertEqual(profile.selector_count, 0)
        self.assertEqual(profile.graph_count, 0)
        self.assertEqual(profile.dsp_fx_count, 0)
        self.assertEqual(profile.bus_link_count, 0)
        self.assertEqual(
            {row["acb_acf_md5"] for row in identity.values()},
            {profile.cue_sheet_build_acf_md5},
        )
        self.assertFalse(profile.cue_sheet_build_acf_md5_matches)
        self.assertTrue(all(not row["matches_current_runtime_acf"] for row in identity.values()))

    def test_judge_audio_global_profile_matches_registration_and_dsp_selection_boundary(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name(
                "judge_audio_acf_registration_dsp_selection.json"
            ).read_text(encoding="utf-8")
        )
        profile = judge_audio_global_profile()
        scene = evidence["sources"]["bootstrap_scene"]
        serialized = evidence["serialized_cri_atom"]
        bundle_path = evidence["sound_bundle_registration_path"]
        call_scan = evidence["direct_managed_call_scan"]
        boundary = evidence["dsp_selection_boundary"]
        self.assertEqual(profile.bootstrap_scene_file, serialized["scene_file"])
        self.assertEqual(profile.bootstrap_scene_sha256, scene["sha256"])
        self.assertEqual(profile.bootstrap_cri_atom_path_id, serialized["path_id"])
        self.assertEqual(profile.bootstrap_acf_file, serialized["acf_file"])
        self.assertEqual(profile.bootstrap_cue_sheet_count, serialized["cue_sheet_count"])
        self.assertIsNone(profile.serialized_dsp_bus_setting)
        self.assertEqual(serialized["dsp_bus_setting"], "")
        self.assertEqual(
            profile.dynamic_acf_registration_method,
            bundle_path["method"],
        )
        self.assertEqual(
            profile.managed_game_dsp_attach_call_count,
            call_scan["game_owned_attach_callers"],
        )
        self.assertIsNone(boundary["managed_static_selection"])
        self.assertEqual(
            profile.native_runtime_dsp_attachment_observed,
            boundary["native_runtime_attachment_observed"],
        )

    def test_judge_audio_player_profile_matches_volume_pan_and_latency_controls(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name("judge_audio_player_controls.json").read_text(
                encoding="utf-8"
            )
        )
        profile = judge_audio_player_profile()
        pools = evidence["resource_pools"]
        self.assertEqual(profile.bgm_pool.count, pools["bgm"]["count"])
        self.assertEqual(
            profile.bgm_pool.source_component,
            pools["bgm"]["source_component"],
        )
        self.assertEqual(
            profile.bgm_pool.android_low_latency_voice_pool,
            pools["bgm"]["android_low_latency_voice_pool_final"],
        )
        self.assertEqual(profile.se_pool.count, pools["se"]["main_count"])
        self.assertEqual(
            profile.se_pool.android_low_latency_voice_pool,
            pools["se"]["android_low_latency_voice_pool_final"],
        )
        self.assertEqual(
            profile.se_one_shot_pool.count,
            pools["se"]["one_shot_count"],
        )
        self.assertEqual(profile.voice_pool.count, pools["voice"]["count"])
        self.assertEqual(
            profile.voice_pool.android_low_latency_voice_pool,
            pools["voice"]["android_low_latency_voice_pool_final"],
        )
        low_latency = evidence["global_low_latency_configuration"]
        self.assertEqual(
            profile.low_latency_live_core_enabled,
            low_latency["getter_result"],
        )
        self.assertTrue(profile.android_sonic_sync_enabled)
        self.assertTrue(profile.ios_sonic_sync_enabled)
        centered = profile.resolve_se_playback(
            master_volume=0.8,
            se_option_volume=0.5,
            requested_volume=0.75,
            pitch=0.1,
            pan=0.0,
            seek_time_ms=24,
        )
        self.assertAlmostEqual(centered.volume, 0.3)
        self.assertEqual(centered.pitch, 0.1)
        self.assertEqual(centered.pan3d_distance, 0.0)
        self.assertEqual(centered.pan3d_angle, 0.0)
        self.assertEqual(centered.start_time_ms, 24)
        self.assertFalse(centered.loop)
        self.assertFalse(centered.use_3d_positioning)
        self.assertTrue(centered.android_low_latency_voice_pool)
        self.assertEqual(centered.requested_sound_renderer_type, 1)
        self.assertFalse(centered.matching_static_voice_pool_available)
        panned = profile.resolve_se_playback(1.0, 1.0, pan=-0.4)
        self.assertEqual(panned.pan3d_distance, 1.0)
        self.assertEqual(panned.pan3d_angle, -0.4)

    def test_judge_audio_player_profile_matches_native_output_configuration(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name(
                "judge_audio_native_output_config.json"
            ).read_text(encoding="utf-8")
        )
        profile = judge_audio_player_profile()
        core = evidence["core_atom_config"]
        android = evidence["android_output_config"]
        self.assertEqual(profile.output_sampling_rate, core["output_sampling_rate"])
        self.assertEqual(profile.server_frequency, core["server_frequency"])
        self.assertEqual(
            profile.standard_memory_voices,
            core["standard_voice_pool"]["memory_voices"],
        )
        self.assertEqual(
            profile.standard_streaming_voices,
            core["standard_voice_pool"]["streaming_voices"],
        )
        self.assertEqual(
            profile.android_buffering_time_ms,
            android["buffering_time_ms"],
        )
        self.assertEqual(
            profile.android_start_buffering_time_ms,
            android["start_buffering_time_ms"],
        )
        self.assertEqual(
            profile.android_low_latency_memory_voices,
            android["low_latency_standard_voice_pool"]["memory_voices"],
        )
        self.assertEqual(
            profile.android_low_latency_streaming_voices,
            android["low_latency_standard_voice_pool"]["streaming_voices"],
        )
        self.assertEqual(
            profile.android_uses_fast_mixer,
            android["uses_android_fast_mixer"],
        )
        self.assertEqual(
            profile.android_force_asr,
            android["force_to_use_asr_for_default_playback"],
        )
        self.assertEqual(profile.android_uses_aaudio, android["uses_aaudio"])
        self.assertEqual(profile.android_stream_type, android["stream_type"])

    def test_judge_audio_player_profile_matches_native_low_latency_pool_boundary(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name(
                "judge_audio_native_low_latency_pool_behavior.json"
            ).read_text(encoding="utf-8")
        )
        profile = judge_audio_player_profile()
        renderers = evidence["voice_pool_renderer_profiles"]
        self.assertEqual(
            profile.standard_voice_pool_sound_renderer_type,
            renderers["standard_memory"]["sound_renderer_type"]["value"],
        )
        self.assertEqual(
            profile.android_low_latency_voice_pool_sound_renderer_type,
            renderers["low_latency_memory_template"]["sound_renderer_type"]["value"],
        )
        scan = evidence["manual_pool_allocation_scan"]
        self.assertEqual(
            profile.managed_manual_standard_voice_pool_constructor_call_count,
            scan["cri_atom_ex_standard_voice_pool_ctor_config_calls"]
            + scan["cri_atom_ex_standard_voice_pool_ctor_simple_calls"],
        )
        selection = evidence["native_voice_selection"]
        self.assertEqual(
            profile.native_cross_renderer_voice_pool_fallback,
            selection["cross_renderer_voice_pool_fallback"],
        )
        self.assertFalse(profile.runtime_voice_pool_selection_observed)
        playback = profile.resolve_se_playback(1.0, 1.0)
        resolution = evidence["static_resolution"]
        self.assertEqual(
            playback.requested_sound_renderer_type,
            resolution["se_requested_sound_renderer_type"],
        )
        self.assertEqual(
            playback.matching_static_voice_pool_available,
            resolution["matching_static_voice_pool_available"],
        )
        self.assertTrue(profile.has_matching_voice_pool(2))
        self.assertFalse(profile.has_matching_voice_pool(1))
        self.assertFalse(profile.has_matching_voice_pool(99))

    def test_rhythm_adjust_profile_matches_manual_latency_state_machine(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name(
                "judge_audio_rhythm_adjust_latency_state_machine.json"
            ).read_text(encoding="utf-8")
        )
        profile = RhythmAdjustLatencyProfile()
        constants = evidence["main_dialog"]["constants"]
        self.assertEqual(profile.division_rate, constants["division_rate"])
        self.assertEqual(profile.beat_per_second, constants["beat_per_second"])
        self.assertEqual(profile.beat_per_frame, constants["beat_per_frame"])
        self.assertEqual(profile.invalid_result, constants["invalid_result"])
        self.assertEqual(profile.judgement_count, constants["judgement_count"])
        self.assertEqual(profile.android_wait_seconds, constants["android_wait_seconds"])
        self.assertEqual(profile.playing_seconds, constants["playing_seconds"])
        self.assertEqual(
            profile.reverberation_wait_seconds,
            constants["reverberation_wait_seconds"],
        )
        self.assertEqual(profile.music_bar_division(192), 19200)
        self.assertEqual(profile.progress_per_frame(192), 160)
        self.assertEqual(rhythm_adjust_phase(0.5, 19200), 4800)
        self.assertEqual(rhythm_adjust_judgement(4800, 4480, 160), 2)
        self.assertEqual(rhythm_adjust_judgement(4800, 5119, 160), -1)
        self.assertEqual(rhythm_adjust_average((1, 2, 99999, 99999)), 2)
        self.assertEqual(rhythm_adjust_average((-1, -2, 99999, 99999)), -2)
        self.assertEqual(rhythm_adjust_average((99999,) * 4), 0)
        direct_calls = evidence["latency_estimator"]["managed_direct_calls"]
        self.assertEqual(
            profile.managed_latency_estimator_initialize_call_count,
            len(direct_calls["InitializeModule"]),
        )
        self.assertFalse(profile.runtime_latency_estimator_initialization_observed)

    def test_judgement_timing_adjustment_profile_matches_runtime_consumption(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name(
                "judge_timing_adjustment_consumption_chain.json"
            ).read_text(encoding="utf-8")
        )
        profile = JudgementTimingAdjustmentProfile()
        ranges = evidence["settings_ui"]["ranges"]
        self.assertEqual((profile.primary_min, profile.primary_max), tuple(ranges["primary"]))
        self.assertEqual(
            (profile.secondary_min, profile.secondary_max),
            tuple(ranges["secondary"]),
        )
        self.assertEqual(profile.done_slider_normalized(-30), 0.0)
        self.assertEqual(profile.done_slider_normalized(0), 0.5)
        self.assertEqual(profile.done_slider_normalized(30), 1.0)
        self.assertEqual(profile.done_slider_value(0.0), -30)
        self.assertEqual(profile.done_slider_value(0.5), 0)
        self.assertEqual(profile.done_slider_value(1.0), 30)
        self.assertEqual(profile.primary_music_start_delay_frames(4), 4)
        self.assertEqual(profile.primary_music_start_delay_frames(-4), 0)
        self.assertEqual(profile.primary_gameplay_start_delay_frames(-4), 4)
        self.assertEqual(profile.primary_gameplay_start_delay_frames(4), 0)
        self.assertEqual(profile.primary_music_tolerance_ms(3), 50)
        self.assertEqual(profile.primary_music_tolerance_ms(-3), -50)
        self.assertEqual(profile.secondary_dictionary_index(12, 3), 9)
        self.assertEqual(profile.secondary_dictionary_index(12, -3), 15)
        runtime = evidence["runtime_consumption"]["primary"]
        self.assertEqual(
            profile.milliseconds_per_frame,
            runtime["music_tolerance_milliseconds_per_frame"],
        )

    def test_judgement_secondary_consumers_and_persistence_match_evidence(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name(
                "judge_timing_adjustment_persistence_and_secondary_consumers.json"
            ).read_text(encoding="utf-8")
        )
        timing = JudgementTimingAdjustmentProfile()
        persistence = PersistentSettingsSaveProfile()
        self.assertEqual(
            persistence.live_core_data_type,
            evidence["persistence"]["live_core_data_type"],
        )
        self.assertEqual(
            persistence.live_core_file_name,
            evidence["persistence"]["file_name_component"],
        )
        self.assertEqual(
            persistence.save_directory_name,
            evidence["persistence"]["save_root_child_literal"],
        )
        self.assertEqual(
            persistence.live_core_relative_path_components,
            tuple(evidence["persistence"]["relative_path_components"]),
        )
        self.assertEqual(persistence.crypt_key, "12345678abdegopq")
        self.assertEqual(
            persistence.transaction_steps,
            (
                "serialize",
                "aes_encrypt",
                "ensure_directory",
                "resolve_file_path",
                "write_all_bytes",
            ),
        )
        self.assertTrue(persistence.null_iv)
        self.assertTrue(persistence.no_backup_flag)
        self.assertEqual(
            secondary_adjusted_music_position(
                100.0,
                3,
                lambda position: position + 2.0,
                lambda position: position - 2.0,
            ),
            106.0,
        )
        self.assertEqual(
            secondary_adjusted_music_position(
                100.0,
                -2,
                lambda position: position + 2.0,
                lambda position: position - 2.0,
            ),
            96.0,
        )
        self.assertEqual(secondary_slide_release_result("great", 1), "perfect")
        self.assertEqual(secondary_slide_release_result("great", 0), "great")
        self.assertEqual(timing.secondary_stop_delay_limit(-2), 8)
        self.assertEqual(timing.secondary_stop_delay_limit(2), 0)

    def test_frame_rate_init_rounds_ratio_and_initializes_surface_rate(self) -> None:
        state = FrameRateControlState(application_target_frame_rate=-1)
        selected = state.refresh_rate_init(60_000, 1_001)
        self.assertAlmostEqual(state.init_display_refresh_rate, 59.9, places=4)
        self.assertAlmostEqual(selected, 59.9, places=4)
        self.assertTrue(state.refresh_rate_setter_created)
        self.assertTrue(state.surface_callback_registered)
        self.assertAlmostEqual(
            state.applied_surface_frame_rate or 0.0,
            59.9,
            places=4,
        )
        self.assertEqual(state.surface_frame_rate_compatibility, 0)

    def test_frame_rate_init_preserves_higher_application_target(self) -> None:
        state = FrameRateControlState(application_target_frame_rate=120)
        self.assertEqual(state.refresh_rate_init(60, 1), 120.0)
        self.assertEqual(state.requested_surface_frame_rate, 120.0)

    def test_set_target_frame_rate_writes_unity_target_and_uses_display_maximum(self) -> None:
        state = FrameRateControlState()
        state.refresh_rate_init(120, 1)
        selected = state.set_target_frame_rate(60)
        self.assertEqual(state.application_target_frame_rate, 60)
        self.assertEqual(selected, 120.0)
        self.assertEqual(state.applied_surface_frame_rate, 120.0)

    def test_surface_recreation_reapplies_stored_rate_only_on_android_30_plus(
        self,
    ) -> None:
        state = FrameRateControlState(android_api_level=29)
        state.refresh_rate_init(60, 1)
        self.assertEqual(state.requested_surface_frame_rate, 60.0)
        self.assertIsNone(state.applied_surface_frame_rate)
        state.surface_destroyed()
        state.set_target_frame_rate(120)
        self.assertEqual(state.requested_surface_frame_rate, 120.0)
        state.android_api_level = 30
        state.surface_created()
        self.assertEqual(state.applied_surface_frame_rate, 120.0)
        invalid_surface = FrameRateControlState(surface_valid=False)
        invalid_surface.refresh_rate_init(60, 1)
        invalid_surface.set_target_frame_rate(120)
        self.assertEqual(invalid_surface.requested_surface_frame_rate, 120.0)
        self.assertIsNone(invalid_surface.applied_surface_frame_rate)
        invalid_surface.surface_created()
        self.assertEqual(invalid_surface.applied_surface_frame_rate, 120.0)

    def test_high_frequency_settings_callback_only_persists_value(self) -> None:
        state = FrameRateControlState()
        state.refresh_rate_init(60, 1)
        before = (
            state.application_target_frame_rate,
            state.requested_surface_frame_rate,
            state.applied_surface_frame_rate,
        )
        state.set_high_frequency_mode(True)
        self.assertTrue(state.high_frequency_mode)
        self.assertEqual(
            before,
            (
                state.application_target_frame_rate,
                state.requested_surface_frame_rate,
                state.applied_surface_frame_rate,
            ),
        )

    def test_gameplay_awake_selects_standard_frame_rate_when_disabled(self) -> None:
        state = FrameRateControlState()
        state.refresh_rate_init(60, 1)
        selected = state.initialize_gameplay_frame_rate()
        self.assertEqual(state.application_target_frame_rate, 60)
        self.assertEqual(selected, 60.0)
        self.assertEqual(state.requested_surface_frame_rate, 60.0)

    def test_gameplay_awake_selects_high_frequency_frame_rate_when_enabled(self) -> None:
        state = FrameRateControlState(high_frequency_mode=True)
        state.refresh_rate_init(60, 1)
        selected = state.initialize_gameplay_frame_rate()
        self.assertEqual(state.application_target_frame_rate, 120)
        self.assertEqual(selected, 120.0)
        self.assertEqual(state.requested_surface_frame_rate, 120.0)

    def test_gameplay_target_keeps_higher_display_surface_request(self) -> None:
        state = FrameRateControlState(high_frequency_mode=True)
        state.refresh_rate_init(144, 1)
        selected = state.initialize_gameplay_frame_rate()
        self.assertEqual(state.application_target_frame_rate, 120)
        self.assertEqual(selected, 144.0)
        self.assertEqual(state.requested_surface_frame_rate, 144.0)

    def test_advanced_note_strip_has_recovered_vertex_and_segment_counts(self) -> None:
        mesh = build_advanced_note_strip((0.0, 0.0), (2.0, 0.0), (4.0, 10.0), (8.0, 10.0))
        self.assertEqual(len(mesh.vertices), 42)
        self.assertEqual(len(mesh.triangles), 120)
        self.assertEqual(mesh.vertices[0], (0.0, 0.0, 0.0))
        self.assertEqual(mesh.vertices[1], (2.0, 0.0, 0.0))
        self.assertEqual(mesh.vertices[40], (4.0, 10.0, 0.0))
        self.assertEqual(mesh.vertices[41], (8.0, 10.0, 0.0))

    def test_advanced_note_strip_uses_two_over_forty_interpolation(self) -> None:
        mesh = build_advanced_note_strip((0.0, 0.0), (2.0, 0.0), (4.0, 10.0), (8.0, 10.0))
        self.assertEqual(mesh.vertices[2], (0.2, 0.5, 0.0))
        self.assertEqual(mesh.vertices[3], (2.3, 0.5, 0.0))
        self.assertEqual(mesh.vertices[20], (2.0, 5.0, 0.0))

    def test_note_strip_uvs_match_base_and_advanced_pair_layouts(self) -> None:
        base_uvs = build_note_strip_uvs(11)
        advanced_uvs = build_note_strip_uvs(21)
        self.assertEqual(len(base_uvs), 22)
        self.assertEqual(base_uvs[:4], ((0.0, 0.0), (1.0, 0.0), (0.0, 0.1), (1.0, 0.1)))
        self.assertEqual(base_uvs[-2:], ((0.0, 1.0), (1.0, 1.0)))
        self.assertEqual(len(advanced_uvs), 42)
        self.assertEqual(advanced_uvs[2], (0.0, 0.05))
        self.assertEqual(advanced_uvs[-1], (1.0, 1.0))

    def test_note_mesh_colors_use_line_brightness_as_alpha(self) -> None:
        colors = build_note_mesh_colors(42, 65)
        self.assertEqual(len(colors), 42)
        self.assertEqual(set(colors), {(1.0, 1.0, 1.0, 0.65)})

    def test_setup_mesh_color_replaces_rgb_and_preserves_initialized_alpha(self) -> None:
        colors = build_note_mesh_colors(2, 65)
        updated = setup_note_mesh_color(colors, (0.2, 0.4, 0.6, 0.1))
        self.assertEqual(updated, ((0.2, 0.4, 0.6, 0.65),) * 2)

    def test_note_mesh_lifecycle_matches_state_renderer_and_transform_writes(self) -> None:
        deactive = NoteMeshRuntimeState(local_position=(50.0, 50.0, 7.0))
        self.assertFalse(note_mesh_should_update(deactive))
        active = activate_note_mesh(deactive)
        self.assertTrue(note_mesh_should_update(active))
        self.assertEqual(active.local_position, (0.0, 0.0, 7.0))
        self.assertEqual(active.local_scale, (1.0, 1.0, 1.0))
        self.assertTrue(active.has_front_note_ref)
        self.assertTrue(active.has_after_note_ref)
        reset = deactivate_note_mesh(active)
        self.assertFalse(note_mesh_should_update(reset))
        self.assertEqual(reset.local_position, (50.0, 50.0, 7.0))
        self.assertFalse(reset.has_front_note_ref)
        self.assertFalse(reset.has_after_note_ref)
        hidden = hide_note_mesh_renderer(active)
        self.assertEqual(hidden.state, "active")
        self.assertFalse(hidden.renderer_enabled)
        self.assertTrue(hidden.has_front_note_ref)
        self.assertTrue(hidden.has_after_note_ref)

    def test_get_sudden_pos_matches_zero_nonzero_and_clamped_routes(self) -> None:
        self.assertEqual(get_sudden_pos(0.25, 0, 10.0, 2.0), 10.0)
        self.assertEqual(get_sudden_pos(0.25, 50, 10.0, 2.0), 5.0)
        self.assertEqual(get_sudden_pos(2.0, 50, 10.0, 2.0), 2.0)

    def test_long_and_slide_render_notes_expose_advanced_mesh(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("long", 120, 2, "long", 240, width=2)],
        )
        self.advance(runtime, 0.5)
        render_note = runtime.render.notes["long"]
        self.assertIsNotNone(render_note.mesh)
        self.assertEqual(len(render_note.mesh.vertices), 42)

    def test_note_mesh_material_bindings_match_recovered_resources(self) -> None:
        long_binding = NOTE_MESH_MATERIAL_BINDINGS["long"]
        self.assertEqual(
            long_binding.material_resource_path,
            "Materials/BMS/longNoteBelt",
        )
        self.assertEqual(long_binding.texture_resource_name, "longNoteLine")
        self.assertEqual(
            note_mesh_material_binding("slide"),
            long_binding,
        )
        slide_binding = note_mesh_material_binding("slide", is_curved=True)
        self.assertIsNotNone(slide_binding)
        self.assertEqual(
            slide_binding.material_resource_path,
            "Materials/BMS/curveSlideNoteBelt",
        )
        self.assertEqual(slide_binding.texture_resource_name, "longNoteLine2")
        self.assertIsNone(note_mesh_material_binding("tap"))

    def test_note_mesh_texture_profiles_match_original_bundle_evidence(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name("note_mesh_texture_profiles.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(set(NOTE_MESH_TEXTURE_PROFILES), set(evidence["profiles"]))
        self.assertEqual(NOTE_MESH_TEXTURE_SETTINGS.filter_mode, "Bilinear")
        self.assertEqual(NOTE_MESH_TEXTURE_SETTINGS.wrap_u, "Clamp")
        self.assertEqual(NOTE_MESH_TEXTURE_SETTINGS.wrap_v, "Clamp")
        self.assertEqual(NOTE_MESH_TEXTURE_SETTINGS.wrap_w, "Clamp")
        self.assertEqual(NOTE_MESH_TEXTURE_SETTINGS.color_space, "sRGB")
        self.assertEqual(NOTE_MESH_TEXTURE_SETTINGS.mip_count, 1)
        self.assertFalse(NOTE_MESH_TEXTURE_SETTINGS.readable)
        self.assertFalse(NOTE_MESH_TEXTURE_SETTINGS.streaming_mipmaps)
        for skin, recorded in evidence["profiles"].items():
            self.assertEqual(
                set(NOTE_MESH_TEXTURE_PROFILES[skin]),
                set(recorded["textures"]),
            )
            for resource_name, texture in recorded["textures"].items():
                profile = note_mesh_texture_profile(
                    f"ingameskin/noteskin/{skin}",
                    resource_name,
                )
                self.assertEqual(profile.bundle_name, f"ingameskin/noteskin/{skin}")
                self.assertEqual((profile.width, profile.height), (146, 205))
                self.assertEqual(profile.path_id, texture["path_id"])
                self.assertEqual(profile.catalog_hash, recorded["catalog_hash"])
                self.assertEqual(profile.bundle_size, recorded["bundle_size"])
                self.assertEqual(profile.bestdori_png_size, texture["bestdori_png_size"])
                self.assertEqual(
                    profile.bestdori_png_sha256,
                    texture["bestdori_png_sha256"],
                )
                self.assertEqual(profile.rgba_sha256, texture["rgba_sha256"])
                self.assertIs(profile.settings, NOTE_MESH_TEXTURE_SETTINGS)

    def test_note_mesh_texture_profiles_reject_unrecovered_inputs(self) -> None:
        with self.assertRaisesRegex(ValueError, "unrecovered note-skin texture"):
            note_mesh_texture_profile("ingameskin/noteskin/skin00", "longNoteLine")
        with self.assertRaisesRegex(ValueError, "unrecovered note-skin texture"):
            note_mesh_texture_profile("ingameskin/noteskin/skin01", "unknown")

    def test_generic_note_mesh_sampler_clamps_filters_and_decodes_srgb(self) -> None:
        texels = {
            (0, 0): (1.0, 0.0, 0.0, 0.0),
            (1, 0): (0.0, 1.0, 0.0, 0.25),
            (0, 1): (0.0, 0.0, 1.0, 0.75),
            (1, 1): (1.0, 1.0, 1.0, 1.0),
        }
        center = sample_bilinear_clamp_srgb(
            lambda x, y: texels[(x, y)],
            2,
            2,
            0.5,
            0.5,
            NOTE_MESH_TEXTURE_SETTINGS,
        )
        self.assertEqual(center, (0.5, 0.5, 0.5, 0.5))
        self.assertEqual(
            sample_bilinear_clamp_srgb(
                lambda x, y: texels[(x, y)],
                2,
                2,
                -10.0,
                10.0,
                NOTE_MESH_TEXTURE_SETTINGS,
            ),
            (1.0, 0.0, 0.0, 0.0),
        )
        profile = NOTE_MESH_TEXTURE_PROFILES["skin01"]["longNoteLine"]
        with self.assertRaisesRegex(ValueError, "decoded texture has"):
            note_mesh_texture_sample(profile, b"", 0.5, 0.5)

    def test_runtime_selects_shared_material_from_curved_flag(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec("straight", 120, 2, "slide", 240),
                NoteSpec("curved", 120, 4, "slide", 240, is_curved=True),
            ],
        )
        self.advance(runtime, 0.5)
        straight_mesh = runtime.render.slide_segments["straight:segment:0"].mesh
        curved_mesh = runtime.render.slide_segments["curved:segment:0"].mesh
        self.assertIsNone(runtime.render.notes["straight"].mesh)
        self.assertIsNone(runtime.render.notes["curved"].mesh)
        self.assertEqual(
            straight_mesh.material_id,
            "resources:Materials/BMS/longNoteBelt",
        )
        self.assertEqual(
            curved_mesh.material_id,
            "resources:Materials/BMS/curveSlideNoteBelt",
        )
        self.assertEqual(
            curved_mesh.material_binding.renderer_property,
            "MeshRenderer.sharedMaterial",
        )

    def test_runtime_exposes_selected_note_skin_texture_profiles(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec("long-texture", 120, 2, "long", 240),
                NoteSpec("curve-texture", 120, 4, "slide", 240, is_curved=True),
            ],
            render_projection=RenderProjectionConfig(
                note_skin_bundle="ingameskin/noteskin/skin03"
            ),
        )
        self.advance(runtime, 0.5)
        long_profile = runtime.render.notes["long-texture"].mesh.texture_profile
        curve_profile = runtime.render.slide_segments[
            "curve-texture:segment:0"
        ].mesh.texture_profile
        self.assertIs(long_profile, NOTE_MESH_TEXTURE_PROFILES["skin03"]["longNoteLine"])
        self.assertIs(
            curve_profile,
            NOTE_MESH_TEXTURE_PROFILES["skin03"]["longNoteLine2"],
        )

    def test_slide_mesh_is_split_across_head_intermediates_and_tail(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "segmented",
                    120,
                    1,
                    "slide",
                    360,
                    width=1,
                    intermediate_positions=(180, 240),
                    intermediate_lanes=(3, 5),
                    intermediate_widths=(2, 1),
                    end_lane=2,
                    end_width=3,
                    is_curved=True,
                )
            ],
            render_projection=RenderProjectionConfig(
                specific_speed=8.0,
                perspective_scale_enabled=False,
            ),
        )
        self.advance(runtime, 0.5)
        self.assertIsNone(runtime.render.notes["segmented"].mesh)
        self.assertEqual(
            list(runtime.render.slide_segments),
            [
                "segmented:segment:0",
                "segmented:segment:1",
                "segmented:segment:2",
            ],
        )
        first = runtime.render.slide_segments["segmented:segment:0"]
        middle = runtime.render.slide_segments["segmented:segment:1"]
        final = runtime.render.slide_segments["segmented:segment:2"]
        self.assertEqual(
            (first.front_node_id, first.after_node_id),
            ("segmented:head", "segmented:intermediate:0"),
        )
        self.assertEqual(
            (middle.front_node_id, middle.after_node_id),
            ("segmented:intermediate:0", "segmented:intermediate:1"),
        )
        self.assertEqual(
            (final.front_node_id, final.after_node_id),
            ("segmented:intermediate:1", "segmented:tail"),
        )
        self.assertEqual(
            (first.front_width, first.after_width),
            (1, 2),
        )
        self.assertEqual(
            (final.front_width, final.after_width),
            (1, 3),
        )
        first_after_center = (
            first.mesh.vertices[-2][0] + first.mesh.vertices[-1][0]
        ) / 2
        middle_front_center = (
            middle.mesh.vertices[0][0] + middle.mesh.vertices[1][0]
        ) / 2
        self.assertAlmostEqual(first_after_center, middle_front_center)
        self.assertEqual(
            final.mesh.material_id,
            "resources:Materials/BMS/curveSlideNoteBelt",
        )

    def test_slide_move_state_matches_real_line_overline_and_kill_gates(self) -> None:
        moving = evaluate_slide_move_state(
            1.0,
            0.0,
            0.0,
            0.0,
            True,
            "stop",
            0,
        )
        self.assertTrue(moving.is_real_line)
        self.assertFalse(moving.is_progress_over_line)
        self.assertEqual(moving.note_state, "move")
        over = evaluate_slide_move_state(
            1.01,
            -0.01,
            0.0,
            0.0,
            True,
            "stop",
            0,
        )
        self.assertTrue(over.is_progress_over_line)
        self.assertTrue(over.is_over_line)
        self.assertTrue(over.kill_mesh)
        self.assertTrue(over.snap_to_visual_target)
        self.assertEqual(over.note_state, "stop")
        tail_without_adjustment = evaluate_slide_move_state(
            1.01,
            -0.01,
            0.0,
            0.0,
            False,
            "move",
            0,
        )
        self.assertFalse(tail_without_adjustment.is_real_line)
        self.assertFalse(tail_without_adjustment.snap_to_visual_target)
        self.assertTrue(tail_without_adjustment.kill_mesh)
        self.assertTrue(
            evaluate_slide_move_state(
                1.01,
                -0.01,
                0.0,
                0.0,
                False,
                "move",
                1,
            ).snap_to_visual_target
        )

    def test_slide_stop_state_skips_invisible_and_stopped_after_nodes(self) -> None:
        moving = evaluate_slide_stop_state(
            0,
            ("stop", "stop", "wait", "move"),
            (False, True, False, False),
        )
        self.assertEqual(moving.visible_after_index, 2)
        self.assertEqual(moving.movable_after_index, 2)
        self.assertEqual(moving.action, "move_to_after")
        self.assertTrue(moving.rebind_visual_target)
        waiting_deactive = evaluate_slide_stop_state(
            0,
            ("stop", "stop", "move"),
            (False, False, False),
        )
        self.assertEqual(waiting_deactive.visible_after_index, 1)
        self.assertEqual(waiting_deactive.movable_after_index, 2)
        self.assertEqual(waiting_deactive.action, "waiting_deactive")
        self.assertTrue(waiting_deactive.hide_sprite)
        self.assertTrue(waiting_deactive.kill_after_mesh)
        self.assertEqual(
            evaluate_slide_stop_state(
                0,
                ("stop",),
                (False,),
            ).action,
            "wait_for_miss",
        )
        self.assertAlmostEqual(
            move_to_next_after_note_x(1.0, 1.0, 5.0, 0.25, 1.0),
            2.0,
        )
        self.assertEqual(
            move_to_next_after_note_x(4.5, 5.0, 1.0, 1.0, 1.0),
            1.0,
        )

    def test_slide_node_crossing_exposes_stop_flags_and_kills_preceding_mesh(self) -> None:
        projection = RenderProjectionConfig(specific_speed=8.0)
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "crossing",
                    120,
                    1,
                    "slide",
                    300,
                    intermediate_positions=(180,),
                    intermediate_lanes=(3,),
                )
            ],
            render_projection=projection,
        )
        self.advance(runtime, 1.0)
        self.assertEqual(runtime.touch_began(1, 1), "crossing")
        self.advance(runtime, 0.51)
        node = runtime.render.slide_nodes["crossing:intermediate:0"]
        self.assertGreater(node.progress, 1.0)
        self.assertEqual(node.state, "stop")
        self.assertTrue(node.exist_after_note)
        self.assertTrue(node.is_real_line)
        self.assertTrue(node.is_progress_over_line)
        self.assertTrue(node.is_over_line)
        self.assertTrue(node.kill_mesh)
        self.assertEqual(node.stop_action, "move_to_after")
        self.assertEqual(node.visible_after_node_id, "crossing:tail")
        self.assertEqual(node.movable_after_node_id, "crossing:tail")
        self.assertGreater(node.position[0], projection.button_center_x(1))
        self.assertLess(node.position[0], projection.button_center_x(3))
        self.assertEqual(node.position[1], projection.goal_y)
        self.assertNotIn("crossing:segment:0", runtime.render.slide_segments)
        self.assertIn("crossing:segment:1", runtime.render.slide_segments)
        self.assertFalse(
            runtime.render.mesh_states["crossing:segment:0"].renderer_enabled
        )

    def test_stopped_visible_after_emits_after_slower_and_hides_following_mesh(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "stop-chain",
                    120,
                    1,
                    "slide",
                    300,
                    intermediate_positions=(180, 184),
                    intermediate_lanes=(2, 4),
                )
            ],
            render_projection=RenderProjectionConfig(specific_speed=8.0),
        )
        self.advance(runtime, 1.0)
        self.assertEqual(runtime.touch_began(1, 1), "stop-chain")
        self.advance(runtime, 0.55)
        intermediate = [event for event in runtime.events if event.phase == "intermediate"]
        self.assertEqual(len(intermediate), 1)
        self.assertEqual(intermediate[0].slide_miss_code, 3)
        self.assertEqual(intermediate[0].slide_miss_type, "after_slower")
        self.assertNotIn("stop-chain:intermediate:0", runtime.render.slide_nodes)
        self.assertNotIn("stop-chain:segment:1", runtime.render.slide_segments)
        self.assertIn("stop-chain:segment:2", runtime.render.slide_segments)

    def test_slide_after_miss_types_share_damage_and_preserve_reason(self) -> None:
        for miss_code, miss_name in (
            (3, "after_slower"),
            (4, "after_through"),
            (5, "after_force"),
            (6, "after_through_flick"),
        ):
            with self.subTest(miss_code=miss_code):
                runtime = RuntimeIntegration(
                    TempoMap([TempoChange(0, 120)]),
                    [
                        NoteSpec(
                            "miss-type",
                            120,
                            1,
                            "slide",
                            300,
                            intermediate_positions=(180,),
                        )
                    ],
                )
                self.assertEqual(slide_after_miss_type(miss_code), miss_name)
                self.assertTrue(runtime.apply_slide_after_miss("miss-type", 180, miss_code))
                event = runtime.events[-1]
                self.assertEqual(event.slide_miss_type, miss_name)
                self.assertEqual(event.slide_miss_code, miss_code)
                self.assertEqual(runtime.hud.life, 980)

    def test_slide_after_miss_callback_does_not_submit_twice(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "single-miss",
                    120,
                    1,
                    "slide",
                    300,
                    intermediate_positions=(180,),
                )
            ],
        )
        self.assertTrue(runtime.apply_slide_after_miss("single-miss", 180, 4))
        self.assertFalse(runtime.apply_slide_after_miss("single-miss", 180, 5))
        judge_events = [event for event in runtime.events if event.kind == "judge"]
        self.assertEqual(len(judge_events), 1)
        self.assertEqual(runtime.hud.life, 980)

    def test_slide_root_deactivate_releases_waiting_after_node(self) -> None:
        state = SlideAfterLifecycleState(
            mesh_state=NoteMeshRuntimeState(
                state="active",
                renderer_enabled=False,
                local_position=(2.0, 3.0, 4.0),
                local_scale=(1.0, 1.0, 1.0),
                has_front_note_ref=True,
                has_after_note_ref=True,
            ),
            local_position=(2.0, 3.0, 7.0),
        )
        released = deactivate_slide_after_node(state)
        self.assertEqual(released.state, "deactive")
        self.assertFalse(released.sprite_renderer_enabled)
        self.assertEqual(released.mesh_state.state, "deactive")
        self.assertFalse(released.mesh_state.renderer_enabled)
        self.assertFalse(released.has_root_note_ref)
        self.assertFalse(released.has_front_note_ref)
        self.assertFalse(released.has_after_note_ref)
        self.assertEqual(released.local_position, (50.0, 50.0, 7.0))

    def test_sync_line_geometry_applies_margin_type_and_width_rules(self) -> None:
        line = build_sync_line_geometry(
            ("left", "right"),
            (0.0, 2.0),
            (10.0, 2.0),
            2.0,
            3.0,
            1.0,
            game_note_type_a=0,
            game_note_type_b=10,
            shader_threshold=4.0,
        )
        self.assertEqual(line.positions[0], (2.0, 2.0, 0.0))
        self.assertEqual(line.positions[1], (10.0, 2.0, 0.0))
        self.assertAlmostEqual(line.width, 0.56)
        self.assertEqual(sync_line_edge_margin(1.0, 19), 0.0)
        self.assertEqual(sync_line_edge_margin(1.0, 20), 1.0)
        self.assertEqual(line.shader_parameters, {"_Threshold": 4.0})
        self.assertIsNone(line.texture_profile)

    def test_sync_line_prefab_defaults_match_integrated_geometry(self) -> None:
        evidence = json.loads(
            Path(__file__)
            .with_name("sync_note_line_prefab_defaults.json")
            .read_text(encoding="utf-8")
        )
        line = build_sync_line_geometry(
            ("left", "right"),
            (0.0, 0.0),
            (1.0, 0.0),
            1.0,
            1.0,
            0.0,
        )
        serialized = evidence["line_renderer"]
        self.assertEqual(
            evidence["source"]["zip_entry"],
            "assets/bin/Data/c2d3a5135fefe421b9894cd5dee91284",
        )
        self.assertEqual(line.position_count, serialized["position_count"])
        self.assertEqual(line.use_world_space, serialized["use_world_space"])
        self.assertEqual(line.loop, serialized["loop"])
        self.assertEqual(line.width_multiplier, serialized["width_multiplier"])
        self.assertEqual(
            line.serialized_width_curve,
            tuple((key["time"], key["value"]) for key in serialized["width_curve"]),
        )
        self.assertEqual(
            line.serialized_color_gradient,
            tuple(tuple(key) for key in serialized["color_keys"]),
        )
        self.assertEqual(line.num_corner_vertices, serialized["num_corner_vertices"])
        self.assertEqual(line.num_cap_vertices, serialized["num_cap_vertices"])
        self.assertEqual(line.alignment, serialized["alignment"])
        self.assertEqual(line.alignment_name, serialized["alignment_name"])
        self.assertEqual(line.texture_mode, serialized["texture_mode"])
        self.assertEqual(line.texture_mode_name, serialized["texture_mode_name"])
        self.assertEqual(line.texture_scale, tuple(serialized["texture_scale"]))
        self.assertEqual(line.cast_shadows, serialized["cast_shadows"])
        self.assertEqual(line.receive_shadows, serialized["receive_shadows"])
        self.assertEqual(line.motion_vectors, serialized["motion_vectors"])
        self.assertEqual(line.light_probe_usage, serialized["light_probe_usage"])
        self.assertEqual(
            line.reflection_probe_usage,
            serialized["reflection_probe_usage"],
        )
        self.assertEqual(
            line.rendering_layer_mask,
            serialized["rendering_layer_mask"],
        )
        self.assertEqual(
            line.generate_lighting_data,
            serialized["generate_lighting_data"],
        )
        self.assertEqual(line.mask_interaction, serialized["mask_interaction"])
        self.assertEqual(
            line.apply_active_color_space,
            serialized["apply_active_color_space"],
        )
        self.assertEqual(line.sorting_order, 69)

    def test_sync_line_texture_profiles_match_original_bundle_evidence(self) -> None:
        evidence = json.loads(
            Path(__file__).with_name("sync_note_line_texture_profiles.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(set(SYNC_LINE_TEXTURE_PROFILES), set(evidence["profiles"]))
        manifest = json.loads(
            Path(__file__).with_name("resource_manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["version"], 70)
        self.assertEqual(
            manifest["external_texture_profiles"]["sync_note_line"]["source"],
            "sync_note_line_texture_profiles.json",
        )
        self.assertEqual(evidence["runtime_load_chain"]["owner_rva"], "0x3775ACC")
        self.assertEqual(evidence["runtime_load_chain"]["got_slot"], "0x6CC5230")
        self.assertEqual(
            evidence["runtime_load_chain"]["destination_field_offset"],
            "0x40",
        )
        common_texture = evidence["common_texture"]
        common_sprite = evidence["common_sprite"]
        for skin, recorded in evidence["profiles"].items():
            profile = sync_line_texture_profile(f"ingameskin/noteskin/{skin}")
            self.assertEqual(profile.resource_name, "simultaneous_line")
            self.assertEqual(profile.sprite_path_id, recorded["sprite_path_id"])
            self.assertEqual(profile.texture_path_id, recorded["texture_path_id"])
            self.assertEqual((profile.width, profile.height), (10, 27))
            self.assertEqual(profile.border, tuple(common_sprite["border"]))
            self.assertEqual(profile.pixels_to_units, 66.0)
            self.assertEqual(profile.pivot, (0.5, 0.5))
            self.assertEqual(profile.extrude, 1)
            self.assertEqual(profile.catalog_hash, recorded["catalog_hash"])
            self.assertEqual(profile.bundle_size, recorded["bundle_size"])
            self.assertEqual(profile.rgba_sha256, common_texture["rgba_sha256"])
            self.assertIs(profile.settings, NOTE_MESH_TEXTURE_SETTINGS)
        comparison = evidence["bestdori_comparison"]
        self.assertEqual(comparison["different_pixels_from_original"], 20)
        self.assertEqual(comparison["alpha_differences"], 0)
        self.assertEqual(comparison["visible_pixel_differences"], 0)
        self.assertFalse(comparison["sampler_equivalent"])

    def test_sync_line_texture_profile_rejects_unrecovered_skin(self) -> None:
        with self.assertRaisesRegex(ValueError, "unrecovered sync-line texture"):
            sync_line_texture_profile("ingameskin/noteskin/skin00")

    def test_sync_line_texture_sampler_uses_confirmed_contract(self) -> None:
        profile = SYNC_LINE_TEXTURE_PROFILES["skin01"]
        solid_red = bytes((255, 0, 0, 255)) * (profile.width * profile.height)
        self.assertEqual(
            sync_line_texture_sample(profile, solid_red, -1.0, 2.0),
            (1.0, 0.0, 0.0, 1.0),
        )
        with self.assertRaisesRegex(ValueError, "decoded sync-line texture has"):
            sync_line_texture_sample(profile, b"", 0.5, 0.5)

    def test_runtime_exposes_confirmed_sync_line_renderer_state(self) -> None:
        projection = RenderProjectionConfig(
            local_scale_x=1.0,
            perspective_scale_enabled=False,
            launch_distance_rate=0.25,
            sudden_rate=50,
            sudden_top_y=10.0,
            sudden_bottom_y=2.0,
            note_skin_bundle="ingameskin/noteskin/skin05",
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "sync-left",
                    120,
                    1,
                    sync_target_id="sync-right",
                    sync_edge_margin=0.5,
                    game_note_type=0,
                ),
                NoteSpec("sync-right", 120, 5, game_note_type=0),
            ],
            render_projection=projection,
        )
        self.advance(runtime, 0.5)
        line = runtime.render.sync_lines["sync-left|sync-right"]
        left_x = calc_note_position(
            (projection.button_center_x(1), projection.goal_y),
            (projection.note_start_x(1), projection.note_start_position_y()),
            0.5,
        )[0]
        right_x = calc_note_position(
            (projection.button_center_x(5), projection.goal_y),
            (projection.note_start_x(5), projection.note_start_position_y()),
            0.5,
        )[0]
        self.assertAlmostEqual(line.positions[0][0], left_x + 0.5)
        self.assertAlmostEqual(line.positions[1][0], right_x - 0.5)
        self.assertEqual(line.width, 0.28)
        self.assertEqual(line.material_id, "resources:Materials/BMS/SyncNoteLine")
        self.assertEqual(line.sorting_order, 69)
        self.assertEqual(line.shader_parameters, {"_Threshold": 5.0})
        self.assertIs(
            line.texture_profile,
            SYNC_LINE_TEXTURE_PROFILES["skin05"],
        )
        self.advance(runtime, 0.5)
        self.assertEqual(runtime.touch_began(1, 1), "sync-left")
        runtime.update(FRAME_SECONDS)
        self.assertEqual(runtime.render.sync_lines, {})

    def test_runtime_renders_long_end_to_front_sync_connection(self) -> None:
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord(
                            "render-long",
                            1,
                            1,
                            120,
                            after_note_type=0,
                            after_note_absolute_pos=240,
                        ),
                    ),
                ),
                NoteBatchInformationRecord(
                    0,
                    2,
                    1,
                    240,
                    (NoteInformationRecord("render-peer", 5, 0, 240),),
                ),
            )
        )
        runtime = RuntimeIntegration(TempoMap([TempoChange(0, 120)]), specs)
        self.advance(runtime, 1.0)
        line = runtime.render.sync_lines["render-long:end|render-peer"]
        self.assertEqual(
            line.target_note_ids,
            ("render-long:end", "render-peer"),
        )
        progress = 1.0 - signed_seconds_between_positions(
            runtime.engine.tempo_map,
            runtime.engine.clock.music_position,
            240,
        ) / note_arrival_seconds(runtime.render_projection.specific_speed)
        self.assertAlmostEqual(
            line.positions[0][0],
            calc_note_position(
                (
                    runtime.render_projection.button_center_x(1),
                    runtime.render_projection.goal_y,
                ),
                (
                    runtime.render_projection.note_start_x(1),
                    runtime.render_projection.note_start_position_y(),
                ),
                progress,
            )[0],
        )
        self.assertAlmostEqual(
            line.positions[1][0],
            calc_note_position(
                (
                    runtime.render_projection.button_center_x(5),
                    runtime.render_projection.goal_y,
                ),
                (
                    runtime.render_projection.note_start_x(5),
                    runtime.render_projection.note_start_position_y(),
                ),
                progress,
            )[0],
        )

    def test_runtime_renders_slide_far_side_sync_endpoint(self) -> None:
        terminal = NoteInformationRecord("render-slide-terminal", 4, 14, 240)
        specs = note_specs_from_information_batches(
            (
                NoteBatchInformationRecord(
                    0,
                    1,
                    1,
                    120,
                    (
                        NoteInformationRecord(
                            "render-slide",
                            4,
                            4,
                            120,
                            after_note_type=11,
                            is_slide_note_head=True,
                            slide_note_list=(terminal,),
                        ),
                        terminal,
                        NoteInformationRecord(
                            "render-slide-side-near", 3, 20, 240
                        ),
                        NoteInformationRecord(
                            "render-slide-side-far", 2, 20, 240
                        ),
                    ),
                ),
                NoteBatchInformationRecord(
                    0,
                    2,
                    1,
                    240,
                    (NoteInformationRecord("render-slide-peer", 6, 0, 240),),
                ),
            )
        )
        runtime = RuntimeIntegration(TempoMap([TempoChange(0, 120)]), specs)
        self.advance(runtime, 1.0)
        line = runtime.render.sync_lines[
            "render-slide-peer|render-slide-side-far"
        ]
        self.assertEqual(
            line.target_note_ids,
            ("render-slide-side-far", "render-slide-peer"),
        )
        progress = runtime.render.slide_tails["render-slide"].progress
        self.assertAlmostEqual(
            line.positions[0][0],
            calc_note_position(
                (
                    runtime.render_projection.button_center_x(2),
                    runtime.render_projection.goal_y,
                ),
                (
                    runtime.render_projection.note_start_x(2),
                    runtime.render_projection.note_start_position_y(),
                ),
                progress,
            )[0],
        )
        self.assertAlmostEqual(
            line.positions[1][0],
            calc_note_position(
                (
                    runtime.render_projection.button_center_x(6),
                    runtime.render_projection.goal_y,
                ),
                (
                    runtime.render_projection.note_start_x(6),
                    runtime.render_projection.note_start_position_y(),
                ),
                progress,
            )[0],
        )

    def test_multiple_flick_back_line_selects_side_and_sorts_endpoints(self) -> None:
        line = build_multiple_flick_back_line_geometry(
            ("right-position", "left-position"),
            (5.0, 2.0),
            (1.0, 3.0),
            2.0,
            game_note_type_a=11,
            shader_threshold=4.0,
        )
        self.assertEqual(
            line.positions,
            ((1.0, 3.0, 0.0), (5.0, 2.0, 0.0)),
        )
        self.assertEqual(line.width, 1.5)
        self.assertEqual(line.side, "right")
        self.assertEqual(
            line.mesh.uvs,
            ((0.0, 0.0), (0.0, 1.0), (1.0, 0.0), (1.0, 1.0)),
        )
        self.assertEqual(line.mesh.triangles, (0, 2, 1, 1, 2, 3))
        self.assertEqual(len(line.mesh.vertices), 4)
        with self.assertRaises(ValueError):
            build_multiple_flick_back_line_textured_quad(
                line,
                view_direction=(0.0, 0.0, 0.0),
            )
        self.assertEqual(
            line.material_binding,
            MULTIPLE_FLICK_BACK_LINE_BINDINGS["right"],
        )
        for game_note_type in (10, 14, 16, 18, 20, 22):
            self.assertEqual(multiple_flick_back_line_side(game_note_type), "left")
        for game_note_type in (11, 15, 17, 19, 21, 23):
            self.assertEqual(multiple_flick_back_line_side(game_note_type), "right")
        self.assertEqual(multiple_flick_back_line_side(None, 4), "left")
        self.assertEqual(multiple_flick_back_line_side(None, 12), "right")

    def test_back_line_stretch_view_quad_has_canonical_uv_and_width(self) -> None:
        line = build_multiple_flick_back_line_geometry(
            ("start", "end"),
            (0.0, 0.0),
            (2.0, 0.0),
            2.0,
            game_note_type_a=10,
            shader_threshold=5.0,
            texture_bundle_name=(
                "ingameskin/noteskin/directionalflickskin00"
            ),
        )
        self.assertEqual(line.width, 1.5)
        self.assertEqual(
            line.mesh.vertices,
            (
                (0.0, -0.75, 0.0),
                (0.0, 0.75, 0.0),
                (2.0, -0.75, 0.0),
                (2.0, 0.75, 0.0),
            ),
        )
        self.assertEqual(
            line.mesh.uvs,
            ((0.0, 0.0), (0.0, 1.0), (1.0, 0.0), (1.0, 1.0)),
        )
        self.assertEqual(line.mesh.material_binding, line.material_binding)
        self.assertEqual(line.mesh.shader_parameters, {"_Threshold": 5.0})

    def test_runtime_exposes_multiple_flick_back_line_lifecycle(self) -> None:
        projection = RenderProjectionConfig(
            local_scale_x=1.0,
            perspective_scale_enabled=False,
            launch_distance_rate=0.25,
            sudden_rate=50,
            sudden_top_y=10.0,
            sudden_bottom_y=2.0,
            directional_flick_skin_bundle=(
                "ingameskin/noteskin/directionalflickskin00"
            ),
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "multiple-left",
                    120,
                    5,
                    game_note_type=10,
                    flick_back_line_target_id="multiple-peer",
                ),
                NoteSpec("multiple-peer", 120, 1, game_note_type=11),
            ],
            render_projection=projection,
        )
        self.advance(runtime, 0.5)
        line = runtime.render.flick_back_lines["multiple-left|multiple-peer"]
        expected_x = sorted(
            calc_note_position(
                (projection.button_center_x(lane), projection.goal_y),
                (projection.note_start_x(lane), projection.note_start_position_y()),
                0.5,
            )[0]
            for lane in (1, 5)
        )
        self.assertAlmostEqual(line.positions[0][0], expected_x[0])
        self.assertAlmostEqual(line.positions[1][0], expected_x[1])
        self.assertEqual(line.width, 0.75)
        self.assertEqual(line.side, "left")
        self.assertEqual(
            line.texture_profile.bundle_name,
            "ingameskin/noteskin/directionalflickskin00",
        )
        self.assertEqual(
            line.material_id,
            "resources:Materials/BMS/MultipleDirectionalFlickNoteLineLeft",
        )
        self.assertEqual(line.shader_parameters, {"_Threshold": 5.0})
        self.advance(runtime, 0.5)
        self.assertEqual(runtime.touch_began(1, 5), "multiple-left")
        runtime.update(FRAME_SECONDS)
        self.assertEqual(runtime.render.flick_back_lines, {})

    def test_multiple_flick_back_line_render_snapshot_preserves_graph_z(self) -> None:
        runtime = self.make_multiple_slide_runtime()
        tail = runtime.render.slide_tails["multiple-tail"]
        source_lines = {
            f"{tail.node_id}:{line.line_id}": line
            for line in tail.side_connection_graph.back_lines
            if line.active and line.renderer_enabled and line.width > 0.0
        }
        self.assertTrue(source_lines)
        for line_id, source in source_lines.items():
            geometry = runtime.render.flick_back_lines[line_id]
            self.assertEqual(geometry.positions, source.positions)
            self.assertEqual(
                {vertex[2] for vertex in geometry.mesh.vertices},
                {point[2] for point in source.positions},
            )

    def test_runtime_mesh_exposes_uv_color_material_and_threshold(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "render-data",
                    120,
                    2,
                    "long",
                    240,
                    mesh_color=(0.2, 0.4, 0.6, 0.1),
                )
            ],
            render_projection=RenderProjectionConfig(
                long_note_line_brightness=65,
                launch_distance_rate=0.25,
                sudden_rate=50,
                sudden_top_y=10.0,
                sudden_bottom_y=2.0,
            ),
        )
        self.advance(runtime, 0.5)
        mesh = runtime.render.notes["render-data"].mesh
        self.assertIsNotNone(mesh)
        self.assertEqual(len(mesh.uvs), 42)
        self.assertEqual(set(mesh.colors), {(0.2, 0.4, 0.6, 0.65)})
        self.assertEqual(
            mesh.material_id,
            "resources:Materials/BMS/longNoteBelt",
        )
        self.assertEqual(
            mesh.material_binding,
            NOTE_MESH_MATERIAL_BINDINGS["long"],
        )
        self.assertEqual(mesh.shader_parameters, {"_Threshold": 5.0})

    def test_runtime_persists_active_then_deactive_mesh_pool_state(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("pooled", 120, 2, "long", 240)],
        )
        self.assertEqual(runtime.render.mesh_states["pooled"].state, "deactive")
        self.advance(runtime, 0.5)
        self.assertTrue(note_mesh_should_update(runtime.render.mesh_states["pooled"]))
        self.advance(runtime, 3.0)
        pooled = runtime.render.mesh_states["pooled"]
        self.assertEqual(pooled.state, "deactive")
        self.assertFalse(pooled.renderer_enabled)

    def test_mesh_width_rate_matches_recovered_type_branches(self) -> None:
        self.assertEqual(mesh_width_rate(2, False, 1.0), 1.0)
        self.assertEqual(mesh_width_rate(2, True, 0.5), 1.05)
        self.assertEqual(mesh_width_rate(3, True, -1.0), 1.05)
        self.assertEqual(mesh_width_rate(7, True, 0.5), 1.065)
        self.assertEqual(mesh_width_rate(7, True, 2.0), 1.08)
        self.assertEqual(mesh_width_rate(8, True, 1.0), 1.0)

    def test_render_mesh_applies_recovered_width_rate(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "wide",
                    120,
                    3,
                    "slide",
                    240,
                    width=2,
                    mesh_width_type=7,
                    special_mesh_width=True,
                    mesh_width_progress=1.0,
                )
            ],
            render_projection=RenderProjectionConfig(perspective_scale_enabled=False),
        )
        self.advance(runtime, 0.5)
        mesh = runtime.render.slide_segments["wide:segment:0"].mesh
        self.assertIsNotNone(mesh)
        self.assertAlmostEqual(mesh.vertices[1][0] - mesh.vertices[0][0], 2.16)

    def test_note_boundary_uses_transform_scale_width_and_safe_area_ratio(self) -> None:
        left, right = project_note_boundary((3.0, 0.25), 0.4, 2, 1.25, 1.05)
        self.assertEqual(left[1], 0.25)
        self.assertEqual(right[1], 0.25)
        self.assertAlmostEqual(left[0], 1.95)
        self.assertAlmostEqual(right[0], 4.05)

    def test_runtime_projection_config_drives_mesh_endpoint_width(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("safe", 120, 3, "long", 240, width=2)],
            render_projection=RenderProjectionConfig(
                local_scale_x=0.4,
                screen_to_safe_area_ratio=1.25,
                perspective_scale_enabled=False,
            ),
        )
        self.advance(runtime, 0.5)
        mesh = runtime.render.notes["safe"].mesh
        self.assertIsNotNone(mesh)
        self.assertAlmostEqual(mesh.vertices[1][0] - mesh.vertices[0][0], 2.0)

    def test_safe_area_ratio_keeps_explicit_compatibility_fallback(self) -> None:
        projection = RenderProjectionConfig(screen_to_safe_area_ratio=1.25)
        self.assertEqual(projection.screen_to_safe_area_ratio_value(), 1.25)
        self.assertEqual(projection.safe_area_to_screen_ratio_value(), 0.8)

    def test_full_base_screen_has_unit_safe_area_ratio(self) -> None:
        projection = RenderProjectionConfig(
            ui_screen_width=1334,
            ui_screen_height=750,
        )
        self.assertEqual(projection.screen_to_safe_area_ratio_value(), 1.0)

    def test_full_high_aspect_screen_uses_vertical_fit_ratio(self) -> None:
        projection = RenderProjectionConfig(
            ui_screen_width=1624,
            ui_screen_height=750,
        )
        self.assertAlmostEqual(
            projection.screen_to_safe_area_ratio_value(),
            STAR_UI_SCREEN_WIDTH_BASE / 1624,
        )

    def test_inset_safe_area_applies_native_screen_ratio_branch(self) -> None:
        wide = RenderProjectionConfig(
            ui_screen_width=1600,
            ui_screen_height=750,
            ui_safe_area_width=1280,
            ui_safe_area_height=675,
        )
        tall = RenderProjectionConfig(
            ui_screen_width=1200,
            ui_screen_height=750,
            ui_safe_area_width=960,
            ui_safe_area_height=675,
        )
        self.assertAlmostEqual(
            wide.screen_to_safe_area_ratio_value(),
            0.8 * STAR_UI_SCREEN_WIDTH_BASE / 1600,
        )
        self.assertAlmostEqual(tall.screen_to_safe_area_ratio_value(), 0.8)

    def test_runtime_mesh_uses_derived_safe_area_ratio(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("derived-safe", 120, 3, "long", 240, width=2)],
            render_projection=RenderProjectionConfig(
                local_scale_x=0.4,
                ui_screen_width=1624,
                ui_screen_height=750,
                perspective_scale_enabled=False,
            ),
        )
        self.advance(runtime, 0.5)
        mesh = runtime.render.notes["derived-safe"].mesh
        self.assertIsNotNone(mesh)
        self.assertAlmostEqual(
            mesh.vertices[1][0] - mesh.vertices[0][0],
            1.6 * STAR_UI_SCREEN_WIDTH_BASE / 1624,
        )

    def test_note_arrival_seconds_matches_recovered_piecewise_mapping(self) -> None:
        self.assertEqual(note_arrival_seconds(1.0), 5.5)
        self.assertEqual(note_arrival_seconds(10.0), 1.0)
        self.assertAlmostEqual(note_arrival_seconds(11.01), 0.495)
        self.assertEqual(note_arrival_seconds(12.0), 0.4)

    def test_calc_progress_rate_matches_initial_and_incremental_paths(self) -> None:
        self.assertEqual(calc_progress_rate(0.0, 2.0, 0.25, 0.5), 0.25)
        self.assertEqual(calc_progress_rate(0.25, 2.0, 0.5, 99.0), 0.5)

    def test_seconds_between_positions_crosses_bpm_boundary(self) -> None:
        tempo_map = TempoMap([TempoChange(0, 120), TempoChange(120, 240)])
        self.assertEqual(seconds_between_positions(tempo_map, 60, 240), 1.0)
        self.assertEqual(signed_seconds_between_positions(tempo_map, 60, 240), 1.0)
        self.assertEqual(signed_seconds_between_positions(tempo_map, 240, 60), -1.0)

    def test_calc_note_position_uses_recovered_exponential_curve(self) -> None:
        start = (2.0, 1.0)
        goal = (4.0, 0.0)
        at_start = calc_note_position(goal, start, 0.0)
        at_goal = calc_note_position(goal, start, 1.0)
        curve = 1.1 ** -50
        self.assertAlmostEqual(at_start[0], 2.0 + 2.0 * curve)
        self.assertAlmostEqual(at_start[1], 1.0 - curve)
        self.assertEqual(at_goal, goal)

    def test_virtual_lane_x_applies_direction_and_distance(self) -> None:
        self.assertEqual(virtual_lane_note_x(0.25, 3.0, "none", 4), 3.0)
        self.assertEqual(virtual_lane_note_x(0.25, 3.0, "left", 4), 2.0)
        self.assertEqual(virtual_lane_note_x(0.25, 3.0, "right", 4), 4.0)

    def test_calc_note_position_uses_distinct_virtual_start_and_end_deltas(self) -> None:
        x, y = calc_note_position(
            (3.0, 0.0),
            (3.0, 1.0),
            1.0,
            "right",
            2,
            0.5,
            0.25,
        )
        self.assertEqual((x, y), (3.5, 0.0))

    def test_runtime_projects_front_and_after_virtual_lanes_independently(self) -> None:
        projection = RenderProjectionConfig(
            virtual_lane_start_delta_x=0.5,
            virtual_lane_end_delta_x=0.25,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "virtual-slide",
                    120,
                    3,
                    "slide",
                    130,
                    virtual_lane_direction="left",
                    virtual_lane_distance=1,
                    end_virtual_lane_direction="right",
                    end_virtual_lane_distance=2,
                )
            ],
            render_projection=projection,
        )
        self.advance(runtime, 0.5)
        mesh = runtime.render.slide_segments["virtual-slide:segment:0"].mesh
        self.assertIsNotNone(mesh)
        front_center_x = (mesh.vertices[0][0] + mesh.vertices[1][0]) / 2
        after_center_x = (mesh.vertices[-2][0] + mesh.vertices[-1][0]) / 2
        front = runtime.render.notes["virtual-slide"]
        after = runtime.render.slide_tails["virtual-slide"]
        expected_front_x = calc_note_position(
            (projection.button_center_x(3), projection.goal_y),
            (projection.note_start_x(3), projection.note_start_position_y()),
            front.progress,
            "left",
            1,
            projection.virtual_lane_start_delta_x,
            projection.virtual_lane_end_delta_x,
        )[0]
        expected_after_x = calc_note_position(
            (projection.button_center_x(3), projection.goal_y),
            (projection.note_start_x(3), projection.note_start_position_y()),
            after.progress,
            "right",
            2,
            projection.virtual_lane_start_delta_x,
            projection.virtual_lane_end_delta_x,
        )[0]
        self.assertAlmostEqual(front_center_x, expected_front_x)
        self.assertAlmostEqual(after_center_x, expected_after_x)

    def test_runtime_vertical_position_uses_arrival_time_and_curve(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("curve", 120, 3, "long", 240)],
            render_projection=RenderProjectionConfig(specific_speed=10.0),
        )
        self.advance(runtime, 0.5)
        render_note = runtime.render.notes["curve"]
        self.assertAlmostEqual(render_note.progress, 0.5)
        projection = runtime.render_projection
        expected_y = projection.note_start_position_y() - abs(
            (projection.note_start_position_y() - projection.goal_position_y())
            * 1.1**-25
        )
        self.assertAlmostEqual(render_note.mesh.vertices[0][1], expected_y)

    def test_scale_min_ratio_list_matches_metadata_initializer(self) -> None:
        self.assertEqual(
            SCALE_MIN_RATIO_LIST,
            (0.98, 0.988, 0.9898, 0.9899, 0.991, 0.9915, 0.9917),
        )

    def test_note_scale_matches_vertical_and_high_aspect_blend(self) -> None:
        self.assertAlmostEqual(calc_note_scale(1.0, 1.0, 0.0, 0.5, 1, 0.0), 0.004)
        self.assertAlmostEqual(calc_note_scale(0.0, 1.0, 0.0, 0.5, 1, 0.0), 0.502)
        self.assertAlmostEqual(calc_note_scale(0.0, 1.0, 0.0, 0.5, 1, 1.0), 0.51)
        self.assertAlmostEqual(calc_note_scale(0.0, 1.0, 0.0, 0.5, 7, 1.0), 0.50415)

    def test_runtime_mesh_width_grows_along_recovered_perspective_scale(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("perspective", 120, 3, "long", 240, width=1)],
            render_projection=RenderProjectionConfig(specific_speed=10.0),
        )
        self.advance(runtime, 0.25)
        early_mesh = runtime.render.notes["perspective"].mesh
        early_width = early_mesh.vertices[1][0] - early_mesh.vertices[0][0]
        self.advance(runtime, 0.5)
        late_mesh = runtime.render.notes["perspective"].mesh
        late_width = late_mesh.vertices[1][0] - late_mesh.vertices[0][0]
        self.assertGreater(late_width, early_width)

    def test_after_note_virtual_scale_matches_recovered_distance_ratio(self) -> None:
        self.assertAlmostEqual(
            calculate_after_note_virtual_scale(0.5, 2.0, 0.0, 1.0, 0.8),
            0.1875,
        )

    def test_after_note_scale_uses_virtual_formula_only_while_waiting(self) -> None:
        self.assertEqual(
            get_after_note_scale("move", 0.42, 0.5, 2.0, 0.0, 1.0, 0.8),
            0.42,
        )
        self.assertAlmostEqual(
            get_after_note_scale("wait", 0.42, 0.5, 2.0, 0.0, 1.0, 0.8),
            0.1875,
        )

    def test_waiting_after_note_tapers_mesh_at_launcher(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("long-tail", 120, 3, "long", 480)],
        )
        self.advance(runtime, 0.5)
        mesh = runtime.render.notes["long-tail"].mesh
        self.assertIsNotNone(mesh)
        after_width = mesh.vertices[-1][0] - mesh.vertices[-2][0]
        self.assertAlmostEqual(after_width, 0.0)

    def test_confirmed_note_filename_base_mapping(self) -> None:
        self.assertEqual(note_file_name_base("tap"), "note_normal")
        self.assertEqual(note_file_name_base("skill"), "note_skill")
        self.assertEqual(note_file_name_base("long"), "note_long")
        self.assertEqual(note_file_name_base("slide"), "note_slide_among")
        self.assertEqual(
            note_file_name_base("directional_flick_left"), "note_flick_l"
        )
        self.assertEqual(
            note_file_name_base("directional_flick_right"), "note_flick_r"
        )

    def test_front_note_sprite_keys_match_concrete_setup_paths(self) -> None:
        self.assertEqual(note_sprite_key("tap"), "note_normal")
        self.assertEqual(note_sprite_key("tap", True, True), "note_normal_16")
        self.assertEqual(note_sprite_key("long"), "note_long")
        self.assertEqual(note_sprite_key("slide"), "note_long")
        self.assertEqual(note_sprite_key("flick"), "note_flick")
        self.assertEqual(
            note_sprite_resource_id("note_long", (1, 2, 3)),
            "note_long_1_2_3",
        )

    def test_runtime_exposes_sprite_renderer_and_flick_icon_state(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec("colored", 120, 1, short_rhythm_under_8beat=True),
                NoteSpec("ordinary", 120, 3),
                NoteSpec("flick", 120, 5, "flick"),
            ],
            render_projection=RenderProjectionConfig(note_color_enabled=True),
        )
        self.advance(runtime, 0.5)
        colored = runtime.render.notes["colored"]
        ordinary = runtime.render.notes["ordinary"]
        flick = runtime.render.notes["flick"]
        self.assertEqual(colored.sprite_key, "note_normal_16")
        self.assertEqual(colored.resource_id, "note_normal_16_1")
        self.assertEqual(ordinary.resource_id, "note_normal_3")
        self.assertTrue(colored.sprite_renderer_enabled)
        self.assertFalse(colored.flick_icon_enabled)
        self.assertEqual(colored.sorting_order, 70)
        self.assertEqual(flick.resource_id, "note_flick_5")
        self.assertTrue(flick.flick_icon_enabled)
        self.assertEqual(flick.sorting_order, 70)
        self.assertIsNotNone(flick.flick_icon)
        self.assertEqual(flick.flick_icon.resource_id, "note_flick_top")
        self.assertEqual(flick.flick_icon.sorting_order, 70)
        self.assertEqual(flick.flick_icon.animator_state, "FlickNoteIcon")

    def test_flick_icon_curves_loop_with_exact_serialized_directions(self) -> None:
        ordinary = evaluate_flick_icon_animation("FlickNoteIcon", 1.0 / 6.0)
        left = evaluate_flick_icon_animation("FlickNoteIconLeft", 1.0 / 6.0)
        right = evaluate_flick_icon_animation("FlickNoteIconRight", 1.0 / 6.0)
        self.assertAlmostEqual(ordinary.local_position[0], 0.0)
        self.assertAlmostEqual(ordinary.local_position[1], 1.0)
        self.assertAlmostEqual(left.local_position[0], -1.95)
        self.assertAlmostEqual(right.local_position[0], 1.95)
        self.assertEqual(ordinary.local_scale, (1.0, 1.0))
        self.assertEqual(ordinary.local_rotation_degrees, 0.0)
        self.assertAlmostEqual(
            evaluate_flick_icon_animation("FlickNoteIcon", 0.5).local_position[1],
            ordinary.local_position[1],
        )
        with self.assertRaises(ValueError):
            evaluate_flick_icon_animation("Unknown", 0.0)

    def test_front_flick_icon_routes_ordinary_and_directional_states(self) -> None:
        ordinary = front_flick_icon_visual_route("flick")
        left = front_flick_icon_visual_route("directional_flick_left")
        right = front_flick_icon_visual_route("directional_flick_right")
        self.assertEqual(
            (ordinary.sprite_key, ordinary.sorting_order, ordinary.animator_state),
            ("note_flick_top", 70, "FlickNoteIcon"),
        )
        self.assertEqual(
            (left.sprite_key, left.sorting_order, left.animator_state),
            ("note_flick_top_l", 71, "FlickNoteIconLeft"),
        )
        self.assertEqual(
            (right.sprite_key, right.sorting_order, right.animator_state),
            ("note_flick_top_r", 71, "FlickNoteIconRight"),
        )
        self.assertIsNone(front_flick_icon_visual_route("tap"))

    def test_runtime_resolves_directional_and_habahiro_flick_icons(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec("left", 120, 1, "directional_flick_left"),
                NoteSpec("right", 120, 4, "directional_flick_right"),
                NoteSpec("wide", 120, 1, "flick", width=3),
            ],
            resource_catalog=ResourceCatalog.load(
                Path(__file__).with_name("resource_manifest.json")
            ),
            is_multi_range=True,
        )
        self.advance(runtime, 0.5)
        left = runtime.render.notes["left"].flick_icon
        right = runtime.render.notes["right"].flick_icon
        wide = runtime.render.notes["wide"].flick_icon
        self.assertEqual(left.resource_id, "note_flick_top_l")
        self.assertEqual(left.sorting_order, 71)
        self.assertLess(left.local_position[0], 0.0)
        self.assertEqual(right.resource_id, "note_flick_top_r")
        self.assertEqual(right.sorting_order, 71)
        self.assertGreater(right.local_position[0], 0.0)
        self.assertEqual(wide.resource_id, "note_flick_top_3")

    def test_slide_tail_exposes_main_sprite_and_animated_icon_resources(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "ordinary-tail",
                    120,
                    1,
                    "slide",
                    240,
                    width=2,
                    end_gesture="flick",
                    end_lane=1,
                    end_width=2,
                ),
                NoteSpec(
                    "left-tail",
                    120,
                    4,
                    "slide",
                    240,
                    end_gesture="directional_left",
                    end_lane=4,
                    end_game_note_type=14,
                ),
            ],
        )
        self.advance(runtime, 0.5)
        ordinary = runtime.render.slide_tails["ordinary-tail"]
        left = runtime.render.slide_tails["left-tail"]
        self.assertEqual(ordinary.resource_id, "note_flick_1_2")
        self.assertEqual(ordinary.flick_icon.resource_id, "note_flick_top_2")
        self.assertEqual(ordinary.flick_icon.sorting_order, 70)
        self.assertEqual(left.resource_id, "note_flick_l_4")
        self.assertEqual(left.flick_icon.resource_id, "note_flick_top_l")
        self.assertEqual(left.flick_icon.sorting_order, 71)

    def test_pause_freezes_flick_icon_animation_clock(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("flick", 240, 3, "flick")],
        )
        self.advance(runtime, 1.0)
        before = runtime.render.notes["flick"].flick_icon
        runtime.pause()
        runtime.update(1.0)
        paused = runtime.render.notes["flick"].flick_icon
        self.assertEqual(paused, before)
        runtime.resume()
        runtime.update(FRAME_SECONDS)
        after = runtime.render.notes["flick"].flick_icon
        self.assertGreater(
            after.animator_elapsed_seconds,
            before.animator_elapsed_seconds,
        )
        self.assertNotEqual(after.local_position, before.local_position)

    def test_slide_intermediate_sprites_use_range_keys_and_invisible_override(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "slide",
                    120,
                    1,
                    "slide",
                    420,
                    intermediate_positions=(180, 240, 300),
                    intermediate_lanes=(1, 3, 0),
                    intermediate_widths=(1, 3, 7),
                    intermediate_invisible=(False, True, False),
                )
            ],
            resource_catalog=ResourceCatalog.load(
                Path(__file__).with_name("resource_manifest.json")
            ),
            render_projection=RenderProjectionConfig(specific_speed=8.0),
            is_multi_range=True,
        )
        self.advance(runtime, 0.5)
        first = runtime.render.slide_nodes["slide:intermediate:0"]
        hidden = runtime.render.slide_nodes["slide:intermediate:1"]
        widest = runtime.render.slide_nodes["slide:intermediate:2"]
        self.assertEqual(first.sprite_key, "note_slide_among")
        self.assertEqual(first.resource_id, "note_slide_among")
        self.assertTrue(first.sprite_renderer_enabled)
        self.assertEqual(hidden.sprite_key, "note_slide_among")
        self.assertIsNone(hidden.resource_id)
        self.assertFalse(hidden.sprite_renderer_enabled)
        self.assertEqual(widest.resource_id, "note_slide_among_7")
        self.assertEqual(widest.sorting_order, 70)

    def test_slide_intermediate_nodes_project_and_retire_independently(self) -> None:
        projection = RenderProjectionConfig(specific_speed=8.0)
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "chain",
                    120,
                    1,
                    "slide",
                    360,
                    intermediate_positions=(180, 300),
                    intermediate_lanes=(2, 5),
                    intermediate_widths=(1, 2),
                )
            ],
            render_projection=projection,
        )
        self.advance(runtime, 1.0)
        first = runtime.render.slide_nodes["chain:intermediate:0"]
        second = runtime.render.slide_nodes["chain:intermediate:1"]
        self.assertAlmostEqual(
            first.position[0],
            calc_note_position(
                (projection.button_center_x(2), projection.goal_y),
                (projection.note_start_x(2), projection.note_start_position_y()),
                first.progress,
            )[0],
        )
        self.assertAlmostEqual(
            second.position[0],
            calc_note_position(
                (projection.button_center_x(5, 2), projection.goal_y),
                (
                    projection.note_start_x(5, 2),
                    projection.note_start_position_y(),
                ),
                second.progress,
            )[0],
        )
        self.assertEqual(first.width, 1)
        self.assertEqual(second.width, 2)
        self.assertGreater(first.progress, second.progress)
        self.assertNotEqual(first.scale_x, second.scale_x)
        self.assertEqual(runtime.touch_began(1, 1), "chain")
        self.advance(runtime, 0.5)
        self.assertTrue(runtime.touch_moved(1, 0.0))
        self.assertNotIn("chain:intermediate:0", runtime.render.slide_nodes)
        self.assertIn("chain:intermediate:1", runtime.render.slide_nodes)
        self.assertNotIn("chain:segment:0", runtime.render.slide_segments)
        self.assertIn("chain:segment:1", runtime.render.slide_segments)
        retired = runtime.render.mesh_states["chain:segment:0"]
        self.assertEqual(retired.state, "active")
        self.assertFalse(retired.renderer_enabled)
        self.assertTrue(retired.has_front_note_ref)
        self.assertTrue(retired.has_after_note_ref)

    def test_default_projection_matches_rhythm_game_scene_profile(self) -> None:
        projection = RenderProjectionConfig()
        expected_button_x = (-6.6, -4.4, -2.2, 0.0, 2.2, 4.4, 6.6)
        for lane, expected_x in enumerate(expected_button_x, start=1):
            self.assertAlmostEqual(projection.button_center_x(lane), expected_x, places=6)
        self.assertAlmostEqual(projection.button_center_x(2, 3), -2.2, places=6)
        self.assertAlmostEqual(projection.goal_y, -3.450000047683716)
        self.assertIsNone(projection.note_start_y)
        self.assertAlmostEqual(
            projection.note_start_position_y(),
            4.976500511169434,
            places=5,
        )
        self.assertAlmostEqual(projection.note_start_x(1), -0.33, places=6)
        self.assertAlmostEqual(projection.launch_distance_rate, 0.05000000074505806)
        self.assertAlmostEqual(
            projection.virtual_lane_start_delta_x_value(),
            0.0011000001104548573,
        )
        self.assertAlmostEqual(
            projection.virtual_lane_end_delta_x,
            0.02199999988079071,
        )

    def test_screen_width_adjust_rate_scales_scene_and_virtual_projection(self) -> None:
        projection = RenderProjectionConfig(screen_width_adjust_rate=0.8)
        self.assertAlmostEqual(projection.button_center_x(1), -5.28, places=6)
        self.assertAlmostEqual(projection.note_start_x(1), -0.264, places=6)
        self.assertAlmostEqual(projection.goal_position_y(), projection.goal_y * 0.8)
        self.assertAlmostEqual(
            projection.note_start_position_y(),
            4.976500511169434 * 0.8,
            places=5,
        )
        self.assertAlmostEqual(
            projection.vanishing_position_y(),
            5.420001029968262 * 0.8,
            places=5,
        )
        self.assertAlmostEqual(
            projection.virtual_lane_start_delta_x_value(),
            projection.virtual_lane_end_delta_x
            * projection.launch_distance_rate
            * 0.8,
        )
        self.assertAlmostEqual(
            projection.virtual_lane_end_delta_x_value(),
            projection.virtual_lane_end_delta_x * 0.8,
        )

        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec(
                    "scaled-virtual-slide",
                    120,
                    3,
                    "slide",
                    130,
                    virtual_lane_direction="left",
                    virtual_lane_distance=1,
                    end_virtual_lane_direction="right",
                    end_virtual_lane_distance=2,
                )
            ],
            render_projection=projection,
        )
        self.advance(runtime, 0.5)
        mesh = runtime.render.slide_segments["scaled-virtual-slide:segment:0"].mesh
        self.assertIsNotNone(mesh)
        front = runtime.render.notes["scaled-virtual-slide"]
        after = runtime.render.slide_tails["scaled-virtual-slide"]
        expected_front = calc_note_position(
            (projection.button_center_x(3), projection.goal_position_y()),
            (projection.note_start_x(3), projection.note_start_position_y()),
            front.progress,
            "left",
            1,
            projection.virtual_lane_start_delta_x_value(),
            projection.virtual_lane_end_delta_x_value(),
        )
        expected_after = calc_note_position(
            (projection.button_center_x(3), projection.goal_position_y()),
            (projection.note_start_x(3), projection.note_start_position_y()),
            after.progress,
            "right",
            2,
            projection.virtual_lane_start_delta_x_value(),
            projection.virtual_lane_end_delta_x_value(),
        )
        self.assertAlmostEqual(
            (mesh.vertices[0][0] + mesh.vertices[1][0]) / 2,
            expected_front[0],
        )
        self.assertAlmostEqual(mesh.vertices[0][1], expected_front[1])
        self.assertAlmostEqual(
            (mesh.vertices[-2][0] + mesh.vertices[-1][0]) / 2,
            expected_after[0],
        )
        self.assertAlmostEqual(mesh.vertices[-1][1], expected_after[1])

    def test_screen_size_x_derives_native_width_adjust_rate(self) -> None:
        projection = RenderProjectionConfig(
            screen_width_adjust_rate=0.25,
            screen_size_x=RHYTHM_REFERENCE_SCREEN_SIZE_X * 0.8,
        )
        self.assertAlmostEqual(projection.screen_width_adjust_rate_value(), 0.8)
        self.assertAlmostEqual(projection.button_center_x(1), -5.28, places=6)
        self.assertAlmostEqual(projection.goal_position_y(), projection.goal_y * 0.8)

    def test_note_and_particle_scale_follow_native_init_order(self) -> None:
        projection = RenderProjectionConfig(
            screen_width_adjust_rate=0.8,
            note_size=125.0,
            screen_to_safe_area_ratio=1.25,
        )
        self.assertAlmostEqual(projection.normalized_note_size(), 1.25)
        self.assertAlmostEqual(projection.note_setting_scale_value(), 1.0)
        self.assertAlmostEqual(projection.particle_scale_value(), 1.25)

        lower = RenderProjectionConfig(note_size=20.0, multi_range_notes=True)
        upper = RenderProjectionConfig(note_size=200.0, multi_range_notes=True)
        ordinary = RenderProjectionConfig(note_size=20.0)
        self.assertAlmostEqual(lower.normalized_note_size(), 0.8)
        self.assertAlmostEqual(upper.normalized_note_size(), 1.5)
        self.assertAlmostEqual(ordinary.normalized_note_size(), 0.2)

    def test_runtime_perspective_uses_note_setting_scale_not_prefab_scale(self) -> None:
        projection = RenderProjectionConfig(
            local_scale_x=0.25,
            screen_width_adjust_rate=0.8,
            note_size=125.0,
            specific_speed=10.0,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("scaled-note", 120, 4, "normal")],
            render_projection=projection,
        )
        self.advance(runtime, 0.5)
        rendered = runtime.render.notes["scaled-note"]
        expected = calc_note_scale(
            rendered.position[1],
            projection.note_start_position_y(),
            projection.goal_position_y(),
            projection.note_setting_scale_value(),
            1,
            projection.high_aspect_ratio,
        )
        legacy = calc_note_scale(
            rendered.position[1],
            projection.note_start_position_y(),
            projection.goal_position_y(),
            projection.local_scale_x,
            1,
            projection.high_aspect_ratio,
        )
        self.assertAlmostEqual(rendered.scale_x, expected)
        self.assertNotAlmostEqual(rendered.scale_x, legacy)

    def test_checked_in_catalog_resolves_confirmed_logical_note_names(self) -> None:
        catalog = ResourceCatalog.load(Path(__file__).with_name("resource_manifest.json"))
        self.assertEqual(catalog.note_resource("tap"), "note_normal")
        self.assertEqual(catalog.note_resource("long"), "note_long")
        self.assertEqual(catalog.note_resource("slide"), "note_slide_among")
        self.assertEqual(
            catalog.note_resource("directional_flick_left"), "note_flick_l"
        )

    def test_catalog_routes_exact_combination_names_by_noteskin_profile(self) -> None:
        catalog = ResourceCatalog.load(Path(__file__).with_name("resource_manifest.json"))
        self.assertIsNone(catalog.sprite_resource("note_normal", (2, 3)))
        self.assertEqual(
            catalog.sprite_resource(
                "note_normal", (2, 3), note_skin_profile="habahiro"
            ),
            "note_normal_2_3",
        )
        self.assertIsNone(
            catalog.sprite_resource(
                "note_normal", (0, 2), note_skin_profile="habahiro"
            )
        )

    def test_directional_sprites_keep_independent_profile_in_habahiro(self) -> None:
        catalog = ResourceCatalog.load(Path(__file__).with_name("resource_manifest.json"))
        self.assertEqual(
            catalog.sprite_resource(
                "note_flick_l", (2,), note_skin_profile="habahiro"
            ),
            "note_flick_l_2",
        )
        self.assertNotIn(
            "note_flick_l_2", catalog.note_skin_profiles["habahiro"].sprite_names
        )

    def test_note_filename_report_matches_literal_generator(self) -> None:
        expected = json.loads(
            Path(__file__).with_name("note_filename_bases.json").read_text(encoding="utf-8")
        )["confirmed"]
        source = Path(__file__).resolve().parents[3] / "static/il2cpp/dump/stringliteral.json"
        self.assertEqual(extract(source)["confirmed"], expected)

    def test_button_filename_map_contains_contiguous_lane_sequences(self) -> None:
        mapping = create_note_filename_map("note_normal", True, 0)
        self.assertEqual(len(mapping), 28)
        self.assertEqual(mapping["0"], "note_normal_0")
        self.assertEqual(mapping["2_3_4"], "note_normal_2_3_4")
        self.assertEqual(mapping["0_1_2_3_4_5_6"], "note_normal_0_1_2_3_4_5_6")
        self.assertNotIn("0_2", mapping)

    def test_range_filename_map_caps_suffix_at_configured_max(self) -> None:
        mapping = create_note_filename_map("note_flick_top", False, 3)
        self.assertEqual(mapping["1"], "note_flick_top")
        self.assertEqual(mapping["2"], "note_flick_top_2")
        self.assertEqual(mapping["3"], "note_flick_top_3")
        self.assertEqual(mapping["7"], "note_flick_top_3")
        self.assertEqual(
            create_note_filename_map("note_flick_top_l", False, 0),
            {"-1": "note_flick_top_l"},
        )

    def test_render_resource_uses_button_or_range_filename(self) -> None:
        catalog = ResourceCatalog.load(Path(__file__).with_name("resource_manifest.json"))
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [
                NoteSpec("tap", 120, 2, width=2),
                NoteSpec("slide", 240, 1, "slide", 360, width=3),
            ],
            resource_catalog=catalog,
            render_projection=RenderProjectionConfig(specific_speed=8.0),
            is_multi_range=True,
        )
        self.advance(runtime, 0.5)
        self.assertEqual(runtime.render.notes["tap"].resource_id, "note_normal_2_3")
        self.assertEqual(runtime.render.notes["slide"].resource_id, "note_long_1_2_3")

    def test_ordinary_runtime_does_not_fallback_for_missing_wide_sprite(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [NoteSpec("tap", 120, 2, width=2)],
            resource_catalog=ResourceCatalog.load(
                Path(__file__).with_name("resource_manifest.json")
            ),
            render_projection=RenderProjectionConfig(specific_speed=8.0),
        )
        self.advance(runtime, 0.5)
        self.assertIsNone(runtime.render.notes["tap"].resource_id)

    def test_gameplay_button_particle_result_jump_table_routes(self) -> None:
        self.assertEqual(
            game_play_button_particle_route("none", 0, 0).result_prefab,
            "effect_tap",
        )
        self.assertIsNone(
            game_play_button_particle_route("miss", 0, 0).result_prefab
        )
        self.assertIsNone(
            game_play_button_particle_route("bad", 0, 0).result_prefab
        )
        self.assertEqual(
            game_play_button_particle_route(
                "perfect", 0, 0, is_skill_note=True, range_length=3
            ).result_prefab,
            "effect_tap_skill_perfect3",
        )
        self.assertEqual(
            game_play_button_particle_route(
                "great", 3, 2, range_length=2
            ).result_prefab,
            "effect_tap_swipe2",
        )

    def test_gameplay_button_directional_particle_count_and_side_routes(self) -> None:
        left = game_play_button_particle_route(
            "perfect",
            9,
            10,
            multiple_directional_flick_note_count=2,
        )
        right = game_play_button_particle_route(
            "good",
            10,
            17,
            multiple_directional_flick_note_count=4,
        )
        unknown = game_play_button_particle_route("perfect", 9, 20)
        self.assertEqual(
            (left.result_prefab, left.directional_index, left.result_route),
            ("effect_tap_directional_flick_l_2", 1, "directional_left"),
        )
        self.assertEqual(
            (right.result_prefab, right.directional_index, right.result_route),
            ("effect_tap_directional_flick_r_3", 2, "directional_right"),
        )
        self.assertIsNone(unknown.result_prefab)
        self.assertEqual(
            game_play_button_directional_finger_particle("perfect", 10),
            (
                "effect_tap_directional_flick_l_finger",
                "directional_finger_left",
            ),
        )
        self.assertEqual(
            game_play_button_directional_finger_particle(
                "good", 4, after_note_type=12
            ),
            (
                "effect_tap_directional_flick_r_finger",
                "directional_finger_right",
            ),
        )
        self.assertIsNone(
            game_play_button_directional_finger_particle(
                "perfect", 10, current_game_state=14
            )
        )

    def test_gameplay_button_long_particle_lifecycle(self) -> None:
        note = NoteSpec("long", 120, 3, "long", 240, width=2)
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
        )
        self.advance(runtime, 1.0)
        self.assertEqual(runtime.touch_began(5, 3), "long")
        tap_keep = runtime.render.particle_systems[
            "button:3:effect_TapKeep2"
        ]
        result_particle = runtime.render.particle_systems[
            "button:3:effect_tap_perfect2"
        ]
        self.assertTrue(tap_keep.active)
        self.assertTrue(tap_keep.playing)
        self.assertEqual(tap_keep.play_generation, 1)
        self.assertGreater(tap_keep.particle_count, 0)
        self.assertEqual(result_particle.play_generation, 1)

        self.advance(runtime, 1.0)
        self.assertEqual(runtime.touch_ended(5), "perfect")
        self.assertFalse(tap_keep.active)
        self.assertFalse(tap_keep.playing)
        self.assertEqual(tap_keep.stop_generation, 1)
        self.assertEqual(tap_keep.clear_generation, 1)
        self.assertEqual(tap_keep.particle_count, 0)
        self.assertNotIn(tap_keep.instance_id, runtime.render.particle_samples)
        self.assertEqual(result_particle.play_generation, 1)

        self.assertTrue(runtime.complete_particle(3, "effect_tap_perfect2"))
        runtime._play_gameplay_button_particles(note, "perfect", "tail")
        self.assertEqual(result_particle.play_generation, 2)
        self.assertEqual(result_particle.clear_generation, 2)

    def test_gameplay_particle_samples_advance_and_complete(self) -> None:
        runtime = RuntimeIntegration(TempoMap([TempoChange(0, 120)]), [])
        state = runtime._particle_state(4, "effect_tap_good", "normal", 0)
        self.assertTrue(runtime._play_particle_state(state, "good", 0, 0))
        self.assertGreater(state.particle_count, 0)
        initial_samples = runtime.snapshot()["render"]["particle_samples"][
            state.instance_id
        ]
        self.assertTrue(all(sample["age"] == 0.0 for sample in initial_samples))
        runtime.update(0.1)
        advanced_samples = runtime.snapshot()["render"]["particle_samples"][
            state.instance_id
        ]
        self.assertTrue(any(sample["age"] > 0.0 for sample in advanced_samples))
        runtime.update(5.0)
        self.assertFalse(state.playing)
        self.assertEqual(state.particle_count, 0)
        self.assertNotIn(state.instance_id, runtime.render.particle_samples)

    def test_gameplay_particle_visibility_drives_emitter_culling_modes(self) -> None:
        runtime = RuntimeIntegration(TempoMap([TempoChange(0, 120)]), [])
        state = runtime._particle_state(4, "effect_tap", "normal", 0)
        self.assertTrue(runtime._play_particle_state(state, "perfect", 0, 0))
        state.visible = False
        runtime.update(0.1)
        samples = runtime.render.particle_samples[state.instance_id]
        paused = next(sample for sample in samples if sample.system_path == "effect_tap/star")
        continued = next(sample for sample in samples if sample.system_path == "effect_tap/kira")
        self.assertEqual(paused.age, 0.0)
        self.assertAlmostEqual(continued.age, 0.1)
        state.visible = True
        runtime.update(0.05)
        samples = runtime.render.particle_samples[state.instance_id]
        paused = next(sample for sample in samples if sample.system_path == "effect_tap/star")
        continued = next(sample for sample in samples if sample.system_path == "effect_tap/kira")
        self.assertAlmostEqual(paused.age, 0.15)
        self.assertAlmostEqual(continued.age, 0.15)

    def test_gameplay_button_runtime_directional_particle_state(self) -> None:
        note = NoteSpec(
            "directional",
            120,
            1,
            "directional_flick_left",
            multiple_note_count=2,
            game_note_type=10,
        )
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [note],
        )
        self.advance(runtime, 1.0)
        runtime.touch_began(0, 1, x=0.0)
        self.assertTrue(runtime.touch_moved(0, -0.02))
        state = runtime.render.particle_systems[
            "button:1:effect_tap_directional_flick_l_2"
        ]
        self.assertEqual(state.route, "directional_left")
        self.assertEqual(state.last_judge_note_type, 10)
        self.assertEqual(state.last_game_note_type, 10)
        finger = runtime.render.particle_systems[
            "button:1:effect_tap_directional_flick_l_finger"
        ]
        self.assertEqual(finger.route, "directional_finger_left")
        self.assertEqual(finger.play_generation, 1)
        self.assertEqual(
            gameplay_button_judge_note_type(note, "perfect", "head"), 10
        )
        self.assertEqual(
            runtime.snapshot()["render"]["particle_events"][0]["prefab_name"],
            "effect_tap_directional_flick_l_2",
        )


    def test_life_hud_visual_thresholds_and_second_fill(self) -> None:
        cases = (
            (1_000, 1.0, 0.0, LIFE_NORMAL_GAUGE_COLOR, False, False),
            (1_500, 1.0, 0.5, LIFE_NORMAL_GAUGE_COLOR, False, False),
            (250, 0.25, 0.0, LIFE_NORMAL_GAUGE_COLOR, True, False),
            (200, 0.2, 0.0, LIFE_DANGEROUS_GAUGE_COLOR, True, False),
            (0, 0.0, 0.0, LIFE_DANGEROUS_GAUGE_COLOR, True, True),
        )
        for life, primary, second, color, warning, game_over in cases:
            with self.subTest(life=life):
                visual = build_life_hud_visual_state(life, 2_000)
                self.assertEqual(visual.primary_fill, primary)
                self.assertEqual(visual.second_fill, second)
                self.assertEqual(visual.gauge_color, color)
                self.assertEqual(visual.warning_active, warning)
                self.assertEqual(visual.warning_sprite_enabled, warning)
                self.assertEqual(visual.game_over, game_over)
        self.assertFalse(build_life_hud_visual_state(251, 1_000).warning_active)
        self.assertEqual(
            build_life_hud_visual_state(201, 1_000).gauge_color,
            LIFE_NORMAL_GAUGE_COLOR,
        )
        guarded = build_life_hud_visual_state(200, 1_000, True)
        self.assertTrue(guarded.warning_active)
        self.assertFalse(guarded.warning_sprite_enabled)

    def test_life_hud_refreshes_after_damage_heal_and_freezes_when_paused(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
            player_max_life=1_000,
        )
        runtime._frame_data.append(
            OneFrameData(
                True,
                1,
                (1,),
                0,
                -800,
                -1,
                "tap",
                "miss",
                "miss",
                damage=800,
            )
        )
        runtime.reflect_one_frame_data()
        self.assertEqual(runtime.hud.life, 200)
        self.assertEqual(runtime.hud.life_visual.current_life, 200)
        self.assertEqual(
            runtime.hud.life_visual.gauge_color,
            LIFE_DANGEROUS_GAUGE_COLOR,
        )
        runtime._play_once_effect_skill(
            SkillPlaybackSpec(
                1,
                101,
                1.0,
                once_effect_type="life",
                once_effect_value_type="real_value",
                once_effect_value=300,
            )
        )
        self.assertEqual(runtime.hud.life_visual.current_life, 500)
        before = runtime.hud.life_visual
        runtime.pause()
        runtime.update(1.0)
        self.assertEqual(runtime.hud.life_visual, before)

    def test_life_skill_overlay_clock_starts_advances_and_pauses(self) -> None:
        runtime = RuntimeIntegration(
            TempoMap([TempoChange(0, 120)]),
            [],
        )
        runtime.hud.life = 400
        runtime._play_skill_visuals(
            SkillPlaybackSpec(
                1,
                101,
                2.0,
                once_effect_type="life",
                once_effect_value_type="real_value",
                once_effect_value=100,
                once_effect_condition_life_type="under_life",
                once_effect_condition_life=500,
            )
        )
        self.assertEqual(runtime.skill_visuals.life_animator_state, "LifeHealGauge")
        self.assertEqual(runtime.skill_visuals.life_animator_elapsed, 0.0)
        runtime.update(0.25)
        self.assertEqual(runtime.skill_visuals.life_animator_elapsed, 0.25)
        runtime.pause()
        runtime.update(0.5)
        self.assertEqual(runtime.skill_visuals.life_animator_elapsed, 0.25)
        runtime.resume()
        runtime._finish_skill_visuals()
        self.assertFalse(runtime.skill_visuals.life_animator_enabled)
        self.assertEqual(runtime.skill_visuals.life_animator_elapsed, 0.0)


if __name__ == "__main__":
    unittest.main()

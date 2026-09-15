/** Current 10.1.4 correction profile. Source: pushed Reverse c2187fe3. */
export const CURRENT_FIVE_VISUAL_CORRECTION_SOURCE_COMMIT =
  "c2187fe31eeedc0f288dfd29c25f741f93732ea8";

export const CURRENT_SCORE_SERIALIZED_COMPONENT_PATHS = Object.freeze([
  "GamePlay/UI_Root/Display/Score/Base/Score",
  "GamePlay/UI_Root/Display/Score/Base/TotalScore",
  "GamePlay/UI_Root/Display/Score/Progress/Background",
  "GamePlay/UI_Root/Display/Score/Progress/Background_Cover",
  "GamePlay/UI_Root/Display/Score/Progress/Foreground",
  "GamePlay/UI_Root/Display/Score/Progress/MultiGauge/Gauge1P",
  "GamePlay/UI_Root/Display/Score/Progress/MultiGauge/Gauge2P",
  "GamePlay/UI_Root/Display/Score/Progress/MultiGauge/Gauge3P",
  "GamePlay/UI_Root/Display/Score/Progress/MultiGauge/Gauge4P",
  "GamePlay/UI_Root/Display/Score/Progress/MultiGauge/Gauge5P",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/BigStar_1",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/BigStar_2",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/Flash",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/kira_1",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/kira_2",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/kira_3",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/kira_4",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/kira_5",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/kira_6",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/kira_7",
  "GamePlay/UI_Root/Display/Score/Progress/Panel/HighRankEffect/kira_8",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankA+/A+",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankA+/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankA/A",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankA/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankB+/B+",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankB+/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankB/B",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankB/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankC+/C+",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankC+/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankC/C",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankC/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankS+/S+",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankS+/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankS/S",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankS/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSS+/SS",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSS+/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSS/SS",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSS/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSSS/SSS",
  "GamePlay/UI_Root/Display/Score/Progress/RankObject/rankSSS/Separator",
  "GamePlay/UI_Root/Display/Score/Progress/SkillEffect/SpriteBase",
  "GamePlay/UI_Root/Display/Score/Progress/SkillEffect/SpriteIcon",
] as const);

export const CURRENT_LIFE_SERIALIZED_COMPONENT_PATHS = Object.freeze([
  "GamePlay/UI_Root/Display/LifeGauge/GameOverMessage",
  "GamePlay/UI_Root/Display/LifeGauge/GameOverMessage/text",
  "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/SkillEffect/SpriteBase",
  "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/SkillEffect/SpriteIcon",
  "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/hp_gauge_round/FrontGauge",
  "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/hp_gauge_round/GaugeBG",
  "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/hp_gauge_second/FrontGauge",
  "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/warning",
  "GamePlay/UI_Root/Display/LifeGauge/GaugeObject/warning/warningBody",
  "GamePlay/UI_Root/Display/LifeGauge/life_panel/Total",
] as const);

export const CURRENT_PAUSE_VISIBLE_MESSAGE =
  `ライブを一時停止しました。
ライブを再開しますか？
また、リトライで最初からプレイできます。`;

export const CURRENT_PAUSE_COMPONENT_PATHS = Object.freeze({
  cover: "RetryablePauseDialog/Background",
  window: "RetryablePauseDialog/Window",
  header: "RetryablePauseDialog/Window/Header",
  title: "RetryablePauseDialog/Window/Title",
  content: "RetryablePauseDialog/Window/Content",
  abortButton: "RetryablePauseDialog/Buttons/ButtonCancel",
  retryButton: "RetryablePauseDialog/Buttons/ButtonRetry",
  resumeButton: "RetryablePauseDialog/Buttons/ButtonOK",
} as const);

export const CURRENT_PAUSE_CONFIRMATION_COMPONENT_PATHS = Object.freeze({
  retry: Object.freeze({
    cover: "SelectableCommonDialog/Background",
    window: "SelectableCommonDialog/Window",
    header: "SelectableCommonDialog/Window/Header",
    title: "SelectableCommonDialog/Window/Title",
    content: "SelectableCommonDialog/Window/Content",
    cancelButton: "SelectableCommonDialog/Buttons/CancelButton",
    confirmButton: "SelectableCommonDialog/Buttons/OKButton",
  }),
  abort: Object.freeze({
    cover: "RhythmGameRetireAnnotatedDialog/Background",
    window: "RhythmGameRetireAnnotatedDialog/Window",
    header: "RhythmGameRetireAnnotatedDialog/Window/Header",
    title: "RhythmGameRetireAnnotatedDialog/Window/Title",
    content: "RhythmGameRetireAnnotatedDialog/Window/Content",
    annotation: "RhythmGameRetireAnnotatedDialog/Window/AnnotatedText",
    cancelButton: "RhythmGameRetireAnnotatedDialog/Buttons/ButtonCancel",
    confirmButton: "RhythmGameRetireAnnotatedDialog/Buttons/ButtonOK",
  }),
} as const);

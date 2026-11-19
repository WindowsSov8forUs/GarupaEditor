import { OriginalMusicFilterDialog, MusicFilterHeading, MusicFilterRadioOptions, originalMusicFilterGroupCenter,
  originalMusicFilterHeadingGap, originalMusicFilterHeadingToControl, originalMusicFilterSectionCenter, originalMusicFilterTwoRowGroupHeight,
  type MusicFilterFields } from "../OriginalMusicFilterDialog";
import { OriginalFormButton, OriginalStepStepper, ORIGINAL_FORM_BUTTON_SPRITE_HEIGHT, ORIGINAL_FORM_BUTTON_SPRITE_WIDTH } from "../OriginalFormParts";
import { LANE_COUNT_OPTIONS } from "../../chartCore";
import { OriginalCheckBox, ORIGINAL_CHECKBOX_HEIGHT } from "../OriginalCheckBox";

export type EditorMode = "basic" | "special" | "exgarupa";
const MODES: readonly EditorMode[] = ["basic", "special", "exgarupa"];
const MODE_LABELS = ["基础", "SP 音符", "ExGarupa"];
/** As the filter's difficulty group: options start one heading gap plus this offset below the group heading. */
const HEADING_TO_OPTIONS = 47;
/** One option row of the filter's radio groups, in design px. */
const OPTION_ROW = 48;
/** Centre to centre of the 歌曲信息 buttons side by side: as the original two-button dialogs' buttons. */
const SONG_BUTTON_PITCH = 272;
/** A second row of buttons under a row: as far below it as the buttons of a row are apart (the original's 24
 * between button surfaces). */
const BUTTON_ROW_PITCH = ORIGINAL_FORM_BUTTON_SPRITE_HEIGHT + SONG_BUTTON_PITCH - ORIGINAL_FORM_BUTTON_SPRITE_WIDTH;
/**
 * Centre of the first check circle relative to the group centre: the difficulty group's start_pos (−282) plus the
 * 2-unit shift MusicFilterRadioOptions applies with custom typography. Option rows are centred on their top value.
 */
const FIRST_OPTION_CENTER_X = -282 + 2;
/** The checkbox's box is 48 wide with its centre 24 right of the element's left edge. */
const CHECKBOX_BOX_HALF = 24;

// The drawer's search fields are unused here; it only hosts custom content.
const NO_FIELDS: MusicFilterFields = { id: "", keyword: "", artist: "", difficulty: null, minimum: 0, maximum: 0, order: "TIME_ASC" };
const NO_BOUNDS = [0, 0] as const;

/**
 * 编辑器选项: the original song filter drawer, holding the editor mode settings, the way to the song information and
 * the chart's export (the project file, publishing).
 */
export function EditorOptionsDrawer({ open, onClose, mode, onModeChange, habahiro, onHabahiroChange, laneCount, onLaneCountChange,
  onSongInformation, onEditSongInformation, onExportProject, exportBusy, onExportBestdoriV2, onPublishTestServer, onPublishBestdori,
  onPublishNotGarupa, onEditCode }: {
  open: boolean; onClose(): void;
  /** 查看: opens the song information page. */
  onSongInformation(): void;
  /** 编辑: opens the song information editing window. */
  onEditSongInformation(): void;
  /** 导出工程文件: saves the project file (.gcp). */
  onExportProject(): void;
  /** A project file is being saved or opened. */
  exportBusy: boolean;
  /** 导出为 Bestdori V2. */
  onExportBestdoriV2(): void;
  /** 打开编辑框: the 谱面代码编辑 window. */
  onEditCode(): void;
  /** 发布到测试服. */
  onPublishTestServer(): void;
  /** 发布到 Bestdori: its post's description and tags first. */
  onPublishBestdori(): void;
  /** 发布到 NotGarupa: the upload to the NotGarupa! server, its description and tags first. */
  onPublishNotGarupa(): void;
  mode: EditorMode; onModeChange(mode: EditorMode): void;
  habahiro: boolean; onHabahiroChange(value: boolean): void;
  laneCount: number; onLaneCountChange(value: number): void;
}) {
  const modeTop = originalMusicFilterHeadingGap;
  const optionsTop = modeTop + HEADING_TO_OPTIONS;
  const habahiroTop = optionsTop + OPTION_ROW;
  // 模式 has two option rows like the filter's difficulty group, so 轨道数 follows at the level heading's distance.
  const laneTop = modeTop + originalMusicFilterTwoRowGroupHeight;
  // The stepper is taller than an option row; place it like the filter places its level gauge under a heading.
  const laneRowTop = laneTop + originalMusicFilterHeadingToControl;
  const laneIndex = LANE_COUNT_OPTIONS.indexOf(laneCount as typeof LANE_COUNT_OPTIONS[number]);
  // Extra lanes are an ExGarupa feature; other modes keep 7 lanes, locked.
  const laneLocked = mode !== "exgarupa";
  // 歌曲信息 follows as a section of its own, as far below the lane stepper as 轨道数 is above it; its two buttons
  // (查看, 编辑) sit side by side under it as the level gauge under its heading, centred under its heading bar.
  const songTop = laneRowTop + originalMusicFilterHeadingToControl;
  const songButtonTop = songTop + originalMusicFilterHeadingToControl;
  // 谱面导出 follows 歌曲信息 as 歌曲信息 follows the lane stepper; its two groups (本地保存, 发布) are spaced as 模式
  // under 编辑器设置, and their two buttons side by side under them as the song buttons under their heading.
  const exportTop = songButtonTop + originalMusicFilterHeadingToControl;
  const localTop = exportTop + modeTop;
  const localButtonTop = localTop + originalMusicFilterHeadingToControl;
  const publishTop = localButtonTop + originalMusicFilterHeadingToControl;
  const publishButtonTop = publishTop + originalMusicFilterHeadingToControl;
  // 发布 has a third button, on a row of its own under the other two, centred as 代码编辑's single button.
  const publishSecondRowTop = publishButtonTop + BUTTON_ROW_PITCH;
  // 谱面代码 follows as 谱面导出 follows 歌曲信息, its group (代码编辑) and button as 本地保存's.
  const codeTop = publishSecondRowTop + originalMusicFilterHeadingToControl;
  const codeEditTop = codeTop + modeTop;
  const codeButtonTop = codeEditTop + originalMusicFilterHeadingToControl;
  // A control centred under the heading bars (x from that centre), its centre at y.
  const centred = (y: number, x = 0) => ({ position: "absolute" as const,
    left: originalMusicFilterSectionCenter + x, top: y, transform: "translate(-50%, -50%)" });
  return <OriginalMusicFilterDialog open={open} title="编辑器选项" value={NO_FIELDS} defaults={NO_FIELDS} bounds={NO_BOUNDS}
    onChange={() => {}} onSearch={() => {}} onClose={onClose}
    custom={{ hideReset: true, fields: [], height: codeButtonTop + OPTION_ROW, render: top => <>
      <MusicFilterHeading text="编辑器设置" top={top} />
      <MusicFilterHeading text="模式" top={top + modeTop} kind="difficulty" />
      <MusicFilterRadioOptions options={MODE_LABELS} value={MODES.indexOf(mode)} top={top + optionsTop}
        typography={{ labelWidth: 138 }} onChange={index => onModeChange(MODES[index]!)} />
      {/* Independent of the three modes: the chart's #HABAHIRO header. */}
      <div style={{ position: "absolute", left: originalMusicFilterGroupCenter + FIRST_OPTION_CENTER_X - CHECKBOX_BOX_HALF,
        top: top + habahiroTop - ORIGINAL_CHECKBOX_HEIGHT / 2 }}>
        <OriginalCheckBox label="HABAHIRO" checked={habahiro} onChange={onHabahiroChange} />
      </div>
      <MusicFilterHeading text="轨道数" top={top + laneTop} kind="difficulty" />
      <div data-lane-count-row style={centred(top + laneRowTop)}>
        <OriginalStepStepper label="轨道数" text={String(laneCount)} disabled={laneLocked}
          canDecrease={laneIndex > 0} canIncrease={laneIndex >= 0 && laneIndex < LANE_COUNT_OPTIONS.length - 1}
          onDecrease={() => onLaneCountChange(LANE_COUNT_OPTIONS[laneIndex - 1]!)}
          onIncrease={() => onLaneCountChange(LANE_COUNT_OPTIONS[laneIndex + 1]!)} />
      </div>
      <MusicFilterHeading text="歌曲信息" top={top + songTop} />
      <div style={centred(top + songButtonTop, -SONG_BUTTON_PITCH / 2)}>
        <OriginalFormButton onClick={onSongInformation}>查看</OriginalFormButton>
      </div>
      <div style={centred(top + songButtonTop, SONG_BUTTON_PITCH / 2)}>
        <OriginalFormButton onClick={onEditSongInformation}>编辑</OriginalFormButton>
      </div>
      <MusicFilterHeading text="谱面导出" top={top + exportTop} />
      <MusicFilterHeading text="本地保存" top={top + localTop} kind="difficulty" />
      <div style={centred(top + localButtonTop, -SONG_BUTTON_PITCH / 2)}>
        <OriginalFormButton singleLine onClick={onExportProject} disabled={exportBusy}>导出工程文件</OriginalFormButton>
      </div>
      <div style={centred(top + localButtonTop, SONG_BUTTON_PITCH / 2)}>
        <OriginalFormButton singleLine onClick={onExportBestdoriV2}>导出为 Bestdori V2</OriginalFormButton>
      </div>
      <MusicFilterHeading text="发布" top={top + publishTop} kind="difficulty" />
      <div style={centred(top + publishButtonTop, -SONG_BUTTON_PITCH / 2)}>
        <OriginalFormButton singleLine onClick={onPublishTestServer}>发布到测试服</OriginalFormButton>
      </div>
      <div style={centred(top + publishButtonTop, SONG_BUTTON_PITCH / 2)}>
        <OriginalFormButton singleLine onClick={onPublishBestdori}>发布到 Bestdori</OriginalFormButton>
      </div>
      <div style={centred(top + publishSecondRowTop)}>
        <OriginalFormButton singleLine onClick={onPublishNotGarupa}>发布到 NotGarupa</OriginalFormButton>
      </div>
      <MusicFilterHeading text="谱面代码" top={top + codeTop} />
      <MusicFilterHeading text="代码编辑" top={top + codeEditTop} kind="difficulty" />
      <div style={centred(top + codeButtonTop)}>
        <OriginalFormButton onClick={onEditCode}>打开编辑框</OriginalFormButton>
      </div>
    </> }} />;
}

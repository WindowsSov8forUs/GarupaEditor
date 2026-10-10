import cn from "../data/originalOfficialMusicWording.json";
import { OriginalMusicFilterDialog, MusicFilterSourceHeading as Heading, MusicFilterRadioOptions as RadioOptions,
  MusicFilterLevelRange as LevelRange, originalMusicBandGridLeft, originalMusicFilterTop as sourceTop, type MusicFilterFields } from "./OriginalMusicFilterDialog";
import { resetOfficialFilter, officialLevelBounds, type OfficialMusicFilter } from "./officialMusicSelection";
import typography from "../data/originalOfficialMusicFilter.json";
import { OFFICIAL_DIFFICULTIES, officialText, type OfficialLibrary } from "../services/officialMusicLibrary";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";
import { OriginalPrefabView } from "./OriginalPrefabView";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";
import type { ApplicationResourceSlot } from "../resources/selections";

const wording = cn.wording;
const bands = [0, 1, 2, 4, 5, 3, 21, 18, 45, -1];
function BandButton({ id, name, selected, onClick }: { id: number; name: string; selected: boolean; onClick(): void }) {
  const url = useApplicationResourceUrl(`ui.field-band-logo.${String(id > 0 ? id : 1).padStart(3, "0")}` as ApplicationResourceSlot);
  const label = id === 0 ? wording.word_all : id === -1 ? wording.word_other : name;
  const model = new OriginalPrefabModel(ORIGINAL_PREFABS.staruisquareradiobutton!, {
    nodes: { 1: { active: selected }, 3: { active: id > 0, x: 1, y: 0, scaleX: 0.45, scaleY: 0.45 },
      4: { active: id <= 0, x: id === 0 ? 0 : 1, y: id === 0 ? -3 : -1 } },
    // StarUISquareRadioButton.SetButtonActive/Inactive changes both backgrounds
    // and the label color; showing the check sprite alone leaves gray text.
    components: {
      11: { m_Enabled: selected ? 0 : 1 },
      13: { m_Enabled: selected ? 1 : 0 },
      16: { mText: label, mFontSize: 20, mSpacingX: id === -1 ? 1 : 0,
        ...(selected ? { mColor: { r: 1, g: 1, b: 1, a: 1 } } : {}) },
    },
  });
  return <OriginalPrefabView model={model} bindings={{ buttons: { 14: { action: onClick, label, role: "radio", selected } },
    textures: { 15: <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> } }} />;
}
export function OfficialMusicFilterDialog({ open, value, library, onChange, onClose, mode = "filter" }: {
  mode?: "search" | "filter";
  open: boolean; value: OfficialMusicFilter; library: OfficialLibrary; onChange(value: OfficialMusicFilter): void; onClose(): void;
}) {
  const bounds = officialLevelBounds(library);
  const defaults = resetOfficialFilter(value, library);
  const fields = (filter: OfficialMusicFilter): MusicFilterFields => ({ ...filter, artist: "", difficulty: OFFICIAL_DIFFICULTIES.indexOf(filter.difficulty), order: "TIME_ASC" });
  const update = (change: Partial<OfficialMusicFilter>) => onChange({ ...value, ...change });
  return <OriginalMusicFilterDialog mode={mode} open={open} value={fields(value)} defaults={fields(defaults)} bounds={bounds}
    onChange={next => mode === "search" ? update({ id: next.id, keyword: next.keyword }) : onChange({ ...defaults, id: value.id, keyword: value.keyword })} onSearch={next => update({ id: next.id, keyword: next.keyword })} onClose={onClose}
    custom={{ resetLabel: wording.dialog_musicSortFilter_toDefault, fields: ["id", "keyword"], height: sourceTop(12, true) + 48 + 40, render: top => <>
      <Heading text={wording.dialog_musicSortFilter_filter} top={top} node={16} />
      <Heading text={wording.word_band} top={top + sourceTop(30)} node={30} />
      <div role="radiogroup" aria-label="乐队" style={{ position: "absolute", left: originalMusicBandGridLeft, top: top + sourceTop(19) }}>
        {bands.map((id, index) => <div key={id} style={{ position: "absolute", left: index % 4 * 128, top: Math.floor(index / 4) * 80 }}>
          <BandButton id={id} name={officialText(library.metadata?.bands[String(id)]?.bandName)} selected={value.band === id} onClick={() => update({ band: id })} />
        </div>)}
      </div>
      <Heading text={wording.dialog_musicFilter_difficultyLabel} top={top + sourceTop(13)} node={13} />
      <RadioOptions options={OFFICIAL_DIFFICULTIES} value={OFFICIAL_DIFFICULTIES.indexOf(value.difficulty)} top={top + sourceTop(25)} typography={typography.difficulty}
        onChange={index => update({ difficulty: OFFICIAL_DIFFICULTIES[index]! })} />
      <Heading text={wording.dialog_musicFilter_levelLabel} top={top + sourceTop(38)} node={38} />
      <LevelRange minimum={Math.max(value.minimum, bounds[0])} maximum={Math.min(value.maximum, bounds[1])} bounds={bounds} top={top + sourceTop(55)}
        onChange={(minimum, maximum) => update({ minimum, maximum })} />
      <Heading text={wording.word_other} top={top + sourceTop(21, true)} node={21} />
      <RadioOptions options={[wording.dialog_musicSortFilter_none, wording.dialog_musicFilter_exist3DLive, wording.dialog_musicFilter_existMV, wording.dialog_musicFilter_isFullLive, wording.dialog_musicFilter_specialNotes]} value={value.extension} top={top + sourceTop(28, true)} extension typography={typography.extension}
        onChange={extension => update({ extension })} />
      <Heading text={wording.dialog_sort_sortingOrder} top={top + sourceTop(27, true)} node={27} />
      <RadioOptions options={[wording.dialog_musicSortFilter_default, wording.dialog_musicSortFilter_musicName, wording.dialog_musicSortFilter_release, wording.dialog_musicSortFilter_musicLevel, wording.dialog_musicSortFilter_highScore, wording.dialog_musicSortFilter_musicGet]} value={value.sort} top={top + sourceTop(12, true)} sort typography={typography.sort}
        onChange={sort => update({ sort })} />
    </> }} />;
}

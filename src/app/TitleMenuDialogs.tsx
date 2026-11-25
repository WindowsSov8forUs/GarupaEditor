import { useEffect, useState } from "react";
import { BestdoriLoginModal } from "../components/BestdoriLoginModal";
import { OriginalFormButton, OriginalFormMessage, ORIGINAL_FORM_BUTTON_WIDTH, TRANSFER_PAGE_PADDING_X } from "../components/OriginalFormParts";
import { OriginalTransferDialog } from "../components/OriginalTransferDialog";
import { OriginalAuthoredDialog } from "../components/OriginalAuthoredDialog";
import { OriginalPrefabModel, type OriginalPrefab } from "../components/originalPrefabModel";
import menuDialog from "../data/title/originalTitleMenuDialog.json";
import bestdoriIcon from "../assets/icons/bestdori.png?url&no-inline";
import { BuiltinResourcePresentationProvider } from "../resources/applicationResourceContext";
import { listApplicationBuiltinImages } from "../resources/builtin/builtinResourceCatalog";
import { useBestdoriAccount } from "./useBestdoriAccount";
import { checkForUpdate, openExternalUrl, PROJECT_REPOSITORY_URL, type UpdateCheckResult } from "./updateCheck";
import { version } from "../../package.json";

/** The title's own credit line (in place of the original's copyright). */
export const TITLE_CREDIT_TEXT = "@WindowsSov8forUs 开发非官方程序，由 Claude 协助";
/**
 * 关于: the name and version (filled in where it is shown), what the program is, who made it, and the unofficial
 * notice. Versions are shown bare, as the title's corner shows them.
 */
const ABOUT_LINES = [
  "",
  "扩展的、多平台的 Garupa 自制谱制作与预览工具",
  "开发者：@WindowsSov8forUs（由 Claude 协助开发）",
  "开源许可：Apache-2.0（仅限本项目源代码）",
  "本程序为非官方工具，与官方及 Bestdori 无隶属关系；\n所涉原作素材权利归原权利人所有，仅供非商业创作交流",
];

/** The title runs before the resource store: its windows and corner widgets draw from the packaged images. */
export const TITLE_BUILTIN_URLS = new Map(listApplicationBuiltinImages().map(entry => [entry.slot, entry.url]));

/*
 * The menu window is the original title menu (TitleMenuDialog, CN 10.1.3): its window, header and three-column grid of
 * icon buttons, with the close button below. The editor's three items take the first row: Bestdori 账号 is the source's
 * account button (moved up from its second-row slot, with Bestdori's icon), 关于 the licence button, 检查更新 the cache
 * button (moved to the right slot). The source's other items stay hidden, as they are by default.
 *
 * The prefab's window holds three rows (480 tall, rows 88 apart). The CN client, showing two (its four default items),
 * draws it about 80 shorter (900×401 measured on a 10.1.3 device), the header and rows 44 lower and the close button 44
 * higher; with the editor's one row it is taken as two such steps shorter (not seen on the device).
 */
const MENU_ROW_PITCH = 88, MENU_ROW_SHRINK = 80, MENU_UNUSED_ROWS = 2;
const MENU_ACCOUNT_BUTTON = 126, MENU_ABOUT_BUTTON = 150, MENU_UPDATE_BUTTON = 140, MENU_OK_BUTTON = 153;
const MENU_MODEL = (() => {
  const source = new OriginalPrefabModel(menuDialog as unknown as OriginalPrefab);
  const node = (path: string) => source.nodeAt(path).id;
  const icon = (button: string) => source.componentAt(node(`Window/Row1/${button}/icon`), "UISprite")!.id;
  const label = (button: string) => source.componentAt(node(`Window/Row1/${button}/ButtonLabel`), "UILabel")!.id;
  const title = source.componentAt(node("Window/Header/Title"), "UILabel")!.id;
  const frame = source.componentAt(node("Window"), "UISprite")!;
  const ok = source.componentAt(node("Window/ButtonOK/ButtonLabel"), "UILabel")!.id;
  const shift = MENU_ROW_PITCH / 2 * MENU_UNUSED_ROWS, at = (path: string) => source.nodeAt(path).position;
  return new OriginalPrefabModel(source.prefab, {
    nodes: {
      [node("Window/Header")]: { y: at("Window/Header").y - shift },
      [node("Window/Row1")]: { y: at("Window/Row1").y - shift },
      [node("Window/ButtonOK")]: { y: at("Window/ButtonOK").y + shift },
      [node("Window/Row1/btnAccountSelect")]: { y: 0 },
      [node("Window/Row1/buttonCacheClear")]: { x: 256 },
      [node("Window/Row1/buttonShowPrivacy")]: { active: false },
      // Bestdori's own icon is drawn in place of the account button's (see MENU_ACCOUNT_ICON).
      [node("Window/Row1/btnAccountSelect/icon")]: { active: false },
    },
    components: {
      [frame.id]: { mHeight: frame.data.mHeight - MENU_ROW_SHRINK * MENU_UNUSED_ROWS },
      [ok]: { mText: "关闭" },
      [title]: { mText: "菜单" },
      // 关于 and 检查更新 take the menu atlas's information and renewal icons. icon_info_pink has no transparent margin:
      // it is drawn smaller than the source's padded icons so that it looks as large.
      [icon("buttonShowLicense")]: { mSpriteName: "icon_info_pink", mWidth: 58, mHeight: 58 },
      [icon("buttonCacheClear")]: { mSpriteName: "icon_code" },
      [label("btnAccountSelect")]: { mText: "Bestdori 账号" },
      [label("buttonShowLicense")]: { mText: "关于" },
      [label("buttonCacheClear")]: { mText: "检查更新" },
    },
  });
})();

/** Where Bestdori's icon is drawn: the account button's icon, in the window's coordinates (y up), and its size. */
const MENU_ACCOUNT_ICON = (() => {
  const icon = MENU_MODEL.nodeAt("Window/Row1/btnAccountSelect/icon");
  const at = MENU_MODEL.transform(icon.id), windowAt = MENU_MODEL.transform(MENU_MODEL.nodeAt("Window").id);
  // As large as the source icon shows (icon_data_take_over: 67×64 at its node's scale, a little margin inside).
  return { x: at.x - windowAt.x, y: at.y - windowAt.y, size: 64 * at.scaleY * 0.9 };
})();

type Window = "menu" | "about" | "update" | null;

/**
 * The windows behind the title's menu button: the menu itself (Bestdori 账号, 关于, 检查更新) and the three it opens.
 * `window` is which one is open; the account window is the editor's own login window.
 */
export function TitleMenuDialogs({ window, onWindow }: { window: Window; onWindow(next: Window): void }) {
  const [notice, setNotice] = useState("");
  const account = useBestdoriAccount({ report: setNotice });
  const close = () => onWindow(null);
  const buttonRow = { minWidth: 2 * ORIGINAL_FORM_BUTTON_WIDTH + 2 * TRANSFER_PAGE_PADDING_X };
  return <BuiltinResourcePresentationProvider urls={TITLE_BUILTIN_URLS}>
    <OriginalAuthoredDialog open={window === "menu"} model={MENU_MODEL} onClose={close} bindings={{ buttons: {
      [MENU_ACCOUNT_BUTTON]: { label: "Bestdori 账号", action: () => { onWindow(null); account.open(); } },
      [MENU_ABOUT_BUTTON]: { label: "关于", action: () => onWindow("about") },
      [MENU_UPDATE_BUTTON]: { label: "检查更新", action: () => onWindow("update") },
      [MENU_OK_BUTTON]: { label: "关闭", action: close },
    } }}>
      <img src={bestdoriIcon} alt="" draggable={false} style={{ position: "absolute", pointerEvents: "none", zIndex: 12,
        width: MENU_ACCOUNT_ICON.size, height: MENU_ACCOUNT_ICON.size, left: MENU_ACCOUNT_ICON.x - MENU_ACCOUNT_ICON.size / 2,
        top: -MENU_ACCOUNT_ICON.y - MENU_ACCOUNT_ICON.size / 2 }} />
    </OriginalAuthoredDialog>
    <OriginalTransferDialog open={window === "about"} title="关于" fitContent onClose={close}>
      <div className="transfer-body">
        <div className="transfer-page" style={{ overflow: "visible" }}>
          {ABOUT_LINES.map((line, index) => <OriginalFormMessage key={index}
            text={index === 0 ? `GarupaEditor  ${version}` : line} lines={line.split("\n").length} />)}
        </div>
        <div className="transfer-actions" style={buttonRow}>
          <OriginalFormButton tone="pink" onClick={() => void openExternalUrl(PROJECT_REPOSITORY_URL)}>项目主页</OriginalFormButton>
          <OriginalFormButton onClick={close}>关闭</OriginalFormButton>
        </div>
      </div>
    </OriginalTransferDialog>
    <TitleUpdateDialog open={window === "update"} onClose={close} />
    <BestdoriLoginModal {...account.modalProps} errorMessage={notice || account.modalProps.errorMessage}
      onClose={() => { setNotice(""); account.modalProps.onClose(); }}
      onSubmit={() => { setNotice(""); account.modalProps.onSubmit(); }} />
  </BuiltinResourcePresentationProvider>;
}

type UpdateState = { status: "checking" } | { status: "done"; result: UpdateCheckResult } | { status: "failed"; message: string };

function TitleUpdateDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [state, setState] = useState<UpdateState>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState({ status: "checking" });
    checkForUpdate(version, controller.signal)
      .then(result => setState({ status: "done", result }))
      .catch(cause => { if (!controller.signal.aborted) setState({ status: "failed",
        message: cause instanceof Error ? cause.message : String(cause) }); });
    return () => controller.abort();
  }, [open, attempt]);
  const latest = state.status === "done" ? state.result.latest : null;
  const newer = state.status === "done" && state.result.newer;
  const text = state.status === "checking" ? "正在检查更新…"
    : state.status === "failed" ? `检查更新失败：${state.message}`
      : newer ? `发现新版本 ${latest!.version}（当前 ${version}）`
        : `当前已是最新版本（${version}）`;
  return <OriginalTransferDialog open={open} title="检查更新" fitContent onClose={onClose}>
    <div className="transfer-body">
      <div className="transfer-page" style={{ overflow: "visible" }}>
        <OriginalFormMessage text={text} />
      </div>
      <div className="transfer-actions" style={{ minWidth: 2 * ORIGINAL_FORM_BUTTON_WIDTH + 2 * TRANSFER_PAGE_PADDING_X }}>
        {newer && <OriginalFormButton tone="pink" onClick={() => void openExternalUrl(latest!.url)}>前往下载</OriginalFormButton>}
        {state.status === "failed" && <OriginalFormButton tone="pink" onClick={() => setAttempt(value => value + 1)}>重试</OriginalFormButton>}
        <OriginalFormButton onClick={onClose}>关闭</OriginalFormButton>
      </div>
    </div>
  </OriginalTransferDialog>;
}

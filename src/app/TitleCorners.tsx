import { forwardRef, useMemo } from "react";
import { OriginalPrefabModel, type OriginalPrefab } from "../components/originalPrefabModel";
import { OriginalPrefabView } from "../components/OriginalPrefabView";
import { BuiltinResourcePresentationProvider } from "../resources/applicationResourceContext";
import menuButton from "../data/title/originalTitleMenuButton.json";
import versionLabel from "../data/title/originalTitleVersionLabel.json";
import copyright from "../data/title/originalTitleCopyright.json";
import { TITLE_BUILTIN_URLS as builtinUrls, TITLE_CREDIT_TEXT } from "./TitleMenuDialogs";
import { version } from "../../package.json";

/*
 * The title's corner widgets, from the CN level0 title scene (TitleController's TopLeftAnchor and BottomRightAnchor
 * layer panels): the version label at the top left (the bare version, as the CN client shows its own); the menu button
 * and the copyright label (here the project's credit line) at the bottom right. Each anchor follows its screen corner;
 * its widgets keep their source offsets from it.
 */

const prefab = (value: unknown) => value as OriginalPrefab;
const versionModel = new OriginalPrefabModel(prefab(versionLabel), { components: { 465: { mText: version } } });
const creditModel = new OriginalPrefabModel(prefab(copyright), { components: { 2112: { mText: TITLE_CREDIT_TEXT } } });
const MENU_BUTTON = 485, MENU_LABEL = 451;
const MENU_TEXT = "菜单";
const menuModel = new OriginalPrefabModel(prefab(menuButton), { components: { [MENU_LABEL]: { mText: MENU_TEXT } } });

/** The top left anchor: its visibility follows the scene's TopLeftAnchor (set by the title's draw loop). */
export const TitleTopLeftCorner = forwardRef<HTMLDivElement, { scale: number }>(function TitleTopLeftCorner({ scale }, ref) {
  return <BuiltinResourcePresentationProvider urls={builtinUrls}>
    <div ref={ref} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, zIndex: 2, visibility: "hidden" }}>
      <div className="original-prefab-origin" style={{ transform: `scale(${scale})` }}>
        <OriginalPrefabView model={versionModel} />
      </div>
    </div>
  </BuiltinResourcePresentationProvider>;
});

/** The bottom right anchor, with the menu button (`onMenu`) and the credit line. */
export const TitleBottomRightCorner = forwardRef<HTMLDivElement, { scale: number; onMenu(): void }>(
  function TitleBottomRightCorner({ scale, onMenu }, ref) {
    const bindings = useMemo(() => ({ buttons: { [MENU_BUTTON]: { label: MENU_TEXT, action: onMenu } } }), [onMenu]);
    return <BuiltinResourcePresentationProvider urls={builtinUrls}>
      <div ref={ref} style={{ position: "absolute", right: 0, bottom: 0, width: 0, height: 0, zIndex: 2, visibility: "hidden" }}>
        <div className="original-prefab-origin" style={{ transform: `scale(${scale})` }}>
          <OriginalPrefabView model={creditModel} />
          <OriginalPrefabView model={menuModel} bindings={bindings} />
        </div>
      </div>
    </BuiltinResourcePresentationProvider>;
  });

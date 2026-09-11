import { Container, NineSliceSprite, type Text, type Texture } from "pixi.js";

type Pair = readonly [number, number];
interface SpriteProfile { readonly position: Pair; readonly size: Pair; readonly depth: number; }
interface LabelProfile extends SpriteProfile { readonly fontSize: number; readonly pivot: "left" | "center"; }
export interface SerializedDialogProfile {
  readonly identity: string;
  readonly window: SpriteProfile;
  readonly header: SpriteProfile;
  readonly title: LabelProfile;
  readonly content: LabelProfile;
  readonly annotation?: LabelProfile;
  readonly buttons: readonly {
    readonly identity: string; readonly position: Pair; readonly spriteName: string;
    readonly spriteSize: Pair; readonly spriteDepth: number; readonly labelSize: Pair;
    readonly labelPosition: Pair; readonly labelDepth: number; readonly fontSize: number;
  }[];
}
export interface SerializedDialogPaths {
  readonly window: string; readonly header: string; readonly title: string; readonly content: string;
  readonly buttons: readonly string[]; readonly annotation?: string;
}
export type DialogColor = number | readonly [number, number, number];
export type DialogTextFactory = (value: string, size: number, fill: DialogColor, label: string,
  width: number, height: number, pivot: "left" | "center") => Text;
type Border = Readonly<{ left: number; right: number; top: number; bottom: number }>;

/** Resource-injected Pixi dialog view. It owns no simulator, input or action state. */
export function createSerializedDialog(
  graph: Container,
  layout: Readonly<{ viewportWidth: number; viewportHeight: number; controlScale: number }>,
  profile: SerializedDialogProfile,
  paths: SerializedDialogPaths,
  titleText: string, contentText: string, buttonTexts: readonly string[], annotationText: string | null,
  textures: Readonly<{ window: Texture; header: Texture; pink: Texture; gray: Texture }>,
  borders: Readonly<{ window: Border; header: Border; button: Border }>,
  palette: Readonly<{ title: DialogColor; content: DialogColor; annotation: DialogColor; button: DialogColor; positiveButton: DialogColor }>,
  createText: DialogTextFactory,
): Container {
    const dialog = new Container({ label: profile.identity, sortableChildren: true });
    dialog.position.set(layout.viewportWidth / 2, layout.viewportHeight / 2);
    dialog.scale.set(layout.controlScale);
    dialog.zIndex = 5;
    graph.addChild(dialog);

    const windowComponent = new Container({ label: paths.window, sortableChildren: true });
    windowComponent.position.set(profile.window.position[0], profile.window.position[1]);
    windowComponent.zIndex = profile.window.depth;
    const window = new NineSliceSprite({
      texture: textures.window,
      ...borders.window,
      width: profile.window.size[0], height: profile.window.size[1],
      anchor: { x: 0.5, y: 0.5 },
      label: `${profile.identity}:window`,
    });
    windowComponent.addChild(window);
    dialog.addChild(windowComponent);

    const headerComponent = new Container({ label: paths.header, sortableChildren: true });
    headerComponent.position.set(profile.header.position[0], profile.header.position[1]);
    headerComponent.zIndex = profile.header.depth;
    const header = new NineSliceSprite({
      texture: textures.header,
      ...borders.header,
      width: profile.header.size[0], height: profile.header.size[1],
      anchor: { x: 0.5, y: 0.5 }, label: `${profile.identity}:header`,
    });
    headerComponent.addChild(header);
    windowComponent.addChild(headerComponent);

    const titlePath = paths.title;
    const titleComponent = new Container({ label: titlePath });
    titleComponent.position.set(profile.title.position[0], profile.title.position[1]);
    titleComponent.zIndex = profile.title.depth;
    const title = createText(titleText, profile.title.fontSize, palette.title,
      `${profile.identity}:title`,
      profile.title.size[0], profile.title.size[1], profile.title.pivot);
    title.anchor.set(profile.title.pivot === "left" ? 0 : 0.5, 0.5);
    titleComponent.addChild(title);
    headerComponent.addChild(titleComponent);

    const contentComponent = new Container({ label: paths.content });
    contentComponent.position.set(profile.content.position[0], profile.content.position[1]);
    contentComponent.zIndex = profile.content.depth;
    const content = createText(contentText, profile.content.fontSize, palette.content,
      `${profile.identity}:message`,
      profile.content.size[0], profile.content.size[1], profile.content.pivot);
    content.anchor.set(profile.content.pivot === "left" ? 0 : 0.5, 0.5);
    contentComponent.addChild(content);
    windowComponent.addChild(contentComponent);

    if (profile.annotation !== undefined && annotationText !== null && paths.annotation !== undefined) {
      const annotationComponent = new Container({ label: paths.annotation });
      annotationComponent.position.set(profile.annotation.position[0], profile.annotation.position[1]);
      annotationComponent.zIndex = profile.annotation.depth;
      const annotation = createText(
        annotationText, profile.annotation.fontSize, palette.annotation, `${profile.identity}:annotation`,
        profile.annotation.size[0], profile.annotation.size[1], profile.annotation.pivot,
      );
      annotation.anchor.set(0.5);
      annotationComponent.addChild(annotation);
      windowComponent.addChild(annotationComponent);
    }

    const buttonGroup = new Container({ label: `${profile.identity}/Buttons`, sortableChildren: true });
    windowComponent.addChild(buttonGroup);
    profile.buttons.forEach((buttonProfile, index) => {
      const path = paths.buttons[index];
      if (path === undefined) throw new Error("Serialized dialog button component path is missing.");
      const component = new Container({ label: path, sortableChildren: true });
      component.position.set(buttonProfile.position[0], buttonProfile.position[1]);
      component.zIndex = buttonProfile.spriteDepth;
      const texture = buttonProfile.spriteName === "button_pink" ? textures.pink : textures.gray;
      const legacy = `${profile.identity}:${buttonProfile.identity}`;
      const button = new NineSliceSprite({
        texture, ...borders.button,
        width: buttonProfile.spriteSize[0], height: buttonProfile.spriteSize[1],
        anchor: { x: 0.5, y: 0.5 }, label: legacy,
      });
      button.zIndex = buttonProfile.spriteDepth;
      const caption = createText(
        buttonTexts[index]!, buttonProfile.fontSize,
        buttonProfile.spriteName === "button_pink" ? palette.positiveButton : palette.button, `${legacy}-label`,
        buttonProfile.labelSize[0], buttonProfile.labelSize[1], "center",
      );
      caption.anchor.set(0.5);
      caption.position.set(buttonProfile.labelPosition[0], buttonProfile.labelPosition[1]);
      caption.zIndex = buttonProfile.labelDepth;
      component.addChild(button, caption);
      buttonGroup.addChild(component);
    });
  return dialog;
}

/** Original AbstractDialog presentation; time is supplied by its host. */
export class SerializedDialogTransition {
  private startedAt = 0;
  private opening = false;
  private scaleFrom = 0;
  private alphaFrom = 0.01;

  constructor(private readonly window: Container, private readonly cover: Container) {
    window.scale.set(0);
    cover.alpha = 0;
  }

  setOpen(open: boolean, now: number): void {
    if (this.opening === open) return;
    this.scaleFrom = this.window.scale.x;
    this.alphaFrom = open ? 0.01 : this.cover.alpha;
    this.opening = open;
    this.startedAt = now;
  }

  update(now: number): boolean {
    // Reverse 5514c30b: linear DOScale 0.15 s, background fade 0.14 s.
    const elapsed = Math.max(0, now - this.startedAt);
    const scalePhase = Math.min(1, elapsed / 0.15);
    const fadePhase = Math.min(1, elapsed / 0.14);
    this.window.scale.set(this.scaleFrom + ((this.opening ? 1 : 0) - this.scaleFrom) * scalePhase);
    this.cover.alpha = this.alphaFrom + ((this.opening ? 0.5 : 0) - this.alphaFrom) * fadePhase;
    return this.opening || elapsed < 0.15;
  }
}

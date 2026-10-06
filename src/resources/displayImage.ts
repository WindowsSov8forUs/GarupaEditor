import { type ResourceRef, type UserResourceDescriptor } from "./contracts";

// An application preference, deliberately outside the current chart workspace.
export const DISPLAY_IMAGE_REF = Object.freeze({ id: "user/application/display-image" }) as ResourceRef;
export const DEFAULT_DISPLAY_IMAGE_REF = Object.freeze({ id: "builtin/ui/home/default-display-image" }) as ResourceRef;
export const DISPLAY_IMAGE_DESCRIPTOR: UserResourceDescriptor = Object.freeze({
  ref: DISPLAY_IMAGE_REF, origin: "user", kind: "image", title: "首页与结算展示图片",
  availability: "installed", files: null, catalogObservedAt: null,
  purpose: "display-image", fileName: "display.png",
  logicalPlacement: Object.freeze({ provider: "user", server: null,
    canonicalPath: "application/display-image", identityClass: "user-media" }),
});

import { useEffect, useMemo, useRef, useState } from "react";
import { projectCanvasRenderResourceRuntimeAssets, type SkinAssets } from "../../skinLoader";

type ReadyImage = HTMLImageElement & { __ready?: boolean };

export function useCanvasRenderResources(params: {
  enabled: boolean;
  skinAssets: SkinAssets | null;
}) {
  const { enabled, skinAssets } = params;
  const imageMapRef = useRef<Map<string, ReadyImage>>(new Map());
  const [version, setVersion] = useState(0);

  const allUrls = useMemo(() => {
    if (!skinAssets) {
      return [] as string[];
    }
    const runtime = projectCanvasRenderResourceRuntimeAssets(skinAssets);
    const urls = new Set<string>();
    const push = (value: string | undefined) => {
      if (typeof value === "string" && value.length > 0) {
        urls.add(value);
      }
    };
    push(runtime.single);
    push(runtime.single16);
    push(runtime.flick);
    push(runtime.skill);
    push(runtime.slide);
    push(runtime.slideAmong);
    push(runtime.flickTop);
    push(runtime.directionalFlickLeft);
    push(runtime.directionalFlickRight);
    push(runtime.directionalFlickLeftTop);
    push(runtime.directionalFlickRightTop);
    push(runtime.longLine);
    push(runtime.longLineSpecial);
    push(runtime.simultaneousLine);
    if (runtime.habahiro) {
      for (const value of Object.values(runtime.singleByWidth)) {
        push(value);
      }
      for (const value of Object.values(runtime.single16ByWidth)) {
        push(value);
      }
      for (const value of Object.values(runtime.flickByWidth)) {
        push(value);
      }
      for (const value of Object.values(runtime.skillByWidth)) {
        push(value);
      }
      for (const value of Object.values(runtime.slideByWidth)) {
        push(value);
      }
      for (const value of Object.values(runtime.slideAmongByWidth)) {
        push(value);
      }
      for (const value of Object.values(runtime.flickTopByWidth)) {
        push(value);
      }
    }
    return Array.from(urls.values());
  }, [skinAssets]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    for (const url of allUrls) {
      if (imageMapRef.current.has(url)) {
        continue;
      }
      const image = new Image() as ReadyImage;
      image.decoding = "async";
      image.__ready = false;
      image.onload = () => {
        image.__ready = true;
        setVersion((value) => value + 1);
      };
      image.onerror = () => {
        image.__ready = false;
        setVersion((value) => value + 1);
      };
      image.src = url;
      imageMapRef.current.set(url, image);
    }
  }, [allUrls, enabled]);

  const getImage = (url: string | undefined | null): HTMLImageElement | null => {
    if (!url) {
      return null;
    }
    const image = imageMapRef.current.get(url);
    if (!image || image.__ready !== true || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      return null;
    }
    return image;
  };

  const isReady = allUrls.length > 0 && allUrls.every((url) => {
    const image = imageMapRef.current.get(url);
    return Boolean(image && image.__ready === true && image.naturalWidth > 0 && image.naturalHeight > 0);
  });

  return {
    getImage,
    isReady,
    version,
  };
}

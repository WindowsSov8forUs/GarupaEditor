import { WebGLRenderer, type BLEND_MODES, type Renderer } from "pixi.js";

// Dedicated batch keys: Pixi's stock additive modes use One for source alpha.
// Keep RGB's premultiplied/non-premultiplied adaptation, but use SrcAlpha for A.
const PREMULTIPLIED = "garupa-flash-add" as BLEND_MODES;
const STRAIGHT = "garupa-flash-add-npm" as BLEND_MODES;

export function pixiFlashBlendMode(premultiplied: boolean): BLEND_MODES {
  return premultiplied ? PREMULTIPLIED : STRAIGHT;
}

/** Install only on the owning WebGL surface; stock blend modes are untouched. */
export function installPixiFlashBlend(renderer: Renderer): () => void {
  if (!(renderer instanceof WebGLRenderer)) {
    throw new Error("Flash source-alpha blending requires the simulator WebGL surface.");
  }
  const state = renderer.state;
  const original = state.setBlendMode;
  const setBlendMode: typeof original = (mode) => {
    if (mode !== PREMULTIPLIED && mode !== STRAIGHT) {
      original.call(state, mode);
      return;
    }
    if (state.blendMode === mode) return;
    // Let Pixi restore FUNC_ADD and its state cache before setting our tuple.
    original.call(state, "add");
    const gl = renderer.gl;
    gl.blendFuncSeparate(mode === PREMULTIPLIED ? gl.ONE : gl.SRC_ALPHA,
      gl.ONE, gl.SRC_ALPHA, gl.ONE);
    state.blendMode = mode;
  };
  state.setBlendMode = setBlendMode;
  return () => {
    if (state.setBlendMode === setBlendMode) state.setBlendMode = original;
  };
}

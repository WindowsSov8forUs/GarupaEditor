import { WebGLRenderer, type BLEND_MODES, type Renderer } from "pixi.js";

// Dedicated batch keys: Pixi's stock additive modes use One for source alpha.
// Keep RGB's premultiplied/non-premultiplied adaptation, but use SrcAlpha for A.
const PREMULTIPLIED = "garupa-flash-add" as BLEND_MODES;
const STRAIGHT = "garupa-flash-add-npm" as BLEND_MODES;
export const PIXI_STAGE_DARK_COVER_BLEND = "garupa-stage-reverse-subtract" as BLEND_MODES;

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
    if (state.blendMode === mode) return;
    const gl = renderer.gl;
    if (state.blendMode === PIXI_STAGE_DARK_COVER_BLEND) {
      // The custom equation is outside Pixi's stock blend-equation cache.
      gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    }
    if (mode === PIXI_STAGE_DARK_COVER_BLEND) {
      original.call(state, "normal");
      gl.blendEquationSeparate(gl.FUNC_REVERSE_SUBTRACT, gl.FUNC_ADD);
      // CE/RevSubtraction: destination RGB - source RGB * source alpha.
      // Preserve presentation coverage: the original opaque screen ignores
      // framebuffer alpha; our linear-output intermediate consumes that alpha.
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
      state.blendMode = mode;
      return;
    }
    if (mode !== PREMULTIPLIED && mode !== STRAIGHT) {
      original.call(state, mode);
      return;
    }
    // Let Pixi restore FUNC_ADD and its state cache before setting our tuple.
    original.call(state, "add");
    gl.blendFuncSeparate(mode === PREMULTIPLIED ? gl.ONE : gl.SRC_ALPHA,
      gl.ONE, gl.SRC_ALPHA, gl.ONE);
    state.blendMode = mode;
  };
  state.setBlendMode = setBlendMode;
  return () => {
    if (state.setBlendMode === setBlendMode) {
      if (state.blendMode === PIXI_STAGE_DARK_COVER_BLEND) setBlendMode("normal");
      state.setBlendMode = original;
    }
  };
}

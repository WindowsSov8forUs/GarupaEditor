import runtimeUiBindingReport from "../assets/ui/runtime-ui-binding-report.json";

interface RuntimeVector2 {
  x: number;
  y: number;
}

interface RuntimeVector3 extends RuntimeVector2 {
  z: number;
}

interface RuntimeLaneEffectSource {
  gameobject?: string;
  button_base?: {
    button_type?: number;
  };
  button_transform?: {
    local_position?: RuntimeVector3;
  };
  noteLaneEffect?: {
    sprite_renderer?: {
      flip_x?: boolean;
    };
    sprite?: {
      name?: string;
      sprite?: {
        rect?: {
          width?: number;
          height?: number;
        };
        texture_rect?: {
          width?: number;
          height?: number;
        };
        texture_rect_offset?: RuntimeVector2;
        pivot?: RuntimeVector2;
        pixels_to_units?: number;
      };
    };
  };
}

interface RuntimeUiBindingReport {
  gameplay_buttons?: RuntimeLaneEffectSource[];
}

export interface RuntimeLaneEffectBinding {
  buttonType: number;
  textureIndex: number;
  flipX: boolean;
  rect: {
    width: number;
    height: number;
  };
  textureRect: {
    width: number;
    height: number;
  };
  textureRectOffset: RuntimeVector2;
  pivot: RuntimeVector2;
  pixelsToUnits: number;
}

const runtimeReport = runtimeUiBindingReport as RuntimeUiBindingReport;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseLaneEffectBinding(source: RuntimeLaneEffectSource): RuntimeLaneEffectBinding | null {
  const buttonType = source.button_base?.button_type;
  const spriteName = source.noteLaneEffect?.sprite?.name;
  const sprite = source.noteLaneEffect?.sprite?.sprite;
  const textureIndexMatch = typeof spriteName === "string"
    ? /^NoteLaneEffect_(\d+)$/.exec(spriteName)
    : null;
  const textureIndex = textureIndexMatch ? Number(textureIndexMatch[1]) : NaN;

  if (
    !finiteNumber(buttonType)
    || !Number.isInteger(buttonType)
    || buttonType < 0
    || buttonType > 6
    || !Number.isInteger(textureIndex)
    || textureIndex < 1
    || textureIndex > 4
    || !finiteNumber(sprite?.rect?.width)
    || !finiteNumber(sprite.rect.height)
    || !finiteNumber(sprite.texture_rect?.width)
    || !finiteNumber(sprite.texture_rect.height)
    || !finiteNumber(sprite.texture_rect_offset?.x)
    || !finiteNumber(sprite.texture_rect_offset.y)
    || !finiteNumber(sprite.pivot?.x)
    || !finiteNumber(sprite.pivot.y)
    || !finiteNumber(sprite.pixels_to_units)
    || sprite.pixels_to_units <= 0
  ) {
    return null;
  }

  return {
    buttonType,
    textureIndex,
    flipX: source.noteLaneEffect?.sprite_renderer?.flip_x === true,
    rect: {
      width: sprite.rect.width,
      height: sprite.rect.height,
    },
    textureRect: {
      width: sprite.texture_rect.width,
      height: sprite.texture_rect.height,
    },
    textureRectOffset: {
      x: sprite.texture_rect_offset.x,
      y: sprite.texture_rect_offset.y,
    },
    pivot: {
      x: sprite.pivot.x,
      y: sprite.pivot.y,
    },
    pixelsToUnits: sprite.pixels_to_units,
  };
}

const fullButtonEntries = (runtimeReport.gameplay_buttons ?? []).filter((entry) => (
  typeof entry.gameobject === "string" && /^Button\d+$/.test(entry.gameobject)
));

const laneEffectBindings = fullButtonEntries
  .map(parseLaneEffectBinding)
  .filter((binding): binding is RuntimeLaneEffectBinding => binding !== null)
  .sort((a, b) => a.buttonType - b.buttonType);

if (laneEffectBindings.length !== 7 || laneEffectBindings.some((binding, index) => binding.buttonType !== index)) {
  throw new Error("Missing runtime NoteLaneEffect bindings for Button1..Button7");
}

function resolveLaneButtonSpacing(): number {
  const positions = fullButtonEntries
    .map((entry) => ({
      buttonType: entry.button_base?.button_type,
      x: entry.button_transform?.local_position?.x,
    }))
    .filter((entry): entry is { buttonType: number; x: number } => (
      finiteNumber(entry.buttonType)
      && Number.isInteger(entry.buttonType)
      && finiteNumber(entry.x)
    ))
    .sort((a, b) => a.buttonType - b.buttonType);

  const deltas: number[] = [];
  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1];
    const current = positions[index];
    if (current.buttonType === previous.buttonType + 1) {
      deltas.push(current.x - previous.x);
    }
  }

  const average = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  if (!Number.isFinite(average) || average <= 0) {
    throw new Error("Missing runtime NoteLaneEffect button spacing");
  }
  return average;
}

const laneEffectReference = laneEffectBindings[0];

// Data source: bundled copy of
// HOST________/VSCode/bangdream-apk/reverse/analysis/targets/runtime-ui-binding-report.json.
export const RHYTHM_LANE_EFFECT_HEIGHT_TO_LANE_WIDTH_RATIO =
  (laneEffectReference.rect.height / laneEffectReference.pixelsToUnits) / resolveLaneButtonSpacing();

export function getRuntimeLaneEffectBinding(visualLane: number): RuntimeLaneEffectBinding {
  const buttonType = Math.max(0, Math.min(6, Math.round(Number.isFinite(visualLane) ? visualLane : 0)));
  return laneEffectBindings[buttonType];
}

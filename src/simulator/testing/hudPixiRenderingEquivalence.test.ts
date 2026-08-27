export function assertHudPixiRenderingEquivalence(
  score: any,
  life: any,
  componentProfile: any,
): void {
  equal(score.hudScoreHighRankGeneration, 1, "ScoreGaugeSS persistent graph generation");
  const expected = new Map(componentProfile.high_rank_effect.nodes.map((node: any) => [
    node.path.split("/").pop(), node,
  ]));
  equal(score.hudScoreHighRankNodes?.length, 11, "ScoreGaugeSS eleven component nodes");
  for (const actual of score.hudScoreHighRankNodes ?? []) {
    const source: any = expected.get(actual.name);
    if (source === undefined) throw new Error(`unexpected ScoreGaugeSS node ${actual.name}`);
    const expectedTexture = source.resolved_texture_name === "ss_kira"
      ? "high-rank-kira"
      : source.resolved_texture_name === "ss_overlay"
      ? "high-rank-overlay"
      : "high-rank-long-star";
    equal(actual.textureKey, expectedTexture, `${actual.name} texture`);
    equal(JSON.stringify(actual.widgetSize), JSON.stringify([source.width, source.height]), `${actual.name} widget`);
    equal(JSON.stringify(actual.anchor), JSON.stringify([source.pivot === "Left" ? 0 : 0.5, 0.5]), `${actual.name} pivot`);
    equal(actual.tint, tint(source.color_f32_bits), `${actual.name} color`);
    close(actual.alpha, littleF32(source.color_f32_bits[3]), `${actual.name} alpha`);
    equal(actual.blend, "normal", `${actual.name} blend`);
  }
  equal(score.hudScoreIndicatorMask?.softness?.join(","), "20,3", "Score UIPanel softness");
  const lifeNodes = new Map((life.hudSpriteNodes ?? []).map((node: any) => [node.label, node]));
  equal((lifeNodes.get("life-gauge-base") as any)?.tint, 0xffffff, "Life GaugeBG white component color");
  equal((lifeNodes.get("life-primary") as any)?.maskLabel, "life-primary-fill-mask", "Life FrontGauge fill owner");
  equal((lifeNodes.get("life-secondary") as any)?.maskLabel, "life-secondary-fill-mask", "Life second gauge fill owner");
}

function littleF32(bits: string): number {
  const bytes = bits.match(/../g)!.map((entry) => Number.parseInt(entry, 16));
  return new DataView(Uint8Array.from(bytes).buffer).getFloat32(0, true);
}

function tint(bits: readonly string[]): number {
  const channel = (value: string) => {
    const srgb = littleF32(value);
    const linear = srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
    return Math.round(linear * 255);
  };
  return (channel(bits[0]!) << 16) | (channel(bits[1]!) << 8) | channel(bits[2]!);
}

function close(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-6) throw new Error(`${label}: ${actual} !== ${expected}`);
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`);
}

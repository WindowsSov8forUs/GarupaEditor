export interface OrdinaryHudStreamedKey {
  readonly index: number;
  readonly coefficients: readonly [number, number, number, number];
}

export interface OrdinaryHudStreamedFrame {
  readonly time: number;
  readonly keys: readonly OrdinaryHudStreamedKey[];
}

const frame = (
  time: number,
  keys: readonly OrdinaryHudStreamedKey[],
): OrdinaryHudStreamedFrame => Object.freeze({ time, keys: Object.freeze(keys) });

const key = (
  index: number,
  coefficients: readonly [number, number, number, number],
): OrdinaryHudStreamedKey => Object.freeze({ index, coefficients: Object.freeze(coefficients) });

/**
 * Current 10.1.4 ordinary HUD descendant/layout profile.
 * Source: pushed Reverse 6908ddfa8a45721f981e2356a9dde84970313bae.
 */
export const CURRENT_ORDINARY_HUD_PROFILE = Object.freeze({
  sorting: Object.freeze({
    domainLayer: 3,
    sortingOrder: 100,
    backPanelDepth: 0,
    frontPanelDepth: 1,
  }),
  combo: Object.freeze({
    numberLocalPosition: Object.freeze([22, 0] as const),
    padding: -12,
    digitInnerWidth: 82,
    digitDepth: 5,
    unitDepth: 6,
  }),
  addScore: Object.freeze({
    numberBaseAuthoredPosition: Object.freeze([-129, 224] as const),
    numberScale: Math.fround(0.6000000238418579),
    padding: 1,
    maxValueDigits: 6,
    initialLocalY: -50,
    phaseSeconds: Math.fround(0.14000000059604645),
    digitInnerWidths: Object.freeze({
      icon_number_plus: 47,
      icon_number_0: 43,
      icon_number_1: 30,
      icon_number_2: 45,
      icon_number_3: 45,
      icon_number_4: 47,
      icon_number_5: 46,
      icon_number_6: 46,
      icon_number_7: 45,
      icon_number_8: 46,
      icon_number_9: 44,
    } as const),
  }),
  result: Object.freeze({
    rootScale: Math.fround(0.800000011920929),
    judgeDepth: 5,
    timingLocalPosition: Object.freeze([4, -38] as const),
    timingLocalScale: Math.fround(1.25),
    timingDepth: 55,
    visibleSeconds: 1,
    gameJudge: Object.freeze({
      durationSeconds: Math.fround(0.47999998927116394),
      curveCount: 4,
      frames: Object.freeze([
        frame(0, [
          key(0, [-3125.000244140625, 125.00000762939453, 7.500000476837158, 0.800000011920929]),
          key(1, [-3125.000244140625, 125.00000762939453, 7.500000476837158, 0.800000011920929]),
          key(2, [0, 0, 0, 1]),
          key(3, [-3124.999755859375, 124.99999237060547, 10, 0.6000000238418579]),
        ]),
        frame(Math.fround(0.03999999910593033), [
          key(0, [3905.316162109375, -281.212646484375, 2.5, 1.100000023841858]),
          key(1, [3906.32861328125, -281.253173828125, 2.5, 1.100000023841858]),
          key(2, [0, 0, 0, 1]),
          key(3, [3124.999755859375, -249.99998474121094, 5, 1]),
        ]),
        frame(Math.fround(0.07999999821186066), [
          key(0, [0, 0, 0, 1]), key(1, [0, 0, 0, 1]),
          key(2, [0, 0, 0, 1]), key(3, [0, 0, 0, 1]),
        ]),
        frame(Math.fround(0.20000000298023224), [
          key(0, [0, 0, 0, 1]),
          key(1, [0, 0, 0, 1.0000300407409668]),
          key(2, [0, 0, 0, 1]),
        ]),
        frame(Math.fround(0.23999999463558197), [
          key(0, [0, 0, 0, 0.9995216131210327]),
          key(1, [0, 0, 0, 1.0000300407409668]),
          key(2, [0, 0, 0, 1]),
        ]),
        frame(Math.fround(0.47999998927116394), [
          key(0, [0, 0, 0, 1]), key(1, [0, 0, 0, 1]),
          key(2, [0, 0, 0, 1]), key(3, [0, 0, 0, 1]),
        ]),
      ]),
    }),
  }),
  life: Object.freeze({
    rootPosition: Object.freeze([411, 309] as const),
    borders: Object.freeze({
      gauge_base: Object.freeze([39, 143, 0, 0] as const),
      primary: Object.freeze([4, 4, 0, 0] as const),
      second: Object.freeze([8, 8, 0, 0] as const),
      warning_outline: Object.freeze([15, 158, 0, 0] as const),
      warning_body: Object.freeze([6, 6, 5, 5] as const),
      game_over_background: Object.freeze([50, 50, 0, 0] as const),
    }),
    lifeLabel: Object.freeze({
      authoredPosition: Object.freeze([Math.fround(307.0000915527344), 235] as const),
      pivot: "right" as const,
      fontSize: 18,
      depth: 42,
    }),
    warningTween: Object.freeze({
      durationSeconds: 1,
      fromAlpha: Math.fround(0.6000000238418579),
      toAlpha: 1,
    }),
    gameOverLabel: Object.freeze({
      authoredPosition: Object.freeze([97, 167] as const),
      pivot: "left" as const,
      fontSize: 22,
      depth: 40,
      text: "ライフゼロ!\n獲得スコアDOWN!",
      tint: 0xff0000,
    }),
    gameOverLabelTween: Object.freeze({
      durationSeconds: 1,
      fromAlpha: Math.fround(0.1080000028014183),
      toAlpha: 1,
    }),
  }),
});

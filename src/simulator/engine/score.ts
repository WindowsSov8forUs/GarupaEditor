export function isJudgedType(type: number): boolean {
  return type !== 0 && type !== 20 && type !== 41 && type !== 42 && type !== 77 && type !== 100 && type !== 107 && type !== 110;
}

export function isFlickType(type: number): boolean {
  return type === 2 || type === 12 || type === 13 || type === 26 || type === 74 || type === 102 || type === 106;
}

export function isHiddenNoSeType(type: number): boolean {
  return type === 41 || type === 42 || type === 77 || type === 107;
}

export function hitEffectKind(type: number): "normal" | "flick" | null {
  if (
    type === 1 ||
    type === 5 ||
    type === 8 ||
    type === 9 ||
    type === 3 ||
    type === 6 ||
    type === 4 ||
    type === 7 ||
    type === 14 ||
    type === 15 ||
    type === 16 ||
    type === 71 ||
    type === 72 ||
    type === 73 ||
    type === 78 ||
    type === 101 ||
    type === 103 ||
    type === 104 ||
    type === 105 ||
    type === 108
  ) {
    return "normal";
  }
  if (type === 2 || type === 12 || type === 13 || type === 26 || type === 74 || type === 102 || type === 106) {
    return "flick";
  }
  return null;
}

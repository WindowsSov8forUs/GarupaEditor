export function minimapLaneVisible(center: number, span: number, count: number) {
  return Number.isFinite(center) && center - span / 2 >= 0 && center + span / 2 <= count;
}

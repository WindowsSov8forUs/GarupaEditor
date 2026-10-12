// ScreenLayer / ScreenSlideInOut; delivered home-screen-transition-contract.
// Distance is already in the animated wrapper's CSS pixel coordinate space.
export function originalPageMotion(home: boolean, exiting: boolean, progress: number, distance: number, forward = true) {
  const p = Math.max(0, Math.min(1, progress));
  if (!home) return { opacity: exiting ? 1 - p : p, x: 0 };
  const eased = Math.sin(p * Math.PI / 2);
  return { opacity: 1, x: (forward ? 1 : -1) * (exiting ? -distance * eased : distance * (1 - eased)) };
}

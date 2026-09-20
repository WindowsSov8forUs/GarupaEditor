import type { KeyboardEvent } from "react";

/** Host focus navigation only; Enter/Space still use the shared original button action. */
export function moveOriginalOptionFocus(event: KeyboardEvent<HTMLButtonElement>, role?: string): void {
  if (role !== "tab" && role !== "radio") return;
  const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
    : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (!direction && event.key !== "Home" && event.key !== "End") return;
  const selector = role === "radio" ? '[role="radiogroup"]' : ".original-authored-window";
  const group = event.currentTarget.closest(selector);
  if (!group || event.currentTarget.closest("[inert]")) return;
  const options = [...group.querySelectorAll<HTMLButtonElement>(`button[role="${role}"][data-original-option-index]`)]
    .filter(button => !button.disabled && !button.closest("[inert]") && button.closest(selector) === group
      && button.getClientRects().length > 0)
    .sort((a, b) => Number(a.dataset.originalOptionIndex) - Number(b.dataset.originalOptionIndex));
  const current = options.indexOf(event.currentTarget);
  if (current < 0 || !options.length) return;
  event.preventDefault(); event.stopPropagation();
  const index = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
    : (current + direction + options.length) % options.length;
  options[index]!.focus({ preventScroll: true });
  options[index]!.scrollIntoView({ block: "nearest", inline: "nearest" });
}

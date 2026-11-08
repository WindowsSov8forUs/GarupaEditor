import { useRef } from "react";

// Render-output callbacks stay as passed, so the children they feed still see new output on each render.
const PASS_THROUGH_MEMBER = /^(render|get|resolve|minimap|format|build|compute)/;

/** Keeps every callback member of a view model at a stable identity, forwarding to the latest closure. */
export function useStableEvents<T extends Record<string, unknown>>(members: T): T {
  const latest = useRef(members);
  latest.current = members;
  const wrappers = useRef(new Map<string, (...args: unknown[]) => unknown>());
  const stable: Record<string, unknown> = {};
  for (const key of Object.keys(members)) {
    const value = members[key];
    if (typeof value !== "function" || PASS_THROUGH_MEMBER.test(key)) {
      stable[key] = value;
      continue;
    }
    let wrapper = wrappers.current.get(key);
    if (!wrapper) {
      wrapper = (...args: unknown[]) => (latest.current[key] as (...a: unknown[]) => unknown)(...args);
      wrappers.current.set(key, wrapper);
    }
    stable[key] = wrapper;
  }
  return stable as T;
}

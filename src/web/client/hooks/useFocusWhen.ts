import { useEffect, type RefObject } from "react";

/**
 * Moves focus to `ref` each time `when` becomes true, so a screen reader starts at the new
 * content's heading once it has rendered.
 */
export function useFocusWhen(ref: RefObject<HTMLElement | null>, when: boolean): void {
  useEffect(() => {
    if (when) ref.current?.focus();
  }, [ref, when]);
}

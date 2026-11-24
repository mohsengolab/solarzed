import type { KeyboardEvent, MouseEvent } from "react";

/** Props for a modal's backdrop element: close on Escape, or on a click on the backdrop itself.
 *  The press must start on the backdrop too, so dragging a text selection out of an input
 *  and releasing outside the dialog does not close it. */
export function backdropProps(close: () => void) {
  return {
    onMouseDown: (e: MouseEvent<HTMLElement>) => { e.currentTarget.dataset.pressed = e.target === e.currentTarget ? "1" : ""; },
    onClick: (e: MouseEvent<HTMLElement>) => { if (e.target === e.currentTarget && e.currentTarget.dataset.pressed === "1") close(); },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => { if (e.key === "Escape") close(); },
  };
}

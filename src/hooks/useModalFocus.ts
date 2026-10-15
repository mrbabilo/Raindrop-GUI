import { useEffect, useRef } from "react";

/** Focus initial, confinement clavier et restitution au déclencheur. */
export function useModalFocus(onClose: () => void) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    if (!element) return;
    element.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(element.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]',
      )).filter((node) => node.tabIndex >= 0 && !node.matches(':disabled, [hidden], input[type="hidden"]')
        && node.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        element.focus();
      } else if (!element.contains(document.activeElement) || document.activeElement === element
        || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last ?? first : first).focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return dialog;
}

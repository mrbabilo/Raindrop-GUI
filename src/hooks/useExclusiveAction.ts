import { useRef, useState } from "react";

/** Verrouille toute l'action, y compris les intervalles entre mutations. */
export function useExclusiveAction() {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return { pending, run };
}

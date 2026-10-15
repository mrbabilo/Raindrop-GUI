import type { ComponentPropsWithoutRef } from "react";
import { useSelectionPeinte } from "../hooks/useSelectionPeinte";

/** Case contrôlée commune aux listes : clic, Maj-clic et peinture au survol. */
export function CaseSelection({ checked, disabled, onToggle, className = "", ...props }: {
  checked: boolean;
  disabled?: boolean;
  onToggle(plage?: boolean): void;
} & Omit<ComponentPropsWithoutRef<"input">, "checked" | "disabled" | "onChange" | "onClick" | "onPointerDown" | "onPointerEnter" | "type">) {
  const geste = useSelectionPeinte({ checked, disabled, onToggle });
  return (
    <input
      {...props}
      {...geste}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      readOnly
      className={`selection-checkbox ${className}`.trim()}
    />
  );
}

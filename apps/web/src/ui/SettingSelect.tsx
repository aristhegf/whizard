import {
  MorphSelect,
  MorphSelectContent,
  MorphSelectItem,
  MorphSelectTrigger,
  MorphSelectValue,
} from "@/components/motion/select-morph";
import type { ReactNode } from "react";
import { useMediaQuery } from "./common";
import { Icon, type IconName } from "./Icon";

export interface SettingOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * A setting's dropdown. Tablets and computers get a BeUI morphing dropdown; phones keep the
 * built-in picker, which is easier with a thumb. `id` goes on the control, for its <label>.
 */
export function SettingSelect({
  id,
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: SettingOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const morph = useMediaQuery("(min-width: 768px)");

  if (!morph) {
    return (
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div id={id} className="setting-morph">
      <MorphSelect value={value} onValueChange={onChange} disabled={disabled}>
        <MorphSelectTrigger className="setting-morph-trigger">
          <span className="sr-only">{label}: </span>
          <MorphSelectValue />
        </MorphSelectTrigger>
        <MorphSelectContent className="setting-morph-list">
          {options.map((o) => (
            <MorphSelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </MorphSelectItem>
          ))}
        </MorphSelectContent>
      </MorphSelect>
    </div>
  );
}

/** Focuses a setting by its id, whichever kind of dropdown it is right now. */
export function focusSetting(id: string) {
  const el = document.getElementById(id);
  (el instanceof HTMLSelectElement ? el : el?.querySelector("button"))?.focus();
}

/** A row in the lobby's Room Settings list: icon, label and its control. */
export function SettingRow({
  icon,
  id,
  label,
  children,
}: {
  icon: IconName;
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <Icon name={icon} size={20} />
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

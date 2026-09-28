import {
  MorphSelect,
  MorphSelectContent,
  MorphSelectItem,
  MorphSelectTrigger,
  MorphSelectValue,
} from "@/components/motion/select-morph";
import { Fragment, type ReactNode } from "react";
import { useMediaQuery } from "./common";
import { Icon, type IconName } from "./Icon";

export interface SettingOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Options with the same group sit together under its name. Keep each group's options together. */
  group?: string;
}

/** Runs of options by group, in order; options without one are a run of their own. */
function grouped(options: SettingOption[]) {
  const runs: { group?: string; options: SettingOption[] }[] = [];
  for (const o of options) {
    const last = runs.at(-1);
    if (last && last.group === o.group) last.options.push(o);
    else runs.push({ group: o.group, options: [o] });
  }
  return runs;
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
        {grouped(options).map((run, i) => {
          const items = run.options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ));
          return run.group ? (
            <optgroup key={run.group} label={run.group}>
              {items}
            </optgroup>
          ) : (
            <Fragment key={i}>{items}</Fragment>
          );
        })}
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
          {grouped(options).map((run, i) => (
            <Fragment key={run.group ?? i}>
              {run.group && (
                <li className="setting-morph-group" role="presentation">
                  {run.group}
                </li>
              )}
              {run.options.map((o) => (
                <MorphSelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </MorphSelectItem>
              ))}
            </Fragment>
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

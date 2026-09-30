import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cssZoom } from "./common";
import { Icon, type IconName } from "./Icon";
import { InfoTip } from "./InfoTip";

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
 * A setting's dropdown: the choice, which opens its options under the row as an accordion
 * (transitions.dev), on phones and computers alike. `id` goes on the control, which is where
 * {@link focusSetting} looks for it.
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
  return (
    <AccordionSelect
      id={id}
      label={label}
      value={value}
      options={options}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

/** The gap a floating list of choices keeps from the edge of what it floats in. */
const EDGE_GAP = 10;

/**
 * The choices open under the row. On the lobby's sign they push the rest of the sign down. In a
 * sheet (anything marked `data-float-choices`) they float instead, so the sheet keeps its height:
 * over what's below where they fit there, over what's above where they fit there, and otherwise
 * slid up over their own row far enough to fit, as a menu would be. The list is always kept
 * inside the sheet, and scrolls if it's longer than the sheet is tall.
 */
function AccordionSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: SettingOption[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Set when the choices float: which way they open, how tall they may be, and how far they're
  // slid up over their own row to fit, in px.
  const [float, setFloat] = useState<{ up: boolean; room: number; shift: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLButtonElement>(null);
  const panel = useId();
  const current = options.find((o) => o.value === value);

  const toggle = () => {
    if (open) return setOpen(false);
    const frame = root.current?.closest("[data-float-choices]");
    const list = root.current?.querySelector(".t-acc-list");
    if (frame && list && head.current) {
      // Screen pixels throughout, then into the list's own, which a scaled page makes different.
      const zoom = cssZoom(frame);
      const box = frame.getBoundingClientRect();
      const at = head.current.getBoundingClientRect();
      const below = box.bottom - at.bottom - EDGE_GAP;
      const above = at.top - box.top - EDGE_GAP;
      // The whole list, whatever an earlier opening limited it to.
      const need = Math.min(list.scrollHeight * zoom + 4, box.height - 2 * EDGE_GAP);
      if (need <= below) setFloat({ up: false, room: below / zoom, shift: 0 });
      else if (need <= above) setFloat({ up: true, room: above / zoom, shift: 0 });
      else setFloat({ up: false, room: need / zoom, shift: (need - below) / zoom });
    } else {
      setFloat(null);
    }
    setOpen(true);
  };

  // A tap anywhere else closes it; so does Escape, without also closing a sheet it's in.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      head.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const pick = (next: string) => {
    if (next !== value) onChange(next);
    setOpen(false);
    head.current?.focus();
  };

  return (
    <div
      ref={root}
      id={id}
      className={`setting-acc t-acc${float ? (float.up ? " floating up" : " floating") : ""}`}
      data-open={open}
      style={
        float
          ? ({
              "--acc-room": `${float.room}px`,
              "--acc-shift": `${float.shift}px`,
            } as CSSProperties)
          : undefined
      }
    >
      <button
        ref={head}
        type="button"
        className="t-acc-head"
        aria-expanded={open}
        aria-controls={panel}
        data-value={value}
        disabled={disabled}
        onClick={toggle}
      >
        <span className="sr-only">{label}: </span>
        <span className="t-acc-value">{current?.label ?? value}</span>
        {!disabled && (
          <span className="t-acc-chevron" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M4 6.5L8 10.5L12 6.5" />
            </svg>
          </span>
        )}
      </button>
      <div className="t-acc-panel" id={panel} inert={!open}>
        <div className="t-acc-panel-inner">
          <div className="t-acc-list" role="listbox" aria-label={label}>
            {grouped(options).map((run, i) => (
              <Fragment key={run.group ?? i}>
                {run.group && (
                  <span className="t-acc-group" aria-hidden="true">
                    {run.group}
                  </span>
                )}
                {run.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    data-value={o.value}
                    disabled={o.disabled}
                    onClick={() => pick(o.value)}
                  >
                    {o.label}
                    {o.value === value && <Icon name="check" size={16} />}
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Focuses a setting by its id. */
export function focusSetting(id: string) {
  document.getElementById(id)?.querySelector("button")?.focus();
}

/**
 * A row in the lobby's Room Settings list: icon, label and its control. What the setting means
 * goes in `hint`, which waits behind an (i) beside the label rather than sitting under the row.
 */
export function SettingRow({
  icon,
  id,
  label,
  hint,
  children,
}: {
  icon: IconName;
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <Icon name={icon} size={20} />
      <span className="setting-label">
        <label htmlFor={id}>{label}</label>
        {hint && <InfoTip label={`About ${label}`}>{hint}</InfoTip>}
      </span>
      {children}
    </div>
  );
}

import type { AccountUpdate } from "@whizard/protocol";
import { updateAccount } from "../account";
import { useToastAction } from "./toast";

/**
 * The controls behind every setting, shared by the Settings dialog and the settings page so the
 * two always change the same things in the same way. Each place styles them to suit.
 */

/** An on/off switch, named by the label it points to or, with no label on screen, by `label`. */
export function Switch({
  checked,
  onChange,
  labelledBy,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/** One of a few options, as a row of buttons with the chosen one pressed. */
export function Segmented<T>({
  labelledBy,
  options,
  value,
  disabled = false,
  onPick,
}: {
  labelledBy: string;
  options: readonly (readonly [string, T])[];
  value: T;
  disabled?: boolean;
  onPick: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-labelledby={labelledBy}>
      {options.map(([name, option]) => (
        <button
          key={name}
          type="button"
          aria-pressed={value === option}
          disabled={disabled}
          onClick={() => value !== option && onPick(option)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** When a quiz shows the explanations. Solo games only; with friends they wait for the end. */
export const EXPLANATION_CHOICES = [
  ["After each question", true],
  ["At the end", false],
] as const;

/** How long the result stays after answering, before the next question. */
export const AFTER_ANSWER_CHOICES = [
  ["Pause 3 seconds", true],
  ["Go straight on", false],
] as const;

/** Saves settings to the account, so they follow the player to every device. */
export function useAccountSetting() {
  const saving = useToastAction();
  return {
    busy: saving.busy,
    save: (update: AccountUpdate) => void saving.run(() => updateAccount(update)),
  };
}

import {
  LOGIC_MINUTES,
  LOGIC_SIZES,
  logicSettingsSchema,
  type LogicSettings,
} from "@whizard/game-core";
import { LevelRow, TimeRow } from "../settingRows";

export function parseLogicSettings(settings: unknown): LogicSettings | null {
  const parsed = logicSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export const gridName = (size: number) => {
  const shape = LOGIC_SIZES.find((s) => s.size === size);
  return shape ? `${shape.name} · ${size}×${size}` : `${size}×${size}`;
};

/** Logic's rows in the lobby's Room Settings list. Only the host can change them. */
export function LogicSettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: LogicSettings;
  editable: boolean;
  onChange: (settings: LogicSettings) => void;
}) {
  return (
    <>
      <LevelRow
        choices={LOGIC_SIZES.map((s) => ({ value: String(s.size), label: gridName(s.size) }))}
        value={String(settings.size)}
        editable={editable}
        onChange={(size) => onChange({ ...settings, size: Number(size) as LogicSettings["size"] })}
      />
      <TimeRow
        label="Time limit"
        value={settings.minutes}
        choices={LOGIC_MINUTES}
        unit="minutes"
        editable={editable}
        onChange={(minutes) =>
          onChange({ ...settings, minutes: minutes as LogicSettings["minutes"] })
        }
      />
    </>
  );
}

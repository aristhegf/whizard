import {
  LOGIC_MINUTES,
  LOGIC_SIZES,
  logicSettingsSchema,
  type LogicSettings,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";

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
      <SettingRow icon="layers" id="grid" label="Grid">
        <SettingSelect
          id="grid"
          label="Grid"
          value={String(settings.size)}
          disabled={!editable}
          options={LOGIC_SIZES.map((s) => ({ value: String(s.size), label: gridName(s.size) }))}
          onChange={(value) =>
            onChange({ ...settings, size: Number(value) as LogicSettings["size"] })
          }
        />
      </SettingRow>
      <SettingRow icon="clock" id="minutes" label="Time">
        <SettingSelect
          id="minutes"
          label="Time"
          value={String(settings.minutes)}
          disabled={!editable}
          options={LOGIC_MINUTES.map((m) => ({ value: String(m), label: `${m} minutes` }))}
          onChange={(value) =>
            onChange({ ...settings, minutes: Number(value) as LogicSettings["minutes"] })
          }
        />
      </SettingRow>
    </>
  );
}

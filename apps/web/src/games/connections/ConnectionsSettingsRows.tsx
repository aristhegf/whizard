import {
  CONNECTIONS_MINUTES,
  LEVELS,
  LEVEL_NAMES,
  connectionsSettingsSchema,
  type ConnectionsSettings,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";

export function parseConnectionsSettings(settings: unknown): ConnectionsSettings | null {
  const parsed = connectionsSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

/** Connections' rows in the lobby's Room Settings list. Only the host can change them. */
export function ConnectionsSettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: ConnectionsSettings;
  editable: boolean;
  onChange: (settings: ConnectionsSettings) => void;
}) {
  return (
    <>
      <SettingRow icon="trophy" id="level" label="Level">
        <SettingSelect
          id="level"
          label="Level"
          value={settings.level}
          disabled={!editable}
          options={LEVELS.map((level) => ({ value: level, label: LEVEL_NAMES[level] }))}
          onChange={(value) =>
            onChange({ ...settings, level: value as ConnectionsSettings["level"] })
          }
        />
      </SettingRow>
      <SettingRow icon="clock" id="minutes" label="Time">
        <SettingSelect
          id="minutes"
          label="Time"
          value={String(settings.minutes)}
          disabled={!editable}
          options={CONNECTIONS_MINUTES.map((m) => ({ value: String(m), label: `${m} minutes` }))}
          onChange={(value) =>
            onChange({ ...settings, minutes: Number(value) as ConnectionsSettings["minutes"] })
          }
        />
      </SettingRow>
    </>
  );
}

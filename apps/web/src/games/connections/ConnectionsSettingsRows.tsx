import {
  CONNECTIONS_MINUTES,
  LEVELS,
  LEVEL_NAMES,
  connectionsSettingsSchema,
  type ConnectionsSettings,
} from "@whizard/game-core";
import { LevelRow, TimeRow } from "../settingRows";

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
      <LevelRow
        choices={LEVELS.map((level) => ({ value: level, label: LEVEL_NAMES[level] }))}
        value={settings.level}
        editable={editable}
        onChange={(level) => onChange({ ...settings, level })}
      />
      <TimeRow
        label="Time limit"
        value={settings.minutes}
        choices={CONNECTIONS_MINUTES}
        unit="minutes"
        editable={editable}
        onChange={(minutes) =>
          onChange({ ...settings, minutes: minutes as ConnectionsSettings["minutes"] })
        }
      />
    </>
  );
}

import {
  CONNECTIONS_MINUTES,
  CONNECTIONS_MODES,
  LEVELS,
  LEVEL_NAMES,
  connectionsSettingsSchema,
  type ConnectionsMode,
  type ConnectionsSettings,
} from "@whizard/game-core";
import { eliminationLength, FixedTimeRow, LevelRow, ModeRow, TimeRow } from "../settingRows";

export function parseConnectionsSettings(settings: unknown): ConnectionsSettings | null {
  const parsed = connectionsSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export const connectionsModeName = (mode: ConnectionsMode) =>
  CONNECTIONS_MODES.find((m) => m.id === mode)?.name ?? mode;

/** Connections' rows in the lobby's Room Settings list. Only the host can change them. */
export function ConnectionsSettingsRows({
  settings,
  players,
  editable,
  onChange,
}: {
  settings: ConnectionsSettings;
  /** Players in the room now, for how long an Elimination game will be. */
  players: number;
  editable: boolean;
  onChange: (settings: ConnectionsSettings) => void;
}) {
  const elimination = settings.mode === "elimination";
  return (
    <>
      <ModeRow
        modes={CONNECTIONS_MODES}
        value={settings.mode}
        extra={elimination ? eliminationLength(players, null, "") : null}
        editable={editable}
        onChange={(mode) => onChange({ ...settings, mode })}
      />
      <LevelRow
        choices={LEVELS.map((level) => ({ value: level, label: LEVEL_NAMES[level] }))}
        value={settings.level}
        editable={editable}
        onChange={(level) => onChange({ ...settings, level })}
      />
      {settings.mode === "classic" ? (
        <FixedTimeRow label="Time limit" value="No clock" />
      ) : (
        <TimeRow
          label={elimination ? "Time per Round" : "Time limit"}
          value={settings.minutes}
          choices={CONNECTIONS_MINUTES}
          unit="minutes"
          editable={editable}
          onChange={(minutes) =>
            onChange({ ...settings, minutes: minutes as ConnectionsSettings["minutes"] })
          }
        />
      )}
    </>
  );
}

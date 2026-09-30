import {
  LOGIC_MINUTES,
  LOGIC_MODES,
  LOGIC_SIZES,
  logicSettingsSchema,
  type LogicMode,
  type LogicSettings,
} from "@whizard/game-core";
import { eliminationLength, FixedTimeRow, LevelRow, ModeRow, TimeRow } from "../settingRows";

export function parseLogicSettings(settings: unknown): LogicSettings | null {
  const parsed = logicSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export const gridName = (size: number) => {
  const shape = LOGIC_SIZES.find((s) => s.size === size);
  return shape ? `${shape.name} · ${size}×${size}` : `${size}×${size}`;
};

export const logicModeName = (mode: LogicMode) =>
  LOGIC_MODES.find((m) => m.id === mode)?.name ?? mode;

/** Logic's rows in the lobby's Room Settings list. Only the host can change them. */
export function LogicSettingsRows({
  settings,
  players,
  editable,
  onChange,
}: {
  settings: LogicSettings;
  /** Players in the room now, for how long an Elimination game will be. */
  players: number;
  editable: boolean;
  onChange: (settings: LogicSettings) => void;
}) {
  const elimination = settings.mode === "elimination";
  return (
    <>
      <ModeRow
        modes={LOGIC_MODES}
        value={settings.mode}
        extra={elimination ? eliminationLength(players, null, "") : null}
        editable={editable}
        onChange={(mode) => onChange({ ...settings, mode })}
      />
      <LevelRow
        choices={LOGIC_SIZES.map((s) => ({ value: String(s.size), label: gridName(s.size) }))}
        value={String(settings.size)}
        editable={editable}
        onChange={(size) => onChange({ ...settings, size: Number(size) as LogicSettings["size"] })}
      />
      {settings.mode === "classic" ? (
        <FixedTimeRow label="Time limit" value="No clock" />
      ) : (
        <TimeRow
          label={elimination ? "Time per Round" : "Time limit"}
          value={settings.minutes}
          choices={LOGIC_MINUTES}
          unit="minutes"
          editable={editable}
          onChange={(minutes) =>
            onChange({ ...settings, minutes: minutes as LogicSettings["minutes"] })
          }
        />
      )}
    </>
  );
}

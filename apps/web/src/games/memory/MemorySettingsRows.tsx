import {
  MEMORY_REVEAL_SECONDS,
  MEMORY_ROUNDS,
  memorySettingsSchema,
  type MemorySettings,
} from "@whizard/game-core";
import { LengthRow, TimeRow } from "../settingRows";

export function parseMemorySettings(settings: unknown): MemorySettings | null {
  const parsed = memorySettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

/** Memory's rows in the lobby's Room Settings list. Only the host can change them. */
export function MemorySettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: MemorySettings;
  editable: boolean;
  onChange: (settings: MemorySettings) => void;
}) {
  return (
    <>
      <LengthRow
        label="Rounds"
        value={settings.rounds}
        counts={[...MEMORY_ROUNDS]}
        editable={editable}
        onChange={(rounds) => onChange({ ...settings, rounds: rounds as MemorySettings["rounds"] })}
      />
      <TimeRow
        label="Time to remember"
        value={settings.revealSeconds}
        choices={[...MEMORY_REVEAL_SECONDS]}
        unit="seconds"
        editable={editable}
        onChange={(revealSeconds) =>
          onChange({ ...settings, revealSeconds: revealSeconds as MemorySettings["revealSeconds"] })
        }
      />
    </>
  );
}

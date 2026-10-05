import {
  REACTION_ROUNDS,
  REACTION_TAP_SECONDS,
  reactionSettingsSchema,
  type ReactionSettings,
} from "@whizard/game-core";
import { LengthRow, TimeRow } from "../settingRows";

export function parseReactionSettings(settings: unknown): ReactionSettings | null {
  const parsed = reactionSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

/** Reaction's rows in the lobby's Room Settings list. Only the host can change them. */
export function ReactionSettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: ReactionSettings;
  editable: boolean;
  onChange: (settings: ReactionSettings) => void;
}) {
  return (
    <>
      <LengthRow
        label="Rounds"
        value={settings.rounds}
        counts={[...REACTION_ROUNDS]}
        editable={editable}
        onChange={(rounds) =>
          onChange({ ...settings, rounds: rounds as ReactionSettings["rounds"] })
        }
      />
      <TimeRow
        label="Time to tap"
        value={settings.tapSeconds}
        choices={[...REACTION_TAP_SECONDS]}
        unit="seconds"
        editable={editable}
        onChange={(tapSeconds) =>
          onChange({ ...settings, tapSeconds: tapSeconds as ReactionSettings["tapSeconds"] })
        }
      />
    </>
  );
}

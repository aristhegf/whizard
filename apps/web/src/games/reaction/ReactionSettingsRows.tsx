import {
  REACTION_INSANE_SIZES,
  REACTION_LEVEL_NAMES,
  REACTION_LEVELS,
  REACTION_ROUNDS,
  REACTION_TAP_SECONDS,
  reactionSettingsSchema,
  type ReactionSettings,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";
import { LevelRow, LengthRow, TimeRow } from "../settingRows";

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
      <LevelRow
        choices={REACTION_LEVELS.map((level) => ({
          value: level,
          label: REACTION_LEVEL_NAMES[level],
        }))}
        value={settings.level}
        editable={editable}
        onChange={(level) => onChange({ ...settings, level })}
      />
      {/* How wide Insane's field is, since the level itself only says "Insane". */}
      {settings.level === "insane" && (
        <SettingRow icon="copy" id="insane-grid" label="Grid">
          <SettingSelect
            id="insane-grid"
            label="Grid"
            value={String(settings.insaneSize)}
            disabled={!editable}
            options={[...REACTION_INSANE_SIZES].map((n) => ({
              value: String(n),
              label: `${n}×${n}`,
            }))}
            onChange={(next) =>
              onChange({
                ...settings,
                insaneSize: Number(next) as ReactionSettings["insaneSize"],
              })
            }
          />
        </SettingRow>
      )}
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

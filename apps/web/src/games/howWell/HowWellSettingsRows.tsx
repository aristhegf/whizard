import {
  HOW_WELL_ANSWER_SECONDS,
  HOW_WELL_PACKS,
  HOW_WELL_ROUNDS,
  howWellSettingsSchema,
  type HowWellPack,
  type HowWellSettings,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";
import { LengthRow, TimeRow } from "../settingRows";

export function parseHowWellSettings(settings: unknown): HowWellSettings | null {
  const parsed = howWellSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export const packName = (pack: HowWellPack) => HOW_WELL_PACKS.find((p) => p.id === pack)?.name;

/** The lobby's one line: "Friend group, 10 rounds, 20s each". */
export const howWellSummary = ({ pack, rounds, answerSeconds }: HowWellSettings) =>
  `${packName(pack)}, ${rounds} rounds, ${answerSeconds}s each`;

/**
 * How Well Do You Know Me?'s rows in the lobby's Room Settings list: the question pack (the
 * game's own choice, first), then Rounds and Time limit. Only the host can change them.
 */
export function HowWellSettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: HowWellSettings;
  editable: boolean;
  onChange: (settings: HowWellSettings) => void;
}) {
  return (
    <>
      <SettingRow icon="heart" id="pack" label="Pack">
        <SettingSelect
          id="pack"
          label="Pack"
          value={settings.pack}
          disabled={!editable}
          options={HOW_WELL_PACKS.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(next) => onChange({ ...settings, pack: next as HowWellPack })}
        />
      </SettingRow>
      <LengthRow
        label="Rounds"
        value={settings.rounds}
        counts={[...HOW_WELL_ROUNDS]}
        editable={editable}
        onChange={(rounds) =>
          onChange({ ...settings, rounds: rounds as HowWellSettings["rounds"] })
        }
      />
      <TimeRow
        label="Time limit"
        value={settings.answerSeconds}
        choices={[...HOW_WELL_ANSWER_SECONDS]}
        unit="seconds"
        editable={editable}
        onChange={(answerSeconds) =>
          onChange({
            ...settings,
            answerSeconds: answerSeconds as HowWellSettings["answerSeconds"],
          })
        }
      />
    </>
  );
}

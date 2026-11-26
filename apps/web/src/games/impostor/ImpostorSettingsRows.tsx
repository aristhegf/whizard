import {
  IMPOSTOR_CLUE_MODES,
  IMPOSTOR_CLUE_SECONDS,
  IMPOSTOR_PACKS,
  IMPOSTOR_ROUNDS,
  IMPOSTOR_VOTE_SECONDS,
  impostorSettingsSchema,
  type ImpostorPack,
  type ImpostorSettings,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";
import { LengthRow, ModeRow, TimeRow } from "../settingRows";

export function parseImpostorSettings(settings: unknown): ImpostorSettings | null {
  const parsed = impostorSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export const packName = (pack: ImpostorPack) =>
  IMPOSTOR_PACKS.find((p) => p.id === pack)?.name ?? pack;

/** The lobby's one line: "Typed clues, Mixed words, 5 rounds". */
export function impostorSummary(settings: ImpostorSettings): string {
  const clues = settings.clues === "typed" ? "Typed clues" : "Clues out loud";
  return `${clues}, ${packName(settings.wordPack)} words, ${settings.rounds} rounds`;
}

/** Impostor's rows in the lobby's Room Settings list. Only the host can change them. */
export function ImpostorSettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: ImpostorSettings;
  editable: boolean;
  onChange: (settings: ImpostorSettings) => void;
}) {
  return (
    <>
      <ModeRow
        label="Clues"
        id="clue-mode"
        modes={IMPOSTOR_CLUE_MODES}
        value={settings.clues}
        editable={editable}
        onChange={(clues) => onChange({ ...settings, clues })}
      />
      <SettingRow icon="layers" id="word-pack" label="Word pack">
        <SettingSelect
          id="word-pack"
          label="Word pack"
          value={settings.wordPack}
          disabled={!editable}
          options={IMPOSTOR_PACKS.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(wordPack) => onChange({ ...settings, wordPack: wordPack as ImpostorPack })}
        />
      </SettingRow>
      <LengthRow
        label="Rounds"
        value={settings.rounds}
        counts={[...IMPOSTOR_ROUNDS]}
        editable={editable}
        onChange={(rounds) =>
          onChange({ ...settings, rounds: rounds as ImpostorSettings["rounds"] })
        }
      />
      <TimeRow
        label="Clue time"
        id="clue-time"
        value={settings.clueSeconds}
        choices={[...IMPOSTOR_CLUE_SECONDS]}
        unit="seconds"
        editable={editable}
        onChange={(clueSeconds) =>
          onChange({ ...settings, clueSeconds: clueSeconds as ImpostorSettings["clueSeconds"] })
        }
      />
      <TimeRow
        label="Vote time"
        id="vote-time"
        value={settings.voteSeconds}
        choices={[...IMPOSTOR_VOTE_SECONDS]}
        unit="seconds"
        editable={editable}
        onChange={(voteSeconds) =>
          onChange({ ...settings, voteSeconds: voteSeconds as ImpostorSettings["voteSeconds"] })
        }
      />
    </>
  );
}

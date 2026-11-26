import {
  MOST_LIKELY_TO_PACKS,
  MOST_LIKELY_TO_ROUNDS,
  MOST_LIKELY_TO_VOTE_SECONDS,
  mostLikelyToSettingsSchema,
  type MostLikelyToPack,
  type MostLikelyToSettings,
} from "@whizard/game-core";
import { Icon } from "../../ui/Icon";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";
import { LengthRow, TimeRow } from "../settingRows";

export function parseMostLikelyToSettings(settings: unknown): MostLikelyToSettings | null {
  const parsed = mostLikelyToSettingsSchema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

export const packName = (pack: MostLikelyToPack) =>
  MOST_LIKELY_TO_PACKS.find((p) => p.id === pack)?.name ?? pack;

/** Most Likely To's rows in the lobby's Room Settings list. Only the host can change them. */
export function MostLikelyToSettingsRows({
  settings,
  editable,
  onChange,
}: {
  settings: MostLikelyToSettings;
  editable: boolean;
  onChange: (settings: MostLikelyToSettings) => void;
}) {
  return (
    <>
      <SettingRow icon="layers" id="pack" label="Pack">
        <SettingSelect
          id="pack"
          label="Pack"
          value={settings.pack}
          disabled={!editable}
          options={MOST_LIKELY_TO_PACKS.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(pack) => onChange({ ...settings, pack: pack as MostLikelyToPack })}
        />
      </SettingRow>
      <LengthRow
        label="Rounds"
        value={settings.rounds}
        counts={[...MOST_LIKELY_TO_ROUNDS]}
        editable={editable}
        onChange={(rounds) =>
          onChange({ ...settings, rounds: rounds as MostLikelyToSettings["rounds"] })
        }
      />
      <TimeRow
        label="Time limit"
        value={settings.voteSeconds}
        choices={[...MOST_LIKELY_TO_VOTE_SECONDS]}
        unit="seconds"
        editable={editable}
        onChange={(voteSeconds) =>
          onChange({
            ...settings,
            voteSeconds: voteSeconds as MostLikelyToSettings["voteSeconds"],
          })
        }
      />
      <div className="setting-row toggle-row">
        <Icon name="shield" size={20} />
        <span className="setting-label">
          <span id="anonymous-votes-label">Anonymous votes</span>
        </span>
        <button
          className="switch"
          role="switch"
          aria-checked={settings.anonymousVotes}
          aria-labelledby="anonymous-votes-label"
          disabled={!editable}
          onClick={() => onChange({ ...settings, anonymousVotes: !settings.anonymousVotes })}
        />
      </div>
    </>
  );
}

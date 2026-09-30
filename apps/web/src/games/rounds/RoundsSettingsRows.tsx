import {
  ELIMINATION_MIN_PLAYERS,
  LEVEL_CHOICES,
  LEVEL_NAMES,
  ROUNDS_MODES,
  SPOT_IT_ROUNDS,
  plannedItems,
  roundCount,
  SPOT_IT_TIME_LIMITS_SECONDS,
  WORD_RUSH_ROUNDS,
  WORD_RUSH_TIME_LIMITS_SECONDS,
  spotItSettingsSchema,
  wordRushSettingsSchema,
  type LevelChoice,
  type RoundsMode,
} from "@whizard/game-core";
import { SettingRow, SettingSelect } from "../../ui/SettingSelect";

export type RoundsGameId = "word-rush" | "spot-it";

export interface RoundsSettings {
  mode: RoundsMode;
  level: LevelChoice;
  rounds: number;
  timeLimitSeconds: number;
}

const OPTIONS: Record<RoundsGameId, { rounds: readonly number[]; seconds: readonly number[] }> = {
  "word-rush": { rounds: WORD_RUSH_ROUNDS, seconds: WORD_RUSH_TIME_LIMITS_SECONDS },
  "spot-it": { rounds: SPOT_IT_ROUNDS, seconds: SPOT_IT_TIME_LIMITS_SECONDS },
};

/**
 * How long an Elimination game will be with this group: every round and the final have the
 * number picked, and bigger groups play more rounds.
 */
export function EliminationLength({
  players,
  perRound,
  noun,
}: {
  players: number;
  perRound: number;
  /** Plural: "questions", "words", "grids". */
  noun: string;
}) {
  const group = Math.max(players, ELIMINATION_MIN_PLAYERS);
  const rounds = roundCount(group);
  return (
    <>
      {perRound} {noun} in every round and in the final. With {group} players that’s {rounds}{" "}
      knock-out {rounds === 1 ? "round" : "rounds"} and the final: {plannedItems(group, perRound)}{" "}
      {noun} in all.
    </>
  );
}

/** What Auto means, under the Level row. */
export const AUTO_HINT = "Starts easy and gets harder each round, mixing easy, medium and hard.";

export const isRoundsGame = (id: string): id is RoundsGameId => id in OPTIONS;

export function parseRoundsSettings(id: RoundsGameId, settings: unknown): RoundsSettings | null {
  const schema = id === "word-rush" ? wordRushSettingsSchema : spotItSettingsSchema;
  const parsed = schema.safeParse(settings);
  return parsed.success ? parsed.data : null;
}

/** Word Rush's and Spot It's rows in the lobby's Room Settings list. */
export function RoundsSettingsRows({
  game,
  settings,
  players,
  editable,
  onChange,
}: {
  game: RoundsGameId;
  settings: RoundsSettings;
  /** Players in the room now, for how long an Elimination game will be. */
  players: number;
  editable: boolean;
  onChange: (settings: RoundsSettings) => void;
}) {
  const options = OPTIONS[game];
  const elimination = settings.mode === "elimination";
  const noun = game === "word-rush" ? "words" : "grids";
  // In Elimination the number is each round's; played straight through, it's the game's.
  const countLabel = elimination ? `${noun[0]!.toUpperCase()}${noun.slice(1)} per round` : "Rounds";
  return (
    <>
      <SettingRow
        icon="games"
        id="game-mode"
        label="Game Mode"
        hint={ROUNDS_MODES.find((m) => m.id === settings.mode)?.description}
      >
        <SettingSelect
          id="game-mode"
          label="Game Mode"
          value={settings.mode}
          disabled={!editable}
          options={ROUNDS_MODES.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(value) => onChange({ ...settings, mode: value as RoundsMode })}
        />
      </SettingRow>
      <SettingRow
        icon="trophy"
        id="level"
        label="Level"
        hint={settings.level === "auto" ? AUTO_HINT : undefined}
      >
        <SettingSelect
          id="level"
          label="Level"
          value={settings.level}
          disabled={!editable}
          options={LEVEL_CHOICES.map((l) => ({ value: l, label: LEVEL_NAMES[l] }))}
          onChange={(value) => onChange({ ...settings, level: value as LevelChoice })}
        />
      </SettingRow>
      <SettingRow
        icon="copy"
        id="rounds"
        label={countLabel}
        hint={
          elimination ? (
            <EliminationLength players={players} perRound={settings.rounds} noun={noun} />
          ) : undefined
        }
      >
        <SettingSelect
          id="rounds"
          label={countLabel}
          value={String(settings.rounds)}
          disabled={!editable}
          options={options.rounds.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(value) => onChange({ ...settings, rounds: Number(value) })}
        />
      </SettingRow>
      <SettingRow icon="clock" id="time-limit" label="Time per Round">
        <SettingSelect
          id="time-limit"
          label="Time per Round"
          value={String(settings.timeLimitSeconds)}
          disabled={!editable}
          options={options.seconds.map((s) => ({ value: String(s), label: `${s} seconds` }))}
          onChange={(value) => onChange({ ...settings, timeLimitSeconds: Number(value) })}
        />
      </SettingRow>
    </>
  );
}

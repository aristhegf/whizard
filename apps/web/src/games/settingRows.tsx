import { ELIMINATION_MIN_PLAYERS, plannedItems, roundCount } from "@whizard/game-core";
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { SettingRow, SettingSelect } from "../ui/SettingSelect";

/**
 * The rows every game's settings are made of, in the lobby's Room Settings list. Each game only
 * hands over its choices, so the rows read, sit and look the same in every game: Game Mode,
 * Level, then the game's own (the jigsaw's picture), Length, Time, and last the room's rows.
 * A row a game doesn't have is left out rather than moved. Choices are just their names; the one
 * (i) is on Game Mode, where the modes really differ.
 */

interface Choice<V extends string> {
  value: V;
  label: string;
}

export interface Mode<M extends string> {
  id: M;
  name: string;
  description: string;
}

/** How long an Elimination game will be with this group, for the Game Mode (i). */
export function eliminationLength(players: number, perRound: number | null, noun: string): string {
  const group = Math.max(players, ELIMINATION_MIN_PLAYERS);
  const rounds = roundCount(group);
  const knockOuts = `${rounds} knock-out ${rounds === 1 ? "round" : "rounds"} and the final`;
  return perRound === null
    ? `With ${group} players that’s ${knockOuts}.`
    : `With ${group} players that’s ${knockOuts}: ${plannedItems(group, perRound)} ${noun} in all.`;
}

export function ModeRow<M extends string>({
  modes,
  value,
  extra,
  editable,
  onChange,
}: {
  modes: readonly Mode<M>[];
  value: M;
  /** Said after the mode's description, as how long an Elimination game will be. */
  extra?: string | null;
  editable: boolean;
  onChange: (mode: M) => void;
}) {
  const description = modes.find((m) => m.id === value)?.description;
  return (
    <SettingRow
      icon="games"
      id="game-mode"
      label="Game Mode"
      hint={extra ? `${description} ${extra}` : description}
    >
      <SettingSelect
        id="game-mode"
        label="Game Mode"
        value={value}
        disabled={!editable}
        options={modes.map((m) => ({ value: m.id, label: m.name }))}
        onChange={(next) => onChange(next as M)}
      />
    </SettingRow>
  );
}

export function LevelRow<L extends string>({
  choices,
  value,
  editable,
  onChange,
}: {
  choices: readonly Choice<L>[];
  value: L;
  editable: boolean;
  onChange: (level: L) => void;
}) {
  return (
    <SettingRow icon="trophy" id="level" label="Level">
      <SettingSelect
        id="level"
        label="Level"
        value={value}
        disabled={!editable}
        options={[...choices]}
        onChange={(next) => onChange(next as L)}
      />
    </SettingRow>
  );
}

/** How many questions, words or grids: "Questions", or "Questions per round" in Elimination. */
export function LengthRow({
  label,
  value,
  counts,
  editable,
  onChange,
}: {
  label: string;
  value: number;
  counts: readonly number[];
  editable: boolean;
  onChange: (count: number) => void;
}) {
  return (
    <SettingRow icon="copy" id="length" label={label}>
      <SettingSelect
        id="length"
        label={label}
        value={String(value)}
        disabled={!editable}
        options={counts.map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(next) => onChange(Number(next))}
      />
    </SettingRow>
  );
}

/** The clock: seconds for each question or round, or minutes for a whole puzzle. */
export function TimeRow({
  label,
  value,
  choices,
  unit,
  editable,
  onChange,
}: {
  label: string;
  value: number;
  choices: readonly number[];
  unit: "seconds" | "minutes";
  editable: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow icon="clock" id="time-limit" label={label}>
      <SettingSelect
        id="time-limit"
        label={label}
        value={String(value)}
        disabled={!editable}
        options={choices.map((n) => ({ value: String(n), label: `${n} ${unit}` }))}
        onChange={(next) => onChange(Number(next))}
      />
    </SettingRow>
  );
}

/**
 * A time that follows from the other choices, shown where Time would be so the rows don't move:
 * "No clock" in Classic, the jigsaw's countdown for its level.
 */
export function FixedTimeRow({ label, value }: { label: string; value: string }) {
  return (
    <SettingRow icon="clock" id="time-limit" label={label}>
      <span className="setting-fixed" id="time-limit">
        <Icon name="lock" size={16} />
        {value}
      </span>
    </SettingRow>
  );
}

/** A small heading over a group of rows: "Game", "Room". */
export function SettingGroup({ children }: { children: ReactNode }) {
  return <p className="setting-group">{children}</p>;
}

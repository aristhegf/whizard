import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

export interface PodiumEntry {
  playerId: string;
  nickname: string;
  /** What they got: points, a time. Kept short ("1,240", "2/5", "393"): it sits on one line. */
  label: string;
  /** What the number counts, set small under it: "right", "ms avg". */
  unit?: string;
}

const PODIUM_ORDER = [1, 0, 2];

/** The top three on a results screen: second, first, third from left to right. */
export function Podium({
  entries,
  avatarOf,
}: {
  entries: PodiumEntry[];
  avatarOf: (id: string) => string | null;
}) {
  return (
    <div className="podium" aria-label="Top three">
      <span className="confetti" aria-hidden="true" />
      {PODIUM_ORDER.map((i) => {
        const s = entries[i];
        if (!s) return <div key={i} className="podium-place empty" />;
        return (
          <div key={s.playerId} className={`podium-place place-${i + 1}`}>
            <div className="podium-face">
              {i === 0 && (
                <span className="podium-crown" aria-hidden="true">
                  <Icon name="crown" size={44} fill />
                </span>
              )}
              <Avatar id={avatarOf(s.playerId)} name={s.nickname} size={i === 0 ? 150 : 118} />
              <span className="podium-rank">{i + 1}</span>
            </div>
            <div className="podium-block">
              <span className="podium-name">{s.nickname}</span>
              <span className="podium-score">{s.label}</span>
              {s.unit && <span className="podium-unit">{s.unit}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

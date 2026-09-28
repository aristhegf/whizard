import type { AdminQuestionsSummary } from "@whizard/protocol";
import { fetchQuestionsSummary } from "../api";
import { formatNumber } from "../format";
import { linkTo } from "../router";
import { KpiTiles, PanelHead, useRefreshing } from "./parts";
import { LEVEL_NAMES, LEVELS, QuestionLine, topicArt, topicName } from "./questionParts";

const REFRESH_MS = 60_000;
/** Fewer than this many in play for a topic and level, and games start repeating sooner. */
const THIN = 30;

/** `/admin/questions`: the bank by topic and level, and how questions actually play. */
export function Questions() {
  const { data, error } = useRefreshing(fetchQuestionsSummary, REFRESH_MS);
  if (error && !data) {
    return (
      <p className="error" role="alert">
        Couldn’t load the questions. {error}
      </p>
    );
  }
  const t = data?.totals;
  return (
    <div className={data ? "admin-grid" : "admin-grid loading"}>
      <KpiTiles
        tiles={[
          {
            tone: "purple",
            icon: "help",
            label: "In Play",
            value: t ? formatNumber(t.inPlay) : "–",
            note: "in games now",
          },
          {
            tone: "blue",
            icon: "checkCircle",
            label: "Answers",
            value: t ? formatNumber(t.answers) : "–",
            note: "from finished games",
          },
          {
            tone: "green",
            icon: "userPlus",
            label: "Added",
            value: t ? formatNumber(t.added) : "–",
            note: "written by admins",
          },
          {
            tone: "orange",
            icon: "layers",
            label: "Edited",
            value: t ? formatNumber(t.edited) : "–",
            note: "changed from the bank",
          },
          {
            tone: "pink",
            icon: "flag",
            label: "Out of Play",
            value: t ? formatNumber(t.outOfPlay) : "–",
            note: "reported or retired",
          },
        ]}
      />
      <Coverage data={data} />
      <section className="panel admin-panel span-4" aria-labelledby="level-title">
        <PanelHead id="level-title" icon="repeat" title="Level Check" />
        <p className="admin-note">
          Easy questions most players miss, and hard ones nearly everyone gets. Open one to change
          its level.
        </p>
        {data && data.levelCheck.length === 0 ? (
          <p className="admin-empty">
            Nothing looks out of place yet. Questions need 10 answers to be checked.
          </p>
        ) : (
          <ul className="question-lines">
            {(data?.levelCheck ?? []).map((q) => (
              <QuestionLine
                key={q.id}
                q={q}
                note={`looks ${LEVEL_NAMES[q.suggested]?.toLowerCase() ?? q.suggested}`}
              />
            ))}
          </ul>
        )}
      </section>
      <Ranked
        title="Hardest Questions"
        icon="flag"
        data={data}
        list={data?.hardest}
        empty="Fewer than half of players get these right."
      />
      <Ranked
        title="Easiest Questions"
        icon="checkCircle"
        data={data}
        list={data?.easiest}
        empty="Three in four players or more get these right."
      />
    </div>
  );
}

function Coverage({ data }: { data: AdminQuestionsSummary | null }) {
  const rows = data?.coverage ?? [];
  const most = Math.max(1, ...rows.flatMap((r) => [r.easy, r.medium, r.hard]));
  return (
    <section className="panel admin-panel span-8" aria-labelledby="coverage-title">
      <PanelHead
        id="coverage-title"
        icon="layers"
        title="Questions by Topic and Level"
        subtitle={`In play now. Under ${THIN} in a level means players see repeats sooner.`}
      >
        <a
          className="btn btn-small btn-primary admin-head-action"
          {...linkTo("/admin/content/new")}
        >
          Add a question
        </a>
      </PanelHead>
      <table className="coverage">
        <thead>
          <tr>
            <th scope="col">Topic</th>
            {LEVELS.map((l) => (
              <th key={l} scope="col">
                {LEVEL_NAMES[l]}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category}>
              <th scope="row">
                <span className="rank-art">
                  {topicArt(r.category) && <img src={topicArt(r.category)} alt="" loading="lazy" />}
                </span>
                {topicName(r.category)}
              </th>
              {LEVELS.map((l) => (
                <td key={l}>
                  <a
                    className={r[l] < THIN ? "coverage-cell thin" : "coverage-cell"}
                    style={{ ["--fill" as string]: `${(r[l] / most) * 100}%` }}
                    {...linkTo(`/admin/content?category=${r.category}&difficulty=${l}`)}
                  >
                    {r[l]}
                  </a>
                </td>
              ))}
              <td className="coverage-total">{r.easy + r.medium + r.hard}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Ranked({
  title,
  icon,
  data,
  list,
  empty,
}: {
  title: string;
  icon: "flag" | "checkCircle";
  data: AdminQuestionsSummary | null;
  list: AdminQuestionsSummary["hardest"] | undefined;
  empty: string;
}) {
  return (
    <section className="panel admin-panel span-6" aria-label={title}>
      <PanelHead icon={icon} title={title} subtitle={empty} />
      {data && (list ?? []).length === 0 ? (
        <p className="admin-empty">
          None yet. A question needs {data.minAnswers} answers to be ranked.
        </p>
      ) : (
        <ul className="question-lines">
          {(list ?? []).map((q) => (
            <QuestionLine key={q.id} q={q} />
          ))}
        </ul>
      )}
    </section>
  );
}

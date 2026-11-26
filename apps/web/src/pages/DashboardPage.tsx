import { useEffect, useState } from "react";
import type { MatchRecord, PlayerBank } from "@whizard/protocol";
import { fetchMatches, useAccount } from "../account";
import { createRoom } from "../api";
import { fetchBanks } from "../banks";
import { linkTo, navigate, roomPath } from "../router";
import { getAllBankMistakes } from "../storage";
import { TopLayout } from "../ui/Chrome";
import { Icon } from "../ui/Icon";
import { Loading } from "../ui/Loading";
import { dotted, roomCount } from "../ui/Study";
import { useToast } from "../ui/toast";

/** `/dashboard`: your banks, what you've practised and what's left to fix, at a glance. */
export function DashboardPage() {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  const toast = useToast();

  const [banks, setBanks] = useState<PlayerBank[] | null>(null);
  const [matches, setMatches] = useState<MatchRecord[] | null>(null);
  const [practicingId, setPracticingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let active = true;
    void Promise.allSettled([fetchBanks(), fetchMatches()]).then(([banksRes, matchesRes]) => {
      if (!active) return;
      setBanks(banksRes.status === "fulfilled" ? banksRes.value : []);
      setMatches(matchesRes.status === "fulfilled" ? matchesRes.value.matches : []);
    });

    return () => {
      active = false;
    };
  }, [user]);

  const loading = account.status === "loading" || (Boolean(user) && banks === null);

  if (loading) {
    return (
      <TopLayout active="dashboard" className="study-page" column>
        <Loading />
      </TopLayout>
    );
  }

  if (!user) {
    return (
      <TopLayout active="dashboard" className="study-page" column>
        <div className="study">
          <h1 className="study-title">Your study</h1>
          <p className="study-note">Sign in to keep your banks, practice and mistakes together.</p>
          <a className="s-btn gold big block" {...linkTo("/account?next=/dashboard")}>
            Sign in or create an account
          </a>
        </div>
      </TopLayout>
    );
  }

  const allMistakes = getAllBankMistakes();
  const bankList = banks ?? [];
  const mistakesIn = (bank: PlayerBank) => allMistakes[bank.id]?.length ?? 0;
  const totalMistakes = bankList.reduce((sum, b) => sum + mistakesIn(b), 0);
  const totalQuestions = bankList.reduce((sum, b) => sum + b.questionCount, 0);
  const soloMatches = (matches ?? []).filter((m) => m.players.length === 1);
  const weakBanks = bankList.filter((b) => mistakesIn(b) > 0);

  const handlePractice = async (bank: PlayerBank) => {
    if (practicingId || bank.questionCount === 0) return;
    setPracticingId(bank.id);
    try {
      const code = await createRoom(
        {
          bankId: bank.id,
          bankName: bank.name,
          category: "general-knowledge",
          difficulty: "easy",
          count: roomCount(bank.questionCount),
        },
        "quiz",
      );
      navigate(roomPath(code));
    } catch (e) {
      setPracticingId(null);
      toast.show({
        title: e instanceof Error ? e.message : "Couldn't launch practice room.",
        status: "error",
      });
    }
  };

  const plan = user.isPro
    ? user.proUntil
      ? `Pro until ${new Date(user.proUntil).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
      : "Pro"
    : "Free plan";

  return (
    <TopLayout active="stats" className="study-page" column>
      <div className="study">
        <div className="study-head">
          <h1 className="study-title">Your study</h1>
          <a className="s-btn gold" {...linkTo("/banks?new=1")}>
            <Icon name="plus" size={18} stroke={2.4} />
            New bank
          </a>
        </div>
        <p className="study-meta" style={{ marginTop: -8 }}>
          {user.displayName} · {plan}
          {!user.isPro && (
            <>
              {" · "}
              <a className="dash-pro" {...linkTo("/pricing")}>
                Go Pro
              </a>
            </>
          )}
        </p>

        <dl className="s-stats four">
          <div className="s-stat">
            <dt>Banks</dt>
            <dd>{bankList.length}</dd>
          </div>
          <div className="s-stat">
            <dt>Questions</dt>
            <dd>{totalQuestions.toLocaleString()}</dd>
          </div>
          <div className="s-stat">
            <dt>Solo rounds</dt>
            <dd>{soloMatches.length}</dd>
          </div>
          <div className={`s-stat${totalMistakes > 0 ? " wrong" : ""}`}>
            <dt>To review</dt>
            <dd>{totalMistakes}</dd>
          </div>
        </dl>

        {weakBanks.length > 0 && (
          <section className="study" style={{ padding: 0, gap: 10 }} aria-labelledby="review-title">
            <h2 className="study-h2" id="review-title">
              To review
            </h2>
            <ul className="s-list">
              {weakBanks.map((b) => (
                <li key={b.id} className="s-row">
                  <a
                    className="s-row-main"
                    style={{ textDecoration: "none" }}
                    {...linkTo(`/banks/${encodeURIComponent(b.id)}`)}
                  >
                    <span className="s-row-name">{b.name}</span>
                    <span className="s-row-sub">{mistakesIn(b)} missed</span>
                  </a>
                  <button
                    type="button"
                    className="s-btn small s-row-end"
                    disabled={practicingId === b.id}
                    onClick={() => void handlePractice(b)}
                  >
                    Practise
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="study" style={{ padding: 0, gap: 10 }} aria-labelledby="banks-title">
          <div className="study-section-head" style={{ marginTop: 0 }}>
            <h2 className="study-h2" id="banks-title">
              Your banks
            </h2>
            {bankList.length > 0 && (
              <a className="s-link" {...linkTo("/banks")}>
                All banks
              </a>
            )}
          </div>
          {bankList.length === 0 ? (
            <p className="s-empty">No banks yet.</p>
          ) : (
            <ul className="s-list">
              {bankList.slice(0, 6).map((bank) => (
                <li key={bank.id}>
                  <a className="s-row" {...linkTo(`/banks/${encodeURIComponent(bank.id)}`)}>
                    <span className="s-row-main">
                      <span className="s-row-name">{bank.name}</span>
                      <span className="s-row-sub">
                        {dotted(bank.exam, bank.subject) || "Your bank"}
                      </span>
                    </span>
                    <span className="s-row-count">
                      {bank.questionCount}
                      <span className="sr-only">
                        {" "}
                        {bank.questionCount === 1 ? "question" : "questions"}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="s-actions">
          <a className="s-link" {...linkTo("/banks?new=1&import=1")}>
            <Icon name="upload" size={18} />
            Import a Word, CSV or text file
          </a>
          <a className="s-link" {...linkTo("/banks?tab=community")}>
            <Icon name="globe" size={18} />
            Community banks
          </a>
          <a className="s-link" {...linkTo("/games/quiz")}>
            <Icon name="help" size={18} />
            Quiz topics
          </a>
        </div>
      </div>
    </TopLayout>
  );
}

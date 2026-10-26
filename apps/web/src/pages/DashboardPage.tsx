import { useEffect, useState } from "react";
import type { MatchRecord, PlayerBank } from "@whizard/protocol";
import { fetchMatches, useAccount } from "../account";
import { createRoom } from "../api";
import { fetchBanks } from "../banks";
import { linkTo, navigate, roomPath } from "../router";
import { getAllBankMistakes, getBankMistakes } from "../storage";
import { Avatar } from "../ui/Avatar";
import { TopLayout } from "../ui/Chrome";
import { Icon } from "../ui/Icon";
import { Loading } from "../ui/Loading";
import { useToast } from "../ui/toast";

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
      if (banksRes.status === "fulfilled") {
        setBanks(banksRes.value);
      } else {
        setBanks([]);
      }
      if (matchesRes.status === "fulfilled") {
        setMatches(matchesRes.value.matches);
      } else {
        setMatches([]);
      }
    });

    return () => {
      active = false;
    };
  }, [user]);

  const loading = account.status === "loading" || (Boolean(user) && banks === null);

  if (loading) {
    return (
      <TopLayout active="dashboard" column>
        <Loading />
      </TopLayout>
    );
  }

  if (!user) {
    return (
      <TopLayout active="dashboard" column>
        <div className="dashboard-page">
          <div className="dashboard-empty-card panel">
            <Icon name="layers" size={48} />
            <h2>Personal Study Dashboard</h2>
            <p className="muted">
              Sign in with a passkey to manage your question banks, track solo mastery, and review
              mistakes.
            </p>
            <a className="btn btn-primary" {...linkTo("/account?next=/dashboard")}>
              Sign In to Your Dashboard
            </a>
          </div>
        </div>
      </TopLayout>
    );
  }

  const allMistakes = getAllBankMistakes();
  const totalMistakes = Object.values(allMistakes).reduce((sum, list) => sum + list.length, 0);

  const bankList = banks ?? [];
  const totalQuestions = bankList.reduce((sum, b) => sum + b.questionCount, 0);
  const soloMatches = (matches ?? []).filter((m) => m.players.length === 1);

  const banksWithMistakes = bankList.filter((b) => (allMistakes[b.id]?.length ?? 0) > 0);

  const handlePractice = async (bank: PlayerBank) => {
    if (practicingId || bank.questionCount === 0) return;
    setPracticingId(bank.id);
    try {
      const count =
        bank.questionCount >= 20
          ? 20
          : bank.questionCount >= 15
            ? 15
            : bank.questionCount >= 10
              ? 10
              : 5;
      const code = await createRoom(
        {
          bankId: bank.id,
          bankName: bank.name,
          category: "general-knowledge",
          difficulty: "easy",
          count,
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

  return (
    <TopLayout active="stats" column>
      <div className="dashboard-page">
        {/* Welcome hero */}
        <section className="dashboard-hero" aria-label="Study profile">
          <div className="dashboard-user">
            <Avatar id={user.avatar} name={user.username} size={64} />
            <div className="dashboard-user-info">
              <h1>Welcome back, {user.displayName}</h1>
              <span className="dashboard-username">@{user.username}</span>
            </div>
          </div>
          <div className="dashboard-membership">
            {user.isPro ? (
              <span className="pro-chip">
                <Icon name="crown" size={16} />
                {user.proUntil
                  ? `Whizard Pro (active until ${new Date(user.proUntil).toLocaleDateString()})`
                  : "Whizard Pro (Lifetime)"}
              </span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="free-chip">Free Plan</span>
                <a className="btn btn-small" {...linkTo("/pricing")}>
                  ⚡ Upgrade to Pro
                </a>
              </div>
            )}
          </div>
        </section>

        {/* KPI metrics */}
        <section className="dashboard-kpi-grid" aria-label="Overview statistics">
          <div className="dashboard-kpi">
            <div className="dashboard-kpi-icon">
              <Icon name="layers" size={26} />
            </div>
            <div className="dashboard-kpi-content">
              <span className="dashboard-kpi-value">{bankList.length}</span>
              <span className="dashboard-kpi-label">Question Banks</span>
            </div>
          </div>

          <div className="dashboard-kpi green">
            <div className="dashboard-kpi-icon">
              <Icon name="check" size={26} />
            </div>
            <div className="dashboard-kpi-content">
              <span className="dashboard-kpi-value">{totalQuestions.toLocaleString()}</span>
              <span className="dashboard-kpi-label">Authored Questions</span>
            </div>
          </div>

          <div className="dashboard-kpi gold">
            <div className="dashboard-kpi-icon">
              <Icon name="play" size={26} />
            </div>
            <div className="dashboard-kpi-content">
              <span className="dashboard-kpi-value">{soloMatches.length}</span>
              <span className="dashboard-kpi-label">Solo Practice Rounds</span>
            </div>
          </div>

          <div className={`dashboard-kpi ${totalMistakes > 0 ? "amber" : "green"}`}>
            <div className="dashboard-kpi-icon">
              <Icon name={totalMistakes > 0 ? "alert" : "trophy"} size={26} />
            </div>
            <div className="dashboard-kpi-content">
              <span className="dashboard-kpi-value">{totalMistakes}</span>
              <span className="dashboard-kpi-label">Weak Spots To Review</span>
            </div>
          </div>
        </section>

        {/* Weak spots notification & drill access */}
        {totalMistakes > 0 ? (
          <section className="dashboard-weak-spots panel" aria-label="Mistakes to review">
            <div className="weak-spots-head">
              <h2>
                <Icon name="alert" size={22} />
                <span>
                  {totalMistakes} {totalMistakes === 1 ? "question needs" : "questions need"} review
                </span>
              </h2>
              <span className="small muted">
                Identified from recent solo practice sessions. Practice again to reinforce!
              </span>
            </div>
            <ul className="weak-banks-list">
              {banksWithMistakes.map((b) => {
                const count = allMistakes[b.id]?.length ?? 0;
                return (
                  <li key={b.id} className="weak-bank-row">
                    <div>
                      <strong>{b.name}</strong>
                      <span className="muted small" style={{ marginLeft: 8 }}>
                        ({count} {count === 1 ? "mistake" : "mistakes"})
                      </span>
                    </div>
                    <button
                      className="btn btn-small btn-primary"
                      disabled={practicingId === b.id}
                      onClick={() => void handlePractice(b)}
                    >
                      <Icon name="repeat" size={16} />
                      Practice Bank
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section
            className="dashboard-weak-spots clean panel"
            aria-label="Mastery status all clear"
          >
            <div className="weak-spots-head">
              <h2>
                <Icon name="trophy" size={22} />
                <span>100% Mastery Achieved!</span>
              </h2>
              <span className="small" style={{ color: "#5dffb0" }}>
                No unresolved mistakes. All questions from recent practice have been reinforced.
              </span>
            </div>
          </section>
        )}

        {/* Your Question Banks */}
        <section className="dashboard-section" aria-labelledby="dashboard-banks-title">
          <div className="dashboard-section-head">
            <h2 id="dashboard-banks-title">Your Question Banks</h2>
            <a className="btn btn-small" {...linkTo("/banks")}>
              <Icon name="plus" size={16} />
              New Bank
            </a>
          </div>

          {bankList.length === 0 ? (
            <div className="dashboard-empty-card panel">
              <Icon name="layers" size={40} />
              <p>You haven’t created any question banks yet.</p>
              <a className="btn btn-primary" {...linkTo("/banks")}>
                Create Your First Bank
              </a>
            </div>
          ) : (
            <div className="dashboard-banks-grid">
              {bankList.map((bank) => {
                const mistakeCount = getBankMistakes(bank.id).length;
                return (
                  <div key={bank.id} className="dashboard-bank-card panel">
                    <div>
                      <div className="dashboard-bank-header">
                        <h3 className="dashboard-bank-title">{bank.name}</h3>
                        {mistakeCount > 0 && (
                          <span
                            className="status-pill status-out"
                            title={`${mistakeCount} mistakes to review`}
                          >
                            ⚠️ {mistakeCount}
                          </span>
                        )}
                      </div>
                      <div className="dashboard-bank-meta">
                        {[bank.exam, bank.subject].filter(Boolean).join(" · ") || "Custom Bank"}
                      </div>
                      <div className="dashboard-bank-meta" style={{ marginTop: 6 }}>
                        <strong>{bank.questionCount}</strong>{" "}
                        {bank.questionCount === 1 ? "question" : "questions"}
                      </div>
                    </div>

                    <div className="dashboard-bank-actions">
                      <button
                        className="btn btn-primary"
                        disabled={bank.questionCount === 0 || practicingId === bank.id}
                        onClick={() => void handlePractice(bank)}
                      >
                        <Icon name="play" size={16} />
                        Practice
                      </button>
                      <a
                        className="btn"
                        {...linkTo(`/banks/${encodeURIComponent(bank.id)}`)}
                        style={{ textAlign: "center" }}
                      >
                        Manage
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Creator and Study Shortcuts */}
        <section className="dashboard-section" aria-labelledby="study-shortcuts-title">
          <div className="dashboard-section-head">
            <h2 id="study-shortcuts-title">Study & Creator Tools</h2>
          </div>
          <div className="dashboard-tools-row">
            <a className="dashboard-tool-btn" {...linkTo("/banks")}>
              <Icon name="upload" size={22} />
              <span>Import Questions (.docx, .csv)</span>
            </a>
            <a className="dashboard-tool-btn" {...linkTo("/games/quiz")}>
              <Icon name="help" size={22} />
              <span>Browse Shipped Topics</span>
            </a>
            <a className="dashboard-tool-btn" {...linkTo("/stats")}>
              <Icon name="trophy" size={22} />
              <span>Community Leaderboard</span>
            </a>
            <a className="dashboard-tool-btn" {...linkTo("/account/settings")}>
              <Icon name="settings" size={22} />
              <span>Account Settings</span>
            </a>
          </div>
        </section>
      </div>
    </TopLayout>
  );
}

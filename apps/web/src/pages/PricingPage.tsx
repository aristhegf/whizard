import { MAX_PLAYERS } from "@whizard/game-core";
import type { CheckoutResponse } from "@whizard/protocol";
import { ActionSwapCascadeText } from "@/components/motion/action-swap-cascade";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, useAccount } from "../account";
import { prefersStill } from "../display";
import { linkTo, navigate } from "../router";
import { TopLayout } from "../ui/Chrome";
import { Icon, type IconName } from "../ui/Icon";

const WHATSAPP_NUMBER = "2349161294881";
const WHATSAPP_MESSAGE =
  "Hi Whizard! I'd like to use Whizard for my organization or event. Can we talk about a plan?";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

interface Art {
  src: string;
  width: number;
  height: number;
}

const ART = {
  hero: { src: "/art/pricing/hero.webp", width: 1200, height: 802 },
  free: { src: "/art/pricing/free.webp", width: 900, height: 355 },
  pro: { src: "/art/pricing/pro.webp", width: 900, height: 447 },
  org: { src: "/art/pricing/org.webp", width: 900, height: 413 },
  cta: { src: "/art/pricing/cta.webp", width: 800, height: 550 },
} satisfies Record<string, Art>;

interface Feature {
  text: string;
  tag?: string;
}

const FREE_FEATURES: Feature[] = [
  { text: "Manual question entry in banks" },
  { text: "Join public games" },
  { text: "Create private rooms" },
  { text: `Up to ${MAX_PLAYERS} players per room` },
  { text: "Play all public game modes" },
  { text: "Basic leaderboard and results" },
  { text: "Works on any device" },
];

const PRO_FEATURES: Feature[] = [
  { text: "Word document import (.docx, .doc, .txt)" },
  { text: "CSV question import & export" },
  { text: "Unlimited custom question banks" },
  { text: "Host study rooms with friends" },
  { text: "Solo mastery practice & retries" },
  { text: "Save and organize question sets" },
  { text: "Detailed results and analytics" },
  { text: "Pro Crown badge on profile" },
  { text: "Early access to new creator features" },
];

const ORG_FEATURES: Feature[] = [
  { text: "Rooms for 50–500+ players" },
  { text: "Event mode with host controls" },
  { text: "Custom branding" },
  { text: "Dedicated question libraries" },
  { text: "Advanced analytics and reports" },
  { text: "Participants don’t need accounts" },
  { text: "Priority support" },
];

/** Free and Pro side by side. `true` is a tick, `false` a dash, text is shown as is. */
const COMPARISON: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: "Play public games", free: true, pro: true },
  { label: "Create rooms", free: true, pro: true },
  { label: "Players per room", free: String(MAX_PLAYERS), pro: "Higher limits later" },
  { label: "Manual question entry", free: true, pro: true },
  { label: "Word (.docx) & CSV import", free: false, pro: true },
  { label: "Question banks", free: "Limited", pro: "Unlimited" },
  { label: "Solo practice & review", free: true, pro: true },
  { label: "Custom game rooms", free: true, pro: true },
  { label: "Detailed analytics", free: false, pro: true },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do players need to pay to play?",
    a: "No. Anyone can join and play Whizard for free.",
  },
  {
    q: "Can I create questions for free?",
    a: "Yes! Free accounts can author questions manually in their question banks. Pro unlocks instant Word and CSV document imports.",
  },
  {
    q: "Can I upload questions from Word or Excel?",
    a: "Yes, with Pro. Upload Word documents (.docx, .doc) or CSV files, and Whizard automatically extracts questions, answers, and explanations.",
  },
  {
    q: "Do my friends need a Whizard account to play?",
    a: "No. Create a room and share the link or code. Your friends join with just a nickname.",
  },
  {
    q: "Can I cancel Pro anytime?",
    a: "Yes. You can cancel Pro whenever you like.",
  },
  {
    q: "Can I use Whizard for a church, school, company or event?",
    a: "Yes. Bigger groups and organization features come with the Organization plan. Message us and we’ll set it up with you.",
  },
];

export function PricingPage() {
  const [currency, setCurrency] = useState<"NGN" | "USD">(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && (tz.includes("Lagos") || tz.includes("Africa/Lagos"))) return "NGN";
    } catch {
      // Default to USD when timezone detection fails
    }
    return "USD";
  });

  useEffect(() => {
    fetch("/api/geo")
      .then((res) => (res.ok ? (res.json() as Promise<{ currency?: "NGN" | "USD" }>) : null))
      .then((data) => {
        if (data?.currency === "NGN" || data?.currency === "USD") {
          setCurrency(data.currency);
        }
      })
      .catch(() => {
        // Fallback to initial currency if geo lookup fails
      });
  }, []);

  const searchParams =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const paymentStatus = searchParams?.get("payment");

  const proPrice = currency === "NGN" ? "₦5,000" : "$5";

  return (
    <TopLayout active="pricing">
      <div className="pricing">
        {paymentStatus === "success" && (
          <aside className="pricing-banner pricing-banner-success" aria-label="Payment successful">
            <Icon name="crown" size={30} fill />
            <div>
              <strong>Welcome to Whizard Pro! 👑</strong>
              <p>
                Your membership is active. You now have unlimited custom question banks, Word & CSV
                document extraction, and solo mastery practice.
              </p>
            </div>
            <a className="btn btn-gold btn-sm" {...linkTo("/banks")}>
              My Question Banks
            </a>
          </aside>
        )}

        {paymentStatus === "cancelled" && (
          <aside className="pricing-banner pricing-banner-cancelled" aria-label="Payment cancelled">
            <p>Checkout was cancelled. Your card or account was not charged.</p>
          </aside>
        )}

        <section className="pricing-hero" aria-labelledby="pricing-title">
          <div className="pricing-hero-copy">
            <p className="pill pricing-pill">
              <Icon name="crown" size={18} />
              Pricing
            </p>
            <h1 id="pricing-title" className="display pricing-title">
              Play for free.
              <br />
              Create without limits.
            </h1>
            <p className="pricing-lead">
              Whizard is free for everyone. Play games, create rooms and invite your friends.
              Upgrade when you want to import your own past questions and study documents.
            </p>
          </div>
          <img
            className="pricing-hero-art"
            {...ART.hero}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
          />
        </section>

        <div className="pricing-currency-bar">
          <span className="muted small">Currency:</span>
          <div className="currency-toggle" role="group" aria-label="Select currency">
            <button
              type="button"
              className="currency-btn"
              aria-pressed={currency === "NGN"}
              onClick={() => setCurrency("NGN")}
            >
              ₦ NGN
            </button>
            <button
              type="button"
              className="currency-btn"
              aria-pressed={currency === "USD"}
              onClick={() => setCurrency("USD")}
            >
              $ USD
            </button>
          </div>
        </div>

        <PlanSlider names={["Free", "Pro", "Organizations & Events"]}>
          <Plan
            id="free"
            icon="games"
            name="Free"
            tagline="Play Whizard with your friends."
            price={currency === "NGN" ? "₦0" : "$0"}
            period="Forever"
            blurb="Everything you need to join games, create rooms and play with friends. No card needed."
            action={
              <a className="btn btn-primary btn-block plan-btn" {...linkTo("/games")}>
                Get Started Free
                <Icon name="arrowRight" size={20} stroke={2.4} />
              </a>
            }
            features={FREE_FEATURES}
            art={ART.free}
          />
          <Plan
            id="pro"
            icon="crown"
            name="Pro"
            tagline="Create your own Whizard games."
            price={proPrice}
            period="/ month"
            blurb="Bring your own questions to Whizard. For students, tutors, creators and quiz lovers."
            action={<ProButton currency={currency} />}
            listTitle="Everything in Free, plus:"
            features={PRO_FEATURES}
            art={ART.pro}
            badge="Most Popular"
          />
          <Plan
            id="org"
            icon="users"
            name="Organizations & Events"
            tagline="Run Whizard for your group."
            price="Custom pricing"
            blurb="For schools, churches, companies, events, quiz competitions and large communities."
            action={
              <a
                className="btn btn-block plan-btn plan-btn-outline"
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
              >
                Talk to Us
                <Icon name="arrowRight" size={20} stroke={2.4} />
              </a>
            }
            listTitle="Everything in Pro, plus:"
            features={ORG_FEATURES}
            art={ART.org}
          />
        </PlanSlider>

        <section className="compare panel" aria-labelledby="compare-title">
          <h2 id="compare-title" className="display compare-title">
            Everything you need to play. More when you’re ready to create.
          </h2>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col">Free</th>
                <th scope="col" className="pro-col">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>
                    <Cell value={row.free} />
                  </td>
                  <td className="pro-col">
                    <Cell value={row.pro} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="pricing-end">
          <section className="faq panel" aria-labelledby="faq-title">
            <h2 id="faq-title" className="faq-title">
              <span className="faq-mark" aria-hidden="true">
                ?
              </span>
              Common Questions
            </h2>
            <div className="faq-list">
              {FAQ.map((item) => (
                <details key={item.q} className="faq-item">
                  <summary>
                    {item.q}
                    <Icon name="chevronDown" size={20} className="faq-chevron" />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="pricing-cta panel" aria-labelledby="cta-title">
            <div className="pricing-cta-copy">
              <h2 id="cta-title" className="pricing-cta-title">
                <Icon name="star" size={30} fill className="cta-star" />
                Got questions ready to practice?
              </h2>
              <p className="muted">Import your past papers or author questions in seconds.</p>
              <div className="pricing-cta-actions">
                <a className="btn btn-gold plan-btn" {...linkTo("/banks")}>
                  Open Question Banks
                  <Icon name="arrowRight" size={20} stroke={2.4} />
                </a>
                <a className="btn plan-btn" {...linkTo("/games")}>
                  Explore Games
                </a>
              </div>
            </div>
            <img
              className="pricing-cta-art"
              {...ART.cta}
              alt=""
              aria-hidden="true"
              loading="lazy"
            />
          </section>
        </div>
      </div>
    </TopLayout>
  );
}

function Plan({
  id,
  icon,
  name,
  tagline,
  price,
  period,
  blurb,
  action,
  listTitle,
  features,
  art,
  badge,
}: {
  id: string;
  icon: IconName;
  name: string;
  tagline: string;
  price: string;
  period?: string;
  blurb: string;
  action: ReactNode;
  listTitle?: string;
  features: Feature[];
  art: Art;
  badge?: string;
}) {
  return (
    <li className={`plan plan-${id}`}>
      {badge && (
        <p className="plan-badge">
          <Icon name="crown" size={16} />
          {badge}
        </p>
      )}
      <div className="plan-head">
        <span className="plan-icon" aria-hidden="true">
          <Icon name={icon} size={30} />
        </span>
        <div>
          <h2 className="plan-name">{name}</h2>
          <p className="plan-tagline">{tagline}</p>
        </div>
      </div>
      <p className="plan-price">
        <strong>{price}</strong>
        {period && <span>{period}</span>}
      </p>
      <p className="plan-blurb">{blurb}</p>
      {action}
      <div className="plan-features">
        {listTitle && <p className="plan-list-title">{listTitle}</p>}
        <ul>
          {features.map((f) => (
            <li key={f.text}>
              <Icon name="check" size={20} stroke={2.6} className="plan-check" />
              <span>
                {f.text}
                {f.tag && <span className="plan-tag">{f.tag}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <img className="plan-art" {...art} alt="" aria-hidden="true" loading="lazy" />
    </li>
  );
}

function PlanSlider({ names, children }: { names: string[]; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  const cards = () => Array.from(list.current?.children ?? []) as HTMLElement[];

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    const middle = el.scrollLeft + el.clientWidth / 2;
    const offsets = cards().map((card) =>
      Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle),
    );
    setActive(offsets.indexOf(Math.min(...offsets)));
  };

  const show = (index: number) => {
    const el = list.current;
    const card = cards()[index];
    if (!el || !card) return;
    const still = prefersStill();
    el.scrollTo({
      left: card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2,
      behavior: still ? "auto" : "smooth",
    });
  };

  return (
    <div className="plan-slider">
      <div className="plan-dots" role="group" aria-label="Plans">
        {names.map((name, i) => (
          <button
            key={name}
            className="plan-dot"
            aria-label={`Show the ${name} plan`}
            aria-current={i === active ? "true" : undefined}
            onClick={() => show(i)}
          />
        ))}
      </div>
      <ul ref={list} className="plans" onScroll={onScroll}>
        {children}
      </ul>
    </div>
  );
}

/** Active checkout button via Bachs. */
function ProButton({ currency }: { currency: "NGN" | "USD" }) {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user?.isPro) {
    return (
      <div className="pro-action">
        <div className="btn btn-gold btn-block plan-btn plan-btn-active">
          <Icon name="crown" size={18} fill />
          Active Pro Member
        </div>
      </div>
    );
  }

  const handleUpgrade = async () => {
    if (!user) {
      navigate(`/account?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<CheckoutResponse>("/api/payments/bachs/checkout", {
        method: "POST",
        body: { currency },
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        throw new Error("Checkout URL was not received.");
      }
    } catch (err: unknown) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not start checkout. Please try again.");
    }
  };

  return (
    <div className="pro-action">
      <button className="btn btn-gold btn-block plan-btn" onClick={handleUpgrade} disabled={busy}>
        <ActionSwapCascadeText value={busy ? "starting" : "upgrade"}>
          {busy ? "Starting checkout..." : "Upgrade to Pro"}
        </ActionSwapCascadeText>
        <Icon name="arrowRight" size={20} stroke={2.4} />
      </button>
      {error && (
        <p className="pro-error error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <>
        <Icon name="check" size={20} stroke={2.6} className="plan-check" />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span className="compare-dash" aria-hidden="true">
          —
        </span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <>{value}</>;
}

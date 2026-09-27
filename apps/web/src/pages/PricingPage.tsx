import { MAX_PLAYERS } from "@whizard/game-core";
import { useRef, useState, type ReactNode } from "react";
import { linkTo } from "../router";
import { TopLayout } from "../ui/Chrome";
import { Icon, type IconName } from "../ui/Icon";
import { Sparkle, Tile } from "../ui/Tile";

const WHATSAPP_NUMBER = "2349161294881";
const WHATSAPP_MESSAGE =
  "Hi Whizard! I'd like to use Whizard for my organization or event. Can we talk about a plan?";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

interface Feature {
  text: string;
  tag?: string;
}

const FREE_FEATURES: Feature[] = [
  { text: "Join public games" },
  { text: "Create private rooms" },
  { text: `Up to ${MAX_PLAYERS} players per room` },
  { text: "Play all public game modes" },
  { text: "Create custom quizzes manually", tag: "Limited" },
  { text: "Basic leaderboard and results" },
  { text: "Works on any device" },
];

const PRO_FEATURES: Feature[] = [
  { text: "Unlimited custom quizzes" },
  { text: "CSV question import" },
  { text: "Bulk question import and export" },
  { text: "Unlimited question bank" },
  { text: "Save and organize question sets" },
  { text: "Add images to questions" },
  { text: "Reuse and duplicate quizzes" },
  { text: "Advanced game settings" },
  { text: "Detailed results and analytics" },
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
  { label: "Custom quizzes", free: "Limited", pro: "Unlimited" },
  { label: "CSV import", free: false, pro: true },
  { label: "Question bank", free: "Limited", pro: "Unlimited" },
  { label: "Images", free: false, pro: true },
  { label: "Duplicate quizzes", free: false, pro: true },
  { label: "Advanced settings", free: false, pro: true },
  { label: "Detailed analytics", free: false, pro: true },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do players need to pay to play?",
    a: "No. Anyone can join and play Whizard for free.",
  },
  {
    q: "Can I create my own quiz for free?",
    a: "Yes, a limited number of quizzes you write by hand. Pro unlocks unlimited custom quizzes and bigger creator tools.",
  },
  {
    q: "Can I upload questions from Excel or Google Sheets?",
    a: "Yes, with Pro. Save your sheet as a CSV file and upload it to Whizard.",
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
  return (
    <TopLayout variant="site" active="pricing">
      <div className="pricing">
        <section className="pricing-hero" aria-labelledby="pricing-title">
          <div className="pricing-hero-copy">
            <p className="pill pricing-pill">
              <Icon name="crown" size={18} />
              Pricing
            </p>
            <h1 id="pricing-title" className="display pricing-title">
              Play for free.
              <br />
              <span className="purple-text">Create without limits.</span>
            </h1>
            <p className="pricing-lead">
              Whizard is free for everyone. Play games, create rooms and invite your friends.
              Upgrade when you want to bring your own questions and build your own games.
            </p>
          </div>
          <HeroArt />
        </section>

        <PlanSlider names={["Free", "Pro", "Organizations & Events"]}>
          <Plan
            id="free"
            icon="games"
            name="Free"
            tagline="Play Whizard with your friends."
            price="₦0"
            period="Forever"
            blurb="Everything you need to join games, create rooms and play with friends. No card needed."
            action={
              <a className="btn btn-primary btn-block plan-btn" {...linkTo("/games")}>
                Get Started Free
                <Icon name="arrowRight" size={20} stroke={2.4} />
              </a>
            }
            features={FREE_FEATURES}
            art={<FreeArt />}
          />
          <Plan
            id="pro"
            icon="crown"
            name="Pro"
            tagline="Create your own Whizard games."
            price="₦5,000"
            period="/ month"
            blurb="Bring your own questions to Whizard. For creators, teachers, groups and quiz lovers."
            action={<ProButton />}
            listTitle="Everything in Free, plus:"
            features={PRO_FEATURES}
            art={<ProArt />}
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
            art={<OrgArt />}
          />
        </PlanSlider>

        <section className="compare panel" aria-labelledby="compare-title">
          <h2 id="compare-title" className="display compare-title">
            Everything you need to play.{" "}
            <span className="purple-text">More when you’re ready to create.</span>
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
                Got a game in your head?
              </h2>
              <p className="muted">Bring your questions. We’ll bring the competition.</p>
              <div className="pricing-cta-actions">
                <a className="btn btn-gold plan-btn" {...linkTo("/games/quiz")}>
                  Create a Free Quiz
                  <Icon name="arrowRight" size={20} stroke={2.4} />
                </a>
                <a className="btn plan-btn" {...linkTo("/games")}>
                  Explore Games
                </a>
              </div>
            </div>
            <CtaArt />
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
  art: ReactNode;
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
      <div className="plan-art" aria-hidden="true">
        {art}
      </div>
    </li>
  );
}

/**
 * The plans. Side by side on wide screens; on phones they slide sideways, with dots above
 * that show which plan you're on and jump to the others.
 */
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
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      left: card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2,
      behavior: still ? "auto" : "smooth",
    });
  };

  return (
    <div className="plan-slider">
      <div className="plan-nav">
        <p className="swipe-hint" aria-hidden="true">
          <Icon name="chevronLeft" size={16} stroke={2.6} />
          Swipe to see all plans
          <Icon name="chevronRight" size={16} stroke={2.6} />
        </p>
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
      </div>
      <ul ref={list} className="plans" onScroll={onScroll}>
        {children}
      </ul>
    </div>
  );
}

/** Pro can't be bought yet, so the button says so instead. */
function ProButton() {
  const [asked, setAsked] = useState(false);
  return (
    <div className="pro-action">
      <button className="btn btn-gold btn-block plan-btn" onClick={() => setAsked(true)}>
        Upgrade to Pro
        <Icon name="arrowRight" size={20} stroke={2.4} />
      </button>
      <p className="pro-soon" role="status">
        {asked && "Pro is coming soon. Until then, everything in Free is yours to play."}
      </p>
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

/* Art. These are stand-ins drawn from the art we already have. */

function HeroArt() {
  return (
    <div className="pricing-hero-art" aria-hidden="true">
      <div className="hero-art-glow" />
      <img src="/art/mascot/hero.webp" alt="" width={866} height={857} fetchPriority="high" />
      <Tile kind="question" color="orange" className="float t-question" />
      <Tile kind="image" color="purple" className="float t-image" />
      <Tile kind="question" color="orange" className="float t-small" />
      <Tile kind="image" color="blue" className="float t-blue" />
      <Tile kind="image" color="pink" className="float t-pink" />
      <Tile kind="list" color="orange" className="float t-list" />
      <Sparkle className="sparkle s1" />
      <Sparkle className="sparkle s2" />
      <Sparkle className="sparkle s3" />
    </div>
  );
}

function FreeArt() {
  return (
    <>
      <img src="/art/mascot/run.webp" alt="" width={477} height={480} loading="lazy" />
      <Sparkle className="sparkle s1" />
      <Sparkle className="sparkle s2" />
    </>
  );
}

function ProArt() {
  return (
    <>
      <div className="plan-art-glow" />
      <Tile kind="csv" color="green" className="pro-tile p1" />
      <Tile kind="image" color="purple" className="pro-tile p2" />
      <Tile kind="list" color="orange" className="pro-tile p3" />
      <Sparkle className="sparkle s1" />
      <Sparkle className="sparkle s2" />
    </>
  );
}

function OrgArt() {
  return (
    <div className="game-night">
      <Icon name="crown" size={26} fill />
      <strong>
        Whizard
        <br />
        Game Night
      </strong>
      <Sparkle className="sparkle s1" />
    </div>
  );
}

function CtaArt() {
  return (
    <div className="pricing-cta-art" aria-hidden="true">
      <img src="/art/mascot/fly.webp" alt="" width={477} height={520} loading="lazy" />
      <Tile kind="image" color="purple" className="float c1" />
      <Tile kind="list" color="orange" className="float c2" />
      <Sparkle className="sparkle s1" />
      <Sparkle className="sparkle s2" />
    </div>
  );
}

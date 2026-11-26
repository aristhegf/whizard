import { MAX_PLAYERS } from "@whizard/game-core";
import {
  PRO_MONTHLY_PRICE_NGN,
  PRO_MONTHLY_PRICE_USD,
  type CheckoutResponse,
} from "@whizard/protocol";
import { ActionSwapCascadeText } from "@/components/motion/action-swap-cascade";
import { useEffect, useState } from "react";
import { api, useAccount } from "../account";
import { linkTo, navigate } from "../router";
import { TopLayout } from "../ui/Chrome";
import { Icon } from "../ui/Icon";

const WHATSAPP_NUMBER = "2349161294881";
const WHATSAPP_MESSAGE =
  "Hi Whizard! I'd like to use Whizard for my organization or event. Can we talk about a plan?";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

type Currency = "NGN" | "USD";

/** Free, and Pro's monthly price as the checkout charges it. */
const PRICES: Record<Currency, { free: string; pro: string }> = {
  NGN: { free: "₦0", pro: `₦${PRO_MONTHLY_PRICE_NGN.toLocaleString("en-US")}` },
  USD: { free: "$0", pro: `$${PRO_MONTHLY_PRICE_USD.toLocaleString("en-US")}` },
};

const FREE_FEATURES = [
  "Every game",
  `Rooms of up to ${MAX_PLAYERS}`,
  "Type in your own questions",
  "Solo practice",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Import Word, CSV and text files",
  "Export your banks as CSV",
  "Detailed results",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do my friends need to pay?",
    a: "No. Anyone in your room plays free, with or without an account.",
  },
  {
    q: "What files can I import?",
    a: "Word documents (.docx and .doc), CSV files and plain text.",
  },
  {
    q: "Do I need an account for Pro?",
    a: "Yes. Pro belongs to your account, so sign in first. Playing never needs one.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes, whenever you like.",
  },
];

/** A best first guess at the visitor's currency, before the server says where they are. */
function guessCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz?.includes("Lagos")) return "NGN";
  } catch {
    // Default to USD when timezone detection fails
  }
  return "USD";
}

export function PricingPage() {
  const [currency, setCurrency] = useState<Currency>(guessCurrency);

  useEffect(() => {
    fetch("/api/geo")
      .then((res) => (res.ok ? (res.json() as Promise<{ currency?: Currency }>) : null))
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
  const prices = PRICES[currency];

  return (
    <TopLayout active="pricing">
      <div className="pricing">
        {paymentStatus === "success" && (
          <aside className="pricing-banner pricing-banner-success" aria-label="Payment successful">
            <Icon name="crown" size={28} fill />
            <div>
              <strong>Welcome to Whizard Pro</strong>
              <p>Your membership is active. You can now import questions from your own files.</p>
            </div>
            <a className="btn btn-gold btn-small" {...linkTo("/banks")}>
              My question banks
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
            <h1 id="pricing-title" className="display pricing-title">
              Playing is free
            </h1>
            <p className="pricing-lead">Go Pro to bring your own questions.</p>
          </div>
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
        </section>

        <ul className="plans" aria-label="Plans">
          <li className="plan">
            <h2 className="plan-name">Free</h2>
            <p className="plan-price">
              <strong>{prices.free}</strong>
            </p>
            <Ticks items={FREE_FEATURES} />
            <a className="btn btn-block plan-btn plan-btn-quiet" {...linkTo("/games")}>
              Play now
            </a>
          </li>
          <li className="plan plan-pro">
            <img className="plan-art" src="/art/pricing/pro.webp" alt="" width={900} height={447} />
            <h2 className="plan-name">Pro</h2>
            <p className="plan-price">
              <strong>{prices.pro}</strong>
              <span>a month</span>
            </p>
            <Ticks items={PRO_FEATURES} />
            <ProButton currency={currency} />
          </li>
        </ul>

        <section className="pricing-org" aria-labelledby="org-title">
          <p>
            <strong id="org-title">Running a school, church or big event?</strong>{" "}
            <span>Rooms for 500, your branding, host controls.</span>
          </p>
          <a className="btn pricing-org-btn" href={WHATSAPP_LINK} target="_blank" rel="noreferrer">
            Talk to us
          </a>
        </section>

        <section className="pricing-faq" aria-labelledby="faq-title">
          <h2 id="faq-title" className="display pricing-faq-title">
            Questions
          </h2>
          {FAQ.map((item, i) => (
            <details key={item.q} className="faq-item" open={i === 0}>
              <summary>
                {item.q}
                <Icon name="chevronDown" size={18} stroke={2.2} className="faq-chevron" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      </div>
    </TopLayout>
  );
}

function Ticks({ items }: { items: string[] }) {
  return (
    <ul className="plan-ticks">
      {items.map((text) => (
        <li key={text}>
          <Icon name="check" size={20} stroke={2.6} className="plan-check" />
          {text}
        </li>
      ))}
    </ul>
  );
}

/** "Go Pro": signs a guest in first, then hands over to the Bachs checkout. */
function ProButton({ currency }: { currency: Currency }) {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user?.isPro) {
    return (
      <p className="btn btn-block plan-btn plan-btn-active">
        <Icon name="crown" size={18} fill />
        You have Pro
      </p>
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
      <button
        className="btn btn-gold btn-block plan-btn"
        onClick={() => void handleUpgrade()}
        disabled={busy}
      >
        <ActionSwapCascadeText value={busy ? "starting" : "upgrade"}>
          {busy ? "Starting checkout…" : "Go Pro"}
        </ActionSwapCascadeText>
      </button>
      {error && (
        <p className="pro-error error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

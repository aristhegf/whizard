import { linkTo } from "./router";
import { SideLayout } from "./ui/Chrome";

export function PrivacyScreen() {
  return (
    <SideLayout active={null} className="account-page">
      <article className="panel prose">
        <h1 className="page-title">Privacy</h1>
        <p className="muted">Last updated 27 September 2026</p>

        <p>
          Whizard is a free quiz game. This page explains, in plain words, what it stores and why.
          It doesn’t show ads, sell data or use tracking cookies.
        </p>

        <h2>Playing as a guest</h2>
        <p>
          You only give a nickname. It lives in the room while you play, and the room is deleted
          about 30 minutes after everyone leaves. Your browser also keeps a random ID and your
          nickname, so you can rejoin after a reload.
        </p>
        <p>
          When a game finishes, its result is saved with that random ID for 7 days. That’s so the
          game can move to your account if you sign up. After 7 days the ID is removed. Games where
          nobody had an account are then deleted; otherwise only your nickname stays, so the other
          players’ history still makes sense.
        </p>
        <p>
          So you don’t get the same questions again, the ID of each question you’re asked is kept
          with that random ID (or your account, if you have one) for 60 days, then deleted.
        </p>

        <h2>With an account</h2>
        <ul>
          <li>Your username, the name you choose and your settings.</li>
          <li>
            Your passkeys’ public keys. These can only check a sign-in; they can’t be used to sign
            in. Whizard never sees your fingerprint, face or PIN.
          </li>
          <li>
            A sign-in cookie, which lasts up to 60 days. It’s used only to keep you signed in.
          </li>
          <li>
            Results of the games you finish: the category, level, placing, score and how many you
            got right. Other players see your placing and score, never which answers you got right.
          </li>
          <li>
            If you turn on pings: the address your browser gives Whizard for sending you
            notifications, your quiet hours and your time zone. Turning pings off on a device, or
            signing out, removes that device’s address.
          </li>
          <li>
            Your friends, friend requests and groups. Friends and fellow group members can see your
            record against them and your place on group leaderboards.
          </li>
        </ul>
        <p>
          Your username is public to people you play with, so they can find you. Accounts are for
          people aged 13 and over.
        </p>

        <h2>Visitor stats</h2>
        <p>
          To count visitors, your browser keeps another random ID, used for nothing else. So that a
          private window or cleared storage doesn’t count you twice, the server also makes a one-way
          code from your network address and browser type. It’s scrambled with a secret key so it
          can’t be turned back into your address, and it’s deleted 30 days after your last visit;
          your IP address itself is never stored. These, with the first and last day you visited,
          tell a return visit from a new visitor. Everything else is a daily total: pages viewed,
          rooms made, games played, and, for new visitors only, the site you came from, your country
          (worked out by Cloudflare) and whether you’re on a phone, tablet or computer. These totals
          are shown on the public{" "}
          <a className="btn-link" {...linkTo("/stats")}>
            stats page
          </a>
          . None of it is linked to your nickname, games or account.
        </p>

        <h2>Your choices</h2>
        <p>
          On your account page you can download everything stored about you, or delete your account.
          Deleting removes your account, passkeys, sign-ins and settings straight away. Your rows in
          other players’ game history are kept as “Former player”, with nothing that links back to
          you.
        </p>

        <h2>Where it’s stored</h2>
        <p>
          Whizard runs on Cloudflare, which stores the data and handles the network traffic. Basic
          request logs are kept by Cloudflare for a few days to keep the service running.
        </p>

        <h2>Questions</h2>
        <p>
          Open an issue on{" "}
          <a href="https://github.com/aristhegf/whizard/issues" rel="noreferrer">
            the project’s GitHub page
          </a>
          .
        </p>
      </article>
    </SideLayout>
  );
}

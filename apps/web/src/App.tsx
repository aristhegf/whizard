import { normalizeRoomCode } from "@whizard/game-core";
import { lazy, Suspense, useEffect } from "react";
import { useAccount } from "./account";
import { Notice } from "./Notice";
import { HomePage } from "./pages/HomePage";
import { WelcomePage } from "./pages/WelcomePage";
import { pageOf, reportPage } from "./presence";
import { useRoute } from "./router";
import { Announcement } from "./ui/Announcement";
import { Backdrop } from "./ui/Chrome";
import { RingFieldBackdrop } from "./ui/RingFieldBackdrop";
import { whenIdle } from "./ui/idle";
import { ReturnToRoom } from "./ui/ReturnToRoom";

// Only the home screens ship with the first load. Every other page is fetched when it is opened,
// so the first screen isn't waiting on the room, the games, the admin area and the rest.
const AdminApp = lazy(() => import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })));
const AccountScreen = lazy(() =>
  import("./AccountScreen").then((m) => ({ default: m.AccountScreen })),
);
const AvatarCreator = lazy(() =>
  import("./avatar/AvatarCreator").then((m) => ({ default: m.AvatarCreator })),
);
const JigsawPage = lazy(() =>
  import("./pages/JigsawPage").then((m) => ({ default: m.JigsawPage })),
);
const AboutPage = lazy(() => import("./pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const PricingPage = lazy(() =>
  import("./pages/PricingPage").then((m) => ({ default: m.PricingPage })),
);
const StatsPage = lazy(() => import("./pages/StatsPage").then((m) => ({ default: m.StatsPage })));
const TopicsPage = lazy(() =>
  import("./pages/TopicsPage").then((m) => ({ default: m.TopicsPage })),
);
const PrivacyScreen = lazy(() =>
  import("./PrivacyScreen").then((m) => ({ default: m.PrivacyScreen })),
);
const RoomScreen = lazy(() => import("./RoomScreen").then((m) => ({ default: m.RoomScreen })));
const AddFriendScreen = lazy(() =>
  import("./FriendsScreen").then((m) => ({ default: m.AddFriendScreen })),
);
const FriendsScreen = lazy(() =>
  import("./FriendsScreen").then((m) => ({ default: m.FriendsScreen })),
);
const GroupScreen = lazy(() => import("./FriendsScreen").then((m) => ({ default: m.GroupScreen })));

/** Guests get the page that introduces Whizard; people signed in go straight to the games. Blank
 * for the moment it takes to find out, so neither flashes up first. */
function HomeRoute() {
  const account = useAccount();
  if (account.status === "loading") return null;
  return account.user ? <HomePage /> : <WelcomePage />;
}

export function App() {
  const route = useRoute();
  const page = pageOf(route);
  useEffect(() => reportPage(page), [page]);
  // From a home screen the next step is usually a room, so fetch it once the page is idle and
  // the click has nothing to wait for.
  useEffect(() => {
    if (page !== "home" && page !== "games") return;
    return whenIdle(() => void import("./RoomScreen"));
  }, [page]);
  return (
    <>
      <Backdrop />
      <RingFieldBackdrop />
      {route.name !== "room" && <Announcement />}
      <main>
        <Suspense fallback={null}>
          {route.name === "room" ? (
            <RoomRoute code={route.code} />
          ) : route.name === "games" ? (
            <HomePage />
          ) : route.name === "topics" ? (
            <TopicsPage />
          ) : route.name === "jigsaw" ? (
            <JigsawPage />
          ) : route.name === "account" ? (
            <AccountScreen />
          ) : route.name === "avatar" ? (
            <AvatarCreator />
          ) : route.name === "friends" ? (
            <FriendsScreen />
          ) : route.name === "add" ? (
            <AddFriendScreen key={route.username} username={route.username} />
          ) : route.name === "group" ? (
            <GroupScreen key={route.id} id={route.id} />
          ) : route.name === "privacy" ? (
            <PrivacyScreen />
          ) : route.name === "stats" ? (
            <StatsPage />
          ) : route.name === "admin" ? (
            <AdminApp section={route.section} item={route.item} />
          ) : route.name === "pricing" ? (
            <PricingPage />
          ) : route.name === "about" ? (
            <AboutPage />
          ) : (
            <HomeRoute />
          )}
        </Suspense>
      </main>
      {route.name !== "room" && route.name !== "admin" && <ReturnToRoom page={page} />}
    </>
  );
}

function RoomRoute({ code }: { code: string }) {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return <Notice message="That isn’t a valid room link." />;
  return <RoomScreen key={normalized} code={normalized} />;
}

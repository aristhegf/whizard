import { normalizeRoomCode } from "@whizard/game-core";
import { useEffect } from "react";
import { useAccount } from "./account";
import { AdminApp } from "./admin/AdminApp";
import { AccountScreen } from "./AccountScreen";
import { AvatarCreator } from "./avatar/AvatarCreator";
import { AddFriendScreen, FriendsScreen, GroupScreen } from "./FriendsScreen";
import { Notice } from "./Notice";
import { HomePage } from "./pages/HomePage";
import { JigsawPage } from "./pages/JigsawPage";
import { AboutPage } from "./pages/AboutPage";
import { PricingPage } from "./pages/PricingPage";
import { StatsPage } from "./pages/StatsPage";
import { TopicsPage } from "./pages/TopicsPage";
import { WelcomePage } from "./pages/WelcomePage";
import { pageOf, reportPage } from "./presence";
import { PrivacyScreen } from "./PrivacyScreen";
import { RoomScreen } from "./RoomScreen";
import { useRoute } from "./router";
import { Announcement } from "./ui/Announcement";
import { Backdrop } from "./ui/Chrome";
import { ReturnToRoom } from "./ui/ReturnToRoom";

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
  return (
    <>
      <Backdrop />
      {route.name !== "room" && <Announcement />}
      <main>
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

import { normalizeRoomCode } from "@whizard/game-core";
import { useEffect } from "react";
import { AdminApp } from "./admin/AdminApp";
import { AccountScreen } from "./AccountScreen";
import { AddFriendScreen, FriendsScreen, GroupScreen } from "./FriendsScreen";
import { Notice } from "./Notice";
import { GamesPage } from "./pages/GamesPage";
import { HomePage } from "./pages/HomePage";
import { JigsawPage } from "./pages/JigsawPage";
import { PricingPage } from "./pages/PricingPage";
import { StatsPage } from "./pages/StatsPage";
import { TopicsPage } from "./pages/TopicsPage";
import { pageOf, reportPage } from "./presence";
import { PrivacyScreen } from "./PrivacyScreen";
import { RoomScreen } from "./RoomScreen";
import { useRoute } from "./router";
import { Announcement } from "./ui/Announcement";
import { Backdrop } from "./ui/Chrome";
import { ReturnToRoom } from "./ui/ReturnToRoom";

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
          <GamesPage />
        ) : route.name === "topics" ? (
          <TopicsPage />
        ) : route.name === "jigsaw" ? (
          <JigsawPage />
        ) : route.name === "account" ? (
          <AccountScreen />
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
        ) : (
          <HomePage />
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

import { normalizeRoomCode } from "@whizard/game-core";
import { AccountScreen } from "./AccountScreen";
import { AddFriendScreen, FriendsScreen, GroupScreen } from "./FriendsScreen";
import { Notice } from "./Notice";
import { GamesPage } from "./pages/GamesPage";
import { HomePage } from "./pages/HomePage";
import { TopicsPage } from "./pages/TopicsPage";
import { PrivacyScreen } from "./PrivacyScreen";
import { RoomScreen } from "./RoomScreen";
import { useRoute } from "./router";
import { Backdrop } from "./ui/Chrome";

export function App() {
  const route = useRoute();
  return (
    <>
      <Backdrop />
      <main>
        {route.name === "room" ? (
          <RoomRoute code={route.code} />
        ) : route.name === "games" ? (
          <GamesPage />
        ) : route.name === "topics" ? (
          <TopicsPage />
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
        ) : (
          <HomePage />
        )}
      </main>
    </>
  );
}

function RoomRoute({ code }: { code: string }) {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return <Notice message="That isn’t a valid room link." />;
  return <RoomScreen key={normalized} code={normalized} />;
}

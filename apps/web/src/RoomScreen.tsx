import {
  ELIMINATION_MIN_PLAYERS,
  JIGSAW_PICTURES,
  photoPicture,
  LEVEL_NAMES,
  MAX_PLAYERS,
  NICKNAME_INPUT_MAX_LENGTH,
  QUIZ_CATEGORIES,
  QUIZ_VARIANTS,
  ROUNDS_MODES,
  type AnyQuizView,
  type ConnectionsView,
  type JigsawView,
  type LogicView,
  type QuizSettings,
  type SpotItView,
  type WordRushView,
} from "@whizard/game-core";
import { AVATAR_IDS } from "@whizard/protocol";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ActionSwapCascadeIcon,
  ActionSwapCascadeText,
} from "@/components/motion/action-swap-cascade";
import {
  Expandable,
  ExpandableCard,
  ExpandableContent,
  ExpandableTrigger,
} from "@/components/cult/expandable";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Tooltip } from "@/components/motion/tooltip";
import { useAccount } from "./account";
import { PingFriendsDialog } from "./FriendsScreen";
import { ProfileDialog } from "./ProfileDialog";
import { CATALOG, GAME_GROUPS, isPlayable, type CatalogGame } from "./catalog";
import { ConnectionsScreen } from "./games/connections/ConnectionsScreen";
import {
  ConnectionsSettingsRows,
  connectionsModeName,
  parseConnectionsSettings,
} from "./games/connections/ConnectionsSettingsRows";
import { useJigsawPhoto } from "./games/jigsaw/JigsawPhoto";
import { JigsawScreen } from "./games/jigsaw/JigsawScreen";
import {
  JigsawSettingsRows,
  parseJigsawSettings,
  levelSummary,
  pictureName,
} from "./games/jigsaw/JigsawSettingsPanel";
import { LogicScreen } from "./games/logic/LogicScreen";
import {
  gridName,
  LogicSettingsRows,
  logicModeName,
  parseLogicSettings,
} from "./games/logic/LogicSettingsRows";
import { QuizScreen } from "./games/quiz/QuizScreen";
import { QuizSettingsRows, parseQuizSettings } from "./games/quiz/QuizSettingsPanel";
import { TopicOptions } from "./games/quiz/TopicPicker";
import { RoundsEliminationScreen } from "./games/rounds/RoundsEliminationScreen";
import { RoundsScreen } from "./games/rounds/RoundsScreen";
import {
  RoundsSettingsRows,
  isRoundsGame,
  parseRoundsSettings,
} from "./games/rounds/RoundsSettingsRows";
import { Notice } from "./Notice";
import type { RoomClient, RoomClientState, RoomSnapshot } from "./roomClient";
import { navigate, roomPath } from "./router";
import { loadAvatar, loadNickname, saveNickname } from "./storage";
import { Avatar } from "./ui/Avatar";
import { BottomSheet } from "./ui/BottomSheet";
import { AvatarPicker, openAvatarCreator } from "./ui/AvatarPicker";
import { Brand } from "./ui/Chrome";
import { useMediaQuery } from "./ui/common";
import { useConfirm } from "./ui/ConfirmDialog";
import { InfoTip } from "./ui/InfoTip";
import { Loading } from "./ui/Loading";
import { useShakeOnError } from "./ui/errorShake";
import { focusSetting, SettingRow, SettingSelect } from "./ui/SettingSelect";
import { SettingGroup } from "./games/settingRows";
import { canGenerateArt, preloadGeneratingArt } from "./ui/GeneratingArt";
import { useToast } from "./ui/toast";
import { GameNoticeContext, GameNotices } from "./ui/gameNotice";
import { Icon } from "./ui/Icon";
import { QrCode } from "./ui/QrCode";
import { usePrefersStill } from "./display";
import { reportInvite } from "./presence";
import { play } from "./sounds";
import { SettingsButton } from "./ui/SettingsDialog";
import { SlideToPlay } from "./ui/SlideToPlay";
import { useRoom } from "./useRoom";

export function RoomScreen({ code }: { code: string }) {
  const { client, state } = useRoom(code);
  const [notices] = useState(() => new GameNotices());
  useRoomToasts(state, notices);
  // For what needs a yes first: quitting a game in progress, leaving a room with others.
  const ask = useConfirm();

  if (state.fatal) return <Notice message={state.fatal} />;

  const room = state.room;
  const joined = !!(state.playerId && room);
  // Someone who quit the game waits in the room for the next one.
  const sittingOut =
    joined && room!.phase !== "lobby" && room!.sittingOut.includes(state.playerId!);
  const inGame = joined && room!.phase !== "lobby" && !!state.game && !sittingOut;

  const view = inGame
    ? (state.game as
        AnyQuizView | WordRushView | SpotItView | JigsawView | ConnectionsView | LogicView)
    : null;
  // Leaving mid-game can't be undone, so it asks first while you're still playing: in a
  // jigsaw until you finish, in Elimination only while you're still in it.
  let midGame = false;
  if (room?.phase === "playing" && view) {
    if (view.game === "jigsaw") {
      midGame = view.board !== null && !view.me?.finished && !view.final;
    } else if (view.game === "connections") {
      // In Elimination, solving a round only keeps you in: leaving still loses the game.
      midGame = view.words !== null && (view.round ? !view.final : view.answer === null);
    } else if (view.game === "logic") {
      midGame = view.grid !== null && (view.round ? !view.final : view.solution === null);
    } else {
      const stage = view.stage.kind;
      const stillIn =
        "mode" in view ? view.me?.status === "in" || view.me?.status === "finalist" : true;
      midGame =
        stillIn &&
        (stage === "question" ||
          stage === "answer" ||
          stage === "reveal" ||
          stage === "cut" ||
          stage === "final" ||
          stage === "puzzle" ||
          stage === "result");
    }
  }
  const gameProps = {
    client,
    room: room!,
    playerId: state.playerId!,
    isHost: room?.hostId === state.playerId,
    latency: <Latency state={state} />,
    onQuit: () => quit(),
  };

  // Quitting a game that's still going takes you back to the room; the others play on, and
  // you're in the next game. Once it's over, the results' Home button leaves the room.
  const quit = () => {
    if (room?.phase !== "playing") {
      leave("/");
      return;
    }
    // Always a choice, kept to one line: quitting alone, and for the host with others
    // here, ending it for everyone instead. A player on their own is simply asked.
    const others = (room?.players.length ?? 0) > 1;
    const forEveryone = others && room?.hostId === state.playerId;
    ask({
      title: "Quit this game?",
      text: !others
        ? "You’ll go back to the room."
        : forEveryone
          ? "Quit on your own and the game goes on, or end it and everyone comes back to the room."
          : "Just you: you’ll go back to the room and can rejoin. The game goes on without you.",
      yes: "Quit",
      ...(forEveryone
        ? { alt: { label: "End for everyone", run: () => client.backToLobby() } }
        : {}),
      run: () => client.quitGame(),
    });
  };

  const leave = (to: string) => {
    const go = () => {
      client.leave();
      navigate(to);
    };
    if (!midGame) return go();
    ask({ title: "Leave this game?", text: "You can’t rejoin it.", yes: "Leave", run: go });
  };

  // The host waiting in the room while a game runs without them can end it for everybody:
  // everyone comes back, where the settings can be changed and the game started again. The
  // host in the game gets the same choice from Quit.
  const endGame = () =>
    ask({
      title: "End this game?",
      text: "Everyone will come back to the room, and this game’s scores won’t be kept.",
      yes: "End Game",
      run: () => client.backToLobby(),
    });

  return (
    <GameNoticeContext.Provider value={notices}>
      <div className="page room-page">
        <h1 className="sr-only">Whizard room {code}</h1>
        {view?.game === "jigsaw" ? (
          <JigsawScreen {...gameProps} view={view} />
        ) : view?.game === "connections" ? (
          <ConnectionsScreen {...gameProps} view={view} />
        ) : view?.game === "logic" ? (
          <LogicScreen {...gameProps} view={view} />
        ) : view && view.game !== "quiz" && "mode" in view ? (
          <RoundsEliminationScreen {...gameProps} view={view} />
        ) : view && view.game !== "quiz" ? (
          <RoundsScreen {...gameProps} view={view} />
        ) : view ? (
          <QuizScreen {...gameProps} view={view} />
        ) : joined ? (
          <Lobby
            client={client}
            state={state}
            room={room!}
            playerId={state.playerId!}
            sittingOut={sittingOut}
            onLeave={leave}
            onEndGame={endGame}
          />
        ) : (
          <JoinScreen code={code} state={state} client={client} />
        )}
      </div>
    </GameNoticeContext.Provider>
  );
}

/**
 * Toasts for who comes and goes, a new host, the connection dropping and coming back, and errors.
 * During a game, who comes and goes shows in the game's slim line at the bottom instead.
 */
function useRoomToasts(state: RoomClientState, notices: GameNotices) {
  const toast = useToast();
  const seen = useRef<{
    players: Map<string, string>;
    hostId: string | null;
    sittingOut: Set<string>;
    phase: string;
  } | null>(null);
  const offline = useRef<string | null>(null);

  const { room, playerId, connection, notice } = state;

  // Something the server turned down, like starting a game without enough players.
  useEffect(() => {
    if (notice) toast.show({ title: notice, status: "error" });
  }, [notice, toast]);

  useEffect(() => {
    if (!room || !playerId) return;
    const players = new Map(room.players.map((p) => [p.id, p.nickname]));
    const sittingOut = new Set(room.sittingOut);
    const before = seen.current;
    seen.current = { players, hostId: room.hostId, sittingOut, phase: room.phase };
    // The first snapshot after joining is just who's already here.
    if (!before) return;
    const say = (nickname: string, what: string, status: "info" | "neutral") => {
      const said = notices.say(
        <>
          <b>{nickname}</b> {what}
        </>,
      );
      if (!said) toast.show({ title: `${nickname} ${what}`, status });
    };
    for (const [id, nickname] of players) {
      if (!before.players.has(id)) say(nickname, "joined", "info");
    }
    for (const [id, nickname] of before.players) {
      if (!players.has(id)) say(nickname, "left the room", "neutral");
    }
    // Quitting a game keeps you in the room: the others hear you've left the game, and when
    // you go back in.
    for (const id of sittingOut) {
      const nickname = players.get(id);
      if (id !== playerId && nickname && !before.sittingOut.has(id)) {
        say(nickname, "left the game", "neutral");
      }
    }
    // Only mid-game: a new game clears the list for everyone.
    const stillPlaying = before.phase === "playing" && room.phase === "playing";
    for (const id of stillPlaying ? before.sittingOut : []) {
      const nickname = players.get(id);
      if (id !== playerId && nickname && !sittingOut.has(id)) {
        say(nickname, "is back in the game", "info");
      }
    }
    // A game that stops part-way through was ended by the host: one that runs its course
    // moves on to "finished", and only the host can bring everyone back mid-game.
    if (before.phase === "playing" && room.phase === "lobby" && room.hostId !== playerId) {
      const endedBy = room.hostId ? players.get(room.hostId) : undefined;
      if (endedBy) {
        toast.show({
          title: `${endedBy} ended the game`,
          description: "You’re back in the room.",
          status: "neutral",
        });
      }
    }
    const newHost = room.hostId && room.hostId !== playerId ? players.get(room.hostId) : null;
    if (newHost && before.hostId !== room.hostId) say(newHost, "is the host now", "info");
    if (room.hostId === playerId && before.hostId !== playerId) {
      toast.show({
        title: "You’re the host now",
        description: "You choose the settings and start the game.",
        status: "success",
      });
    }
  }, [room, playerId, toast, notices]);

  useEffect(() => {
    if (connection === "reconnecting" && !offline.current) {
      offline.current = toast.show({
        title: "Connection lost",
        description: "Reconnecting…",
        status: "loading",
        duration: 0,
        dismissible: false,
      });
    } else if (connection === "open" && offline.current) {
      toast.update(offline.current, {
        title: "Back online",
        description: undefined,
        status: "success",
        duration: 2500,
        dismissible: true,
      });
      offline.current = null;
    } else if (connection === "closed" && offline.current) {
      toast.dismiss(offline.current);
      offline.current = null;
    }
  }, [connection, toast]);
}

/** How the connection is doing: a green badge with the round trip, or a spinning one while
    (re)connecting. It only animates when the state changes, not on every new ping. */
export function Latency({ state }: { state: RoomClientState }) {
  const connected = state.connection === "open";
  return (
    <AnimatedBadge
      className={`net${connected ? "" : " warn"}`}
      status={connected ? "success" : "loading"}
      size="sm"
      contentKey={state.connection}
      aria-live="polite"
    >
      {connected
        ? state.latencyMs === null
          ? "Connected"
          : `${state.latencyMs}\u00a0ms`
        : state.connection === "connecting"
          ? "Connecting…"
          : "Reconnecting…"}
    </AnimatedBadge>
  );
}

// Joining --------------------------------------------------------------------------------------

function JoinScreen({
  code,
  state,
  client,
}: {
  code: string;
  state: RoomClientState;
  client: RoomClient;
}) {
  const account = useAccount();
  const user = account.status === "ready" ? account.user : null;
  // The name they played under last time, or their account's.
  const known = loadNickname() || user?.displayName || "";
  // null until they type, so the account name can fill in once it has loaded.
  const [typed, setTyped] = useState<string | null>(null);
  const nickname = typed ?? known;
  const [picked, setPicked] = useState<string | null>(null);
  const avatar = picked ?? user?.avatar ?? loadAvatar() ?? AVATAR_IDS[0];
  const disabled = state.connection !== "open";
  const [attempt, setAttempt] = useState(0);
  const { ref, isError } = useShakeOnError<HTMLInputElement>(state.joinError, attempt);

  // Someone who has played before goes straight in with the same name and avatar. They can
  // change either in the lobby. If the name is taken here, the form below asks for another.
  const autoJoined = useRef(false);
  // While the account loads, there may be a name coming: wait rather than flash the form.
  const goingStraightIn = (!!known || account.status === "loading") && !state.joinError;
  useEffect(() => {
    // A player coming back to this room is already rejoining with their session.
    if (!known || autoJoined.current || state.joining || state.connection !== "open") return;
    autoJoined.current = true;
    client.join(known, avatar);
  }, [known, avatar, state.joining, state.connection, client]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!nickname.trim()) return;
    setAttempt((n) => n + 1);
    client.join(nickname, avatar);
  };

  return (
    <div className="join-screen">
      <header className="topnav">
        <Brand />
      </header>
      <form className="panel join-card" onSubmit={handleSubmit}>
        <div className="code-box small-code">
          <span className="code-label">Room Code</span>
          <strong translate="no">{code}</strong>
        </div>
        {(state.joining || goingStraightIn) && !state.joinError ? (
          <p className="muted center" aria-live="polite">
            Joining…
          </p>
        ) : (
          <>
            <label className="label" htmlFor="nickname">
              Choose a nickname
            </label>
            <input
              ref={ref}
              className={`t-input${isError ? " is-error" : ""}`}
              id="nickname"
              name="nickname"
              aria-invalid={isError}
              value={nickname}
              maxLength={NICKNAME_INPUT_MAX_LENGTH}
              autoComplete="nickname"
              placeholder="e.g. Tolu"
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
            />
            <span className="label" id="avatar-label">
              Pick your avatar
            </span>
            <AvatarPicker
              value={avatar}
              onPick={setPicked}
              onMake={() => {
                // Keep what they typed for when they come back.
                if (nickname.trim()) saveNickname(nickname);
                openAvatarCreator();
              }}
              labelledBy="avatar-label"
              size={56}
            />
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={disabled || !nickname.trim()}
            >
              Join
            </button>
            {state.joinError && (
              <p className="error" role="alert">
                {state.joinError}
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}

// Lobby ----------------------------------------------------------------------------------------

const CAPACITY_OPTIONS = [2, 4, 6, 8, 10, 12, 16, 20].filter((n) => n <= MAX_PLAYERS);
/** Wide enough for the three-column lobby; narrower screens use sheets for the side panels. */
/**
 * The lobby is drawn for a phone of 390 by 780, or a screen of 1440 by 900, and scaled as a whole
 * to fit whatever it's on, from a narrow phone to a television: everything grows or shrinks
 * together instead of wrapping. A screen that's short for its width (a phone on its side) stops
 * shrinking at SMALLEST_FOR_HEIGHT and scrolls instead, so it stays readable.
 */
const LOBBY_PHONE = { width: 390, height: 780 };
const LOBBY_SCREEN = { width: 1440, height: 900 };
const LOBBY_WIDE_FROM = 1100;
const SMALLEST_FOR_HEIGHT = 0.72;

function lobbyScale(): number {
  const drawn = innerWidth >= LOBBY_WIDE_FROM ? LOBBY_SCREEN : LOBBY_PHONE;
  const scale = Math.min(
    innerWidth / drawn.width,
    Math.max(innerHeight / drawn.height, SMALLEST_FOR_HEIGHT),
  );
  return Math.round(scale * 1000) / 1000;
}

function onResize(listener: () => void) {
  addEventListener("resize", listener);
  return () => removeEventListener("resize", listener);
}

/** {@link lobbyScale}, kept up to date as the window changes. */
function useLobbyScale(): number {
  return useSyncExternalStore(onResize, lobbyScale, () => 1);
}

const WIDE_LOBBY = `(min-width: ${LOBBY_WIDE_FROM}px)`;
/** Seats shown in the players row, empty ones waiting, unless the room holds fewer. */
const LOBBY_SLOTS = 6;
// Swap for the mascot pointing at the code once that pose is drawn.
const LOBBY_MASCOT = "/art/mascot/hero.webp";
// Its size, so the space is kept while it loads and the title doesn't jump.
const LOBBY_MASCOT_SIZE = { width: 866, height: 857 };

/** The game's settings in one line, like "Classic quiz, Bible, Easy, 10 questions". */
function settingsSummary({
  gameId,
  settings,
  rounds,
  jigsaw,
  connections,
  logic,
}: {
  gameId: string;
  settings: ReturnType<typeof parseQuizSettings> | null;
  rounds: ReturnType<typeof parseRoundsSettings> | null;
  jigsaw: ReturnType<typeof parseJigsawSettings> | null;
  connections: ReturnType<typeof parseConnectionsSettings> | null;
  logic: ReturnType<typeof parseLogicSettings> | null;
}): string | null {
  // The jigsaw's own line is written with dots, for the pages that list it; here it's a list.
  if (jigsaw) return levelSummary(jigsaw).replaceAll(" · ", ", ");
  // "Speed, Medium, 5 minutes"; Classic has no clock, and Elimination's is for each round.
  const puzzleTime = (mode: string, minutes: number) =>
    mode === "classic" ? "" : `, ${minutes} minutes${mode === "elimination" ? " a round" : ""}`;
  if (connections) {
    const { mode, level, minutes } = connections;
    return `${connectionsModeName(mode)}, ${LEVEL_NAMES[level]}${puzzleTime(mode, minutes)}`;
  }
  if (logic) {
    const { mode, size, minutes } = logic;
    const grid = gridName(size).replaceAll(" · ", ", ");
    return `${logicModeName(mode)}, ${grid}${puzzleTime(mode, minutes)}`;
  }
  if (rounds) {
    const each =
      rounds.mode === "elimination"
        ? `${rounds.rounds} ${gameId === "word-rush" ? "words" : "grids"} a round`
        : `${rounds.rounds} rounds`;
    const mode = ROUNDS_MODES.find((m) => m.id === rounds.mode)?.name;
    return `${mode}, ${LEVEL_NAMES[rounds.level]}, ${each}, ${rounds.timeLimitSeconds}s each`;
  }
  if (settings) {
    const variant = QUIZ_VARIANTS.find((v) => v.id === settings.variant)?.name;
    const topic = QUIZ_CATEGORIES.find((c) => c.id === settings.category)?.name;
    const level = settings.difficulty[0]!.toUpperCase() + settings.difficulty.slice(1);
    const count = `${settings.count} questions${settings.variant === "elimination" ? " a round" : ""}`;
    const time = settings.variant === "classic" ? "" : `, ${settings.timeLimitSeconds}s each`;
    return `${variant} quiz, ${topic}, ${level}, ${count}${time}`;
  }
  return null;
}

function Lobby({
  client,
  state,
  room,
  playerId,
  sittingOut,
  onLeave,
  onEndGame,
}: {
  client: RoomClient;
  state: RoomClientState;
  room: RoomSnapshot;
  playerId: string;
  /** Quit the game that's running (or just finished), and waiting for the next one. */
  sittingOut: boolean;
  onLeave: (to: string) => void;
  /** Host only: end the running game and bring everyone back to the room. */
  onEndGame: () => void;
}) {
  const ask = useConfirm();
  const isHost = room.hostId === playerId;
  // The game's settings can change in the lobby, or once a game is over, not while it runs.
  const canEdit = isHost && room.phase !== "playing";
  const gameId = room.game.id;
  const game = CATALOG.find((g) => g.id === gameId);
  const settings = gameId === "quiz" ? parseQuizSettings(room.game.settings) : null;
  const rounds = isRoundsGame(gameId) ? parseRoundsSettings(gameId, room.game.settings) : null;
  const jigsaw = gameId === "jigsaw" ? parseJigsawSettings(room.game.settings) : null;
  // Insane keeps a photo's own shape; the other levels use a square.
  const photo = useJigsawPhoto(
    room.code,
    isHost && gameId === "jigsaw",
    jigsaw?.level === "insane" ? "own" : "square",
  );
  const connections =
    gameId === "connections" ? parseConnectionsSettings(room.game.settings) : null;
  const logic = gameId === "logic" ? parseLogicSettings(room.game.settings) : null;
  const connected = room.players.filter((p) => p.connected);
  const alone = connected.length <= 1;
  const needMore =
    settings?.variant === "elimination" ||
    rounds?.mode === "elimination" ||
    jigsaw?.mode === "elimination" ||
    connections?.mode === "elimination" ||
    logic?.mode === "elimination"
      ? Math.max(0, ELIMINATION_MIN_PLAYERS - connected.length)
      : 0;
  const category = QUIZ_CATEGORIES.find((c) => c.id === settings?.category);
  const url = `${location.origin}${roomPath(room.code)}`;
  // Arriving from Ping on the friends page opens the invites, where that ping goes out.
  const [inviting, setInviting] = useState(() => new URLSearchParams(location.search).has("ping"));
  const [editingMe, setEditingMe] = useState(false);
  // Phones and tablets keep the room on one screen; these open in a sheet from the bottom.
  // Choosing a game happens in one too, on every screen: the games, then (for the quiz) its
  // topics, then the settings.
  const [sheet, setSheet] = useState<"game" | "settings" | "chat" | "games" | "topics" | null>(
    null,
  );
  // Whether the settings were reached by choosing a game, which adds Back and Done to them.
  const [guided, setGuided] = useState(false);
  const wide = useMediaQuery(WIDE_LOBBY);
  const scale = useLobbyScale();
  const me = room.players.find((p) => p.id === playerId);

  // The quiz countdown's generating effect needs three.js; fetch it while everyone gathers.
  const isQuiz = room.game.id === "quiz";
  useEffect(() => {
    if (isQuiz && canGenerateArt()) void preloadGeneratingArt().catch(() => {});
  }, [isQuiz]);

  // A soft pop when someone new arrives in the lobby.
  const joined = useRef(connected.length);
  useEffect(() => {
    if (connected.length > joined.current) play("join");
    joined.current = connected.length;
  }, [connected.length]);

  const title = settings ? `${category?.name ?? "Quiz"} Quiz` : (game?.name ?? "Quiz");
  const art =
    (jigsaw?.picture === "photo" && jigsaw.photo
      ? photoPicture(room.code, jigsaw.photo).src
      : jigsaw && JIGSAW_PICTURES.find((p) => p.id === jigsaw.picture)?.src) ||
    (game?.art ?? "/art/games/quiz.webp");
  const summary = settingsSummary({ gameId, settings, rounds, jigsaw, connections, logic });
  const kind = GAME_GROUPS.find((g) => g.id === game?.groups[0]);

  const canChangeTopic = isHost && !!(settings || jigsaw);
  const editTopic = () => {
    // The quiz's topics, then on to its settings, as when choosing a game.
    if (!jigsaw) {
      setGuided(true);
      return setSheet("topics");
    }
    if (!wide) setSheet("settings");
    requestAnimationFrame(() => focusSetting("picture"));
  };
  // On computers, a pencil on the card's cover; in the phone's sheet it's a button with its name
  // on, beside Change Game, so what's played is changed in the one place.
  const changeTopic = canChangeTopic && (
    <Tooltip content={jigsaw ? "Change picture" : "Change topic"}>
      <button
        className="icon-btn edit-btn"
        aria-label={jigsaw ? "Change picture" : "Change topic"}
        onClick={editTopic}
      >
        <Icon name="pencil" size={18} />
      </button>
    </Tooltip>
  );

  const gameArt = (
    <span className={jigsaw ? "summary-art picture" : "summary-art"}>
      <img src={art} alt="" />
    </span>
  );

  const gameCard = (className: string) => (
    <div className={`panel lobby-game ${className}`}>
      <div className={jigsaw ? "game-cover picture" : "game-cover"} style={wash(game)}>
        <img src={art} alt="" />
        {className !== "in-sheet" && changeTopic}
      </div>
      <div className="game-info">
        <h2 className="summary-title">{title}</h2>
        {game?.description && <p className="game-desc">{game.description}</p>}
      </div>
      <ul className="game-tags" aria-label="About this game">
        <li>
          <Icon name="users" size={15} />
          {game?.players ?? "1-20 players"}
        </li>
        {kind && (
          <li>
            <Icon name={kind.icon ?? "games"} size={15} />
            {kind.name}
          </li>
        )}
        {jigsaw && (
          <li>
            <Icon name="puzzle" size={15} />
            {pictureName(jigsaw.picture)}
          </li>
        )}
      </ul>
      {summary && (
        <p className="game-setup">
          <Icon name="settings" size={16} />
          <span className="summary">{summary}</span>
        </p>
      )}
      {(canEdit || (className === "in-sheet" && canChangeTopic)) && (
        <div className="game-actions">
          {className === "in-sheet" && canChangeTopic && (
            <button className="btn change-game" onClick={editTopic}>
              <Icon name="pencil" size={18} />
              {jigsaw ? "Change Picture" : "Change Topic"}
            </button>
          )}
          {canEdit && (
            <button
              className="btn change-game"
              onClick={() => {
                setGuided(false);
                setSheet("games");
              }}
            >
              <Icon name="repeat" size={18} />
              Change Game
            </button>
          )}
        </div>
      )}
    </div>
  );

  // Game, then room: the same rows in the same order in every game (games/settingRows.tsx).
  const settingsRows = (
    <div className="settings-list">
      <SettingGroup>Game</SettingGroup>
      {rounds && isRoundsGame(gameId) && (
        <RoundsSettingsRows
          game={gameId}
          settings={rounds}
          players={connected.length}
          editable={canEdit}
          onChange={(next) => client.configure(next)}
        />
      )}
      {settings && (
        <QuizSettingsRows
          settings={settings}
          players={connected.length}
          editable={canEdit}
          onChange={(next) => client.configure(next)}
        />
      )}
      {connections && (
        <ConnectionsSettingsRows
          settings={connections}
          players={connected.length}
          editable={canEdit}
          onChange={(next) => client.configure(next)}
        />
      )}
      {logic && (
        <LogicSettingsRows
          settings={logic}
          players={connected.length}
          editable={canEdit}
          onChange={(next) => client.configure(next)}
        />
      )}
      {jigsaw && (
        <JigsawSettingsRows
          settings={jigsaw}
          players={connected.length}
          editable={canEdit}
          onChange={(next) => client.configure(next)}
          onPickPhoto={photo.pick}
        />
      )}
      <SettingGroup>Room</SettingGroup>
      <SettingRow icon="users" id="max-players" label="Max Players">
        <SettingSelect
          id="max-players"
          label="Max Players"
          value={String(room.settings.maxPlayers)}
          disabled={!isHost}
          options={CAPACITY_OPTIONS.map((n) => ({
            value: String(n),
            label: String(n),
            disabled: n < room.players.length,
          }))}
          onChange={(value) => client.configureRoom({ maxPlayers: Number(value) })}
        />
      </SettingRow>
      <div className="setting-row toggle-row">
        <Icon name="clock" size={20} />
        <span className="setting-label">
          <span id="late-join-label">Allow Late Join</span>
        </span>
        <button
          className="switch"
          role="switch"
          aria-checked={room.settings.lateJoin}
          aria-labelledby="late-join-label"
          disabled={!isHost}
          onClick={() => client.configureRoom({ lateJoin: !room.settings.lateJoin })}
        />
      </div>
    </div>
  );

  const slots = Math.min(room.settings.maxPlayers, Math.max(LOBBY_SLOTS, room.players.length));
  const players = (
    <section className="lobby-players" aria-label="Players in the room">
      <span className="lobby-count">
        {connected.length}/{room.settings.maxPlayers} players
      </span>
      <ul className="player-list" aria-label="Players">
        {room.players.map((player) => {
          const mine = player.id === playerId;
          const face = <Avatar id={player.avatar} name={player.nickname} size={wide ? 84 : 60} />;
          return (
            <li
              key={player.id}
              className={`player${mine ? " me" : ""}${player.id === room.hostId ? " host" : ""}${player.connected ? "" : " offline"}`}
            >
              {mine ? (
                <button
                  className="player-me"
                  aria-label={`${player.nickname}: change your name or avatar`}
                  onClick={() => setEditingMe(true)}
                >
                  {face}
                  <span className="player-name">{player.nickname}</span>
                </button>
              ) : (
                <>
                  {face}
                  <span className="player-name">{player.nickname}</span>
                </>
              )}
              {player.id === room.hostId && (
                <span className="host-mark">
                  <Icon name="crown" size={15} />
                  <span className="sr-only">Host</span>
                </span>
              )}
              {mine && <span className="sr-only">You</span>}
              {!player.connected && (
                <AnimatedBadge status="warning" size="sm" className="offline-badge">
                  Offline
                </AnimatedBadge>
              )}
            </li>
          );
        })}
        {Array.from({ length: slots - room.players.length }, (_, i) => (
          <li key={`waiting-${i}`} className="player waiting" aria-hidden="true">
            <span className="slot-ring">
              <Icon name="plus" size={wide ? 34 : 24} />
            </span>
            {i === 0 && <span className="player-name">Waiting…</span>}
          </li>
        ))}
      </ul>
    </section>
  );

  const dock = (
    <div className="lobby-dock">
      {sittingOut && room.phase === "playing" ? (
        <div className="sitting-out">
          <p className="muted center" role="status">
            You left this game. The others are still playing, and your score is kept.
          </p>
          <button className="btn btn-gold btn-block" onClick={() => client.rejoinGame()}>
            <Icon name="play" size={20} fill />
            Rejoin the Game
          </button>
        </div>
      ) : isHost && needMore > 0 ? (
        <p className="muted center need-more" role="status">
          Elimination needs at least {ELIMINATION_MIN_PLAYERS} players. Invite {needMore} more to
          start.
        </p>
      ) : isHost ? (
        <SlideToPlay
          label="Slide to Play"
          name={alone ? "Slide to Play Solo" : "Slide to Play: start game for everyone"}
          doneLabel="Starting…"
          onDone={() => client.startGame()}
        />
      ) : (
        <p className="muted center waiting-note">Waiting for the host to start the game.</p>
      )}
    </div>
  );

  const hero = (
    <section className="lobby-hero" aria-label="Room">
      <img
        className="lobby-mascot"
        src={LOBBY_MASCOT}
        width={LOBBY_MASCOT_SIZE.width}
        height={LOBBY_MASCOT_SIZE.height}
        alt=""
      />
      <h2 className="lobby-title">
        <span>Your</span> <span className="gold">Game Room</span>
      </h2>
      <p className="lobby-sub">Share this code with your friends to join!</p>
      <div className="code-box lobby-code">
        <span className="code-label">Room Code</span>
        <strong className="room-code" translate="no">
          {room.code}
        </strong>
        <CopyButton text={`Join my Whizard room with code ${room.code}: ${url}`} />
      </div>
    </section>
  );

  const chatBody = (
    <>
      <div className="chat-empty">
        <Icon name="chat" size={30} />
        <p>Chat is on its way.</p>
        <p className="dim small">Soon you’ll be able to talk here while everyone gathers.</p>
      </div>
      <form className="chat-input" onSubmit={(event) => event.preventDefault()}>
        <input disabled placeholder="Type a message…" aria-label="Message (coming soon)" />
        <button type="submit" disabled aria-label="Send">
          <Icon name="send" size={18} />
        </button>
      </form>
    </>
  );

  // In a sheet on phones and tablets.
  const chat = (
    <section className="panel lobby-chat" aria-label="Room Chat">
      {chatBody}
    </section>
  );

  // On computers, a card by the game that opens up to the chat (Cult UI's expandable card).
  const chatCard = (
    <Expandable
      className="chat-expandable"
      role="region"
      aria-label="Room Chat"
      transitionDuration={0.3}
      easeType="easeOut"
    >
      {({ isExpanded }) => (
        <ExpandableCard className="panel lobby-chat chat-card" collapsedSize={{}} expandedSize={{}}>
          <ExpandableTrigger
            className="chat-head"
            aria-label="Room Chat"
            aria-expanded={isExpanded}
          >
            <Icon name="chat" size={22} />
            <span className="chat-title">Room Chat</span>
            <span className="soon-tag">Soon</span>
            <span className="t-acc-chevron chat-chevron" data-open={isExpanded} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <path d="M4 6.5L8 10.5L12 6.5" />
              </svg>
            </span>
          </ExpandableTrigger>
          <ExpandableContent preset="blur-sm">
            <div className="chat-open">{chatBody}</div>
          </ExpandableContent>
        </ExpandableCard>
      )}
    </Expandable>
  );

  const makePublic = (
    <div className="lobby-public">
      <Icon name="users" size={26} />
      <span className="setting-label">
        <span id="public-label">Make Public</span>
        <span className="soon-tag">Soon</span>
        <InfoTip label="About Make Public">Coming soon: anyone can find and join.</InfoTip>
      </span>
      <button
        className="switch"
        role="switch"
        aria-checked={false}
        aria-labelledby="public-label"
        disabled
      />
    </div>
  );

  // Choosing a game doesn't end at the game: it goes on to its settings, by way of the topics
  // for the quiz, so the host sets it up there and then.
  const pickGame = (next: string) => {
    if (next !== gameId && canEdit) client.chooseGame(next);
    setGuided(true);
    setSheet(next === "quiz" ? "topics" : "settings");
  };

  const pickTopic = (category: QuizSettings["category"]) => {
    if (settings && canEdit && category !== settings.category) {
      client.configure({ ...settings, category });
    }
    setGuided(true);
    setSheet("settings");
  };

  // The sheets that are steps in choosing a game, which computers get too.
  const flowSheet = sheet === "games" || sheet === "topics" || (sheet === "settings" && guided);
  const back =
    sheet === "topics"
      ? () => setSheet("games")
      : sheet === "settings" && guided
        ? () => setSheet(gameId === "quiz" ? "topics" : "games")
        : null;

  // With others here, a stray tap on Leave shouldn't take you out, or hand the room over.
  const leaveRoom = () => {
    if (connected.length <= 1) return onLeave("/");
    ask({
      title: "Leave the room?",
      text: isHost ? "Someone else will be the host." : "You can come back with the room code.",
      yes: "Leave",
      run: () => onLeave("/"),
    });
  };

  // Ending the room takes everyone home at once, so it asks first: it can't be undone.
  const endRoom = () =>
    ask({
      title: "End the room for everyone?",
      text: "Everyone will be sent home and the room will close. This can’t be undone.",
      yes: "End Room",
      run: () => client.endRoom(),
    });

  const bar = (
    <header className="room-bar">
      <Tooltip content="Leave the room" side="bottom">
        <button className="bar-btn leave-btn" aria-label="Leave" onClick={leaveRoom}>
          <Icon name="logout" size={20} />
        </button>
      </Tooltip>
      {isHost && room.phase === "playing" && (
        <Tooltip content="End the game and bring everyone back" side="bottom">
          <button className="bar-btn end-game-btn" aria-label="End Game" onClick={onEndGame}>
            <Icon name="flag" size={20} />
          </button>
        </Tooltip>
      )}
      {isHost && (
        <Tooltip content="End the room for everyone" side="bottom">
          <button className="bar-btn end-room-btn" aria-label="End Room" onClick={endRoom}>
            <Icon name="door" size={20} />
          </button>
        </Tooltip>
      )}
      <div className="room-actions">
        <Latency state={state} />
        <Tooltip content="Invite Friends" side="bottom">
          <button className="bar-btn" onClick={() => setInviting(true)}>
            <Icon name="invite" size={20} />
            <span>Invite Friends</span>
          </button>
        </Tooltip>
        <SettingsButton />
      </div>
    </header>
  );

  return (
    // Everything in the lobby, its sheets and dialogs too, scales together.
    <div className="lobby-scale" style={{ zoom: scale, "--z": scale } as CSSProperties}>
      {photo.element}
      {wide ? (
        <div className="lobby wide">
          {bar}
          <aside className="lobby-left">
            {gameCard("game-summary")}
            {chatCard}
          </aside>
          {hero}
          <aside className="lobby-settings" id="room-settings">
            <h2 className="section-title">
              <Icon name="settings" size={22} />
              Game Settings
            </h2>
            {/* One set of these controls at a time: while the sheet has them, the sign waits. */}
            {sheet === "settings" ? (
              <p className="dim small">They’re open in the panel below.</p>
            ) : (
              settingsRows
            )}
          </aside>
          {players}
          {dock}
          {makePublic}
        </div>
      ) : (
        <div className="lobby compact">
          {bar}
          {hero}
          <div className="panel game-summary lobby-game-chip">
            {gameArt}
            <span className="chip-text">
              <h2 className="summary-title">{title}</h2>
              <span className="summary dim small">
                {jigsaw ? `${pictureName(jigsaw.picture)}, ${summary}` : summary}
              </span>
            </span>
            {/* Stretched over the whole line, so tapping anywhere on it opens the game. */}
            <button
              className="chip-open"
              aria-label="About the Game"
              onClick={() => setSheet("game")}
            >
              <Icon name="chevronRight" size={20} />
            </button>
          </div>
          {players}
          <div className="lobby-sheets">
            <button
              className="btn"
              onClick={() => {
                setGuided(false);
                setSheet("settings");
              }}
            >
              <Icon name="settings" size={20} />
              Game Settings
            </button>
            <button className="btn" onClick={() => setSheet("chat")}>
              <Icon name="chat" size={20} />
              Chat
              <span className="soon-tag">Soon</span>
            </button>
          </div>
          {dock}
        </div>
      )}

      {sheet && (!wide || flowSheet) && (
        <BottomSheet
          labelledBy="lobby-sheet-title"
          className="lobby-sheet"
          onClose={() => setSheet(null)}
          header={(close) => (
            <div className="game-sheet-head">
              {back && (
                <button className="game-sheet-close" aria-label="Back" onClick={back}>
                  <Icon name="arrowLeft" size={20} stroke={2.4} />
                </button>
              )}
              <h2 id="lobby-sheet-title" className="game-sheet-title">
                {SHEET_TITLES[sheet]}
              </h2>
              <button className="game-sheet-close" aria-label="Close" onClick={close}>
                <Icon name="close" size={20} stroke={2.4} />
              </button>
            </div>
          )}
        >
          {(close) => (
            // Keyed, so each step of choosing a game comes in afresh.
            <div key={sheet} className={`lobby-sheet-body step-${sheet}`} data-float-choices>
              {sheet === "game" ? (
                gameCard("in-sheet")
              ) : sheet === "chat" ? (
                chat
              ) : sheet === "games" ? (
                <GameCarousel value={gameId} onPick={pickGame} />
              ) : sheet === "topics" ? (
                // The quiz's settings arrive a moment after the room switches to it.
                settings ? (
                  <TopicOptions
                    value={settings.category}
                    labelledBy="lobby-sheet-title"
                    onPick={pickTopic}
                  />
                ) : (
                  <Loading />
                )
              ) : (
                <>
                  {settingsRows}
                  {guided && (
                    <button className="btn btn-gold btn-block sheet-done" onClick={close}>
                      Done
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </BottomSheet>
      )}

      {editingMe && me && (
        <ProfileDialog
          nickname={me.nickname}
          avatar={me.avatar ?? AVATAR_IDS[0]}
          onSave={(nickname, avatar) => client.updateProfile(nickname, avatar)}
          onClose={() => setEditingMe(false)}
        />
      )}
      {inviting && <InviteDialog code={room.code} url={url} onClose={() => setInviting(false)} />}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied" : "Copy the code and link"}>
      <button
        className="icon-btn copy-btn"
        aria-label={copied ? "Copied" : "Copy the code and link"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            reportInvite();
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard blocked; the code is on screen.
          }
        }}
      >
        <ActionSwapCascadeIcon value={copied ? "copied" : "copy"}>
          <Icon name={copied ? "check" : "copy"} size={26} />
        </ActionSwapCascadeIcon>
      </button>
    </Tooltip>
  );
}

/** The phone's share sheet where there is one, otherwise the link copied to paste anywhere. */
function ShareLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my Whizard room", url });
        reportInvite();
      } else {
        await navigator.clipboard.writeText(url);
        reportInvite();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // The share sheet was dismissed or the clipboard is blocked; the code is on screen anyway.
    }
  };

  return (
    <button className="btn btn-gold btn-block" onClick={handleInvite} aria-live="polite">
      <Icon name="link" size={20} />
      <ActionSwapCascadeText value={copied ? "copied" : "share"}>
        {copied ? "Link Copied" : "Share Link"}
      </ActionSwapCascadeText>
    </button>
  );
}

/** Everything for bringing people in: the link, a QR code to scan, and pinging friends. */
function InviteDialog({ code, url, onClose }: { code: string; url: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Arriving from Ping on the friends page goes straight to the friends, where that ping goes out.
  const [pinging, setPinging] = useState(() => new URLSearchParams(location.search).has("ping"));
  // Before the friends' dialog opens itself (in an effect), so that one lands on top of this.
  useLayoutEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <>
      <dialog
        ref={dialog}
        className="app-dialog invite-dialog"
        aria-labelledby="invite-title"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onClick={(event) => {
          // A tap on the dimmed backdrop closes it.
          if (event.target === dialog.current) onClose();
        }}
      >
        <h2 id="invite-title" className="section-title">
          Invite Friends to <span translate="no">{code}</span>
        </h2>
        <QrCode value={url} label="QR code that opens this room" />
        <p className="dim small center">Scan to join, or send them the link.</p>
        <ShareLinkButton url={url} />
        <button className="btn btn-block" onClick={() => setPinging(true)}>
          <Icon name="bell" size={20} />
          Ping Friend
        </button>
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </dialog>
      {pinging && <PingFriendsDialog code={code} onClose={() => setPinging(false)} />}
    </>
  );
}

/** A game's own colours, for its card's cover in the lobby and in the game chooser. */
function wash(game: CatalogGame | undefined): CSSProperties {
  return {
    "--wash-a": game?.colors[0] ?? "#ff8c1a",
    "--wash-b": game?.colors[1] ?? "#4a1530",
  } as CSSProperties;
}

/** What each of the lobby's sheets is called. */
const SHEET_TITLES = {
  game: "About the Game",
  settings: "Game Settings",
  chat: "Room Chat",
  games: "Choose a Game",
  topics: "Choose a Topic",
} as const;

/**
 * The games side by side, to swipe through (or step through with the arrows), starting on the
 * room's game. It's the first step of Change Game.
 */
function GameCarousel({ value, onPick }: { value: string; onPick: (game: string) => void }) {
  const games = CATALOG.filter(isPlayable);
  const track = useRef<HTMLDivElement>(null);
  // Where the row is scrolled to: which dot is lit, and whether there's more either way.
  const [at, setAt] = useState({ dot: 0, start: true, end: true });
  const still = usePrefersStill();

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const dot = max > 0 ? Math.round((el.scrollLeft / max) * (games.length - 1)) : 0;
    setAt({ dot, start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 });
  };

  // Open on the game the room is playing now.
  useEffect(() => {
    const index = games.findIndex((g) => g.id === value);
    const card = track.current?.children[Math.max(0, index)] as HTMLElement | undefined;
    card?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
    onScroll();
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The arrows move one card along, for a mouse or a keyboard.
  const step = (by: number) => {
    const el = track.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: by * (card.offsetWidth + gap), behavior: still ? "instant" : "smooth" });
  };

  return (
    <div className="picker-body">
      <div
        ref={track}
        className="picker-track"
        role="radiogroup"
        aria-labelledby="lobby-sheet-title"
        onScroll={onScroll}
      >
        {games.map((g) => (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={g.id === value}
            aria-label={g.name}
            aria-describedby={`picker-desc-${g.id}`}
            className="picker-card"
            style={wash(g)}
            onClick={() => onPick(g.id)}
          >
            <span className="picker-art">
              <img src={g.art} alt="" />
            </span>
            <span className="picker-name">{g.name}</span>
            <span className="picker-desc" id={`picker-desc-${g.id}`}>
              {g.description}
            </span>
            <span className="picker-meta">
              <Icon name="users" size={15} />
              {g.players}
            </span>
            {g.id === value && (
              <span className="picker-current">
                <Icon name="check" size={14} />
                Playing Now
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Nothing to step through when every game is already in view. */}
      <div className="picker-nav" hidden={at.start && at.end}>
        <button
          className="icon-btn"
          aria-label="Previous games"
          disabled={at.start}
          onClick={() => step(-1)}
        >
          <Icon name="chevronLeft" size={22} />
        </button>
        <span className="picker-dots" aria-hidden="true">
          {games.map((g, i) => (
            <span key={g.id} className={i === at.dot ? "on" : undefined} />
          ))}
        </span>
        <button
          className="icon-btn"
          aria-label="More games"
          disabled={at.end}
          onClick={() => step(1)}
        >
          <Icon name="chevronRight" size={22} />
        </button>
      </div>
    </div>
  );
}

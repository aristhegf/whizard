import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CirclePlus,
  Copy,
  Crown,
  Delete,
  DoorClosed,
  Ellipsis,
  Flag,
  Flame,
  Gamepad2,
  Gift,
  Globe,
  Heart,
  House,
  Info,
  Layers,
  Lock,
  Lightbulb,
  Link,
  Link2,
  LogOut,
  Menu,
  MessageCircleMore,
  Monitor,
  Pencil,
  Play,
  Plus,
  Puzzle,
  Repeat,
  Search,
  Send,
  Settings,
  Share,
  Share2,
  Shield,
  SkipForward,
  Smartphone,
  Star,
  Timer,
  Trophy,
  User,
  UserPlus,
  Users,
  Upload,
  Volume2,
  VolumeX,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Whizard's icons, under the names the app uses. They're all Lucide's, the same family the BeUI
 * components draw theirs from, so every icon on the site has the one look.
 */
const ICONS = {
  home: House,
  games: Gamepad2,
  users: Users,
  user: User,
  trophy: Trophy,
  settings: Settings,
  search: Search,
  bell: Bell,
  arrowRight: ArrowRight,
  arrowLeft: ArrowLeft,
  skip: SkipForward,
  backspace: Delete,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  chevronDown: ChevronDown,
  share: Share2,
  // The box with an arrow out of it, as phones draw their share button.
  shareOut: Share,
  copy: Copy,
  play: Play,
  logout: LogOut,
  phone: Smartphone,
  clock: Timer,
  plus: Plus,
  plusCircle: CirclePlus,
  menu: Menu,
  close: X,
  invite: UserPlus,
  device: Monitor,
  link: Link,
  heart: Heart,
  gift: Gift,
  crown: Crown,
  check: Check,
  pencil: Pencil,
  bolt: Zap,
  bulb: Lightbulb,
  chart: ChartColumn,
  help: CircleHelp,
  flag: Flag,
  shield: Shield,
  wallet: Wallet,
  userPlus: UserPlus,
  checkCircle: CircleCheck,
  repeat: Repeat,
  calendar: Calendar,
  info: Info,
  alert: CircleAlert,
  chat: MessageCircleMore,
  send: Send,
  upload: Upload,
  more: Ellipsis,
  link2: Link2,
  sound: Volume2,
  muted: VolumeX,
  door: DoorClosed,
  globe: Globe,
  flame: Flame,
  layers: Layers,
  puzzle: Puzzle,
  star: Star,
  lock: Lock,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  stroke = 2,
  fill = false,
  className,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  /** Filled instead of outlined, for solid shapes like play or star. */
  fill?: boolean;
  className?: string;
}) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      className={className}
      size={size}
      strokeWidth={stroke}
      fill={fill ? "currentColor" : "none"}
      aria-hidden="true"
      focusable="false"
    />
  );
}

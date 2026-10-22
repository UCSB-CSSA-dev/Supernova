import type { Choice, RankedChoice } from "@/lib/ranking";

export type PublicResults = {
  totalVotes: number;
  ranked: RankedChoice[];
  updatedAt: string;
  voting?: TimeWindow;
};

export type WindowName = "checkin" | "voting";

export type WindowPhase = "unscheduled" | "scheduled" | "open" | "closed";

export type TimeWindow = {
  opensAt: string | null;
  closesAt: string | null;
  phase: WindowPhase;
};

export type UserSession = {
  token: string;
  email: string;
  name: string;
  expiresAt: number;
};

export type Me = {
  email: string;
  name: string;
  registered: boolean;
  registeredAt: string | null;
  checkin: TimeWindow;
  voting: TimeWindow;
};

export type RegisterResult =
  | { status: "registered"; registeredAt: string; already: boolean; voting: TimeWindow }
  | { status: "closed"; window: TimeWindow };

export type NotOpen = {
  status: "notOpen";
  window: TimeWindow;
  serverTime: number;
  // Sent once voting is scheduled so the phone can open the ballot by itself at opensAt.
  candidates: Choice[] | null;
};

export type VoteState =
  | { status: "unregistered" }
  | NotOpen
  | { status: "used"; singerName: string; songName: string }
  | { status: "open"; candidates: Choice[] };

export type VoteResult =
  | { status: "voted"; singerName: string; songName: string }
  | { status: "used"; singerName: string; songName: string }
  | { status: "unregistered" }
  | NotOpen
  | { status: "unknownChoice" };

export type CheckinStatus = {
  window: TimeWindow;
  registeredCount: number;
};

export type LotteryDraw = {
  round: number;
  drawnAt: string;
  email: string;
  name: string;
};

export type LotteryState = {
  draws: LotteryDraw[];
  registered: number;
  eligible: number;
  names: string[];
  winner?: LotteryDraw;
};

export type OrderSlot = {
  number: number;
  name: string;
};

export type OrderState = {
  size: number;
  mine: (OrderSlot & { claimedAt: string }) | null;
  lineup: OrderSlot[];
  remaining: number;
};

export type OrderEntry = OrderSlot & {
  email: string;
  claimedAt: string;
};

export type OrderAdminState = {
  size: number;
  entries: OrderEntry[];
  remaining: number;
};

export type OrderClaim = OrderState & {
  status: "claimed" | "already" | "full";
};

export type SheetStatus = {
  label: string;
  url: string;
  rows: number | null;
  error: string | null;
};

export type Registration = {
  registeredAt: string;
  email: string;
  name: string;
};

export type AdminList = {
  owner: string;
  trusted: string[];
};

export type AdminStatus = {
  viewer: string;
  isOwner: boolean;
  admins: AdminList;
  accountEmail: string;
  problems: string[];
  sheets: {
    registrations: SheetStatus;
    singers: SheetStatus;
    results: SheetStatus;
    variables: SheetStatus;
  } | null;
  registeredCount: number;
  singerCount: number;
  voteCount: number;
  drawCount: number;
  recentRegistrations: Registration[];
  checkin: TimeWindow;
  voting: TimeWindow;
};

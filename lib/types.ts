import type { Choice, RankedChoice } from "@/lib/ranking";

export type PublicResults = {
  totalVotes: number;
  ranked: RankedChoice[];
  updatedAt: string;
};

export type VoteState =
  | { status: "invalid" }
  | { status: "used"; singerName: string; songName: string }
  | { status: "open"; candidates: Choice[] };

export type SheetStatus = {
  label: string;
  url: string;
  rows: number | null;
  error: string | null;
};

export type AdminStatus = {
  accountEmail: string;
  appUrl: string | null;
  gmailUser: string | null;
  problems: string[];
  sheets: {
    audience: SheetStatus;
    singers: SheetStatus;
    results: SheetStatus;
  } | null;
  audienceCount: number;
  singerCount: number;
  voteCount: number;
  codesMissing: number;
  unsent: number;
  invalidEmails: { row: number; name: string; email: string }[];
  reachable: number;
  resend: { since: string; remaining: number } | null;
  preview: { name: string; link: string; vcode: string } | null;
};

export type SendMode = "unsent" | "all";

export type SendFailure = {
  row: number;
  email: string;
  error: string;
};

export type SendBatchResult = {
  sent: number;
  failed: SendFailure[];
  remaining: number;
  halt: string | null;
};

"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchResults } from "@/lib/backend";
import { splitRanking, type RankedChoice } from "@/lib/ranking";

type ResultsPayload = {
  totalVotes: number;
  ranked: RankedChoice[];
  updatedAt: string;
};

export function ResultsBoard() {
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const body = await fetchResults();
        if (!active) return;
        if (!Array.isArray(body.ranked)) {
          setError("The results could not be loaded.");
          return;
        }
        setResults(body);
        setReceivedAt(Date.now());
        setError(null);
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : "The results could not be loaded.");
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const ranked = results?.ranked ?? [];
  const { featured, rest } = splitRanking(ranked);
  const leaderVotes = featured[0]?.votes ?? 0;

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(circle_at_top,oklch(0.28_0.06_285),transparent_42%)] px-[4vw] py-[3vh]">
      <header className="flex items-end justify-between gap-6 pb-[2vh]">
        <div>
          <p className="text-sm tracking-[0.35em] text-primary uppercase">Live</p>
          <h1 className="font-heading text-[clamp(2.5rem,5vw,5rem)] leading-none">Supernova</h1>
        </div>
        <div className="text-right">
          <p className="font-heading text-[clamp(2rem,4vw,4.5rem)] leading-none tabular-nums">
            {results?.totalVotes ?? "–"}
          </p>
          <p className="text-sm tracking-wide text-muted-foreground uppercase">
            {error && results ? "Reconnecting" : "Votes"}
          </p>
        </div>
      </header>

      {!results && !error ? (
        <p className="text-muted-foreground">Loading the board…</p>
      ) : null}

      {!results && error ? (
        <p className="max-w-xl text-lg text-destructive">{error}</p>
      ) : null}

      {results && ranked.length === 0 ? (
        <p className="text-xl text-muted-foreground">
          Add performers to the singer spreadsheet to start the board.
        </p>
      ) : null}

      {featured.length > 0 ? (
        <section
          className="grid min-h-0 flex-1 gap-[1.2vh]"
          style={{ gridTemplateRows: `repeat(${featured.length}, minmax(0, 1fr))` }}
        >
          {featured.map((choice) => {
            const width = leaderVotes === 0 ? 0 : Math.max(4, Math.round((choice.votes / leaderVotes) * 100));
            return (
              <article key={`${choice.singerName}-${choice.songName}`} className="grid min-h-0 grid-cols-[auto_1fr_auto] items-center gap-[2vw] border-b border-white/10">
                <p className="font-heading w-[2ch] text-[clamp(1.8rem,4vh,3.5rem)] text-primary tabular-nums">
                  {choice.place}
                </p>
                <div className="min-w-0">
                  <h2 className="truncate font-heading text-[clamp(1.4rem,3.6vh,3rem)] leading-tight">
                    {choice.singerName}
                  </h2>
                  <p className="truncate text-[clamp(0.9rem,2vh,1.4rem)] text-muted-foreground">
                    {choice.songName}
                  </p>
                  <div className="mt-[0.6vh] h-[0.7vh] overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </div>
                <p className="font-heading text-[clamp(2rem,5vh,4.5rem)] leading-none tabular-nums">
                  {choice.votes}
                </p>
              </article>
            );
          })}
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="mt-[1.5vh] max-h-[28vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Place</TableHead>
                <TableHead>Singer</TableHead>
                <TableHead>Song</TableHead>
                <TableHead className="text-right">Votes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rest.map((choice) => (
                <TableRow key={`${choice.singerName}-${choice.songName}`}>
                  <TableCell className="font-heading text-primary tabular-nums">{choice.place}</TableCell>
                  <TableCell className="font-medium">{choice.singerName}</TableCell>
                  <TableCell className="text-muted-foreground">{choice.songName}</TableCell>
                  <TableCell className="text-right font-heading text-lg tabular-nums">{choice.votes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <p className="sr-only">
        {receivedAt ? `Updated ${new Date(receivedAt).toLocaleTimeString()}` : "Waiting for results"}
      </p>
    </main>
  );
}

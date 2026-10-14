import assert from "node:assert/strict";
import test from "node:test";
import {
  duplicateBallotRows,
  rankCandidates,
  splitRanking,
  winningBallots,
} from "./ranking.ts";

test("ranks by votes, then singer name", () => {
  const ranked = rankCandidates(
    [
      { singerName: "Nova", songName: "Night" },
      { singerName: "Aria", songName: "Gold" },
      { singerName: "Bea", songName: "Dawn" },
    ],
    [
      { singerName: "Nova", songName: "Night" },
      { singerName: "Aria", songName: "Gold" },
      { singerName: "Aria", songName: "Gold" },
    ],
  );

  assert.deepEqual(
    ranked.map((choice) => [choice.place, choice.singerName, choice.votes]),
    [
      [1, "Aria", 2],
      [2, "Nova", 1],
      [3, "Bea", 0],
    ],
  );
});

test("splits the top half onto the featured board", () => {
  const { featured, rest } = splitRanking([1, 2, 3, 4, 5]);
  assert.deepEqual(featured, [1, 2, 3]);
  assert.deepEqual(rest, [4, 5]);
});

test("keeps the earliest ballot when a code is duplicated", () => {
  const ballots = [
    { verificationCode: "a", votedAt: "2026-10-13T02:00:00.000Z", rowNumber: 3, singerName: "Late" },
    { verificationCode: "a", votedAt: "2026-10-13T01:00:00.000Z", rowNumber: 2, singerName: "Early" },
    { verificationCode: "b", votedAt: "2026-10-13T01:00:00.000Z", rowNumber: 4, singerName: "Only" },
  ];

  assert.deepEqual(
    winningBallots(ballots).map((ballot) => ballot.singerName),
    ["Early", "Only"],
  );
  assert.deepEqual(duplicateBallotRows(ballots), [3]);
});

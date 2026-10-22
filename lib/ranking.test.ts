import assert from "node:assert/strict";
import test from "node:test";
import {
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

test("tied candidates share a place and the next place is skipped", () => {
  const ranked = rankCandidates(
    [
      { singerName: "Nova", songName: "Night" },
      { singerName: "Aria", songName: "Gold" },
      { singerName: "Bea", songName: "Dawn" },
      { singerName: "Cy", songName: "Rain" },
    ],
    [
      { singerName: "Nova", songName: "Night" },
      { singerName: "Aria", songName: "Gold" },
      { singerName: "Bea", songName: "Dawn" },
    ],
  );

  assert.deepEqual(
    ranked.map((choice) => [choice.place, choice.singerName]),
    [
      [1, "Aria"],
      [1, "Bea"],
      [1, "Nova"],
      [4, "Cy"],
    ],
  );
});

test("splits the top half onto the featured board", () => {
  const { featured, rest } = splitRanking([1, 2, 3, 4, 5]);
  assert.deepEqual(featured, [1, 2, 3]);
  assert.deepEqual(rest, [4, 5]);
});

test("keeps the first ballot from each email", () => {
  const ballots = [
    { email: "a@ucsb.edu", rowNumber: 3, singerName: "Late" },
    { email: "A@ucsb.edu", rowNumber: 2, singerName: "Early" },
    { email: "b@ucsb.edu", rowNumber: 4, singerName: "Only" },
    { email: "", rowNumber: 5, singerName: "Blank" },
  ];

  assert.deepEqual(
    winningBallots(ballots).map((ballot) => ballot.singerName),
    ["Early", "Only"],
  );
});

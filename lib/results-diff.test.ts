import assert from "node:assert/strict";
import test from "node:test";
import { diffRankings } from "./results-diff.ts";
import { choiceKey, type RankedChoice } from "./ranking.ts";

function board(entries: [string, number][]): RankedChoice[] {
  return entries.map(([singerName, votes], index) => ({ singerName, songName: "Song", votes, place: index + 1 }));
}

const key = (name: string) => choiceKey({ singerName: name, songName: "Song" });

test("reports climbers, the bars they passed, and vote gains", () => {
  const prev = board([["Ava", 5], ["Ben", 4], ["Cy", 3]]);
  const next = board([["Cy", 6], ["Ava", 5], ["Ben", 4]]);
  const events = diffRankings(prev, next, 5);
  assert.deepEqual(events.climbed, [key("Cy")]);
  assert.deepEqual(events.moved.sort(), [key("Ava"), key("Ben"), key("Cy")].sort());
  assert.deepEqual(events.gains, [{ key: key("Cy"), amount: 3 }]);
  assert.equal(events.newLeader, key("Cy"));
});

test("ignores reordering that stays below the featured bars", () => {
  const prev = board([["A", 9], ["B", 8], ["C", 2], ["D", 1]]);
  const next = board([["A", 9], ["B", 8], ["D", 3], ["C", 2]]);
  const events = diffRankings(prev, next, 2);
  assert.deepEqual(events.moved, []);
  assert.deepEqual(events.climbed, []);
  assert.equal(events.newLeader, null);
});

test("does not announce a leader before anyone has votes", () => {
  const prev = board([["A", 0], ["B", 0]]);
  const next = board([["B", 0], ["A", 0]]);
  assert.equal(diffRankings(prev, next, 5).newLeader, null);
});

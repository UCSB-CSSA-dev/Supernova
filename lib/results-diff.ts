import { choiceKey, type RankedChoice } from "./ranking.ts";

export type BoardEvents = {
  moved: string[];
  climbed: string[];
  gains: { key: string; amount: number }[];
  newLeader: string | null;
};

export function diffRankings(prev: RankedChoice[], next: RankedChoice[], featuredCount: number): BoardEvents {
  const before = new Map(prev.map((choice) => [choiceKey(choice), choice]));
  const moved: string[] = [];
  const climbed: string[] = [];
  const gains: { key: string; amount: number }[] = [];

  for (const choice of next) {
    const key = choiceKey(choice);
    const old = before.get(key);
    if (!old) continue;
    if (choice.votes > old.votes) gains.push({ key, amount: choice.votes - old.votes });
    if (choice.place !== old.place && Math.min(choice.place, old.place) <= featuredCount) {
      moved.push(key);
      if (choice.place < old.place && choice.place <= featuredCount) climbed.push(key);
    }
  }

  const oldLeader = prev[0] ? choiceKey(prev[0]) : null;
  const leader = next[0];
  const newLeader = leader && leader.votes > 0 && choiceKey(leader) !== oldLeader ? choiceKey(leader) : null;

  return { moved, climbed, gains, newLeader };
}

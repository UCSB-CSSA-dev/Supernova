export type Choice = {
  singerName: string;
  songName: string;
};

export type RankedChoice = Choice & {
  votes: number;
  place: number;
};

export type BallotIdentity = {
  email: string;
  rowNumber: number;
};

export function choiceKey(choice: Choice): string {
  return `${choice.singerName}\n${choice.songName}`;
}

export function rankCandidates(singers: Choice[], ballots: Choice[]): RankedChoice[] {
  const counts = new Map<string, number>();
  for (const singer of singers) counts.set(choiceKey(singer), 0);
  for (const ballot of ballots) {
    const key = choiceKey(ballot);
    if (!counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const ranked = singers.map((singer) => ({
    ...singer,
    votes: counts.get(choiceKey(singer)) ?? 0,
  }));

  ranked.sort(
    (left, right) =>
      right.votes - left.votes ||
      left.singerName.localeCompare(right.singerName) ||
      left.songName.localeCompare(right.songName),
  );

  return sharePlaces(ranked);
}

// Expects choices sorted by votes, highest first. Ties share a place: 1, 1, 3.
export function sharePlaces<T extends { votes: number }>(sorted: T[]): (T & { place: number })[] {
  let place = 0;
  return sorted.map((choice, index) => {
    if (index === 0 || choice.votes !== sorted[index - 1].votes) place = index + 1;
    return { ...choice, place };
  });
}

export function splitRanking<T>(ranked: T[]): { featured: T[]; rest: T[] } {
  const cutoff = Math.ceil(ranked.length / 2);
  return {
    featured: ranked.slice(0, cutoff),
    rest: ranked.slice(cutoff),
  };
}

// Mirrors readBallots_ in Code.gs: the first row from each email is the vote that counts.
export function winningBallots<T extends BallotIdentity>(ballots: T[]): T[] {
  const winners = new Map<string, T>();
  for (const ballot of ballots) {
    const email = ballot.email.trim().toLowerCase();
    if (!email) continue;
    const current = winners.get(email);
    if (!current || ballot.rowNumber < current.rowNumber) winners.set(email, ballot);
  }
  return [...winners.values()].sort((left, right) => left.rowNumber - right.rowNumber);
}

export type Choice = {
  singerName: string;
  songName: string;
};

export type RankedChoice = Choice & {
  votes: number;
  place: number;
};

export type BallotIdentity = {
  verificationCode: string;
  votedAt: string;
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

  return ranked.map((choice, index) => ({ ...choice, place: index + 1 }));
}

export function splitRanking<T>(ranked: T[]): { featured: T[]; rest: T[] } {
  const cutoff = Math.ceil(ranked.length / 2);
  return {
    featured: ranked.slice(0, cutoff),
    rest: ranked.slice(cutoff),
  };
}

function isEarlierBallot(candidate: BallotIdentity, current: BallotIdentity): boolean {
  if (candidate.votedAt !== current.votedAt) return candidate.votedAt < current.votedAt;
  return candidate.rowNumber < current.rowNumber;
}

export function winningBallots<T extends BallotIdentity>(ballots: T[]): T[] {
  const winners = new Map<string, T>();
  for (const ballot of ballots) {
    if (!ballot.verificationCode) continue;
    const current = winners.get(ballot.verificationCode);
    if (!current || isEarlierBallot(ballot, current)) winners.set(ballot.verificationCode, ballot);
  }
  return [...winners.values()];
}

export function duplicateBallotRows<T extends BallotIdentity>(ballots: T[]): number[] {
  const winnerRows = new Map(
    winningBallots(ballots).map((ballot) => [ballot.verificationCode, ballot.rowNumber]),
  );
  return ballots
    .filter((ballot) => {
      const winner = winnerRows.get(ballot.verificationCode);
      return winner !== undefined && winner !== ballot.rowNumber;
    })
    .map((ballot) => ballot.rowNumber);
}

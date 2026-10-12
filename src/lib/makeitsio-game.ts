export type MemeVoteValue = -1 | 0 | 1;

export type ScoredSubmission = {
  id: string;
  authorId: string;
  votes: { voterId: string; value: MemeVoteValue; buddy: boolean }[];
};

export type MemeScore = {
  submissionId: string;
  authorId: string;
  base: number;
  buddyBonus: number;
  total: number;
};

/** A unanimous upvote is worth 1000 points, a meh zero and downvotes reduce it proportionally. */
export function scoreMemeRound(submissions: ScoredSubmission[]): {
  memes: MemeScore[];
  buddyRewards: Map<string, number>;
} {
  const memes = submissions.map((submission) => {
    const divisor = Math.max(1, submission.votes.length);
    const base = Math.round(
      submission.votes.reduce((sum, vote) => sum + vote.value, 0) *
        (1000 / divisor),
    );
    const buddyBonus =
      submission.votes.filter((vote) => vote.buddy).length * 10;
    return {
      submissionId: submission.id,
      authorId: submission.authorId,
      base,
      buddyBonus,
      total: base + buddyBonus,
    };
  });
  const scoreBySubmission = new Map(
    memes.map((meme) => [meme.submissionId, meme.total]),
  );
  const buddyRewards = new Map<string, number>();
  for (const submission of submissions)
    for (const vote of submission.votes) {
      if (!vote.buddy) continue;
      buddyRewards.set(
        vote.voterId,
        (buddyRewards.get(vote.voterId) ?? 0) +
          Math.round((scoreBySubmission.get(submission.id) ?? 0) / 2),
      );
    }
  return { memes, buddyRewards };
}

export function normalizeLobbyCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function assignTemplatePaths(
  paths: string[],
  playerCount: number,
  sameMeme: boolean,
) {
  if (!paths.length) throw new Error("Aucun modèle disponible.");
  return Array.from({ length: playerCount }, (_, index) =>
    sameMeme ? paths[0] : paths[index % paths.length],
  );
}

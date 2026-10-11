export type UndercoverRole = "CIVIL" | "UNDERCOVER" | "MISTER_WHITE";
export type UndercoverWinner = "CIVILS" | "UNDERCOVERS" | "MISTER_WHITE";

export function buildRoleDeck(playerCount: number, undercoverCount: number, misterWhite: boolean): UndercoverRole[] {
  const hostileCount = undercoverCount + (misterWhite ? 1 : 0);
  if (playerCount < 3 || undercoverCount < 1 || hostileCount >= playerCount) throw new Error("Composition de partie invalide.");
  return [
    ...Array.from({ length: playerCount - hostileCount }, () => "CIVIL" as const),
    ...Array.from({ length: undercoverCount }, () => "UNDERCOVER" as const),
    ...(misterWhite ? ["MISTER_WHITE" as const] : []),
  ];
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function determineWinner(players: { role: UndercoverRole; eliminated: boolean }[]): UndercoverWinner | null {
  const active = players.filter((player) => !player.eliminated);
  const civilians = active.filter((player) => player.role === "CIVIL").length;
  const undercovers = active.filter((player) => player.role === "UNDERCOVER").length;
  const misterWhite = active.some((player) => player.role === "MISTER_WHITE");
  if (undercovers === 0 && !misterWhite) return "CIVILS";
  if (undercovers > 0 && undercovers >= civilians) return "UNDERCOVERS";
  return null;
}

export function normalizeGuess(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim();
}

export function isCorrectWhiteGuess(expectedWord: string, submittedGuess: string): boolean {
  const expected = normalizeGuess(expectedWord);
  const submitted = normalizeGuess(submittedGuess);
  if (!expected || !submitted) return false;
  return submitted === expected || ` ${submitted} `.includes(` ${expected} `);
}

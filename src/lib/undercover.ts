import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { SessionUser } from "./auth";
import { buildRoleDeck, determineWinner, normalizeGuess, shuffle, type UndercoverRole, type UndercoverWinner } from "./undercover-game";
import { defaultUndercoverPairs } from "./undercover-words";

export type WordMode = "NORMAL" | "SIO";
export type LobbyPhase = "LOBBY" | "CLUE" | "VOTE" | "WHITE_GUESS" | "FINISHED";
export type UndercoverWordPair = { id: string; mode: WordMode; civil: string; undercover: string; enabled: boolean; createdAt: string };
export type UndercoverClue = { id: string; round: number; text: string; createdAt: string };
export type UndercoverMember = {
  id: string;
  name: string;
  avatar: string | null;
  isHost: boolean;
  eliminated: boolean;
  online: boolean;
  revealedRole: UndercoverRole | null;
  clues: UndercoverClue[];
};
export type UndercoverLobbyState = {
  code: string;
  phase: LobbyPhase;
  wordMode: WordMode;
  undercoverCount: number;
  misterWhite: boolean;
  round: number;
  winner: UndercoverWinner | null;
  lastEvent: string;
  currentTurnMemberId: string | null;
  members: UndercoverMember[];
  viewer: { memberId: string; isHost: boolean; secretWord: string | null; misterWhite: boolean; eliminated: boolean; hasClued: boolean; hasVoted: boolean };
  votesCast: number;
  votesRequired: number;
};

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000, max: 8 }) : null;
pool?.on("error", () => {});
let schemaReady: Promise<void> | null = null;

function database() {
  if (!pool) throw new Error("PostgreSQL n’est pas configuré.");
  return pool;
}

export async function ensureUndercoverSchema() {
  schemaReady ??= (async () => {
    const client = await database().connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sio_undercover_words (
          id uuid PRIMARY KEY,
          mode text NOT NULL CHECK (mode IN ('NORMAL','SIO')),
          civil_word text NOT NULL,
          undercover_word text NOT NULL,
          enabled boolean NOT NULL DEFAULT true,
          created_by uuid REFERENCES sio_users(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(mode, civil_word, undercover_word)
        );
        CREATE INDEX IF NOT EXISTS sio_undercover_words_mode_idx ON sio_undercover_words(mode,enabled);
        CREATE TABLE IF NOT EXISTS sio_undercover_lobbies (
          id uuid PRIMARY KEY,
          code text NOT NULL UNIQUE,
          host_user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
          phase text NOT NULL DEFAULT 'LOBBY' CHECK (phase IN ('LOBBY','CLUE','VOTE','WHITE_GUESS','FINISHED')),
          word_mode text NOT NULL DEFAULT 'NORMAL' CHECK (word_mode IN ('NORMAL','SIO')),
          undercover_count integer NOT NULL DEFAULT 1 CHECK (undercover_count BETWEEN 1 AND 8),
          mister_white boolean NOT NULL DEFAULT true,
          round integer NOT NULL DEFAULT 0,
          current_turn_member uuid,
          winner text CHECK (winner IN ('CIVILS','UNDERCOVERS','MISTER_WHITE')),
          selected_word_id uuid REFERENCES sio_undercover_words(id) ON DELETE SET NULL,
          last_event text NOT NULL DEFAULT 'Le salon est ouvert.',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS sio_undercover_members (
          id uuid PRIMARY KEY,
          lobby_id uuid NOT NULL REFERENCES sio_undercover_lobbies(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
          display_name text NOT NULL,
          avatar_data text,
          role text CHECK (role IN ('CIVIL','UNDERCOVER','MISTER_WHITE')),
          secret_word text,
          eliminated boolean NOT NULL DEFAULT false,
          turn_order integer NOT NULL DEFAULT 0,
          last_seen timestamptz NOT NULL DEFAULT now(),
          joined_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(lobby_id,user_id)
        );
        CREATE INDEX IF NOT EXISTS sio_undercover_members_lobby_idx ON sio_undercover_members(lobby_id,turn_order);
        CREATE TABLE IF NOT EXISTS sio_undercover_clues (
          id uuid PRIMARY KEY,
          lobby_id uuid NOT NULL REFERENCES sio_undercover_lobbies(id) ON DELETE CASCADE,
          member_id uuid NOT NULL REFERENCES sio_undercover_members(id) ON DELETE CASCADE,
          round integer NOT NULL,
          clue text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE(lobby_id,member_id,round)
        );
        CREATE TABLE IF NOT EXISTS sio_undercover_votes (
          lobby_id uuid NOT NULL REFERENCES sio_undercover_lobbies(id) ON DELETE CASCADE,
          voter_id uuid NOT NULL REFERENCES sio_undercover_members(id) ON DELETE CASCADE,
          target_id uuid NOT NULL REFERENCES sio_undercover_members(id) ON DELETE CASCADE,
          round integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY(lobby_id,voter_id,round)
        );
      `);
      const count = Number((await client.query("SELECT count(*) AS total FROM sio_undercover_words WHERE mode='NORMAL'")).rows[0].total);
      if (count === 0) {
        const seeds = defaultUndercoverPairs.map((pair) => ({ id: randomUUID(), civil: pair.civil, undercover: pair.undercover }));
        await client.query(`INSERT INTO sio_undercover_words(id,mode,civil_word,undercover_word)
          SELECT item.id::uuid,'NORMAL',item.civil,item.undercover FROM jsonb_to_recordset($1::jsonb) AS item(id text,civil text,undercover text)
          ON CONFLICT DO NOTHING`, [JSON.stringify(seeds)]);
      }
    } finally { client.release(); }
  })().catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try { await client.query("BEGIN"); const result = await callback(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

function cleanName(value: string, fallback: string) {
  const name = value.trim().replace(/\s+/g, " ").slice(0, 28);
  return name.length >= 2 ? name : fallback;
}

function cleanAvatar(value?: string | null): string | null {
  if (!value) return null;
  if (value.length > 450_000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error("La photo de profil est trop lourde ou invalide.");
  return value;
}

function normalizeCode(value: string) { return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }

async function generateCode(client: PoolClient) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(6, "X");
    if (!(await client.query("SELECT 1 FROM sio_undercover_lobbies WHERE code=$1", [code])).rowCount) return code;
  }
  throw new Error("Impossible de générer un code de salon.");
}

async function cleanupLobby(client: PoolClient, lobbyId: string) {
  const lobby = (await client.query("SELECT phase,host_user_id FROM sio_undercover_lobbies WHERE id=$1", [lobbyId])).rows[0];
  if (!lobby || lobby.phase !== "LOBBY") return;
  await client.query("DELETE FROM sio_undercover_members WHERE lobby_id=$1 AND last_seen < now() - interval '25 seconds'", [lobbyId]);
  const members = await client.query("SELECT user_id FROM sio_undercover_members WHERE lobby_id=$1 ORDER BY joined_at", [lobbyId]);
  if (!members.rowCount) { await client.query("DELETE FROM sio_undercover_lobbies WHERE id=$1", [lobbyId]); return; }
  if (!members.rows.some((member) => member.user_id === lobby.host_user_id)) {
    await client.query("UPDATE sio_undercover_lobbies SET host_user_id=$2,last_event='Le maître de salle a changé.' WHERE id=$1", [lobbyId, members.rows[0].user_id]);
  }
}

export async function createUndercoverLobby(user: SessionUser, input: { name: string; avatar?: string | null }): Promise<UndercoverLobbyState> {
  await ensureUndercoverSchema();
  const code = await transaction(async (client) => {
    const lobbyId = randomUUID();
    const code = await generateCode(client);
    await client.query("INSERT INTO sio_undercover_lobbies(id,code,host_user_id) VALUES($1,$2,$3)", [lobbyId, code, user.id]);
    await client.query("INSERT INTO sio_undercover_members(id,lobby_id,user_id,display_name,avatar_data) VALUES($1,$2,$3,$4,$5)", [randomUUID(), lobbyId, user.id, cleanName(input.name, user.username), cleanAvatar(input.avatar)]);
    return code;
  });
  return (await getUndercoverLobby(code, user.id))!;
}

export async function joinUndercoverLobby(user: SessionUser, input: { code: string; name: string; avatar?: string | null }): Promise<UndercoverLobbyState> {
  await ensureUndercoverSchema();
  const code = normalizeCode(input.code);
  await transaction(async (client) => {
    let lobby = (await client.query("SELECT id,phase FROM sio_undercover_lobbies WHERE code=$1 FOR UPDATE", [code])).rows[0];
    if (!lobby) throw new Error("Salon introuvable.");
    await cleanupLobby(client, lobby.id);
    lobby = (await client.query("SELECT id,phase FROM sio_undercover_lobbies WHERE id=$1", [lobby.id])).rows[0];
    if (!lobby) throw new Error("Ce salon a expiré.");
    if (lobby.phase !== "LOBBY") throw new Error("Cette partie a déjà commencé.");
    const total = Number((await client.query("SELECT count(*) AS total FROM sio_undercover_members WHERE lobby_id=$1", [lobby.id])).rows[0].total);
    if (total >= 16) throw new Error("Ce salon est complet.");
    await client.query(`INSERT INTO sio_undercover_members(id,lobby_id,user_id,display_name,avatar_data,last_seen)
      VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(lobby_id,user_id) DO UPDATE SET display_name=excluded.display_name,avatar_data=excluded.avatar_data,last_seen=now()`,
    [randomUUID(), lobby.id, user.id, cleanName(input.name, user.username), cleanAvatar(input.avatar)]);
    await client.query("UPDATE sio_undercover_lobbies SET last_event=$2,updated_at=now() WHERE id=$1", [lobby.id, `${cleanName(input.name, user.username)} a rejoint le salon.`]);
  });
  return (await getUndercoverLobby(code, user.id))!;
}

export async function updateUndercoverProfile(user: SessionUser, codeValue: string, input: { name: string; avatar?: string | null }) {
  await ensureUndercoverSchema();
  const code = normalizeCode(codeValue);
  const result = await database().query(`UPDATE sio_undercover_members m SET display_name=$3,avatar_data=$4,last_seen=now()
    FROM sio_undercover_lobbies l WHERE m.lobby_id=l.id AND l.code=$1 AND m.user_id=$2 AND l.phase='LOBBY' RETURNING m.id`,
  [code, user.id, cleanName(input.name, user.username), cleanAvatar(input.avatar)]);
  if (!result.rowCount) throw new Error("Le profil ne peut plus être modifié.");
  return getUndercoverLobby(code, user.id);
}

export async function updateUndercoverSettings(userId: string, codeValue: string, input: { wordMode: WordMode; undercoverCount: number; misterWhite: boolean }) {
  await ensureUndercoverSchema();
  const code = normalizeCode(codeValue);
  const available = Number((await database().query("SELECT count(*) AS total FROM sio_undercover_words WHERE mode=$1 AND enabled", [input.wordMode])).rows[0].total);
  if (!available) throw new Error(input.wordMode === "SIO" ? "Ajoute d’abord des paires dans le dictionnaire SIO." : "Aucune paire disponible.");
  const result = await database().query(`UPDATE sio_undercover_lobbies SET word_mode=$3,undercover_count=$4,mister_white=$5,updated_at=now()
    WHERE code=$1 AND host_user_id=$2 AND phase='LOBBY' RETURNING id`, [code, userId, input.wordMode, input.undercoverCount, input.misterWhite]);
  if (!result.rowCount) throw new Error("Seul le maître de salle peut modifier la partie.");
  return getUndercoverLobby(code, userId);
}

export async function startUndercoverGame(userId: string, codeValue: string) {
  await ensureUndercoverSchema();
  const code = normalizeCode(codeValue);
  await transaction(async (client) => {
    const lobby = (await client.query("SELECT * FROM sio_undercover_lobbies WHERE code=$1 FOR UPDATE", [code])).rows[0];
    if (!lobby || lobby.host_user_id !== userId || lobby.phase !== "LOBBY") throw new Error("Impossible de lancer cette partie.");
    await cleanupLobby(client, lobby.id);
    const members = (await client.query("SELECT id FROM sio_undercover_members WHERE lobby_id=$1 ORDER BY joined_at", [lobby.id])).rows;
    if (members.length < 3) throw new Error("Il faut au moins 3 joueurs.");
    const roles = shuffle(buildRoleDeck(members.length, lobby.undercover_count, lobby.mister_white));
    if (members.length - lobby.undercover_count - (lobby.mister_white ? 1 : 0) < 2) throw new Error("Il faut au moins deux Civils dans cette configuration.");
    const word = (await client.query("SELECT id,civil_word,undercover_word FROM sio_undercover_words WHERE mode=$1 AND enabled ORDER BY random() LIMIT 1", [lobby.word_mode])).rows[0];
    if (!word) throw new Error("Aucune paire de mots disponible dans ce mode.");
    const order = shuffle(members);
    for (let index = 0; index < order.length; index += 1) {
      const role = roles[index];
      await client.query("UPDATE sio_undercover_members SET role=$2,secret_word=$3,eliminated=false,turn_order=$4,last_seen=now() WHERE id=$1", [order[index].id, role, role === "CIVIL" ? word.civil_word : role === "UNDERCOVER" ? word.undercover_word : null, index]);
    }
    await client.query("DELETE FROM sio_undercover_clues WHERE lobby_id=$1", [lobby.id]);
    await client.query("DELETE FROM sio_undercover_votes WHERE lobby_id=$1", [lobby.id]);
    await client.query(`UPDATE sio_undercover_lobbies SET phase='CLUE',round=1,current_turn_member=$2,winner=NULL,selected_word_id=$3,last_event='La partie commence. À vous de brouiller les pistes !',updated_at=now() WHERE id=$1`, [lobby.id, order[0].id, word.id]);
  });
  return getUndercoverLobby(code, userId);
}

async function lobbyAndMemberForUpdate(client: PoolClient, code: string, userId: string) {
  const lobby = (await client.query("SELECT * FROM sio_undercover_lobbies WHERE code=$1 FOR UPDATE", [code])).rows[0];
  if (!lobby) throw new Error("Salon introuvable.");
  const member = (await client.query("SELECT * FROM sio_undercover_members WHERE lobby_id=$1 AND user_id=$2", [lobby.id, userId])).rows[0];
  if (!member) throw new Error("Tu ne fais plus partie de ce salon.");
  return { lobby, member };
}

export async function submitUndercoverClue(userId: string, codeValue: string, clueValue: string) {
  await ensureUndercoverSchema();
  const code = normalizeCode(codeValue); const clue = clueValue.trim().replace(/\s+/g, " ");
  if (clue.length < 1 || clue.length > 40) throw new Error("L’indice doit contenir entre 1 et 40 caractères.");
  await transaction(async (client) => {
    const { lobby, member } = await lobbyAndMemberForUpdate(client, code, userId);
    if (lobby.phase !== "CLUE" || lobby.current_turn_member !== member.id || member.eliminated) throw new Error("Ce n’est pas ton tour.");
    if (member.secret_word && normalizeGuess(clue) === normalizeGuess(member.secret_word)) throw new Error("Tu ne peux pas écrire directement ton mot secret.");
    await client.query("INSERT INTO sio_undercover_clues(id,lobby_id,member_id,round,clue) VALUES($1,$2,$3,$4,$5)", [randomUUID(), lobby.id, member.id, lobby.round, clue]);
    const active = (await client.query(`SELECT m.id,m.turn_order,EXISTS(SELECT 1 FROM sio_undercover_clues c WHERE c.member_id=m.id AND c.round=$2) AS played
      FROM sio_undercover_members m WHERE m.lobby_id=$1 AND NOT m.eliminated ORDER BY m.turn_order`, [lobby.id, lobby.round])).rows;
    const currentIndex = active.findIndex((item) => item.id === member.id);
    const next = [...active.slice(currentIndex + 1), ...active.slice(0, currentIndex + 1)].find((item) => !item.played);
    if (next) await client.query("UPDATE sio_undercover_lobbies SET current_turn_member=$2,last_event=$3,updated_at=now() WHERE id=$1", [lobby.id, next.id, `${member.display_name} a donné son indice.`]);
    else await client.query("UPDATE sio_undercover_lobbies SET phase='VOTE',current_turn_member=NULL,last_event='Tous les indices sont posés. Place au vote !',updated_at=now() WHERE id=$1", [lobby.id]);
  });
  return getUndercoverLobby(code, userId);
}

async function concludeOrNextRound(client: PoolClient, lobbyId: string, eliminatedName: string) {
  const players = (await client.query("SELECT role,eliminated FROM sio_undercover_members WHERE lobby_id=$1", [lobbyId])).rows as { role: UndercoverRole; eliminated: boolean }[];
  const winner = determineWinner(players);
  if (winner) {
    await client.query("UPDATE sio_undercover_lobbies SET phase='FINISHED',winner=$2,current_turn_member=NULL,last_event=$3,updated_at=now() WHERE id=$1", [lobbyId, winner, `${eliminatedName} est éliminé. La partie est terminée.`]);
    return;
  }
  const next = (await client.query("SELECT id FROM sio_undercover_members WHERE lobby_id=$1 AND NOT eliminated ORDER BY turn_order LIMIT 1", [lobbyId])).rows[0];
  await client.query("UPDATE sio_undercover_lobbies SET phase='CLUE',round=round+1,current_turn_member=$2,last_event=$3,updated_at=now() WHERE id=$1", [lobbyId, next.id, `${eliminatedName} est éliminé. Un nouveau tour commence.`]);
}

export async function submitUndercoverVote(userId: string, codeValue: string, targetId: string) {
  await ensureUndercoverSchema();
  const code = normalizeCode(codeValue);
  await transaction(async (client) => {
    const { lobby, member } = await lobbyAndMemberForUpdate(client, code, userId);
    if (lobby.phase !== "VOTE" || member.eliminated) throw new Error("Le vote n’est pas disponible.");
    if (member.id === targetId) throw new Error("Tu ne peux pas voter contre toi-même.");
    const target = (await client.query("SELECT id,display_name,role FROM sio_undercover_members WHERE id=$1 AND lobby_id=$2 AND NOT eliminated", [targetId, lobby.id])).rows[0];
    if (!target) throw new Error("Ce joueur ne peut pas recevoir de vote.");
    await client.query(`INSERT INTO sio_undercover_votes(lobby_id,voter_id,target_id,round) VALUES($1,$2,$3,$4)
      ON CONFLICT(lobby_id,voter_id,round) DO UPDATE SET target_id=excluded.target_id,created_at=now()`, [lobby.id, member.id, targetId, lobby.round]);
    const required = Number((await client.query("SELECT count(*) AS total FROM sio_undercover_members WHERE lobby_id=$1 AND NOT eliminated", [lobby.id])).rows[0].total);
    const cast = Number((await client.query("SELECT count(*) AS total FROM sio_undercover_votes WHERE lobby_id=$1 AND round=$2", [lobby.id, lobby.round])).rows[0].total);
    if (cast < required) { await client.query("UPDATE sio_undercover_lobbies SET last_event=$2,updated_at=now() WHERE id=$1", [lobby.id, `${cast}/${required} votes reçus.`]); return; }
    const scores = (await client.query("SELECT target_id,count(*)::integer AS total FROM sio_undercover_votes WHERE lobby_id=$1 AND round=$2 GROUP BY target_id ORDER BY total DESC", [lobby.id, lobby.round])).rows;
    const leaders = scores.filter((score) => score.total === scores[0].total);
    if (leaders.length > 1) {
      await client.query("DELETE FROM sio_undercover_votes WHERE lobby_id=$1 AND round=$2", [lobby.id, lobby.round]);
      await client.query("UPDATE sio_undercover_lobbies SET last_event='Égalité : les votes sont remis à zéro.',updated_at=now() WHERE id=$1", [lobby.id]);
      return;
    }
    const eliminated = (await client.query("UPDATE sio_undercover_members SET eliminated=true WHERE id=$1 RETURNING id,display_name,role", [leaders[0].target_id])).rows[0];
    if (eliminated.role === "MISTER_WHITE") {
      await client.query("UPDATE sio_undercover_lobbies SET phase='WHITE_GUESS',current_turn_member=$2,last_event=$3,updated_at=now() WHERE id=$1", [lobby.id, eliminated.id, `${eliminated.display_name} était Mister White et peut tenter le mot Civil.`]);
    } else await concludeOrNextRound(client, lobby.id, eliminated.display_name);
  });
  return getUndercoverLobby(code, userId);
}

export async function submitWhiteGuess(userId: string, codeValue: string, guessValue: string) {
  await ensureUndercoverSchema();
  const code = normalizeCode(codeValue); const guess = normalizeGuess(guessValue);
  if (!guess) throw new Error("Propose un mot.");
  await transaction(async (client) => {
    const { lobby, member } = await lobbyAndMemberForUpdate(client, code, userId);
    if (lobby.phase !== "WHITE_GUESS" || lobby.current_turn_member !== member.id || member.role !== "MISTER_WHITE") throw new Error("Cette tentative ne t’est pas destinée.");
    const civilWord = (await client.query("SELECT secret_word FROM sio_undercover_members WHERE lobby_id=$1 AND role='CIVIL' LIMIT 1", [lobby.id])).rows[0]?.secret_word ?? "";
    if (normalizeGuess(civilWord) === guess) {
      await client.query("UPDATE sio_undercover_lobbies SET phase='FINISHED',winner='MISTER_WHITE',current_turn_member=NULL,last_event='Mister White a trouvé le mot Civil !',updated_at=now() WHERE id=$1", [lobby.id]);
    } else await concludeOrNextRound(client, lobby.id, `${member.display_name} (Mister White)`);
  });
  return getUndercoverLobby(code, userId);
}

export async function rematchUndercover(userId: string, codeValue: string) {
  await ensureUndercoverSchema();
  const code = normalizeCode(codeValue);
  await transaction(async (client) => {
    const lobby = (await client.query("SELECT id FROM sio_undercover_lobbies WHERE code=$1 AND host_user_id=$2 AND phase='FINISHED' FOR UPDATE", [code, userId])).rows[0];
    if (!lobby) throw new Error("Seul le maître de salle peut préparer la revanche.");
    await client.query("DELETE FROM sio_undercover_clues WHERE lobby_id=$1", [lobby.id]);
    await client.query("DELETE FROM sio_undercover_votes WHERE lobby_id=$1", [lobby.id]);
    await client.query("UPDATE sio_undercover_members SET role=NULL,secret_word=NULL,eliminated=false,turn_order=0,last_seen=now() WHERE lobby_id=$1", [lobby.id]);
    await client.query("UPDATE sio_undercover_lobbies SET phase='LOBBY',round=0,current_turn_member=NULL,winner=NULL,selected_word_id=NULL,last_event='Le salon est prêt pour une revanche.',updated_at=now() WHERE id=$1", [lobby.id]);
  });
  return getUndercoverLobby(code, userId);
}

export async function leaveUndercoverLobby(userId: string, codeValue: string) {
  await ensureUndercoverSchema(); const code = normalizeCode(codeValue);
  await transaction(async (client) => {
    const { lobby, member } = await lobbyAndMemberForUpdate(client, code, userId);
    if (lobby.phase === "LOBBY") await client.query("DELETE FROM sio_undercover_members WHERE id=$1", [member.id]);
    else if (lobby.phase !== "FINISHED" && !member.eliminated) await client.query("UPDATE sio_undercover_members SET eliminated=true,last_seen='1970-01-01' WHERE id=$1", [member.id]);
    else await client.query("UPDATE sio_undercover_members SET last_seen='1970-01-01' WHERE id=$1", [member.id]);
    const remaining = (await client.query("SELECT id,user_id,display_name,eliminated FROM sio_undercover_members WHERE lobby_id=$1 ORDER BY joined_at", [lobby.id])).rows;
    if (!remaining.length) { await client.query("DELETE FROM sio_undercover_lobbies WHERE id=$1", [lobby.id]); return; }
    if (lobby.host_user_id === userId) {
      const successor = remaining.find((candidate) => candidate.id !== member.id && !candidate.eliminated)
        ?? remaining.find((candidate) => candidate.id !== member.id);
      if (successor) await client.query("UPDATE sio_undercover_lobbies SET host_user_id=$2,last_event=$3 WHERE id=$1", [lobby.id, successor.user_id, `${successor.display_name} devient maître de salle.`]);
    }
    if (lobby.phase !== "LOBBY" && lobby.phase !== "FINISHED" && !member.eliminated) await concludeOrNextRound(client, lobby.id, member.display_name);
  });
}

export async function kickUndercoverMember(userId: string, codeValue: string, memberId: string) {
  await ensureUndercoverSchema(); const code = normalizeCode(codeValue);
  const result = await database().query(`DELETE FROM sio_undercover_members m USING sio_undercover_lobbies l
    WHERE m.id=$3 AND m.lobby_id=l.id AND l.code=$1 AND l.host_user_id=$2 AND l.phase='LOBBY' AND m.user_id<>$2 RETURNING m.id`, [code, userId, memberId]);
  if (!result.rowCount) throw new Error("Ce joueur ne peut pas être retiré.");
  return getUndercoverLobby(code, userId);
}

export async function getUndercoverLobby(codeValue: string, userId: string, heartbeat = true): Promise<UndercoverLobbyState | null> {
  await ensureUndercoverSchema();
  const code = normalizeCode(codeValue);
  if (code.length !== 6) return null;
  if (heartbeat) await database().query(`UPDATE sio_undercover_members m SET last_seen=now() FROM sio_undercover_lobbies l WHERE m.lobby_id=l.id AND l.code=$1 AND m.user_id=$2`, [code, userId]);
  const lobby = (await database().query("SELECT * FROM sio_undercover_lobbies WHERE code=$1", [code])).rows[0];
  if (!lobby) return null;
  const client = await database().connect();
  try { await cleanupLobby(client, lobby.id); } finally { client.release(); }
  const refreshed = (await database().query("SELECT * FROM sio_undercover_lobbies WHERE id=$1", [lobby.id])).rows[0];
  if (!refreshed) return null;
  const rows = (await database().query(`SELECT m.*,u.username,(m.last_seen > now() - interval '15 seconds') AS online
    FROM sio_undercover_members m JOIN sio_users u ON u.id=m.user_id WHERE m.lobby_id=$1 ORDER BY m.turn_order,m.joined_at`, [lobby.id])).rows;
  const viewer = rows.find((row) => row.user_id === userId);
  if (!viewer) return null;
  const clueRows = (await database().query("SELECT id,member_id,round,clue,created_at FROM sio_undercover_clues WHERE lobby_id=$1 ORDER BY round,created_at", [lobby.id])).rows;
  const cluesByMember = new Map<string, UndercoverClue[]>();
  for (const clue of clueRows) {
    const items = cluesByMember.get(clue.member_id) ?? [];
    items.push({ id: clue.id, round: clue.round, text: clue.clue, createdAt: clue.created_at.toISOString() }); cluesByMember.set(clue.member_id, items);
  }
  const votes = (await database().query("SELECT voter_id,target_id FROM sio_undercover_votes WHERE lobby_id=$1 AND round=$2", [lobby.id, refreshed.round])).rows;
  const activeCount = rows.filter((row) => !row.eliminated).length;
  const finished = refreshed.phase === "FINISHED";
  return {
    code: refreshed.code,
    phase: refreshed.phase,
    wordMode: refreshed.word_mode,
    undercoverCount: refreshed.undercover_count,
    misterWhite: refreshed.mister_white,
    round: refreshed.round,
    winner: refreshed.winner,
    lastEvent: refreshed.last_event,
    currentTurnMemberId: refreshed.current_turn_member,
    members: rows.map((row) => ({
      id: row.id,
      name: row.display_name,
      avatar: row.avatar_data,
      isHost: row.user_id === refreshed.host_user_id,
      eliminated: row.eliminated,
      online: row.online,
      revealedRole: finished || row.eliminated ? row.role : null,
      clues: cluesByMember.get(row.id) ?? [],
    })),
    viewer: {
      memberId: viewer.id,
      isHost: viewer.user_id === refreshed.host_user_id,
      secretWord: refreshed.phase === "LOBBY" ? null : viewer.secret_word,
      misterWhite: refreshed.phase !== "LOBBY" && viewer.role === "MISTER_WHITE",
      eliminated: viewer.eliminated,
      hasClued: clueRows.some((clue) => clue.member_id === viewer.id && clue.round === refreshed.round),
      hasVoted: votes.some((vote) => vote.voter_id === viewer.id),
    },
    votesCast: votes.length,
    votesRequired: refreshed.phase === "VOTE" ? activeCount : 0,
  };
}

export async function listUndercoverWords(): Promise<UndercoverWordPair[]> {
  await ensureUndercoverSchema();
  const rows = (await database().query("SELECT id,mode,civil_word,undercover_word,enabled,created_at FROM sio_undercover_words ORDER BY mode,created_at,civil_word")).rows;
  return rows.map((row) => ({ id: row.id, mode: row.mode, civil: row.civil_word, undercover: row.undercover_word, enabled: row.enabled, createdAt: row.created_at.toISOString() }));
}

export async function addUndercoverWord(userId: string, input: { mode: WordMode; civil: string; undercover: string }) {
  await ensureUndercoverSchema();
  const civil = input.civil.trim(); const undercover = input.undercover.trim();
  if (normalizeGuess(civil) === normalizeGuess(undercover)) throw new Error("Les deux mots doivent être différents.");
  try { await database().query("INSERT INTO sio_undercover_words(id,mode,civil_word,undercover_word,created_by) VALUES($1,$2,$3,$4,$5)", [randomUUID(), input.mode, civil, undercover, userId]); }
  catch (error) { if ((error as { code?: string }).code === "23505") throw new Error("Cette paire existe déjà."); throw error; }
  return listUndercoverWords();
}

export async function updateUndercoverWord(id: string, input: { civil?: string; undercover?: string; enabled?: boolean }) {
  await ensureUndercoverSchema();
  const current = (await database().query("SELECT civil_word,undercover_word FROM sio_undercover_words WHERE id=$1", [id])).rows[0];
  if (!current) throw new Error("Paire introuvable.");
  const civil = input.civil?.trim() || current.civil_word; const undercover = input.undercover?.trim() || current.undercover_word;
  if (normalizeGuess(civil) === normalizeGuess(undercover)) throw new Error("Les deux mots doivent être différents.");
  await database().query("UPDATE sio_undercover_words SET civil_word=$2,undercover_word=$3,enabled=COALESCE($4,enabled) WHERE id=$1", [id, civil, undercover, input.enabled ?? null]);
  return listUndercoverWords();
}

export async function deleteUndercoverWord(id: string) {
  await ensureUndercoverSchema();
  const result = await database().query("DELETE FROM sio_undercover_words WHERE id=$1 RETURNING id", [id]);
  if (!result.rowCount) throw new Error("Paire introuvable.");
  return listUndercoverWords();
}

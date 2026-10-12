import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { SessionUser } from "./auth";
import {
  normalizeLobbyCode,
  scoreMemeRound,
  type MemeVoteValue,
  type ScoredSubmission,
} from "./makeitsio-game";

export type MakeItSioPhase =
  "LOBBY" | "CREATE" | "VOTE" | "ROUND_RESULTS" | "FINISHED";
export type MakeItSioMember = {
  id: string;
  name: string;
  avatar: string | null;
  isHost: boolean;
  online: boolean;
  score: number;
};
export type MakeItSioSubmission = {
  id: string;
  memberId: string;
  authorName: string | null;
  template: string;
  topText: string;
  bottomText: string;
  submitted: boolean;
  score: number | null;
  baseScore: number | null;
  buddyBonus: number | null;
  viewerVote: MemeVoteValue | null;
  viewerBuddy: boolean;
};
export type MakeItSioLobbyState = {
  code: string;
  phase: MakeItSioPhase;
  round: number;
  totalRounds: number;
  captionSeconds: number;
  phaseEndsAt: string | null;
  lastEvent: string;
  members: MakeItSioMember[];
  submissions: MakeItSioSubmission[];
  viewer: {
    memberId: string;
    isHost: boolean;
    submitted: boolean;
    votesCast: number;
    votesRequired: number;
    buddySubmissionId: string | null;
  };
};

const templates = [
  "/wallpapers/aurora.gif",
  "/wallpapers/circuit.gif",
  "/wallpapers/matrix.gif",
  "/wallpapers/nebula.gif",
  "/wallpapers/nocturne.gif",
  "/wallpapers/ocean.gif",
  "/wallpapers/synthwave.gif",
];

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
      max: 8,
    })
  : null;
pool?.on("error", () => {});
let schemaReady: Promise<void> | null = null;

function database() {
  if (!pool) throw new Error("PostgreSQL n’est pas configuré.");
  return pool;
}

export async function ensureMakeItSioSchema() {
  schemaReady ??= database()
    .query(
      `
    CREATE TABLE IF NOT EXISTS sio_meme_game_lobbies (
      id uuid PRIMARY KEY,
      code text NOT NULL UNIQUE,
      host_user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
      phase text NOT NULL DEFAULT 'LOBBY' CHECK (phase IN ('LOBBY','CREATE','VOTE','ROUND_RESULTS','FINISHED')),
      round integer NOT NULL DEFAULT 0,
      total_rounds integer NOT NULL DEFAULT 3 CHECK (total_rounds BETWEEN 1 AND 10),
      caption_seconds integer NOT NULL DEFAULT 90 CHECK (caption_seconds BETWEEN 30 AND 300),
      phase_ends_at timestamptz,
      last_event text NOT NULL DEFAULT 'Le studio attend ses créateurs.',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sio_meme_game_members (
      id uuid PRIMARY KEY,
      lobby_id uuid NOT NULL REFERENCES sio_meme_game_lobbies(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES sio_users(id) ON DELETE CASCADE,
      display_name text NOT NULL,
      avatar_data text,
      score integer NOT NULL DEFAULT 0,
      last_seen timestamptz NOT NULL DEFAULT now(),
      joined_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(lobby_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS sio_meme_game_members_lobby_idx ON sio_meme_game_members(lobby_id,joined_at);
    CREATE TABLE IF NOT EXISTS sio_meme_game_rounds (
      id uuid PRIMARY KEY,
      lobby_id uuid NOT NULL REFERENCES sio_meme_game_lobbies(id) ON DELETE CASCADE,
      round integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(lobby_id,round)
    );
    CREATE TABLE IF NOT EXISTS sio_meme_game_submissions (
      id uuid PRIMARY KEY,
      round_id uuid NOT NULL REFERENCES sio_meme_game_rounds(id) ON DELETE CASCADE,
      member_id uuid NOT NULL REFERENCES sio_meme_game_members(id) ON DELETE CASCADE,
      template_path text NOT NULL,
      top_text text NOT NULL DEFAULT '',
      bottom_text text NOT NULL DEFAULT '',
      submitted_at timestamptz,
      base_score integer,
      buddy_bonus integer,
      final_score integer,
      UNIQUE(round_id,member_id)
    );
    CREATE TABLE IF NOT EXISTS sio_meme_game_votes (
      submission_id uuid NOT NULL REFERENCES sio_meme_game_submissions(id) ON DELETE CASCADE,
      voter_id uuid NOT NULL REFERENCES sio_meme_game_members(id) ON DELETE CASCADE,
      value integer NOT NULL CHECK (value BETWEEN -1 AND 1),
      buddy boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(submission_id,voter_id)
    );
  `,
    )
    .then(() => {})
    .catch((error) => {
      schemaReady = null;
      throw error;
    });
  await schemaReady;
}

async function transaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function cleanName(value: string, fallback: string) {
  const name = value.trim().replace(/\s+/g, " ").slice(0, 28);
  return name.length >= 2 ? name : fallback;
}
function cleanAvatar(value?: string | null) {
  if (!value) return null;
  if (
    value.length > 450_000 ||
    !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
  )
    throw new Error("La photo de profil est trop lourde ou invalide.");
  return value;
}

async function generateCode(client: PoolClient) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = randomBytes(5)
      .toString("base64url")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6)
      .padEnd(6, "M");
    if (
      !(
        await client.query(
          "SELECT 1 FROM sio_meme_game_lobbies WHERE code=$1",
          [code],
        )
      ).rowCount
    )
      return code;
  }
  throw new Error("Impossible de générer un code de salon.");
}

async function lobbyAndMember(
  client: PoolClient,
  codeValue: string,
  userId: string,
) {
  const code = normalizeLobbyCode(codeValue);
  const lobby = (
    await client.query(
      "SELECT * FROM sio_meme_game_lobbies WHERE code=$1 FOR UPDATE",
      [code],
    )
  ).rows[0];
  if (!lobby) throw new Error("Salon introuvable.");
  const member = (
    await client.query(
      "SELECT * FROM sio_meme_game_members WHERE lobby_id=$1 AND user_id=$2",
      [lobby.id, userId],
    )
  ).rows[0];
  if (!member) throw new Error("Tu ne fais plus partie de ce salon.");
  return { lobby, member, code };
}

async function createRound(
  client: PoolClient,
  lobbyId: string,
  roundNumber: number,
  seconds: number,
) {
  const roundId = randomUUID();
  await client.query(
    "INSERT INTO sio_meme_game_rounds(id,lobby_id,round) VALUES($1,$2,$3)",
    [roundId, lobbyId, roundNumber],
  );
  const members = (
    await client.query(
      "SELECT id FROM sio_meme_game_members WHERE lobby_id=$1 ORDER BY joined_at",
      [lobbyId],
    )
  ).rows;
  const offset = Math.floor(Math.random() * templates.length);
  for (let index = 0; index < members.length; index += 1) {
    await client.query(
      "INSERT INTO sio_meme_game_submissions(id,round_id,member_id,template_path) VALUES($1,$2,$3,$4)",
      [
        randomUUID(),
        roundId,
        members[index].id,
        templates[(offset + index + roundNumber) % templates.length],
      ],
    );
  }
  await client.query(
    "UPDATE sio_meme_game_lobbies SET phase='CREATE',round=$2,phase_ends_at=now()+($3::text || ' seconds')::interval,last_event=$4,updated_at=now() WHERE id=$1",
    [
      lobbyId,
      roundNumber,
      seconds,
      `Manche ${roundNumber} : créez votre meilleur mème !`,
    ],
  );
}

async function finishRound(client: PoolClient, lobbyId: string, round: number) {
  const rows = (
    await client.query(
      `SELECT s.id,s.member_id,v.voter_id,v.value,v.buddy
    FROM sio_meme_game_submissions s JOIN sio_meme_game_rounds r ON r.id=s.round_id
    LEFT JOIN sio_meme_game_votes v ON v.submission_id=s.id WHERE r.lobby_id=$1 AND r.round=$2 ORDER BY s.id`,
      [lobbyId, round],
    )
  ).rows;
  const grouped = new Map<string, ScoredSubmission>();
  for (const row of rows) {
    const submission: ScoredSubmission = grouped.get(row.id) ?? {
      id: row.id,
      authorId: row.member_id,
      votes: [],
    };
    if (row.voter_id)
      submission.votes.push({
        voterId: row.voter_id,
        value: Number(row.value) as MemeVoteValue,
        buddy: row.buddy,
      });
    grouped.set(row.id, submission);
  }
  const result = scoreMemeRound([...grouped.values()]);
  for (const meme of result.memes) {
    await client.query(
      "UPDATE sio_meme_game_submissions SET base_score=$2,buddy_bonus=$3,final_score=$4 WHERE id=$1",
      [meme.submissionId, meme.base, meme.buddyBonus, meme.total],
    );
    await client.query(
      "UPDATE sio_meme_game_members SET score=score+$2 WHERE id=$1",
      [meme.authorId, meme.total],
    );
  }
  for (const [memberId, reward] of result.buddyRewards)
    await client.query(
      "UPDATE sio_meme_game_members SET score=score+$2 WHERE id=$1",
      [memberId, reward],
    );
  await client.query(
    "UPDATE sio_meme_game_lobbies SET phase='ROUND_RESULTS',phase_ends_at=NULL,last_event='Les votes sont clos. Découvrez les scores !',updated_at=now() WHERE id=$1",
    [lobbyId],
  );
}

async function advanceExpiredCreate(
  client: PoolClient,
  lobby: Record<string, unknown>,
) {
  if (
    lobby.phase !== "CREATE" ||
    !lobby.phase_ends_at ||
    new Date(lobby.phase_ends_at as string | Date).getTime() > Date.now()
  )
    return;
  await client.query(
    `UPDATE sio_meme_game_submissions s SET top_text=CASE WHEN top_text='' AND bottom_text='' THEN 'TEMPS ÉCOULÉ' ELSE top_text END,submitted_at=COALESCE(submitted_at,now())
    FROM sio_meme_game_rounds r WHERE s.round_id=r.id AND r.lobby_id=$1 AND r.round=$2`,
    [lobby.id, lobby.round],
  );
  await client.query(
    "UPDATE sio_meme_game_lobbies SET phase='VOTE',phase_ends_at=NULL,last_event='Temps écoulé : place aux votes !',updated_at=now() WHERE id=$1",
    [lobby.id],
  );
}

export async function createMakeItSioLobby(
  user: SessionUser,
  input: { name: string; avatar?: string | null },
) {
  await ensureMakeItSioSchema();
  const code = await transaction(async (client) => {
    const id = randomUUID();
    const code = await generateCode(client);
    await client.query(
      "INSERT INTO sio_meme_game_lobbies(id,code,host_user_id) VALUES($1,$2,$3)",
      [id, code, user.id],
    );
    await client.query(
      "INSERT INTO sio_meme_game_members(id,lobby_id,user_id,display_name,avatar_data) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        id,
        user.id,
        cleanName(input.name, user.username),
        cleanAvatar(input.avatar),
      ],
    );
    return code;
  });
  return getMakeItSioLobby(code, user.id);
}

export async function joinMakeItSioLobby(
  user: SessionUser,
  input: { code: string; name: string; avatar?: string | null },
) {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(input.code);
  await transaction(async (client) => {
    const lobby = (
      await client.query(
        "SELECT * FROM sio_meme_game_lobbies WHERE code=$1 FOR UPDATE",
        [code],
      )
    ).rows[0];
    if (!lobby) throw new Error("Salon introuvable.");
    if (lobby.phase !== "LOBBY")
      throw new Error("Cette partie a déjà commencé.");
    const count = Number(
      (
        await client.query(
          "SELECT count(*) AS total FROM sio_meme_game_members WHERE lobby_id=$1",
          [lobby.id],
        )
      ).rows[0].total,
    );
    if (count >= 30) throw new Error("Le salon est complet.");
    await client.query(
      `INSERT INTO sio_meme_game_members(id,lobby_id,user_id,display_name,avatar_data) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(lobby_id,user_id) DO UPDATE SET display_name=excluded.display_name,avatar_data=excluded.avatar_data,last_seen=now()`,
      [
        randomUUID(),
        lobby.id,
        user.id,
        cleanName(input.name, user.username),
        cleanAvatar(input.avatar),
      ],
    );
    await client.query(
      "UPDATE sio_meme_game_lobbies SET last_event=$2,updated_at=now() WHERE id=$1",
      [lobby.id, `${cleanName(input.name, user.username)} rejoint le studio.`],
    );
  });
  return getMakeItSioLobby(code, user.id);
}

export async function updateMakeItSioSettings(
  userId: string,
  codeValue: string,
  input: { totalRounds: number; captionSeconds: number },
) {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(codeValue);
  const result = await database().query(
    "UPDATE sio_meme_game_lobbies SET total_rounds=$3,caption_seconds=$4,updated_at=now() WHERE code=$1 AND host_user_id=$2 AND phase='LOBBY' RETURNING id",
    [code, userId, input.totalRounds, input.captionSeconds],
  );
  if (!result.rowCount)
    throw new Error("Seul le chef du salon peut modifier ces réglages.");
  return getMakeItSioLobby(code, userId);
}

export async function startMakeItSioGame(userId: string, codeValue: string) {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(codeValue);
  await transaction(async (client) => {
    const { lobby } = await lobbyAndMember(client, code, userId);
    if (lobby.host_user_id !== userId || lobby.phase !== "LOBBY")
      throw new Error("Impossible de lancer la partie.");
    const count = Number(
      (
        await client.query(
          "SELECT count(*) AS total FROM sio_meme_game_members WHERE lobby_id=$1",
          [lobby.id],
        )
      ).rows[0].total,
    );
    if (count < 2) throw new Error("Il faut au moins deux joueurs.");
    await createRound(client, lobby.id, 1, lobby.caption_seconds);
  });
  return getMakeItSioLobby(code, userId);
}

export async function submitMakeItSioCaption(
  userId: string,
  codeValue: string,
  input: { topText: string; bottomText: string },
) {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(codeValue);
  await transaction(async (client) => {
    const { lobby, member } = await lobbyAndMember(client, code, userId);
    await advanceExpiredCreate(client, lobby);
    const current = (
      await client.query(
        "SELECT phase FROM sio_meme_game_lobbies WHERE id=$1",
        [lobby.id],
      )
    ).rows[0];
    if (current.phase !== "CREATE")
      throw new Error("La phase de création est terminée.");
    const top = input.topText.trim().slice(0, 100);
    const bottom = input.bottomText.trim().slice(0, 100);
    if (!top && !bottom) throw new Error("Ajoute au moins une légende.");
    const result = await client.query(
      `UPDATE sio_meme_game_submissions s SET top_text=$4,bottom_text=$5,submitted_at=now()
      FROM sio_meme_game_rounds r WHERE s.round_id=r.id AND r.lobby_id=$1 AND r.round=$2 AND s.member_id=$3 RETURNING s.id`,
      [lobby.id, lobby.round, member.id, top, bottom],
    );
    if (!result.rowCount) throw new Error("Création introuvable.");
    const missing = Number(
      (
        await client.query(
          `SELECT count(*) AS total FROM sio_meme_game_submissions s JOIN sio_meme_game_rounds r ON r.id=s.round_id
      WHERE r.lobby_id=$1 AND r.round=$2 AND s.submitted_at IS NULL`,
          [lobby.id, lobby.round],
        )
      ).rows[0].total,
    );
    if (!missing)
      await client.query(
        "UPDATE sio_meme_game_lobbies SET phase='VOTE',phase_ends_at=NULL,last_event='Tous les mèmes sont prêts. À vos votes !',updated_at=now() WHERE id=$1",
        [lobby.id],
      );
    else
      await client.query(
        "UPDATE sio_meme_game_lobbies SET last_event=$2,updated_at=now() WHERE id=$1",
        [
          lobby.id,
          `${missing} création${missing > 1 ? "s" : ""} encore attendue${missing > 1 ? "s" : ""}.`,
        ],
      );
  });
  return getMakeItSioLobby(code, userId);
}

export async function voteMakeItSio(
  userId: string,
  codeValue: string,
  input: { submissionId: string; value: MemeVoteValue; buddy: boolean },
) {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(codeValue);
  await transaction(async (client) => {
    const { lobby, member } = await lobbyAndMember(client, code, userId);
    if (lobby.phase !== "VOTE")
      throw new Error("Les votes ne sont pas ouverts.");
    const target = (
      await client.query(
        `SELECT s.id,s.member_id FROM sio_meme_game_submissions s JOIN sio_meme_game_rounds r ON r.id=s.round_id
      WHERE s.id=$1 AND r.lobby_id=$2 AND r.round=$3`,
        [input.submissionId, lobby.id, lobby.round],
      )
    ).rows[0];
    if (!target || target.member_id === member.id)
      throw new Error("Tu ne peux pas voter pour ta propre création.");
    if (input.buddy)
      await client.query(
        `UPDATE sio_meme_game_votes v SET buddy=false FROM sio_meme_game_submissions s JOIN sio_meme_game_rounds r ON r.id=s.round_id
      WHERE v.submission_id=s.id AND r.lobby_id=$1 AND r.round=$2 AND v.voter_id=$3`,
        [lobby.id, lobby.round, member.id],
      );
    await client.query(
      `INSERT INTO sio_meme_game_votes(submission_id,voter_id,value,buddy) VALUES($1,$2,$3,$4)
      ON CONFLICT(submission_id,voter_id) DO UPDATE SET value=excluded.value,buddy=excluded.buddy,created_at=now()`,
      [target.id, member.id, input.value, input.buddy],
    );
    const totalMembers = Number(
      (
        await client.query(
          "SELECT count(*) AS total FROM sio_meme_game_members WHERE lobby_id=$1",
          [lobby.id],
        )
      ).rows[0].total,
    );
    const required = totalMembers * (totalMembers - 1);
    const cast = Number(
      (
        await client.query(
          `SELECT count(*) AS total FROM sio_meme_game_votes v JOIN sio_meme_game_submissions s ON s.id=v.submission_id
      JOIN sio_meme_game_rounds r ON r.id=s.round_id WHERE r.lobby_id=$1 AND r.round=$2`,
          [lobby.id, lobby.round],
        )
      ).rows[0].total,
    );
    if (cast >= required) await finishRound(client, lobby.id, lobby.round);
    else
      await client.query(
        "UPDATE sio_meme_game_lobbies SET last_event=$2,updated_at=now() WHERE id=$1",
        [lobby.id, `${cast}/${required} évaluations reçues.`],
      );
  });
  return getMakeItSioLobby(code, userId);
}

export async function continueMakeItSio(userId: string, codeValue: string) {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(codeValue);
  await transaction(async (client) => {
    const { lobby } = await lobbyAndMember(client, code, userId);
    if (lobby.host_user_id !== userId || lobby.phase !== "ROUND_RESULTS")
      throw new Error("Seul le chef peut continuer.");
    if (lobby.round >= lobby.total_rounds)
      await client.query(
        "UPDATE sio_meme_game_lobbies SET phase='FINISHED',last_event='La grande finale est arrivée !',updated_at=now() WHERE id=$1",
        [lobby.id],
      );
    else
      await createRound(
        client,
        lobby.id,
        lobby.round + 1,
        lobby.caption_seconds,
      );
  });
  return getMakeItSioLobby(code, userId);
}

export async function rematchMakeItSio(userId: string, codeValue: string) {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(codeValue);
  const result = await database().query(
    `UPDATE sio_meme_game_lobbies SET phase='LOBBY',round=0,phase_ends_at=NULL,last_event='Le studio est prêt pour une revanche.',updated_at=now()
    WHERE code=$1 AND host_user_id=$2 AND phase='FINISHED' RETURNING id`,
    [code, userId],
  );
  if (!result.rowCount)
    throw new Error("Seul le chef peut préparer la revanche.");
  await database().query(
    "UPDATE sio_meme_game_members SET score=0,last_seen=now() WHERE lobby_id=$1",
    [result.rows[0].id],
  );
  return getMakeItSioLobby(code, userId);
}

export async function leaveMakeItSioLobby(userId: string, codeValue: string) {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(codeValue);
  await transaction(async (client) => {
    const { lobby, member } = await lobbyAndMember(client, code, userId);
    if (lobby.phase === "LOBBY")
      await client.query("DELETE FROM sio_meme_game_members WHERE id=$1", [
        member.id,
      ]);
    else
      await client.query(
        "UPDATE sio_meme_game_members SET last_seen='1970-01-01' WHERE id=$1",
        [member.id],
      );
    const remaining = (
      await client.query(
        "SELECT user_id FROM sio_meme_game_members WHERE lobby_id=$1 ORDER BY joined_at",
        [lobby.id],
      )
    ).rows;
    if (!remaining.length) {
      await client.query("DELETE FROM sio_meme_game_lobbies WHERE id=$1", [
        lobby.id,
      ]);
      return;
    }
    if (lobby.host_user_id === userId)
      await client.query(
        "UPDATE sio_meme_game_lobbies SET host_user_id=$2,last_event='Le chef du studio a changé.' WHERE id=$1",
        [lobby.id, remaining[0].user_id],
      );
  });
}

export async function getMakeItSioLobby(
  codeValue: string,
  userId: string,
): Promise<MakeItSioLobbyState | null> {
  await ensureMakeItSioSchema();
  const code = normalizeLobbyCode(codeValue);
  if (code.length !== 6) return null;
  await database().query(
    `UPDATE sio_meme_game_members m SET last_seen=now() FROM sio_meme_game_lobbies l WHERE m.lobby_id=l.id AND l.code=$1 AND m.user_id=$2`,
    [code, userId],
  );
  await transaction(async (client) => {
    const lobby = (
      await client.query(
        "SELECT * FROM sio_meme_game_lobbies WHERE code=$1 FOR UPDATE",
        [code],
      )
    ).rows[0];
    if (lobby) await advanceExpiredCreate(client, lobby);
  });
  const lobby = (
    await database().query(
      "SELECT * FROM sio_meme_game_lobbies WHERE code=$1",
      [code],
    )
  ).rows[0];
  if (!lobby) return null;
  const members = (
    await database().query(
      "SELECT *,last_seen>now()-interval '15 seconds' AS online FROM sio_meme_game_members WHERE lobby_id=$1 ORDER BY score DESC,joined_at",
      [lobby.id],
    )
  ).rows;
  const viewer = members.find((row) => row.user_id === userId);
  if (!viewer) return null;
  const submissions = lobby.round
    ? (
        await database().query(
          `SELECT s.*,m.display_name,v.value AS viewer_vote,v.buddy AS viewer_buddy
    FROM sio_meme_game_submissions s JOIN sio_meme_game_rounds r ON r.id=s.round_id JOIN sio_meme_game_members m ON m.id=s.member_id
    LEFT JOIN sio_meme_game_votes v ON v.submission_id=s.id AND v.voter_id=$3 WHERE r.lobby_id=$1 AND r.round=$2 ORDER BY s.id`,
          [lobby.id, lobby.round, viewer.id],
        )
      ).rows
    : [];
  const revealAuthors =
    lobby.phase === "ROUND_RESULTS" || lobby.phase === "FINISHED";
  const votesCast = submissions.filter(
    (row) => row.member_id !== viewer.id && row.viewer_vote !== null,
  ).length;
  return {
    code: lobby.code,
    phase: lobby.phase,
    round: lobby.round,
    totalRounds: lobby.total_rounds,
    captionSeconds: lobby.caption_seconds,
    phaseEndsAt: lobby.phase_ends_at?.toISOString() ?? null,
    lastEvent: lobby.last_event,
    members: members.map((row) => ({
      id: row.id,
      name: row.display_name,
      avatar: row.avatar_data,
      isHost: row.user_id === lobby.host_user_id,
      online: row.online,
      score: row.score,
    })),
    submissions: submissions.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      authorName:
        revealAuthors || row.member_id === viewer.id ? row.display_name : null,
      template: row.template_path,
      topText: row.top_text,
      bottomText: row.bottom_text,
      submitted: Boolean(row.submitted_at),
      score: row.final_score,
      baseScore: row.base_score,
      buddyBonus: row.buddy_bonus,
      viewerVote:
        row.viewer_vote === null
          ? null
          : (Number(row.viewer_vote) as MemeVoteValue),
      viewerBuddy: Boolean(row.viewer_buddy),
    })),
    viewer: {
      memberId: viewer.id,
      isHost: viewer.user_id === lobby.host_user_id,
      submitted: submissions.some(
        (row) => row.member_id === viewer.id && row.submitted_at,
      ),
      votesCast,
      votesRequired: Math.max(0, members.length - 1),
      buddySubmissionId:
        submissions.find((row) => row.viewer_buddy)?.id ?? null,
    },
  };
}

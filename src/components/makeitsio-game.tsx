"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  Check,
  Clipboard,
  Crown,
  DoorOpen,
  Frown,
  ImagePlus,
  Laugh,
  LogIn,
  Meh,
  PackageOpen,
  Play,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Star,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import type { MakeItSioLobbyState, MakeItSioSubmission } from "@/lib/makeitsio";
import type { MemeVoteValue } from "@/lib/makeitsio-game";

async function compressAvatar(file: File) {
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)
    throw new Error("Choisis une image de moins de 8 Mo.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image illisible.");
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - size) / 2,
      (image.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/webp", 0.76);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  return (
    <span className="mis-avatar">
      {src ? <img src={src} alt="" /> : <UserRound size={28} />}
      <i>{name.slice(0, 1).toUpperCase()}</i>
    </span>
  );
}

function MemeCanvas({
  meme,
  draftTop,
  draftBottom,
}: {
  meme: MakeItSioSubmission;
  draftTop?: string;
  draftBottom?: string;
}) {
  return (
    <div className="mis-meme-canvas">
      <img src={meme.template} alt="Modèle de mème" />
      <strong className="top">{draftTop ?? meme.topText}</strong>
      <strong className="bottom">{draftBottom ?? meme.bottomText}</strong>
    </div>
  );
}

export function MakeItSioGame({
  username,
  canManage,
}: {
  username: string;
  canManage: boolean;
}) {
  const [lobby, setLobby] = useState<MakeItSioLobbyState | null>(null);
  const [name, setName] = useState(username);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeRef = useRef<string | null>(null);

  useEffect(() => {
    codeRef.current = lobby?.code ?? null;
  }, [lobby?.code]);

  async function action(body: object, quiet = false) {
    if (!quiet) {
      setBusy(true);
      setError("");
    }
    try {
      const response = await fetch("/api/makeitsio/lobby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Action impossible.");
      if (result.lobby) {
        setLobby(result.lobby);
        localStorage.setItem("sioverse-makeitsio-lobby", result.lobby.code);
      }
      return result;
    } catch (cause) {
      if (!quiet)
        setError(cause instanceof Error ? cause.message : "Action impossible.");
      return null;
    } finally {
      if (!quiet) setBusy(false);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("sioverse-makeitsio-lobby");
    if (!saved) return;
    fetch(`/api/makeitsio/lobby?code=${encodeURIComponent(saved)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          localStorage.removeItem("sioverse-makeitsio-lobby");
          return;
        }
        setLobby((await response.json()).lobby);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!lobby?.code) return;
    const code = lobby.code;
    const timer = window.setInterval(
      () =>
        fetch(`/api/makeitsio/lobby?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        })
          .then(async (response) => {
            if (response.status === 404) {
              setLobby(null);
              localStorage.removeItem("sioverse-makeitsio-lobby");
            } else if (response.ok) setLobby((await response.json()).lobby);
          })
          .catch(() => {}),
      2200,
    );
    return () => window.clearInterval(timer);
  }, [lobby?.code]);

  useEffect(() => {
    const update = () =>
      setSecondsLeft(
        lobby?.phaseEndsAt
          ? Math.max(
              0,
              Math.ceil(
                (new Date(lobby.phaseEndsAt).getTime() - Date.now()) / 1000,
              ),
            )
          : 0,
      );
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [lobby?.phaseEndsAt]);

  useEffect(() => {
    const leave = () => {
      if (codeRef.current)
        navigator.sendBeacon(
          "/api/makeitsio/lobby",
          new Blob(
            [JSON.stringify({ action: "leave", code: codeRef.current })],
            { type: "application/json" },
          ),
        );
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);

  async function pickAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setAvatar(await compressAvatar(file));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image invalide.");
    }
    event.target.value = "";
  }

  async function leave() {
    if (!lobby) return;
    await action({ action: "leave", code: lobby.code });
    localStorage.removeItem("sioverse-makeitsio-lobby");
    setLobby(null);
  }

  if (!lobby)
    return (
      <main className="mis-shell mis-entry-shell">
        <header className="mis-topbar">
          <Link href="/sioverse">
            <ArrowLeft size={17} /> Tous les univers
          </Link>
          <b>
            MAKE IT <span>SIO</span>
          </b>
          {canManage ? (
            <Link className="mis-studio-link" href="/sioverse/makeitsio/studio">
              <PackageOpen size={15} /> Studio
            </Link>
          ) : (
            <small>MEME PARTY</small>
          )}
        </header>
        <section className="mis-entry">
          <div className="mis-entry-copy">
            <span>
              <Sparkles size={15} /> LA PROMO DEVIENT LE MÈME
            </span>
            <h1>
              Crée. Vote.
              <br />
              <em>Fais rire la classe.</em>
            </h1>
            <p>
              Une image, quelques secondes et beaucoup trop de dossiers sur
              chacun. Le meilleur mème monte sur le podium.
            </p>
            <div>
              <span>01</span> Crée ton mème <i /> <span>02</span> Vote en secret{" "}
              <i /> <span>03</span> Gagne la manche
            </div>
          </div>
          <div className="mis-entry-card">
            <div className="mis-profile">
              <div>
                <Avatar name={name} src={avatar} />
                <label>
                  <ImagePlus size={15} />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={pickAvatar}
                  />
                </label>
              </div>
              <label>
                Ton pseudo
                <input
                  value={name}
                  minLength={2}
                  maxLength={28}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </div>
            <button
              className="mis-create"
              disabled={busy || name.trim().length < 2}
              onClick={() => void action({ action: "create", name, avatar })}
            >
              <Play size={19} />
              <span>
                Créer un salon<small>Tu deviens chef de partie</small>
              </span>
            </button>
            <div className="mis-divider">
              <span />
              OU
              <span />
            </div>
            <form
              className="mis-join"
              onSubmit={(event) => {
                event.preventDefault();
                void action({ action: "join", code: joinCode, name, avatar });
              }}
            >
              <label>
                Code du salon
                <input
                  value={joinCode}
                  onChange={(event) =>
                    setJoinCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6),
                    )
                  }
                  placeholder="MEME42"
                />
              </label>
              <button disabled={busy || joinCode.length !== 6}>
                <LogIn size={17} /> Rejoindre
              </button>
            </form>
            {error && (
              <p className="mis-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      </main>
    );

  const ownMeme = lobby.submissions.find(
    (submission) => submission.memberId === lobby.viewer.memberId,
  );
  return (
    <main className="mis-shell">
      <header className="mis-topbar">
        <button onClick={() => void leave()}>
          <DoorOpen size={17} /> Quitter
        </button>
        <b>
          MAKE IT <span>SIO</span>
        </b>
        <div className="mis-code-wrap">
          <small>SALON</small>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(lobby.code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
          >
            {lobby.code}
            {copied ? <Check size={14} /> : <Clipboard size={14} />}
          </button>
        </div>
      </header>
      <section className="mis-status">
        <div>
          <span className={`mis-phase ${lobby.phase.toLowerCase()}`}>
            {phaseLabel(lobby)}
          </span>
          <h1>
            {lobby.phase === "LOBBY"
              ? "Le studio se remplit"
              : lobby.phase === "CREATE"
                ? "À vos légendes !"
                : lobby.phase === "VOTE"
                  ? "Que le meilleur gagne"
                  : lobby.phase === "ROUND_RESULTS"
                    ? "Résultats de la manche"
                    : "Podium final"}
          </h1>
          <p>{lobby.lastEvent}</p>
        </div>
        {lobby.phase === "CREATE" && (
          <div className={`mis-timer ${secondsLeft < 11 ? "urgent" : ""}`}>
            <strong>
              {Math.floor(secondsLeft / 60)
                .toString()
                .padStart(2, "0")}
              :{(secondsLeft % 60).toString().padStart(2, "0")}
            </strong>
            <small>TEMPS RESTANT</small>
          </div>
        )}
      </section>

      {lobby.topic && lobby.phase === "CREATE" && (
        <div className="mis-topic">
          <Sparkles size={16} />
          <span>SUJET DE LA MANCHE</span>
          <strong>{lobby.topic}</strong>
        </div>
      )}
      {lobby.phase === "LOBBY" && (
        <Lobby lobby={lobby} busy={busy} action={action} />
      )}
      {lobby.phase === "CREATE" && ownMeme && (
        <Creator lobby={lobby} meme={ownMeme} busy={busy} action={action} />
      )}
      {lobby.phase === "VOTE" && (
        <Voting lobby={lobby} busy={busy} action={action} />
      )}
      {lobby.phase === "ROUND_RESULTS" && (
        <Results lobby={lobby} busy={busy} action={action} />
      )}
      {lobby.phase === "FINISHED" && (
        <Final lobby={lobby} busy={busy} action={action} />
      )}
      {error && (
        <p className="mis-error mis-global-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

function phaseLabel(lobby: MakeItSioLobbyState) {
  if (lobby.phase === "LOBBY") return "SALLE D’ATTENTE";
  if (lobby.phase === "FINISHED") return "FINALE";
  return `MANCHE ${lobby.round} / ${lobby.totalRounds}`;
}

function Lobby({
  lobby,
  busy,
  action,
}: {
  lobby: MakeItSioLobbyState;
  busy: boolean;
  action: (body: object) => Promise<unknown>;
}) {
  const [rounds, setRounds] = useState(lobby.totalRounds);
  const [seconds, setSeconds] = useState(lobby.captionSeconds);
  const [mode, setMode] = useState(lobby.mode);
  const [packIds, setPackIds] = useState(lobby.selectedPackIds);
  const modes = [
    {
      id: "NORMAL",
      name: "Normal",
      text: "Un modèle différent pour chaque joueur.",
    },
    {
      id: "TOPICS",
      name: "Sujets",
      text: "Un thème commun inspire chaque manche.",
    },
    {
      id: "SAME",
      name: "Même mème",
      text: "Même modèle, idées totalement différentes.",
    },
    {
      id: "RELAXED",
      name: "Détendu",
      text: "Galerie sans votes, score ni pression.",
    },
  ] as const;
  return (
    <div className="mis-lobby-layout">
      <section className="mis-players-panel">
        <header>
          <Users size={18} />
          <div>
            <strong>{lobby.members.length}/30 créateurs</strong>
            <small>Deux joueurs minimum</small>
          </div>
        </header>
        <div className="mis-player-list">
          {lobby.members.map((member, index) => (
            <article key={member.id}>
              <Avatar name={member.name} src={member.avatar} />
              <span>
                <strong>{member.name}</strong>
                <small>
                  {member.isHost ? (
                    <>
                      <Crown size={11} /> Chef du salon
                    </>
                  ) : member.online ? (
                    "Prêt à créer"
                  ) : (
                    "Hors ligne"
                  )}
                </small>
              </span>
              <i>{index + 1}</i>
            </article>
          ))}
        </div>
      </section>
      <aside className="mis-settings">
        <span>
          <Settings2 size={16} /> PARAMÈTRES DU JEU
        </span>
        <h2>
          {lobby.viewer.isHost
            ? "Prépare la partie"
            : "Le chef prépare la partie"}
        </h2>
        {lobby.viewer.isHost ? (
          <>
            <div className="mis-mode-picker">
              {modes.map((item) => (
                <button
                  key={item.id}
                  className={mode === item.id ? "active" : ""}
                  onClick={() => setMode(item.id)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.text}</small>
                </button>
              ))}
            </div>
            <fieldset className="mis-pack-picker">
              <legend>Packs utilisés</legend>
              {lobby.availablePacks.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={packIds.includes(item.id)}
                    onChange={() =>
                      setPackIds((current) =>
                        current.includes(item.id)
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id],
                      )
                    }
                  />
                  <span>
                    {item.name}
                    <small>{item.templateCount} modèles</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <label>
              Nombre de manches
              <input
                type="range"
                min={1}
                max={10}
                value={rounds}
                onChange={(event) => setRounds(Number(event.target.value))}
              />
              <b>{rounds}</b>
            </label>
            <label>
              Temps de création
              <input
                type="range"
                min={30}
                max={300}
                step={15}
                value={seconds}
                onChange={(event) => setSeconds(Number(event.target.value))}
              />
              <b>{seconds}s</b>
            </label>
            <button
              className="mis-save"
              disabled={busy || !packIds.length}
              onClick={() =>
                void action({
                  action: "settings",
                  code: lobby.code,
                  totalRounds: rounds,
                  captionSeconds: seconds,
                  mode,
                  packIds,
                })
              }
            >
              Enregistrer les réglages
            </button>
            <button
              className="mis-launch"
              disabled={busy || lobby.members.length < 2 || !packIds.length}
              onClick={() => void action({ action: "start", code: lobby.code })}
            >
              <Play size={19} /> Lancer la partie
              <small>
                {lobby.members.length < 2
                  ? "En attente d’un autre joueur"
                  : `${lobby.members.length} joueurs prêts`}
              </small>
            </button>
          </>
        ) : (
          <>
            <div className="mis-mode-card">
              <strong>
                Mode {modes.find((item) => item.id === lobby.mode)?.name}
              </strong>
              <p>{modes.find((item) => item.id === lobby.mode)?.text}</p>
            </div>
            <div className="mis-waiting">
              <i />
              <strong>En attente du lancement</strong>
              <p>
                {lobby.totalRounds} manches · {lobby.captionSeconds} secondes
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Creator({
  lobby,
  meme,
  busy,
  action,
}: {
  lobby: MakeItSioLobbyState;
  meme: MakeItSioSubmission;
  busy: boolean;
  action: (body: object) => Promise<unknown>;
}) {
  const [top, setTop] = useState(meme.topText);
  const [bottom, setBottom] = useState(meme.bottomText);
  if (lobby.viewer.submitted)
    return (
      <section className="mis-submitted">
        <Check size={42} />
        <h2>Ton mème est dans la boîte.</h2>
        <p>
          Il reste à attendre les autres créateurs. Garde ton chef-d’œuvre
          secret jusque-là.
        </p>
        <MemeCanvas meme={meme} />
      </section>
    );
  return (
    <section className="mis-creator">
      <div className="mis-editor-preview">
        <MemeCanvas meme={meme} draftTop={top} draftBottom={bottom} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action({
            action: "caption",
            code: lobby.code,
            topText: top,
            bottomText: bottom,
          });
        }}
      >
        <span>
          <Sparkles size={16} /> TON ATELIER
        </span>
        <h2>Écris la légende parfaite</h2>
        <p>Tu peux utiliser le texte du haut, du bas, ou les deux.</p>
        <label>
          Texte du haut
          <input
            value={top}
            maxLength={100}
            onChange={(event) => setTop(event.target.value.toUpperCase())}
            placeholder="QUAND LE PROF DIT…"
          />
          <small>{top.length}/100</small>
        </label>
        <label>
          Texte du bas
          <input
            value={bottom}
            maxLength={100}
            onChange={(event) => setBottom(event.target.value.toUpperCase())}
            placeholder="ET QUE PERSONNE N’A ÉCOUTÉ"
          />
          <small>{bottom.length}/100</small>
        </label>
        <button disabled={busy || (!top.trim() && !bottom.trim())}>
          <Send size={17} /> Envoyer mon mème
        </button>
      </form>
    </section>
  );
}

function Voting({
  lobby,
  busy,
  action,
}: {
  lobby: MakeItSioLobbyState;
  busy: boolean;
  action: (body: object) => Promise<unknown>;
}) {
  const rate = (
    meme: MakeItSioSubmission,
    value: MemeVoteValue,
    buddy = meme.viewerBuddy,
  ) =>
    action({
      action: "vote",
      code: lobby.code,
      submissionId: meme.id,
      value,
      buddy,
    });
  const targets = lobby.submissions.filter(
    (meme) => meme.memberId !== lobby.viewer.memberId,
  );
  return (
    <section className="mis-voting">
      <header>
        <div>
          <strong>
            {lobby.viewer.votesCast}/{lobby.viewer.votesRequired} mèmes évalués
          </strong>
          <span>
            <i
              style={{
                width: `${lobby.viewer.votesRequired ? (lobby.viewer.votesCast / lobby.viewer.votesRequired) * 100 : 0}%`,
              }}
            />
          </span>
        </div>
        <p>
          Vote positif, neutre ou négatif. Ton Meme Buddy ne peut être attribué
          qu’une fois.
        </p>
      </header>
      <div className="mis-vote-grid">
        {targets.map((meme) => (
          <article
            key={meme.id}
            className={meme.viewerVote !== null ? "rated" : ""}
          >
            <MemeCanvas meme={meme} />
            <div className="mis-vote-buttons">
              <button
                disabled={busy}
                className={meme.viewerVote === -1 ? "active down" : "down"}
                onClick={() => void rate(meme, -1)}
              >
                <Frown size={22} />
                <span>Bof</span>
              </button>
              <button
                disabled={busy}
                className={meme.viewerVote === 0 ? "active meh" : "meh"}
                onClick={() => void rate(meme, 0)}
              >
                <Meh size={22} />
                <span>Meh</span>
              </button>
              <button
                disabled={busy}
                className={meme.viewerVote === 1 ? "active up" : "up"}
                onClick={() => void rate(meme, 1)}
              >
                <Laugh size={22} />
                <span>Drôle</span>
              </button>
            </div>
            <button
              className={`mis-buddy ${meme.viewerBuddy ? "active" : ""}`}
              disabled={busy || meme.viewerVote === null}
              onClick={() =>
                void rate(meme, meme.viewerVote ?? 0, !meme.viewerBuddy)
              }
            >
              <Star
                size={16}
                fill={meme.viewerBuddy ? "currentColor" : "none"}
              />{" "}
              {meme.viewerBuddy ? "Ton Meme Buddy" : "Choisir comme Meme Buddy"}
            </button>
          </article>
        ))}
      </div>
      {lobby.viewer.votesCast === lobby.viewer.votesRequired && (
        <p className="mis-all-voted">
          <Check size={16} /> Tous tes votes sont enregistrés. En attente des
          autres joueurs…
        </p>
      )}
    </section>
  );
}

function Results({
  lobby,
  busy,
  action,
}: {
  lobby: MakeItSioLobbyState;
  busy: boolean;
  action: (body: object) => Promise<unknown>;
}) {
  const relaxed = lobby.mode === "RELAXED";
  const ranked = relaxed
    ? lobby.submissions
    : [...lobby.submissions].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return (
    <section className="mis-results">
      <div className="mis-results-grid">
        {ranked.map((meme, index) => (
          <article
            key={meme.id}
            className={!relaxed && index === 0 ? "winner" : ""}
          >
            {!relaxed && <span className="mis-rank">#{index + 1}</span>}
            <MemeCanvas meme={meme} />
            <footer>
              <div>
                <strong>{meme.authorName}</strong>
                <small>
                  {relaxed ? (
                    "Mode détendu · aucun score"
                  ) : (
                    <>
                      Vote {meme.baseScore ?? 0} · Buddy +{meme.buddyBonus ?? 0}
                    </>
                  )}
                </small>
              </div>
              {!relaxed && (
                <b>
                  {meme.score ?? 0}
                  <small> pts</small>
                </b>
              )}
            </footer>
          </article>
        ))}
      </div>
      {lobby.viewer.isHost ? (
        <button
          className="mis-next"
          disabled={busy}
          onClick={() => void action({ action: "continue", code: lobby.code })}
        >
          {lobby.round >= lobby.totalRounds ? (
            <>
              <Trophy size={19} />{" "}
              {relaxed ? "Terminer la galerie" : "Voir le podium final"}
            </>
          ) : (
            <>
              <Play size={19} /> Lancer la manche suivante
            </>
          )}
        </button>
      ) : (
        <p className="mis-all-voted">
          Le chef du salon lancera bientôt la suite.
        </p>
      )}
    </section>
  );
}

function Final({
  lobby,
  busy,
  action,
}: {
  lobby: MakeItSioLobbyState;
  busy: boolean;
  action: (body: object) => Promise<unknown>;
}) {
  const podium = [...lobby.members].sort((a, b) => b.score - a.score);
  const relaxed = lobby.mode === "RELAXED";
  return (
    <section className="mis-final">
      <Trophy size={54} />
      <span>{relaxed ? "GALERIE TERMINÉE" : "CLASSEMENT FINAL"}</span>
      <h2>
        {relaxed
          ? "Aucun perdant. Beaucoup de dossiers."
          : `${podium[0]?.name} remporte la partie !`}
      </h2>
      {!relaxed && (
        <div className="mis-podium">
          {podium.map((member, index) => (
            <article key={member.id} className={`place-${index + 1}`}>
              <b>#{index + 1}</b>
              <Avatar name={member.name} src={member.avatar} />
              <span>
                <strong>{member.name}</strong>
                <small>{member.score} points</small>
              </span>
              {index === 0 && <Crown size={20} />}
            </article>
          ))}
        </div>
      )}
      {lobby.viewer.isHost ? (
        <button
          disabled={busy}
          onClick={() => void action({ action: "rematch", code: lobby.code })}
        >
          <RotateCcw size={18} /> Rejouer avec le même groupe
        </button>
      ) : (
        <p>En attente d’une revanche du chef de salon.</p>
      )}
    </section>
  );
}

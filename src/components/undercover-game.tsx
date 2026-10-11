"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, BookOpen, Check, ChevronRight, Clipboard, Crown, DoorOpen, Eye, EyeOff, ImagePlus, LogIn, Play, RotateCcw, Settings2, ShieldQuestion, Sparkles, UserRound, Users, Vote, X } from "lucide-react";
import type { UndercoverLobbyState, UndercoverMember, WordMode } from "@/lib/undercover";

const winnerLabels = { CIVILS: "Les Civils gagnent", UNDERCOVERS: "Les Undercover gagnent", MISTER_WHITE: "Mister White gagne" } as const;
const roleLabels = { CIVIL: "Civil", UNDERCOVER: "Undercover", MISTER_WHITE: "Mister White" } as const;

async function compressAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) throw new Error("Choisis une image de moins de 8 Mo.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Image illisible.");
    const size = Math.min(image.naturalWidth, image.naturalHeight); const x = (image.naturalWidth - size) / 2; const y = (image.naturalHeight - size) / 2;
    context.drawImage(image, x, y, size, size, 0, 0, 256, 256);
    return canvas.toDataURL("image/webp", .76);
  } finally { URL.revokeObjectURL(url); }
}

function PlayerAvatar({ player }: { player: Pick<UndercoverMember, "name" | "avatar" | "eliminated"> }) {
  return <span className={`undercover-avatar ${player.eliminated ? "eliminated" : ""}`}>{player.avatar ? <img src={player.avatar} alt="" /> : <UserRound size={34} strokeWidth={1.5} />}{player.eliminated && <i><X size={28} /></i>}</span>;
}

export function UndercoverGame({ username, isAdmin }: { username: string; isAdmin: boolean }) {
  const [lobby, setLobby] = useState<UndercoverLobbyState | null>(null);
  const [name, setName] = useState(username);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secretVisible, setSecretVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const codeRef = useRef<string | null>(null);
  const profileSyncedCode = useRef<string | null>(null);

  useEffect(() => { codeRef.current = lobby?.code ?? null; }, [lobby?.code]);

  function acceptLobby(next: UndercoverLobbyState) {
    if (profileSyncedCode.current !== next.code) {
      const viewer = next.members.find((member) => member.id === next.viewer.memberId);
      if (viewer) { setName(viewer.name); setAvatar(viewer.avatar); }
      profileSyncedCode.current = next.code;
    }
    setLobby(next);
  }

  async function lobbyRequest(body: object, quiet = false) {
    if (!quiet) { setBusy(true); setError(""); }
    try {
      const response = await fetch("/api/undercover/lobby", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Action impossible.");
      if (result.lobby) { acceptLobby(result.lobby); localStorage.setItem("sioverse-undercover-lobby", result.lobby.code); }
      return result;
    } catch (cause) { if (!quiet) setError(cause instanceof Error ? cause.message : "Action impossible."); return null; }
    finally { if (!quiet) setBusy(false); }
  }

  useEffect(() => {
    const saved = localStorage.getItem("sioverse-undercover-lobby");
    if (!saved) return;
    fetch(`/api/undercover/lobby?code=${encodeURIComponent(saved)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) { localStorage.removeItem("sioverse-undercover-lobby"); return; }
      const result = await response.json(); acceptLobby(result.lobby);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!lobby?.code) return;
    const code = lobby.code;
    const refresh = () => fetch(`/api/undercover/lobby?code=${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => {
      if (response.status === 404) { setLobby(null); localStorage.removeItem("sioverse-undercover-lobby"); return; }
      if (response.ok) setLobby((await response.json()).lobby);
    }).catch(() => {});
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [lobby?.code]);

  useEffect(() => {
    const leave = () => {
      if (!codeRef.current) return;
      navigator.sendBeacon("/api/undercover/lobby", new Blob([JSON.stringify({ action: "leave", code: codeRef.current })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);

  async function pickAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try { setAvatar(await compressAvatar(file)); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Image invalide."); }
    event.target.value = "";
  }

  async function leave() {
    if (!lobby) return;
    await lobbyRequest({ action: "leave", code: lobby.code });
    localStorage.removeItem("sioverse-undercover-lobby"); profileSyncedCode.current = null; setLobby(null); setSecretVisible(false);
  }

  if (!lobby) return <main className="undercover-shell">
    <header className="undercover-topbar"><Link href="/sioverse"><ArrowLeft size={17} /> Tous les univers</Link><span className="undercover-logo"><ShieldQuestion size={20} /> UNDERCOVER</span>{isAdmin ? <Link href="/sioverse/undercover/mots"><Settings2 size={16} /> Gérer les mots</Link> : <button onClick={() => setRulesOpen(true)}><BookOpen size={16} /> Règles</button>}</header>
    <section className="undercover-entry">
      <div className="undercover-entry-copy"><span><Sparkles size={15} /> PERSONNE N’EST INNOCENT</span><h1>Trouve l’intrus.<br /><em>Garde ta couverture.</em></h1><p>Crée un salon privé ou rejoins tes amis avec leur code. Ton mot restera visible uniquement sur ton écran.</p><button className="undercover-rules-link" onClick={() => setRulesOpen(true)}><BookOpen size={16} /> Comment jouer ?</button></div>
      <div className="undercover-entry-panel">
        <div className="undercover-profile-setup"><div className="undercover-avatar-picker"><span>{avatar ? <img src={avatar} alt="Aperçu du profil" /> : <UserRound size={42} />}</span><label title="Choisir une photo"><ImagePlus size={16} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickAvatar} /></label></div><label>Ton pseudo<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={28} /></label></div>
        <button className="undercover-create" disabled={busy || name.trim().length < 2} onClick={() => void lobbyRequest({ action: "create", name, avatar })}><Play size={18} /> Créer un lobby<span>Tu seras maître de salle</span></button>
        <div className="undercover-or"><span />OU<span /></div>
        <form className="undercover-join" onSubmit={(event) => { event.preventDefault(); void lobbyRequest({ action: "join", code: joinCode, name, avatar }); }}><label>Code du lobby<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ABC123" minLength={6} maxLength={6} /></label><button disabled={busy || joinCode.length !== 6 || name.trim().length < 2}><LogIn size={18} /> Rejoindre</button></form>
        {error && <p className="undercover-error" role="alert">{error}</p>}
      </div>
    </section>
    {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
  </main>;

  const current = lobby.members.find((member) => member.id === lobby.currentTurnMemberId);
  const viewerTurn = lobby.currentTurnMemberId === lobby.viewer.memberId;
  const showSecret = lobby.phase !== "LOBBY";
  return <main className="undercover-shell in-lobby">
    <header className="undercover-topbar"><button onClick={() => void leave()}><DoorOpen size={17} /> Quitter le lobby</button><span className="undercover-logo"><ShieldQuestion size={20} /> UNDERCOVER</span><button onClick={() => setRulesOpen(true)}><BookOpen size={16} /> Règles</button></header>
    <section className="undercover-room-head"><div><span>SALON PRIVÉ</span><button className="undercover-code" onClick={() => { void navigator.clipboard.writeText(lobby.code); setCopied(true); window.setTimeout(() => setCopied(false), 1300); }}>{lobby.code}{copied ? <Check size={15} /> : <Clipboard size={15} />}</button><small>{lobby.members.length} joueur{lobby.members.length > 1 ? "s" : ""} connecté{lobby.members.length > 1 ? "s" : ""}</small></div><aside><b>{lobby.phase === "LOBBY" ? "Salle d’attente" : lobby.phase === "CLUE" ? `Tour ${lobby.round} · Indices` : lobby.phase === "VOTE" ? `Tour ${lobby.round} · Vote` : lobby.phase === "WHITE_GUESS" ? "Dernière chance" : "Partie terminée"}</b><p>{lobby.lastEvent}</p></aside></section>

    {showSecret && <section className={`undercover-secret ${lobby.viewer.misterWhite ? "white" : ""}`}><div><span>{lobby.viewer.misterWhite ? "TON OBJECTIF" : "TON MOT SECRET"}</span><strong>{secretVisible ? (lobby.viewer.misterWhite ? "Tu es Mister White" : lobby.viewer.secretWord) : "••••••••••"}</strong><small>{lobby.viewer.misterWhite ? "Observe les indices et improvise sans mot." : "Ne le montre à personne. Ton rôle n’est pas révélé."}</small></div><button onClick={() => setSecretVisible((value) => !value)}>{secretVisible ? <EyeOff size={19} /> : <Eye size={19} />} {secretVisible ? "Masquer" : "Révéler"}</button></section>}

    <div className="undercover-room-layout">
      <section className="undercover-players"><header><div><Users size={18} /><span>Les joueurs</span></div><small>{lobby.phase === "LOBBY" ? "Personnalisez vos profils avant le lancement" : "Indices précédents visibles sous chaque joueur"}</small></header><div className="undercover-player-grid">{lobby.members.map((player) => <PlayerCard key={player.id} player={player} lobby={lobby} onVote={() => void lobbyRequest({ action: "vote", code: lobby.code, targetId: player.id })} onKick={() => void lobbyRequest({ action: "kick", code: lobby.code, memberId: player.id })} busy={busy} />)}</div></section>

      <aside className="undercover-control-panel">
        {lobby.phase === "LOBBY" && <LobbyControls lobby={lobby} name={name} avatar={avatar} busy={busy} setName={setName} pickAvatar={pickAvatar} action={lobbyRequest} />}
        {lobby.phase === "CLUE" && <div className="undercover-turn-panel"><span className="panel-icon"><ChevronRight size={24} /></span><small>C’EST AU TOUR DE</small><h2>{current?.name ?? "…"}</h2>{viewerTurn && !lobby.viewer.eliminated ? <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const clue = new FormData(form).get("clue"); void lobbyRequest({ action: "clue", code: lobby.code, clue }).then((result) => result && form.reset()); }}><label>Ton indice<input name="clue" autoFocus required maxLength={40} placeholder="Un seul mot ou une courte idée…" /></label><button disabled={busy}>Valider mon indice <ChevronRight size={16} /></button></form> : <p>{lobby.viewer.eliminated ? "Tu observes la suite depuis les coulisses." : `En attente de l’indice de ${current?.name ?? "ce joueur"}.`}</p>}</div>}
        {lobby.phase === "VOTE" && <div className="undercover-vote-panel"><span className="panel-icon"><Vote size={24} /></span><small>CONSEIL DE LA PROMO</small><h2>Qui est l’intrus ?</h2><p>{lobby.viewer.eliminated ? "Les joueurs encore en lice votent." : lobby.viewer.hasVoted ? "Ton vote est enregistré. Tu peux encore le modifier." : "Clique sur un joueur actif pour voter."}</p><div className="undercover-vote-progress"><i style={{ width: `${lobby.votesRequired ? lobby.votesCast / lobby.votesRequired * 100 : 0}%` }} /><span>{lobby.votesCast} / {lobby.votesRequired} votes</span></div></div>}
        {lobby.phase === "WHITE_GUESS" && <div className="undercover-turn-panel white-guess"><span className="panel-icon"><ShieldQuestion size={24} /></span><small>MISTER WHITE EST DÉMASQUÉ</small><h2>Une dernière chance</h2>{viewerTurn ? <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; void lobbyRequest({ action: "guess", code: lobby.code, guess: new FormData(form).get("guess") }).then((result) => result && form.reset()); }}><label>Quel était le mot des Civils ?<input name="guess" autoFocus required maxLength={80} /></label><button disabled={busy}>Tenter ma chance</button></form> : <p>{current?.name} tente de deviner le mot Civil…</p>}</div>}
        {lobby.phase === "FINISHED" && <div className="undercover-finish"><span className="panel-icon"><Crown size={28} /></span><small>RÉSULTAT FINAL</small><h2>{lobby.winner ? winnerLabels[lobby.winner] : "Partie terminée"}</h2><p>Les rôles de chacun sont maintenant révélés.</p>{lobby.viewer.isHost && <button disabled={busy} onClick={() => void lobbyRequest({ action: "rematch", code: lobby.code })}><RotateCcw size={16} /> Préparer la revanche</button>}</div>}
        {error && <p className="undercover-error" role="alert">{error}</p>}
      </aside>
    </div>
    {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
  </main>;
}

function PlayerCard({ player, lobby, onVote, onKick, busy }: { player: UndercoverMember; lobby: UndercoverLobbyState; onVote: () => void; onKick: () => void; busy: boolean }) {
  const canVote = lobby.phase === "VOTE" && !lobby.viewer.eliminated && !player.eliminated && player.id !== lobby.viewer.memberId;
  return <article className={`undercover-player ${player.eliminated ? "eliminated" : ""} ${lobby.currentTurnMemberId === player.id ? "current" : ""} ${canVote ? "votable" : ""}`} onClick={() => canVote && onVote()}>
    <div className="undercover-player-top"><PlayerAvatar player={player} /><div><strong>{player.name}{player.id === lobby.viewer.memberId && <small> TOI</small>}</strong><span>{player.isHost && <><Crown size={11} /> Maître de salle</>}{!player.isHost && (player.online ? "En ligne" : "Hors ligne")}</span></div>{lobby.viewer.isHost && lobby.phase === "LOBBY" && !player.isHost && <button disabled={busy} onClick={(event) => { event.stopPropagation(); onKick(); }} title="Retirer du salon"><X size={14} /></button>}</div>
    {player.revealedRole && <b className={`undercover-role ${player.revealedRole.toLowerCase()}`}>{roleLabels[player.revealedRole]}</b>}
    <div className="undercover-clue-history">{player.clues.length ? player.clues.map((clue) => <span key={clue.id}><i>T{clue.round}</i>{clue.text}</span>) : <small>Aucun indice pour l’instant</small>}</div>
    {canVote && <button className="undercover-vote-player"><Vote size={14} /> Voter contre {player.name}</button>}
  </article>;
}

function LobbyControls({ lobby, name, avatar, busy, setName, pickAvatar, action }: { lobby: UndercoverLobbyState; name: string; avatar: string | null; busy: boolean; setName: (value: string) => void; pickAvatar: (event: ChangeEvent<HTMLInputElement>) => void; action: (body: object) => Promise<unknown> }) {
  const [mode, setMode] = useState<WordMode>(lobby.wordMode); const [undercoverCount, setUndercoverCount] = useState(lobby.undercoverCount); const [misterWhite, setMisterWhite] = useState(lobby.misterWhite);
  return <div className="undercover-lobby-controls"><small>AVANT LA PARTIE</small><h2>{lobby.viewer.isHost ? "Configure la mission" : "Prépare ton profil"}</h2><div className="undercover-mini-profile"><span>{avatar ? <img src={avatar} alt="" /> : <UserRound size={24} />}</span><label><input value={name} maxLength={28} onChange={(event) => setName(event.target.value)} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickAvatar} /></label><button disabled={busy || name.trim().length < 2} onClick={() => void action({ action: "profile", code: lobby.code, name, avatar })}>Enregistrer</button></div>{lobby.viewer.isHost ? <><label className="undercover-setting">Dictionnaire<select value={mode} onChange={(event) => setMode(event.target.value as WordMode)}><option value="NORMAL">Mots classiques</option><option value="SIO">Mots SIO</option></select></label><label className="undercover-setting">Nombre d’Undercover<input type="number" min={1} max={Math.max(1, lobby.members.length - (misterWhite ? 3 : 2))} value={undercoverCount} onChange={(event) => setUndercoverCount(Number(event.target.value))} /></label><button className={`undercover-white-toggle ${misterWhite ? "active" : ""}`} onClick={() => setMisterWhite((value) => !value)}><span><ShieldQuestion size={17} /> Mister White</span><i /></button><button className="undercover-save-settings" disabled={busy} onClick={() => void action({ action: "settings", code: lobby.code, wordMode: mode, undercoverCount, misterWhite })}><Settings2 size={15} /> Appliquer les réglages</button><button className="undercover-launch" disabled={busy || lobby.members.length < 3} onClick={() => void action({ action: "start", code: lobby.code })}><Play size={18} /> Lancer la partie<span>{lobby.members.length < 3 ? "3 joueurs minimum" : `${lobby.members.length} joueurs prêts`}</span></button></> : <p className="undercover-waiting"><span /><b>En attente du maître de salle</b>La partie commencera dès que les réglages seront prêts.</p>}</div>;
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return <div className="undercover-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="undercover-rules" role="dialog" aria-modal="true" aria-label="Règles d’Undercover"><button className="undercover-modal-close" onClick={onClose}><X size={18} /></button><span><BookOpen size={17} /> RÈGLES DU JEU</span><h2>Parlez juste assez.<br />Jamais trop.</h2><ol><li><b>Les Civils</b> reçoivent tous le même mot.</li><li><b>Les Undercover</b> reçoivent un mot proche. Ils ne savent pas explicitement qu’ils sont Undercover.</li><li><b>Mister White</b> ne reçoit aucun mot et doit improviser grâce aux indices.</li><li>À tour de rôle, chacun donne un indice sans prononcer son mot.</li><li>Après chaque tour, les joueurs votent pour éliminer le suspect principal.</li><li>Les Civils gagnent en éliminant tous les intrus. Les Undercover gagnent lorsqu’ils deviennent aussi nombreux que les Civils. Mister White gagne s’il devine le mot Civil après son élimination.</li></ol><button className="undercover-rules-ok" onClick={onClose}>Mission comprise <Check size={16} /></button></section></div>;
}

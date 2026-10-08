"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Monitor, UserRound } from "lucide-react";

export function LoginScreen({ firstAccount, databaseReady }: { firstAccount: boolean; databaseReady: boolean }) {
  const [mode, setMode] = useState<"login" | "register">(firstAccount ? "register" : "login");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booting, setBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootComplete, setBootComplete] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const timer = window.setTimeout(() => { setBootProgress(100); setBooting(false); }, 0);
      return () => window.clearTimeout(timer);
    }
    let frame = 0;
    let finishTimer = 0;
    const started = performance.now();
    const duration = 2600;
    function tick(now: number) {
      const progress = Math.min(100, Math.floor(((now - started) / duration) * 100));
      setBootProgress(progress);
      if (progress < 100) frame = window.requestAnimationFrame(tick);
      else { setBootComplete(true); finishTimer = window.setTimeout(() => setBooting(false), 220); }
    }
    frame = window.requestAnimationFrame(tick);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(finishTimer); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (mode === "register" && password !== data.get("confirm")) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setBusy(true);
    try {
      const payload = mode === "register"
        ? { username: data.get("username"), email: data.get("email"), password, inviteCode: data.get("inviteCode") ?? undefined }
        : { identifier: data.get("identifier"), password };
      const response = await fetch(`/api/auth/${mode === "register" ? "register" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Connexion impossible.");
      window.location.replace("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connexion impossible."); setBusy(false); }
  }

  return <main className={`login-screen ${booting ? "is-booting" : "is-unlocked"}`}>
    <div className="login-backdrop" />
    <div className="login-orb login-orb-one" /><div className="login-orb login-orb-two" />
    {booting && <div className={`os-boot ${bootComplete ? "is-complete" : ""}`} role="status" aria-label="Démarrage de SIOVerse"><div className="os-boot-emblem" aria-hidden="true"><svg viewBox="0 0 144 144" fill="none"><defs><linearGradient id="boot-gradient" x1="15" y1="8" x2="133" y2="133" gradientUnits="userSpaceOnUse"><stop stopColor="#9BF7F0" /><stop offset=".48" stopColor="#7BAEFF" /><stop offset="1" stopColor="#D681FF" /></linearGradient></defs><path d="M72 7C37 7 9 35 9 70s28 63 63 63 63-28 63-63S107 7 72 7Z" stroke="url(#boot-gradient)" strokeWidth="2" strokeDasharray="185 24 45 145" /><path d="M35 86c12 13 30 17 44 10 14-7 14-23-2-27L61 65c-16-4-16-20-2-26 13-6 29-2 39 8" stroke="url(#boot-gradient)" strokeWidth="12" strokeLinecap="round" /><path d="m76 86 13 19 24-43" stroke="#C6A3FF" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /><path d="m116 25 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="#B7F9F0" /></svg></div><strong className="os-boot-wordmark">SIO<span>VERSE</span><i>✳</i></strong><p>Ton univers prend vie.</p><div className="os-boot-progress" role="progressbar" aria-label="Chargement de SIOVerse" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bootProgress}><span style={{ width: `${bootProgress}%` }} /></div><div className="os-boot-progress-copy"><small>INITIALISATION DE TON ESPACE</small><strong>{bootProgress}%</strong></div></div>}
    <div className="login-topline"><span className="login-brand"><Monitor size={18} /> SIO OS</span><span>ESPACE DE LA CLASSE · BTS SIO</span></div>
    <section className="login-panel" aria-label="Ouverture de session">
      <div className="login-avatar"><UserRound size={35} strokeWidth={1.5} /></div>
      <span className="login-eyebrow">{mode === "register" ? "CRÉATION D’UN PROFIL" : "SESSION VERROUILLÉE"}</span>
      <h1>{mode === "register" ? "Créer un profil" : "Bienvenue sur SIO OS"}<span>.</span></h1>
      <p>{mode === "register" ? firstAccount ? "Tu crées le premier compte de ce bureau : il recevra les droits administrateur." : "Rejoins l’espace de ta classe avec le code d’invitation reçu d’un administrateur." : "Retrouve ton bureau, tes cours et l’emploi du temps de la classe."}</p>
      {!databaseReady && <div className="login-warning" role="alert">PostgreSQL n’est pas disponible. Démarre-le avant de créer ou d’ouvrir une session.</div>}
      <form className="login-form" onSubmit={submit}>
        {mode === "register" ? <><label>Identifiant<input name="username" autoComplete="username" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}" placeholder="ex. ary" /></label><label>Adresse de classe<input name="email" type="email" autoComplete="email" required maxLength={254} pattern=".+@ortmontreuil\.fr" placeholder="prenom.nom@ortmontreuil.fr" /></label></> : <label>Profil<input name="identifier" autoComplete="username" required placeholder="Identifiant ou adresse de classe" /></label>}
        {mode === "register" && !firstAccount && <label>Code d’invitation<input name="inviteCode" autoComplete="off" required maxLength={22} placeholder="Code fourni par un administrateur" /></label>}
        <label>Mot de passe<span className="login-password"><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 4 : 1} maxLength={128} placeholder={mode === "register" ? "4 caractères minimum" : "Ton mot de passe"} /><button type="button" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        {mode === "register" && <label>Confirmer le mot de passe<input name="confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={4} maxLength={128} placeholder="Répète ton mot de passe" /></label>}
        {error && <div className="login-error" role="alert"><LockKeyhole size={15} />{error}</div>}
        <button className="login-submit" disabled={busy || !databaseReady}>{busy ? "Un instant…" : mode === "register" ? "Créer et ouvrir ma session" : "Se connecter"}<ArrowRight size={18} /></button>
      </form>
      <div className="login-switch">{mode === "register" ? "Déjà un compte ?" : "Pas encore de compte ?"}<button type="button" onClick={() => { setError(""); setMode(mode === "register" ? "login" : "register"); }}>{mode === "register" ? "Se connecter" : "Créer un compte"}</button></div>
    </section>
    <div className="login-footnote">SIOVerse · Verrouillage de session · Espace BTS SIO</div>
  </main>;
}

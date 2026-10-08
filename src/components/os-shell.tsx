"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BatteryFull,
  Check,
  ChevronRight,
  Grid2X2,
  Image as ImageIcon,
  KeyRound,
  Maximize2,
  Minus,
  Monitor,
  Pause,
  Play,
  Settings2,
  LogOut,
  Trash2,
  Upload,
  Wifi,
  X,
} from "lucide-react";
import { apps, type AppSlug } from "@/lib/apps";
import type { SessionUser } from "@/lib/auth";
import { CourseGlance } from "./course-glance";
import { StatusClock } from "./status-clock";

const wallpapers = [
  { name: "Aurore", mood: "Horizon liquide", file: "/wallpapers/aurora.gif" },
  { name: "Nocturne", mood: "Ville sous la pluie", file: "/wallpapers/nocturne.gif" },
  { name: "Matrix", mood: "Flux numérique", file: "/wallpapers/matrix.gif" },
  { name: "Synthwave", mood: "Soleil rétro et néons", file: "/wallpapers/synthwave.gif" },
  { name: "Nébuleuse", mood: "Poussières d’étoiles", file: "/wallpapers/nebula.gif" },
  { name: "Circuit", mood: "Impulsions électriques", file: "/wallpapers/circuit.gif" },
  { name: "Océan", mood: "Vagues lumineuses", file: "/wallpapers/ocean.gif" },
] as const;

type WallpaperPreference = { index: number; automatic: boolean };
type CustomWallpaper = { id: string; name: string; mood: string; file: string };
const preferenceKey = "sio-os-wallpaper-v1";

export function OsShell({ children, active, user, desktopCourses = [] }: { children?: React.ReactNode; active?: AppSlug; user: SessionUser; desktopCourses?: { id: string; title: string; location: string; start: string; end: string }[] }) {
  const router = useRouter();
  const personalPreferenceKey = `${preferenceKey}:${user.id}`;
  const [wallpaper, setWallpaper] = useState(0);
  const [customWallpapers, setCustomWallpapers] = useState<CustomWallpaper[]>([]);
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperError, setWallpaperError] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [ready, setReady] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const passwordDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/wallpapers").then((response) => response.ok ? response.json() : null).then((result) => {
      if (!live || !result?.wallpapers) return;
      const items = result.wallpapers as CustomWallpaper[];
      setCustomWallpapers(items);
      try {
        const saved = JSON.parse(window.localStorage.getItem(personalPreferenceKey) ?? "null") as WallpaperPreference | null;
        if (saved && Number.isInteger(saved.index) && saved.index >= 0) setWallpaper(saved.index < wallpapers.length + items.length ? saved.index : 0);
      } catch { /* Keep the default wallpaper. */ }
    }).catch(() => {});
    return () => { live = false; };
  }, [personalPreferenceKey]);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(personalPreferenceKey) ?? "null") as WallpaperPreference | null;
        if (saved && Number.isInteger(saved.index) && saved.index >= 0) {
          setWallpaper(saved.index);
          setAutomatic(saved.automatic !== false);
        }
      } catch {
        // A damaged preference should not stop the desktop from opening.
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [personalPreferenceKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(personalPreferenceKey, JSON.stringify({ index: wallpaper, automatic }));
    } catch {
      // The wallpaper still works when browser storage is unavailable.
    }
  }, [wallpaper, automatic, ready, personalPreferenceKey]);

  useEffect(() => {
    if (!automatic) return;
    const timer = window.setInterval(() => setWallpaper((current) => (current + 1) % (wallpapers.length + customWallpapers.length)), 35_000);
    return () => window.clearInterval(timer);
  }, [automatic, customWallpapers.length]);

  const allWallpapers = [...wallpapers, ...customWallpapers];
  const selected = allWallpapers[wallpaper] ?? wallpapers[0];
  const visibleApps = apps.filter((app) => !("adminOnly" in app && app.adminOnly) || user.role === "ADMIN");
  const activeApp = apps.find((app) => app.slug === active);
  const ActiveIcon = activeApp?.icon;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/connexion");
    router.refresh();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("newPassword") !== data.get("confirmPassword")) { setPasswordError("Les deux nouveaux mots de passe ne correspondent pas."); return; }
    setPasswordBusy(true); setPasswordError("");
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Modification impossible.");
      form.reset(); passwordDialog.current?.close(); setPasswordNotice("Mot de passe modifié. Tes autres sessions ont été fermées.");
      window.setTimeout(() => setPasswordNotice(""), 5000);
    } catch (cause) { setPasswordError(cause instanceof Error ? cause.message : "Modification impossible."); }
    finally { setPasswordBusy(false); }
  }

  async function addWallpaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setWallpaperBusy(true); setWallpaperError("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/wallpapers", { method: "POST", body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Import impossible.");
      setCustomWallpapers((items) => [...items, result.wallpaper as CustomWallpaper]);
      setWallpaper(wallpapers.length + customWallpapers.length); setAutomatic(false); form.reset();
    } catch (cause) { setWallpaperError(cause instanceof Error ? cause.message : "Import impossible."); }
    finally { setWallpaperBusy(false); }
  }

  async function removeWallpaper(item: CustomWallpaper) {
    if (!window.confirm(`Supprimer le fond d’écran « ${item.name} » ?`)) return;
    setWallpaperBusy(true); setWallpaperError("");
    try {
      const response = await fetch("/api/wallpapers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      if (!response.ok) throw new Error("Suppression impossible.");
      setCustomWallpapers((items) => items.filter((current) => current.id !== item.id));
      setWallpaper(0);
    } catch (cause) { setWallpaperError(cause instanceof Error ? cause.message : "Suppression impossible."); }
    finally { setWallpaperBusy(false); }
  }

  return (
    <main className="os-desktop">
      <div className="os-wallpaper" style={{ backgroundImage: `url(${selected.file})` }} />
      <div className="os-wallpaper-tint" />

      <div className="desktop-shortcuts" aria-label="Raccourcis du bureau">
        {visibleApps.map((app) => (
          <Link key={app.slug} href={`/${app.slug}`} className={`desktop-shortcut ${app.slug === "sioverse" ? "community-shortcut" : ""}`}>
            <span className={`shortcut-symbol ${app.color}`}><app.icon size={33} strokeWidth={1.7} /></span>
            <span>{app.label}</span>
          </Link>
        ))}
      </div>

      {!active && <section className="desktop-widget" aria-label="Bienvenue sur SIO OS">
        <span className="widget-overline"><span className="live-dot" /> SIO OS · SESSION ACTIVE</span>
        <h1>Votre espace,<br /><em>vos repères.</em></h1>
        <p>Ouvrez une application depuis le bureau ou la barre des tâches.</p>
        <CourseGlance courses={desktopCourses} />
        <Link href="/sioverse" className="widget-link">Explorer SIOVerse.exe <ChevronRight size={18} /></Link>
      </section>}

      {active && <section className={`os-window ${active === "agenda" ? "agenda-window" : active === "ressources" || active === "controles" || active === "utilisateurs" ? "ent-window" : ""} ${maximized ? "maximized" : ""}`} aria-label={`Fenêtre ${activeApp?.label}`}>
        <div className="os-titlebar">
          <div className="window-identity"><span className="window-mini-icon">{ActiveIcon && <ActiveIcon size={17} />}</span><span>{activeApp?.label} — SIO OS</span></div>
          <div className="window-actions"><Link href="/" aria-label="Réduire la fenêtre"><Minus size={16} /></Link><button aria-label={maximized ? "Restaurer la fenêtre" : "Agrandir la fenêtre"} onClick={() => setMaximized((value) => !value)}><Maximize2 size={15} /></button><Link href="/" className="close-window" aria-label="Fermer la fenêtre"><X size={18} /></Link></div>
        </div>
        <div className="os-window-content">{children}</div>
      </section>}

      {settingsOpen && <aside className="wallpaper-panel" aria-label="Personnalisation du bureau">
        <div className="flyout-heading"><span><ImageIcon size={18} /> Fond d’écran</span><button onClick={() => setSettingsOpen(false)} aria-label="Fermer la personnalisation"><X size={17} /></button></div>
        <p>Choisissez une ambiance animée pour votre bureau.</p>
        <div className="wallpaper-choices">{allWallpapers.map((item, index) => <div key={item.file} className={`wallpaper-choice ${wallpaper === index ? "selected" : ""}`}><button type="button" className="wallpaper-select" onClick={() => { setWallpaper(index); setAutomatic(false); }} aria-pressed={wallpaper === index}><span className="wallpaper-preview" style={{ backgroundImage: `url(${item.file})` }} /><span className="wallpaper-choice-copy"><strong>{item.name}</strong><small>{item.mood}</small></span>{wallpaper === index && <Check size={16} />}</button>{"id" in item && <button type="button" className="wallpaper-delete" aria-label={`Supprimer ${item.name}`} title="Supprimer ce GIF" disabled={wallpaperBusy} onClick={() => removeWallpaper(item)}><Trash2 size={14} /></button>}</div>)}</div>
        <form className="wallpaper-upload" onSubmit={addWallpaper}><strong><Upload size={15} /> Ajouter ton GIF</strong><input name="name" required minLength={2} maxLength={60} placeholder="Nom du fond d’écran" aria-label="Nom du fond d’écran" /><input name="gif" type="file" accept="image/gif,.gif" required aria-label="Fichier GIF" /><button type="submit" disabled={wallpaperBusy}>{wallpaperBusy ? "Import…" : "Importer le GIF"}</button>{wallpaperError && <small role="alert">{wallpaperError}</small>}</form>
        <button className="rotation-toggle" onClick={() => setAutomatic((value) => !value)} aria-pressed={automatic}>{automatic ? <Pause size={17} /> : <Play size={17} />}<span><strong>Rotation automatique</strong><small>{automatic ? "Nouvelle ambiance toutes les 35 secondes" : "Fond d’écran fixe"}</small></span><span className={`toggle-track ${automatic ? "on" : ""}`} /></button>
      </aside>}

      {startOpen && <aside className="start-menu" aria-label="Menu Démarrer">
        <div className="start-heading"><span className="start-mark"><Grid2X2 size={20} /></span><div><strong>{user.username}</strong><small>{user.role === "ADMIN" ? "Administrateur" : "Membre de la classe"} · SIO OS</small></div></div>
        <div className="start-apps">{visibleApps.map((app) => <Link key={app.slug} href={`/${app.slug}`} onClick={() => setStartOpen(false)}><span className={`start-app-icon ${app.color}`}><app.icon size={19} /></span><span>{app.label}</span><ChevronRight size={15} /></Link>)}</div>
        <button className="start-settings" onClick={() => { setStartOpen(false); setSettingsOpen(true); }}><Settings2 size={17} /> Personnaliser le bureau</button>
        <button className="start-settings" onClick={() => { setStartOpen(false); setPasswordError(""); passwordDialog.current?.showModal(); }}><KeyRound size={17} /> Modifier mon mot de passe</button>
        <button className="start-settings" onClick={logout}><LogOut size={17} /> Se déconnecter</button>
      </aside>}

      {passwordNotice && <div className="os-toast" role="status">{passwordNotice}</div>}
      <dialog ref={passwordDialog} className="ent-dialog os-password-dialog" onClose={() => setPasswordError("")}><form method="dialog" className="ent-dialog-close"><button aria-label="Fermer"><X size={18} /></button></form><div className="ent-dialog-heading"><span><KeyRound size={20} /></span><h3>Mot de passe de session</h3><p>Le changer fermera tes autres sessions ouvertes.</p></div><form className="ent-form" onSubmit={changePassword}><label>Mot de passe actuel<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>Nouveau mot de passe<input name="newPassword" type="password" required minLength={4} maxLength={128} autoComplete="new-password" /></label><label>Confirmer le nouveau mot de passe<input name="confirmPassword" type="password" required minLength={4} maxLength={128} autoComplete="new-password" /></label>{passwordError && <p className="ent-error" role="alert">{passwordError}</p>}<button className="ent-primary" disabled={passwordBusy}>{passwordBusy ? "Modification…" : "Enregistrer le mot de passe"}</button></form></dialog>

      <nav className="taskbar" aria-label="Barre des tâches">
        <div className="taskbar-left"><button className={`start-button ${startOpen ? "pressed" : ""}`} onClick={() => { setStartOpen((value) => !value); setSettingsOpen(false); }} aria-label="Ouvrir le menu Démarrer" aria-expanded={startOpen}><Grid2X2 size={22} fill="currentColor" strokeWidth={1} /></button><span className="taskbar-divider" />{visibleApps.map((app) => <Link key={app.slug} href={`/${app.slug}`} className={`taskbar-app ${active === app.slug ? "active" : ""}`} aria-label={app.label} title={app.label}><app.icon size={22} /></Link>)}</div>
        <div className="taskbar-right"><button className="taskbar-wallpaper" onClick={() => { setSettingsOpen((value) => !value); setStartOpen(false); }} aria-label="Changer le fond d’écran" aria-expanded={settingsOpen}><Monitor size={17} /><span>Fond d’écran</span></button><span className="taskbar-divider" /><Wifi size={17} /><BatteryFull size={18} /><StatusClock /></div>
      </nav>
    </main>
  );
}

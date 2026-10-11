"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  BatteryFull,
  Check,
  ChevronRight,
  Grid2X2,
  Image as ImageIcon,
  Download,
  KeyRound,
  LockKeyhole,
  Maximize2,
  Minus,
  Monitor,
  Moon,
  Pause,
  Play,
  Settings2,
  Sun,
  Paintbrush,
  RefreshCw,
  LogOut,
  Trash2,
  Upload,
  Wifi,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { apps, type AppSlug } from "@/lib/apps";
import type { SessionUser } from "@/lib/auth";
import type { EntCatalog } from "@/lib/ent";
import { CourseGlance } from "./course-glance";
import { NotificationCenter } from "./notification-center";
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

type WallpaperPreference = { index: number; automatic: boolean; accent?: string; sounds?: boolean; theme?: "light" | "night"; iconSize?: "compact" | "normal" | "large" };
type CustomWallpaper = { id: string; name: string; mood: string; file: string };
type WindowGeometry = { x: number; y: number; width: number; height: number };
type ContextMenu = { x: number; y: number };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const preferenceKey = "sio-os-wallpaper-v1";
const accentChoices = ["#42a5e8", "#8f7be8", "#45bfa5", "#ef9b52", "#e4669b"];

export function OsShell({ children, appWindows, active, user, desktopCourses = [], desktopCatalog }: { children?: React.ReactNode; appWindows?: Partial<Record<AppSlug, React.ReactNode>>; active?: AppSlug; user: SessionUser; desktopCourses?: { id: string; title: string; location: string; start: string; end: string; status?: "confirmed" | "cancelled" | "moved" | "modified" }[]; desktopCatalog?: EntCatalog }) {
  const router = useRouter();
  const personalPreferenceKey = `${preferenceKey}:${user.id}`;
  const [wallpaper, setWallpaper] = useState(0);
  const [customWallpapers, setCustomWallpapers] = useState<CustomWallpaper[]>([]);
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [wallpaperError, setWallpaperError] = useState("");
  const [automatic, setAutomatic] = useState(true);
  const [accent, setAccent] = useState(accentChoices[0]);
  const [sounds, setSounds] = useState(false);
  const [theme, setTheme] = useState<"light" | "night">("light");
  const [iconSize, setIconSize] = useState<"compact" | "normal" | "large">("normal");
  const [startOpen, setStartOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openApps, setOpenApps] = useState<AppSlug[]>(active ? [active] : []);
  const [focusedApp, setFocusedApp] = useState<AppSlug | undefined>(active);
  const [maximizedApps, setMaximizedApps] = useState<Set<AppSlug>>(() => new Set());
  const [minimizedApps, setMinimizedApps] = useState<Set<AppSlug>>(() => new Set());
  const [geometries, setGeometries] = useState<Partial<Record<AppSlug, WindowGeometry>>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [locked, setLocked] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [ready, setReady] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const passwordDialog = useRef<HTMLDialogElement>(null);
  const windowRefs = useRef(new Map<AppSlug, HTMLElement>());
  const gesture = useRef<{ app: AppSlug; mode: "move" | "resize"; startX: number; startY: number; initial: WindowGeometry } | null>(null);

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
          if (saved.accent && accentChoices.includes(saved.accent)) setAccent(saved.accent);
          setSounds(saved.sounds === true);
          if (saved.theme === "night" || saved.theme === "light") setTheme(saved.theme);
          if (saved.iconSize === "compact" || saved.iconSize === "normal" || saved.iconSize === "large") setIconSize(saved.iconSize);
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
      window.localStorage.setItem(personalPreferenceKey, JSON.stringify({ index: wallpaper, automatic, accent, sounds, theme, iconSize }));
    } catch {
      // The wallpaper still works when browser storage is unavailable.
    }
  }, [wallpaper, automatic, accent, sounds, theme, iconSize, ready, personalPreferenceKey]);

  useEffect(() => {
    if (!openApps.length || window.innerWidth < 720) return;
    const restore = window.setTimeout(() => {
      setGeometries((current) => {
        const next = { ...current };
        for (const [index, app] of openApps.entries()) {
          if (next[app]) continue;
          try {
            const saved = JSON.parse(window.localStorage.getItem(`sio-os-window-v1:${user.id}:${app}`) ?? "null") as WindowGeometry | null;
            if (saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) {
              next[app] = {
                x: Math.max(0, Math.min(saved.x, window.innerWidth - 180)),
                y: Math.max(0, Math.min(saved.y, window.innerHeight - 110)),
                width: Math.min(saved.width, window.innerWidth),
                height: Math.min(saved.height, window.innerHeight - 58),
              };
            } else {
              next[app] = { x: 70 + index * 28, y: 36 + index * 26, width: Math.min(1100, window.innerWidth - 140), height: Math.min(790, window.innerHeight - 120) };
            }
          } catch { /* Use the CSS default geometry. */ }
        }
        return next;
      });
    }, 0);
    return () => window.clearTimeout(restore);
  }, [openApps, user.id]);

  useEffect(() => {
    for (const [app, geometry] of Object.entries(geometries) as [AppSlug, WindowGeometry][]) {
      try { window.localStorage.setItem(`sio-os-window-v1:${user.id}:${app}`, JSON.stringify(geometry)); } catch { /* La fenêtre reste utilisable sans stockage local. */ }
    }
  }, [geometries, user.id]);

  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  useEffect(() => {
    if (!sounds) return;
    const play = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest("button,a")) return;
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.frequency.value = 520; gain.gain.setValueAtTime(.025, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .045);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .05);
      oscillator.addEventListener("ended", () => void context.close(), { once: true });
    };
    document.addEventListener("pointerdown", play);
    return () => document.removeEventListener("pointerdown", play);
  }, [sounds]);

  useEffect(() => {
    if (!automatic) return;
    const timer = window.setInterval(() => setWallpaper((current) => (current + 1) % (wallpapers.length + customWallpapers.length)), 35_000);
    return () => window.clearInterval(timer);
  }, [automatic, customWallpapers.length]);

  const allWallpapers = [...wallpapers, ...customWallpapers];
  const selected = allWallpapers[wallpaper] ?? wallpapers[0];
  const visibleApps = apps.filter((app) => !("adminOnly" in app && app.adminOnly) || user.role === "ADMIN");
  const activeApp = apps.find((app) => app.slug === focusedApp);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/connexion");
    router.refresh();
  }

  async function unlockSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setUnlockBusy(true); setUnlockError("");
    const form = event.currentTarget;
    const password = new FormData(form).get("password");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: user.username, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Mot de passe incorrect.");
      form.reset(); setLocked(false);
    } catch (cause) { setUnlockError(cause instanceof Error ? cause.message : "Déverrouillage impossible."); }
    finally { setUnlockBusy(false); }
  }

  function lockSession() {
    setLocked(true); setUnlockError(""); setStartOpen(false); setSettingsOpen(false); setContextMenu(null);
  }

  function openWindow(app: AppSlug) {
    if (!appWindows?.[app]) { router.push(`/${app}`); return; }
    setOpenApps((current) => current.includes(app) ? current : [...current, app]);
    setFocusedApp(app);
    setMinimizedApps((current) => { const next = new Set(current); next.delete(app); return next; });
    setStartOpen(false);
  }

  function closeWindow(app: AppSlug) {
    setOpenApps((current) => current.filter((item) => item !== app));
    setMinimizedApps((current) => { const next = new Set(current); next.delete(app); return next; });
    setMaximizedApps((current) => { const next = new Set(current); next.delete(app); return next; });
    setFocusedApp((current) => current === app ? openApps.filter((item) => item !== app).at(-1) : current);
  }

  function toggleMinimized(app: AppSlug) {
    setMinimizedApps((current) => { const next = new Set(current); if (next.has(app)) next.delete(app); else next.add(app); return next; });
    setFocusedApp(app);
  }

  function toggleMaximized(app: AppSlug) {
    setMaximizedApps((current) => { const next = new Set(current); if (next.has(app)) next.delete(app); else next.add(app); return next; });
    setMinimizedApps((current) => { const next = new Set(current); next.delete(app); return next; });
    setFocusedApp(app);
  }

  function beginWindowGesture(event: ReactPointerEvent<HTMLElement>, app: AppSlug, mode: "move" | "resize") {
    if (maximizedApps.has(app) || window.innerWidth < 720 || event.button !== 0) return;
    if (mode === "move" && (event.target as Element).closest("button,a")) return;
    const bounds = windowRefs.current.get(app)?.getBoundingClientRect();
    if (!bounds) return;
    const initial = { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
    gesture.current = { app, mode, startX: event.clientX, startY: event.clientY, initial };
    event.currentTarget.setPointerCapture(event.pointerId); setGeometries((current) => ({ ...current, [app]: initial })); setFocusedApp(app);
  }

  function updateWindowGesture(event: ReactPointerEvent<HTMLElement>) {
    const activeGesture = gesture.current;
    if (!activeGesture) return;
    const deltaX = event.clientX - activeGesture.startX; const deltaY = event.clientY - activeGesture.startY;
    if (activeGesture.mode === "move") {
      setGeometries((current) => ({ ...current, [activeGesture.app]: { ...activeGesture.initial, x: Math.min(window.innerWidth - 160, Math.max(0, activeGesture.initial.x + deltaX)), y: Math.min(window.innerHeight - 100, Math.max(0, activeGesture.initial.y + deltaY)) } }));
    } else {
      setGeometries((current) => ({ ...current, [activeGesture.app]: { ...activeGesture.initial, width: Math.min(window.innerWidth - activeGesture.initial.x, Math.max(620, activeGesture.initial.width + deltaX)), height: Math.min(window.innerHeight - 58 - activeGesture.initial.y, Math.max(420, activeGesture.initial.height + deltaY)) } }));
    }
  }

  function endWindowGesture(event: ReactPointerEvent<HTMLElement>) {
    if (gesture.current) event.currentTarget.releasePointerCapture(event.pointerId);
    gesture.current = null;
  }

  function openContextMenu(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as Element).closest(".os-window,.taskbar,.start-menu,.wallpaper-panel")) return;
    event.preventDefault();
    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 215), y: Math.min(event.clientY, window.innerHeight - 245) });
    setStartOpen(false); setSettingsOpen(false);
  }

  function closeDesktopMenus(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as Element).closest(".os-window,.taskbar,.start-menu,.wallpaper-panel,.desktop-context-menu")) return;
    setContextMenu(null);
    setStartOpen(false);
    setSettingsOpen(false);
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
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
    <main className={`os-desktop os-theme-${theme} os-icons-${iconSize}`} style={{ "--os-accent": accent } as CSSProperties} onContextMenu={openContextMenu} onClick={closeDesktopMenus}>
      <div className="os-wallpaper" style={{ backgroundImage: `url(${selected.file})` }} />
      <div className="os-wallpaper-tint" />

      <div className="desktop-shortcuts" aria-label="Raccourcis du bureau">
        {visibleApps.map((app) => (
          <Link key={app.slug} href={`/${app.slug}`} onClick={(event) => { if (appWindows?.[app.slug]) { event.preventDefault(); openWindow(app.slug); } }} className={`desktop-shortcut ${app.slug === "sioverse" ? "community-shortcut" : ""}`}>
            <span className={`shortcut-symbol ${app.color}`}><app.icon size={33} strokeWidth={1.7} /></span>
            <span>{app.label}</span>
          </Link>
        ))}
      </div>

      {!active && <section className="desktop-widget" aria-label="Bienvenue sur SIO OS">
        <span className="widget-overline"><span className="live-dot" /> SIO OS · SESSION ACTIVE</span>
        <h1>Votre espace,<br /><em>vos repères.</em></h1>
        <p>Ouvrez une application depuis le bureau ou la barre des tâches.</p>
        <CourseGlance courses={desktopCourses} catalog={desktopCatalog} />
        <Link href="/sioverse" className="widget-link">Explorer SIOVerse.exe <ChevronRight size={18} /></Link>
      </section>}

      {openApps.map((app, index) => {
        const definition = apps.find((item) => item.slug === app);
        const WindowIcon = definition?.icon;
        const maximized = maximizedApps.has(app);
        const minimized = minimizedApps.has(app);
        const geometry = geometries[app];
        const windowStyle: CSSProperties = {
          ...(geometry && !maximized ? { left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height, minHeight: 0, maxHeight: "none", transform: "none" } : {}),
          zIndex: focusedApp === app ? 18 : 12 + index,
        };
        return <section key={app} ref={(node) => { if (node) windowRefs.current.set(app, node); else windowRefs.current.delete(app); }} style={windowStyle} onPointerDown={() => setFocusedApp(app)} className={`os-window ${app === "agenda" ? "agenda-window" : app === "ressources" || app === "controles" || app === "utilisateurs" ? "ent-window" : ""} ${maximized ? "maximized" : ""} ${minimized ? "minimized" : ""} ${focusedApp === app ? "focused" : ""}`} aria-label={`Fenêtre ${definition?.label}`}>
          <div className="os-titlebar" onDoubleClick={() => toggleMaximized(app)} onPointerDown={(event) => beginWindowGesture(event, app, "move")} onPointerMove={updateWindowGesture} onPointerUp={endWindowGesture} onPointerCancel={endWindowGesture}>
            <div className="window-identity"><span className="window-mini-icon">{WindowIcon && <WindowIcon size={17} />}</span><span>{definition?.label} — SIO OS</span></div>
            <div className="window-actions"><button type="button" aria-label="Réduire la fenêtre" onClick={() => toggleMinimized(app)}><Minus size={16} /></button><button type="button" aria-label={maximized ? "Restaurer la fenêtre" : "Agrandir la fenêtre"} onClick={() => toggleMaximized(app)}><Maximize2 size={15} /></button><button type="button" className="close-window" aria-label="Fermer la fenêtre" onClick={() => closeWindow(app)}><X size={18} /></button></div>
          </div>
          <div className="os-window-content">{appWindows?.[app] ?? (app === active ? children : null)}</div>
          {!maximized && <span className="os-resize-handle" aria-label="Redimensionner la fenêtre" onPointerDown={(event) => beginWindowGesture(event, app, "resize")} onPointerMove={updateWindowGesture} onPointerUp={endWindowGesture} onPointerCancel={endWindowGesture} />}
        </section>;
      })}

      {settingsOpen && <aside className="wallpaper-panel" aria-label="Personnalisation du bureau">
        <div className="flyout-heading"><span><ImageIcon size={18} /> Fond d’écran</span><button onClick={() => setSettingsOpen(false)} aria-label="Fermer la personnalisation"><X size={17} /></button></div>
        <p>Choisissez une ambiance animée pour votre bureau.</p>
        <div className="wallpaper-choices">{allWallpapers.map((item, index) => <div key={item.file} className={`wallpaper-choice ${wallpaper === index ? "selected" : ""}`}><button type="button" className="wallpaper-select" onClick={() => { setWallpaper(index); setAutomatic(false); }} aria-pressed={wallpaper === index}><span className="wallpaper-preview" style={{ backgroundImage: `url(${item.file})` }} /><span className="wallpaper-choice-copy"><strong>{item.name}</strong><small>{item.mood}</small></span>{wallpaper === index && <Check size={16} />}</button>{"id" in item && <button type="button" className="wallpaper-delete" aria-label={`Supprimer ${item.name}`} title="Supprimer ce GIF" disabled={wallpaperBusy} onClick={() => removeWallpaper(item)}><Trash2 size={14} /></button>}</div>)}</div>
        <form className="wallpaper-upload" onSubmit={addWallpaper}><strong><Upload size={15} /> Ajouter ton GIF</strong><input name="name" required minLength={2} maxLength={60} placeholder="Nom du fond d’écran" aria-label="Nom du fond d’écran" /><input name="gif" type="file" accept="image/gif,.gif" required aria-label="Fichier GIF" /><button type="submit" disabled={wallpaperBusy}>{wallpaperBusy ? "Import…" : "Importer le GIF"}</button>{wallpaperError && <small role="alert">{wallpaperError}</small>}</form>
        <section className="os-personalize"><strong><Paintbrush size={15} /> Apparence du système</strong><div className="os-accent-choices">{accentChoices.map((color) => <button type="button" key={color} style={{ backgroundColor: color }} className={accent === color ? "selected" : ""} aria-label={`Utiliser la couleur ${color}`} aria-pressed={accent === color} onClick={() => setAccent(color)} />)}</div><div className="os-choice-row" aria-label="Thème"><button type="button" className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}><Sun size={14} /> Clair</button><button type="button" className={theme === "night" ? "selected" : ""} onClick={() => setTheme("night")}><Moon size={14} /> Nuit</button></div><div className="os-choice-row os-icon-sizes" aria-label="Taille des icônes"><button type="button" className={iconSize === "compact" ? "selected" : ""} onClick={() => setIconSize("compact")}>Petites</button><button type="button" className={iconSize === "normal" ? "selected" : ""} onClick={() => setIconSize("normal")}>Normales</button><button type="button" className={iconSize === "large" ? "selected" : ""} onClick={() => setIconSize("large")}>Grandes</button></div><button type="button" className="os-sound-toggle" onClick={() => setSounds((value) => !value)} aria-pressed={sounds}>{sounds ? <Volume2 size={15} /> : <VolumeX size={15} />} Sons de l’interface <i className={sounds ? "on" : ""} /></button>{installPrompt && <button type="button" className="os-install" onClick={() => void installApp()}><Download size={15} /> Installer SIOVerse sur cet appareil</button>}</section>
        <button className="rotation-toggle" onClick={() => setAutomatic((value) => !value)} aria-pressed={automatic}>{automatic ? <Pause size={17} /> : <Play size={17} />}<span><strong>Rotation automatique</strong><small>{automatic ? "Nouvelle ambiance toutes les 35 secondes" : "Fond d’écran fixe"}</small></span><span className={`toggle-track ${automatic ? "on" : ""}`} /></button>
      </aside>}

      {startOpen && <aside className="start-menu" aria-label="Menu Démarrer">
        <div className="start-heading"><span className="start-mark"><Grid2X2 size={20} /></span><div><strong>{user.username}</strong><small>{user.role === "ADMIN" ? "Administrateur" : "Membre de la classe"} · SIO OS</small></div></div>
        <div className="start-apps">{visibleApps.map((app) => <Link key={app.slug} href={`/${app.slug}`} onClick={(event) => { if (appWindows?.[app.slug]) { event.preventDefault(); openWindow(app.slug); } else setStartOpen(false); }}><span className={`start-app-icon ${app.color}`}><app.icon size={19} /></span><span>{app.label}</span><ChevronRight size={15} /></Link>)}</div>
        <button className="start-settings" onClick={() => { setStartOpen(false); setSettingsOpen(true); }}><Settings2 size={17} /> Personnaliser le bureau</button>
        <button className="start-settings" onClick={() => { setStartOpen(false); setPasswordError(""); passwordDialog.current?.showModal(); }}><KeyRound size={17} /> Modifier mon mot de passe</button>
        <button className="start-settings" onClick={lockSession}><LockKeyhole size={17} /> Verrouiller la session</button>
        <button className="start-settings" onClick={logout}><LogOut size={17} /> Se déconnecter</button>
      </aside>}

      {contextMenu && <aside className="desktop-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => { router.refresh(); setContextMenu(null); }}><RefreshCw size={15} /> Actualiser</button><button type="button" onClick={() => { setSettingsOpen(true); setContextMenu(null); }}><Paintbrush size={15} /> Personnaliser</button>{focusedApp && <button type="button" onClick={() => { setMinimizedApps((current) => { const next = new Set(current); next.delete(focusedApp); return next; }); setContextMenu(null); }}><Maximize2 size={15} /> Afficher {activeApp?.label}</button>}<span /><button type="button" onClick={lockSession}><LockKeyhole size={15} /> Verrouiller</button></aside>}

      {locked && <section className="os-lock-screen" aria-label="Session verrouillée">
        <div className="os-lock-brand">SIO<span>VERSE</span></div>
        <div className="os-lock-card">
          <span className="os-lock-kicker"><LockKeyhole size={12} /> SESSION SIO OS</span>
          <span className="os-lock-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          <h2>{user.username}</h2>
          <p>Entre ton mot de passe pour retrouver ton bureau.</p>
          <form onSubmit={unlockSession}>
            <input name="password" type="password" required autoFocus placeholder="Mot de passe" aria-label="Mot de passe" autoComplete="current-password" />
            <button type="submit" disabled={unlockBusy}>{unlockBusy ? "Vérification…" : "Déverrouiller"}<ChevronRight size={17} /></button>
          </form>
          {unlockError && <small className="os-lock-error" role="alert">{unlockError}</small>}
          <button type="button" className="os-switch-session" onClick={logout}>Changer de session</button>
        </div>
      </section>}

      {passwordNotice && <div className="os-toast" role="status">{passwordNotice}</div>}
      <dialog ref={passwordDialog} className="ent-dialog os-password-dialog" onClose={() => setPasswordError("")}><form method="dialog" className="ent-dialog-close"><button aria-label="Fermer"><X size={18} /></button></form><div className="ent-dialog-heading"><span><KeyRound size={20} /></span><h3>Mot de passe de session</h3><p>Le changer fermera tes autres sessions ouvertes.</p></div><form className="ent-form" onSubmit={changePassword}><label>Mot de passe actuel<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>Nouveau mot de passe<input name="newPassword" type="password" required minLength={4} maxLength={128} autoComplete="new-password" /></label><label>Confirmer le nouveau mot de passe<input name="confirmPassword" type="password" required minLength={4} maxLength={128} autoComplete="new-password" /></label>{passwordError && <p className="ent-error" role="alert">{passwordError}</p>}<button className="ent-primary" disabled={passwordBusy}>{passwordBusy ? "Modification…" : "Enregistrer le mot de passe"}</button></form></dialog>

      <nav className="taskbar" aria-label="Barre des tâches">
        <div className="taskbar-left"><button className={`start-button ${startOpen ? "pressed" : ""}`} onClick={() => { setStartOpen((value) => !value); setSettingsOpen(false); }} aria-label="Ouvrir le menu Démarrer" aria-expanded={startOpen}><Grid2X2 size={22} fill="currentColor" strokeWidth={1} /></button><span className="taskbar-divider" />{visibleApps.map((app) => openApps.includes(app.slug) ? <button type="button" key={app.slug} className={`taskbar-app active ${focusedApp === app.slug && !minimizedApps.has(app.slug) ? "focused" : ""}`} aria-label={`${minimizedApps.has(app.slug) ? "Restaurer" : "Réduire"} ${app.label}`} title={minimizedApps.has(app.slug) ? `Restaurer ${app.label}` : `Réduire ${app.label}`} onClick={() => toggleMinimized(app.slug)}><app.icon size={22} /></button> : <Link key={app.slug} href={`/${app.slug}`} onClick={(event) => { if (appWindows?.[app.slug]) { event.preventDefault(); openWindow(app.slug); } }} className="taskbar-app" aria-label={app.label} title={app.label}><app.icon size={22} /></Link>)}</div>
        <div className="taskbar-right"><button className="taskbar-wallpaper" onClick={() => { setSettingsOpen((value) => !value); setStartOpen(false); }} aria-label="Changer le fond d’écran" aria-expanded={settingsOpen}><Monitor size={17} /><span>Fond d’écran</span></button><NotificationCenter /><span className="taskbar-divider" /><Wifi size={17} /><BatteryFull size={18} /><StatusClock /></div>
      </nav>
    </main>
  );
}

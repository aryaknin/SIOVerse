"use client";

import Link from "next/link";
import { Bell, BellRing, BookOpen, CheckCheck, ClipboardCheck, MessageCircle, Settings2, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationCategory, NotificationPreferences, SioNotification } from "@/lib/notifications";

const defaults: NotificationPreferences = { resources: true, assessments: true, accounts: true, memes: true };
const categories: Record<NotificationCategory, { label: string; icon: typeof Bell; className: string }> = {
  RESOURCES: { label: "Ressources", icon: BookOpen, className: "resources" },
  ASSESSMENTS: { label: "Contrôles", icon: ClipboardCheck, className: "assessments" },
  ACCOUNTS: { label: "Comptes", icon: ShieldCheck, className: "accounts" },
  MEMES: { label: "Mèmes", icon: MessageCircle, className: "memes" },
};
const preferenceLabels: Array<[keyof NotificationPreferences, string, string]> = [
  ["resources", "Ressources", "Nouveaux cours et documents"],
  ["assessments", "Contrôles", "Échéances ajoutées ou modifiées"],
  ["accounts", "Compte", "Invitations et modifications de compte"],
  ["memes", "Mèmes", "Nouveaux commentaires et réponses"],
];

function relativeDate(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [items, setItems] = useState<SioNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [preferences, setPreferences] = useState(defaults);
  const [error, setError] = useState("");
  const [systemPermission, setSystemPermission] = useState<NotificationPermission | "unsupported">(() => typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  const knownIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json();
      const incoming = result.notifications as SioNotification[];
      if (initialized.current && "Notification" in window && Notification.permission === "granted") {
        incoming.filter((item) => !item.read && !knownIds.current.has(item.id)).slice(0, 3).forEach((item) => new Notification(item.title, { body: item.body, icon: "/icon.svg", tag: item.id }));
      }
      knownIds.current = new Set(incoming.map((item) => item.id)); initialized.current = true;
      setItems(incoming); setUnread(result.unread as number); setPreferences(result.preferences as NotificationPreferences);
    } catch { /* Le prochain rafraîchissement réessaiera. */ }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void load(), 0);
    const refresh = window.setInterval(() => void load(), 30_000);
    return () => { window.clearTimeout(firstLoad); window.clearInterval(refresh); };
  }, [load]);

  async function enableSystemNotifications() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setSystemPermission(permission);
    if (permission === "granted") new Notification("Notifications SIOVerse activées", { body: "Les prochaines nouveautés pourront apparaître sur ton bureau.", icon: "/icon.svg", tag: "sioverse-enabled" });
  }

  async function update(payload: Record<string, unknown>) {
    setError("");
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Mise à jour impossible.");
      setItems(result.notifications as SioNotification[]); setUnread(result.unread as number); setPreferences(result.preferences as NotificationPreferences);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mise à jour impossible."); }
  }

  async function togglePreference(key: keyof NotificationPreferences) {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next); await update({ action: "preferences", preferences: next });
  }

  return <>
    {open && <aside className="notification-panel" aria-label="Centre de notifications">
      <div className="notification-heading"><span><Bell size={18} /> Notifications {unread > 0 && <b>{unread}</b>}</span><div><button type="button" className={settings ? "active" : ""} onClick={() => setSettings((value) => !value)} aria-label="Réglages des notifications"><Settings2 size={16} /></button><button type="button" onClick={() => setOpen(false)} aria-label="Fermer les notifications"><X size={17} /></button></div></div>
      {settings ? <section className="notification-settings"><strong>Ce que tu veux recevoir</strong><p>Ces réglages sont liés à ton compte.</p>{systemPermission !== "unsupported" && <button type="button" className="notification-system-toggle" onClick={() => void enableSystemNotifications()} disabled={systemPermission === "denied"} aria-pressed={systemPermission === "granted"}><span><b><BellRing size={13} /> Notifications système</b><small>{systemPermission === "granted" ? "Activées sur cet appareil" : systemPermission === "denied" ? "Bloquées dans le navigateur" : "Afficher les nouveautés hors de SIOVerse"}</small></span><i className={systemPermission === "granted" ? "on" : ""} /></button>}{preferenceLabels.map(([key, label, detail]) => <button type="button" key={key} onClick={() => void togglePreference(key)} aria-pressed={preferences[key]}><span><b>{label}</b><small>{detail}</small></span><i className={preferences[key] ? "on" : ""} /></button>)}</section> : <>
        <div className="notification-toolbar"><span>{unread ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est à jour"}</span>{unread > 0 && <button type="button" onClick={() => void update({ action: "read" })}><CheckCheck size={14} /> Tout marquer comme lu</button>}</div>
        <div className="notification-list">{items.length ? items.map((item) => {
          const category = categories[item.category]; const Icon = category.icon;
          const content = <><span className={`notification-icon ${category.className}`}><Icon size={16} /></span><span className="notification-copy"><small>{category.label} · {relativeDate(item.createdAt)}</small><strong>{item.title}</strong><p>{item.body}</p></span>{!item.read && <i className="notification-unread" />}</>;
          return item.href ? <Link href={item.href} key={item.id} className={`notification-item ${item.read ? "read" : ""}`} onClick={() => { if (!item.read) void update({ action: "read", id: item.id }); setOpen(false); }}>{content}</Link> : <button type="button" key={item.id} className={`notification-item ${item.read ? "read" : ""}`} onClick={() => !item.read && void update({ action: "read", id: item.id })}>{content}</button>;
        }) : <div className="notification-empty"><Bell size={28} /><strong>Aucune notification</strong><p>Les nouveautés de la classe apparaîtront ici.</p></div>}</div>
      </>}
      {error && <p className="notification-error" role="alert">{error}</p>}
    </aside>}
    <button type="button" className={`taskbar-notifications ${open ? "pressed" : ""}`} onClick={() => { setOpen((value) => !value); if (!open) void load(); }} aria-label={`Notifications${unread ? `, ${unread} non lues` : ""}`} aria-expanded={open}><Bell size={18} />{unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}</button>
  </>;
}

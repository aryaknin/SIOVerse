"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, BookOpen, CalendarDays, Check, CheckCircle2, ClipboardCheck, Clock3, FileText, Plus, X } from "lucide-react";
import type { EntAssessment, EntCatalog } from "@/lib/ent";
import { resourceKindLabel, resourcesForAssessment } from "@/lib/ent";

const progressKey = "sioverse-revision-checklist-v1";
const dateTime = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

function readProgress(key: string): string[] {
  try {
    const data = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(data) ? data.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

export function AssessmentPlanner({ initialCatalog, canManage, userId }: { initialCatalog: EntCatalog; canManage: boolean; userId: string }) {
  const personalProgressKey = `${progressKey}:${userId}`;
  const [catalog, setCatalog] = useState(initialCatalog);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [progress, setProgress] = useState<string[]>([]);
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const addDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setProgress(readProgress(personalProgressKey)), 0);
    return () => window.clearTimeout(timer);
  }, [personalProgressKey]);

  const now = new Date();
  const assessments = [...catalog.assessments].filter((assessment) => !onlyUpcoming || new Date(assessment.scheduledAt).getTime() >= now.getTime() - 24 * 60 * 60 * 1000).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const selected: EntAssessment | undefined = assessments.find((item) => item.id === selectedId) ?? assessments[0];
  const subject = catalog.subjects.find((item) => item.id === selected?.subjectId);
  const chapters = catalog.chapters.filter((chapter) => selected?.chapterIds.includes(chapter.id));
  const resources = selected ? resourcesForAssessment(catalog, selected) : [];
  const checklistItems = selected ? [...chapters.map((chapter) => ({ id: `${selected.id}:chapter:${chapter.id}`, label: chapter.title, kind: "Chapitre" })), ...resources.map((resource) => ({ id: `${selected.id}:resource:${resource.id}`, label: resource.title, kind: resourceKindLabel(resource.kind) }))] : [];
  const completed = checklistItems.filter((item) => progress.includes(item.id)).length;

  function toggleItem(id: string) {
    const updated = progress.includes(id) ? progress.filter((item) => item !== id) : [...progress, id];
    setProgress(updated);
    window.localStorage.setItem(personalProgressKey, JSON.stringify(updated));
  }

  async function addAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const date = String(data.get("scheduledAt") ?? "");
    if (!data.getAll("chapterIds").length) { setError("Choisis au moins un chapitre à réviser."); setBusy(false); return; }
    try {
      const response = await fetch("/api/ent/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "assessment", kind: data.get("kind"), title: data.get("title"), subjectId: data.get("subjectId"),
        chapterIds: data.getAll("chapterIds"), scheduledAt: new Date(date).toISOString(), details: data.get("details") ?? "", room: data.get("room") ?? "",
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Échéance non enregistrée.");
      const next = result as EntCatalog;
      setCatalog(next); setSelectedId(next.assessments.at(-1)?.id ?? null); setOnlyUpcoming(false);
      addDialog.current?.close(); form.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Échéance non enregistrée."); }
    finally { setBusy(false); }
  }

  return <div className="os-app-page ent-page">
    <header className="ent-heading"><div><span className="app-eyebrow"><ClipboardCheck size={16} /> RÉVISION EXPRESS</span><h2>Contrôles & devoirs<span>.</span></h2><p>Une échéance, les bons chapitres et tout ce qu’il faut réviser.</p></div>{canManage && <button type="button" className="ent-primary" disabled={!catalog.chapters.length} onClick={() => { setError(""); setSubjectId(catalog.chapters[0]?.subjectId ?? ""); addDialog.current?.showModal(); }}><Plus size={16} /> Ajouter une échéance</button>}</header>
    <div className="assessment-layout">
      <aside className="assessment-list"><div className="ent-sidebar-heading"><strong>ÉCHÉANCES</strong><button type="button" className="assessment-filter" onClick={() => { setOnlyUpcoming(!onlyUpcoming); setSelectedId(null); }}>{onlyUpcoming ? "À venir" : "Toutes"}</button></div>{assessments.length ? assessments.map((assessment) => {
        const itemSubject = catalog.subjects.find((item) => item.id === assessment.subjectId);
        return <button type="button" key={assessment.id} className={`assessment-row ${selected?.id === assessment.id ? "selected" : ""}`} onClick={() => setSelectedId(assessment.id)}><span className="assessment-date">{shortDate.format(new Date(assessment.scheduledAt))}</span><span><small>{assessment.kind === "CONTROL" ? "CONTRÔLE" : "DEVOIR"} · {itemSubject?.name}</small><strong>{assessment.title}</strong></span><ChevronRightIcon /></button>;
      }) : <div className="assessment-list-empty"><CalendarDays size={24} /><p>{catalog.assessments.length ? "Aucune échéance à venir." : "Ajoute un contrôle ou un devoir pour préparer tes révisions."}</p></div>}</aside>
      <section className="assessment-detail">{selected ? <>
        <div className="assessment-detail-top"><span className={`assessment-kind ${selected.kind === "CONTROL" ? "control" : "homework"}`}>{selected.kind === "CONTROL" ? "CONTRÔLE" : "DEVOIR À RENDRE"}</span><span>{subject?.name}</span></div>
        <h3>{selected.title}</h3><div className="assessment-meta"><span><CalendarDays size={15} />{dateTime.format(new Date(selected.scheduledAt))}</span>{selected.room && <span><Clock3 size={15} />{selected.room}</span>}</div>
        {selected.details && <div className="assessment-instructions"><strong>Consignes</strong><p>{selected.details}</p></div>}
        <div className="assessment-section-head"><span>CHAPITRES CONCERNÉS</span><Link href="/ressources">Bibliothèque <ArrowUpRight size={14} /></Link></div>
        <div className="assessment-chapters">{chapters.map((chapter) => <span key={chapter.id}><BookOpen size={14} />{chapter.title}</span>)}</div>
        <div className="assessment-section-head"><span>RESSOURCES LIÉES · {resources.length}</span></div>
        {resources.length ? <div className="assessment-resources">{resources.map((resource) => <a key={resource.id} href={resource.externalUrl ?? `/api/ent/files/${resource.id}`} target="_blank" rel="noopener noreferrer"><FileText size={17} /><span><strong>{resource.title}</strong><small>{resourceKindLabel(resource.kind)}</small></span><ArrowUpRight size={15} /></a>)}</div> : <p className="assessment-no-resources">Aucune ressource dans ces chapitres pour l’instant. {canManage && <Link href="/ressources">Ajouter un document</Link>}</p>}
        <div className="assessment-section-head"><span>MA CHECKLIST DE RÉVISION</span><strong>{completed} / {checklistItems.length}</strong></div>
        <div className="assessment-progress"><span style={{ width: `${checklistItems.length ? completed / checklistItems.length * 100 : 0}%` }} /></div>
        <div className="assessment-checklist">{checklistItems.map((item) => <label key={item.id}><input type="checkbox" checked={progress.includes(item.id)} onChange={() => toggleItem(item.id)} /><span className="assessment-checkbox"><Check size={12} /></span><span><strong>{item.label}</strong><small>{item.kind}</small></span></label>)}</div>
      </> : <div className="ent-empty"><CheckCircle2 size={29} /><h4>Prêt pour la prochaine échéance</h4><p>{!catalog.chapters.length ? "Crée d’abord une matière et un chapitre dans Ressources." : "Ajoute un contrôle ou un devoir pour retrouver ici les chapitres et documents à réviser."}</p>{!catalog.chapters.length && <Link href="/ressources" className="ent-primary">Ouvrir Ressources</Link>}</div>}</section>
    </div>
    {error && <p className="ent-error" role="alert">{error}</p>}
    <div className="app-info-note"><CheckCircle2 size={16} /> La checklist est personnelle et conservée sur cet appareil. {catalog.storageStatus === "local" && "PostgreSQL est en attente de connexion."}</div>

    <dialog ref={addDialog} className="ent-dialog" onClose={() => setError("")}><form method="dialog" className="ent-dialog-close"><button aria-label="Fermer"><X size={18} /></button></form><div className="ent-dialog-heading"><span><ClipboardCheck size={20} /></span><h3>Nouvelle échéance</h3><p>Lie un contrôle ou un devoir aux chapitres concernés.</p></div><form className="ent-form" onSubmit={addAssessment}><label>Type<select name="kind"><option value="CONTROL">Contrôle</option><option value="HOMEWORK">Devoir à rendre</option></select></label><label>Titre<input name="title" required minLength={2} maxLength={120} placeholder="Ex. Évaluation sur les réseaux" /></label><label>Matière<select name="subjectId" required value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{catalog.subjects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><fieldset><legend>Chapitres à réviser <small>(au moins un)</small></legend>{catalog.chapters.filter((chapter) => chapter.subjectId === subjectId).map((chapter) => <label key={chapter.id}><input type="checkbox" name="chapterIds" value={chapter.id} />{chapter.title}</label>)}{!catalog.chapters.some((chapter) => chapter.subjectId === subjectId) && <p>Cette matière ne contient pas encore de chapitre.</p>}</fieldset><label>Date et heure<input name="scheduledAt" type="datetime-local" required /></label><label>Salle ou lieu <small>(facultatif)</small><input name="room" maxLength={120} /></label><label>Consignes <small>(facultatif)</small><textarea name="details" rows={4} maxLength={4000} placeholder="Ce que le professeur a demandé…" /></label><button className="ent-primary" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer l’échéance"}</button></form>{error && <p className="ent-error" role="alert">{error}</p>}</dialog>
  </div>;
}

function ChevronRightIcon() { return <ArrowUpRight size={15} className="assessment-row-arrow" />; }

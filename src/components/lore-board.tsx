"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, BookOpenText, Check, Clock3, Eye, FilePlus2, Flag, History, Link2, List, Pencil, Plus, RotateCcw, ShieldAlert, Trash2, UserRound, X } from "lucide-react";
import type { LoreEntry, LoreSection } from "@/lib/lore";
import type { MemeEntry } from "@/lib/memes";
import type { PersonOption } from "@/lib/people";
import type { WikiReport } from "@/lib/wiki-reports";
import { ConcernedPeoplePicker } from "./concerned-people-picker";
import { ConcernedPeopleDisplay } from "./concerned-people-display";
import { ContentPeopleEditor } from "./content-people-editor";
import { WikiCategoryView, WikiPortal, WikiTree } from "./wiki-navigation";
import { WikiRichText } from "./wiki-rich-text";
import { wikiCategoryGroups, wikiCategoryInfo, type WikiCategoryId } from "@/lib/wiki-categories";

type EditorTarget = { kind: "intro" | "new" | "section"; id?: string };
type EditPayload = { action: string; articleId: string; [key: string]: unknown };

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(date));
}

function WikiEditor({ title, body, category, articles, label, onSave, onCancel, busy }: { title: string; body: string; category?: WikiCategoryId; articles: LoreEntry[]; label: string; onSave: (title: string, body: string, category?: WikiCategoryId) => Promise<void>; onCancel: () => void; busy: boolean }) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);
  const [draftCategory, setDraftCategory] = useState(category);
  const [preview, setPreview] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  function format(before: string, after = before) {
    const field = textarea.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = draftBody.slice(start, end) || "texte";
    setDraftBody(`${draftBody.slice(0, start)}${before}${selected}${after}${draftBody.slice(end)}`);
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onSave(draftTitle.trim(), draftBody.trim(), draftCategory); }
  return <form className="wiki-inline-editor" onSubmit={submit}>
    <div className="wiki-editor-caption"><Pencil size={15} /><strong>{label}</strong><span>Visible par toute la classe</span></div>
    <label>Titre<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} required minLength={2} maxLength={120} /></label>
    {category && <label>Catégorie<select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value as WikiCategoryId)}>{wikiCategoryGroups.map((group) => <optgroup label={group.label} key={group.id}>{group.categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select></label>}
    <div className="wiki-editor-toolbar"><span>Texte</span><button type="button" title="Gras" disabled={preview} onClick={() => format("**")}>B</button><button type="button" title="Italique" disabled={preview} onClick={() => format("*")}><i>I</i></button><button type="button" title="Lien externe" disabled={preview} onClick={() => format("[", "](https://exemple.fr)")}><Link2 size={15} /></button><button type="button" title="Lien vers un article wiki" disabled={preview} onClick={() => format("[[", "]]" )}><BookOpenText size={15} /></button><button type="button" title="Liste" disabled={preview} onClick={() => format("- ", "")}>☷</button><button type="button" title="Citation" disabled={preview} onClick={() => format("> ", "")}>❝</button><button type="button" className={preview ? "active" : ""} onClick={() => setPreview((value) => !value)}><Eye size={15} /> Aperçu</button></div>
    {preview ? <div className="wiki-preview"><WikiRichText text={draftBody} articles={articles} /></div> : <textarea ref={textarea} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} maxLength={12000} rows={9} placeholder="Sépare les paragraphes par une ligne vide ; - pour une liste et > pour une citation. Utilise [[Nom de l’article]] pour un lien wiki." />}
    <div className="wiki-editor-foot"><small>Paragraphes, listes, citations, gras, italique et liens.</small><div><button type="button" onClick={onCancel}>Annuler</button><button type="submit" disabled={busy || draftTitle.trim().length < 2}><Check size={15} /> {busy ? "Enregistrement…" : "Publier"}</button></div></div>
  </form>;
}

export function LoreBoard({ initialEntries, initialLinks, initialConcerned, initialPeople, memes, canManage }: { initialEntries: LoreEntry[]; initialLinks: Record<string, string[]>; initialConcerned: Record<string, PersonOption[]>; initialPeople: PersonOption[]; memes: MemeEntry[]; canManage: boolean }) {
  const [entries, setEntries] = useState(initialEntries);
  const [links, setLinks] = useState(initialLinks);
  const [concerned, setConcerned] = useState(initialConcerned);
  const [peopleOptions, setPeopleOptions] = useState(initialPeople);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [missingTitle, setMissingTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [peopleEditor, setPeopleEditor] = useState(false);
  const [mediaEditor, setMediaEditor] = useState(false);
  const [selectedMemes, setSelectedMemes] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [showReports, setShowReports] = useState(false);
  const [reports, setReports] = useState<WikiReport[]>([]);
  const entry = entries.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    function syncFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("article");
      const category = params.get("category");
      setSelectedId(id && entries.some((item) => item.id === id) ? id : null);
      setSelectedCategory(!id && category && wikiCategoryGroups.some((group) => group.categories.some((item) => item.id === category)) ? category : null);
      setEditor(null); setShowHistory(false); setPeopleEditor(false); setMediaEditor(false);
    }
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [entries]);

  function selectArticle(id: string) {
    setSelectedId(id); setSelectedCategory(null); setAdding(false); setEditor(null); setPeopleEditor(false); setMediaEditor(false); setShowHistory(false); setShowReports(false); setReporting(false); setReportNotice(""); setError(""); setCopied(false);
    const url = new URL(window.location.href);
    url.searchParams.set("article", id);
    url.searchParams.delete("category");
    url.hash = "";
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function selectCategory(id: string) {
    setSelectedId(null); setSelectedCategory(id); setAdding(false); setEditor(null); setShowReports(false); setError("");
    const url = new URL(window.location.href);
    url.searchParams.delete("article"); url.searchParams.set("category", id); url.hash = "";
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function showPortal() {
    setSelectedId(null); setSelectedCategory(null); setAdding(false); setEditor(null); setShowReports(false); setError("");
    const url = new URL(window.location.href);
    url.searchParams.delete("article"); url.searchParams.delete("category"); url.hash = "";
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startArticle(title = "") {
    setMissingTitle(title); setAdding(true); setError("");
  }
  async function copyArticleLink() {
    if (!entry) return;
    const url = new URL(window.location.href);
    url.searchParams.set("article", entry.id);
    url.hash = "";
    try { await navigator.clipboard.writeText(url.toString()); setCopied(true); window.setTimeout(() => setCopied(false), 2300); }
    catch { setError("Impossible de copier le lien automatiquement."); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!selectedPeople.length) { setError("Choisis au moins une personne concernée."); return; }
    setBusy(true);
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/lore", { method: "POST", body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Publication impossible.");
      const updated = result.entries as LoreEntry[];
      setEntries(updated); setLinks(result.links); setConcerned(result.concerned);
      selectArticle(updated[0].id); setSelectedPeople([]); form.reset(); setAdding(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Publication impossible."); }
    finally { setBusy(false); }
  }
  async function edit(payload: EditPayload) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/lore/edit", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Modification impossible.");
      setEntries(result.entries as LoreEntry[]); setLinks(result.links as Record<string, string[]>); setEditor(null); setMediaEditor(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Modification impossible."); }
    finally { setBusy(false); }
  }
  async function deleteSection(section: LoreSection) {
    if (!entry || !window.confirm(`Supprimer la section « ${section.title} » ? Cette action ne peut pas être annulée.`)) return;
    await edit({ action: "section-delete", articleId: entry.id, sectionId: section.id, expectedUpdatedAt: section.updatedAt });
  }
  async function moveSection(index: number, direction: -1 | 1) {
    if (!entry) return;
    const sectionIds = entry.sections.map((section) => section.id);
    const next = index + direction;
    if (next < 0 || next >= sectionIds.length) return;
    [sectionIds[index], sectionIds[next]] = [sectionIds[next], sectionIds[index]];
    await edit({ action: "section-order", articleId: entry.id, sectionIds, expectedUpdatedAt: entry.updatedAt });
  }
  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!entry) return;
    setBusy(true); setError(""); setReportNotice("");
    try {
      const response = await fetch("/api/lore/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: entry.id, reason: reportReason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Signalement impossible.");
      setReporting(false); setReportReason(""); setReportNotice("Signalement transmis aux administrateurs.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Signalement impossible."); }
    finally { setBusy(false); }
  }
  async function openReports() {
    setShowReports(true); setError("");
    try {
      const response = await fetch("/api/lore/reports");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Signalements indisponibles.");
      setReports(result.reports as WikiReport[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Signalements indisponibles."); }
  }
  async function resolveReport(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/lore/reports", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Action impossible.");
      setReports(result.reports as WikiReport[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action impossible."); }
    finally { setBusy(false); }
  }
  return <section className="wiki-shell">
    <header className="wiki-site-head"><div><span className="wiki-kicker">SIOVERSE • ENCYCLOPÉDIE DE LA CLASSE</span><h1>Le Wiki<span>.</span></h1><p>Histoires, moments et archives de la promo — écrits ensemble.</p></div><div className="wiki-header-actions">{canManage && <button type="button" className="wiki-report-toggle" onClick={() => showReports ? setShowReports(false) : void openReports()}><ShieldAlert size={17} /> Signalements</button>}<button type="button" className="wiki-primary" onClick={() => startArticle()}><FilePlus2 size={17} /> Créer un article</button></div></header>
    <div className="wiki-layout"><WikiTree entries={entries} selectedId={selectedId} selectedCategory={selectedCategory} onPortal={showPortal} onCategory={selectCategory} onArticle={selectArticle} />
      <div className="wiki-main">
        {showReports && canManage && <section className="wiki-reports"><h2><ShieldAlert size={20} /> Signalements à examiner</h2>{error && <p role="alert">{error}</p>}{reports.map((report) => <article key={report.id}><div><strong>{report.articleTitle}</strong><small>Signalé par {report.reporterName} · {dateLabel(report.createdAt)}</small><p>{report.reason}</p></div><div><button type="button" onClick={() => selectArticle(report.articleId)}>Voir l’article</button><button type="button" disabled={busy} onClick={() => void resolveReport(report.id)}>Marquer traité</button></div></article>)}{!reports.length && <p>Aucun signalement en attente.</p>}</section>}
        {adding && <form className="wiki-create" onSubmit={create}><div className="wiki-create-head"><div><span>NOUVELLE PAGE</span><h2>Créer un article</h2></div><button type="button" onClick={() => { setAdding(false); setError(""); }} aria-label="Fermer"><X size={19} /></button></div><div className="wiki-create-grid"><label>Titre de la page<input name="title" required minLength={2} maxLength={120} defaultValue={missingTitle} placeholder="Ex. La légende du laboratoire B12" /></label><label>Place dans l’arborescence<select name="category" required defaultValue={selectedCategory ?? entry?.category ?? "OTHER"}>{wikiCategoryGroups.map((group) => <optgroup key={group.id} label={group.label}>{group.categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select></label><label>Introduction<textarea name="body" required minLength={10} maxLength={12000} rows={6} placeholder="Présente le sujet. Tu ajouteras ensuite des sections à la page." /></label></div><ConcernedPeoplePicker people={peopleOptions} selected={selectedPeople} onChange={setSelectedPeople} onCreated={(person) => setPeopleOptions((items) => [...items, person])} />{memes.length > 0 && <fieldset className="lore-meme-picker"><legend>Illustrations de la page Mèmes <small>— facultatif, 8 maximum</small></legend><div>{memes.map((meme) => <label key={meme.id}><input type="checkbox" name="memeIds" value={meme.id} /><span>{meme.title}<small>{meme.people.join(", ")}</small></span></label>)}</div></fieldset>}{error && <p role="alert" className="lore-error">{error}</p>}<div className="wiki-create-foot"><small>Tu seras indiqué comme créateur de cet article.</small><button type="submit" className="wiki-primary" disabled={busy || !selectedPeople.length}>{busy ? "Publication…" : "Publier la page"}</button></div></form>}
        {entry && !adding ? <article className="wiki-article" key={entry.id}>
          <div className="wiki-breadcrumb"><BookOpenText size={14} /><button type="button" onClick={showPortal}>Portail</button><span>/</span><span>{wikiCategoryInfo(entry.category).group.label}</span><span>/</span><button type="button" onClick={() => selectCategory(entry.category)}>{wikiCategoryInfo(entry.category).category.label}</button><span>/</span>{entry.title}</div>
          <div className="wiki-article-head"><div><span className="wiki-eyebrow">{wikiCategoryInfo(entry.category).group.label.toUpperCase()} · {wikiCategoryInfo(entry.category).category.label.toUpperCase()}</span><h2>{entry.title}</h2><div className="wiki-article-meta"><span><UserRound size={14} /> Créé par {entry.authorId ? <Link href={`/personnes/${encodeURIComponent(`user:${entry.authorId}`)}`}>{entry.authorName ?? "ancien membre"}</Link> : entry.authorName ?? "ancien membre"}</span><span><Clock3 size={14} /> Mis à jour le {dateLabel(entry.updatedAt)}</span></div></div><div className="wiki-head-actions"><button type="button" className="wiki-title-edit" onClick={copyArticleLink} title="Copier le lien de cet article">{copied ? <Check size={16} /> : <Link2 size={16} />} <span>{copied ? "Copié" : "Partager"}</span></button><button type="button" className="wiki-title-edit" onClick={() => { setEditor({ kind: "intro" }); setError(""); }} title="Modifier le titre ou l’introduction"><Pencil size={16} /> <span>Modifier</span></button></div></div>
          <div className="wiki-tabs"><button type="button" className={!showHistory ? "active" : ""} onClick={() => setShowHistory(false)}><BookOpenText size={15} /> Article</button><button type="button" className={showHistory ? "active" : ""} onClick={() => setShowHistory(true)}><History size={15} /> Historique <span>{entry.revisions.length}</span></button></div>
          {error && <p role="alert" className="wiki-global-error">{error}</p>}
          <div className="wiki-report-bar"><button type="button" onClick={() => setReporting((value) => !value)}><Flag size={14} /> {reporting ? "Fermer le signalement" : "Signaler un problème"}</button>{reportNotice && <span role="status">{reportNotice}</span>}</div>
          {reporting && <form className="wiki-report-form" onSubmit={submitReport}><label>Quel est le problème avec cet article ?<textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} minLength={10} maxLength={500} rows={3} required placeholder="Décris ce qui doit être vérifié par un administrateur…" /></label><button type="submit" disabled={busy || reportReason.trim().length < 10}>Envoyer le signalement</button></form>}
          {showHistory ? <section className="wiki-history"><h3>Historique des modifications</h3><p>Les contributions sont visibles par tous les membres de la classe. Les administrateurs peuvent restaurer l’état avant une modification récente.</p><ol>{entry.revisions.map((revision) => <li key={revision.id}><span className="wiki-history-dot" /><div><strong>{revision.detail}</strong><small>{revision.editorName ?? "Ancien membre"} · {dateLabel(revision.createdAt)}</small>{canManage && revision.canRestore && <button type="button" className="wiki-restore" disabled={busy} onClick={() => { if (window.confirm("Restaurer la version avant cette modification ? La version actuelle restera restaurable dans l’historique.")) void edit({ action: "restore", articleId: entry.id, revisionId: revision.id }); }}><RotateCcw size={13} /> Restaurer l’état précédent</button>}</div></li>)}</ol></section> : <div className="wiki-article-layout"><div className="wiki-article-content">
            <section className="wiki-intro" id="introduction">{editor?.kind === "intro" ? <WikiEditor title={entry.title} body={entry.body} category={entry.category} articles={entries} label="Modifier la page" busy={busy} onCancel={() => setEditor(null)} onSave={(title, body, category) => edit({ action: "article", articleId: entry.id, title, body, category, expectedUpdatedAt: entry.updatedAt })} /> : <WikiRichText text={entry.body} articles={entries} currentId={entry.id} onNavigate={selectArticle} onCreate={startArticle} />}</section>
            {(links[entry.id] ?? []).map((memeId) => { const meme = memes.find((item) => item.id === memeId); return meme ? <figure className="wiki-figure" key={memeId}><Image src={`/api/memes/gif/${meme.id}`} alt={meme.title} width={720} height={405} unoptimized /><figcaption>{meme.title} · {meme.people.join(", ")}</figcaption></figure> : null; })}
            {memes.length > 0 && <div className="wiki-media-manage">{!mediaEditor ? <button type="button" onClick={() => { setSelectedMemes(links[entry.id] ?? []); setMediaEditor(true); }}><Pencil size={13} /> Gérer les illustrations</button> : <div className="wiki-media-editor"><div><strong>Illustrations de l’article</strong><button type="button" onClick={() => setMediaEditor(false)} aria-label="Fermer"><X size={15} /></button></div><p>Sélectionne jusqu’à 8 contenus de la page Mèmes.</p><div className="wiki-media-options">{memes.map((meme) => <label key={meme.id}><input type="checkbox" checked={selectedMemes.includes(meme.id)} disabled={!selectedMemes.includes(meme.id) && selectedMemes.length >= 8} onChange={() => setSelectedMemes((items) => items.includes(meme.id) ? items.filter((id) => id !== meme.id) : [...items, meme.id])} /><span>{meme.title}</span></label>)}</div><div className="wiki-media-actions"><button type="button" onClick={() => setMediaEditor(false)}>Annuler</button><button type="button" disabled={busy} onClick={() => edit({ action: "media", articleId: entry.id, memeIds: selectedMemes })}>{busy ? "Enregistrement…" : "Enregistrer les illustrations"}</button></div></div>}</div>}
            {entry.sections.map((section, index) => <section className="wiki-section" id={`section-${section.id}`} key={section.id}><div className="wiki-section-head"><h3><span>{index + 1}.</span> {section.title}</h3><div className="wiki-section-actions"><button type="button" title="Modifier la section" onClick={() => { setEditor({ kind: "section", id: section.id }); setError(""); }}><Pencil size={14} /><span>Modifier</span></button><button type="button" title="Monter la section" disabled={index === 0 || busy} onClick={() => moveSection(index, -1)}><ArrowUp size={15} /></button><button type="button" title="Descendre la section" disabled={index === entry.sections.length - 1 || busy} onClick={() => moveSection(index, 1)}><ArrowDown size={15} /></button><button type="button" title="Supprimer la section" onClick={() => deleteSection(section)}><Trash2 size={15} /></button></div></div>{editor?.kind === "section" && editor.id === section.id ? <WikiEditor key={section.id} title={section.title} body={section.body} articles={entries} label={`Modifier « ${section.title} »`} busy={busy} onCancel={() => setEditor(null)} onSave={(title, body) => edit({ action: "section-edit", articleId: entry.id, sectionId: section.id, title, body, expectedUpdatedAt: section.updatedAt })} /> : <WikiRichText text={section.body} articles={entries} currentId={entry.id} onNavigate={selectArticle} onCreate={startArticle} />}{section.editorName && <div className="wiki-section-credit">Dernière modification par {section.editorName} · {dateLabel(section.updatedAt)}</div>}</section>)}
            {editor?.kind === "new" ? <WikiEditor title="" body="" articles={entries} label="Ajouter une section" busy={busy} onCancel={() => setEditor(null)} onSave={(title, body) => edit({ action: "section-add", articleId: entry.id, title, body })} /> : <button type="button" className="wiki-add-section" onClick={() => { setEditor({ kind: "new" }); setError(""); }}><Plus size={18} /> Ajouter une section à cet article</button>}
            <div className="wiki-article-footer"><div className="wiki-article-footer-head"><strong>Personnes concernées</strong><button type="button" onClick={() => setPeopleEditor((value) => !value)}><Pencil size={13} /> {peopleEditor ? "Fermer" : "Modifier"}</button></div><ConcernedPeopleDisplay people={concerned[entry.id] ?? []} />{peopleEditor && <ContentPeopleEditor key={entry.id} contentId={entry.id} people={peopleOptions} current={concerned[entry.id] ?? []} onCreated={(person) => setPeopleOptions((items) => [...items, person])} onSaved={(people) => { setConcerned((items) => ({ ...items, [entry.id]: people })); setPeopleEditor(false); }} onClose={() => setPeopleEditor(false)} />}</div>
          </div><aside className="wiki-toc"><div><List size={15} /> Sur cette page</div><a href="#introduction">Introduction</a>{entry.sections.map((section, index) => <a href={`#section-${section.id}`} key={section.id}><span>{index + 1}.</span> {section.title}</a>)}<button type="button" onClick={() => setEditor({ kind: "new" })}><Plus size={14} /> Ajouter une section</button></aside></div>}
        </article> : !adding && selectedCategory ? <WikiCategoryView categoryId={selectedCategory} entries={entries} onPortal={showPortal} onArticle={selectArticle} /> : !adding && <WikiPortal entries={entries} onCategory={selectCategory} onArticle={selectArticle} />}
      </div></div>
  </section>;
}

"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowUp, BookOpen, ChevronDown, ChevronRight, Clock3, Download, ExternalLink, FileText, FolderOpen, Grid2X2, Link2, List, Pencil, Plus, Search, Star, Trash2, Upload, X } from "lucide-react";
import type { EntCatalog, EntResource, ResourceKind } from "@/lib/ent";
import { chapterPath, descendantChapterIds, resourceKindLabel, resourceKinds } from "@/lib/ent";

const favoriteKey = "sioverse-resource-favorites-v1";
const recentKey = "sioverse-resource-recent-v1";
type View = "all" | "favorites" | "recent";
type EditableKind = "subject" | "chapter" | "resource";
type Editing = { kind: EditableKind; id: string; mode: "rename" | "move" };
type Layout = "details" | "tiles";
type Sort = "name" | "date" | "type";

function fileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(date));
}

function readIds(key: string): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function resourceIcon(kind: ResourceKind) {
  return kind === "LINK" ? Link2 : kind === "ARCHIVE" ? FolderOpen : kind === "COURSE" ? BookOpen : FileText;
}

export function ResourceExplorer({ initialCatalog, canManage, userId }: { initialCatalog: EntCatalog; canManage: boolean; userId: string }) {
  const personalFavoriteKey = `${favoriteKey}:${userId}`;
  const personalRecentKey = `${recentKey}:${userId}`;
  const [catalog, setCatalog] = useState(initialCatalog);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [kind, setKind] = useState<ResourceKind | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<Layout>("details");
  const [sort, setSort] = useState<Sort>("name");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [addingSubject, setAddingSubject] = useState(false);
  const [addingChapter, setAddingChapter] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [draftChapterId, setDraftChapterId] = useState("");
  const [newResourceKind, setNewResourceKind] = useState<ResourceKind>("COURSE");
  const [importSubjectId, setImportSubjectId] = useState("");
  const [importParentId, setImportParentId] = useState("");
  const [importMode, setImportMode] = useState<"folder" | "files">("folder");
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importNotice, setImportNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<EntResource | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editName, setEditName] = useState("");
  const [editTeacher, setEditTeacher] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const addDialog = useRef<HTMLDialogElement>(null);
  const importDialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setFavorites(readIds(personalFavoriteKey)); setRecent(readIds(personalRecentKey)); }, 0);
    return () => window.clearTimeout(timer);
  }, [personalFavoriteKey, personalRecentKey]);

  const selectedSubject = catalog.subjects.find((subject) => subject.id === subjectId);
  const chapters = catalog.chapters.filter((chapter) => chapter.subjectId === subjectId).sort((a, b) => a.position - b.position);
  const filtered = useMemo(() => catalog.resources.filter((resource) => {
    const chapter = catalog.chapters.find((item) => item.id === resource.chapterId);
    const subject = catalog.subjects.find((item) => item.id === chapter?.subjectId);
    const searchable = [resource.title, resource.teacher, chapter ? chapterPath(catalog.chapters, chapter.id).join(" ") : "", subject?.name].join(" ").toLocaleLowerCase("fr");
    return (!subjectId || subject?.id === subjectId) && (!chapterId || descendantChapterIds(catalog.chapters, chapterId).has(resource.chapterId))
      && (kind === "ALL" || resource.kind === kind)
      && (view !== "favorites" || favorites.includes(resource.id))
      && (view !== "recent" || recent.includes(resource.id))
      && searchable.includes(query.trim().toLocaleLowerCase("fr"));
  }).sort((a, b) => view === "recent" ? recent.indexOf(a.id) - recent.indexOf(b.id) : b.createdAt.localeCompare(a.createdAt)), [catalog, subjectId, chapterId, kind, view, favorites, recent, query]);
  const browsing = view === "all" && kind === "ALL" && !query.trim();
  const subjectOverview = browsing && !subjectId;
  const visibleFolders = browsing && subjectId ? chapters.filter((chapter) => chapter.parentId === chapterId) : [];
  const visibleResources = (browsing && subjectId ? filtered.filter((resource) => resource.chapterId === chapterId) : filtered).toSorted((a, b) =>
    view === "recent" ? recent.indexOf(a.id) - recent.indexOf(b.id) : sort === "date" ? b.createdAt.localeCompare(a.createdAt) : sort === "type" ? resourceKindLabel(a.kind).localeCompare(resourceKindLabel(b.kind), "fr") || a.title.localeCompare(b.title, "fr") : a.title.localeCompare(b.title, "fr"));
  const breadcrumbs = chapterId ? catalog.chapters.filter((item) => descendantChapterIds(catalog.chapters, item.id).has(chapterId)).sort((a, b) => chapterPath(catalog.chapters, a.id).length - chapterPath(catalog.chapters, b.id).length) : [];

  function goUp() {
    if (chapterId) setChapterId(catalog.chapters.find((item) => item.id === chapterId)?.parentId ?? null);
    else setSubjectId(null);
  }

  async function submitJson(payload: Record<string, unknown>) {
    const response = await fetch("/api/ent/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Enregistrement impossible.");
    setCatalog(result as EntCatalog);
    return result as EntCatalog;
  }

  async function changeItem(method: "PATCH" | "DELETE", payload: Record<string, unknown>) {
    const response = await fetch("/api/ent/catalog", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Modification impossible.");
    setCatalog(result as EntCatalog);
    return result as EntCatalog;
  }

  function itemName(kind: EditableKind, id: string) {
    return kind === "subject" ? catalog.subjects.find((item) => item.id === id)?.name ?? ""
      : kind === "chapter" ? catalog.chapters.find((item) => item.id === id)?.title ?? ""
        : catalog.resources.find((item) => item.id === id)?.title ?? "";
  }

  function editItem(kind: EditableKind, id: string, mode: Editing["mode"]) {
    setError(""); setEditing({ kind, id, mode }); setEditName(itemName(kind, id));
    setEditTeacher(kind === "subject" ? catalog.subjects.find((item) => item.id === id)?.teacher ?? "" : "");
    const currentFolder = kind === "resource" ? catalog.resources.find((item) => item.id === id)?.chapterId : kind === "chapter" ? id : null;
    const folder = catalog.chapters.find((item) => item.id === currentFolder);
    setMoveTarget(folder ? `${folder.subjectId}/${kind === "chapter" ? folder.parentId ?? "root" : folder.id}` : `${subjectId ?? catalog.subjects[0]?.id}/root`);
    editDialog.current?.showModal();
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError("");
    try {
      if (editing.mode === "rename") await changeItem("PATCH", { action: "rename", kind: editing.kind, id: editing.id, name: editName, ...(editing.kind === "subject" ? { teacher: editTeacher } : {}) });
      else {
        const [destinationSubject, destinationParent] = moveTarget.split("/");
        await changeItem("PATCH", { action: "move", kind: editing.kind, id: editing.id, subjectId: destinationSubject, parentId: destinationParent === "root" ? null : destinationParent });
      }
      editDialog.current?.close(); setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Modification impossible."); }
    finally { setBusy(false); }
  }

  async function removeItem(kind: EditableKind, id: string) {
    const label = itemName(kind, id);
    const warning = kind === "resource" ? "Ce fichier sera retiré de la bibliothèque." : kind === "subject" ? "Cette matière et tous ses dossiers seront retirés de la bibliothèque." : "Ce dossier et tout son contenu seront retirés de la bibliothèque.";
    if (!window.confirm(`Supprimer « ${label} » ?\n${warning}\nLes fichiers supprimés restent dans la corbeille du serveur.`)) return;
    setBusy(true); setError("");
    try {
      await changeItem("DELETE", { kind, id });
      if (kind === "subject" && subjectId === id) { setSubjectId(null); setChapterId(null); }
      if (kind === "chapter" && chapterId && descendantChapterIds(catalog.chapters, id).has(chapterId)) setChapterId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Suppression impossible."); }
    finally { setBusy(false); }
  }

  function beginDrag(event: DragEvent<HTMLElement>, kind: "chapter" | "resource", id: string) {
    event.dataTransfer.setData("application/x-sioverse-item", JSON.stringify({ kind, id }));
    event.dataTransfer.effectAllowed = "move";
  }

  function allowDrop(event: DragEvent<HTMLElement>, key: string) {
    if (!event.dataTransfer.types.includes("application/x-sioverse-item")) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(key);
  }

  async function dropInto(event: DragEvent<HTMLElement>, destinationSubject: string, destinationParent: string | null) {
    event.preventDefault(); event.stopPropagation(); setDropTarget("");
    try {
      const source = JSON.parse(event.dataTransfer.getData("application/x-sioverse-item")) as { kind: "chapter" | "resource"; id: string };
      if (source.kind !== "chapter" && source.kind !== "resource") return;
      setBusy(true); setError("");
      await changeItem("PATCH", { action: "move", kind: source.kind, id: source.id, subjectId: destinationSubject, parentId: destinationParent });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Déplacement impossible."); }
    finally { setBusy(false); }
  }

  async function addSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const next = await submitJson({ action: "subject", name: data.get("name"), teacher: data.get("teacher") });
      setSubjectId(next.subjects.at(-1)?.id ?? null); setChapterId(null); setAddingSubject(false); form.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }

  async function addChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!subjectId) return;
    setBusy(true); setError("");
    const form = event.currentTarget;
    try {
      const parentId = chapterId;
      const next = await submitJson({ action: "chapter", subjectId, parentId, title: new FormData(form).get("title") });
      setChapterId(next.chapters.at(-1)?.id ?? null); if (parentId) setExpandedIds((ids) => [...new Set([...ids, parentId])]); setAddingChapter(false); form.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }

  async function addResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const resourceKind = data.get("kind");
    try {
      let response: Response;
      if (resourceKind === "LINK") {
        response = await fetch("/api/ent/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", chapterId: data.get("chapterId"), title: data.get("title"), teacher: data.get("teacher"), url: data.get("url") }) });
      } else {
        response = await fetch("/api/ent/upload", { method: "POST", body: data });
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Ressource non enregistrée.");
      setCatalog(result as EntCatalog); setView("all"); setKind("ALL"); setQuery("");
      setChapterId(String(data.get("chapterId"))); addDialog.current?.close(); form.reset(); setNewResourceKind("COURSE");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ressource non enregistrée."); }
    finally { setBusy(false); }
  }

  async function importMany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFiles.length) { setError("Choisis un dossier ou des fichiers à importer."); return; }
    setBusy(true); setError("");
    const data = new FormData();
    data.set("subjectId", importSubjectId);
    data.set("parentId", importParentId);
    for (const file of importFiles) { data.append("files", file); data.append("paths", file.webkitRelativePath || file.name); }
    try {
      const response = await fetch("/api/ent/import", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Import impossible.");
      setCatalog(result.catalog as EntCatalog);
      setSubjectId(importSubjectId); setChapterId(importParentId || null); setView("all"); setKind("ALL"); setQuery("");
      setImportNotice(`${result.imported} fichier${result.imported > 1 ? "s" : ""} importé${result.imported > 1 ? "s" : ""}, ${result.folders} dossier${result.folders > 1 ? "s" : ""} créé${result.folders > 1 ? "s" : ""}.${result.duplicates ? ` ${result.duplicates} doublon(s) ignoré(s).` : ""}${result.skipped?.length ? ` ${result.skipped.length} fichier(s) non pris en charge.` : ""}`);
      setImportFiles([]); importDialog.current?.close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import impossible."); }
    finally { setBusy(false); }
  }

  function toggleFavorite(id: string) {
    const updated = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    setFavorites(updated); window.localStorage.setItem(personalFavoriteKey, JSON.stringify(updated));
  }

  function remember(id: string) {
    const updated = [id, ...recent.filter((item) => item !== id)].slice(0, 20);
    setRecent(updated); window.localStorage.setItem(personalRecentKey, JSON.stringify(updated));
  }

  function openResource(resource: EntResource) {
    remember(resource.id);
    if (resource.storedName) { setPreview(resource); previewDialog.current?.showModal(); }
  }

  function chapterTree(parentId: string | null, depth = 0): React.ReactNode {
    return chapters.filter((chapter) => chapter.parentId === parentId).map((chapter) => {
      const hasChildren = chapters.some((child) => child.parentId === chapter.id);
      const expanded = expandedIds.includes(chapter.id);
      return <div className="ent-chapter-node" key={chapter.id}>
        <div className={`ent-chapter-row ${chapterId === chapter.id ? "selected" : ""} ${dropTarget === chapter.id ? "is-drop-target" : ""}`} style={{ paddingLeft: `${7 + depth * 13}px` }} draggable={canManage} onDragStart={(event) => canManage && beginDrag(event, "chapter", chapter.id)} onDragOver={(event) => canManage && allowDrop(event, chapter.id)} onDragLeave={() => setDropTarget("")} onDrop={(event) => canManage && dropInto(event, chapter.subjectId, chapter.id)}>
          <button type="button" className="ent-chapter-expand" aria-label={`${expanded ? "Réduire" : "Déplier"} ${chapter.title}`} aria-expanded={expanded} onClick={() => { setExpandedIds((ids) => ids.includes(chapter.id) ? ids.filter((id) => id !== chapter.id) : [...ids, chapter.id]); if (expanded && chapterId && descendantChapterIds(catalog.chapters, chapter.id).has(chapterId)) setChapterId(chapter.parentId); else if (!expanded) setChapterId(chapter.id); }}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
          <button type="button" className="ent-chapter-select" onClick={() => { setChapterId(chapter.id); setExpandedIds((ids) => ids.includes(chapter.id) ? ids : [...ids, chapter.id]); }}><FolderOpen size={13} />{chapter.title}</button>
        </div>
        {hasChildren && expanded && chapterTree(chapter.id, depth + 1)}
      </div>;
    });
  }

  return <div className="os-app-page ent-page">
    <header className="ent-heading"><div><span className="app-eyebrow"><BookOpen size={16} /> BIBLIOTHÈQUE SIO</span><h2>Mes ressources<span>.</span></h2><p>Cours, exercices et projets rangés dans leurs dossiers.</p></div>{canManage && <div className="ent-heading-actions"><button type="button" className="ent-secondary" disabled={!catalog.subjects.length} onClick={() => { setError(""); setImportSubjectId(subjectId ?? catalog.subjects[0]?.id ?? ""); setImportParentId(chapterId ?? ""); setImportFiles([]); importDialog.current?.showModal(); }}><Upload size={16} /> Importer un dossier / ZIP</button><button type="button" className="ent-primary" disabled={!catalog.chapters.length} onClick={() => { setError(""); setDraftChapterId(chapterId ?? chapters[0]?.id ?? catalog.chapters[0]?.id ?? ""); addDialog.current?.showModal(); }}><Plus size={16} /> Ajouter un fichier</button></div>}</header>
    <div className="ent-explorer">
      <aside className="ent-sidebar" aria-label="Matières et chapitres">
        <div className="ent-sidebar-heading"><strong>MATIÈRES</strong>{canManage && <button type="button" aria-label="Ajouter une matière" onClick={() => { setError(""); setAddingSubject(!addingSubject); }}><Plus size={15} /></button>}</div>
        {addingSubject && <form className="ent-mini-form" onSubmit={addSubject}><label>Nom de la matière<input name="name" required minLength={2} maxLength={120} placeholder="Ex. Réseaux" /></label><label>Professeur <small>(facultatif)</small><input name="teacher" maxLength={120} placeholder="Nom du professeur" /></label><button disabled={busy}>Créer la matière</button></form>}
        <button type="button" className={`ent-tree-all ${!subjectId ? "selected" : ""}`} onClick={() => { setSubjectId(null); setChapterId(null); }}><FolderOpen size={16} /> Toutes les matières <span>{catalog.resources.length}</span></button>
        {catalog.subjects.map((subject) => <div className="ent-subject-group" key={subject.id}>
          <button type="button" className={`ent-subject-row ${subjectId === subject.id ? "selected" : ""} ${dropTarget === subject.id ? "is-drop-target" : ""}`} onClick={() => { setSubjectId(subject.id); setChapterId(null); }} onDragOver={(event) => canManage && allowDrop(event, subject.id)} onDragLeave={() => setDropTarget("")} onDrop={(event) => canManage && dropInto(event, subject.id, null)}><span className={`ent-subject-mark ent-tone-${subject.color}`} /><span><strong>{subject.name}</strong>{subject.teacher && <small>{subject.teacher}</small>}</span><ChevronRight size={14} /></button>
          {subjectId === subject.id && <div className="ent-chapter-tree">
            <button type="button" className={!chapterId ? "selected" : ""} onClick={() => setChapterId(null)}>Tous les dossiers</button>
            {chapterTree(null)}
            {canManage && (addingChapter ? <form className="ent-mini-form" onSubmit={addChapter}><label>{chapterId ? "Sous-dossier" : "Nouveau dossier"}<input name="title" required minLength={2} maxLength={120} placeholder="Nom du dossier" /></label><button disabled={busy}>Créer</button></form> : <button type="button" className="ent-add-chapter" onClick={() => { setError(""); setAddingChapter(true); }}><Plus size={13} /> {chapterId ? "Nouveau sous-dossier" : "Nouveau dossier"}</button>)}
          </div>}
        </div>)}
        {!catalog.subjects.length && <p className="ent-sidebar-empty">Commence par ajouter ta première matière.</p>}
      </aside>

      <section className="ent-content">
        <nav className="ent-addressbar" aria-label="Emplacement actuel"><button type="button" aria-label="Revenir au dossier parent" title="Dossier parent" disabled={!subjectId} onClick={goUp}><ArrowLeft size={17} /></button><button type="button" aria-label="Remonter d’un niveau" title="Remonter" disabled={!subjectId} onClick={goUp}><ArrowUp size={17} /></button><div className="ent-address-path"><button type="button" onClick={() => { setSubjectId(null); setChapterId(null); }}>Bibliothèque</button>{selectedSubject && <><ChevronRight size={14} /><button type="button" onClick={() => setChapterId(null)}>{selectedSubject.name}</button></>}{breadcrumbs.map((folder) => <span key={folder.id}><ChevronRight size={14} /><button type="button" onClick={() => setChapterId(folder.id)}>{folder.title}</button></span>)}</div></nav>
        <div className="ent-content-head"><div><span>EXPLORATEUR DE COURS</span><h3>{chapterId ? catalog.chapters.find((item) => item.id === chapterId)?.title : selectedSubject?.name ?? "Choisis une matière"}</h3><p>{subjectOverview ? `${catalog.subjects.length} matières · ${catalog.resources.length} ressources` : browsing ? `${visibleFolders.length} dossier${visibleFolders.length > 1 ? "s" : ""} · ${visibleResources.length} fichier${visibleResources.length > 1 ? "s" : ""}` : `${filtered.length} ressource${filtered.length > 1 ? "s" : ""}`}</p>{canManage && (chapterId || subjectId) && <div className="ent-context-actions"><button type="button" onClick={() => editItem(chapterId ? "chapter" : "subject", chapterId ?? subjectId!, "rename")}><Pencil size={13} /> Renommer</button>{chapterId && <button type="button" onClick={() => editItem("chapter", chapterId, "move")}><FolderOpen size={13} /> Déplacer</button>}<button type="button" onClick={() => removeItem(chapterId ? "chapter" : "subject", chapterId ?? subjectId!)}><Trash2 size={13} /> Supprimer</button></div>}</div><div className="ent-search"><Search size={16} /><input aria-label="Rechercher une ressource, une matière, un chapitre ou un professeur" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher partout…" /></div></div>
        <div className="ent-filterbar"><div className="ent-view-tabs">{(["all", "favorites", "recent"] as const).map((item) => <button type="button" key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "all" ? <FolderOpen size={14} /> : item === "favorites" ? <Star size={14} /> : <Clock3 size={14} />}{item === "all" ? "Tous" : item === "favorites" ? "Favoris" : "Récents"}</button>)}</div><div className="ent-explorer-options"><select aria-label="Trier les ressources" value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="name">Nom A → Z</option><option value="date">Plus récent</option><option value="type">Type</option></select><select aria-label="Filtrer par type de ressource" value={kind} onChange={(event) => setKind(event.target.value as ResourceKind | "ALL")}><option value="ALL">Tous les types</option>{resourceKinds.map((item) => <option key={item} value={item}>{resourceKindLabel(item)}</option>)}</select><div className="ent-layout-toggle" aria-label="Affichage"><button type="button" title="Détails" aria-label="Affichage en détails" aria-pressed={layout === "details"} className={layout === "details" ? "active" : ""} onClick={() => setLayout("details")}><List size={17} /></button><button type="button" title="Mosaïque" aria-label="Affichage en mosaïque" aria-pressed={layout === "tiles"} className={layout === "tiles" ? "active" : ""} onClick={() => setLayout("tiles")}><Grid2X2 size={16} /></button></div></div></div>
        {subjectOverview ? <div className={`ent-resource-list ent-list-${layout}`}><div className="ent-folder-grid">{catalog.subjects.map((subject) => { const count = catalog.resources.filter((resource) => catalog.chapters.some((chapter) => chapter.id === resource.chapterId && chapter.subjectId === subject.id)).length; return <button type="button" className={`ent-folder-card ${dropTarget === subject.id ? "is-drop-target" : ""}`} key={subject.id} onClick={() => { setSubjectId(subject.id); setChapterId(null); }} onDragOver={(event) => canManage && allowDrop(event, subject.id)} onDragLeave={() => setDropTarget("")} onDrop={(event) => canManage && dropInto(event, subject.id, null)}><span className={`ent-resource-icon ent-tone-${subject.color}`}><FolderOpen size={20} /></span><span><strong>{subject.name}</strong><small>{count} ressource{count > 1 ? "s" : ""} · {subject.teacher}</small></span><ChevronRight size={16} /></button>; })}</div></div> : visibleFolders.length || visibleResources.length ? <div className={`ent-resource-list ent-list-${layout}`}>{layout === "details" && <div className="ent-details-header"><span>Nom</span><span>Type</span><span>Modifié le</span><span>Taille</span><span>Actions</span></div>}{visibleFolders.length > 0 && <div className="ent-folder-grid">{visibleFolders.map((folder) => { const count = catalog.resources.filter((resource) => descendantChapterIds(catalog.chapters, folder.id).has(resource.chapterId)).length; return <div className={`ent-folder-card ${dropTarget === folder.id ? "is-drop-target" : ""}`} key={folder.id} draggable={canManage} onDragStart={(event) => canManage && beginDrag(event, "chapter", folder.id)} onDragOver={(event) => canManage && allowDrop(event, folder.id)} onDragLeave={() => setDropTarget("")} onDrop={(event) => canManage && dropInto(event, folder.subjectId, folder.id)}><button type="button" className="ent-folder-open" onClick={() => { setChapterId(folder.id); setExpandedIds((ids) => [...new Set([...ids, folder.id])]); }}><span className="ent-resource-icon ent-tone-blue"><FolderOpen size={20} /></span><span><strong>{folder.title}</strong><small>{count} ressource{count > 1 ? "s" : ""}</small></span></button><span className="ent-folder-type">Dossier</span><span className="ent-folder-date">—</span><span className="ent-folder-size">—</span>{canManage && <div className="ent-card-tools"><button type="button" title="Renommer" aria-label={`Renommer ${folder.title}`} onClick={() => editItem("chapter", folder.id, "rename")}><Pencil size={14} /></button><button type="button" title="Déplacer" aria-label={`Déplacer ${folder.title}`} onClick={() => editItem("chapter", folder.id, "move")}><FolderOpen size={14} /></button><button type="button" title="Supprimer" aria-label={`Supprimer ${folder.title}`} onClick={() => removeItem("chapter", folder.id)}><Trash2 size={14} /></button></div>}</div>; })}</div>}{visibleResources.map((resource) => {
          const chapter = catalog.chapters.find((item) => item.id === resource.chapterId);
          const subject = catalog.subjects.find((item) => item.id === chapter?.subjectId);
          const Icon = resourceIcon(resource.kind);
          return <article className="ent-resource-card" key={resource.id} draggable={canManage} onDragStart={(event) => canManage && beginDrag(event, "resource", resource.id)}><span className={`ent-resource-icon ent-tone-${subject?.color ?? "blue"}`}><Icon size={20} /></span><div className="ent-resource-copy"><span className="ent-kind">{resourceKindLabel(resource.kind)} <i>·</i> {subject?.name} <i>/</i> {chapter && chapterPath(catalog.chapters, chapter.id).join(" / ")}</span><h4>{resource.title}</h4><small>{[resource.teacher || subject?.teacher, resource.originalName].filter(Boolean).join(" · ")}</small></div><span className="ent-resource-type">{resource.originalName?.split(".").at(-1)?.toUpperCase() ?? resourceKindLabel(resource.kind)}</span><span className="ent-resource-date">{displayDate(resource.createdAt)}</span><span className="ent-resource-size">{fileSize(resource.sizeBytes)}</span><div className="ent-resource-actions"><button type="button" className={favorites.includes(resource.id) ? "is-favorite" : ""} aria-label={favorites.includes(resource.id) ? `Retirer ${resource.title} des favoris` : `Ajouter ${resource.title} aux favoris`} aria-pressed={favorites.includes(resource.id)} onClick={() => toggleFavorite(resource.id)}><Star size={16} fill={favorites.includes(resource.id) ? "currentColor" : "none"} /></button>{canManage && <><button type="button" aria-label={`Renommer ${resource.title}`} title="Renommer" onClick={() => editItem("resource", resource.id, "rename")}><Pencil size={15} /></button><button type="button" aria-label={`Déplacer ${resource.title}`} title="Déplacer" onClick={() => editItem("resource", resource.id, "move")}><FolderOpen size={15} /></button><button type="button" aria-label={`Supprimer ${resource.title}`} title="Supprimer" onClick={() => removeItem("resource", resource.id)}><Trash2 size={15} /></button></>}{resource.externalUrl ? <a href={resource.externalUrl} target="_blank" rel="noopener noreferrer" onClick={() => remember(resource.id)} aria-label={`Ouvrir ${resource.title}`}><ExternalLink size={17} /></a> : <button type="button" onClick={() => openResource(resource)} aria-label={`Ouvrir ${resource.title}`}><ChevronRight size={18} /></button>}</div></article>;
        })}</div> : <div className="ent-empty"><FolderOpen size={28} /><h4>{!catalog.subjects.length ? "Ta bibliothèque commence ici" : browsing ? "Ce dossier est vide" : "Aucun résultat"}</h4><p>{!catalog.subjects.length ? canManage ? "Ajoute une matière, puis un dossier, pour classer tes premiers documents." : "Aucune matière disponible pour le moment." : browsing ? canManage ? "Ajoute un document ou importe un dossier complet dans cette matière." : "Ce dossier ne contient pas encore de document." : "Essaie un autre mot-clé ou change les filtres."}</p>{canManage && !catalog.subjects.length && <button type="button" className="ent-primary" onClick={() => { setError(""); setAddingSubject(true); }}>Créer ma première matière</button>}</div>}
      </section>
    </div>
    {importNotice && <p className="ent-import-notice" role="status">{importNotice}</p>}
    {error && <p className="ent-error" role="alert">{error}</p>}
    <div className={`app-info-note ${catalog.storageStatus === "local" ? "ent-storage-warning" : ""}`}><BookOpen size={16} /> {catalog.storageStatus === "postgres" ? "Classement synchronisé avec PostgreSQL. Fichiers sur ce serveur ; favoris et historique sur cet appareil." : "PostgreSQL non connecté : classement gardé localement et synchronisé dès que la connexion revient."}</div>

    <dialog ref={addDialog} className="ent-dialog" onClose={() => setError("")}><form method="dialog" className="ent-dialog-close"><button aria-label="Fermer"><X size={18} /></button></form><div className="ent-dialog-heading"><span><Upload size={20} /></span><h3>Ajouter une ressource</h3><p>Range-la dans un dossier pour la retrouver et la lier à tes révisions.</p></div><form className={`ent-form ${newResourceKind === "LINK" ? "is-link" : ""}`} onSubmit={addResource}><label>Titre<input name="title" required minLength={2} maxLength={120} placeholder="Ex. Les bases du modèle OSI" /></label><label>Dossier<select name="chapterId" required value={draftChapterId} onChange={(event) => setDraftChapterId(event.target.value)}>{catalog.subjects.map((subject) => <optgroup label={subject.name} key={subject.id}>{catalog.chapters.filter((item) => item.subjectId === subject.id).map((chapter) => <option value={chapter.id} key={chapter.id}>{chapterPath(catalog.chapters, chapter.id).join(" / ")}</option>)}</optgroup>)}</select></label><label>Type<select name="kind" value={newResourceKind} onChange={(event) => setNewResourceKind(event.target.value as ResourceKind)}>{resourceKinds.filter((item) => item !== "ARCHIVE").map((item) => <option value={item} key={item}>{resourceKindLabel(item)}</option>)}</select></label><label>Professeur <small>(facultatif)</small><input name="teacher" maxLength={120} placeholder="Nom du professeur" /></label><label className="ent-file-field">Document <small>PDF, Office, code, Packet Tracer… · 25 Mo max</small><input name="file" type="file" required={newResourceKind !== "LINK"} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.py,.java,.js,.ts,.jsx,.tsx,.html,.css,.json,.xml,.sql,.csv,.yml,.yaml,.pkt,.loo,.zip,.tar,.tgz,.gz" /></label><label className="ent-url-field">Lien web<input name="url" type="url" required={newResourceKind === "LINK"} placeholder="https://…" /></label><button className="ent-primary" disabled={busy}>{busy ? "Enregistrement…" : "Ajouter à la bibliothèque"}</button></form>{error && <p className="ent-error" role="alert">{error}</p>}</dialog>

    <dialog ref={importDialog} className="ent-dialog" onClose={() => { setError(""); setImportFiles([]); }}><form method="dialog" className="ent-dialog-close"><button aria-label="Fermer"><X size={18} /></button></form><div className="ent-dialog-heading"><span><FolderOpen size={20} /></span><h3>Importer des ressources</h3><p>Un dossier conserve son arborescence. Les archives ZIP, TAR et TAR.GZ restent intactes et téléchargeables.</p></div><form className="ent-form" onSubmit={importMany}><label>Matière<select value={importSubjectId} onChange={(event) => { setImportSubjectId(event.target.value); setImportParentId(""); }}>{catalog.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Dans le dossier <small>(facultatif)</small><select value={importParentId} onChange={(event) => setImportParentId(event.target.value)}><option value="">À la racine de la matière</option>{catalog.chapters.filter((item) => item.subjectId === importSubjectId).map((item) => <option value={item.id} key={item.id}>{chapterPath(catalog.chapters, item.id).join(" / ")}</option>)}</select></label><div className="ent-import-modes"><button type="button" className={importMode === "folder" ? "active" : ""} onClick={() => { setImportMode("folder"); setImportFiles([]); }}>Dossier complet</button><button type="button" className={importMode === "files" ? "active" : ""} onClick={() => { setImportMode("files"); setImportFiles([]); }}>Fichiers / archives</button></div><label>Choisir {importMode === "folder" ? "un dossier" : "des fichiers ou des archives"}<input key={importMode} type="file" multiple {...(importMode === "folder" ? { webkitdirectory: "" } : {})} onChange={(event) => setImportFiles(Array.from(event.target.files ?? []))} /></label><p className="ent-import-summary">{importFiles.length ? `${importFiles.length} fichier(s) sélectionné(s) · ${(importFiles.reduce((total, file) => total + file.size, 0) / 1024 / 1024).toFixed(1)} Mo` : "Jusqu’à 300 fichiers et 100 Mo par import. Les fichiers cachés et formats inconnus sont ignorés."}</p><button className="ent-primary" disabled={busy || !importFiles.length}>{busy ? "Import en cours…" : "Importer dans la bibliothèque"}</button></form>{error && <p className="ent-error" role="alert">{error}</p>}</dialog>

    <dialog ref={editDialog} className="ent-dialog" onClose={() => { setEditing(null); setError(""); }}><form method="dialog" className="ent-dialog-close"><button aria-label="Fermer"><X size={18} /></button></form>{editing && <><div className="ent-dialog-heading"><span>{editing.mode === "rename" ? <Pencil size={20} /> : <FolderOpen size={20} />}</span><h3>{editing.mode === "rename" ? "Renommer" : "Déplacer"} {editing.kind === "resource" ? "la ressource" : editing.kind === "chapter" ? "le dossier" : "la matière"}</h3><p>{itemName(editing.kind, editing.id)}</p></div><form className="ent-form" onSubmit={submitEdit}>{editing.mode === "rename" ? <><label>Nouveau nom<input autoFocus required minLength={2} maxLength={120} value={editName} onChange={(event) => setEditName(event.target.value)} /></label>{editing.kind === "subject" && <label>Professeur<input maxLength={120} value={editTeacher} onChange={(event) => setEditTeacher(event.target.value)} /></label>}</> : <label>Destination<select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>{catalog.subjects.map((subject) => <optgroup label={subject.name} key={subject.id}>{editing.kind === "chapter" && <option value={`${subject.id}/root`}>Racine de {subject.name}</option>}{catalog.chapters.filter((chapter) => chapter.subjectId === subject.id && !(editing.kind === "chapter" && descendantChapterIds(catalog.chapters, editing.id).has(chapter.id))).map((chapter) => <option key={chapter.id} value={`${subject.id}/${chapter.id}`}>{chapterPath(catalog.chapters, chapter.id).join(" / ")}</option>)}</optgroup>)}</select></label>}<button className="ent-primary" disabled={busy}>{busy ? "Enregistrement…" : editing.mode === "rename" ? "Enregistrer le nom" : "Déplacer ici"}</button></form>{error && <p className="ent-error" role="alert">{error}</p>}</>}</dialog>

    <dialog ref={previewDialog} className="ent-dialog ent-preview" onClose={() => setPreview(null)}><form method="dialog" className="ent-dialog-close"><button aria-label="Fermer"><X size={18} /></button></form>{preview && <><span className="ent-kind">{resourceKindLabel(preview.kind)}</span><h3>{preview.title}</h3><p>{preview.originalName}</p>{preview.mimeType && /^(application\/pdf|image\/|text\/plain)/.test(preview.mimeType) ? <iframe title={`Aperçu de ${preview.title}`} src={`/api/ent/files/${preview.id}`} /> : <div className="ent-no-preview">L’aperçu n’est pas disponible pour ce type de fichier.</div>}<a className="ent-primary" href={`/api/ent/files/${preview.id}`} download={preview.originalName ?? undefined}><Download size={16} /> Télécharger le document</a></>}</dialog>
  </div>;
}

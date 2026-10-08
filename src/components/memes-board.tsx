"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { Heart, Image as ImageIcon, MessageCircle, Plus, Send, Star, Trash2, X } from "lucide-react";
import type { MemeDetail, MemeEntry } from "@/lib/memes";
import type { PersonOption } from "@/lib/people";
import { ConcernedPeoplePicker } from "./concerned-people-picker";
import { ConcernedPeopleDisplay } from "./concerned-people-display";
import { ContentPeopleEditor } from "./content-people-editor";

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(date));
}

export function MemesBoard({ initialMemes, initialPeople, canManage }: { initialMemes: MemeEntry[]; initialPeople: PersonOption[]; canManage: boolean }) {
  const [memes, setMemes] = useState(initialMemes);
  const [peopleOptions, setPeopleOptions] = useState(initialPeople);
  const [adding, setAdding] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemeDetail | null>(null);
  const [modalError, setModalError] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [comment, setComment] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);
  const selected = memes.find((meme) => meme.id === selectedId) ?? null;
  const ordered = useMemo(() => [...memes].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt.localeCompare(a.createdAt)), [memes]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("meme");
    if (!id || !initialMemes.some((meme) => meme.id === id)) return;
    const timer = window.setTimeout(() => setSelectedId(id), 0);
    return () => window.clearTimeout(timer);
  }, [initialMemes]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function keyDown(event: KeyboardEvent) { if (event.key === "Escape") setSelectedId(null); }
    window.addEventListener("keydown", keyDown);
    fetch("/api/memes/" + selectedId + "/interactions", { signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Mème indisponible."); return result as MemeDetail; })
      .then(setDetail)
      .catch((cause) => { if (!controller.signal.aborted) setModalError(cause instanceof Error ? cause.message : "Chargement impossible."); });
    return () => { controller.abort(); document.body.style.overflow = oldOverflow; window.removeEventListener("keydown", keyDown); };
  }, [selectedId]);

  function open(id: string) { setSelectedId(id); setDetail(null); setModalError(""); setComment(""); }
  function close() { if (!modalBusy) setSelectedId(null); }
  function updateStats(id: string, result: MemeDetail) {
    setMemes((items) => items.map((item) => item.id === id ? { ...item, likeCount: result.likeCount, commentCount: result.commentCount, liked: result.liked, favorite: result.favorite } : item));
    if (selectedId === id) setDetail(result);
  }
  async function interact(id: string, method: "PATCH" | "POST" | "DELETE", payload: object) {
    setModalBusy(true); setModalError("");
    try {
      const response = await fetch("/api/memes/" + id + "/interactions", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Action impossible.");
      updateStats(id, result as MemeDetail);
      if (method === "POST") setComment("");
    } catch (cause) { const message = cause instanceof Error ? cause.message : "Action impossible."; setModalError(message); if (!selectedId) setError(message); }
    finally { setModalBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!selectedPeople.length) { setError("Coche au moins une personne concernée."); return; }
    setBusy(true);
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/memes", { method: "POST", body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Publication impossible.");
      setMemes(result.memes as MemeEntry[]);
      setSelectedPeople([]); form.reset(); setAdding(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Publication impossible."); }
    finally { setBusy(false); }
  }

  return <section className="lore-board memes-board">
    <div className="lore-board-heading"><div><span>LE FEED DE LA PROMO</span><h2>Les Mèmes<span>.</span></h2><p>Ouvre un mème pour réagir, commenter ou l’ajouter à tes favoris.</p></div>{canManage && <button type="button" className="lore-add-button" onClick={() => setAdding((value) => !value)}><Plus size={17} /> Ajouter un GIF ou mème</button>}</div>
    {adding && <form className="lore-editor memes-editor" onSubmit={create}><div className="lore-editor-head"><strong>Nouveau mème</strong><button type="button" onClick={() => { setAdding(false); setSelectedPeople([]); }}>Fermer</button></div><div className="lore-editor-grid"><label>Titre<input name="title" required minLength={2} maxLength={120} placeholder="Nom du GIF ou du mème" /></label><label>GIF ou image <small>(GIF, PNG, JPEG, WebP · 10 Mo max)</small><input name="media" type="file" required accept="image/gif,image/png,image/jpeg,image/webp,.gif,.png,.jpg,.jpeg,.webp" /></label></div><label>Contexte ou légende <small>(facultatif)</small><textarea name="body" maxLength={8000} rows={3} placeholder="La petite histoire derrière ce moment…" /></label><ConcernedPeoplePicker people={peopleOptions} selected={selectedPeople} onChange={setSelectedPeople} onCreated={(person) => setPeopleOptions((items) => [...items, person])} />{error && <p role="alert" className="lore-error">{error}</p>}<button className="lore-add-button" disabled={busy || !selectedPeople.length}>{busy ? "Publication…" : "Publier le mème"}</button></form>}
    {!adding && error && <p role="alert" className="meme-modal-error">{error}</p>}
    {ordered.length ? <div className="lore-entry-grid meme-entry-grid">{ordered.map((meme) => <article className="lore-entry meme-entry" key={meme.id}>
      <div className="lore-entry-top"><span><ImageIcon size={15} /> {meme.mediaType === "image/gif" ? "GIF" : "IMAGE"} · MÈME</span><time dateTime={meme.createdAt}>{dateLabel(meme.createdAt)}</time></div>
      <button type="button" className="meme-card-open" onClick={() => open(meme.id)} aria-label={"Agrandir " + meme.title}><Image src={"/api/memes/gif/" + meme.id} alt={meme.title} width={720} height={405} unoptimized className="lore-gif" /><span>Agrandir et réagir</span></button>
      <div className="meme-card-title"><h3>{meme.title}</h3>{meme.favorite && <span><Star size={13} fill="currentColor" /> Favori</span>}</div>
      {meme.body && <p>{meme.body}</p>}<ConcernedPeopleDisplay people={meme.concerned} />
      <div className="meme-card-actions"><button type="button" onClick={() => open(meme.id)}><Heart size={15} fill={meme.liked ? "currentColor" : "none"} /> {meme.likeCount}</button><button type="button" onClick={() => open(meme.id)}><MessageCircle size={15} /> {meme.commentCount}</button><button type="button" className={meme.favorite ? "active" : ""} disabled={modalBusy} title={meme.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => interact(meme.id, "PATCH", { kind: "favorite", active: !meme.favorite })}><Star size={15} fill={meme.favorite ? "currentColor" : "none"} /> {meme.favorite ? "Favori" : "Favoris"}</button></div>
      {canManage && <button type="button" className="content-people-edit-button" onClick={() => setEditingId(editingId === meme.id ? null : meme.id)}>{editingId === meme.id ? "Fermer la modification" : "Modifier les personnes"}</button>}{editingId === meme.id && <ContentPeopleEditor contentId={meme.id} people={peopleOptions} current={meme.concerned} onCreated={(person) => setPeopleOptions((items) => [...items, person])} onSaved={(concerned) => { setMemes((items) => items.map((item) => item.id === meme.id ? { ...item, concerned, people: concerned.map((person) => person.name) } : item)); setEditingId(null); }} onClose={() => setEditingId(null)} />}
    </article>)}</div> : <div className="lore-empty"><ImageIcon size={36} /><h3>Pas encore de mème</h3><p>Les GIFs et les moments cultes de la classe apparaîtront ici.</p></div>}
    {selected && <div className="meme-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="meme-modal" role="dialog" aria-modal="true" aria-labelledby="meme-modal-title"><button ref={closeButton} type="button" className="meme-modal-close" onClick={close} aria-label="Fermer le mème"><X size={20} /></button><div className="meme-modal-media"><Image src={"/api/memes/gif/" + selected.id} alt={selected.title} width={1200} height={900} unoptimized /></div><div className="meme-modal-side"><div className="meme-modal-heading"><span>{selected.mediaType === "image/gif" ? "GIF" : "IMAGE"} · {dateLabel(selected.createdAt)}</span><h2 id="meme-modal-title">{selected.title}</h2>{selected.body && <p>{selected.body}</p>}<ConcernedPeopleDisplay people={selected.concerned} /></div><div className="meme-modal-reactions"><button type="button" className={(detail?.liked ?? selected.liked) ? "liked" : ""} disabled={modalBusy || !detail} onClick={() => interact(selected.id, "PATCH", { kind: "like", active: !(detail?.liked ?? selected.liked) })}><Heart size={18} fill={(detail?.liked ?? selected.liked) ? "currentColor" : "none"} /> {detail?.likeCount ?? selected.likeCount} J’aime</button><button type="button" className={(detail?.favorite ?? selected.favorite) ? "favorite" : ""} disabled={modalBusy || !detail} onClick={() => interact(selected.id, "PATCH", { kind: "favorite", active: !(detail?.favorite ?? selected.favorite) })}><Star size={18} fill={(detail?.favorite ?? selected.favorite) ? "currentColor" : "none"} /> {(detail?.favorite ?? selected.favorite) ? "Dans mes favoris" : "Ajouter aux favoris"}</button></div><div className="meme-comments"><div className="meme-comments-title"><MessageCircle size={17} /><strong>Commentaires</strong><span>{detail?.commentCount ?? selected.commentCount}</span></div>{modalError && <p role="alert" className="meme-modal-error">{modalError}</p>}<form onSubmit={(event) => { event.preventDefault(); if (comment.trim()) void interact(selected.id, "POST", { body: comment.trim() }); }}><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={3} placeholder="Écris un commentaire pour la classe…" /><button type="submit" disabled={modalBusy || !detail || !comment.trim()}><Send size={15} /> Envoyer</button></form><div className="meme-comment-list">{!detail && !modalError && <p className="meme-comments-empty">Chargement des commentaires…</p>}{detail?.comments.length === 0 && <p className="meme-comments-empty">Aucun commentaire pour l’instant. Lance la discussion !</p>}{detail?.comments.map((item) => <div className="meme-comment" key={item.id}><div><strong>{item.authorName}</strong><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time>{(item.isMine || canManage) && <button type="button" title="Supprimer ce commentaire" disabled={modalBusy} onClick={() => { if (window.confirm("Supprimer ce commentaire ?")) void interact(selected.id, "DELETE", { commentId: item.id }); }}><Trash2 size={14} /></button>}</div><p>{item.body}</p></div>)}</div></div></div></div></div>}
  </section>;
}

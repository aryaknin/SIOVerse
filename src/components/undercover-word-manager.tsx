"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Pencil, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import Link from "next/link";
import type { UndercoverWordPair, WordMode } from "@/lib/undercover";

export function UndercoverWordManager({ initialWords }: { initialWords: UndercoverWordPair[] }) {
  const [words, setWords] = useState(initialWords);
  const [mode, setMode] = useState<WordMode>("NORMAL");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visible = useMemo(() => words.filter((pair) => pair.mode === mode && `${pair.civil} ${pair.undercover}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr"))), [words, mode, query]);

  async function request(method: "POST" | "PATCH" | "DELETE", body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/undercover/words", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Action impossible.");
      setWords(result.words);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action impossible."); return false; }
    finally { setBusy(false); }
  }

  async function addPair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (await request("POST", { mode, civil: data.get("civil"), undercover: data.get("undercover") })) form.reset();
  }

  async function editPair(event: FormEvent<HTMLFormElement>, pair: UndercoverWordPair) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    if (await request("PATCH", { id: pair.id, civil: data.get("civil"), undercover: data.get("undercover") })) setEditing(null);
  }

  return <main className="undercover-admin">
    <header className="undercover-admin-head">
      <Link href="/sioverse/undercover"><ArrowLeft size={17} /> Retour au jeu</Link>
      <span><ShieldCheck size={15} /> ADMINISTRATION UNDERCOVER</span>
      <h1>Le dictionnaire<span>.</span></h1>
      <p>Gérez les duos de mots classiques et les références privées de la classe.</p>
    </header>
    <section className="undercover-admin-shell">
      <div className="undercover-word-tabs"><button className={mode === "NORMAL" ? "active" : ""} onClick={() => setMode("NORMAL")}>Mots classiques <b>{words.filter((pair) => pair.mode === "NORMAL").length}</b></button><button className={mode === "SIO" ? "active" : ""} onClick={() => setMode("SIO")}>Mots SIO <b>{words.filter((pair) => pair.mode === "SIO").length}</b></button></div>
      <form className="undercover-word-add" onSubmit={addPair}><label>Mot des Civils<input name="civil" required maxLength={60} placeholder={mode === "SIO" ? "Ex. professeur / anecdote…" : "Ex. Cinéma"} /></label><span>VS</span><label>Mot des Undercover<input name="undercover" required maxLength={60} placeholder={mode === "SIO" ? "Référence proche…" : "Ex. Théâtre"} /></label><button disabled={busy}><Plus size={17} /> Ajouter la paire</button></form>
      <div className="undercover-word-tools"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans ce dictionnaire…" /></label><span>{visible.length} paire{visible.length > 1 ? "s" : ""} · {visible.filter((pair) => pair.enabled).length} active{visible.length > 1 ? "s" : ""}</span></div>
      {error && <p className="undercover-error" role="alert">{error}</p>}
      <div className="undercover-word-list">
        {visible.map((pair, index) => editing === pair.id ? <form key={pair.id} className="undercover-word-row editing" onSubmit={(event) => editPair(event, pair)}><i>{String(index + 1).padStart(2, "0")}</i><input name="civil" defaultValue={pair.civil} required maxLength={60} /><span>↔</span><input name="undercover" defaultValue={pair.undercover} required maxLength={60} /><div><button disabled={busy} aria-label="Enregistrer"><Check size={16} /></button><button type="button" onClick={() => setEditing(null)} aria-label="Annuler"><X size={16} /></button></div></form> : <article key={pair.id} className={`undercover-word-row ${pair.enabled ? "" : "disabled"}`}><i>{String(index + 1).padStart(2, "0")}</i><strong>{pair.civil}</strong><span>↔</span><strong>{pair.undercover}</strong><div><button disabled={busy} onClick={() => void request("PATCH", { id: pair.id, enabled: !pair.enabled })} title={pair.enabled ? "Désactiver" : "Activer"}>{pair.enabled ? <Eye size={15} /> : <EyeOff size={15} />}</button><button onClick={() => setEditing(pair.id)} title="Modifier"><Pencil size={15} /></button><button className="danger" disabled={busy} onClick={() => { if (window.confirm(`Supprimer « ${pair.civil} / ${pair.undercover} » ?`)) void request("DELETE", { id: pair.id }); }} title="Supprimer"><Trash2 size={15} /></button></div></article>)}
        {!visible.length && <div className="undercover-word-empty">Aucune paire dans ce dictionnaire. Ajoutez la première juste au-dessus.</div>}
      </div>
    </section>
  </main>;
}

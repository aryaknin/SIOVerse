"use client";

import { useState } from "react";
import { Plus, UsersRound } from "lucide-react";
import type { PersonOption } from "@/lib/people";

const groups = [
  { kind: "STUDENT", label: "Élèves de la classe" },
  { kind: "TEACHER", label: "Professeurs" },
  { kind: "OTHER", label: "Autres personnes" },
] as const;

export function ConcernedPeoplePicker({ people, selected, onChange, onCreated }: { people: PersonOption[]; selected: string[]; onChange: (keys: string[]) => void; onCreated: (person: PersonOption) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"TEACHER" | "OTHER">("OTHER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]);
  }

  async function addPerson() {
    if (name.trim().length < 2) { setError("Entre un nom d’au moins deux caractères."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, kind }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Ajout impossible.");
      const person = result.person as PersonOption;
      onCreated(person);
      onChange([...selected, person.key]);
      setName(""); setAdding(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ajout impossible."); }
    finally { setBusy(false); }
  }

  return <fieldset className="meme-people-picker concerned-picker"><legend><UsersRound size={17} /> Personnes concernées <small>— au moins une</small></legend>
    {groups.map((group) => { const items = people.filter((person) => person.kind === group.kind); return items.length ? <section className="concerned-group" key={group.kind}><h4>{group.label}</h4><div>{items.map((person) => <label key={person.key} className={selected.includes(person.key) ? "selected" : ""}><input type="checkbox" name="personKeys" value={person.key} checked={selected.includes(person.key)} onChange={() => toggle(person.key)} /><span><strong>{person.name}</strong><small>{person.subtitle}</small></span></label>)}</div></section> : null; })}
    {!adding ? <button type="button" className="concerned-add-toggle" onClick={() => { setError(""); setAdding(true); }}><Plus size={15} /> Créer une personne concernée</button> : <div className="concerned-add-form"><strong>Ajouter une personne à la liste</strong><div><input aria-label="Nom de la nouvelle personne" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Nom et prénom" /><select aria-label="Type de personne" value={kind} onChange={(event) => setKind(event.target.value as "TEACHER" | "OTHER")}><option value="OTHER">Autre personne</option><option value="TEACHER">Professeur</option></select></div><div className="concerned-add-actions"><button type="button" onClick={addPerson} disabled={busy}>{busy ? "Ajout…" : "Ajouter et sélectionner"}</button><button type="button" onClick={() => { setAdding(false); setError(""); }}>Annuler</button></div>{error && <p role="alert" className="lore-error">{error}</p>}</div>}
  </fieldset>;
}

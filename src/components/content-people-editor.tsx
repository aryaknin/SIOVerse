"use client";

import { useState } from "react";
import type { PersonOption } from "@/lib/people";
import { ConcernedPeoplePicker } from "./concerned-people-picker";

export function ContentPeopleEditor({ contentId, people, current, onCreated, onSaved, onClose }: { contentId: string; people: PersonOption[]; current: PersonOption[]; onCreated: (person: PersonOption) => void; onSaved: (people: PersonOption[]) => void; onClose: () => void }) {
  const [selected, setSelected] = useState(current.map((person) => person.key).filter((key) => key.startsWith("user:") || key.startsWith("person:")));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!selected.length) { setError("Sélectionne au moins une personne concernée."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/content-people", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentId, personKeys: selected }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Modification impossible.");
      onSaved((result.concerned as Record<string, PersonOption[]>)[contentId] ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Modification impossible."); }
    finally { setBusy(false); }
  }

  return <div className="content-people-editor"><strong>Modifier les personnes concernées</strong><ConcernedPeoplePicker people={people} selected={selected} onChange={setSelected} onCreated={onCreated} />{error && <p role="alert" className="lore-error">{error}</p>}<div><button type="button" onClick={save} disabled={busy || !selected.length}>{busy ? "Enregistrement…" : "Enregistrer"}</button><button type="button" onClick={onClose}>Annuler</button></div></div>;
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function PersonProfileEditor({ personKey, initialHeadline, initialBio }: { personKey: string; initialHeadline: string; initialBio: string }) {
  const router = useRouter();
  const [headline, setHeadline] = useState(initialHeadline);
  const [bio, setBio] = useState(initialBio);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/people/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: personKey, headline, bio }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Modification impossible.");
      setEditing(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Modification impossible."); }
    finally { setBusy(false); }
  }
  return <section className="person-profile-about">
    <div className="person-profile-about-head"><h2>À propos</h2><button type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Fermer" : "Modifier la fiche"}</button></div>
    {editing ? <form onSubmit={save}><label>Accroche<input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={100} placeholder="Une phrase qui te résume" /></label><label>Présentation<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={3000} rows={6} placeholder="Présente-toi à la classe…" /></label>{error && <p role="alert">{error}</p>}<button type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button></form> : <><strong>{headline || "Un profil à écrire"}</strong><p>{bio || "Cette fiche attend encore sa présentation."}</p></>}
  </section>;
}

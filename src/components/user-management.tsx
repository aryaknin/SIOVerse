"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ClipboardCopy, KeyRound, Mail, Plus, Search, ShieldCheck, Ticket, Trash2, UserRound, UsersRound } from "lucide-react";
import type { ListedInvite, ListedUser, UserRole } from "@/lib/auth";

export function UserManagement({ initialUsers, currentUserId }: { initialUsers: ListedUser[]; currentUserId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; username: string; action: "email" | "password" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showInvites, setShowInvites] = useState(false);
  const [invites, setInvites] = useState<ListedInvite[]>([]);
  const [newInvite, setNewInvite] = useState("");
  const filtered = useMemo(() => users.filter((user) => `${user.username} ${user.email}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr"))), [users, query]);

  async function request(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Opération impossible.");
      setUsers(result.users as ListedUser[]);
      setNotice(method === "POST" ? "Compte créé." : method === "PATCH" ? payload.action === "password" ? "Mot de passe modifié. Les autres sessions de ce compte sont fermées." : payload.action === "email" ? "Adresse e-mail modifiée." : "Rôle mis à jour." : "Compte supprimé.");
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Opération impossible."); return false; }
    finally { setBusy(false); }
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const success = await request("POST", { username: data.get("username"), email: data.get("email"), password: data.get("password"), role: data.get("role") });
    if (success) { form.reset(); setAdding(false); }
  }

  async function changeRole(id: string, role: UserRole) { await request("PATCH", { id, role }); }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    if (await request("PATCH", { id: editing.id, action: editing.action, [editing.action === "email" ? "email" : "password"]: editValue })) { setEditing(null); setEditValue(""); }
  }
  async function remove(id: string, username: string) {
    if (!window.confirm(`Supprimer définitivement le compte « ${username} » ? Ses sessions seront fermées.`)) return;
    await request("DELETE", { id });
  }
  async function openInvites() {
    if (showInvites) { setShowInvites(false); setNewInvite(""); return; }
    setShowInvites(true); setError("");
    try {
      const response = await fetch("/api/invites");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Invitations indisponibles.");
      setInvites(result.invites as ListedInvite[]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitations indisponibles."); }
  }
  async function addInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNewInvite("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: new FormData(form).get("email") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Invitation impossible.");
      setInvites(result.invites as ListedInvite[]); setNewInvite(result.code as string); form.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation impossible."); }
    finally { setBusy(false); }
  }

  return <div className="os-app-page ent-page users-page">
    <header className="ent-heading"><div><span className="app-eyebrow"><ShieldCheck size={16} /> ADMINISTRATION</span><h2>Utilisateurs<span>.</span></h2><p>Gère les accès à l’espace de la classe.</p></div><div className="users-header-actions"><button type="button" className="ent-secondary" onClick={() => void openInvites()}><Ticket size={16} /> Invitations</button><button type="button" className="ent-primary" onClick={() => { setError(""); setAdding((value) => !value); }}><Plus size={16} /> Ajouter un compte</button></div></header>
    <section className="users-panel">
      {showInvites && <section className="users-invites"><h3>Inviter un membre de la classe</h3><p>Le code est utilisable une seule fois, pendant 7 jours, et uniquement avec l’adresse indiquée. Partage-le directement avec la personne concernée.</p><form onSubmit={addInvite}><input name="email" type="email" required pattern=".+@ortmontreuil\.fr" placeholder="prenom.nom@ortmontreuil.fr" aria-label="Adresse à inviter" /><button className="ent-primary" disabled={busy}>Générer un code</button></form>{newInvite && <div className="users-invite-code"><strong>Copie ce code maintenant : il ne sera plus affiché ensuite.</strong><code>{newInvite}</code><button type="button" onClick={() => void navigator.clipboard.writeText(newInvite)}><ClipboardCopy size={15} /> Copier</button></div>}{invites.length > 0 && <div className="users-invite-list"><strong>Invitations en attente</strong>{invites.map((invite) => <span key={invite.email + invite.createdAt}>{invite.email} · expire le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" }).format(new Date(invite.expiresAt))}</span>)}</div>}</section>}
      <div className="users-toolbar"><div><UsersRound size={19} /><strong>{users.length} compte{users.length > 1 ? "s" : ""}</strong><span>{users.filter((user) => user.role === "ADMIN").length} admin{users.filter((user) => user.role === "ADMIN").length > 1 ? "s" : ""}</span></div><label className="users-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un compte…" aria-label="Rechercher un compte" /></label></div>
      {adding && <form className="users-add-form" onSubmit={addUser}><h3>Nouveau compte</h3><div className="users-add-grid"><label>Identifiant<input name="username" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,29}" placeholder="Identifiant" /></label><label>E-mail de la classe<input name="email" type="email" required pattern=".+@ortmontreuil\.fr" placeholder="prenom.nom@ortmontreuil.fr" /></label><label>Mot de passe provisoire<input name="password" type="password" required minLength={4} maxLength={128} autoComplete="new-password" placeholder="4 caractères minimum" /></label><label>Rôle<select name="role" defaultValue="MEMBER"><option value="MEMBER">Membre de la classe</option><option value="ADMIN">Administrateur</option></select></label></div><button className="ent-primary" disabled={busy}>Créer le compte</button></form>}
      {editing && <form className="users-add-form users-edit-form" onSubmit={saveEdit}><h3>{editing.action === "email" ? "Adresse de classe" : "Nouveau mot de passe"} · {editing.username}</h3><label>{editing.action === "email" ? "Adresse @ortmontreuil.fr" : "Mot de passe provisoire"}<input autoFocus required type={editing.action === "email" ? "email" : "password"} minLength={editing.action === "password" ? 4 : undefined} maxLength={editing.action === "password" ? 128 : 254} pattern={editing.action === "email" ? ".+@ortmontreuil\\.fr" : undefined} value={editValue} onChange={(event) => setEditValue(event.target.value)} placeholder={editing.action === "email" ? "prenom.nom@ortmontreuil.fr" : "4 caractères minimum"} /></label><div className="users-edit-actions"><button className="ent-primary" disabled={busy}>Enregistrer</button><button type="button" className="ent-secondary" onClick={() => setEditing(null)}>Annuler</button></div></form>}
      {error && <p className="ent-error" role="alert">{error}</p>}{notice && <p className="ent-import-notice" role="status">{notice}</p>}
      <div className="users-list">{filtered.map((user) => <article className="users-row" key={user.id}><span className={`users-avatar ${user.role === "ADMIN" ? "admin" : ""}`}>{user.role === "ADMIN" ? <ShieldCheck size={20} /> : <UserRound size={20} />}</span><div className="users-identity"><strong>{user.username} {user.id === currentUserId && <small>TOI</small>}</strong><span>{user.email}</span></div><select aria-label={`Rôle de ${user.username}`} value={user.role} disabled={busy || user.id === currentUserId} onChange={(event) => changeRole(user.id, event.target.value as UserRole)}><option value="MEMBER">Membre</option><option value="ADMIN">Administrateur</option></select><button type="button" className="users-edit-button" title="Modifier l’e-mail" aria-label={`Modifier l’e-mail de ${user.username}`} disabled={busy} onClick={() => { setEditing({ id: user.id, username: user.username, action: "email" }); setEditValue(user.email.endsWith("@ortmontreuil.fr") ? user.email : ""); }}><Mail size={16} /></button><button type="button" className="users-edit-button" title="Réinitialiser le mot de passe" aria-label={`Réinitialiser le mot de passe de ${user.username}`} disabled={busy || user.id === currentUserId} onClick={() => { setEditing({ id: user.id, username: user.username, action: "password" }); setEditValue(""); }}><KeyRound size={16} /></button><button type="button" className="users-delete" title="Supprimer le compte" aria-label={`Supprimer ${user.username}`} disabled={busy || user.id === currentUserId} onClick={() => remove(user.id, user.username)}><Trash2 size={16} /></button></article>)}{!filtered.length && <p className="users-empty">Aucun compte trouvé.</p>}</div>
    </section>
    <div className="app-info-note"><ShieldCheck size={16} /> Les membres peuvent consulter et télécharger les ressources. Les administrateurs gèrent les cours et les comptes.</div>
  </div>;
}

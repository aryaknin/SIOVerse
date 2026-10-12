"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Check,
  FolderPlus,
  ImagePlus,
  Pencil,
  Power,
  Trash2,
} from "lucide-react";
import type {
  MemeStudioTemplate,
  MemeStudioTopic,
  MemeTemplatePack,
} from "@/lib/makeitsio";

type StudioState = {
  packs: MemeTemplatePack[];
  templates: MemeStudioTemplate[];
  topics: MemeStudioTopic[];
};

export function MemeStudio({ initialState }: { initialState: StudioState }) {
  const [state, setState] = useState(initialState);
  const [pack, setPack] = useState(initialState.packs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function json(method: string, body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/makeitsio/studio", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setState(result);
      setNotice("Modification enregistrée.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/makeitsio/studio", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setState(result);
      setNotice("Modèle ajouté au pack.");
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import impossible.");
    } finally {
      setBusy(false);
    }
  }

  function rename(
    kind: "pack" | "template" | "topic",
    id: string,
    current: string,
  ) {
    const name = window.prompt("Nouveau nom", current)?.trim();
    if (name && name !== current) void json("PATCH", { kind, id, name });
  }
  function remove(
    kind: "pack" | "template" | "topic",
    id: string,
    label: string,
  ) {
    if (window.confirm(`Supprimer « ${label} » ?`))
      void json("DELETE", { kind, id });
  }

  return (
    <main className="mstudio-shell">
      <header>
        <Link href="/sioverse/makeitsio">
          <ArrowLeft size={17} /> Retour au jeu
        </Link>
        <b>
          MAKE IT <span>SIO</span> · STUDIO
        </b>
        <small>ADMINISTRATION</small>
      </header>
      <section className="mstudio-hero">
        <span>ATELIER DE LA PROMO</span>
        <h1>
          Packs, modèles
          <br />
          et sujets.
        </h1>
        <p>
          Construis la bibliothèque utilisée aléatoirement pendant les parties.
        </p>
      </section>
      {(error || notice) && (
        <p className={error ? "mstudio-alert error" : "mstudio-alert"}>
          {error || notice}
        </p>
      )}
      <div className="mstudio-layout">
        <aside>
          <h2>Packs</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const name = new FormData(form).get("name");
              void json("POST", { kind: "pack", name }).then(() =>
                form.reset(),
              );
            }}
          >
            <input
              name="name"
              minLength={2}
              maxLength={60}
              placeholder="Nouveau pack…"
              required
            />
            <button disabled={busy}>
              <FolderPlus size={16} />
            </button>
          </form>
          <nav>
            {state.packs.map((item) => (
              <div key={item.id} className={pack === item.id ? "active" : ""}>
                <button onClick={() => setPack(item.id)}>
                  <span>
                    {item.name}
                    <small>
                      {item.templateCount} modèles{" "}
                      {item.builtin ? "· intégré" : ""}
                    </small>
                  </span>
                </button>
                <button
                  title="Renommer"
                  onClick={() => rename("pack", item.id, item.name)}
                >
                  <Pencil size={13} />
                </button>
                <button
                  title={item.enabled ? "Désactiver" : "Activer"}
                  onClick={() =>
                    void json("PATCH", {
                      kind: "pack",
                      id: item.id,
                      enabled: !item.enabled,
                    })
                  }
                >
                  <Power size={13} />
                </button>
                {!item.builtin && (
                  <button
                    title="Supprimer"
                    onClick={() => remove("pack", item.id, item.name)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </nav>
        </aside>
        <div className="mstudio-main">
          <section className="mstudio-panel">
            <div className="mstudio-panel-head">
              <div>
                <span>BIBLIOTHÈQUE</span>
                <h2>Modèles du pack</h2>
              </div>
              <form onSubmit={upload}>
                <input type="hidden" name="packId" value={pack} />
                <input
                  name="title"
                  required
                  maxLength={80}
                  placeholder="Nom du modèle"
                />
                <label>
                  <ImagePlus size={15} /> Choisir une image/GIF
                  <input
                    name="file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    required
                  />
                </label>
                <button disabled={busy || !pack}>Importer</button>
              </form>
            </div>
            <div className="mstudio-grid">
              {state.templates
                .filter((item) => item.packId === pack)
                .map((item) => (
                  <article
                    key={item.id}
                    className={!item.enabled ? "disabled" : ""}
                  >
                    <img src={item.source} alt={item.title} />
                    <footer>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.mediaType.replace("image/", "").toUpperCase()}
                        </small>
                      </span>
                      <button
                        onClick={() => rename("template", item.id, item.title)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() =>
                          void json("PATCH", {
                            kind: "template",
                            id: item.id,
                            enabled: !item.enabled,
                          })
                        }
                      >
                        {item.enabled ? (
                          <Check size={14} />
                        ) : (
                          <Power size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => remove("template", item.id, item.title)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </footer>
                  </article>
                ))}
              {!state.templates.some((item) => item.packId === pack) && (
                <p className="mstudio-empty">
                  Ce pack ne contient encore aucun modèle.
                </p>
              )}
            </div>
          </section>
          <section className="mstudio-panel mstudio-topics">
            <div className="mstudio-panel-head">
              <div>
                <span>MODE SUJETS</span>
                <h2>Thèmes aléatoires</h2>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const name = new FormData(form).get("name");
                  void json("POST", { kind: "topic", name }).then(() =>
                    form.reset(),
                  );
                }}
              >
                <input
                  name="name"
                  required
                  minLength={3}
                  maxLength={120}
                  placeholder="Quand le prof annonce…"
                />
                <button disabled={busy}>Ajouter</button>
              </form>
            </div>
            <div>
              {state.topics.map((topic) => (
                <article
                  key={topic.id}
                  className={!topic.enabled ? "disabled" : ""}
                >
                  <span>{topic.label}</span>
                  <button
                    onClick={() => rename("topic", topic.id, topic.label)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() =>
                      void json("PATCH", {
                        kind: "topic",
                        id: topic.id,
                        enabled: !topic.enabled,
                      })
                    }
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => remove("topic", topic.id, topic.label)}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

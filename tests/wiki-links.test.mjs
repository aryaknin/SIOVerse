import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenizeWikiLinks } from "../src/lib/wiki-links.ts";
import { wikiCategoryIds, wikiCategoryInfo } from "../src/lib/wiki-categories.ts";

const articles = [
  { id: "ary", title: "Ary" },
  { id: "ary-long", title: "Ary — architecte du SIOVerse" },
  { id: "sio", title: "SIOVerse" },
];

test("la citation d’un titre complet devient un lien interne", () => {
  assert.deepEqual(tokenizeWikiLinks("Voir Ary — architecte du SIOVerse et SIOVerse.", articles), [
    { kind: "text", text: "Voir " },
    { kind: "article", text: "Ary — architecte du SIOVerse", articleId: "ary-long" },
    { kind: "text", text: " et " },
    { kind: "article", text: "SIOVerse", articleId: "sio" },
    { kind: "text", text: "." },
  ]);
});

test("les liens explicites acceptent un libellé et signalent les pages absentes", () => {
  assert.deepEqual(tokenizeWikiLinks("[[SIOVerse|le projet]] puis [[Article à créer|une future page]]", articles), [
    { kind: "article", text: "le projet", articleId: "sio" },
    { kind: "text", text: " puis " },
    { kind: "missing", text: "une future page", targetTitle: "Article à créer" },
  ]);
});

test("un titre n’est pas lié au milieu d’un mot ni à lui-même", () => {
  assert.deepEqual(tokenizeWikiLinks("Mary et Ary", [{ id: "ary", title: "Ary" }]), [
    { kind: "text", text: "Mary et " },
    { kind: "article", text: "Ary", articleId: "ary" },
  ]);
  assert.deepEqual(tokenizeWikiLinks("Ary", [{ id: "ary", title: "Ary" }], "ary"), [{ kind: "text", text: "Ary" }]);
});

test("une citation courte du titre relie aussi l’article de la personne", () => {
  assert.deepEqual(tokenizeWikiLinks("Ary présente SIOVerse.", articles.filter((item) => item.id !== "ary")), [
    { kind: "article", text: "Ary", articleId: "ary-long" },
    { kind: "text", text: " présente " },
    { kind: "article", text: "SIOVerse", articleId: "sio" },
    { kind: "text", text: "." },
  ]);
});

test("les catégories principales et leurs libellés sont disponibles", () => {
  assert.ok(wikiCategoryIds.includes("PEOPLE_STUDENTS"));
  assert.equal(wikiCategoryInfo("PEOPLE_TEACHERS").group.label, "Personnes");
  assert.equal(wikiCategoryInfo("PEOPLE_STAFF").category.label, "Personnel du lycée");
});

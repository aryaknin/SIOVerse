import test from "node:test";
import assert from "node:assert/strict";
import { buildRoleDeck, determineWinner, normalizeGuess, shuffle } from "../src/lib/undercover-game.ts";

test("buildRoleDeck creates the requested hidden composition", () => {
  const roles = buildRoleDeck(7, 2, true);
  assert.equal(roles.filter((role) => role === "CIVIL").length, 4);
  assert.equal(roles.filter((role) => role === "UNDERCOVER").length, 2);
  assert.equal(roles.filter((role) => role === "MISTER_WHITE").length, 1);
});

test("buildRoleDeck rejects impossible compositions", () => {
  assert.throws(() => buildRoleDeck(3, 2, true), /invalide/);
});

test("shuffle keeps every player exactly once", () => {
  const values = ["a", "b", "c", "d"];
  assert.deepEqual(shuffle(values, () => .1).toSorted(), values);
});

test("winner rules cover civilians and undercover parity", () => {
  assert.equal(determineWinner([{ role: "CIVIL", eliminated: false }, { role: "UNDERCOVER", eliminated: true }, { role: "MISTER_WHITE", eliminated: true }]), "CIVILS");
  assert.equal(determineWinner([{ role: "CIVIL", eliminated: false }, { role: "UNDERCOVER", eliminated: false }, { role: "CIVIL", eliminated: true }]), "UNDERCOVERS");
  assert.equal(determineWinner([{ role: "CIVIL", eliminated: false }, { role: "CIVIL", eliminated: false }, { role: "UNDERCOVER", eliminated: false }]), null);
});

test("Mister White guesses ignore accents and punctuation", () => {
  assert.equal(normalizeGuess("  École-directe ! "), "ecole directe");
});

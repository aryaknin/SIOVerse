import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLobbyCode,
  scoreMemeRound,
} from "../src/lib/makeitsio-game.ts";

test("a perfect meme receives 1000 points", () => {
  const result = scoreMemeRound([
    {
      id: "m1",
      authorId: "a",
      votes: [
        { voterId: "b", value: 1, buddy: false },
        { voterId: "c", value: 1, buddy: false },
      ],
    },
  ]);
  assert.equal(result.memes[0].total, 1000);
});

test("downvotes and meh votes affect the proportional score", () => {
  const result = scoreMemeRound([
    {
      id: "m1",
      authorId: "a",
      votes: [
        { voterId: "b", value: 1, buddy: false },
        { voterId: "c", value: 0, buddy: false },
        { voterId: "d", value: -1, buddy: false },
      ],
    },
  ]);
  assert.equal(result.memes[0].total, 0);
});

test("Meme Buddy rewards both the meme and its supporter", () => {
  const result = scoreMemeRound([
    {
      id: "m1",
      authorId: "a",
      votes: [{ voterId: "b", value: 1, buddy: true }],
    },
  ]);
  assert.equal(result.memes[0].buddyBonus, 10);
  assert.equal(result.memes[0].total, 1010);
  assert.equal(result.buddyRewards.get("b"), 505);
});

test("lobby codes are normalized", () => {
  assert.equal(normalizeLobbyCode(" ab-c12!3 "), "ABC123");
});

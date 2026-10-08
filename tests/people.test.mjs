import assert from "node:assert/strict";
import { test } from "node:test";
import { concernedPeopleSchema } from "../src/lib/people-input.ts";

const student = "user:11111111-1111-4111-8111-111111111111";
const teacher = "person:22222222-2222-4222-8222-222222222222";

test("un wiki ou mème exige au moins une personne concernée valide", () => {
  assert.equal(concernedPeopleSchema.safeParse([]).success, false);
  assert.equal(concernedPeopleSchema.safeParse([student]).success, true);
  assert.equal(concernedPeopleSchema.safeParse([teacher]).success, true);
  assert.equal(concernedPeopleSchema.safeParse([student, teacher]).success, true);
  assert.equal(concernedPeopleSchema.safeParse([student, student]).success, false);
  assert.equal(concernedPeopleSchema.safeParse(["person:invalide"]).success, false);
});

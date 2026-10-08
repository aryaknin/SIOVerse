import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../src/lib/auth-crypto.ts";
import { newUserSchema, sameOrigin } from "../src/lib/auth-input.ts";

test("les mots de passe sont salés et vérifiés sans stockage en clair", async () => {
  const first = await hashPassword("Un mot de passe de test 123!");
  const second = await hashPassword("Un mot de passe de test 123!");
  assert.notEqual(first, second);
  assert.ok(!first.includes("Un mot de passe"));
  assert.equal(await verifyPassword("Un mot de passe de test 123!", first), true);
  assert.equal(await verifyPassword("mauvais mot de passe", first), false);
  assert.equal(await verifyPassword("n'importe quoi", "invalide"), false);
});

test("les données de compte et l’origine des requêtes sont validées", () => {
  assert.equal(newUserSchema.safeParse({ username: "ary", email: "ary@ortmontreuil.fr", password: "long-mot-de-passe" }).success, true);
  assert.equal(newUserSchema.safeParse({ username: "ary", email: "ary@ortmontreuil.fr", password: "1234" }).success, true);
  assert.equal(newUserSchema.safeParse({ username: "ary", email: "ary@ortmontreuil.fr", password: "123" }).success, false);
  assert.equal(newUserSchema.safeParse({ username: "ary", email: "ary@example.test", password: "1234" }).success, false);
  assert.equal(newUserSchema.safeParse({ username: "x", email: "invalide", password: "court" }).success, false);
  assert.equal(sameOrigin(new Request("http://localhost:3000/api/auth/login", { headers: { origin: "http://localhost:3000" } })), true);
  assert.equal(sameOrigin(new Request("http://localhost:3000/api/auth/login", { headers: { origin: "https://autre.example" } })), false);
  assert.equal(
    sameOrigin(new Request("http://127.0.0.1:3000/api/auth/login", { headers: { host: "sioverse.online", origin: "https://sioverse.online", "x-forwarded-proto": "https" } })),
    true,
  );
  assert.equal(
    sameOrigin(new Request("http://127.0.0.1:3000/api/auth/login", { headers: { host: "sioverse.online", origin: "https://attaque.example", "x-forwarded-proto": "https" } })),
    false,
  );
});

import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const title = "Ary — architecte du SIOVerse";
const intro = `**Ary** est à l’origine de SIOVerse, un bureau numérique pensé pour la classe de BTS SIO. L’idée : réunir les cours, l’emploi du temps, le wiki et les mèmes dans un endroit qui ressemble davantage à un petit système d’exploitation qu’à un énième dossier partagé.

> Statut dans le lore : architecte du bureau. Statut hors lore : probablement en train d’ajuster un bouton de trois pixels.`;

const sections = [
  {
    title: "Aux origines du projet",
    body: `Tout commence par une question raisonnable : « Et si les ressources de la classe étaient enfin faciles à retrouver ? » Quelques idées plus tard, SIOVerse avait un bureau, un ENT, un emploi du temps, des fonds animés et désormais un wiki.

- Un espace pour classer les cours par matière.
- Un agenda consultable semaine par semaine.
- Une galerie de mèmes pour documenter les moments importants — et les moins importants.
- Un wiki où la classe peut raconter son propre lore.

Le cahier des charges a grandi. Le bouton « encore une petite fonctionnalité » semble, lui, ne jamais avoir été désactivé.`,
  },
  {
    title: "Son rôle dans SIOVerse",
    body: `Ary utilise le compte administrateur du site. Il peut organiser les ressources et faire avancer les différentes parties du projet. Cela ne fait pas de cet article une biographie officielle : ici, chacun peut corriger, compléter et ajouter sa version des faits.

La règle la plus importante du wiki est simple : si une anecdote manque, ajoute-la ; si une blague ne marche pas, améliore-la.`,
  },
  {
    title: "Capacités légendaires (non vérifiées)",
    body: `La tradition orale du SIOVerse lui prête quelques compétences qu’aucune étude sérieuse n’a encore confirmées :

- Retrouver un fichier de cours caché au fond d’une archive mystérieuse.
- Transformer « juste une petite page » en univers avec bureau, comptes et applications.
- Repérer un cours mal rangé avant même que PostgreSQL ait fini de charger.

Ces affirmations relèvent du lore. Toute preuve contraire ou supplémentaire est la bienvenue dans les modifications de cet article.`,
  },
  {
    title: "La suite de l’histoire",
    body: `Cette page n’est qu’un début. On pourra y ajouter les vrais moments marquants du projet, des captures, des liens vers les mèmes de la promo, et les anecdotes que la classe aura envie de garder.

> Note aux futurs contributeurs : pas besoin d’un discours solennel. Une bonne histoire bien racontée vaut mieux qu’une liste de trophées imaginaires.`,
  },
];

async function main() {
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL absent.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const owner = await client.query("SELECT id FROM sio_users WHERE username='ary' AND role='ADMIN' LIMIT 1");
  if (!owner.rowCount) throw new Error("Compte administrateur ary introuvable.");
  const authorId = owner.rows[0].id as string;
  const existing = await client.query("SELECT id FROM sio_lore_entries WHERE kind='ARTICLE' AND title=$1 AND author_id=$2 LIMIT 1", [title, authorId]);
  if (existing.rowCount) {
    await client.query("ROLLBACK");
    process.stdout.write("Article déjà présent ; aucun doublon créé.\n");
  } else {
    const articleId = randomUUID();
    await client.query("INSERT INTO sio_lore_entries(id,kind,title,body,author_id,category) VALUES($1,'ARTICLE',$2,$3,$4,'PEOPLE_STUDENTS')", [articleId, title, intro, authorId]);
    for (const [position, section] of sections.entries()) {
      await client.query("INSERT INTO sio_lore_sections(id,article_id,title,body,position,updated_by) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), articleId, section.title, section.body, position, authorId]);
    }
    await client.query("INSERT INTO sio_content_people(id,content_id,user_id,display_name,kind) VALUES($1,$2,$3,'ary','STUDENT')", [randomUUID(), articleId, authorId]);
    await client.query("INSERT INTO sio_lore_revisions(id,article_id,editor_id,action,detail) VALUES($1,$2,$3,'CREATE','Article initial créé avec quatre sections')", [randomUUID(), articleId, authorId]);
    await client.query("COMMIT");
    process.stdout.write("Article Ary créé avec quatre sections.\n");
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Création impossible."}\n`); process.exitCode = 1; });

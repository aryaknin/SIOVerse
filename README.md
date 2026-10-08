# SIOVerse

SIOVerse est une plateforme web privée destinée à une promotion de BTS SIO. Elle réunit, dans une interface inspirée d’un système d’exploitation, l’emploi du temps, les ressources pédagogiques, les contrôles, l’administration des comptes et un espace communautaire.

Le site de production est prévu à l’adresse **[sioverse.online](https://sioverse.online)**.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Fonctionnement général](#fonctionnement-général)
- [Architecture technique](#architecture-technique)
- [Installation locale](#installation-locale)
- [Configuration](#configuration)
- [Base de données et stockage](#base-de-données-et-stockage)
- [Comptes et permissions](#comptes-et-permissions)
- [Commandes et qualité](#commandes-et-qualité)
- [Arborescence](#arborescence)
- [Sécurité](#sécurité)
- [Production et déploiement](#production-et-déploiement)
- [État du projet](#état-du-projet)

## Fonctionnalités

### SIO OS

Le point d’entrée principal prend la forme d’un bureau numérique responsive :

- écran de connexion et sessions persistantes ;
- bureau, fenêtres, menu Démarrer et barre des tâches ;
- fonds d’écran animés fournis par le site ou ajoutés par l’utilisateur ;
- aperçu du cours actuel et du prochain cours ;
- accès centralisé aux applications du site.

### Agenda

L’agenda consomme des flux iCal ÉcoleDirecte côté serveur :

- priorité au calendrier général de la classe ;
- repli sur le calendrier personnel lorsque le flux de classe est vide ou indisponible ;
- affichage hebdomadaire en heure de Paris ;
- gestion des cours simultanés et des récurrences ;
- cache serveur de 15 minutes ;
- navigation limitée aux semaines contenant des cours.

Les URL iCal ne sont jamais envoyées au navigateur.

### Ressources pédagogiques

La bibliothèque ENT organise les documents par matière et par dossier :

- import de dossiers et d’archives ZIP, TAR, TAR.GZ et TGZ ;
- prise en charge des PDF, documents Office, images, fichiers texte, code source et liens ;
- recherche, favoris, historique et aperçu dans le navigateur ;
- renommage, déplacement et suppression par les administrateurs ;
- conservation des fichiers supprimés dans une corbeille locale ;
- copie locale du catalogue si PostgreSQL devient momentanément indisponible.

### Contrôles

Les administrateurs peuvent préparer des contrôles et devoirs avec une date, une salle, des consignes, des chapitres et des ressources associées. Chaque utilisateur dispose d’une checklist de révision stockée sur son navigateur.

### Utilisateurs

L’espace d’administration permet de créer des comptes, générer des invitations temporaires, attribuer les rôles `ADMIN` et `MEMBER`, supprimer des comptes et consulter les invitations valides.

### SIOVerse communautaire

Le portail communautaire est organisé en quatre univers :

- **Lore** : articles, archives et histoires de la promotion ;
- **Mèmes** : images ou GIF, réactions, favoris et commentaires ;
- **Undercover** : univers prévu pour un jeu social ;
- **MakeItSIO** : univers prévu pour des créations et votes en groupe.

Lore et Mèmes sont fonctionnels. Undercover et MakeItSIO disposent actuellement de leur page d’accueil, mais leurs mécaniques restent à développer.

## Fonctionnement général

1. Un visiteur non authentifié est redirigé vers `/connexion`.
2. Après authentification, un cookie de session HTTP-only donne accès au bureau SIO OS.
3. Les pages serveur contrôlent l’identité et le rôle avant de charger les données.
4. Les données structurées sont enregistrées dans PostgreSQL.
5. Les documents ENT restent sur le disque du serveur dans `storage/ent/files/` ; leurs métadonnées sont enregistrées en base.
6. Les préférences légères, comme la checklist de révision, restent dans le stockage du navigateur.

Les opérations sensibles sont également contrôlées dans les routes API : masquer un bouton dans l’interface ne constitue pas une autorisation.

## Architecture technique

| Élément | Technologie |
| --- | --- |
| Framework | Next.js 16, App Router |
| Interface | React 19, TypeScript, CSS |
| Serveur | Node.js 22 |
| Base de données | PostgreSQL 18 en production |
| Accès aux données | Prisma 7 et requêtes PostgreSQL avec `pg` |
| Validation | Zod |
| Calendriers | node-ical |
| Icônes | Lucide React |
| Tests | Test runner natif Node.js |

L’application utilise des Server Components et des Route Handlers Next.js. Elle doit être exécutée comme serveur Node.js : un export statique ne convient pas, car l’authentification, les API, PostgreSQL, les uploads et les aperçus de fichiers nécessitent un serveur.

## Installation locale

Prérequis : Node.js 22, npm, Git et PostgreSQL 17 (ou une version récente compatible).

```bash
git clone https://github.com/ARYAKNIN/SIOVerse.git
cd SIOVerse
npm ci
cp .env.example .env
```

Adaptez ensuite le fichier `.env` à votre environnement :

```dotenv
DATABASE_URL="postgresql://sioverse:sioverse@127.0.0.1:5432/sioverse"
ECOLEDIRECTE_CLASS_ICAL_URL=""
ECOLEDIRECTE_ICAL_URL=""
```

Lancez PostgreSQL avec la configuration de développement fournie, puis l’application :

```bash
docker compose up -d database
npm run db:generate
npm run db:push
npm run dev
```

Ouvrez [http://127.0.0.1:3000](http://127.0.0.1:3000). En développement local uniquement, le premier compte créé devient administrateur. Les inscriptions suivantes nécessitent une invitation générée par un administrateur.

> Le mot de passe du fichier `docker-compose.yml` est uniquement destiné au développement. Ne le réutilisez jamais en production.

## Configuration

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | Oui | URL PostgreSQL utilisée par l’authentification, Prisma et les modules métier |
| `ECOLEDIRECTE_CLASS_ICAL_URL` | Non | Flux iCal général de la classe, prioritaire |
| `ECOLEDIRECTE_ICAL_URL` | Non | Flux iCal personnel utilisé en repli |

Les variables sans préfixe `NEXT_PUBLIC_` restent côté serveur. Les fichiers `.env` sont ignorés par Git et ne doivent jamais être publiés.

## Base de données et stockage

Le projet possède deux modes de création de tables :

- le schéma Prisma décrit les entités pédagogiques principales et le catalogue ENT ;
- les modules d’authentification et communautaires créent leurs tables PostgreSQL à la première utilisation avec des requêtes idempotentes.

`npm run db:push` synchronise la partie Prisma. En production, effectuez toujours une sauvegarde avant une évolution du schéma.

Le dossier `storage/` n’est pas versionné :

- `storage/ent/files/` contient les documents importés ;
- `storage/ent/trash/` reçoit les fichiers supprimés depuis l’interface ;
- `storage/ent/catalog.json` sert de copie locale et de file d’attente si PostgreSQL est indisponible.

Une sauvegarde complète inclut donc **PostgreSQL et `storage/`**. Sauvegarder uniquement l’un des deux produit un état incomplet.

## Comptes et permissions

Les mots de passe sont salés et dérivés avant enregistrement. Les jetons de session sont aléatoires et seule leur empreinte est conservée en base. Le cookie de session est `HttpOnly`, `SameSite=Lax` et `Secure` en production.

- `ADMIN` : gestion des utilisateurs, invitations, ressources, contrôles et contenus communautaires ;
- `MEMBER` : consultation, téléchargement et interactions communautaires autorisées.

Après cinq échecs de connexion, le compte est temporairement verrouillé pendant quinze minutes. La suppression ou la rétrogradation du dernier administrateur est refusée.

Le premier administrateur est créé automatiquement uniquement en développement local. Consultez [PRODUCTION.md](./PRODUCTION.md) pour l’amorçage initial sur le VPS.

## Commandes et qualité

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de développement sur `127.0.0.1:3000` |
| `npm run build` | Compilation Next.js de production |
| `npm run start` | Serveur de production sur `127.0.0.1:3000` |
| `npm run lint` | Analyse ESLint |
| `npm run typecheck` | Génération des types de routes Next.js puis vérification TypeScript |
| `npm test` | Tests automatisés |
| `npm run format` | Formatage Prettier |
| `npm run db:generate` | Génération du client Prisma |
| `npm run db:push` | Synchronisation du schéma Prisma |
| `npm run db:migrate` | Migration en développement |
| `npm run db:studio` | Interface Prisma Studio |
| `npm run ent:import -- '/chemin'` | Import d’un dossier pédagogique |

Avant de proposer un changement :

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Les tests couvrent notamment l’authentification, les calendriers, la bibliothèque ENT, les liens du wiki, les personnes associées aux contenus et l’emploi du temps.

## Arborescence

```text
SIOVerse/
├── prisma/                 # Schéma Prisma
├── public/wallpapers/      # Fonds d’écran livrés avec le site
├── scripts/                # Import et maintenance des données
├── src/
│   ├── app/                # Pages App Router et routes API
│   ├── components/         # Interface et composants interactifs
│   ├── generated/prisma/   # Client généré, non versionné
│   └── lib/                # Auth, données, calendrier et logique métier
├── storage/                # Fichiers persistants, non versionnés
├── tests/                  # Tests automatisés
├── docker-compose.yml      # PostgreSQL de développement
├── next.config.ts
└── package.json
```

## Sécurité

Avant toute exposition publique :

- utilisez un mot de passe PostgreSQL long et unique ;
- bloquez le port PostgreSQL depuis Internet ;
- servez le site uniquement en HTTPS ;
- limitez les ports entrants à SSH, HTTP et HTTPS ;
- protégez et renouvelez les URL iCal si elles ont été divulguées ;
- conservez les secrets hors du dépôt ;
- installez les correctifs de sécurité du système ;
- testez régulièrement la restauration des sauvegardes ;
- surveillez l’espace disque, car les imports et médias sont persistants.

Les ressources partagées peuvent contenir des données personnelles ou protégées. L’administrateur du serveur reste responsable des accès, de la conservation et de la suppression de ces données.

## Production et déploiement

La procédure pour le VPS OVH, Nginx, HTTPS, PostgreSQL, systemd, le DNS de `sioverse.online`, les sauvegardes et les mises à jour est détaillée dans **[PRODUCTION.md](./PRODUCTION.md)**.

Le site est actuellement hébergé sur le VPS OVH `51.210.254.136`, derrière Nginx et un certificat Let’s Encrypt. Le même VPS héberge `bde-ortmontreuil.fr` dans un service et un virtual host séparés.

Chaque `push` sur `main` déclenche le workflow GitHub Actions **Qualité et déploiement** : lint, vérification TypeScript, tests, compilation, puis déploiement sur le VPS uniquement si toutes les vérifications réussissent. La connexion utilise une clé dédiée limitée au script de déploiement ; aucun secret applicatif n’est conservé dans GitHub.

## État du projet

SIO OS, l’authentification, l’administration, l’agenda, les ressources, les contrôles, Lore et Mèmes sont utilisables. Undercover et MakeItSIO sont encore des espaces en préparation.

Le projet est destiné à une communauté privée. Le dépôt public expose le code source, mais jamais les données de production, les fichiers envoyés, les mots de passe, les sessions ou les URL iCal.

# Production et déploiement de SIOVerse

Ce guide décrit le déploiement de SIOVerse sur le VPS OVH associé à l’IPv4 `51.210.254.136`, avec le domaine **sioverse.online**.

Configuration déployée : Ubuntu 26.04, Node.js 22, PostgreSQL 18, 2 vCore, 4 Go de mémoire et 40 Go de stockage. Le site est en ligne avec HTTPS, et le VPS héberge également `bde-ortmontreuil.fr` dans un service séparé.

## Architecture retenue

```text
Internet
   │
   ├── sioverse.online ── DNS A ── 51.210.254.136
   └── www.sioverse.online ── DNS A ── 51.210.254.136
                                  │
                              Nginx :443
                                  │
                         Next.js 127.0.0.1:3000
                                  │
                       PostgreSQL 127.0.0.1:5432
                                  │
                   /srv/sioverse/app/storage
```

Nginx termine HTTPS et joue le rôle de reverse proxy. Next.js et PostgreSQL restent accessibles uniquement depuis le VPS. systemd supervise l’application.

Les deux sites partagent uniquement Nginx et la machine :

| Site | Service | Port interne | Configuration Nginx |
| --- | --- | --- | --- |
| SIOVerse | `sioverse.service` | `127.0.0.1:3000` | `/etc/nginx/sites-available/sioverse` |
| BDE ORT | `bde-website.service` | `127.0.0.1:8000` | `/etc/nginx/sites-available/bde-website` |

Un déploiement SIOVerse ne redémarre pas le service BDE. Le contrôle de santé final vérifie néanmoins que les deux virtual hosts répondent toujours.

## 1. Préparer le DNS

Dans la zone DNS du domaine, créez ou remplacez :

| Type | Sous-domaine | Cible | TTL pendant l’installation |
| --- | --- | --- | --- |
| `A` | `@` | `51.210.254.136` | 300 s |
| `A` | `www` | `51.210.254.136` | 300 s |

N’ajoutez un `AAAA` qu’après avoir vérifié le routage IPv6 et le pare-feu. Un `AAAA` incorrect rendrait le site inaccessible pour certains visiteurs.

```bash
dig +short A sioverse.online
dig +short A www.sioverse.online
```

Les deux réponses doivent contenir `51.210.254.136` avant la création du certificat TLS.

## 2. Sécuriser le VPS

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y git nginx postgresql postgresql-contrib certbot python3-certbot-nginx ufw unattended-upgrades curl ca-certificates
sudo adduser --system --group --home /srv/sioverse sioverse
```

Configurez le pare-feu après avoir confirmé que votre session SSH fonctionne :

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Les ports `3000` et `5432` ne doivent être ouverts ni dans UFW ni dans le pare-feu OVH.

## 3. Installer Node.js 22

Installez Node.js 22 depuis une source maintenue pour votre version d’Ubuntu, puis vérifiez :

```bash
node --version
npm --version
```

La version de Node doit commencer par `v22.`. Évitez une installation liée au profil d’un utilisateur interactif : systemd doit trouver `node` et `npm` sans charger `.bashrc`.

## 4. Créer PostgreSQL

Générez un mot de passe fort :

```bash
openssl rand -base64 36
sudo -u postgres psql
```

Dans PostgreSQL, remplacez le secret d’exemple :

```sql
CREATE ROLE sioverse LOGIN PASSWORD 'REMPLACER_PAR_UN_SECRET_LONG';
CREATE DATABASE sioverse OWNER sioverse;
\q
```

Vérifiez `/etc/postgresql/*/main/postgresql.conf` et conservez une écoute locale :

```text
listen_addresses = 'localhost'
```

## 5. Installer l’application

Une fois le dépôt GitHub créé :

```bash
sudo -u sioverse git clone https://github.com/ARYAKNIN/SIOVerse.git /srv/sioverse/app
cd /srv/sioverse/app
sudo -u sioverse npm ci
```

Créez le fichier de secrets hors du dépôt :

```bash
sudo install -o root -g sioverse -m 0640 /dev/null /etc/sioverse.env
sudo nano /etc/sioverse.env
```

```dotenv
DATABASE_URL="postgresql://sioverse:SECRET_ENCODE_DANS_L_URL@127.0.0.1:5432/sioverse"
ECOLEDIRECTE_CLASS_ICAL_URL="URL_ICAL_DE_LA_CLASSE"
ECOLEDIRECTE_ICAL_URL="URL_ICAL_PERSONNELLE"
NODE_ENV="production"
```

Si le mot de passe contient `@`, `:`, `/`, `?` ou `#`, encodez ces caractères pour une URL. Les variables iCal peuvent rester vides, mais l’agenda ne sera alors pas connecté.

Générez le client, synchronisez le schéma, contrôlez puis compilez :

```bash
set -a
source /etc/sioverse.env
set +a
sudo -u sioverse --preserve-env=DATABASE_URL,NODE_ENV npm run db:generate
sudo -u sioverse --preserve-env=DATABASE_URL,NODE_ENV npm run db:push
sudo -u sioverse npm run lint
sudo -u sioverse npm run typecheck
sudo -u sioverse npm test
sudo -u sioverse --preserve-env=DATABASE_URL,NODE_ENV npm run build
```

## 6. Créer le premier administrateur

En production, l’inscription exige une invitation. Comme aucune invitation ne peut être créée avant le premier administrateur, amorcez ce compte une seule fois avec le serveur de développement, inaccessible depuis Internet.

Sur le VPS :

```bash
cd /srv/sioverse/app
set -a
source /etc/sioverse.env
set +a
sudo -u sioverse --preserve-env=DATABASE_URL,ECOLEDIRECTE_CLASS_ICAL_URL,ECOLEDIRECTE_ICAL_URL npm run dev
```

Le serveur écoute uniquement sur `127.0.0.1:3000`. Sur votre ordinateur, créez un tunnel SSH :

```bash
ssh -L 3000:127.0.0.1:3000 VOTRE_UTILISATEUR@51.210.254.136
```

Ouvrez `http://127.0.0.1:3000/connexion`, créez le premier compte et confirmez que son rôle est `ADMIN`. Arrêtez immédiatement le serveur de développement avec `Ctrl+C`. Les comptes suivants seront créés par cet administrateur ou via invitation.

## 7. Créer le service systemd

Créez `/etc/systemd/system/sioverse.service` :

```ini
[Unit]
Description=SIOVerse Next.js
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=sioverse
Group=sioverse
WorkingDirectory=/srv/sioverse/app
EnvironmentFile=/etc/sioverse.env
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/srv/sioverse/app/.next /srv/sioverse/app/storage

[Install]
WantedBy=multi-user.target
```

Vérifiez le chemin avec `command -v npm`, puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sioverse
sudo systemctl status sioverse
curl --head http://127.0.0.1:3000/connexion
```

Journaux en direct :

```bash
sudo journalctl -u sioverse -f
```

## 8. Configurer Nginx

Créez `/etc/nginx/sites-available/sioverse` :

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sioverse.online www.sioverse.online;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sioverse /etc/nginx/sites-enabled/sioverse
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

La limite Nginx doit rester cohérente avec les limites d’upload de l’application et la capacité du disque.

## 9. Activer HTTPS

Quand le DNS pointe vers le VPS :

```bash
sudo certbot --nginx -d sioverse.online -d www.sioverse.online
sudo certbot renew --dry-run
curl --head https://sioverse.online/connexion
```

Choisissez la redirection automatique HTTP vers HTTPS. Certbot installe le renouvellement automatique du certificat Let’s Encrypt.

## 10. Vérifications après déploiement

- `https://sioverse.online` redirige un visiteur anonyme vers la connexion ;
- la connexion administrateur fonctionne et le cookie est `Secure` ;
- l’agenda charge le bon calendrier sans exposer son URL ;
- un petit document peut être ajouté, consulté puis téléchargé ;
- un redémarrage conserve les données ;
- `sudo ss -lntp` montre PostgreSQL et Next.js uniquement en local ;
- `sudo journalctl -u sioverse --since today` ne contient pas d’erreur répétée ;
- `df -h` montre assez d’espace libre.

## 11. Déploiement automatique depuis GitHub

Le workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) s’exécute à chaque `push` sur `main` et peut aussi être lancé manuellement depuis l’onglet **Actions** de GitHub.

Le déploiement ne démarre que si les étapes suivantes réussissent :

1. installation avec `npm ci` ;
2. génération du client Prisma ;
3. lint, génération des types de routes Next.js et vérification TypeScript ;
4. tests automatisés ;
5. compilation Next.js.

Le job de production ouvre ensuite une connexion SSH avec une clé dédiée et restreinte. Le script [`deploy/deploy.sh`](./deploy/deploy.sh), installé en lecture seule dans `/usr/local/sbin/deploy-sioverse`, effectue une sauvegarde PostgreSQL, avance le clone avec un fast-forward, génère le client Prisma, compile, redémarre uniquement SIOVerse et contrôle SIOVerse ainsi que le BDE.

La synchronisation du schéma n’est volontairement pas automatique. La base contient aussi des tables créées directement par les modules d’authentification et communautaires, absentes du schéma Prisma. Un `prisma db push` sur la production proposerait de les supprimer. Toute évolution de schéma doit donc faire l’objet d’une migration relue, sauvegardée puis exécutée séparément.

Les secrets GitHub requis dans **Settings → Secrets and variables → Actions** sont :

| Secret | Valeur attendue |
| --- | --- |
| `SIOVERSE_DEPLOY_HOST` | adresse du VPS, actuellement `51.210.254.136` |
| `SIOVERSE_DEPLOY_USER` | utilisateur SSH restreint, `sioverse-deploy` |
| `SIOVERSE_DEPLOY_KEY` | clé privée dédiée générée pour GitHub Actions |
| `SIOVERSE_KNOWN_HOSTS` | clé d’hôte SSH vérifiée du VPS |

La clé privée ne doit jamais être ajoutée au dépôt. La clé publique correspondante est limitée côté VPS à une seule commande, sans terminal, transfert de port ni agent SSH.

### Déclenchement

```bash
git add .
git commit -m "Description du changement"
git push origin main
```

Un commit uniquement local ne peut pas déclencher GitHub Actions : le déploiement commence lorsque le commit est envoyé sur GitHub. Suivez son état dans l’onglet **Actions** du dépôt. En cas d’échec des contrôles, la production n’est pas redémarrée.

## 12. Mise à jour manuelle de secours

Sauvegardez d’abord la base et `storage/`, puis :

```bash
cd /srv/sioverse/app
sudo -u sioverse git fetch --prune origin
sudo -u sioverse git pull --ff-only origin main
sudo -u sioverse npm ci
set -a
source /etc/sioverse.env
set +a
sudo -u sioverse --preserve-env=DATABASE_URL,NODE_ENV npm run db:generate
sudo -u sioverse --preserve-env=DATABASE_URL,NODE_ENV npm run build
sudo systemctl restart sioverse
sudo systemctl status sioverse
```

Ne redémarrez le service qu’après une compilation réussie. Pour une évolution à risque, préparez une copie de la base et un retour arrière avant de modifier le schéma.

## 13. Sauvegardes

Une sauvegarde exploitable contient :

1. un export PostgreSQL cohérent ;
2. `/srv/sioverse/app/storage/` ;
3. une copie chiffrée de `/etc/sioverse.env`, conservée séparément ;
4. le SHA Git déployé.

Exemple manuel :

```bash
sudo install -d -m 0750 -o root -g sioverse /var/backups/sioverse
sudo -u postgres pg_dump --format=custom --file=/var/backups/sioverse/database.dump sioverse
sudo tar -C /srv/sioverse/app -czf /var/backups/sioverse/storage.tar.gz storage
cd /srv/sioverse/app && git rev-parse HEAD | sudo tee /var/backups/sioverse/git-revision.txt >/dev/null
```

Copiez ces sauvegardes vers un emplacement externe au VPS. Automatisez une sauvegarde quotidienne, chiffrez-la, définissez une rétention et testez régulièrement la restauration.

Testez la base dans un environnement temporaire, jamais directement sur la production :

```bash
sudo -u postgres createdb sioverse_restore_test
sudo -u postgres pg_restore --dbname=sioverse_restore_test /var/backups/sioverse/database.dump
sudo -u postgres dropdb sioverse_restore_test
```

## 14. Supervision et diagnostic

```bash
systemctl is-active sioverse nginx postgresql
journalctl -u sioverse --since today
df -h
du -sh /srv/sioverse/app/storage
sudo -u postgres psql -d sioverse -c "SELECT pg_size_pretty(pg_database_size('sioverse'));"
```

| Symptôme | Vérification |
| --- | --- |
| Erreur 502 | service et journaux SIOVerse |
| Connexion impossible | PostgreSQL, `DATABASE_URL`, journaux |
| Certificat refusé | DNS A, ports 80/443, Certbot |
| Agenda vide | variables iCal et cache de 15 minutes |
| Upload refusé | rôle, limite Nginx et espace disque |
| Fichier absent après restauration | restauration conjointe de la base et `storage/` |
| Compilation interrompue | mémoire disponible ; swap temporaire si nécessaire |

## 15. État actuel de la mise en ligne

- [x] DNS `A` de `sioverse.online` et `www` vers `51.210.254.136`
- [x] accès SSH par clé testé
- [x] PostgreSQL limité à localhost avec un secret unique
- [x] dépôt cloné dans `/srv/sioverse/app`
- [x] `/etc/sioverse.env` protégé en `0640`
- [x] premier administrateur créé
- [x] service systemd actif au démarrage
- [x] Nginx configuré sans modifier le virtual host du BDE
- [x] HTTPS actif et renouvellement simulé avec succès
- [x] ports applicatifs accessibles uniquement en local
- [x] contrôle fonctionnel de SIOVerse et du BDE après mise en ligne
- [x] secrets GitHub Actions enregistrés
- [x] premier déploiement automatisé validé
- [ ] sauvegarde externe quotidienne et restauration régulièrement testée

## Données sensibles

Ne publiez jamais les fichiers `.env`, les URL iCal, les exports PostgreSQL, `storage/`, les cookies, les codes d’invitation, une clé SSH ou un mot de passe OVH/PostgreSQL.

L’adresse IP publique et le domaine ne sont pas des secrets. Les identifiants, clés et données des utilisateurs le sont.

#!/usr/bin/env bash

set -Eeuo pipefail

readonly APP_DIR="/srv/sioverse/app"
readonly BACKUP_DIR="/var/backups/sioverse"
readonly LOCK_FILE="/run/lock/sioverse-deploy.lock"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Un déploiement SIOVerse est déjà en cours." >&2
  exit 1
fi

echo "[1/7] Sauvegarde de PostgreSQL"
install -d -m 0750 -o postgres -g postgres "${BACKUP_DIR}"
backup_file="${BACKUP_DIR}/database-before-deploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
sudo -u postgres pg_dump --format=custom --file="${backup_file}" sioverse

echo "[2/7] Récupération de la branche main"
sudo -u sioverse git -C "${APP_DIR}" fetch --prune origin main
sudo -u sioverse git -C "${APP_DIR}" merge --ff-only origin/main

echo "[3/7] Installation déterministe des dépendances"
sudo -u sioverse npm --prefix "${APP_DIR}" ci

echo "[4/7] Génération du client Prisma"
sudo -u sioverse bash -c "set -a; source /etc/sioverse.env; set +a; cd '${APP_DIR}'; npm run db:generate"

echo "[5/7] Compilation de production"
sudo -u sioverse bash -c "set -a; source /etc/sioverse.env; set +a; cd '${APP_DIR}'; npm run build"

echo "[6/7] Redémarrage et contrôle de santé"
systemctl restart sioverse.service
for attempt in {1..15}; do
  if curl --fail --silent --show-error --output /dev/null http://127.0.0.1:3000/connexion; then
    break
  fi
  if [[ "${attempt}" == "15" ]]; then
    journalctl -u sioverse.service -n 80 --no-pager >&2
    exit 1
  fi
  sleep 2
done

echo "[7/7] Vérification de Nginx et du site BDE"
nginx -t
curl --fail --silent --show-error --output /dev/null \
  --resolve sioverse.online:443:127.0.0.1 https://sioverse.online/connexion
curl --fail --silent --show-error --output /dev/null \
  --resolve bde-ortmontreuil.fr:443:127.0.0.1 https://bde-ortmontreuil.fr/

echo "Déploiement terminé : $(sudo -u sioverse git -C "${APP_DIR}" rev-parse --short HEAD)"

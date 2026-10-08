# Stockage local

`ent/catalog.json` est une copie locale du classement ENT, synchronisée vers PostgreSQL lorsque la base répond. Les fichiers importés sont rangés dans `ent/files/` ; la base conserve leurs métadonnées et le chemin vers chaque fichier.
Ce stockage reste local à cette installation, sans comptes ni partage entre élèves pour le moment.
Son contenu est ignoré par Git : ne retirez pas cette protection sans vérifier les droits et la confidentialité des fichiers.

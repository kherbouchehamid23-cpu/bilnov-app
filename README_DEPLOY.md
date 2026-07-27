# Bilnov — Déploiement de tout le travail du jour

## Ce qui sera déployé
- **L2 (viewer DWG)** : mesures éditables (live + enregistrées), sélecteur d'unité permanent,
  curseur d'accroche « + » AutoCAD, droit `dwg.measure` par code de partage, module pur `cadMeasure` + tests.
- **M1 (commentaires unifiés)** : modèle central `Comment` + `CommentLocation` (additif, sans toucher
  `CadAnnotation`), machine à états, API (create/list/get/patch/status/messages/assignees/locations),
  page `/projects/[id]/comments` (liste + Kanban + filtres + tableau de bord + fil de discussion).
- **Tests** : harnais **vitest, 53 tests** (gate bloquant).

## Comment déployer (dans le Codespace bilnov-app)

1. Copier le contenu de ce dossier `deploy/` à la **racine du repo** (les 6 fichiers).
2. Lancer :
   ```bash
   bash deploy_all.sh
   ```
3. Le script applique tout, migre la base (additif), passe le gate **tests + build**,
   puis **commit + push** → Vercel déploie automatiquement `main`.

Le script est `set -e` : **si les tests ou le build échouent, rien n'est poussé**.
Tous les scripts sont **idempotents** (re-lançables sans dupliquer).

## Vérifié avant livraison (hors Codespace)
- 53/53 tests vitest verts ; tous les fichiers TS/TSX passent le contrôle syntaxique ;
  schéma additif cohérent ; les ~44 patchs s'appliquent proprement sur le repo réel (HEAD 8f097f8).
- Non vérifiable ici (fait par le gate du Codespace) : `prisma db push` + `next build`.

## Après le push
Le connecteur **Vercel** (à connecter si tu veux) me permettrait de **suivre le déploiement**
(statut, logs, erreurs de build) une fois le push effectué. Dis-le-moi si tu veux que je le surveille.

## Ordre équivalent en manuel (si tu préfères étape par étape)
```bash
python3 01_apply_cad_measure_tests.py   # chacun gate test+build
python3 02_apply_cad_cursor_edit.py
python3 03_apply_share_measure.py
python3 04_apply_m1_comments.py
python3 05_apply_m1_front.py
git add -A && git commit -m "..." && git push
```

# Visites virtuelles krpano / Pano2VR — guide d'intégration

Cette fonctionnalité permet d'**uploader une archive ZIP** de visite virtuelle (export krpano ou Pano2VR), de la **lire dans la solution** (visualiseur plein écran fidèle au rendu d'origine) et de la **supprimer** (fichiers + archive).

Elle a été ajoutée à `bilnov-app` en respectant les conventions existantes (presign direct-to-R2, auth JWT Bearer, format de réponse `{ success, data }`, soft-delete, quota d'organisation).

## Ce qui a été ajouté

### Base de données — `prisma/schema.prisma`
- Nouveau modèle **`KrpanoTour`** (id, projectId, nodeId, uploadedBy, name, description, status, storagePrefix, entryKey, thumbKey, fileCount, totalSize, sceneCount, metadata, timestamps, soft-delete).
- Nouvel enum **`KrpanoTourStatus`** (`PROCESSING | READY | ERROR`).
- Valeur **`KRPANO_TOUR`** ajoutée à l'enum `FileType`.
- Relations inverses `krpanoTours` sur `Project`, `User`, `ProjectStructureNode`.

### Librairie — `src/lib/krpano.ts`
Client R2 dédié + helpers : `extractZipToStorage` (décompresse le ZIP et republie chaque fichier sur R2), `getObjectBuffer`, `putObject`, `listKeys`, `deletePrefix`, `contentTypeFor`. L'extraction détecte automatiquement le fichier d'entrée (`tour.html`/`index.html`), gère le cas où tout est dans un sous-dossier, ignore les binaires inutiles (`.exe`, `_macos`, testingserver, `__MACOSX`) et compte les scènes via le `tour.xml`.

### API
| Route | Méthode | Rôle |
|---|---|---|
| `/api/projects/[id]/krpano/presign` | POST | URL pré-signée pour uploader le ZIP vers R2 |
| `/api/projects/[id]/krpano` | GET | Liste des visites du projet (filtre `?nodeId=`) |
| `/api/projects/[id]/krpano` | POST | Enregistre la visite (statut PROCESSING) |
| `/api/projects/[id]/krpano/[tourId]/process` | POST | Décompresse le ZIP → R2, passe en READY |
| `/api/projects/[id]/krpano/[tourId]` | GET / PUT / DELETE | Détail / renommer / **supprimer** |
| `/api/krpano/[tourId]/[...path]` | GET | Sert les fichiers du tour (HTML, xml, js, tuiles) via URL stable |

### UI — `src/app/projects/[id]/krpano/page.tsx`
Page dédiée : zone d'upload (drag/clic, barre de progression), liste des visites avec statut, bouton **Visualiser** (iframe plein écran), bouton **Supprimer**, et **Relancer** en cas d'échec de traitement. Un lien « Visites krpano » a été ajouté à la barre d'onglets de la page projet.

### Config
- `package.json` : ajout de `adm-zip` (+ `@types/adm-zip`).
- `vercel.json` : `maxDuration` augmenté (300 s, 1 Go) pour la route `process` (extraction de milliers de fichiers).

## Flux complet (upload → lecture → suppression)

1. L'utilisateur dépose un `.zip` → le front demande une URL pré-signée (`presign`).
2. Le ZIP est envoyé **directement à R2** (XHR PUT, contourne la limite de body Vercel — important : l'archive testée fait 89 Mo).
3. Le front enregistre la visite (`POST krpano`, statut PROCESSING) puis déclenche `process`.
4. `process` décompresse le ZIP et republie les ~5 600 fichiers sous `org/projet/krpano/<id>/`, détecte `tour.html`, la vignette et compte les scènes → statut READY.
5. **Lecture** : le bouton Visualiser ouvre une iframe sur `/api/krpano/<id>/tour.html?t=<token>`. La 1ère requête pose un cookie httpOnly limité au chemin du tour ; les requêtes relatives (xml, js, tuiles) sont alors servies automatiquement, chacune vérifiant le JWT et l'appartenance à l'organisation (règles R4/R5).
6. **Suppression** : `DELETE` efface tous les fichiers sous le préfixe R2 + le ZIP source, soft-delete l'enregistrement et décrémente le quota.

## Étapes pour activer (côté développeur)

```bash
cd bilnov-app
npm install                 # installe adm-zip + @types/adm-zip
npx prisma migrate dev --name add_krpano_tours   # crée la table krpano_tours
npm run dev
```

Aucune nouvelle variable d'environnement : la fonctionnalité réutilise les variables R2 existantes (`STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`, `STORAGE_REGION`) et `JWT_SECRET`.

## Vérifications effectuées
- Schéma Prisma validé (18 modèles, `KrpanoTour` présent).
- Typecheck `tsc --noEmit` : **0 erreur** sur tout le projet.
- ESLint : **0 avertissement** sur les nouveaux fichiers.
- Logique d'extraction testée sur `vtour.zip` réel : 5637 fichiers détectés, 90,4 Mo, 14 scènes comptées, 3 binaires de test correctement ignorés, `tour.html` identifié comme entrée et `panos/1.tiles/thumb.jpg` comme vignette.

## Notes & choix techniques
- **Affichage fidèle (iframe krpano)** retenu comme voie principale : les panoramas de cette archive sont des **tuiles cubemap multirésolution**, pas des équirectangulaires. Un rejeu dans le viewer Pannellum existant serait dégradé ; le `tour.xml` (hotspots, transitions, skin) est donc préservé tel quel. Le champ `pannellumScenes` est prévu dans le modèle si tu veux plus tard extraire des équirectangulaires pour un viewer unifié.
- **Performance** : l'upload des fichiers extraits vers R2 est parallélisé (pool de 16). Pour des archives très volumineuses sur Vercel, envisager de déplacer `process` vers une file d'attente / un worker si le délai de 300 s devient limitant.
- **Sécurité** : pas d'URL R2 publique, contrôle JWT + organisation à chaque fichier servi, protection contre la traversée de répertoire (`..`).

// Registre central des catégories de fichiers (source unique de vérité).
//
// Pilote : les onglets de catégorie, les compteurs, le routage vers le viewer
// adapté, la détection de catégorie à l'upload et l'attribut `accept` des inputs.
// Ajouter un nouveau format = éditer ce seul fichier (§1 « autres formats »,
// §6.1 « d'autres catégories pourront être ajoutées »).
//
// NB : ce module est volontairement sans dépendance et sûr pour une cible
// TypeScript < ES2020 (aucun littéral BigInt, aucune syntaxe récente).

export type CategoryKey =
  | 'images'
  | 'tours360'
  | 'pdf'
  | 'dwg'
  | 'ifc'
  | 'model3d'
  | 'other';

export type ViewerKind =
  | 'image'
  | 'tour'
  | 'pdf'
  | 'cad'
  | 'ifc'
  | 'model3d'
  | 'proxy';

export interface CategoryDef {
  key: CategoryKey;
  /** Libellé court affiché dans la barre de catégories (style glass). */
  label: string;
  /** Valeurs de `File.fileType` (enum Prisma) rattachées à cette catégorie. */
  fileTypes: string[];
  /** Viewer à ouvrir pour cette catégorie. */
  viewer: ViewerKind;
  /** Attribut `accept` de l'input file pour l'upload dans cette catégorie. */
  accept: string;
  /** Extensions (en minuscules, sans point) utilisées pour la détection par nom. */
  extensions: string[];
  /**
   * Catégorie « synthétique » : son contenu n'est pas seulement des `File` mais
   * agrège plusieurs sources (ex. 360° = VirtualTour + KrpanoTour + IMAGE_360).
   */
  synthetic?: boolean;
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'images',
    label: 'Images',
    fileTypes: ['IMAGE'],
    viewer: 'image',
    accept: 'image/*',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic'],
  },
  {
    key: 'tours360',
    label: '360°',
    fileTypes: ['IMAGE_360'],
    viewer: 'tour',
    accept: 'image/*',
    extensions: [],
    synthetic: true,
  },
  {
    key: 'pdf',
    label: 'PDF',
    fileTypes: ['PDF'],
    viewer: 'pdf',
    accept: '.pdf',
    extensions: ['pdf'],
  },
  {
    key: 'dwg',
    label: 'DWG',
    fileTypes: ['DWG', 'DXF'],
    viewer: 'cad',
    accept: '.dwg,.dxf',
    extensions: ['dwg', 'dxf'],
  },
  {
    key: 'ifc',
    label: 'IFC',
    fileTypes: ['IFC'],
    viewer: 'ifc',
    accept: '.ifc',
    extensions: ['ifc'],
  },
  {
    key: 'model3d',
    label: '3D',
    fileTypes: ['GLB', 'GLTF', 'OBJ'],
    viewer: 'model3d',
    accept: '.glb,.gltf,.obj',
    extensions: ['glb', 'gltf', 'obj'],
  },
  {
    key: 'other',
    label: 'Autres',
    fileTypes: ['VIDEO', 'OTHER'],
    viewer: 'proxy',
    accept: '*/*',
    extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'],
  },
];

/** Ordre d'affichage canonique des catégories (barre d'onglets). */
export const CATEGORY_ORDER: CategoryKey[] = CATEGORIES.map((c) => c.key);

const CATEGORY_BY_KEY: Record<string, CategoryDef> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c;
    return acc;
  },
  {} as Record<string, CategoryDef>,
);

const CATEGORY_BY_FILETYPE: Record<string, CategoryKey> = CATEGORIES.reduce(
  (acc, c) => {
    for (const ft of c.fileTypes) acc[ft] = c.key;
    return acc;
  },
  {} as Record<string, CategoryKey>,
);

/** Définition d'une catégorie par sa clé (ou `undefined`). */
export function getCategory(key: string): CategoryDef | undefined {
  return CATEGORY_BY_KEY[key];
}

/** Catégorie d'un `File.fileType` (repli sur « other » si inconnu). */
export function categoryOfFileType(fileType: string | null | undefined): CategoryKey {
  if (!fileType) return 'other';
  return CATEGORY_BY_FILETYPE[fileType] ?? 'other';
}

/** Détection de catégorie à partir du nom de fichier (extension). §7.3 */
export function detectCategoryFromName(name: string | null | undefined): CategoryKey {
  if (!name) return 'other';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'other';
  const ext = name.slice(dot + 1).toLowerCase();
  for (const c of CATEGORIES) {
    if (c.extensions.indexOf(ext) >= 0) return c.key;
  }
  return 'other';
}

/**
 * À partir d'une liste de `File.fileType`, renvoie les catégories présentes,
 * dans l'ordre canonique. Utile pour l'affichage dynamique (§6.2).
 * NB : la catégorie 360° synthétique (tours/krpano) est gérée séparément côté
 * appelant ; ici on ne considère que les types de fichiers bruts.
 */
export function presentCategories(fileTypes: Array<string | null | undefined>): CategoryKey[] {
  const present: Record<string, boolean> = {};
  for (const ft of fileTypes) present[categoryOfFileType(ft)] = true;
  return CATEGORY_ORDER.filter((k) => present[k]);
}

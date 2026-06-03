// Règles d'upload par TYPE de niveau d'arborescence.
// Source de vérité partagée backend (validation) + front (accept/message).
//
// Niveaux (nodeType) : 'root' (projet/racine), 'floor' (étage),
// 'room' (pièce), 'zone', 'custom' (espace personnalisé).
// Catégories de fichiers (familles FileType de l'app).

export type FileCategory = 'IMAGE' | 'PDF' | 'CAD' | 'VIDEO' | 'MODEL3D' | 'OTHER';

// Mapping FileType (enum BDD) -> catégorie
export function fileTypeToCategory(fileType: string): FileCategory {
  switch (fileType) {
    case 'IMAGE':
    case 'IMAGE_360':
      return 'IMAGE';
    case 'PDF':
      return 'PDF';
    case 'DWG':
    case 'DXF':
      return 'CAD';
    case 'VIDEO':
      return 'VIDEO';
    case 'GLB':
    case 'GLTF':
    case 'OBJ':
    case 'IFC':
      return 'MODEL3D';
    default:
      return 'OTHER';
  }
}

// '*' = tous types autorisés
export type AllowedCategories = '*' | FileCategory[];

// Règles par défaut (validé avec l'utilisateur) :
//  - projet/racine : tout
//  - étage : PDF + plans CAO (DWG/DXF)
//  - pièce et zone : photos uniquement
//  - espace personnalisé : tout
export const DEFAULT_UPLOAD_RULES: Record<string, AllowedCategories> = {
  root: '*',
  floor: ['PDF', 'CAD'],
  room: ['IMAGE'],
  zone: ['IMAGE'],
  custom: '*',
};

export type UploadRulesConfig = Record<string, AllowedCategories>;

// Renvoie les catégories autorisées pour un nodeType donné, selon la config
// projet (ou les défauts). nodeType null/undefined => 'root'.
export function allowedCategoriesFor(
  nodeType: string | null | undefined,
  config?: UploadRulesConfig | null,
): AllowedCategories {
  const key = nodeType && nodeType.length ? nodeType : 'root';
  const rules = { ...DEFAULT_UPLOAD_RULES, ...(config ?? {}) };
  return rules[key] ?? '*';
}

// Vérifie qu'un fileType est autorisé pour ce niveau.
export function isUploadAllowed(
  fileType: string,
  nodeType: string | null | undefined,
  config?: UploadRulesConfig | null,
): boolean {
  const allowed = allowedCategoriesFor(nodeType, config);
  if (allowed === '*') return true;
  return allowed.includes(fileTypeToCategory(fileType));
}

// Libellés FR des catégories (pour messages UI)
export const CATEGORY_LABELS: Record<FileCategory, string> = {
  IMAGE: 'photos',
  PDF: 'PDF',
  CAD: 'plans DWG/DXF',
  VIDEO: 'vidéos',
  MODEL3D: 'modèles 3D',
  OTHER: 'autres fichiers',
};

// Phrase d'aide pour un niveau (front)
export function uploadHint(
  nodeType: string | null | undefined,
  config?: UploadRulesConfig | null,
): string {
  const allowed = allowedCategoriesFor(nodeType, config);
  if (allowed === '*') return 'Tous types de fichiers acceptés ici.';
  const labels = allowed.map(c => CATEGORY_LABELS[c]).join(', ');
  return `Ici, seuls ces fichiers sont acceptés : ${labels}.`;
}

// Attribut HTML `accept` correspondant aux catégories autorisées (front)
export function acceptAttr(
  nodeType: string | null | undefined,
  config?: UploadRulesConfig | null,
): string | undefined {
  const allowed = allowedCategoriesFor(nodeType, config);
  if (allowed === '*') return undefined; // pas de restriction
  const map: Record<FileCategory, string[]> = {
    IMAGE: ['image/*'],
    PDF: ['.pdf', 'application/pdf'],
    CAD: ['.dwg', '.dxf'],
    VIDEO: ['video/*'],
    MODEL3D: ['.glb', '.gltf', '.obj', '.ifc'],
    OTHER: [],
  };
  const exts = allowed.flatMap(c => map[c]);
  return exts.length ? exts.join(',') : undefined;
}

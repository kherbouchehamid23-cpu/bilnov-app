import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';

// ---------------------------------------------------------------------------
// Client S3 / R2 (mêmes variables d'env que lib/storage.ts)
// ---------------------------------------------------------------------------
export function krpanoClient(): S3Client {
  return new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? 'auto',
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
    },
    forcePathStyle: true,
  });
}

export function krpanoBucket(): string {
  return process.env.STORAGE_BUCKET ?? 'bilnov';
}

// ---------------------------------------------------------------------------
// Types MIME pour les fichiers d'un tour krpano / Pano2VR
// ---------------------------------------------------------------------------
const MIME_MAP: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  json: 'application/json; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  swf: 'application/x-shockwave-flash',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  txt: 'text/plain; charset=utf-8',
};

export function contentTypeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

// Fichiers à ne PAS republier (binaires de test inutiles dans le navigateur)
function isIgnoredEntry(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith('.exe')) return true;
  if (lower.endsWith('_macos')) return true;
  if (lower.includes('testingserver')) return true;
  if (lower.includes('__macosx/')) return true;
  if (lower.endsWith('.ds_store')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Helpers objets R2
// ---------------------------------------------------------------------------
async function streamToBuffer(stream: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  // @ts-expect-error - Body est un Readable côté Node
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await krpanoClient().send(
    new GetObjectCommand({ Bucket: krpanoBucket(), Key: key }),
  );
  return streamToBuffer(res.Body);
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await krpanoClient().send(
    new PutObjectCommand({
      Bucket: krpanoBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await krpanoClient().send(
      new ListObjectsV2Command({
        Bucket: krpanoBucket(),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

// Supprime tous les objets sous un préfixe (par lots de 1000). Retourne le nb supprimé.
export async function deletePrefix(prefix: string): Promise<number> {
  const keys = await listKeys(prefix);
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    if (batch.length === 0) continue;
    await krpanoClient().send(
      new DeleteObjectsCommand({
        Bucket: krpanoBucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    deleted += batch.length;
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Extraction du ZIP vers R2
// ---------------------------------------------------------------------------
export interface ExtractResult {
  entryKey: string; // chemin relatif du HTML d'entrée (ex: "tour.html")
  thumbKey: string | null; // chemin relatif d'une vignette (ex: "panos/1.tiles/thumb.jpg")
  fileCount: number;
  totalSize: number;
  sceneCount: number;
}

// Concurrence simple pour accélérer les PUT R2
async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency = 16,
): Promise<void> {
  let idx = 0;
  const runners = new Array(Math.min(concurrency, items.length))
    .fill(0)
    .map(async () => {
      while (idx < items.length) {
        const current = idx++;
        await worker(items[current]);
      }
    });
  await Promise.all(runners);
}

/**
 * Lit le ZIP stocké à `zipKey`, le décompresse et republie chaque fichier sous
 * `storagePrefix` sur R2. Détecte automatiquement le HTML d'entrée (tour.html /
 * index.html) et la base interne du ZIP (au cas où tout serait dans un sous-dossier).
 */
export async function extractZipToStorage(
  zipKey: string,
  storagePrefix: string,
): Promise<ExtractResult> {
  const zipBuffer = await getObjectBuffer(zipKey);
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  // 1) Trouver le HTML d'entrée et la base interne
  const htmlCandidates = entries
    .map((e) => e.entryName.replace(/\\/g, '/'))
    .filter((n) => /(^|\/)(tour|index)\.html?$/i.test(n))
    .sort((a, b) => a.split('/').length - b.split('/').length); // le moins profond d'abord

  if (htmlCandidates.length === 0) {
    throw new Error(
      "Archive invalide : aucun fichier d'entrée tour.html ou index.html trouvé",
    );
  }
  const entryFull = htmlCandidates[0];
  const internalBase = entryFull.includes('/')
    ? entryFull.slice(0, entryFull.lastIndexOf('/') + 1)
    : '';

  // 2) Republier chaque entrée sous le préfixe (relative à internalBase)
  let fileCount = 0;
  let totalSize = 0;
  let thumbKey: string | null = null;
  let sceneCount = 0;

  const toUpload = entries.filter((e) => {
    const name = e.entryName.replace(/\\/g, '/');
    if (internalBase && !name.startsWith(internalBase)) return false;
    if (isIgnoredEntry(name)) return false;
    return true;
  });

  await runPool(toUpload, async (e) => {
    const fullName = e.entryName.replace(/\\/g, '/');
    const relative = internalBase ? fullName.slice(internalBase.length) : fullName;
    if (!relative) return;
    const data = e.getData();
    await putObject(storagePrefix + relative, data, contentTypeFor(relative));
    fileCount += 1;
    totalSize += data.length;

    // Première vignette rencontrée
    if (!thumbKey && /thumb\.jpe?g$/i.test(relative)) {
      thumbKey = relative;
    }
    // Comptage des scènes dans le XML krpano
    if (/tour\.xml$/i.test(relative)) {
      const xml = data.toString('utf-8');
      sceneCount = (xml.match(/<scene\b/gi) ?? []).length;
    }
  });

  const entryRelative = internalBase
    ? entryFull.slice(internalBase.length)
    : entryFull;

  return {
    entryKey: entryRelative || 'tour.html',
    thumbKey,
    fileCount,
    totalSize,
    sceneCount,
  };
}

'use client';

export interface UploadResult {
  fileId: string;
  storageKey: string;
  name: string;
}

// Anomalie 3 — mesure les dimensions natives d'une image côté client afin que le serveur
// puisse détecter un panorama équirectangulaire (ratio ~2:1) et le classer en 360°.
// Best-effort : toute erreur renvoie null (l'upload se poursuit, classé comme image normale).
async function measureImageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file);
      const d = { width: bmp.width, height: bmp.height };
      try { bmp.close(); } catch { /* noop */ }
      if (d.width > 0 && d.height > 0) return d;
    }
  } catch { /* repli sur HTMLImageElement */ }
  return await new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { const d = { width: img.naturalWidth, height: img.naturalHeight }; URL.revokeObjectURL(url); resolve(d.width > 0 && d.height > 0 ? d : null); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch { resolve(null); }
  });
}

export async function uploadFileDirect(
  file: File,
  projectId: string,
  token: string,
  nodeId?: string | null,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const presignRes = await fetch('/api/upload/presign', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', projectId }),
  });
  if (!presignRes.ok) throw new Error('Impossible d\'obtenir l\'URL d\'upload');
  const presignData = await presignRes.json() as { data: { uploadUrl: string; storageKey: string } };
  const { uploadUrl, storageKey } = presignData.data;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload échoué: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Erreur réseau'));
    xhr.send(file);
  });

  const dims = (file.type || '').startsWith('image/') ? await measureImageSize(file) : null;

  const registerRes = await fetch(`/api/projects/${projectId}/files/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageKey, filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, nodeId: nodeId ?? null, width: dims?.width, height: dims?.height }),
  });
  if (!registerRes.ok) throw new Error('Impossible d\'enregistrer le fichier');
  const registerData = await registerRes.json() as { data: { id: string; storageKey: string; name: string } };
  return { fileId: registerData.data.id, storageKey: registerData.data.storageKey, name: registerData.data.name };
}

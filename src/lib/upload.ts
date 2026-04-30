'use client';

export interface UploadResult {
  fileId: string;
  storageKey: string;
  name: string;
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

  const registerRes = await fetch(`/api/projects/${projectId}/files/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ storageKey, filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, nodeId: nodeId ?? null }),
  });
  if (!registerRes.ok) throw new Error('Impossible d\'enregistrer le fichier');
  const registerData = await registerRes.json() as { data: { id: string; storageKey: string; name: string } };
  return { fileId: registerData.data.id, storageKey: registerData.data.storageKey, name: registerData.data.name };
}

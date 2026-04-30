'use client';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Permissions {
  canView: boolean;
  canDownload: boolean;
  canUpload: boolean;
  canShare: boolean;
}

interface AccessData {
  project: { id: string; name: string; sector: string | null };
  permissions: Permissions;
}

interface FileItem {
  id: string;
  name: string;
  fileType: string;
  sizeBytes: string | number | bigint;
  mimeType: string;
}

interface FilesApiResponse {
  success: boolean;
  data: { files: FileItem[] };
}

interface UrlApiResponse {
  success: boolean;
  data: { url: string };
}

export default function SharedProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [accessData, setAccessData] = useState<AccessData | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem('bilnov_access_data');
    const code = sessionStorage.getItem('bilnov_access_code');
    if (!raw || !code) { router.push('/access'); return; }
    try {
      const data = JSON.parse(raw) as AccessData;
      setAccessData(data);
      void loadFiles(code);
    } catch {
      router.push('/access');
    }
  }, [projectId]);

  const loadFiles = async (code: string): Promise<void> => {
    try {
      const res = await fetch(`/api/shared/${projectId}/files?code=${code}`);
      const data = await res.json() as FilesApiResponse;
      const fileList = data.data?.files ?? [];
      setFiles(fileList);
      void loadThumbnails(fileList, code);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const loadThumbnails = async (fileList: FileItem[], code: string): Promise<void> => {
    const imageFiles = fileList.filter(f =>
      f.fileType === 'IMAGE' || f.mimeType.startsWith('image/')
    );
    for (const file of imageFiles) {
      try {
        const res = await fetch(`/api/shared/${projectId}/files/${file.id}/url?code=${code}`);
        const data = await res.json() as UrlApiResponse;
        if (data.data?.url) {
          setThumbnails(prev => ({ ...prev, [file.id]: data.data.url }));
        }
      } catch { /* skip */ }
    }
  };

  const openFile = async (fileId: string): Promise<void> => {
    if (openingId) return;
    const code = sessionStorage.getItem('bilnov_access_code') ?? '';
    setOpeningId(fileId);
    try {
      const res = await fetch(`/api/shared/${projectId}/files/${fileId}/url?code=${code}`);
      const data = await res.json() as UrlApiResponse;
      if (data.data?.url) window.open(data.data.url, '_blank');
    } catch { alert('Erreur'); }
    finally { setOpeningId(null); }
  };

  const icons: Record<string, string> = {
    IMAGE: '🖼️', IMAGE_360: '🌐', PDF: '📄',
    VIDEO: '🎥', GLB: '🧊', GLTF: '🧊', OBJ: '🧊',
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--surface)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
      <header className="glass border-b px-6 py-4 sticky top-0 z-40"
        style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--violet)' }}>
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <div>
              <p className="font-bold text-sm"
                style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
                {accessData?.project.name}
              </p>
              {accessData?.project.sector && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {accessData.project.sector}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {accessData?.permissions.canView && (
              <span className="text-xs px-2 py-1 rounded-full"
                style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                👁️ Lecture
              </span>
            )}
            {accessData?.permissions.canDownload && (
              <span className="text-xs px-2 py-1 rounded-full"
                style={{ background: '#ECFDF5', color: '#10B981' }}>
                ⬇️ Téléchargement
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          {files.length} fichier{files.length !== 1 ? 's' : ''} disponible{files.length !== 1 ? 's' : ''}
        </p>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl mb-3">📂</div>
            <p style={{ color: 'var(--text-muted)' }}>Aucun fichier disponible.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map(file => (
              <button
                key={file.id}
                onClick={() => { void openFile(file.id); }}
                disabled={!!openingId}
                className="file-card text-left">
                {/* Thumbnail or icon */}
                <div className="w-full h-28 rounded-xl mb-3 flex items-center justify-center overflow-hidden"
                  style={{ background: 'var(--surface-2)' }}>
                  {thumbnails[file.id] ? (
                    <img
                      src={thumbnails[file.id]}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl">
                      {openingId === file.id ? '⏳' : (icons[file.fileType] ?? '📁')}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium truncate mb-1" style={{ color: 'var(--text)' }}>
                  {file.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                  {Math.round(Number(file.sizeBytes) / 1024)} Ko
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

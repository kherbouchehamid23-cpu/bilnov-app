'use client';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Image as ImageIcon, Globe, FileText, Video, Box, Folder, Eye, Download, Hourglass, type LucideIcon } from 'lucide-react';

const SharedCadViewer = dynamic(() => import('@/components/SharedCadViewer'), { ssr: false });
import { CATEGORIES, categoryOfFileType, type CategoryKey } from '@/lib/fileCategories';

interface Permissions {
  canView: boolean;
  canDownload: boolean;
  canMeasure?: boolean;
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
  nodeId?: string | null;
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
  const [cadFile, setCadFile] = useState<FileItem | null>(null);
  const [nodesMap, setNodesMap] = useState<Record<string, string>>({});
  const [fileCat, setFileCat] = useState<CategoryKey | 'all'>('all');
  const [spaceId, setSpaceId] = useState<string>('all');

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
      // Structure : noms des espaces pour filtrer (interface structurée du visiteur).
      try {
        const nres = await fetch(`/api/shared/${projectId}/nodes?code=${code}`);
        const nd = await nres.json();
        const map: Record<string, string> = {};
        for (const n of (nd.data?.nodes ?? [])) map[n.id] = n.name;
        setNodesMap(map);
      } catch { /* structure optionnelle */ }
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
    const file = files.find(f => f.id === fileId);
    // Les plans DWG/DXF s'ouvrent dans le viewer partagé (lecture seule + commentaires).
    if (file && (file.fileType === 'DWG' || file.fileType === 'DXF')) { setCadFile(file); return; }
    const code = sessionStorage.getItem('bilnov_access_code') ?? '';
    setOpeningId(fileId);
    try {
      const res = await fetch(`/api/shared/${projectId}/files/${fileId}/url?code=${code}`);
      const data = await res.json() as UrlApiResponse;
      if (data.data?.url) window.open(data.data.url, '_blank');
    } catch { alert('Erreur'); }
    finally { setOpeningId(null); }
  };

  const catCounts = files.reduce((m, f) => { const k = categoryOfFileType(f.fileType); m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>);
  const visibleCats = CATEGORIES.filter(c => (catCounts[c.key] || 0) > 0);
  const spaceIds = Array.from(new Set(files.map(f => f.nodeId).filter(Boolean))) as string[];
  const shownFiles = files.filter(f =>
    (fileCat === 'all' || categoryOfFileType(f.fileType) === fileCat) &&
    (spaceId === 'all' || f.nodeId === spaceId)
  );

  const ICONS: Record<string, LucideIcon> = {
    IMAGE: ImageIcon, IMAGE_360: Globe, PDF: FileText,
    VIDEO: Video, GLB: Box, GLTF: Box, OBJ: Box,
  };
  const FileIco = ({ t, size = 40 }: { t: string; size?: number }) => { const C = ICONS[t] ?? Folder; return <C size={size} style={{ color: 'var(--text-muted)' }} />; };

  if (loading) {
    return (
      <div className="lg-app min-h-screen flex items-center justify-center"
        style={{ background: 'var(--surface)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="lg-app min-h-screen" style={{ background: 'var(--surface)' }}>
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
                <Eye size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Lecture
              </span>
            )}
            {accessData?.permissions.canDownload && (
              <span className="text-xs px-2 py-1 rounded-full"
                style={{ background: '#ECFDF5', color: '#10B981' }}>
                <Download size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Téléchargement
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <button onClick={() => setFileCat('all')} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: fileCat === 'all' ? 'var(--violet)' : 'var(--surface-2)', color: fileCat === 'all' ? '#fff' : 'var(--text-muted)' }}>Tous <span style={{ opacity: .6 }}>{files.length}</span></button>
            {visibleCats.map(c => (
              <button key={c.key} onClick={() => setFileCat(c.key)} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: fileCat === c.key ? 'var(--violet)' : 'var(--surface-2)', color: fileCat === c.key ? '#fff' : 'var(--text-muted)' }}>{c.label} <span style={{ opacity: .6 }}>{catCounts[c.key] || 0}</span></button>
            ))}
            {spaceIds.length > 0 && (
              <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                <option value="all">Tous les espaces</option>
                {spaceIds.map(nid => <option key={nid} value={nid}>{nodesMap[nid] ?? 'Espace'}</option>)}
              </select>
            )}
          </div>
        )}
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          {shownFiles.length} fichier{shownFiles.length !== 1 ? 's' : ''} affiché{shownFiles.length !== 1 ? 's' : ''}
        </p>

        {shownFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-3"><Folder size={40} style={{ color: 'var(--text-light)' }} /></div>
            <p style={{ color: 'var(--text-muted)' }}>Aucun fichier disponible.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {shownFiles.map(file => (
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
                      {openingId === file.id ? <Hourglass size={36} style={{ color: 'var(--text-light)' }} /> : <FileIco t={file.fileType} size={36} />}
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
      {cadFile && (
        <SharedCadViewer
          shareId={projectId}
          code={typeof window !== 'undefined' ? (sessionStorage.getItem('bilnov_access_code') ?? '') : ''}
          fileId={cadFile.id}
          fileName={cadFile.name}
          canMeasure={!!accessData?.permissions.canMeasure}
          onClose={() => setCadFile(null)}
        />
      )}
    </div>
  );
}

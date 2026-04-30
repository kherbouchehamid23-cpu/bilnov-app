'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';

interface Project {
  id: string;
  name: string;
  sector: string | null;
  structureType: string;
}

interface StructureNode {
  id: string;
  name: string;
  nodeType: string;
  position: number;
  parentId: string | null;
  children: StructureNode[];
  _count: { files: number };
}

interface FileItem {
  id: string;
  name: string;
  fileType: string;
  mimeType: string;
  sizeBytes: string | number | bigint;
  nodeId: string | null;
}

interface Tour {
  id: string;
  name: string;
  status: string;
}

interface NodesApiResponse {
  data: { nodes: StructureNode[] };
}

interface FilesApiResponse {
  data: { files: FileItem[] };
}

interface ThumbnailApiResponse {
  data: { url: string };
}

type Tab = 'files' | 'tours' | 'team' | 'access';

export default function ProjectPage() {
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<StructureNode[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [tours, setTours] = useState<Tour[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('files');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [showTourForm, setShowTourForm] = useState(false);
  const [tourName, setTourName] = useState('');
  const [creatingTour, setCreatingTour] = useState(false);
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [nodeName, setNodeName] = useState('');
  const [nodeType, setNodeType] = useState('floor');
  const [nodeParentId, setNodeParentId] = useState<string | null>(null);
  const [creatingNode, setCreatingNode] = useState(false);

  const getToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('bilnov_token') ?? '';
  };

  const loadFiles = async (nodeId: string | null): Promise<void> => {
    const qs = nodeId ? `?nodeId=${nodeId}` : '';
    const r = await api.get<FilesApiResponse>(`/api/projects/${id}/files${qs}`);
    const fileList = r.data?.files ?? [];
    setFiles(fileList);
    void loadThumbnails(fileList);
  };

  const loadThumbnails = async (fileList: FileItem[]): Promise<void> => {
    const imageFiles = fileList.filter(f =>
      f.fileType === 'IMAGE' || f.mimeType?.startsWith('image/')
    );
    for (const file of imageFiles) {
      try {
        const res = await fetch(`/api/file-url/${file.id}?purpose=view`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json() as ThumbnailApiResponse;
        if (data.data?.url) {
          setThumbnails(prev => ({ ...prev, [file.id]: data.data.url }));
        }
      } catch { /* skip */ }
    }
  };

  useEffect(() => {
    void Promise.all([
      api.get<{ data: Project }>(`/api/projects/${id}`),
      api.get<NodesApiResponse>(`/api/projects/${id}/nodes`),
      api.get<{ data: { tours: Tour[] } }>(`/api/projects/${id}/tours`),
    ]).then(([p, n, t]) => {
      setProject(p.data);
      setNodes(n.data?.nodes ?? []);
      setTours(t.data?.tours ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
    void loadFiles(null);
  }, [id]);

  useEffect(() => {
    void loadFiles(selectedNodeId);
  }, [selectedNodeId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (selectedNodeId) formData.append('nodeId', selectedNodeId);
    try {
      await fetch(`/api/projects/${id}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      await loadFiles(selectedNodeId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const openFile = async (fileId: string): Promise<void> => {
    if (openingId) return;
    setOpeningId(fileId);
    try {
      const res = await fetch(`/api/file-url/${fileId}?purpose=view`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json() as ThumbnailApiResponse;
      if (data.data?.url) window.open(data.data.url, '_blank');
      else alert('Impossible d\'obtenir le lien');
    } catch { alert('Erreur'); }
    finally { setOpeningId(null); }
  };

  const createTour = async (): Promise<void> => {
    if (!tourName.trim()) return;
    setCreatingTour(true);
    try {
      const res = await fetch(`/api/projects/${id}/tours`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tourName }),
      });
      const data = await res.json() as { data?: Tour };
      if (data.data) {
        setTours(prev => [data.data as Tour, ...prev]);
        setTourName('');
        setShowTourForm(false);
      }
    } catch { alert('Erreur'); }
    finally { setCreatingTour(false); }
  };

  const createNode = async (): Promise<void> => {
    if (!nodeName.trim()) return;
    setCreatingNode(true);
    try {
      const res = await fetch(`/api/projects/${id}/nodes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nodeName, nodeType, parentId: nodeParentId }),
      });
      const data = await res.json() as { data?: StructureNode };
      if (data.data) {
        const r = await api.get<NodesApiResponse>(`/api/projects/${id}/nodes`);
        setNodes(r.data?.nodes ?? []);
        setNodeName('');
        setShowNodeForm(false);
        setNodeParentId(null);
      }
    } catch { alert('Erreur création'); }
    finally { setCreatingNode(false); }
  };

  const deleteNode = async (nodeId: string): Promise<void> => {
    if (!confirm('Supprimer cet espace ? Les fichiers associés ne seront pas supprimés.')) return;
    try {
      await fetch(`/api/projects/${id}/nodes/${nodeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const r = await api.get<NodesApiResponse>(`/api/projects/${id}/nodes`);
      setNodes(r.data?.nodes ?? []);
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    } catch { alert('Erreur suppression'); }
  };

  const icons: Record<string, string> = {
    IMAGE: '🖼️', IMAGE_360: '🌐', PDF: '📄',
    VIDEO: '🎥', GLB: '🧊', GLTF: '🧊', OBJ: '🧊',
  };

  const nodeTypeIcon: Record<string, string> = {
    floor: '🏠', room: '🚪', zone: '📦', custom: '📌',
  };

  const renderNodes = (nodeList: StructureNode[], depth = 0): React.ReactNode =>
    nodeList.map(node => (
      <div key={node.id}>
        <div className="flex items-center gap-1 group"
          style={{ paddingLeft: `${depth * 12}px` }}>
          <button
            onClick={() => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all text-left"
            style={{
              background: selectedNodeId === node.id ? 'var(--violet-light)' : 'transparent',
              color: selectedNodeId === node.id ? 'var(--violet)' : 'var(--text-muted)',
              fontWeight: selectedNodeId === node.id ? 600 : 400,
            }}>
            <span>{nodeTypeIcon[node.nodeType] ?? '📌'}</span>
            <span className="flex-1 truncate">{node.name}</span>
            <span className="text-xs opacity-60">{node._count.files}</span>
          </button>
          <button
            onClick={() => { setNodeParentId(node.id); setShowNodeForm(true); }}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-xs transition-all"
            style={{ color: 'var(--text-light)' }}
            title="Ajouter un sous-espace">
            +
          </button>
          <button
            onClick={() => { void deleteNode(node.id); }}
            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg flex items-center justify-center text-xs transition-all"
            style={{ color: '#EF4444' }}
            title="Supprimer">
            ×
          </button>
        </div>
        {node.children.length > 0 && renderNodes(node.children, depth + 1)}
      </div>
    ));

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'files', label: 'Fichiers', count: files.length },
    { key: 'tours', label: 'Visites 360°', count: tours.length },
    { key: 'team', label: 'Intervenants' },
    { key: 'access', label: 'Partage' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--surface)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b px-6 py-4"
        style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-stone-100 transition-colors"
              style={{ color: 'var(--text-muted)' }}>←</Link>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--violet)' }}>
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
              {project?.name}
            </span>
            {project?.sector && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                {project.sector}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {tab === 'files' && (
              <label className={`btn-primary text-sm cursor-pointer ${uploading ? 'opacity-60' : ''}`}>
                {uploading ? 'Upload...' : '+ Ajouter fichier'}
                <input type="file" className="hidden" onChange={e => { void handleUpload(e); }} disabled={uploading} />
              </label>
            )}
            {tab === 'tours' && (
              <button className="btn-primary text-sm" onClick={() => setShowTourForm(true)}>
                + Nouvelle visite
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b" style={{ background: 'white', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor: tab === t.key ? 'var(--violet)' : 'transparent',
                color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)',
              }}>
              {t.label}
              {t.count !== undefined && (
                <span className="px-1.5 py-0.5 rounded-full text-xs"
                  style={{
                    background: tab === t.key ? 'var(--violet-light)' : 'var(--surface-2)',
                    color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)',
                  }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 max-w-7xl mx-auto w-full">

        {/* Sidebar structure — only on files tab */}
        {tab === 'files' && (
          <aside className="w-56 flex-shrink-0 border-r p-4 flex flex-col gap-2"
            style={{ background: 'white', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-light)' }}>Structure</p>
              <button
                onClick={() => { setNodeParentId(null); setShowNodeForm(true); }}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-sm transition-colors hover:bg-violet-50"
                style={{ color: 'var(--violet)' }}
                title="Ajouter un espace">
                +
              </button>
            </div>

            {/* All files */}
            <button
              onClick={() => setSelectedNodeId(null)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all text-left"
              style={{
                background: selectedNodeId === null ? 'var(--violet-light)' : 'transparent',
                color: selectedNodeId === null ? 'var(--violet)' : 'var(--text-muted)',
                fontWeight: selectedNodeId === null ? 600 : 400,
              }}>
              <span>📁</span>
              <span>Tous les fichiers</span>
            </button>

            {/* Node tree */}
            {renderNodes(nodes)}

            {/* Node creation form */}
            {showNodeForm && (
              <div className="mt-2 p-3 rounded-xl border animate-fade-up"
                style={{ borderColor: 'var(--violet-light)', background: 'var(--violet-light)' }}>
                <input
                  className="input text-sm mb-2"
                  placeholder="Nom (ex: Étage 1)"
                  value={nodeName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNodeName(e.target.value)}
                  autoFocus
                />
                <select
                  className="input text-sm mb-2"
                  value={nodeType}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNodeType(e.target.value)}>
                  <option value="floor">🏠 Étage</option>
                  <option value="room">🚪 Pièce</option>
                  <option value="zone">📦 Zone</option>
                  <option value="custom">📌 Personnalisé</option>
                </select>
                <div className="flex gap-1">
                  <button
                    onClick={() => { void createNode(); }}
                    disabled={creatingNode || !nodeName.trim()}
                    className="btn-primary text-xs py-1.5 px-3 flex-1">
                    {creatingNode ? '...' : 'Créer'}
                  </button>
                  <button
                    onClick={() => { setShowNodeForm(false); setNodeName(''); setNodeParentId(null); }}
                    className="btn-secondary text-xs py-1.5 px-3">
                    ✕
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 px-6 py-6 overflow-auto">

          {/* Files tab */}
          {tab === 'files' && (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                {files.length} fichier{files.length !== 1 ? 's' : ''}
                {selectedNodeId ? ' dans cet espace' : ' au total'}
              </p>
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="text-4xl mb-3">📂</div>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {selectedNodeId
                      ? 'Aucun fichier dans cet espace.'
                      : 'Aucun fichier. Uploadez votre premier fichier.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {files.map(file => (
                    <button
                      key={file.id}
                      onClick={() => { void openFile(file.id); }}
                      disabled={!!openingId}
                      className="file-card">
                      {/* Thumbnail or icon */}
                      <div className="w-full h-24 rounded-xl mb-3 flex items-center justify-center overflow-hidden"
                        style={{ background: 'var(--surface-2)' }}>
                        {thumbnails[file.id] ? (
                          <img
                            src={thumbnails[file.id]}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl">
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
            </>
          )}

          {/* Tours tab */}
          {tab === 'tours' && (
            <>
              {showTourForm && (
                <div className="mb-6 p-5 rounded-2xl border"
                  style={{ background: 'white', borderColor: 'var(--violet-light)' }}>
                  <h3 className="font-bold mb-3" style={{ fontFamily: 'Syne, sans-serif' }}>
                    Nouvelle visite 360°
                  </h3>
                  <div className="flex gap-3">
                    <input className="input flex-1" placeholder="Nom de la visite"
                      value={tourName} onChange={e => setTourName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { void createTour(); } }}
                      autoFocus />
                    <button onClick={() => { void createTour(); }}
                      disabled={creatingTour || !tourName.trim()} className="btn-primary">
                      {creatingTour ? '...' : 'Créer'}
                    </button>
                    <button onClick={() => setShowTourForm(false)} className="btn-secondary">Annuler</button>
                  </div>
                </div>
              )}
              {tours.length === 0 && !showTourForm ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-5"
                    style={{ background: 'var(--violet-light)' }}>🌐</div>
                  <h3 className="text-xl font-bold mb-2"
                    style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
                    Aucune visite 360°
                  </h3>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                    Créez votre première visite virtuelle.
                  </p>
                  <button className="btn-primary" onClick={() => setShowTourForm(true)}>
                    + Créer une visite 360°
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {tours.map(tour => (
                    <Link key={tour.id} href={`/projects/${id}/tours/${tour.id}`}>
                      <div className="file-card rounded-2xl p-5">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4"
                          style={{ background: 'var(--violet-light)' }}>🌐</div>
                        <h3 className="font-bold text-base mb-1"
                          style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
                          {tour.name}
                        </h3>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: tour.status === 'PUBLISHED' ? '#ECFDF5' : 'var(--surface-2)',
                            color: tour.status === 'PUBLISHED' ? '#10B981' : 'var(--text-muted)',
                          }}>
                          {tour.status === 'PUBLISHED' ? '● Publié' : '○ Brouillon'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Team tab */}
          {tab === 'team' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ background: 'var(--violet-light)' }}>👥</div>
              <h3 className="font-bold text-lg mb-2"
                style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
                Gérer les intervenants
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Invitez des collaborateurs et gérez leurs permissions.
              </p>
              <Link href={`/projects/${id}/team`} className="btn-primary">
                Gérer les intervenants
              </Link>
            </div>
          )}

          {/* Access tab */}
          {tab === 'access' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
                style={{ background: 'var(--violet-light)' }}>🔗</div>
              <h3 className="font-bold text-lg mb-2"
                style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
                Codes de partage
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Créez des codes d&apos;accès sécurisés.
              </p>
              <Link href={`/projects/${id}/access`} className="btn-primary">
                Gérer les codes
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

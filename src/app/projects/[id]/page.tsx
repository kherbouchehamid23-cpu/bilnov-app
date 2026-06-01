'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { fetchWithAuth } from '@/lib/auth-client';
import dynamic from 'next/dynamic';
import { isCadFile } from '@/lib/cad';
import { uploadFileDirect } from '@/lib/upload';
import { makeThumb, getCachedThumb } from '@/lib/thumbs';

const CadViewer = dynamic(() => import('@/components/CadViewer'), { ssr: false });

interface Project { id: string; name: string; sector: string | null; structureType: string; }
interface StructureNode {
  id: string; name: string; nodeType: string; position: number;
  parentId: string | null; children: StructureNode[]; _count: { files: number };
}
interface FileItem {
  id: string; name: string; fileType: string; mimeType: string;
  sizeBytes: string | number | bigint; nodeId: string | null;
}
interface Tour { id: string; name: string; status: string; }
interface NodesApiResponse { data: { nodes: StructureNode[] }; }
interface FilesApiResponse { data: { files: FileItem[] }; }
interface ThumbnailApiResponse { data: { url: string }; }

type Tab = 'files' | 'tours' | 'team' | 'access';

// Type d'enfant déduit du type parent (ex: étage -> pièce)
const childTypeOf: Record<string, string> = {
  floor: 'room', room: 'zone', zone: 'custom', custom: 'custom',
};
const nodeTypeLabel: Record<string, string> = {
  floor: 'Étage', room: 'Pièce', zone: 'Zone', custom: 'Espace',
};
const nodeTypeIcon: Record<string, string> = {
  floor: '🏢', room: '🚪', zone: '📦', custom: '📌',
};
const icons: Record<string, string> = {
  IMAGE: '🖼️', IMAGE_360: '🌐', PDF: '📄', VIDEO: '🎥',
  GLB: '🧊', GLTF: '🧊', OBJ: '🧊', DWG: '📐', DXF: '📐', IFC: '🏗️',
};

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
  const [cadFile, setCadFile] = useState<{ id: string; name: string } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [menuFileId, setMenuFileId] = useState<string | null>(null);
  const [showTourForm, setShowTourForm] = useState(false);
  const [tourName, setTourName] = useState('');
  const [creatingTour, setCreatingTour] = useState(false);
  // Ajout de nœud express : on garde l'id parent ciblé + le type déduit
  const [addingUnder, setAddingUnder] = useState<{ parentId: string | null; type: string } | null>(null);
  const [nodeName, setNodeName] = useState('');
  const [creatingNode, setCreatingNode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false); // arbre mobile

  const getToken = (): string =>
    typeof window === 'undefined' ? '' : localStorage.getItem('bilnov_token') ?? '';

  const loadThumbnails = useCallback(async (fileList: FileItem[]): Promise<void> => {
    // 1) Images : URL signée directe
    const imageFiles = fileList.filter(
      f => f.fileType === 'IMAGE' || f.mimeType?.startsWith('image/'),
    );
    for (const file of imageFiles) {
      try {
        const res = await fetchWithAuth(`/api/file-url/${file.id}?purpose=view`);
        const data = (await res.json()) as ThumbnailApiResponse;
        if (data.data?.url) setThumbnails(prev => ({ ...prev, [file.id]: data.data.url }));
      } catch { /* skip */ }
    }
    // 2) PDF / DWG : vignette générée à la volée (cache session)
    const previewable = fileList.filter(f => /\.(pdf|dwg)$/i.test(f.name));
    for (const file of previewable) {
      const cached = getCachedThumb(file.id);
      if (cached) { setThumbnails(prev => ({ ...prev, [file.id]: cached })); continue; }
      try {
        const url = await makeThumb(file.id, file.name, async () => {
          const r = await fetch(`/api/file-proxy/${file.id}?token=${encodeURIComponent(getToken())}`);
          return r.blob();
        });
        if (url) setThumbnails(prev => ({ ...prev, [file.id]: url }));
      } catch { /* skip */ }
    }
  }, []);

  const loadFiles = useCallback(async (nodeId: string | null): Promise<void> => {
    const qs = nodeId ? `?nodeId=${nodeId}` : '';
    const r = await api.get<FilesApiResponse>(`/api/projects/${id}/files${qs}`);
    const fileList = r.data?.files ?? [];
    setFiles(fileList);
    void loadThumbnails(fileList);
  }, [id, loadThumbnails]);

  const reloadNodes = useCallback(async () => {
    const r = await api.get<NodesApiResponse>(`/api/projects/${id}/nodes`);
    setNodes(r.data?.nodes ?? []);
  }, [id]);

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
  }, [id, loadFiles]);

  useEffect(() => { void loadFiles(selectedNodeId); }, [selectedNodeId, loadFiles]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        await uploadFileDirect(file, id, getToken(), selectedNodeId ?? null);
      }
      await loadFiles(selectedNodeId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function openFile(fileId: string): Promise<void> {
    if (openingId) return;
    const target = files.find(f => f.id === fileId);
    if (target && isCadFile(target.name, target.fileType)) {
      setCadFile({ id: fileId, name: target.name });
      return;
    }
    setOpeningId(fileId);
    try {
      window.open(`/api/file-proxy/${fileId}?token=${encodeURIComponent(getToken())}`, '_blank');
    } catch { alert('Erreur ouverture fichier'); }
    finally { setOpeningId(null); }
  }

  async function saveFileName(fileId: string): Promise<void> {
    if (!editingFileName.trim()) return;
    setActionLoadingId(fileId);
    try {
      const res = await fetchWithAuth(`/api/projects/${id}/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingFileName.trim() }),
      });
      if (!res.ok) throw new Error('Erreur modification');
      await loadFiles(selectedNodeId);
      setEditingFileId(null); setEditingFileName('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally { setActionLoadingId(null); }
  }

  async function deleteFile(fileId: string): Promise<void> {
    if (!confirm('Supprimer ce fichier ? Cette opération est définitive.')) return;
    setActionLoadingId(fileId);
    try {
      const res = await fetchWithAuth(`/api/projects/${id}/files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur suppression');
      await loadFiles(selectedNodeId);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally { setActionLoadingId(null); setMenuFileId(null); }
  }

  async function createTour(): Promise<void> {
    if (!tourName.trim()) return;
    setCreatingTour(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${id}/tours`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tourName }),
      });
      const data = (await res.json()) as { data?: Tour };
      if (data.data) { setTours(prev => [data.data as Tour, ...prev]); setTourName(''); setShowTourForm(false); }
    } catch { alert('Erreur'); }
    finally { setCreatingTour(false); }
  }

  // Ajout express : type déjà déduit, un seul champ (nom)
  function startAdd(parentId: string | null, parentType?: string) {
    const type = parentId === null ? 'floor' : childTypeOf[parentType ?? 'floor'] ?? 'room';
    setAddingUnder({ parentId, type });
    setNodeName('');
    setDrawerOpen(true);
  }

  async function createNode(): Promise<void> {
    if (!addingUnder || !nodeName.trim()) return;
    setCreatingNode(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${id}/nodes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nodeName.trim(), nodeType: addingUnder.type, parentId: addingUnder.parentId }),
      });
      const data = (await res.json()) as { data?: StructureNode };
      if (data.data) { await reloadNodes(); setNodeName(''); setAddingUnder(null); }
    } catch { alert('Erreur création'); }
    finally { setCreatingNode(false); }
  }

  async function deleteNode(nodeId: string): Promise<void> {
    if (!confirm('Supprimer cet espace ? Les fichiers associés ne seront pas supprimés.')) return;
    try {
      await fetchWithAuth(`/api/projects/${id}/nodes/${nodeId}`, { method: 'DELETE' });
      await reloadNodes();
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    } catch { alert('Erreur suppression'); }
  }

  function selectNode(nodeId: string | null) {
    setSelectedNodeId(nodeId);
    setDrawerOpen(false); // referme le tiroir mobile après sélection
  }

  // ---- Arbre récursif : actions TOUJOURS visibles (tactile) ----
  const renderNodes = (list: StructureNode[], depth = 0): React.ReactNode =>
    list.map(node => (
      <div key={node.id}>
        <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 14}px` }}>
          <button
            onClick={() => selectNode(node.id === selectedNodeId ? null : node.id)}
            className="flex-1 flex items-center gap-2 px-3 rounded-xl text-sm text-left"
            style={{
              minHeight: 44,
              background: selectedNodeId === node.id ? 'var(--violet-light)' : 'transparent',
              color: selectedNodeId === node.id ? 'var(--violet)' : 'var(--text)',
              fontWeight: selectedNodeId === node.id ? 600 : 400,
            }}>
            <span>{nodeTypeIcon[node.nodeType] ?? '📌'}</span>
            <span className="flex-1 truncate">{node.name}</span>
            <span className="text-xs opacity-60">{node._count.files}</span>
          </button>
          <button
            onClick={() => startAdd(node.id, node.nodeType)}
            className="rounded-lg flex items-center justify-center text-base"
            style={{ width: 40, height: 40, color: 'var(--violet)', background: 'var(--surface-2)' }}
            title={`Ajouter ${nodeTypeLabel[childTypeOf[node.nodeType] ?? 'room'] ?? 'un espace'}`}>
            +
          </button>
          <button
            onClick={() => { void deleteNode(node.id); }}
            className="rounded-lg flex items-center justify-center text-base"
            style={{ width: 40, height: 40, color: '#EF4444', background: 'var(--surface-2)' }}
            title="Supprimer">
            ×
          </button>
        </div>
        {/* form d'ajout express, juste sous le parent ciblé */}
        {addingUnder && addingUnder.parentId === node.id && renderAddForm()}
        {node.children.length > 0 && renderNodes(node.children, depth + 1)}
      </div>
    ));

  const renderAddForm = (): React.ReactNode => (
    <div className="my-1 mx-1 p-2 rounded-xl" style={{ background: 'var(--violet-light)' }}>
      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--violet)' }}>
        Nouveau : {nodeTypeLabel[addingUnder?.type ?? 'floor']}
      </p>
      <input
        className="input text-sm mb-2" autoFocus
        placeholder={`Nom (ex: ${nodeTypeLabel[addingUnder?.type ?? 'floor']} 1)`}
        value={nodeName}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNodeName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') void createNode(); if (e.key === 'Escape') setAddingUnder(null); }}
      />
      <div className="flex gap-1">
        <button onClick={() => { void createNode(); }} disabled={creatingNode || !nodeName.trim()}
          className="btn-primary text-xs flex-1" style={{ minHeight: 40 }}>
          {creatingNode ? '...' : 'Créer'}
        </button>
        <button onClick={() => { setAddingUnder(null); setNodeName(''); }}
          className="btn-secondary text-xs" style={{ minHeight: 40 }}>✕</button>
      </div>
    </div>
  );

  // ---- Panneau Structure (réutilisé desktop + tiroir mobile) ----
  const StructurePanel = (
    <div className="flex flex-col gap-1 p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-light)' }}>
          Structure
        </p>
        <button onClick={() => startAdd(null)}
          className="rounded-lg flex items-center justify-center"
          style={{ width: 40, height: 40, color: '#fff', background: 'var(--violet)' }}
          title="Ajouter un étage">+</button>
      </div>
      <button onClick={() => selectNode(null)}
        className="flex items-center gap-2 px-3 rounded-xl text-sm text-left"
        style={{
          minHeight: 44,
          background: selectedNodeId === null ? 'var(--violet-light)' : 'transparent',
          color: selectedNodeId === null ? 'var(--violet)' : 'var(--text)',
          fontWeight: selectedNodeId === null ? 600 : 400,
        }}>
        <span>📂</span><span className="flex-1">Tous les fichiers</span>
      </button>
      {addingUnder && addingUnder.parentId === null && renderAddForm()}
      {renderNodes(nodes)}
      {nodes.length === 0 && !addingUnder && (
        <p className="text-xs px-3 py-4" style={{ color: 'var(--text-light)' }}>
          Aucun espace. Touchez + pour créer un étage.
        </p>
      )}
    </div>
  );

  const tabs: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: 'files', label: 'Fichiers', icon: '📁', count: files.length },
    { key: 'tours', label: 'Visites', icon: '🌐', count: tours.length },
    { key: 'team', label: 'Équipe', icon: '👥' },
    { key: 'access', label: 'Partage', icon: '🔗' },
  ];

  const selectedNodeName = selectedNodeId
    ? findNodeName(nodes, selectedNodeId) : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <Link href="/dashboard" className="rounded-lg flex items-center justify-center"
            style={{ width: 40, height: 40, color: 'var(--text-muted)' }}>←</Link>
          <div className="rounded-lg flex items-center justify-center" style={{ width: 32, height: 32, background: 'var(--violet)' }}>
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <span className="font-bold truncate" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
            {project?.name}
          </span>
          {project?.sector && (
            <span className="text-xs px-2 py-0.5 rounded-full hidden sm:inline"
              style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>{project.sector}</span>
          )}
          <div className="flex-1" />
          {tab === 'files' && (
            <label className={`btn-primary text-sm cursor-pointer ${uploading ? 'opacity-60' : ''}`} style={{ minHeight: 40 }}>
              {uploading ? 'Upload...' : '＋ Fichier'}
              <input type="file" multiple className="hidden" onChange={e => { void handleUpload(e); }} disabled={uploading} />
            </label>
          )}
          {tab === 'tours' && (
            <button className="btn-primary text-sm" style={{ minHeight: 40 }} onClick={() => setShowTourForm(true)}>＋ Visite</button>
          )}
        </div>
      </header>

      {/* Tabs (desktop) */}
      <div className="border-b hidden md:block" style={{ background: 'white', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap"
              style={{ borderColor: tab === t.key ? 'var(--violet)' : 'transparent', color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)' }}>
              <span>{t.icon}</span>{t.label}
              {t.count !== undefined && (
                <span className="px-1.5 py-0.5 rounded-full text-xs"
                  style={{ background: tab === t.key ? 'var(--violet-light)' : 'var(--surface-2)', color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)' }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 max-w-7xl mx-auto w-full relative">
        {/* Sidebar desktop (toujours visible, persistante) */}
        {tab === 'files' && (
          <aside className="hidden md:block w-64 flex-shrink-0 border-r overflow-auto"
            style={{ background: 'white', borderColor: 'var(--border)' }}>
            {StructurePanel}
          </aside>
        )}

        {/* Tiroir mobile */}
        {tab === 'files' && drawerOpen && (
          <>
            <div className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(28,25,23,.45)' }}
              onClick={() => setDrawerOpen(false)} />
            <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-4/5 max-w-xs overflow-auto shadow-xl"
              style={{ background: 'white' }}>
              <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="font-semibold">Structure</span>
                <button onClick={() => setDrawerOpen(false)} style={{ width: 40, height: 40 }}>✕</button>
              </div>
              {StructurePanel}
            </aside>
          </>
        )}

        <main className="flex-1 px-4 py-4 overflow-auto pb-24 md:pb-6">
          {/* FILES */}
          {tab === 'files' && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setDrawerOpen(true)}
                  className="md:hidden btn-secondary text-sm" style={{ minHeight: 40 }}>🗂️ Structure</button>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {selectedNodeName ? <><b style={{ color: 'var(--text)' }}>{selectedNodeName}</b> · </> : null}
                  {files.length} fichier{files.length !== 1 ? 's' : ''}
                </p>
              </div>

              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="text-5xl mb-3">📂</div>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {selectedNodeId ? 'Aucun fichier dans cet espace.' : 'Aucun fichier. Touchez ＋ Fichier pour commencer.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {files.map(file => (
                    <div key={file.id} className="file-card relative" style={{ padding: 10 }}>
                      <button type="button" onClick={() => { void openFile(file.id); }} disabled={!!openingId}
                        className="w-full text-left" style={{ background: 'transparent' }}>
                        <div className="w-full rounded-xl mb-2 flex items-center justify-center overflow-hidden"
                          style={{ height: 130, background: 'var(--surface-2)' }}>
                          {thumbnails[file.id] ? (
                            <img src={thumbnails[file.id]} alt={file.name} className="w-full h-full object-cover" />
                          ) : (
                            <span style={{ fontSize: 44 }}>{openingId === file.id ? '⏳' : (icons[file.fileType] ?? '📁')}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{file.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                          {Math.round(Number(file.sizeBytes) / 1024)} Ko
                        </p>
                      </button>

                      {/* menu ... */}
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setMenuFileId(menuFileId === file.id ? null : file.id); }}
                        className="absolute rounded-lg flex items-center justify-center"
                        style={{ top: 14, right: 14, width: 34, height: 34, background: 'rgba(255,255,255,.92)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        ⋯
                      </button>

                      {menuFileId === file.id && editingFileId !== file.id && (
                        <div className="absolute z-10 rounded-xl shadow-lg overflow-hidden"
                          style={{ top: 50, right: 14, background: '#fff', border: '1px solid var(--border)', minWidth: 150 }}>
                          <button className="block w-full text-left px-4 text-sm" style={{ minHeight: 44 }}
                            onClick={() => { setEditingFileId(file.id); setEditingFileName(file.name); setMenuFileId(null); }}>
                            ✎ Renommer
                          </button>
                          <button className="block w-full text-left px-4 text-sm" style={{ minHeight: 44, color: '#EF4444' }}
                            onClick={() => { void deleteFile(file.id); }}>
                            🗑 Supprimer
                          </button>
                        </div>
                      )}

                      {editingFileId === file.id && (
                        <div className="mt-2 space-y-2">
                          <input value={editingFileName} autoFocus
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingFileName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void saveFileName(file.id); }}
                            className="input text-sm" placeholder="Nouveau nom" disabled={actionLoadingId === file.id} />
                          <div className="flex gap-2">
                            <button onClick={() => { void saveFileName(file.id); }} disabled={actionLoadingId === file.id}
                              className="btn-primary text-xs flex-1" style={{ minHeight: 38 }}>
                              {actionLoadingId === file.id ? '...' : 'OK'}
                            </button>
                            <button onClick={() => { setEditingFileId(null); setEditingFileName(''); }}
                              className="btn-secondary text-xs" style={{ minHeight: 38 }}>Annuler</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TOURS */}
          {tab === 'tours' && (
            <>
              <Link href={`/projects/${id}/krpano`}
                className="flex items-center gap-3 mb-5 p-4 rounded-2xl"
                style={{ background: 'var(--violet-light)' }}>
                <span style={{ fontSize: 28 }}>🏛️</span>
                <span className="flex-1">
                  <span className="block font-semibold" style={{ color: 'var(--violet)' }}>Visites krpano / Pano2VR</span>
                  <span className="block text-xs" style={{ color: 'var(--violet)' }}>Uploader et lire vos archives .zip (tours tuilés)</span>
                </span>
                <span style={{ color: 'var(--violet)' }}>→</span>
              </Link>
              {showTourForm && (
                <div className="mb-6 p-4 rounded-2xl border" style={{ background: 'white', borderColor: 'var(--violet-light)' }}>
                  <h3 className="font-bold mb-3" style={{ fontFamily: 'Syne, sans-serif' }}>Nouvelle visite 360°</h3>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input className="input flex-1" placeholder="Nom de la visite" value={tourName}
                      onChange={e => setTourName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void createTour(); }} autoFocus />
                    <button onClick={() => { void createTour(); }} disabled={creatingTour || !tourName.trim()} className="btn-primary">
                      {creatingTour ? '...' : 'Créer'}
                    </button>
                    <button onClick={() => setShowTourForm(false)} className="btn-secondary">Annuler</button>
                  </div>
                </div>
              )}
              {tours.length === 0 && !showTourForm ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-5" style={{ background: 'var(--violet-light)' }}>🌐</div>
                  <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Aucune visite 360°</h3>
                  <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Créez votre première visite virtuelle.</p>
                  <button className="btn-primary" onClick={() => setShowTourForm(true)}>＋ Créer une visite 360°</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tours.map(tour => (
                    <Link key={tour.id} href={`/projects/${id}/tours/${tour.id}`}>
                      <div className="file-card rounded-2xl p-5">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4" style={{ background: 'var(--violet-light)' }}>🌐</div>
                        <h3 className="font-bold text-base mb-1" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>{tour.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: tour.status === 'PUBLISHED' ? '#ECFDF5' : 'var(--surface-2)', color: tour.status === 'PUBLISHED' ? '#10B981' : 'var(--text-muted)' }}>
                          {tour.status === 'PUBLISHED' ? '● Publié' : '○ Brouillon'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TEAM */}
          {tab === 'team' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4" style={{ background: 'var(--violet-light)' }}>👥</div>
              <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Gérer les intervenants</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Invitez des collaborateurs et gérez leurs permissions.</p>
              <Link href={`/projects/${id}/team`} className="btn-primary">Gérer les intervenants</Link>
            </div>
          )}

          {/* ACCESS */}
          {tab === 'access' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4" style={{ background: 'var(--violet-light)' }}>🔗</div>
              <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Codes de partage</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Créez des codes d&apos;accès sécurisés.</p>
              <Link href={`/projects/${id}/access`} className="btn-primary">Gérer les codes</Link>
            </div>
          )}
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed left-0 right-0 bottom-0 z-30 flex justify-around border-t"
        style={{ background: 'white', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex flex-col items-center justify-center gap-0.5"
            style={{ minWidth: 64, minHeight: 56, color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)', fontWeight: tab === t.key ? 600 : 400 }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 10 }}>{t.label}</span>
          </button>
        ))}
      </nav>

      {cadFile && (
        <CadViewer fileId={cadFile.id} fileName={cadFile.name} token={getToken()} onClose={() => setCadFile(null)} />
      )}
    </div>
  );
}

function findNodeName(list: StructureNode[], targetId: string): string | null {
  for (const n of list) {
    if (n.id === targetId) return n.name;
    const c = findNodeName(n.children, targetId);
    if (c) return c;
  }
  return null;
}

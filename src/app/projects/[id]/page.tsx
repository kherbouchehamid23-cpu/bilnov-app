'use client';
import ThemeToggle from '@/components/ThemeToggle';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import MobileNav from '@/components/MobileNav';
import { api } from '@/lib/api-client';
import { fetchWithAuth } from '@/lib/auth-client';
import dynamic from 'next/dynamic';
import { isCadFile } from '@/lib/cad';
import { isBimOr3D } from '@/lib/bim';
import { CATEGORIES, categoryOfFileType, type CategoryKey } from '@/lib/fileCategories';
import { uploadFileDirect } from '@/lib/upload';
import { acceptAttr, uploadHint, type UploadRulesConfig } from '@/lib/uploadRules';
import { makeThumb, getCachedThumb } from '@/lib/thumbs';
import { Building2, DoorOpen, Package, Pin, Image as ImageIcon, Globe, FileText, Video, Box, Ruler, Building, Folder, Users, Link2, MessageSquare, Layers, Hourglass, Info, Pencil, Trash2, Plus, AlertTriangle, RotateCw, type LucideIcon } from 'lucide-react';

const CadViewer = dynamic(() => import('@/components/CadViewer'), { ssr: false });
const Model3DViewer = dynamic(() => import('@/components/Model3DViewer'), { ssr: false });
const VisitesPanel = dynamic(() => import('@/components/VisitesPanel'), { ssr: false });

interface ProjectAccess { role: 'owner' | 'member'; canView: boolean; canUpload: boolean; canDownload: boolean; canShare: boolean; canModify?: boolean; canDelete?: boolean; canAnnotate?: boolean; canManage: boolean; }
interface Project { id: string; name: string; sector: string | null; structureType: string; access?: ProjectAccess; uploadRules?: UploadRulesConfig | null; }
interface StructureNode {
  id: string; name: string; nodeType: string; position: number;
  parentId: string | null; children: StructureNode[]; _count: { files: number };
}
interface FileItem {
  id: string; name: string; fileType: string; mimeType: string;
  sizeBytes: string | number | bigint; nodeId: string | null; spaces?: { nodeId: string }[];
}
interface NodesApiResponse { data: { nodes: StructureNode[] }; }
interface FilesApiResponse { data: { files: FileItem[] }; }
interface ThumbnailApiResponse { data: { url: string }; }

type Tab = 'files' | 'tours' | 'team' | 'access' | 'comments';

// Type d'enfant déduit du type parent (ex: étage -> pièce)
const childTypeOf: Record<string, string> = {
  floor: 'room', room: 'zone', zone: 'custom', custom: 'custom', building: 'block', block: 'level', level: 'floor', apartment: 'room', local: 'custom', outdoor: 'custom',
};
const nodeTypeLabel: Record<string, string> = {
  floor: 'Étage', room: 'Pièce', zone: 'Zone', custom: 'Espace', building: 'Bâtiment', block: 'Bloc', level: 'Niveau', apartment: 'Appartement', local: 'Local', outdoor: 'Extérieur',
};
const NODE_ICON: Record<string, LucideIcon> = {
  floor: Building2, room: DoorOpen, zone: Package, custom: Pin, building: Building, block: Layers, level: Layers, apartment: Building2, local: Box, outdoor: Package,
};
const FILE_ICON: Record<string, LucideIcon> = {
  IMAGE: ImageIcon, IMAGE_360: Globe, PDF: FileText, VIDEO: Video,
  GLB: Box, GLTF: Box, OBJ: Box, DWG: Ruler, DXF: Ruler, IFC: Building,
};
function NodeIco({ t, size = 16 }: { t: string; size?: number }) { const C = NODE_ICON[t] ?? Pin; return <C size={size} />; }
function FileIco({ t, size = 18 }: { t: string; size?: number }) { const C = FILE_ICON[t] ?? Folder; return <C size={size} />; }

export default function ProjectPage() {
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<StructureNode[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const [tab, setTab] = useState<Tab>('files');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [cadFile, setCadFile] = useState<{ id: string; name: string } | null>(null);
  const [model3dFile, setModel3dFile] = useState<{ id: string; name: string } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [menuFileId, setMenuFileId] = useState<string | null>(null);
  // Ajout de nœud express : on garde l'id parent ciblé + le type déduit
  const [addingUnder, setAddingUnder] = useState<{ parentId: string | null; type: string } | null>(null);
  const [nodeName, setNodeName] = useState('');
  const [creatingNode, setCreatingNode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false); // arbre mobile
  const [fileCat, setFileCat] = useState<CategoryKey | 'all'>('all');
  const [finalPreview, setFinalPreview] = useState(false);
  const [spacesFileId, setSpacesFileId] = useState<string | null>(null);
  const [spacesSel, setSpacesSel] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [tours360Count, setTours360Count] = useState(0);
  const [mobileActions, setMobileActions] = useState(false);

  const access = project?.access;
  const isOwner = access ? access.canManage : true;
  const previewGuest = isOwner && finalPreview;
  const canUpload = (access ? access.canUpload : true) && !previewGuest;
  const canManage = isOwner && !previewGuest;
const canModify = (access ? (access.canModify ?? access.canUpload) : true) && !previewGuest;
const canDelete = (access ? (access.canDelete ?? access.canManage) : true) && !previewGuest;
const canShare = (access ? access.canShare : true) && !previewGuest;
  const isGuest = access ? access.role === 'member' : false;

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

  const loadFiles = useCallback(async (nodeIds: string[]): Promise<void> => {
    const qs = nodeIds.length ? `?nodeIds=${nodeIds.join(',')}` : '';
    const r = await api.get<FilesApiResponse>(`/api/projects/${id}/files${qs}`);
    const fileList = r.data?.files ?? [];
    setFiles(fileList);
    void loadThumbnails(fileList);
    // 360° : compter les visites reelles (natives publiees + krpano finalises).
    try {
      const tr = await api.get<{ data: { items: { kind: string; status: string }[] } }>(`/api/projects/${id}/tours-unified${qs}`);
      const its = tr.data?.items ?? [];
      setTours360Count(its.filter(i => (i.kind === 'tour' && i.status === 'PUBLISHED') || (i.kind === 'krpano' && i.status === 'READY')).length);
    } catch { /* ignore */ }
  }, [id, loadThumbnails]);

  const reloadNodes = useCallback(async () => {
    const r = await api.get<NodesApiResponse>(`/api/projects/${id}/nodes`);
    setNodes(r.data?.nodes ?? []);
  }, [id]);

  useEffect(() => {
    void Promise.all([
      api.get<{ data: Project }>(`/api/projects/${id}`),
      api.get<NodesApiResponse>(`/api/projects/${id}/nodes`),
    ]).then(([p, n]) => {
      setProject(p.data);
      setNodes(n.data?.nodes ?? []);
    }).catch(() => setError(true)).finally(() => setLoading(false));
    void loadFiles([]);
  }, [id, loadFiles]);

  useEffect(() => { void loadFiles(expandNodeIds(nodes, selectedNodeIds)); }, [selectedNodeIds, nodes, loadFiles]);
  // Selection auto de la premiere categorie non vide (le filtre « Tous » a ete retire).
  useEffect(() => {
    if (fileCat !== 'all') return;
    const cc = files.reduce((m, f) => { const k = categoryOfFileType(f.fileType); m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>);
    cc.tours360 = tours360Count;
    const first = CATEGORIES.find(c => (cc[c.key] || 0) > 0);
    if (first) setFileCat(first.key);
  }, [files, tours360Count, fileCat]);
  const openedFromQueryRef = useRef(false);
  useEffect(() => {
    if (openedFromQueryRef.current || typeof window === 'undefined' || files.length === 0) return;
    const fid = new URLSearchParams(window.location.search).get('file');
    if (fid && files.some(f => f.id === fid)) { openedFromQueryRef.current = true; void openFile(fid); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        await uploadFileDirect(file, id, getToken(), selectedNodeId ?? null);
      }
      await loadFiles(expandNodeIds(nodes, selectedNodeIds));
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
    if (target && isBimOr3D(target.name, target.fileType)) {
      setModel3dFile({ id: fileId, name: target.name });
      return;
    }
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
      await loadFiles(expandNodeIds(nodes, selectedNodeIds));
      setEditingFileId(null); setEditingFileName('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally { setActionLoadingId(null); }
  }

  async function saveSpaces(fileId: string): Promise<void> {
    setActionLoadingId(fileId);
    try {
      const target = files.find(f => f.id === fileId);
      const res = await fetchWithAuth(`/api/projects/${id}/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: target ? target.name : '', nodeIds: spacesSel }),
      });
      if (!res.ok) throw new Error('Erreur');
      setSpacesFileId(null);
      await loadFiles(expandNodeIds(nodes, selectedNodeIds));
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
      await loadFiles(expandNodeIds(nodes, selectedNodeIds));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally { setActionLoadingId(null); setMenuFileId(null); }
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
      setSelectedNodeIds(prev => prev.filter(x => x !== nodeId));
    } catch { alert('Erreur suppression'); }
  }

  function selectNode(nodeId: string | null) {
    setSelectedNodeIds(prev => nodeId === null ? [] : (prev.includes(nodeId) ? prev.filter(x => x !== nodeId) : [...prev, nodeId]));
    setDrawerOpen(false); // referme le tiroir mobile après sélection
  }

  // ---- Arbre récursif : actions TOUJOURS visibles (tactile) ----
  const renderNodes = (list: StructureNode[], depth = 0): React.ReactNode =>
    list.map(node => (
      <div key={node.id}>
        <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 14}px` }}>
          <button
            onClick={() => selectNode(node.id)}
            className="flex-1 flex items-center gap-2 px-3 rounded-xl text-sm text-left"
            style={{
              minHeight: 44,
              background: selectedNodeIds.includes(node.id) ? 'var(--violet-light)' : 'transparent',
              color: selectedNodeIds.includes(node.id) ? 'var(--violet)' : 'var(--text)',
              fontWeight: selectedNodeIds.includes(node.id) ? 600 : 400,
            }}>
            <span><NodeIco t={node.nodeType} size={16} /></span>
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
        Nouveau :</p>
            <select className="input text-sm mb-2" value={addingUnder?.type ?? 'floor'} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAddingUnder(prev => (prev ? { ...prev, type: e.target.value } : prev))}>
              {Object.keys(nodeTypeLabel).map(t => (<option key={t} value={t}>{nodeTypeLabel[t]}</option>))}
            </select>
            <p style={{ display: 'none' }}>
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
          background: selectedNodeIds.length === 0 ? 'var(--violet-light)' : 'transparent',
          color: selectedNodeIds.length === 0 ? 'var(--violet)' : 'var(--text)',
          fontWeight: selectedNodeIds.length === 0 ? 600 : 400,
        }}>
        <Folder size={16} /><span className="flex-1">Tous les fichiers</span>
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

  const tabs: { key: Tab; label: string; Icon: LucideIcon; count?: number }[] = [
    { key: 'files', label: 'Fichiers', Icon: Folder, count: files.length },
    // « Visites » retiré pour le visiteur : la 360° est un filtre de fichiers ; gestion réservée à l'abonné/architecte.
    ...(canManage ? [{ key: 'tours' as Tab, label: 'Visites', Icon: Globe }] : []),
    // Équipe / Partage : visibles seulement si le partage est autorisé (canShare) ou pour le gestionnaire.
    ...((canManage || canShare) ? [{ key: 'team' as Tab, label: 'Équipe', Icon: Users }] : []),
    ...((canManage || canShare) ? [{ key: 'access' as Tab, label: 'Partage', Icon: Link2 }] : []),
    { key: 'comments', label: 'Commentaires', Icon: MessageSquare },
  ];

  const selectedNodeName = selectedNodeId
    ? findNodeName(nodes, selectedNodeId) : null;
  const selectedNodeType = selectedNodeId
    ? findNodeType(nodes, selectedNodeId) : null;
  const uploadRules = project?.uploadRules ?? null;
  const uploadAccept = acceptAttr(selectedNodeType, uploadRules);
  const uploadMsg = uploadHint(selectedNodeType, uploadRules);
  const catCounts = files.reduce((m, f) => { const k = categoryOfFileType(f.fileType); m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>);
  catCounts.tours360 = tours360Count;
  const visibleCats = CATEGORIES.filter(c => (catCounts[c.key] || 0) > 0);
  const shownFiles = fileCat === 'all' ? files : files.filter(f => categoryOfFileType(f.fileType) === fileCat);

  if (loading || error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface)' }}>
        {error ? (
              <div className="flex flex-col items-center gap-3 text-center px-6">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,120,90,.14)' }}><AlertTriangle size={30} style={{ color: '#ff785a' }} /></div>
                <div className="text-base font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Impossible de charger ce projet</div>
                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Vérifiez votre connexion, puis réessayez.</div>
                <button onClick={() => window.location.reload()} className="btn-primary" style={{ minHeight: 40 }}><RotateCw size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} /> Réessayer</button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}><span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--text-muted)', display: 'inline-block', animation: 'ui-spin .7s linear infinite' }} />Chargement…</div>
            )}
      </div>
    );
  }

  return (
    <div className="lg-app min-h-screen flex flex-col" style={{ background: 'var(--surface)' }}>
      <MobileNav />
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
          {isGuest && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }} title="Vous êtes invité sur ce projet">Invité</span>
          )}
          <div className="flex-1" />
            <ThemeToggle />
            {isOwner && (<Link href={`/projects/${id}/audit`} className="text-sm rounded-lg px-3" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)' }} title="Journal d'audit">Journal</Link>)}
            {isOwner && (
              <button type="button" onClick={() => setFinalPreview(v => !v)} className="text-sm rounded-lg px-3" style={{ minHeight: 40, fontWeight: 500, color: finalPreview ? '#92400E' : 'var(--violet)', background: finalPreview ? '#FEF3C7' : 'var(--violet-light)' }} title="Basculer entre le mode gestion et l'aperçu client">
                {finalPreview ? 'Aperçu client — Revenir' : 'Vue client'}
              </button>
            )}
          {tab === 'files' && canUpload && (
            <label className={`btn-primary text-sm cursor-pointer ${uploading ? 'opacity-60' : ''}`} style={{ minHeight: 40 }}>
              {uploading ? 'Upload...' : (<><Plus size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} /><span className="hidden sm:inline">Fichier</span></>)}
              <input type="file" multiple accept={uploadAccept} title={uploadMsg} className="hidden" onChange={e => { void handleUpload(e); }} disabled={uploading} />
            </label>
          )}

        </div>
      </header>

      {/* Tabs (desktop) */}
      <div className="border-b hidden md:block" style={{ background: 'rgba(255,255,255,.04)', borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap"
              style={{ borderColor: tab === t.key ? 'var(--violet)' : 'transparent', color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)' }}>
              <t.Icon size={16} />{t.label}
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
            style={{ background: 'rgba(255,255,255,.04)', borderColor: 'var(--border)' }}>
            {StructurePanel}
          </aside>
        )}

        {/* Tiroir mobile */}
        {tab === 'files' && drawerOpen && (
          <>
            <div className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(28,25,23,.45)' }}
              onClick={() => setDrawerOpen(false)} />
            <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-4/5 max-w-xs overflow-auto shadow-xl"
              style={{ background: '#0b1120' }}>
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
                  className="md:hidden btn-secondary text-sm" style={{ minHeight: 40 }}><Layers size={15} /> Structure</button>
                  <button type="button" onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')} className="btn-secondary text-sm" style={{ minHeight: 40 }} title="Basculer grille / liste">{viewMode === 'grid' ? 'Liste' : 'Grille'}</button>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {selectedNodeName ? <><b style={{ color: 'var(--text)' }}>{selectedNodeName}</b> · </> : null}
                  {files.length} fichier{files.length !== 1 ? 's' : ''}
                </p>
              </div>
              {selectedNodeIds.length > 0 && (
                <div className="flex items-center flex-wrap gap-2 mb-3 text-xs">
                  <span className="font-semibold" style={{ color: 'var(--violet)' }}>Filtre actif :</span>
                  {selectedNodeIds.map(nid => (
                    <span key={nid} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                      {findNodeName(nodes, nid) ?? 'Espace'}
                      <button type="button" aria-label="Retirer" onClick={() => setSelectedNodeIds(prev => prev.filter(x => x !== nid))} style={{ lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setSelectedNodeIds([])} className="underline" style={{ color: 'var(--text-muted)' }}>Réinitialiser</button>
                </div>
              )}
              <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                {visibleCats.map(c => (
                  <button key={c.key} type="button" onClick={() => setFileCat(c.key)} className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap" style={{ background: fileCat === c.key ? 'var(--violet)' : 'var(--surface-2)', color: fileCat === c.key ? '#fff' : 'var(--text-muted)' }}>{c.label} <span style={{ opacity: .6 }}>{catCounts[c.key] || 0}</span></button>
                ))}
              </div>
              {canUpload && uploadAccept && (
                <p className="text-xs mb-3 inline-flex items-center gap-1 px-2 py-1 rounded-lg"
                  style={{ background: 'var(--violet-light)', color: 'var(--violet)' }}>
                  <Info size={14} /> {uploadMsg}
                </p>
              )}

              {fileCat === 'tours360' ? (
                <div className="mb-4"><VisitesPanel projectId={id} canManage={canManage} getToken={getToken} publishedOnly /></div>
              ) : shownFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-3"><Folder size={48} style={{ color: 'var(--text-light)' }} /></div>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {selectedNodeId ? 'Aucun fichier dans cet espace.' : 'Aucun fichier. Touchez ＋ Fichier pour commencer.'}
                  </p>
                </div>
              ) : (
                <div className={viewMode === 'list' ? 'flex flex-col gap-2' : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'}>
                  {shownFiles.map(file => (
                    <div key={file.id} className="file-card relative" style={{ padding: 10 }}>
                      <button type="button" onClick={() => { void openFile(file.id); }} disabled={!!openingId}
                        className="w-full text-left" style={{ background: 'transparent' }}>
                        <div className="w-full rounded-xl mb-2 flex items-center justify-center overflow-hidden"
                          style={{ height: 130, background: 'var(--surface-2)' }}>
                          {thumbnails[file.id] ? (
                            <img src={thumbnails[file.id]} alt={file.name} className="w-full h-full object-cover" />
                          ) : (
                            <span>{openingId === file.id ? <Hourglass size={40} style={{ color: 'var(--text-light)' }} /> : <FileIco t={file.fileType} size={40} />}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{file.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-light)' }}>
                          {Math.round(Number(file.sizeBytes) / 1024)} Ko
                        </p>
                      </button>

                      {/* menu ... */}
                      {(canModify || canDelete) && (<>
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setMenuFileId(menuFileId === file.id ? null : file.id); }}
                        className="absolute rounded-lg flex items-center justify-center file-menu-btn"
                        style={{ top: 14, right: 14, width: 34, height: 34 }}>
                        ⋯
                      </button>

                      {menuFileId === file.id && editingFileId !== file.id && (
                        <div className="absolute z-10 rounded-xl shadow-lg overflow-hidden file-menu-pop"
                          style={{ top: 50, right: 14, minWidth: 150 }}>
                          {canModify && (<button className="block w-full text-left px-4 text-sm" style={{ minHeight: 44, color: 'var(--violet)' }} onClick={() => { setSpacesFileId(file.id); setSpacesSel((file.spaces ?? []).map(sp => sp.nodeId)); setMenuFileId(null); }}><Layers size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Espaces</button>)}
                          {canModify && (<button className="block w-full text-left px-4 text-sm" style={{ minHeight: 44, color: 'var(--text)' }}
                            onClick={() => { setEditingFileId(file.id); setEditingFileName(file.name); setMenuFileId(null); }}>
                            <Pencil size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Renommer
                          </button>)}
                          {canDelete && (<button className="block w-full text-left px-4 text-sm" style={{ minHeight: 44, color: '#EF4444' }}
                            onClick={() => { void deleteFile(file.id); }}>
                            <Trash2 size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Supprimer
                          </button>)}
                        </div>
                      )}
                      </>)}

                      {spacesFileId === file.id && (
                        <div className="mt-2 p-2 rounded-xl" style={{ background: 'var(--surface-2)' }}>
                          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Espaces du fichier</p>
                          <div className="max-h-40 overflow-auto space-y-1">
                            {flatNodes(nodes).map(n => (
                              <label key={n.id} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={spacesSel.includes(n.id)} onChange={() => setSpacesSel(prev => prev.includes(n.id) ? prev.filter(x => x !== n.id) : [...prev, n.id])} />
                                <span className="truncate">{n.name}</span>
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => { void saveSpaces(file.id); }} disabled={actionLoadingId === file.id} className="btn-primary text-xs flex-1" style={{ minHeight: 38 }}>{actionLoadingId === file.id ? '...' : 'Enregistrer'}</button>
                            <button onClick={() => { setSpacesFileId(null); }} className="btn-secondary text-xs" style={{ minHeight: 38 }}>Annuler</button>
                          </div>
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

          {/* TOURS — visites 360 + krpano unifiees */}
          {tab === 'tours' && (
            <VisitesPanel projectId={id} canManage={canManage} getToken={getToken} />
          )}

          {/* TEAM */}
          {tab === 'team' && !canManage && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4" style={{ background: 'var(--surface-2)' }}><Users size={30} style={{ color: 'var(--violet)' }} /></div>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Seul le propriétaire du projet peut gérer les intervenants.
              </p>
            </div>
          )}
          {tab === 'team' && canManage && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4" style={{ background: 'var(--violet-light)' }}><Users size={30} style={{ color: 'var(--violet)' }} /></div>
              <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Gérer les intervenants</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Invitez des collaborateurs et gérez leurs permissions.</p>
              <Link href={`/projects/${id}/team`} className="btn-primary">Gérer les intervenants</Link>
            </div>
          )}

          {/* ACCESS */}
          {tab === 'access' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4" style={{ background: 'var(--violet-light)' }}><Link2 size={30} style={{ color: 'var(--violet)' }} /></div>
              <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Codes de partage</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Créez des codes d&apos;accès sécurisés.</p>
              <Link href={`/projects/${id}/access`} className="btn-primary">Gérer les codes</Link>
            </div>
          )}
          {tab === 'comments' && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4" style={{ background: 'var(--violet-light)' }}><MessageSquare size={30} style={{ color: 'var(--violet)' }} /></div>
              <h3 className="font-bold text-lg mb-2" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>Commentaires &amp; reserves</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Observations, reserves et non-conformites du projet.</p>
              <Link href={`/projects/${id}/comments`} className="btn-primary">Ouvrir les commentaires</Link>
            </div>
          )}
        </main>
      </div>

      {/* Menu d'actions mobile selon permissions (remplace l'ancien bouton + d'upload). */}
      {/* Visiteur en lecture seule (aucune action autorisée) : aucun bouton flottant — seule la consultation. */}
      {(canUpload || canShare || canManage) && (
        <div className="md:hidden">
          {mobileActions && (
            <div className="fixed inset-0 z-40" onClick={() => setMobileActions(false)} style={{ background: 'rgba(0,0,0,.4)' }}>
              <div onClick={(e) => e.stopPropagation()} className="fixed left-4 right-4 rounded-2xl p-2" style={{ bottom: 148, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,.35)' }}>
                {canUpload && (
                  <label className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer" style={{ color: 'var(--text)' }}>
                    <Plus size={18} style={{ color: 'var(--violet)' }} /> Uploader un fichier
                    <input type="file" multiple accept={uploadAccept} className="hidden" onChange={e => { setMobileActions(false); void handleUpload(e); }} disabled={uploading} />
                  </label>
                )}
                {canShare && (
                  <Link href={`/projects/${id}/access`} onClick={() => setMobileActions(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ color: 'var(--text)' }}><Link2 size={18} style={{ color: 'var(--violet)' }} /> Partager (codes d&apos;accès)</Link>
                )}
                {(canManage || canShare) && (
                  <Link href={`/projects/${id}/team`} onClick={() => setMobileActions(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ color: 'var(--text)' }}><Users size={18} style={{ color: 'var(--violet)' }} /> Inviter un intervenant</Link>
                )}
              </div>
            </div>
          )}
          <button type="button" onClick={() => setMobileActions(v => !v)} aria-label="Actions" className="fixed z-40 flex items-center justify-center" style={{ right: 16, bottom: 76, width: 56, height: 56, borderRadius: 9999, background: 'var(--violet)', color: '#fff', boxShadow: '0 8px 24px rgba(124,58,237,.4)' }}>
            <Plus size={24} style={{ transform: mobileActions ? 'rotate(45deg)' : 'none', transition: 'transform .15s' }} />
          </button>
        </div>
      )}
      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed left-0 right-0 bottom-0 z-30 flex justify-around border-t"
        style={{ background: '#0b1120', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex flex-col items-center justify-center gap-0.5"
            style={{ minWidth: 64, minHeight: 56, color: tab === t.key ? 'var(--violet)' : 'var(--text-muted)', fontWeight: tab === t.key ? 600 : 400 }}>
            <t.Icon size={20} />
            <span style={{ fontSize: 10 }}>{t.label}</span>
          </button>
        ))}
      </nav>

      {cadFile && (
        <CadViewer fileId={cadFile.id} fileName={cadFile.name} token={getToken()} canAnnotate={canManage || canUpload} onClose={() => setCadFile(null)} />
      )}
      {model3dFile && (
        <Model3DViewer fileId={model3dFile.id} fileName={model3dFile.name} token={getToken()} projectId={id} canComment={canManage || canUpload} onClose={() => setModel3dFile(null)} />
      )}
    </div>
  );
}

function flatNodes(list: StructureNode[]): StructureNode[] {
  const out: StructureNode[] = [];
  const walk = (ns: StructureNode[]): void => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(list);
  return out;
}

function expandNodeIds(list: StructureNode[], targetIds: string[]): string[] {
  const targets = new Set(targetIds);
  const out: string[] = [];
  const walk = (nodes: StructureNode[], parentIncluded: boolean): void => {
    for (const n of nodes) {
      const inc = parentIncluded || targets.has(n.id);
      if (inc) out.push(n.id);
      walk(n.children, inc);
    }
  };
  walk(list, false);
  return out;
}

function findNodeType(list: StructureNode[], targetId: string): string | null {
  for (const n of list) {
    if (n.id === targetId) return n.nodeType;
    const c = findNodeType(n.children, targetId);
    if (c) return c;
  }
  return null;
}

function findNodeName(list: StructureNode[], targetId: string): string | null {
  for (const n of list) {
    if (n.id === targetId) return n.name;
    const c = findNodeName(n.children, targetId);
    if (c) return c;
  }
  return null;
}

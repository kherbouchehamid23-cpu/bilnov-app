'use client';
import React, { useMemo, useState, useCallback } from 'react';

export const ROOT_TOKEN = '__root__';

export interface TreeNode {
  id: string;
  name: string;
  nodeType: string;
  children: TreeNode[];
  _count?: { files: number };
}

export interface ScopeValue {
  nodeIds: string[]; // espaces entiers (dynamiques) + ROOT_TOKEN éventuel
  fileIds: string[]; // fichiers précis (figés)
}

interface FileLite { id: string; name: string; fileType: string; nodeId: string | null; }

interface Props {
  projectId: string;
  nodes: TreeNode[];
  value: ScopeValue | null; // null = tout le projet
  onChange: (next: ScopeValue | null) => void;
  getToken: () => string;
  rootFilesCount?: number;
}

const icon: Record<string, string> = { floor: '🏢', room: '🚪', zone: '📦', custom: '📌' };
const fileIcon: Record<string, string> = {
  IMAGE: '🖼️', IMAGE_360: '🌐', PDF: '📄', VIDEO: '🎥',
  DWG: '📐', DXF: '📐', IFC: '🏗️', GLB: '🧊', GLTF: '🧊', OBJ: '🧊',
};

function collectSelfAndDesc(node: TreeNode, acc: string[] = []): string[] {
  acc.push(node.id);
  for (const c of node.children) collectSelfAndDesc(c, acc);
  return acc;
}

export default function NodeTreeSelect({ projectId, nodes, value, onChange, getToken, rootFilesCount = 0 }: Props) {
  const allMode = value === null;
  const nodeSet = useMemo(() => new Set(value?.nodeIds ?? []), [value]);
  const fileSet = useMemo(() => new Set(value?.fileIds ?? []), [value]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filesByNode, setFilesByNode] = useState<Record<string, FileLite[]>>({});
  const [loadingNode, setLoadingNode] = useState<string | null>(null);

  const ensureFiles = useCallback(async (nodeId: string) => {
    if (filesByNode[nodeId]) return;
    setLoadingNode(nodeId);
    try {
      const r = await fetch(`/api/projects/${projectId}/files?nodeId=${nodeId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const d = await r.json() as { data?: { files?: FileLite[] } };
      setFilesByNode(prev => ({ ...prev, [nodeId]: d.data?.files ?? [] }));
    } catch {
      setFilesByNode(prev => ({ ...prev, [nodeId]: [] }));
    } finally {
      setLoadingNode(null);
    }
  }, [projectId, filesByNode, getToken]);

  function emit(nIds: Set<string>, fIds: Set<string>) {
    if (nIds.size === 0 && fIds.size === 0) { onChange(null); return; }
    onChange({ nodeIds: Array.from(nIds), fileIds: Array.from(fIds) });
  }

  function setAll() { onChange(null); }

  function nodeState(node: TreeNode): 'on' | 'partial' | 'off' {
    if (allMode) return 'on';
    if (nodeSet.has(node.id)) return 'on';
    const desc = collectSelfAndDesc(node);
    if (desc.some(id => nodeSet.has(id))) return 'partial';
    const nf = filesByNode[node.id] ?? [];
    if (nf.some(f => fileSet.has(f.id))) return 'partial';
    return 'off';
  }

  function toggleNode(node: TreeNode) {
    const nIds = new Set(allMode ? [] : Array.from(nodeSet));
    const fIds = new Set(allMode ? [] : Array.from(fileSet));
    const ids = collectSelfAndDesc(node);
    if (nIds.has(node.id)) {
      ids.forEach(id => nIds.delete(id));
    } else {
      ids.forEach(id => nIds.delete(id));
      nIds.add(node.id);
      const nf = filesByNode[node.id] ?? [];
      nf.forEach(f => fIds.delete(f.id)); // englobés par l'espace entier
    }
    emit(nIds, fIds);
  }

  function toggleFile(file: FileLite, parentNode: TreeNode) {
    const nIds = new Set(allMode ? [] : Array.from(nodeSet));
    const fIds = new Set(allMode ? [] : Array.from(fileSet));
    if (nIds.has(parentNode.id)) {
      // l'espace était entier -> bascule en sélection fine sans ce fichier
      nIds.delete(parentNode.id);
      const nf = filesByNode[parentNode.id] ?? [];
      nf.forEach(f => { if (f.id !== file.id) fIds.add(f.id); });
    } else if (fIds.has(file.id)) {
      fIds.delete(file.id);
    } else {
      fIds.add(file.id);
    }
    emit(nIds, fIds);
  }

  function toggleRoot() {
    const nIds = new Set(allMode ? [] : Array.from(nodeSet));
    const fIds = new Set(allMode ? [] : Array.from(fileSet));
    if (nIds.has(ROOT_TOKEN)) nIds.delete(ROOT_TOKEN); else nIds.add(ROOT_TOKEN);
    emit(nIds, fIds);
  }

  function fileChecked(file: FileLite, parentNode: TreeNode): boolean {
    if (allMode) return true;
    if (nodeSet.has(parentNode.id)) return true;
    return fileSet.has(file.id);
  }

  const renderNode = (node: TreeNode, depth = 0): React.ReactNode => {
    const st = nodeState(node);
    const isExp = expanded.has(node.id);
    const count = node._count?.files ?? 0;
    return (
      <div key={node.id}>
        <div className="flex items-center gap-1" style={{ paddingLeft: 6 + depth * 14 }}>
          <button type="button"
            onClick={() => {
              const e = new Set(expanded);
              if (e.has(node.id)) e.delete(node.id); else { e.add(node.id); void ensureFiles(node.id); }
              setExpanded(e);
            }}
            className="flex items-center justify-center"
            style={{ width: 24, height: 36, color: 'var(--text-light)' }}
            title="Voir les fichiers de cet espace">
            {count > 0 ? (isExp ? '▾' : '▸') : ''}
          </button>
          <label className="flex items-center gap-2 flex-1 rounded-lg cursor-pointer px-1"
            style={{ minHeight: 36, background: st === 'on' ? 'var(--violet-light)' : 'transparent' }}>
            <input type="checkbox" checked={st === 'on'}
              ref={el => { if (el) el.indeterminate = st === 'partial'; }}
              onChange={() => toggleNode(node)} />
            <span>{icon[node.nodeType] ?? '📌'}</span>
            <span className="flex-1 truncate text-sm" style={{ color: 'var(--text)' }}>{node.name}</span>
            <span className="text-xs" style={{ color: 'var(--text-light)' }}>{count}</span>
          </label>
        </div>

        {isExp && (
          <div style={{ paddingLeft: 6 + (depth + 1) * 14 }}>
            {loadingNode === node.id ? (
              <p className="text-xs px-2 py-1" style={{ color: 'var(--text-light)' }}>Chargement…</p>
            ) : (filesByNode[node.id] ?? []).length === 0 ? (
              <p className="text-xs px-2 py-1" style={{ color: 'var(--text-light)' }}>Aucun fichier direct.</p>
            ) : (filesByNode[node.id] ?? []).map(file => (
              <label key={file.id} className="flex items-center gap-2 rounded-lg cursor-pointer px-2" style={{ minHeight: 32 }}>
                <input type="checkbox" checked={fileChecked(file, node)} onChange={() => toggleFile(file, node)} />
                <span>{fileIcon[file.fileType] ?? '📄'}</span>
                <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{file.name}</span>
              </label>
            ))}
          </div>
        )}

        {node.children.length > 0 && node.children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <label className="flex items-center gap-2 px-3 border-b cursor-pointer"
        style={{ minHeight: 44, borderColor: 'var(--border)', background: allMode ? 'var(--violet-light)' : 'transparent' }}>
        <input type="checkbox" checked={allMode} onChange={setAll} />
        <span>📂</span>
        <span className="flex-1 text-sm font-semibold" style={{ color: allMode ? 'var(--violet)' : 'var(--text)' }}>Tout le projet</span>
      </label>

      <div className="max-h-72 overflow-auto p-1">
        {rootFilesCount > 0 && (
          <label className="flex items-center gap-2 px-2 rounded-lg cursor-pointer" style={{ minHeight: 40 }}>
            <input type="checkbox" checked={allMode || nodeSet.has(ROOT_TOKEN)} disabled={allMode} onChange={toggleRoot} />
            <span>🗂️</span>
            <span className="flex-1 truncate text-sm" style={{ color: 'var(--text)' }}>Fichiers à la racine</span>
            <span className="text-xs" style={{ color: 'var(--text-light)' }}>{rootFilesCount}</span>
          </label>
        )}
        {nodes.length === 0 ? (
          <p className="text-xs px-3 py-3" style={{ color: 'var(--text-light)' }}>Aucun espace dans ce projet.</p>
        ) : nodes.map(n => renderNode(n))}
      </div>

      <p className="text-xs px-3 py-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        {allMode
          ? 'Tout le contenu du projet sera partagé.'
          : 'Espace coché = tout son contenu (présent et futur). Dépliez ▸ pour ne choisir que certains fichiers.'}
      </p>
    </div>
  );
}

'use client';
import React, { useMemo } from 'react';

export const ROOT_TOKEN = '__root__';

export interface TreeNode {
  id: string;
  name: string;
  nodeType: string;
  children: TreeNode[];
  _count?: { files: number };
}

interface Props {
  nodes: TreeNode[];
  // null/[] = tout le projet. Sinon liste des nœuds cochés (+ ROOT_TOKEN pour racine).
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  rootFilesCount?: number; // nb de fichiers à la racine (sans nœud)
}

const icon: Record<string, string> = { floor: '🏢', room: '🚪', zone: '📦', custom: '📌' };

// Aplatir l'arbre : id -> liste de ses descendants (lui inclus)
function collectSelfAndDesc(node: TreeNode, acc: string[] = []): string[] {
  acc.push(node.id);
  for (const c of node.children) collectSelfAndDesc(c, acc);
  return acc;
}

export default function NodeTreeSelect({ nodes, value, onChange, rootFilesCount = 0 }: Props) {
  const allMode = value === null || value.length === 0;
  const selected = useMemo(() => new Set(value ?? []), [value]);

  // état d'une case : 'on' (coché), 'partial' (un descendant coché), 'off'
  function stateOf(node: TreeNode): 'on' | 'partial' | 'off' {
    if (allMode) return 'on';
    if (selected.has(node.id)) return 'on';
    const desc = collectSelfAndDesc(node).slice(1);
    if (desc.some(id => selected.has(id))) return 'partial';
    return 'off';
  }

  function toggle(node: TreeNode) {
    // Si on était en "tout", on bascule en sélection explicite à partir de cet état
    const base = new Set<string>(allMode ? [] : Array.from(selected));
    const ids = collectSelfAndDesc(node); // node + descendants
    const isOn = base.has(node.id);
    if (isOn) {
      // décocher node + descendants
      ids.forEach(id => base.delete(id));
    } else {
      // cocher node + descendants
      ids.forEach(id => base.add(id));
    }
    onChange(base.size === 0 ? [] : Array.from(base));
  }

  function toggleRoot() {
    const base = new Set<string>(allMode ? [] : Array.from(selected));
    if (base.has(ROOT_TOKEN)) base.delete(ROOT_TOKEN); else base.add(ROOT_TOKEN);
    onChange(base.size === 0 ? [] : Array.from(base));
  }

  function setAll() { onChange(null); } // tout le projet

  const render = (list: TreeNode[], depth = 0): React.ReactNode =>
    list.map(node => {
      const st = stateOf(node);
      return (
        <div key={node.id}>
          <label className="flex items-center gap-2 px-2 rounded-lg cursor-pointer"
            style={{ minHeight: 40, paddingLeft: 8 + depth * 16, background: st === 'on' ? 'var(--violet-light)' : 'transparent' }}>
            <input type="checkbox" checked={st === 'on'}
              ref={el => { if (el) el.indeterminate = st === 'partial'; }}
              onChange={() => toggle(node)} />
            <span>{icon[node.nodeType] ?? '📌'}</span>
            <span className="flex-1 truncate text-sm" style={{ color: 'var(--text)' }}>{node.name}</span>
            {node._count && <span className="text-xs" style={{ color: 'var(--text-light)' }}>{node._count.files}</span>}
          </label>
          {node.children.length > 0 && render(node.children, depth + 1)}
        </div>
      );
    });

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      {/* En-tête : tout le projet */}
      <label className="flex items-center gap-2 px-3 border-b cursor-pointer"
        style={{ minHeight: 44, borderColor: 'var(--border)', background: allMode ? 'var(--violet-light)' : 'transparent' }}>
        <input type="checkbox" checked={allMode} onChange={setAll} />
        <span>📂</span>
        <span className="flex-1 text-sm font-semibold" style={{ color: allMode ? 'var(--violet)' : 'var(--text)' }}>
          Tout le projet
        </span>
      </label>

      <div className="max-h-64 overflow-auto p-1">
        {/* Fichiers à la racine */}
        {rootFilesCount > 0 && (
          <label className="flex items-center gap-2 px-2 rounded-lg cursor-pointer" style={{ minHeight: 40 }}>
            <input type="checkbox" checked={allMode || selected.has(ROOT_TOKEN)} disabled={allMode} onChange={toggleRoot} />
            <span>🗂️</span>
            <span className="flex-1 truncate text-sm" style={{ color: 'var(--text)' }}>Fichiers à la racine</span>
            <span className="text-xs" style={{ color: 'var(--text-light)' }}>{rootFilesCount}</span>
          </label>
        )}
        {nodes.length === 0 ? (
          <p className="text-xs px-3 py-3" style={{ color: 'var(--text-light)' }}>Aucun espace dans ce projet.</p>
        ) : render(nodes)}
      </div>

      <p className="text-xs px-3 py-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        {allMode
          ? 'Tout le contenu du projet sera partagé.'
          : 'Seuls les espaces cochés (et leur contenu) seront partagés.'}
      </p>
    </div>
  );
}

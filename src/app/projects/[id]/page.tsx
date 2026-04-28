'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ data: any }>(`/api/projects/${id}`),
      api.get<{ data: { files: any[] } }>(`/api/projects/${id}/files`),
    ]).then(([p, f]) => {
      setProject(p.data);
      setFiles(f.data?.files ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await fetch(`/api/projects/${id}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('bilnov_token')}` },
        body: formData,
      });
      const r = await api.get<{ data: { files: any[] } }>(`/api/projects/${id}/files`);
      setFiles(r.data?.files ?? []);
    } catch (err: any) {
      alert(err.message ?? 'Erreur upload');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">←</Link>
          <div className="w-8 h-8 bg-primary-700 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <span className="font-semibold text-gray-900">{project?.name}</span>
          {project?.sector && <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">{project.sector}</span>}
        </div>
        <label className={`bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-primary-800 transition-colors ${uploading ? 'opacity-60' : ''}`}>
          {uploading ? 'Upload...' : '+ Ajouter fichier'}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </header>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <p className="text-sm text-gray-500 mb-4">{files.length} fichier{files.length !== 1 ? 's' : ''}</p>
        {files.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📂</div>
            <p className="text-gray-500">Aucun fichier. Uploadez votre premier fichier.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {files.map(file => (
              <div key={file.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="text-3xl mb-3 text-center">
                  {file.fileType === 'PDF' ? '📄' : file.fileType === 'IMAGE_360' ? '🌐' : file.fileType?.startsWith('IMAGE') ? '🖼️' : '📁'}
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full mt-1 inline-block">{file.fileType}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

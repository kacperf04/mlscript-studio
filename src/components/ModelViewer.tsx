import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Network, Settings2, Activity, Loader2, AlertCircle, Box, AlignLeft } from 'lucide-react';

interface ModelViewerProps {
  modelPath: string;
  workspacePath: string;
}

interface ModelData {
  type?: string;
  params?: Record<string, any>;
  is_fitted?: boolean;
  learned_attrs?: Record<string, any>;
  error?: string;
}

export default function ModelViewer({ modelPath, workspacePath }: ModelViewerProps) {
  const [data, setData] = useState<ModelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModelInfo = async () => {
      setLoading(true);
      try {
        // Call the headless Python extractor via Rust
        const rawJson: string = await invoke('inspect_model', { workspacePath, modelPath });
        const parsed = JSON.parse(rawJson);
        setData(parsed);
      } catch (err: any) {
        setData({ error: err.toString() });
      } finally {
        setLoading(false);
      }
    };

    fetchModelInfo();
  }, [modelPath, workspacePath]);

  const fileName = modelPath.split('/').pop();

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[#0a0a0a] text-neutral-500 font-mono text-sm gap-4">
        <Loader2 className="animate-spin" size={24} /> 
        Inspecting Python Binary...
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[#0a0a0a] text-red-400 p-8 text-center">
        <AlertCircle size={32} className="mb-4 opacity-80" />
        <h3 className="font-bold mb-2">Extraction Failed</h3>
        <p className="text-xs font-mono bg-red-950/30 p-4 rounded border border-red-900/50">{data.error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] text-neutral-200 overflow-y-auto custom-scrollbar p-8">
      
      {/* Header Section */}
      <div className="flex items-start justify-between border-b border-neutral-800 pb-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg border ${data?.is_fitted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
              <Network size={24} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{data?.type || 'Unknown Model'}</h1>
          </div>
          <p className="text-sm font-mono text-neutral-500 flex items-center gap-2">
            <Box size={14} /> {fileName}
          </p>
        </div>
        
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-widest border 
          ${data?.is_fitted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}
        >
          <Activity size={14} />
          {data?.is_fitted ? 'FITTED (READY)' : 'UNTRAINED'}
        </div>
      </div>

      {/* Hyperparameters Grid */}
      <div className="space-y-4 mb-8">
        <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-400 uppercase tracking-wider mb-4 border-b border-neutral-800 pb-2">
          <Settings2 size={16} /> Hyperparameters
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {data?.params && Object.keys(data.params).length === 0 && (
            <span className="text-neutral-600 italic text-sm">Using default Scikit-Learn parameters.</span>
          )}
          {data?.params && Object.entries(data.params).map(([key, value]) => (
            <div key={key} className="bg-[#141414] border border-neutral-800/60 p-3 rounded-lg flex flex-col justify-between hover:border-neutral-700 transition-colors">
              <span className="text-[11px] text-neutral-500 font-mono mb-1">{key}</span>
              <span className={`text-sm font-mono font-semibold truncate
                ${typeof value === 'number' ? 'text-blue-300' : 
                  typeof value === 'boolean' ? 'text-purple-400' : 
                  value === null ? 'text-neutral-600 italic' : 'text-amber-200/90'}`}
                title={String(value)}
              >
                {value === null ? 'None' : String(value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Learned Statistics (Only visible if model was trained before exporting) */}
      {data?.is_fitted && data.learned_attrs && Object.keys(data.learned_attrs).length > 0 && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-500/80 uppercase tracking-wider mb-4 border-b border-neutral-800 pb-2">
            <AlignLeft size={16} /> Learned Statistics
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Object.entries(data.learned_attrs).map(([key, value]) => (
              <div key={key} className="bg-[#0a0a0a] border border-emerald-900/30 p-3 rounded-lg flex flex-col justify-between hover:border-emerald-800/50 transition-colors">
                <span className="text-[11px] text-emerald-500/70 font-mono mb-1">{key}</span>
                <span className="text-sm font-mono font-semibold text-emerald-300 truncate" title={String(value)}>
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
import { useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import Papa from 'papaparse';
import { Hash, Type, AlignLeft, Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

// 1. Upgraded Type Definition to hold real statistical data
type HistogramBin = { 
  percent: number; 
  count: number; 
  min?: number; 
  max?: number; 
  label?: string; 
};

type ColumnDef = { 
  key: string; 
  name: string; 
  type: 'number' | 'string'; 
  nulls: number; 
  histogram?: HistogramBin[] 
};

// 2. Upgraded Component: Now handles both Colors and Smart Tooltips
const MiniHistogram = ({ data, isNumeric }: { data?: HistogramBin[], isNumeric: boolean }) => {
  if (!data || data.length === 0) return <div className="h-6 mt-2 flex items-center text-[10px] text-neutral-600 italic">No distribution</div>;
  
  return (
    <div className="flex items-end gap-[1px] h-6 mt-2 w-full opacity-80">
      {data.map((bin, i) => {
        // Smart Tooltips based on data type
        const tooltip = isNumeric 
          ? `Count: ${bin.count}\nRange: ${bin.min?.toFixed(2)} to ${bin.max?.toFixed(2)}`
          : `Value: "${bin.label}"\nCount: ${bin.count}`;
          
        // Color-code the bins to match the column icon colors
        const colorClass = isNumeric ? 'bg-blue-500/60 hover:bg-blue-400' : 'bg-amber-500/60 hover:bg-amber-400';

        return (
          <div 
            key={i} 
            className={`flex-1 ${colorClass} rounded-t-[2px] transition-colors cursor-crosshair`} 
            style={{ height: `${Math.max(5, bin.percent)}%` }} 
            title={tooltip}
          />
        );
      })}
    </div>
  );
};

export default function DatasetViewer() {
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const filePath = searchParams.get('file');
      const workspacePath = searchParams.get('workspace');

      if (!filePath || !workspacePath) {
        setError("Missing file path or workspace context.");
        setLoading(false);
        return;
      }

      try {
        const fileContents: string = await invoke('read_dataset_file', { filePath, workspacePath });

        Papa.parse(fileContents, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const parsedData = results.data as any[];
            const fields = results.meta.fields || [];

            // 3. Upgraded Data Processing Engine
            const generatedCols: ColumnDef[] = fields.map(field => {
              let nullCount = 0;
              let isNumeric = true;
              const numericValues: number[] = [];
              const categoricalCounts: Record<string, number> = {};

              parsedData.forEach(row => {
                const val = row[field];
                if (val === null || val === undefined || val === '') {
                  nullCount++;
                } else if (typeof val !== 'number') {
                  isNumeric = false;
                  // Tally string frequencies
                  const strVal = String(val);
                  categoricalCounts[strVal] = (categoricalCounts[strVal] || 0) + 1;
                } else {
                  numericValues.push(val);
                  // Also tally numbers as strings just in case the column turns out to be mixed/categorical
                  const strVal = String(val);
                  categoricalCounts[strVal] = (categoricalCounts[strVal] || 0) + 1;
                }
              });

              let histogram: HistogramBin[] | undefined;
              
              if (isNumeric && numericValues.length > 0) {
                // MATH: Generate Continuous Bins
                const min = Math.min(...numericValues);
                const max = Math.max(...numericValues);
                const range = max - min || 1; 
                const binCount = 12;
                const bins = new Array(binCount).fill(0);
                
                numericValues.forEach(v => {
                  const binIdx = Math.min(binCount - 1, Math.floor(((v - min) / range) * binCount));
                  bins[binIdx]++;
                });
                
                const maxBin = Math.max(...bins, 1);
                histogram = bins.map((count, i) => ({
                  percent: (count / maxBin) * 100,
                  count: count,
                  min: min + (i / binCount) * range,
                  max: min + ((i + 1) / binCount) * range
                })); 
              } else {
                // MATH: Generate Categorical Top-K Frequencies
                const sortedEntries = Object.entries(categoricalCounts)
                  .sort((a, b) => b[1] - a[1]) // Sort by frequency descending
                  .slice(0, 12); // Take top 12 categories
                  
                if (sortedEntries.length > 0) {
                  const maxCount = sortedEntries[0][1];
                  histogram = sortedEntries.map(([val, count]) => ({
                    percent: (count / maxCount) * 100,
                    count: count,
                    label: val
                  }));
                }
              }

              return {
                key: field,
                name: field,
                type: isNumeric ? 'number' : 'string',
                nulls: nullCount,
                histogram
              };
            });

            setColumns(generatedCols);
            setData(parsedData);
            setLoading(false);
          },
          error: (err: any) => {
            setError(err.message);
            setLoading(false);
          }
        });
      } catch (err: any) {
        setError(err); 
        setLoading(false);
      }
    };

    loadData();
  }, [searchParams]);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32, 
    overscan: 10,
  });

  const minTableWidth = columns.length * 140;
  const gridTemplate = `repeat(${columns.length || 1}, minmax(140px, 1fr))`;

  if (loading) return <div className="flex h-full items-center justify-center bg-[#0a0a0a] text-neutral-400"><Loader2 className="animate-spin mr-2" /> Parsing Dataset...</div>;
  if (error) return <div className="flex h-full items-center justify-center bg-[#0a0a0a] text-red-400">Error: {error}</div>;

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] text-neutral-300 font-sans border-t border-neutral-800">
      
      <div className="flex items-center px-4 py-2 border-b border-neutral-800 bg-[#141414] text-xs text-neutral-400 gap-6 shadow-sm z-30">
        <span className="font-semibold text-neutral-200 flex items-center gap-2">
          <AlignLeft size={14} className="text-blue-500" /> DataFrame Viewer
        </span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {data.length.toLocaleString()} Rows</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> {columns.length} Columns</span>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto custom-scrollbar">
        <div style={{ minWidth: `${minTableWidth}px`, width: '100%' }}>
          
          <div className="sticky top-0 z-20 grid w-full bg-[#141414] shadow-md border-b-2 border-neutral-800/80" style={{ gridTemplateColumns: gridTemplate }}>
            {columns.map((col) => (
              <div key={col.key} className="px-3 py-2 border-r border-neutral-800/50 flex flex-col justify-between h-[90px]">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-neutral-100 truncate pr-2" title={col.name}>{col.name}</span>
                    {col.type === 'number' ? <Hash size={12} className="text-blue-400 shrink-0" /> : <Type size={12} className="text-amber-500 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono">
                    Nulls: <span className={col.nulls > 0 ? 'text-rose-400 font-bold' : 'text-neutral-500'}>{col.nulls}</span>
                  </div>
                </div>
                {/* 4. Use the new smart component here */}
                <MiniHistogram data={col.histogram} isNumeric={col.type === 'number'} />
              </div>
            ))}
          </div>

          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = data[virtualRow.index];
              return (
                <div 
                  key={virtualRow.index} 
                  className="absolute left-0 w-full grid border-b border-neutral-800/40 hover:bg-neutral-800/60 even:bg-[#0a0a0a] odd:bg-[#111111] transition-colors" 
                  style={{ top: 0, transform: `translateY(${virtualRow.start}px)`, height: `${virtualRow.size}px`, gridTemplateColumns: gridTemplate }}
                >
                  {columns.map((col) => {
                    const val = row[col.key];
                    const isNull = val === null || val === '';
                    return (
                      <div 
                        key={col.key} 
                        className={`px-3 py-1.5 border-r border-neutral-800/40 text-[13px] font-mono truncate flex items-center
                          ${isNull ? 'text-neutral-600 italic' : col.type === 'number' ? 'text-blue-200' : 'text-amber-200/90'}`}
                      >
                        {isNull ? 'null' : val}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
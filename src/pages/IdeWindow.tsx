import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open } from '@tauri-apps/plugin-dialog';
// Added BarChart3 for the new Evaluations tab
import { Play, SquareTerminal, Loader2, Save, FileCode2, FolderOpen, Plus, Network, Box, Activity, BarChart3 } from 'lucide-react';
import CodeEditor from '../components/CodeEditor';
import ModelViewer from '../components/ModelViewer';

interface SessionModel {
  name: string;
  type: string;
  is_fitted: boolean;
  params: Record<string, any>;
  learned_attrs: Record<string, any>;
}

// --- NEW DATA STRUCTURE FOR EVALUATIONS ---
interface SessionEvaluation {
  model: string;
  dataset: string;
  metric: string;
  value: string | number;
}

export default function IdeWindow() {
  const [consoleOutput, setConsoleOutput] = useState<string>("MLScript Engine initialized. Ready.\n");
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- UPDATED: Bottom Panel State ---
  const [bottomTab, setBottomTab] = useState<'console' | 'models' | 'evaluations'>('console');
  const [sessionModels, setSessionModels] = useState<SessionModel[]>([]);
  const [sessionEvaluations, setSessionEvaluations] = useState<SessionEvaluation[]>([]);
  
  // Workspace State
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  
  const codeTextRef = useRef<string>("# Welcome to MLScript Studio\nLOAD 'examples/data/housing.csv' INTO my_dataset;\nSHOW ROWS 1 TO 10 FROM my_dataset;");

  useEffect(() => {
    if (rootDir) loadWorkspaceFiles(rootDir);
  }, [rootDir]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFilePath]); 

  const handleOpenFolder = async () => {
    try {
      const selectedPath = await open({ directory: true, multiple: false, title: "Select MLScript Project Folder" });
      if (selectedPath && typeof selectedPath === 'string') {
        setRootDir(selectedPath);
        setActiveFilePath(null);
        setConsoleOutput(`> Workspace loaded: ${selectedPath}\n`);
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
    }
  };

  const loadWorkspaceFiles = async (path: string) => {
    try {
      const files: string[] = await invoke('list_workspace_files', { workspacePath: path });
      setWorkspaceFiles(files);
    } catch (err) {
      setConsoleOutput(prev => prev + `\n[ERROR] Failed to load workspace files:\n${err}\n`);
    }
  };

  const handleNewFile = async () => {
    if (!rootDir) return;
    const fileName = prompt("Enter new file name (e.g., my_script.mls):");
    if (!fileName) return;
    const safeName = fileName.endsWith('.mls') ? fileName : `${fileName}.mls`;
    const newFilePath = `${rootDir}/${safeName}`;
    try {
      await invoke('save_code_file', { filePath: newFilePath, code: "# New MLScript Project\n" });
      setConsoleOutput(prev => prev + `> Created new file: ${safeName}\n`);
      await loadWorkspaceFiles(rootDir);
      handleSelectCodeFile(newFilePath);
    } catch (err) {
      setConsoleOutput(prev => prev + `\n[ERROR] Failed to create file:\n${err}\n`);
    }
  };

  const handleSelectCodeFile = async (absolutePath: string) => {
    try {
      const content: string = await invoke('read_code_file', { filePath: absolutePath });
      codeTextRef.current = content;
      setActiveFilePath(absolutePath);
      setConsoleOutput(prev => prev + `\n> Loaded script: ${getRelativePath(absolutePath)}\n`);
    } catch (err) {
      setConsoleOutput(prev => prev + `\n[ERROR] Failed to read file:\n${err}\n`);
    }
  };

  const handleSaveFile = async () => {
    if (!activeFilePath) {
      setConsoleOutput(prev => prev + "\n[WARNING] No active file to save. Please create or open a file first.\n");
      return;
    }
    setIsSaving(true);
    try {
      await invoke('save_code_file', { filePath: activeFilePath, code: codeTextRef.current });
      setConsoleOutput(prev => prev + `> File saved successfully.\n`);
    } catch (err) {
      setConsoleOutput(prev => prev + `\n[ERROR] Failed to save file:\n${err}\n`);
    } finally {
      setIsSaving(false);
    }
  };

  const openDatasetWindow = async (absolutePath: string) => {
    if (!rootDir) return;
    const encodedPath = encodeURIComponent(absolutePath);
    const encodedWorkspace = encodeURIComponent(rootDir);
    const webview = new WebviewWindow('dataset-viewer', {
      url: `/#/dataset?file=${encodedPath}&workspace=${encodedWorkspace}`, 
      title: 'DataFrame Preview',
      width: 900, height: 600, center: true, decorations: true,
    });
  };

  // ==========================================
  // THE EXECUTION PIPELINE
  // ==========================================
  const handleRunScript = async () => {
    const code = codeTextRef.current;
    if (!code.trim() || !rootDir) return;
    
    setIsRunning(true);
    setConsoleOutput(prev => prev + "\n> Compiling and executing...\n");

    try {
      const rawResult: string = await invoke('run_mlscript', { code, workspacePath: rootDir });
      
      // 1. Parse Models Payload
      const parts = rawResult.split('__TAURI_MODELS_START__');
      const standardOutput = parts[0].trim();
      let parsedModels: SessionModel[] = [];
      if (parts.length > 1) {
        try { parsedModels = JSON.parse(parts[1].trim()); } 
        catch(e) { console.error("Failed to parse runtime models", e); }
      }
      
      const parsedEvals: SessionEvaluation[] = [];
      const evalRegex = /EVALUATE\s+([a-zA-Z_]\w*)\s+ON\s+([a-zA-Z_]\w*)\s+USING\s+([a-zA-Z0-9_]+)/gi;
      let evalMatch;
      const outLines = standardOutput.split('\n').reverse(); // Search from bottom up

      while ((evalMatch = evalRegex.exec(code)) !== null) {
        const model = evalMatch[1];
        const dataset = evalMatch[2];
        const metric = evalMatch[3].toUpperCase();
        let val: string | number = "N/A";

        const lineWithMetric = outLines.find(l => l.toUpperCase().includes(metric));
        if (lineWithMetric) {
          // THE FIX: Add the 'g' flag to find ALL numbers on the line
          const numMatches = lineWithMetric.match(/[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?/g);
          
          if (numMatches && numMatches.length > 0) {
            // Grab the absolute LAST number found on that line
            val = parseFloat(numMatches[numMatches.length - 1]);
          }
        }
        parsedEvals.push({ model, dataset, metric, value: val });
      }

      setConsoleOutput(prev => prev + standardOutput + "\n");
      setSessionModels(parsedModels);
      setSessionEvaluations(parsedEvals.reverse()); // Reverse back to chronological order
      
      // 3. Auto-Switch Tabs
      if (parsedEvals.length > 0) setBottomTab('evaluations');
      else if (parsedModels.length > 0) setBottomTab('models');
      else setBottomTab('console');

      loadWorkspaceFiles(rootDir);

      // 4. Data Visualization trigger
      const hasShowCommand = /SHOW\b/i.test(code);
      if (hasShowCommand) {
        const loadMatch = code.match(/LOAD(?:\s+[a-zA-Z]+)?\s+['"]([^'"]+)['"]/i);
        if (loadMatch) {
          let finalPath = loadMatch[1];
          if (!finalPath.startsWith('/')) finalPath = `${rootDir}/${finalPath.replace(/^\//, '')}`; 
          openDatasetWindow(finalPath);
        }
      }
    } catch (error: any) {
      setConsoleOutput(prev => prev + `\n[ERROR]\n${error}\n`);
      setBottomTab('console'); 
    } finally {
      setIsRunning(false);
    }
  };

  const getRelativePath = (absolutePath: string) => {
    if (!rootDir) return absolutePath;
    return absolutePath.replace(rootDir + '/', ""); 
  };

  // --- WELCOME SCREEN ---
  if (!rootDir) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-neutral-950 text-neutral-100 font-sans select-none">
        <div className="flex flex-col items-center gap-6 max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-2">
            <FileCode2 size={32} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-wide mb-2">MLScript Studio</h1>
            <p className="text-sm text-neutral-400">A high-performance environment for compiling and executing custom ML pipelines.</p>
          </div>
          <button onClick={handleOpenFolder} className="flex items-center gap-2 mt-4 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg hover:shadow-emerald-500/20">
            <FolderOpen size={18} /> Open Workspace Folder
          </button>
        </div>
      </div>
    );
  }

  // --- MAIN IDE ---
  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100 font-sans select-none">
      
      <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-900">
        <div className="flex items-center gap-4">
          <h1 className="text-xs font-bold tracking-widest text-neutral-400 uppercase pointer-events-none">MLScript Studio</h1>
          <button onClick={handleOpenFolder} className="text-[10px] bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded text-neutral-300 transition-colors">Change Folder</button>
        </div>
        <div className="flex gap-3 z-10">
          <button onClick={handleSaveFile} className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded transition-all bg-neutral-800 hover:bg-neutral-700 text-neutral-300" title="Save File (Ctrl+S)">
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          </button>
          <button onClick={handleRunScript} disabled={isRunning} className={`flex items-center gap-2 text-xs font-bold px-4 py-1.5 rounded transition-all ${isRunning ? 'bg-emerald-500/50 text-emerald-200 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'}`}>
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
            {isRunning ? 'EXECUTING' : 'RUN'}
          </button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        
        {/* FILE EXPLORER SIDEBAR */}
        <aside className="w-64 border-r border-neutral-800 bg-[#0f0f0f] flex flex-col">
          <div className="px-4 py-3 border-b border-neutral-800 flex justify-between items-center">
            <h2 className="text-[10px] font-bold text-neutral-500 tracking-wider">WORKSPACE</h2>
            <button onClick={handleNewFile} className="text-neutral-400 hover:text-white transition-colors" title="Create New File"><Plus size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            <ul className="text-[12px] space-y-0.5 text-neutral-400 font-mono">
              {workspaceFiles.map(filePath => {
                const isActive = filePath === activeFilePath;
                return (
                  <li key={filePath} onClick={() => handleSelectCodeFile(filePath)} className={`cursor-pointer px-2 py-1.5 rounded flex items-center gap-2 truncate transition-colors ${isActive ? 'bg-blue-600/20 text-blue-400 font-semibold' : 'hover:bg-neutral-800 hover:text-neutral-200'}`}>
                    <FileCode2 size={12} className={isActive ? 'text-blue-400' : 'text-neutral-500 shrink-0'} />
                    <span className="truncate">{getRelativePath(filePath)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        <section className="flex-1 flex flex-col relative bg-neutral-900 min-w-0">
          
          {/* EDITOR AREA */}
          {activeFilePath && (
            <div className="flex items-center px-4 py-1.5 border-b border-neutral-800/50 bg-[#141414] text-[11px] font-mono text-neutral-400">
               {getRelativePath(activeFilePath)}
            </div>
          )}
          <div className="flex-[2] relative border-b border-neutral-800 min-h-0 bg-[#0a0a0a]">
            {activeFilePath ? (
              <CodeEditor key={activeFilePath} defaultValue={codeTextRef.current} onChange={(val) => { codeTextRef.current = val || "" }} />
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-500 italic text-sm">Select a script from the workspace.</div>
            )}
          </div>

          {/* ==============================================
              THE TABBED BOTTOM PANEL
              ============================================== */}
          <div className="flex-[1] flex flex-col bg-[#0a0a0a] min-h-[250px]">
            
            {/* Tabs */}
            <div className="flex bg-[#141414] border-b border-neutral-800/50 px-3 pt-2 gap-1 mt-[-1px]">
              <button
                onClick={() => setBottomTab('console')}
                className={`flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-colors border-t border-x
                  ${bottomTab === 'console' ? 'bg-[#0a0a0a] text-emerald-400 border-neutral-800/50' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
              >
                <SquareTerminal size={14} /> Console
              </button>
              <button
                onClick={() => setBottomTab('models')}
                className={`flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-colors border-t border-x
                  ${bottomTab === 'models' ? 'bg-[#0a0a0a] text-blue-400 border-neutral-800/50' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
              >
                <Network size={14} /> Session Models 
                {sessionModels.length > 0 && <span className="bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded ml-1">{sessionModels.length}</span>}
              </button>
              <button
                onClick={() => setBottomTab('evaluations')}
                className={`flex items-center gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-t-lg transition-colors border-t border-x
                  ${bottomTab === 'evaluations' ? 'bg-[#0a0a0a] text-purple-400 border-neutral-800/50' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
              >
                <BarChart3 size={14} /> Evaluations
                {sessionEvaluations.length > 0 && <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded ml-1">{sessionEvaluations.length}</span>}
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
              
              {/* Tab 1: Console */}
              {bottomTab === 'console' && (
                <div className="absolute inset-0 p-4 overflow-auto custom-scrollbar font-mono text-[13px] whitespace-pre-wrap text-emerald-400/90 leading-relaxed select-text">
                  {consoleOutput}
                </div>
              )}

              {/* Tab 2: Models Dashboard */}
              {bottomTab === 'models' && (
                <div className="absolute inset-0 p-4 overflow-auto custom-scrollbar bg-[#0f0f0f]">
                  {sessionModels.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-neutral-600 italic text-sm">
                      No models detected in memory. Run a script with CREATE MODEL.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {sessionModels.map((model, idx) => (
                        <div key={idx} className="bg-[#141414] border border-neutral-800/60 hover:border-neutral-700 transition-colors rounded-lg p-4 flex flex-col shadow-sm">
                          <div className="flex justify-between items-start mb-4 border-b border-neutral-800/50 pb-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg border ${model.is_fitted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                <Box size={18} />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-neutral-200">{model.name}</h3>
                                <p className="text-[10px] text-neutral-500 font-mono tracking-wide">{model.type}</p>
                              </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-[9px] font-bold tracking-wider flex items-center gap-1.5 border
                              ${model.is_fitted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                              <Activity size={12} />
                              {model.is_fitted ? 'TRAINED' : 'UNTRAINED'}
                            </div>
                          </div>
                          
                          <div className="text-[10px] font-bold text-neutral-500 mb-2 uppercase tracking-wider">Hyperparameters</div>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.keys(model.params).length === 0 && <span className="text-neutral-600 italic text-xs">Default Params</span>}
                            {Object.entries(model.params).map(([key, val]) => (
                              <div key={key} className="bg-[#0a0a0a] border border-neutral-800/50 rounded px-2 py-1 flex flex-col justify-center">
                                <span className="text-neutral-500 text-[9px] mb-0.5 font-mono">{key}</span>
                                <span className="text-blue-300 font-mono text-[11px] truncate" title={String(val)}>{String(val)}</span>
                              </div>
                            ))}
                          </div>

                          {model.is_fitted && Object.keys(model.learned_attrs).length > 0 && (
                            <>
                              <div className="text-[10px] font-bold text-emerald-500/80 mt-4 mb-2 uppercase tracking-wider border-t border-neutral-800/50 pt-3">Learned Statistics</div>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(model.learned_attrs).map(([key, val]) => (
                                  <div key={key} className="bg-[#0a0a0a] border border-emerald-900/30 rounded px-2 py-1 flex flex-col justify-center">
                                    <span className="text-emerald-500/70 text-[9px] mb-0.5 font-mono">{key}</span>
                                    <span className="text-emerald-300 font-mono text-[11px] truncate" title={String(val)}>{String(val)}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Smart Evaluations Dashboard */}
              {bottomTab === 'evaluations' && (
                <div className="absolute inset-0 p-4 overflow-auto custom-scrollbar bg-[#0f0f0f]">
                  {sessionEvaluations.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-neutral-600 italic text-sm">
                      No evaluations detected. Run a script with EVALUATE statements.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                      {sessionEvaluations.map((evalData, idx) => {
                        const isScore = ['ACCURACY', 'R2', 'PRECISION', 'RECALL', 'F1_SCORE', 'ROC_AUC'].includes(evalData.metric);
                        const isError = ['MSE', 'RMSE', 'MAE'].includes(evalData.metric);
                        
                        let colorClass = 'text-blue-400';
                        let bgClass = 'bg-blue-500/10 border-blue-500/20';
                        let barColor = 'bg-blue-500';

                        if (isScore) {
                           colorClass = 'text-emerald-400';
                           bgClass = 'bg-emerald-500/10 border-emerald-500/20';
                           barColor = 'bg-emerald-500';
                        } else if (isError) {
                           colorClass = 'text-rose-400';
                           bgClass = 'bg-rose-500/10 border-rose-500/20';
                        }

                        const numVal = typeof evalData.value === 'number' ? evalData.value : null;

                        return (
                          <div key={idx} className="bg-[#141414] border border-neutral-800/60 rounded-lg p-4 flex flex-col shadow-sm hover:border-neutral-700 transition-colors">
                             <div className="flex justify-between items-center mb-4">
                               <div className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider border ${bgClass} ${colorClass}`}>
                                 {evalData.metric}
                               </div>
                               <div className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider truncate ml-2">
                                 {evalData.model} <span className="text-neutral-700 mx-1">→</span> {evalData.dataset}
                               </div>
                             </div>

                             <div className="flex-1 flex items-end">
                               <span className="text-3xl font-bold text-neutral-100 font-mono tracking-tight">
                                 {numVal !== null ? (numVal % 1 === 0 ? numVal : numVal.toFixed(4)) : evalData.value}
                               </span>
                             </div>

                             {isScore && numVal !== null && (
                               <div className="w-full bg-neutral-900 rounded-full h-1.5 mt-3 overflow-hidden border border-neutral-800/50">
                                 <div className={`h-1.5 ${barColor}`} style={{ width: `${Math.min(Math.max(numVal * 100, 0), 100)}%` }}></div>
                               </div>
                             )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
          {/* ============================================== */}
        </section>
      </main>

      <footer className="flex items-center justify-between px-4 py-1 text-[11px] border-t border-neutral-800 bg-neutral-900 text-neutral-500">
        <span className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`}></div>
          {isRunning ? 'Processing...' : 'Engine Ready'}
        </span>
        <span className="flex gap-4">
          <span>{activeFilePath ? 'File Active' : 'No File'}</span>
          <span className="text-neutral-300">MLScript</span>
        </span>
      </footer>
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import { detector } from '../../services/detector';
import {
  X,
  Upload,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  Server,
  FileCode,
  HardDrive,
  RefreshCw,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react';

interface ModelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEngineChange?: () => void;
}

export const ModelUploadModal: React.FC<ModelUploadModalProps> = ({
  isOpen,
  onClose,
  onEngineChange,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'upload' | 'server' | 'endpoint'>('upload');
  const [modelStatus, setModelStatus] = useState<{
    hasModelFile: boolean;
    modelName: string;
    filePath: string | null;
    sizeMb: number;
    modifiedAt: string;
  } | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Endpoint connection state
  const [inferenceUrl, setInferenceUrl] = useState<string>(() => {
    return detector.getInferenceUrl() || 'http://localhost:8000';
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    connected: boolean;
    status?: number;
    error?: string;
    info?: any;
  } | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      checkModelStatus();
      setInferenceUrl(detector.getInferenceUrl() || 'http://localhost:8000');
    }
  }, [isOpen]);

  const checkModelStatus = async () => {
    try {
      const res = await fetch('/api/models/status');
      if (res.ok) {
        const data = await res.json();
        setModelStatus(data);
      }
    } catch (e) {
      console.warn('Could not check model status', e);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.pt') && !file.name.endsWith('.pth')) {
      addToast('warning', 'Unexpected Extension', 'Please select a PyTorch model weights file (.pt or .pth)');
    }

    setUploading(true);
    setUploadSuccess(false);

    try {
      // Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const res = await fetch('/api/models/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data,
          fileName: file.name,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await res.json();
      setUploadSuccess(true);
      await checkModelStatus();
      addToast('success', 'Weights Uploaded!', `Saved to ${data.targetPath} (${data.sizeMb} MB)`);
    } catch (err: any) {
      console.error(err);
      addToast('error', 'Upload Failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);

    try {
      const res = await fetch('/api/models/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inferenceUrl }),
      });

      const data = await res.json();
      setConnectionResult(data);

      if (data.connected) {
        addToast('success', 'Endpoint Connected!', 'FastAPI YOLOv8 service responded successfully.');
      } else {
        addToast('warning', 'Connection Failed', data.error || 'Server unreachable.');
      }
    } catch (err: any) {
      setConnectionResult({ connected: false, error: err.message });
      addToast('error', 'Test Error', err.message);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleApplyEndpoint = () => {
    detector.setCustomInferenceUrl(inferenceUrl);
    addToast('success', 'Engine Switched', `Active engine set to YOLOv8 (${inferenceUrl})`);
    if (onEngineChange) onEngineChange();
    onClose();
  };

  const handleResetToGemini = () => {
    detector.setCustomInferenceUrl(null);
    setInferenceUrl('');
    setConnectionResult(null);
    addToast('info', 'Reverted Engine', 'Switched back to Gemini Vision fallback.');
    if (onEngineChange) onEngineChange();
    onClose();
  };

  const copyPythonScript = () => {
    const code = `pip install ultralytics fastapi uvicorn python-multipart pillow\npython serve_model.py`;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    addToast('success', 'Copied to Clipboard', 'Run these commands in your terminal.');
  };

  if (!isOpen) return null;

  const isCustomYoloActive = detector.getInferenceUrl() !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Custom Model Weights (best.pt)</span>
                {isCustomYoloActive ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400">
                    Fallback Active
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Upload your PyTorch checkpoint (.pt) or link your custom YOLOv8 inference server.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 flex items-center gap-1.5 transition-colors relative ${
              activeTab === 'upload' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>1. Upload best.pt</span>
            {activeTab === 'upload' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('server')}
            className={`pb-2.5 flex items-center gap-1.5 transition-colors relative ${
              activeTab === 'server' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>2. Run Python Server</span>
            {activeTab === 'server' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('endpoint')}
            className={`pb-2.5 flex items-center gap-1.5 transition-colors relative ${
              activeTab === 'endpoint' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>3. Connect URL</span>
            {activeTab === 'endpoint' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
            )}
          </button>
        </div>

        {/* TAB 1: UPLOAD BEST.PT */}
        {activeTab === 'upload' && (
          <div className="space-y-4 text-xs">
            {/* Status Card */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 font-mono uppercase block">
                    Workspace Model Checkpoint:
                  </span>
                  <span className="font-bold text-white font-mono text-xs">
                    {modelStatus?.hasModelFile ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 inline" /> {modelStatus.filePath} ({modelStatus.sizeMb} MB)
                      </span>
                    ) : (
                      <span className="text-slate-400">No best.pt weights uploaded yet</span>
                    )}
                  </span>
                </div>
              </div>
              <button
                onClick={checkModelStatus}
                title="Refresh status"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className="p-8 border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-2xl bg-slate-950/60 flex flex-col items-center justify-center cursor-pointer transition-colors text-center"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".pt,.pth"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <Upload className="w-10 h-10 text-amber-400 mb-2 animate-bounce" />
              <h4 className="font-bold text-slate-200">
                Click to browse or drop your <span className="text-amber-400 font-mono">best.pt</span> file here
              </h4>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                PyTorch weights exported from YOLOv5, YOLOv8, or YOLOv11 for PPE safety detection.
              </p>
              {uploading && (
                <div className="mt-3 flex items-center gap-2 text-amber-400 font-mono">
                  <div className="w-4 h-4 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
                  <span>Saving weights to workspace...</span>
                </div>
              )}
              {uploadSuccess && (
                <div className="mt-3 text-emerald-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>best.pt uploaded and ready! Proceed to Step 2.</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-slate-500">
                Files are stored directly in your app&apos;s models directory.
              </span>
              <button
                onClick={() => setActiveTab('server')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
              >
                Next: Step 2 &rarr;
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: PYTHON SERVER GUIDE */}
        {activeTab === 'server' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/20 text-purple-200 text-[11px] flex items-start gap-2">
              <FileCode className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                A ready-to-use Python inference server script (<strong>serve_model.py</strong>) has already been
                created in your workspace root! It loads your <code>best.pt</code> and exposes the exact{' '}
                <code>/detect</code> endpoint required by SafeVision AI.
              </span>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-300 block">Run in your local terminal:</span>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-amber-300 space-y-1 relative group">
                <div className="text-slate-500"># 1. Install YOLO and FastAPI</div>
                <div>pip install ultralytics fastapi uvicorn python-multipart pillow</div>
                <div className="text-slate-500 pt-1"># 2. Launch server</div>
                <div>python serve_model.py</div>

                <button
                  onClick={copyPythonScript}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 text-[10px]"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
              <div className="font-bold text-slate-200">How It Works:</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  FastAPI server starts on <code className="text-amber-400">http://localhost:8000</code>
                </li>
                <li>
                  Loads <code className="text-amber-400">best.pt</code> into GPU/CPU memory
                </li>
                <li>
                  Exposes <code className="text-amber-400">POST /detect</code> accepting image files and returning
                  bounding boxes and confidence scores
                </li>
              </ul>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setActiveTab('upload')}
                className="text-xs text-slate-400 hover:text-white"
              >
                &larr; Back to Upload
              </button>
              <button
                onClick={() => setActiveTab('endpoint')}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20"
              >
                Next: Connect Endpoint &rarr;
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: CONNECT ENDPOINT */}
        {activeTab === 'endpoint' && (
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5">
                Inference API Base URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inferenceUrl}
                  onChange={(e) => setInferenceUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  disabled={testingConnection || !inferenceUrl}
                  onClick={handleTestConnection}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                >
                  {testingConnection ? (
                    <div className="w-3.5 h-3.5 border-2 border-slate-400/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Test Connection</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Use <code>http://localhost:8000</code> for local <code>serve_model.py</code>, or enter your hosted
                Cloud / HuggingFace endpoint URL.
              </p>
            </div>

            {/* Test Connection Results Card */}
            {connectionResult && (
              <div
                className={`p-3.5 rounded-2xl border text-xs animate-in fade-in ${
                  connectionResult.connected
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {connectionResult.connected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {connectionResult.connected
                        ? 'Connected to YOLOv8 Inference Server!'
                        : 'Could Not Reach Inference Server'}
                    </div>
                    {connectionResult.connected && connectionResult.info && (
                      <div className="mt-1 font-mono text-[11px] text-emerald-300">
                        Model: {connectionResult.info.model || 'best.pt'} | Classes:{' '}
                        {Object.values(connectionResult.info.classes || {}).join(', ') || 'Auto-detected'}
                      </div>
                    )}
                    {!connectionResult.connected && (
                      <p className="mt-1 text-[11px] opacity-90">
                        {connectionResult.error || 'Ensure serve_model.py is running on port 8000.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Switch / Reset Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetToGemini}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Revert to Gemini Vision Fallback
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyEndpoint}
                  disabled={!inferenceUrl}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-all hover:scale-105"
                >
                  <Check className="w-4 h-4" />
                  <span>Activate Custom Model (Mode A)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

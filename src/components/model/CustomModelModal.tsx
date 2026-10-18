import React, { useState, useEffect } from 'react';
import { detector } from '../../services/detector';
import { useToast } from '../../context/ToastContext';
import {
  Cpu,
  X,
  CheckCircle2,
  AlertTriangle,
  Upload,
  ExternalLink,
  Copy,
  Check,
  Server,
  Sparkles,
  Terminal,
  FileCode,
  HardHat,
} from 'lucide-react';

interface CustomModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEngineChanged?: () => void;
}

export const CustomModelModal: React.FC<CustomModelModalProps> = ({
  isOpen,
  onClose,
  onEngineChanged,
}) => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'connect' | 'guide' | 'upload'>('connect');
  const [inferenceUrl, setInferenceUrl] = useState<string>(
    () => detector.getInferenceUrl() || 'http://localhost:8000'
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    online: boolean;
    message: string;
    classes?: Record<string, string>;
    modelLoaded?: boolean;
  } | null>(null);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setInferenceUrl(detector.getInferenceUrl() || 'http://localhost:8000');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!inferenceUrl.trim()) {
      addToast('warning', 'Missing URL', 'Please enter your inference server address.');
      return;
    }
    setTesting(true);
    setTestResult(null);

    const result = await detector.pingInferenceServer(inferenceUrl.trim());
    setTestResult(result);
    setTesting(false);

    if (result.online && result.modelLoaded !== false) {
      addToast('success', 'Connection Verified!', 'Custom best.pt YOLO model is online.');
    } else if (result.online && result.modelLoaded === false) {
      addToast('warning', 'Server Online', 'Server reached, but best.pt file is not found in folder.');
    } else {
      addToast('error', 'Connection Failed', result.message);
    }
  };

  const handleSaveAndActivate = () => {
    if (!inferenceUrl.trim()) {
      detector.setInferenceUrl(null);
      addToast('info', 'Reset to Gemini Vision', 'Using Gemini Vision fallback.');
    } else {
      detector.setInferenceUrl(inferenceUrl.trim());
      addToast('success', 'Custom Model Activated', `SafeVision will now route scans to ${inferenceUrl}`);
    }
    if (onEngineChanged) onEngineChanged();
    onClose();
  };

  const handleResetToGemini = () => {
    detector.setInferenceUrl(null);
    setInferenceUrl('');
    setTestResult(null);
    addToast('info', 'Active Engine: Gemini Vision', 'Switched to cloud Gemini multimodal fallback.');
    if (onEngineChanged) onEngineChanged();
    onClose();
  };

  const copyToClipboard = (text: string, type: 'code' | 'curl') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    }
    addToast('success', 'Copied to Clipboard', 'Ready to paste into your terminal.');
  };

  const pythonRunSnippet = `# 1. Install prerequisites:
pip install ultralytics fastapi uvicorn python-multipart pillow

# 2. Place your best.pt in the app directory and start the server:
python yolo_server.py`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Connect Custom Model weights (best.pt)</span>
                <span className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-amber-500/20 text-amber-300 font-bold">
                  YOLOv8 / PyTorch
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Route real-time PPE detection through your custom trained PyTorch weights file
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
            onClick={() => setActiveTab('connect')}
            className={`pb-2.5 transition-all relative ${
              activeTab === 'connect' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Connect Endpoint URL
            {activeTab === 'connect' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 transition-all relative ${
              activeTab === 'guide' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            How to Host `best.pt` (1-Min Guide)
            {activeTab === 'guide' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-2.5 transition-all relative ${
              activeTab === 'upload' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Local Workspace Upload
            {activeTab === 'upload' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
            )}
          </button>
        </div>

        {/* TAB 1: Connect Endpoint URL */}
        {activeTab === 'connect' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="font-semibold text-slate-300 block">
                Inference API Server Endpoint:
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inferenceUrl}
                  onChange={(e) => setInferenceUrl(e.target.value)}
                  placeholder="http://localhost:8000 or https://your-server.com"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                />
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                >
                  {testing ? (
                    <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Server className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Test Connection</span>
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  POST to{' '}
                  <code className="text-amber-400 font-mono">
                    {inferenceUrl.replace(/\/+$/, '') || '...'}/detect
                  </code>{' '}
                  and video to{' '}
                  <code className="text-amber-400 font-mono">
                    {inferenceUrl.replace(/\/+$/, '') || '...'}/predict-video
                  </code>
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Presets:</span>
                <button
                  type="button"
                  onClick={() => setInferenceUrl('https://safevision-yolo-api-2.onrender.com')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] transition-colors cursor-pointer"
                >
                  SafeVision Render API
                </button>
                <button
                  type="button"
                  onClick={() => setInferenceUrl('http://localhost:8000')}
                  className="px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px] transition-colors cursor-pointer"
                >
                  Localhost:8000
                </button>
              </div>
            </div>

            {/* Test result status badge */}
            {testResult && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 animate-in fade-in ${
                  testResult.online && testResult.modelLoaded !== false
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                }`}
              >
                {testResult.online && testResult.modelLoaded !== false ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold text-xs">
                    {testResult.online ? 'Server is Reachable' : 'Unable to Connect'}
                  </div>
                  <div className="text-[11px] opacity-90">{testResult.message}</div>

                  {testResult.classes && Object.keys(testResult.classes).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-emerald-500/20">
                      <span className="text-[10px] font-mono uppercase block text-emerald-300 font-bold mb-1">
                        Model Classes ({Object.keys(testResult.classes).length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(testResult.classes).map(([id, name]) => (
                          <span
                            key={id}
                            className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 font-mono text-[10px]"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetToGemini}
                className="text-xs text-slate-400 hover:text-white underline transition-colors"
              >
                Use Gemini Vision Fallback instead
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
                  onClick={handleSaveAndActivate}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold shadow-md shadow-amber-500/20"
                >
                  Save &amp; Activate Model
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: How to host best.pt */}
        {activeTab === 'guide' && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-300 leading-relaxed">
              PyTorch <code className="text-amber-400 font-mono">.pt</code> files are binary model weights that run in Python. We have already generated the complete FastAPI server script{' '}
              <code className="text-amber-400 font-mono">yolo_server.py</code> in this repository for you!
            </p>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-slate-400 font-mono text-[11px]">
                <span className="flex items-center gap-1.5 font-bold text-slate-200">
                  <Terminal className="w-3.5 h-3.5 text-amber-400" /> Run in your terminal:
                </span>
                <button
                  onClick={() => copyToClipboard(pythonRunSnippet, 'code')}
                  className="flex items-center gap-1 text-amber-400 hover:underline"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Commands'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed">
                {pythonRunSnippet}
              </pre>
            </div>

            <div className="space-y-2 text-slate-300">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Next steps:</span>
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed pl-1">
                <li>Copy your custom <code className="text-white font-mono">best.pt</code> file into the project folder.</li>
                <li>Run <code className="text-white font-mono">python yolo_server.py</code> (runs on port 8000).</li>
                <li>Return to the &quot;Connect Endpoint URL&quot; tab and click &quot;Test Connection&quot;.</li>
                <li>SafeVision AI will now detect your exact trained PPE classes!</li>
              </ol>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveTab('connect')}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold"
              >
                Go to Connect Tab &rarr;
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: Local Workspace Upload */}
        {activeTab === 'upload' && (
          <div className="space-y-4 text-xs">
            <div className="p-6 rounded-2xl bg-slate-950 border-2 border-dashed border-slate-800 text-center space-y-3">
              <Upload className="w-10 h-10 text-amber-400 mx-auto" />
              <div>
                <h4 className="font-bold text-white text-sm">
                  {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Select your best.pt file'}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1">
                  Place this file in the project root directory alongside{' '}
                  <code className="text-amber-400 font-mono">yolo_server.py</code>
                </p>
              </div>

              <label className="inline-block px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer transition-colors">
                <span>Browse best.pt file</span>
                <input
                  type="file"
                  accept=".pt,.pth,.onnx"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFileName(e.target.files[0].name);
                      addToast(
                        'info',
                        'File selected',
                        `Place ${e.target.files[0].name} in root folder to run python yolo_server.py`
                      );
                    }
                  }}
                />
              </label>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/20 text-blue-200 text-[11px]">
              <span className="font-bold block mb-0.5">Note on PyTorch weights:</span>
              <span>
                Browser sandboxes cannot run native CUDA/PyTorch binary (.pt) models directly without a Python runtime or ONNX conversion. Running{' '}
                <code className="font-mono text-white">python yolo_server.py</code> gives you full GPU acceleration and sub-50ms inference.
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveTab('guide')}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 font-semibold"
              >
                View Server Guide
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

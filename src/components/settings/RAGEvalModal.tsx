import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Play,
  Download,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BarChart2,
  FileSpreadsheet,
  Check,
} from 'lucide-react';
import { repository } from '../../services/storage';
import { RAGEvaluationRun } from '../../types';
import { runRAGEvaluation, exportRAGEvalToCSV } from '../../services/agent/ragEvalService';
import { useToast } from '../../context/ToastContext';

interface RAGEvalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunFinished?: (run: RAGEvaluationRun) => void;
}

export const RAGEvalModal: React.FC<RAGEvalModalProps> = ({
  isOpen,
  onClose,
  onRunFinished,
}) => {
  const { addToast } = useToast();
  const [evaluation, setEvaluation] = useState<RAGEvaluationRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 12 });

  useEffect(() => {
    if (isOpen) {
      repository.getLatestRAGEvaluation().then((ev) => {
        if (ev) setEvaluation(ev);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartEvaluation = async () => {
    setIsRunning(true);
    setProgress({ current: 0, total: 12 });
    try {
      const result = await runRAGEvaluation((cur, tot) => {
        setProgress({ current: cur, total: tot });
      });
      setEvaluation(result);
      onRunFinished?.(result);
      addToast('success', 'RAG Evaluation completed', 'Benchmark finished successfully.');
    } catch (err: any) {
      console.error(err);
      addToast('error', 'Evaluation failed', err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!evaluation) return;
    const csv = exportRAGEvalToCSV(evaluation);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SafeVision_RAG_Evaluation_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('info', 'RAG benchmark CSV downloaded');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>RAG Retrieval & Grounding Evaluation</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  12 Golden Questions
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Measures Hit@3, MRR, factual groundedness, and citation precision across safety manuals.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {/* Top Actions & Summary Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div>
              <h4 className="text-xs font-semibold text-slate-300">
                Automated Golden Set Benchmark
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {evaluation
                  ? `Last evaluated on ${new Date(evaluation.createdAt).toLocaleString()}`
                  : 'No evaluation run found yet. Click below to execute full test suite.'}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {evaluation && (
                <button
                  type="button"
                  onClick={handleDownloadCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download CSV</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleStartEvaluation}
                disabled={isRunning}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white shadow-md shadow-purple-600/20 transition-all cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Testing ({progress.current}/{progress.total})...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run Benchmark</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress bar during run */}
          {isRunning && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-purple-400">
                <span>Running multi-query hybrid retrieval tests...</span>
                <span>
                  {Math.round((progress.current / progress.total) * 100)}% ({progress.current}/{progress.total})
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-200"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Metrics Strip */}
          {evaluation && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Hit@3 Rate</div>
                <div className="text-xl font-bold font-mono text-purple-400 mt-1">
                  {(evaluation.summary.hitAt3Rate * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Top 3 accuracy</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Mean Reciprocal Rank</div>
                <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                  {evaluation.summary.meanReciprocalRank.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Rank quality score</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Avg Groundedness</div>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                  {(evaluation.summary.averageGroundedness * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Doc evidence support</div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Test Results</div>
                <div className="text-xl font-bold font-mono text-slate-200 mt-1">
                  <span className="text-emerald-400">{evaluation.summary.passedCount} Pass</span>
                  <span className="text-slate-500 text-sm font-normal"> / {evaluation.totalQuestions}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Passed threshold</div>
              </div>
            </div>
          )}

          {/* Results Table */}
          {evaluation && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-300">Detailed Golden Question Breakdown</h4>
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-[11px] font-mono text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Golden Question</th>
                      <th className="p-3 text-center">First Rank</th>
                      <th className="p-3 text-center">Hit@3</th>
                      <th className="p-3 text-center">Groundedness</th>
                      <th className="p-3 text-center">Precision</th>
                      <th className="p-3">Citation</th>
                      <th className="p-3 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono text-[11px]">
                    {evaluation.results.map((r, i) => (
                      <tr key={r.questionId} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3 text-slate-500">{i + 1}</td>
                        <td className="p-3 font-sans text-slate-200 max-w-xs">{r.question}</td>
                        <td className="p-3 text-center text-amber-400">
                          {r.firstRelevantRank ? `#${r.firstRelevantRank}` : '—'}
                        </td>
                        <td className="p-3 text-center">
                          {r.hitAt3 ? (
                            <span className="text-emerald-400 font-bold">YES</span>
                          ) : (
                            <span className="text-rose-400 font-bold">NO</span>
                          )}
                        </td>
                        <td className="p-3 text-center text-slate-300">
                          {(r.groundednessScore * 100).toFixed(0)}%
                        </td>
                        <td className="p-3 text-center text-slate-300">
                          {(r.citationPrecision * 100).toFixed(0)}%
                        </td>
                        <td className="p-3 text-slate-400 truncate max-w-[150px]">{r.citation}</td>
                        <td className="p-3 text-center">
                          {r.passed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> PASS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <XCircle className="w-3 h-3" /> FAIL
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between text-xs text-slate-400">
          <span>Target Threshold: Hit@3 &gt; 80% · Groundedness &gt; 70%</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

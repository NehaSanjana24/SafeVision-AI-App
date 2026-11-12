import React from 'react';
import { X, Network, ArrowRight, ShieldCheck, Cpu, Database, Wrench, FileText, CheckCircle2 } from 'lucide-react';

interface AgentGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNode?: string;
}

export const AgentGraphModal: React.FC<AgentGraphModalProps> = ({
  isOpen,
  onClose,
  activeNode,
}) => {
  if (!isOpen) return null;

  const nodes = [
    { id: 'intake', label: '1. Intake & Multi-Turn State', icon: Cpu, desc: 'Extracts zones, cameras, and temporal entities' },
    { id: 'router', label: '2. Conditional Router', icon: Network, desc: 'Routes to visual inspector, violation search, or policy RAG' },
    { id: 'visual_inspector', label: '3. Visual Inspector Tool', icon: Wrench, desc: 'Runs detector on image & flags missing PPE' },
    { id: 'violation_search', label: '3b. Violation Search Tool', icon: Database, desc: 'Queries stored CCTV violation database' },
    { id: 'doc_retriever', label: '4. Hybrid Doc Retriever (RAG)', icon: FileText, desc: 'Dense semantic + BM25 search across safety manuals' },
    { id: 'generate', label: '5. Grounded Generation', icon: Cpu, desc: 'Multi-turn Gemini model answering with citations' },
    { id: 'decide_workflows', label: '6. Agentic Workflow Trigger', icon: ShieldCheck, desc: 'Logs Incident #n & drafts supervisor alerts' },
    { id: 'finalize', label: '7. Finalize & State Persistence', icon: CheckCircle2, desc: 'Saves conversation, citations, & workflows' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                LangGraph Agentic StateGraph Architecture
              </h3>
              <p className="text-[11px] text-slate-400">
                Multi-step autonomous workflow combining visual intelligence, OSHA RAG, and automated safety actions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Graph Node Sequence */}
        <div className="p-6 overflow-y-auto space-y-3 custom-scrollbar">
          {nodes.map((node, idx) => {
            const Icon = node.icon;
            const isCurrentlyActive = activeNode === node.id;

            return (
              <div key={node.id} className="relative">
                <div
                  className={`p-3.5 rounded-xl border transition-all flex items-start gap-3.5 ${
                    isCurrentlyActive
                      ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isCurrentlyActive
                        ? 'bg-purple-500 text-slate-950 animate-pulse font-bold'
                        : 'bg-slate-800 text-purple-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-200">{node.label}</h4>
                      {isCurrentlyActive && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Active Node
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{node.desc}</p>
                  </div>
                </div>

                {idx < nodes.length - 1 && (
                  <div className="h-2 flex items-center justify-center text-slate-600">
                    <ArrowRight className="w-3 h-3 rotate-90" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between text-xs text-slate-400">
          <span>Max Steps: 12 · Timeout: 45s · Real-time Tool Trace &amp; Citations</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

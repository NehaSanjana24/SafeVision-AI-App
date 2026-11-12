import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, Clock, CheckCircle2, Terminal } from 'lucide-react';
import { ToolTraceStep } from '../../types';

interface ToolTraceAccordionProps {
  steps: ToolTraceStep[];
}

export const ToolTraceAccordion: React.FC<ToolTraceAccordionProps> = ({ steps }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!steps || steps.length === 0) return null;

  const toolNameMap: Record<string, string> = {
    visual_inspector: 'Visual Inspector',
    violation_search: 'Violation Search',
    doc_retriever: 'Doc Retriever',
    incident_logger: 'Incident Logger',
    supervisor_alert: 'Supervisor Alert',
    compliance_calculator: 'Compliance Calc',
  };

  const formattedSequence = steps
    .map((s) => (s.tool && toolNameMap[s.tool]) || s.name || s.tool || 'Tool')
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(' → ');

  const totalDuration = steps.reduce((acc, s) => acc + (s.durationMs || 0), 0);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-all shadow-sm"
      >
        <span className="flex items-center gap-1.5 text-purple-400 font-semibold">
          <Wrench className="w-3.5 h-3.5 text-purple-400" />
          <span>Tool:</span>
        </span>
        <span className="text-slate-300 font-mono text-[11px] truncate max-w-[280px] sm:max-w-md">
          {formattedSequence}
        </span>
        <span className="text-slate-500 text-[10px] flex items-center gap-0.5 ml-1 border-l border-slate-700 pl-2">
          <Clock className="w-3 h-3" />
          {totalDuration}ms
        </span>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 ml-1" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 ml-1" />
        )}
      </button>

      {isOpen && (
        <div className="mt-2 p-3 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-150">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-800">
            <Terminal className="w-3.5 h-3.5 text-purple-400" />
            <span>Agent Tool Execution Trace</span>
          </div>

          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 space-y-1 font-mono text-[11px]"
              >
                <div className="flex items-center justify-between text-slate-300">
                  <span className="font-bold text-purple-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    {(step.tool && toolNameMap[step.tool]) || step.name || step.tool || 'Tool'}
                  </span>
                  <span className="text-slate-500 text-[10px]">{step.durationMs}ms</span>
                </div>
                <div className="text-slate-400 truncate">
                  <span className="text-slate-500 font-sans">Input:</span> {step.input || 'None'}
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-500 font-sans">Summary:</span> {step.resultSummary}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

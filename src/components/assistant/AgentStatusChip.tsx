import React from 'react';
import { Loader2, Wrench, PenTool, AlertCircle, CheckCircle2 } from 'lucide-react';

export type AgentStatusType = 'idle' | 'reasoning' | 'calling_tool' | 'writing_answer' | 'error';

interface AgentStatusChipProps {
  status: AgentStatusType;
  currentTool?: string;
}

export const AgentStatusChip: React.FC<AgentStatusChipProps> = ({ status, currentTool }) => {
  const config = {
    idle: {
      label: 'Idle',
      color: 'bg-slate-800 text-slate-300 border-slate-700',
      icon: CheckCircle2,
      pulse: false,
    },
    reasoning: {
      label: 'Reasoning...',
      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      icon: Loader2,
      pulse: true,
    },
    calling_tool: {
      label: currentTool ? `Tool: ${currentTool}` : 'Calling tool...',
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: Wrench,
      pulse: true,
    },
    writing_answer: {
      label: 'Writing answer...',
      color: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
      icon: PenTool,
      pulse: true,
    },
    error: {
      label: 'Error',
      color: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      icon: AlertCircle,
      pulse: false,
    },
  }[status] || {
    label: 'Idle',
    color: 'bg-slate-800 text-slate-300 border-slate-700',
    icon: CheckCircle2,
    pulse: false,
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${config.color}`}
    >
      <Icon className={`w-3.5 h-3.5 ${config.pulse ? 'animate-spin' : ''}`} />
      <span>{config.label}</span>
    </span>
  );
};

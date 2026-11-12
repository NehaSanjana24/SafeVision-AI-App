import React, { useState } from 'react';
import {
  Workflow,
  ShieldAlert,
  Mail,
  CheckCircle2,
  Clock,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  UserCheck,
  AlertTriangle,
  Send,
  PanelRightClose,
} from 'lucide-react';
import { WorkflowRun } from '../../types';
import { repository } from '../../services/storage';
import { useToast } from '../../context/ToastContext';
import { useNavigate } from 'react-router-dom';

interface WorkflowsPanelProps {
  workflowRuns: WorkflowRun[];
  onRefresh?: () => void;
  onClose?: () => void;
  onCloseMobile?: () => void;
}

export const WorkflowsPanel: React.FC<WorkflowsPanelProps> = ({
  workflowRuns,
  onRefresh,
  onClose,
  onCloseMobile,
}) => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const handleCopyEmail = (run: WorkflowRun) => {
    if (!run.details) return;
    navigator.clipboard.writeText(run.details);
    setCopiedId(run.id);
    addToast('info', 'Alert email copied to clipboard');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleApprove = async (run: WorkflowRun) => {
    setApprovingId(run.id);
    try {
      await repository.updateWorkflowRun(run.id, {
        status: 'simulated',
        summary: 'Supervisor authorized dispatch. Generated alert email.',
      });
      addToast('success', 'Supervisor alert approved and dispatched');
      onRefresh?.();
    } catch {
      addToast('error', 'Approval update failed');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRetry = async (run: WorkflowRun) => {
    try {
      await repository.updateWorkflowRun(run.id, {
        status: 'simulated',
        summary: 'Retried alert transmission successfully in simulated mode.',
      });
      addToast('success', 'Workflow retried successfully');
      onRefresh?.();
    } catch {
      addToast('error', 'Retry failed');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/90 border-l border-slate-800 text-slate-100 w-full sm:w-80 md:w-96 shrink-0 transition-all">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold tracking-wide text-slate-200 uppercase">
                Active Workflows
              </h3>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
                {workflowRuns.length}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Automated safety actions</p>
          </div>
        </div>

        {(onClose || onCloseMobile) && (
          <button
            type="button"
            onClick={onClose || onCloseMobile}
            title="Fold Active Workflows panel"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs"
          >
            <PanelRightClose className="w-4 h-4" />
            <span className="text-[11px] hidden sm:inline">Fold</span>
          </button>
        )}
      </div>

      {/* Workflow Run Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar">
        {workflowRuns.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500 mb-3">
              <Workflow className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-medium text-slate-300">No Active Workflows</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              When high-severity safety infractions or escalations occur, the agent will auto-trigger
              incident logging and supervisor alert notifications here.
            </p>
          </div>
        ) : (
          workflowRuns.map((run) => {
            const isIncident = run.toolName === 'incident_logger';

            return (
              <div
                key={run.id}
                className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-sm space-y-2.5"
              >
                {/* Header: Title & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isIncident ? (
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                        <Mail className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-slate-200 truncate">{run.title}</h4>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {new Date(run.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div>
                    {run.status === 'auto_triggered' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Auto-triggered
                      </span>
                    )}
                    {run.status === 'sent' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Send className="w-2.5 h-2.5" />
                        Sent (webhook)
                      </span>
                    )}
                    {run.status === 'simulated' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Simulated
                      </span>
                    )}
                    {run.status === 'pending_approval' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                        <Clock className="w-2.5 h-2.5" />
                        Pending approval
                      </span>
                    )}
                    {run.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Failed
                      </span>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <p className="text-xs text-slate-400 leading-relaxed">{run.summary}</p>

                {/* Actions */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                  {run.incidentId && (
                    <button
                      type="button"
                      onClick={() => navigate('/alerts?tab=incidents')}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View Incident #{run.incidentNumber || ''}</span>
                    </button>
                  )}

                  {run.status === 'pending_approval' && (
                    <button
                      type="button"
                      onClick={() => handleApprove(run)}
                      disabled={approvingId === run.id}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500 text-slate-950 hover:bg-amber-400 transition-all shadow-sm"
                    >
                      <UserCheck className="w-3 h-3" />
                      <span>{approvingId === run.id ? 'Approving...' : 'Approve & Send'}</span>
                    </button>
                  )}

                  {run.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => handleRetry(run)}
                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                  )}

                  {(run.status === 'simulated' || run.status === 'sent') && run.details && (
                    <button
                      type="button"
                      onClick={() => handleCopyEmail(run)}
                      className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
                    >
                      {copiedId === run.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy alert email</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

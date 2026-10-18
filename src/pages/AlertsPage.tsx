import React, { useState, useEffect } from 'react';
import { repository } from '../services/storage';
import { Violation } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  BellRing,
  Search,
  Filter,
  Trash2,
  Eye,
  X,
  ShieldAlert,
  AlertTriangle,
  Calendar,
  Lock,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flag,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { FalsePositiveModal, FalsePositiveTarget } from '../components/detection/FalsePositiveModal';

export const AlertsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { addToast } = useToast();

  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'false_positive'>('all');

  // Modal inspection
  const [activeModalViolation, setActiveModalViolation] = useState<Violation | null>(null);

  // False Positive Modal target
  const [fpModalTarget, setFpModalTarget] = useState<FalsePositiveTarget | null>(null);

  // Admin delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    loadViolations();
  }, []);

  const loadViolations = async () => {
    setLoading(true);
    try {
      const data = await repository.getAllViolations();
      setViolations(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      addToast('error', 'Unauthorized', 'Only Administrators have permission to delete safety violation records.');
      return;
    }

    try {
      await repository.deleteViolation(id);
      setViolations((prev) => prev.filter((v) => v.id !== id));
      addToast('success', 'Violation Removed', 'Record purged from safety database.');
      setDeletingId(null);
    } catch (err: any) {
      addToast('error', 'Delete Failed', err.message);
    }
  };

  const handleUnflagFalsePositive = async (id: string) => {
    try {
      const updated = await repository.unflagFalsePositive(id);
      if (updated) {
        setViolations((prev) => prev.map((v) => (v.id === id ? updated : v)));
        if (activeModalViolation?.id === id) {
          setActiveModalViolation(updated);
        }
        addToast('success', 'False Positive Reverted', 'Record reinstated as active hazard.');
      }
    } catch (err: any) {
      addToast('error', 'Error reverting flag', err.message);
    }
  };

  const handleFalsePositiveSuccess = async () => {
    await loadViolations();
    if (activeModalViolation) {
      const fresh = await repository.getAllViolations();
      const updated = fresh.find((v) => v.id === activeModalViolation.id);
      if (updated) setActiveModalViolation(updated);
    }
  };

  // Filtered list
  const filtered = violations.filter((v) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      v.type.toLowerCase().includes(query) ||
      v.fileName.toLowerCase().includes(query) ||
      v.id.toLowerCase().includes(query) ||
      (v.falsePositiveReason && v.falsePositiveReason.toLowerCase().includes(query));

    const matchesType = typeFilter === 'all' || v.type.toLowerCase().includes(typeFilter.toLowerCase());
    const matchesSource = sourceFilter === 'all' || v.sourceType === sourceFilter;
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? !v.isFalsePositive
        : Boolean(v.isFalsePositive);

    return matchesSearch && matchesType && matchesSource && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <BellRing className="w-6 h-6 text-rose-400" />
            <span>Alert History &amp; Violation Registry</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect individual PPE infraction evidence frames, examine confidence telemetry, and maintain audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isAdmin && (
            <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Supervisor Mode (Read-only deletion)</span>
            </span>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search violations or files..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-56 sm:w-64"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Violation Types</option>
            <option value="helmet">NO-Helmet</option>
            <option value="vest">NO-Vest</option>
            <option value="glove">Gloves</option>
            <option value="goggle">Goggles</option>
            <option value="mask">Mask</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Sources</option>
            <option value="image">Image Scan</option>
            <option value="video">Video Extraction</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Statuses ({violations.length})</option>
            <option value="active">Active Hazards ({violations.filter((v) => !v.isFalsePositive).length})</option>
            <option value="false_positive">
              False Positives ({violations.filter((v) => v.isFalsePositive).length})
            </option>
          </select>
        </div>

        <div className="text-xs font-mono text-slate-400">
          Showing: <span className="font-bold text-amber-400">{filtered.length}</span> Records (
          <span className="text-rose-400 font-bold">{violations.filter((v) => !v.isFalsePositive).length}</span> Active,{' '}
          <span className="text-purple-400 font-bold">{violations.filter((v) => v.isFalsePositive).length}</span> FP)
        </div>
      </div>

      {/* Table of Violations */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                <th className="pb-3">Evidence Thumbnail</th>
                <th className="pb-3">Hazard / Classification</th>
                <th className="pb-3">Confidence</th>
                <th className="pb-3">Source &amp; File</th>
                <th className="pb-3">Logged Timestamp</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
                    <p className="font-medium">No safety violations found matching your filter.</p>
                  </td>
                </tr>
              ) : (
                paginated.map((v) => (
                  <tr
                    key={v.id}
                    className={`transition-colors ${
                      v.isFalsePositive
                        ? 'bg-purple-950/10 hover:bg-purple-950/20 opacity-85'
                        : 'hover:bg-slate-800/30'
                    }`}
                  >
                    {/* Thumbnail */}
                    <td className="py-3">
                      <div
                        onClick={() => setActiveModalViolation(v)}
                        className={`w-16 h-12 rounded-lg bg-slate-950 border overflow-hidden cursor-pointer hover:border-amber-500 transition-colors flex items-center justify-center relative group ${
                          v.isFalsePositive ? 'border-purple-500/40' : 'border-slate-800'
                        }`}
                      >
                        {v.evidenceImage ? (
                          <img
                            src={v.evidenceImage}
                            alt={v.type}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <ShieldAlert className="w-5 h-5 text-rose-500/50" />
                        )}
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Eye className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                    </td>

                    {/* Type & False Positive Badge */}
                    <td className="py-3">
                      {v.isFalsePositive ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-300 font-mono font-bold text-[10px] flex items-center gap-1">
                              <Flag className="w-3 h-3 text-purple-400" />
                              FALSE POSITIVE
                            </span>
                            <span className="line-through text-slate-500 font-mono text-[11px]">
                              {v.type}
                            </span>
                          </div>
                          {v.falsePositiveReason && (
                            <p className="text-[10px] text-slate-400 italic truncate max-w-xs">
                              {v.falsePositiveReason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 font-mono font-bold text-[11px]">
                          {v.type}
                        </span>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="py-3 font-mono">
                      {v.isFalsePositive ? (
                        <div>
                          <span className="line-through text-slate-500">
                            {(v.confidence * 100).toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-purple-400 block font-normal">
                            Calibrated
                          </span>
                        </div>
                      ) : (
                        <span className="font-bold text-amber-400">
                          {(v.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>

                    {/* Source & File */}
                    <td className="py-3">
                      <div className="font-semibold text-slate-200 truncate max-w-[160px]">
                        {v.fileName}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono uppercase mt-0.5">
                        {v.sourceType} {v.frameTime !== undefined ? `• ${v.frameTime}s` : ''}
                      </div>
                    </td>

                    {/* Timestamp */}
                    <td className="py-3 font-mono text-slate-400 whitespace-nowrap">
                      {new Date(v.createdAt).toLocaleDateString()}{' '}
                      <span className="text-[10px] text-slate-500">
                        {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {v.isFalsePositive ? (
                          <button
                            onClick={() => handleUnflagFalsePositive(v.id)}
                            title="Undo False Positive"
                            className="px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-colors flex items-center gap-1 text-[11px]"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span className="hidden sm:inline">Undo FP</span>
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              setFpModalTarget({
                                violationId: v.id,
                                scanId: v.scanId,
                                className: v.type,
                                confidence: v.confidence,
                                fileName: v.fileName,
                                sourceType: v.sourceType,
                                bbox: v.bbox,
                                evidenceImage: v.evidenceImage,
                              })
                            }
                            title="Flag as False Positive"
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-amber-500/20 hover:text-amber-400 text-slate-400 border border-slate-700/60 transition-colors flex items-center gap-1 text-[11px]"
                          >
                            <Flag className="w-3 h-3 text-amber-400" />
                            <span className="hidden sm:inline">Flag FP</span>
                          </button>
                        )}

                        <button
                          onClick={() => setActiveModalViolation(v)}
                          title="Inspect Evidence Frame"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(v.id)}
                            title="Delete Record (Admin)"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
            <span className="text-slate-400">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal with Full Annotated Evidence Image */}
      {activeModalViolation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold text-white">
                  Evidence Frame &amp; Telemetry Inspection
                </h3>
              </div>
              <button
                onClick={() => setActiveModalViolation(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* False Positive Banner if already flagged */}
            {activeModalViolation.isFalsePositive && (
              <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-500/40 text-purple-200 text-xs flex items-start justify-between gap-3 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <Flag className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-purple-300 uppercase tracking-wide">
                      Flagged as False Positive (Model Feedback Recorded)
                    </div>
                    <p className="mt-0.5 text-slate-300 text-[11px]">
                      Reason: <span className="font-semibold text-white">{activeModalViolation.falsePositiveReason || 'Manual supervisory review'}</span>
                    </p>
                    {activeModalViolation.falsePositiveNotes && (
                      <p className="mt-0.5 text-slate-400 text-[10px]">
                        Notes: {activeModalViolation.falsePositiveNotes}
                      </p>
                    )}
                    <p className="mt-1 text-slate-500 text-[9px] font-mono">
                      Logged by {activeModalViolation.flaggedBy || 'Supervisor'} on{' '}
                      {activeModalViolation.flaggedAt
                        ? new Date(activeModalViolation.flaggedAt).toLocaleString()
                        : 'N/A'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleUnflagFalsePositive(activeModalViolation.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-[11px] font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Undo Flag</span>
                </button>
              </div>
            )}

            {/* Evidence Image */}
            <div className="rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 max-h-[420px] flex items-center justify-center">
              {activeModalViolation.evidenceImage ? (
                <img
                  src={activeModalViolation.evidenceImage}
                  alt={activeModalViolation.type}
                  className="w-full h-full object-contain max-h-[420px]"
                />
              ) : (
                <div className="p-16 text-center text-slate-500 text-xs">
                  <ShieldAlert className="w-12 h-12 text-slate-600 mx-auto mb-2 opacity-50" />
                  <span>No image data attached to this legacy violation record.</span>
                </div>
              )}
            </div>

            {/* Telemetry info row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Infraction</div>
                <div className={`font-bold mt-0.5 ${activeModalViolation.isFalsePositive ? 'text-purple-400 line-through' : 'text-rose-400'}`}>
                  {activeModalViolation.type}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Confidence</div>
                <div className="font-bold text-amber-400 mt-0.5 font-mono">
                  {(activeModalViolation.confidence * 100).toFixed(0)}%
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Source</div>
                <div className="font-bold text-slate-200 mt-0.5 capitalize font-mono">
                  {activeModalViolation.sourceType}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Timestamp</div>
                <div className="font-bold text-slate-200 mt-0.5 font-mono truncate">
                  {new Date(activeModalViolation.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <div>
                {!activeModalViolation.isFalsePositive && (
                  <button
                    onClick={() => {
                      setFpModalTarget({
                        violationId: activeModalViolation.id,
                        scanId: activeModalViolation.scanId,
                        className: activeModalViolation.type,
                        confidence: activeModalViolation.confidence,
                        fileName: activeModalViolation.fileName,
                        sourceType: activeModalViolation.sourceType,
                        bbox: activeModalViolation.bbox,
                        evidenceImage: activeModalViolation.evidenceImage,
                      });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Flag as False Positive</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => {
                      handleDelete(activeModalViolation.id);
                      setActiveModalViolation(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold border border-rose-500/20 flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Record</span>
                  </button>
                )}
                <button
                  onClick={() => setActiveModalViolation(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* False Positive Feedback Modal */}
      <FalsePositiveModal
        isOpen={Boolean(fpModalTarget)}
        onClose={() => setFpModalTarget(null)}
        target={fpModalTarget}
        onSuccess={handleFalsePositiveSuccess}
      />
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { repository } from '../services/storage';
import { Violation, Incident } from '../types';
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
  Lock,
  ChevronLeft,
  ChevronRight,
  Flag,
  RotateCcw,
  CheckCircle2,
  BookOpen,
  Bot,
  Workflow,
  ArrowRight,
  FileText,
  Download,
  MapPin,
  Camera,
  ArrowUpDown,
} from 'lucide-react';
import { FalsePositiveModal, FalsePositiveTarget } from '../components/detection/FalsePositiveModal';
import { PolicyDrawer } from '../components/knowledge/PolicyDrawer';
import {
  ViolationFilterCriteria,
  DEFAULT_VIOLATION_FILTERS,
  ViolationStatusFilter,
  ViolationDateRange,
  ViolationSortOption,
  ViolationSeverityFilter,
  filterAndSortViolations,
  getAvailableViolationOptions,
  countActiveViolationFilters,
  parseViolationFiltersFromSearchParams,
  serializeViolationFiltersToSearchParams,
  resolveViolationSeverity,
  buildViolationsCSV,
} from '../utils/violationFilters';

export const AlertsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab: violations vs incidents
  const [activeTab, setActiveTab] = useState<'violations' | 'incidents'>(
    searchParams.get('tab') === 'incidents' ? 'incidents' : 'violations'
  );

  const [violations, setViolations] = useState<Violation[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  // Violation Search & Multi-Criteria Filters (URL synced)
  const [filters, setFilters] = useState<ViolationFilterCriteria>(() =>
    parseViolationFiltersFromSearchParams(searchParams)
  );

  // Incident Search & Filter
  const [incidentSearchQuery, setIncidentSearchQuery] = useState('');
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState<string>('all');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState<string>('all');

  // Policy Reference Drawer State
  const [showPolicyDrawer, setShowPolicyDrawer] = useState(false);
  const [selectedPolicyViolation, setSelectedPolicyViolation] = useState<string>('helmet');
  const [hasKnowledgeDocs, setHasKnowledgeDocs] = useState<boolean>(true);

  useEffect(() => {
    repository.getAllDocuments().then((docs) => {
      setHasKnowledgeDocs(docs.length > 0);
    }).catch(() => setHasKnowledgeDocs(false));
  }, []);

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
    loadIncidents();
  }, []);

  const loadIncidents = async () => {
    try {
      const data = await repository.getAllIncidents();
      setIncidents(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateIncidentStatus = async (id: string, status: Incident['status']) => {
    await repository.updateIncidentStatus(id, status);
    setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    addToast('success', 'Incident Updated', `Status changed to ${status}`);
  };

  const handleInvestigateIncident = (inc: Incident) => {
    navigate(
      `/assistant?prompt=${encodeURIComponent(
        `Investigate Incident #${inc.incidentNumber} (${inc.title}) in Zone ${inc.zone || 'Site'} and provide remediation advice.`
      )}`
    );
  };

  const handleInvestigateViolation = (v: Violation) => {
    navigate(
      `/assistant?prompt=${encodeURIComponent(
        `Investigate ${v.type} violation on ${v.fileName}${v.zone ? ` in Zone ${v.zone}` : ''} (${v.cameraId || 'CCTV'}). Explain policy infractions and suggest corrective actions.`
      )}`
    );
  };

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

  // Sync filters when URL query string changes externally (e.g. from Dashboard KPI click)
  useEffect(() => {
    const tabParam = searchParams.get('tab') === 'incidents' ? 'incidents' : 'violations';
    setActiveTab(tabParam);
    setFilters(parseViolationFiltersFromSearchParams(searchParams));
  }, [searchParams]);

  const updateFilters = (patch: Partial<ViolationFilterCriteria>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      setSearchParams(serializeViolationFiltersToSearchParams(next, activeTab), { replace: true });
      return next;
    });
    setCurrentPage(1);
  };

  const resetAllViolationFilters = () => {
    setFilters(DEFAULT_VIOLATION_FILTERS);
    setSearchParams(serializeViolationFiltersToSearchParams(DEFAULT_VIOLATION_FILTERS, activeTab), {
      replace: true,
    });
    setCurrentPage(1);
  };

  const handleToggleResolved = async (id: string) => {
    try {
      const updated = await repository.toggleViolationResolved(id);
      if (updated) {
        setViolations((prev) => prev.map((v) => (v.id === id ? updated : v)));
        if (activeModalViolation?.id === id) {
          setActiveModalViolation(updated);
        }
        addToast(
          'success',
          updated.resolved ? 'Violation Marked Resolved' : 'Violation Reopened',
          updated.resolved
            ? 'Safety infraction flagged as remediated.'
            : 'Safety infraction returned to open queue.'
        );
      }
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message);
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

  const availableOptions = useMemo(() => getAvailableViolationOptions(violations), [violations]);

  const filtered = useMemo(
    () => filterAndSortViolations(violations, filters),
    [violations, filters]
  );

  const activeFilterCount = useMemo(() => countActiveViolationFilters(filters), [filters]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  const activeHazardsCount = useMemo(
    () => violations.filter((v) => !v.isFalsePositive).length,
    [violations]
  );
  const unresolvedCount = useMemo(
    () => violations.filter((v) => !v.isFalsePositive && !v.resolved).length,
    [violations]
  );
  const resolvedCount = useMemo(
    () => violations.filter((v) => !v.isFalsePositive && Boolean(v.resolved)).length,
    [violations]
  );
  const falsePositiveCount = useMemo(
    () => violations.filter((v) => Boolean(v.isFalsePositive)).length,
    [violations]
  );

  const handleExportFilteredCSV = () => {
    if (filtered.length === 0) return;
    const csv = buildViolationsCSV(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `SafeVision_Violations_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('success', 'CSV Exported', `Exported ${filtered.length} matching safety violation records.`);
  };

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (filters.query.trim()) {
      chips.push({
        key: 'query',
        label: `Search: "${filters.query.trim()}"`,
        onClear: () => updateFilters({ query: '' }),
      });
    }
    if (filters.violationType !== 'all') {
      chips.push({
        key: 'violationType',
        label: `Hazard: ${filters.violationType}`,
        onClear: () => updateFilters({ violationType: 'all' }),
      });
    }
    if (filters.zone !== 'all') {
      chips.push({
        key: 'zone',
        label: `Zone ${filters.zone}`,
        onClear: () => updateFilters({ zone: 'all' }),
      });
    }
    if (filters.cameraId !== 'all') {
      chips.push({
        key: 'cameraId',
        label: `Camera: ${filters.cameraId}`,
        onClear: () => updateFilters({ cameraId: 'all' }),
      });
    }
    if (filters.sourceType !== 'all') {
      chips.push({
        key: 'sourceType',
        label: `Source: ${filters.sourceType}`,
        onClear: () => updateFilters({ sourceType: 'all' }),
      });
    }
    if (filters.status !== 'all') {
      const statusLabels: Record<ViolationStatusFilter, string> = {
        all: 'All',
        active: 'Active Hazards',
        unresolved: 'Unresolved',
        resolved: 'Resolved',
        false_positive: 'False Positives',
      };
      chips.push({
        key: 'status',
        label: `Status: ${statusLabels[filters.status]}`,
        onClear: () => updateFilters({ status: 'all' }),
      });
    }
    if (filters.severity !== 'all') {
      chips.push({
        key: 'severity',
        label: `Severity: ${filters.severity}`,
        onClear: () => updateFilters({ severity: 'all' }),
      });
    }
    if (filters.minConfidence > 0) {
      chips.push({
        key: 'minConfidence',
        label: `Confidence >= ${Math.round(filters.minConfidence * 100)}%`,
        onClear: () => updateFilters({ minConfidence: 0 }),
      });
    }
    if (filters.dateRange !== 'all') {
      const dateLabel =
        filters.dateRange === 'custom'
          ? `Dates: ${filters.startDate || '...'} to ${filters.endDate || '...'}`
          : `Range: ${filters.dateRange.toUpperCase()}`;
      chips.push({
        key: 'dateRange',
        label: dateLabel,
        onClear: () => updateFilters({ dateRange: 'all', startDate: '', endDate: '' }),
      });
    }
    return chips;
  }, [filters]);

  return (
    <div className="space-y-6">
      {/* Header with Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-rose-400 tracking-tight flex items-center gap-2.5">
            <BellRing className="w-6 h-6 text-rose-400" />
            <span>Alert History &amp; Safety Records</span>
          </h1>
          <p className="text-xs text-amber-400 mt-0.5">
            Search, filter, and inspect individual PPE infraction frames, resolution logs, and active safety incidents.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab Switcher */}
          <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => {
                setActiveTab('violations');
                setSearchParams(serializeViolationFiltersToSearchParams(filters, 'violations'), {
                  replace: true,
                });
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'violations'
                  ? 'bg-rose-600 text-yellow-200 shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Violations ({violations.length})</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('incidents');
                setSearchParams({ tab: 'incidents' }, { replace: true });
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'incidents'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>Incidents ({incidents.filter((i) => i.status === 'open').length} Open)</span>
            </button>
          </div>

          {!isAdmin && (
            <span className="hidden md:flex px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Supervisor Mode</span>
            </span>
          )}
        </div>
      </div>

      {activeTab === 'violations' ? (
        <>
          {/* Search & Multi-Criteria Filter Toolbar */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs shadow-lg">
            {/* Row 1: Search Input + Date Range + Sort + Export */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[230px] max-w-md">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Search safety violation records"
                  placeholder="Search ID, hazard, file, zone, camera, or notes..."
                  value={filters.query}
                  onChange={(e) => updateFilters({ query: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                {filters.query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => updateFilters({ query: '' })}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-amber-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Date Range Quick Selector */}
                <div className="flex bg-slate-950 rounded-xl p-0.5 border border-slate-800" role="group" aria-label="Date Range">
                  {(['all', 'today', '7d', '30d', '90d', 'custom'] as ViolationDateRange[]).map((rangeKey) => (
                    <button
                      key={rangeKey}
                      type="button"
                      onClick={() => updateFilters({ dateRange: rangeKey })}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold transition-all ${
                        filters.dateRange === rangeKey
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-amber-400'
                      }`}
                    >
                      {rangeKey === 'all' ? 'ALL' : rangeKey.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Sort Selector */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <select
                    aria-label="Sort violation records"
                    value={filters.sortBy}
                    onChange={(e) => updateFilters({ sortBy: e.target.value as ViolationSortOption })}
                    className="bg-transparent text-slate-200 focus:outline-none text-xs"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="confidence_desc">Confidence: High → Low</option>
                    <option value="confidence_asc">Confidence: Low → High</option>
                    <option value="severity_desc">Severity: Highest First</option>
                    <option value="type_asc">Hazard Type (A–Z)</option>
                  </select>
                </div>

                {/* Export Filtered CSV */}
                <button
                  type="button"
                  disabled={filtered.length === 0}
                  onClick={handleExportFilteredCSV}
                  title="Export currently filtered violation records as CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-40 text-emerald-400 border border-emerald-500/30 font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              </div>
            </div>

            {/* Custom Date Range Pickers */}
            {filters.dateRange === 'custom' && (
              <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
                <span className="text-amber-400 font-semibold">Custom Dates:</span>
                <label className="flex items-center gap-1.5 text-slate-400">
                  <span>From</span>
                  <input
                    type="date"
                    aria-label="Start date"
                    value={filters.startDate}
                    onChange={(e) => updateFilters({ startDate: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-400">
                  <span>To</span>
                  <input
                    type="date"
                    aria-label="End date"
                    value={filters.endDate}
                    onChange={(e) => updateFilters({ endDate: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </label>
              </div>
            )}

            {/* Row 2: Attribute Dropdown Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 flex items-center gap-1 font-semibold mr-1">
                <Filter className="w-3.5 h-3.5 text-amber-400" /> Filters:
              </span>

              <select
                aria-label="Filter by violation type"
                value={filters.violationType}
                onChange={(e) => updateFilters({ violationType: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Violation Types</option>
                <option value="helmet">NO-Helmet</option>
                <option value="vest">NO-Vest</option>
                <option value="glove">Gloves</option>
                <option value="goggle">Goggles</option>
                <option value="mask">Mask</option>
                {availableOptions.extraTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by zone"
                value={filters.zone}
                onChange={(e) => updateFilters({ zone: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Zones</option>
                {availableOptions.zones.map((z) => (
                  <option key={z} value={z}>
                    Zone {z}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by camera"
                value={filters.cameraId}
                onChange={(e) => updateFilters({ cameraId: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Cameras</option>
                {availableOptions.cameras.map((cam) => (
                  <option key={cam} value={cam}>
                    {cam}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by capture source"
                value={filters.sourceType}
                onChange={(e) => updateFilters({ sourceType: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Sources</option>
                <option value="image">Image Scan</option>
                <option value="video">Video Extraction</option>
                <option value="stream">Live Stream</option>
              </select>

              <select
                aria-label="Filter by status"
                value={filters.status}
                onChange={(e) => updateFilters({ status: e.target.value as ViolationStatusFilter })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Statuses ({violations.length})</option>
                <option value="active">Active Hazards ({activeHazardsCount})</option>
                <option value="unresolved">Unresolved Only ({unresolvedCount})</option>
                <option value="resolved">Resolved Only ({resolvedCount})</option>
                <option value="false_positive">False Positives ({falsePositiveCount})</option>
              </select>

              <select
                aria-label="Filter by severity"
                value={filters.severity}
                onChange={(e) => updateFilters({ severity: e.target.value as ViolationSeverityFilter })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <select
                aria-label="Filter by minimum confidence"
                value={String(filters.minConfidence)}
                onChange={(e) => updateFilters({ minConfidence: Number(e.target.value) })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="0">Any Confidence</option>
                <option value="0.5">Confidence &ge; 50%</option>
                <option value="0.75">Confidence &ge; 75%</option>
                <option value="0.9">Confidence &ge; 90%</option>
              </select>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetAllViolationFilters}
                  className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-semibold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Filters ({activeFilterCount})</span>
                </button>
              )}
            </div>

            {/* Row 3: Active Filter Chips & Record Counts */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
              <div className="flex flex-wrap items-center gap-1.5">
                {activeFilterChips.length > 0 ? (
                  activeFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={chip.onClear}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 font-mono text-[11px] transition-colors cursor-pointer"
                    >
                      <span>{chip.label}</span>
                      <X className="w-3 h-3 text-amber-400" />
                    </button>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Showing all stored violation telemetry. Combine search and filters above to narrow records.
                  </span>
                )}
              </div>

              <div className="text-xs font-mono text-slate-400">
                Showing: <span className="font-bold text-amber-400">{filtered.length}</span> of{' '}
                <span className="font-bold text-cyan-400">{violations.length}</span> Records (
                <span className="text-rose-400 font-bold">{unresolvedCount}</span> Open,{' '}
                <span className="text-emerald-400 font-bold">{resolvedCount}</span> Resolved,{' '}
                <span className="text-purple-400 font-bold">{falsePositiveCount}</span> FP)
              </div>
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
                    <th className="pb-3">Source &amp; Location</th>
                    <th className="pb-3">Logged Timestamp</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-500 space-y-3">
                        <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto opacity-60" />
                        <p className="font-medium text-slate-300">
                          {violations.length === 0
                            ? 'No safety violations have been recorded yet.'
                            : 'No safety violations match your active search or filters.'}
                        </p>
                        {activeFilterCount > 0 && (
                          <button
                            type="button"
                            onClick={resetAllViolationFilters}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reset All Filters</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    paginated.map((v) => {
                      const severity = resolveViolationSeverity(v);
                      return (
                        <tr
                          key={v.id}
                          className={`transition-colors ${
                            v.isFalsePositive
                              ? 'bg-purple-950/10 hover:bg-purple-950/20 opacity-85'
                              : v.resolved
                              ? 'bg-emerald-950/10 hover:bg-emerald-950/20'
                              : 'hover:bg-slate-800/30'
                          }`}
                        >
                          {/* Thumbnail */}
                          <td className="py-3">
                            <div
                              onClick={() => setActiveModalViolation(v)}
                              className={`w-16 h-12 rounded-lg bg-slate-950 border overflow-hidden cursor-pointer hover:border-amber-500 transition-colors flex items-center justify-center relative group ${
                                v.isFalsePositive
                                  ? 'border-purple-500/40'
                                  : v.resolved
                                  ? 'border-emerald-500/40'
                                  : 'border-slate-800'
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
                                <Eye className="w-3.5 h-3.5 text-amber-300" />
                              </div>
                            </div>
                          </td>

                          {/* Type, Severity, Resolved & False Positive Badge */}
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
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 font-mono font-bold text-[11px]">
                                  {v.type}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                                    severity === 'critical'
                                      ? 'bg-rose-500/25 text-rose-300 border-rose-500/40'
                                      : severity === 'high'
                                      ? 'bg-orange-500/20 text-orange-300 border-orange-500/35'
                                      : severity === 'medium'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/35'
                                      : 'bg-blue-500/20 text-blue-300 border-blue-500/35'
                                  }`}
                                >
                                  {severity}
                                </span>
                                {v.resolved && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-[10px] inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    RESOLVED
                                  </span>
                                )}
                              </div>
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

                          {/* Source, Zone, Camera & File */}
                          <td className="py-3">
                            <div className="font-semibold text-slate-200 truncate max-w-[180px]" title={v.fileName}>
                              {v.fileName}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 font-mono uppercase mt-1">
                              <span className="text-cyan-400">
                                {v.sourceType}
                                {v.frameTime !== undefined ? ` • ${v.frameTime}s` : ''}
                              </span>
                              {v.zone && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                  <MapPin className="w-2.5 h-2.5" />
                                  Zone {v.zone}
                                </span>
                              )}
                              {v.cameraId && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                  <Camera className="w-2.5 h-2.5" />
                                  {v.cameraId}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Timestamp */}
                          <td className="py-3 font-mono text-slate-400 whitespace-nowrap">
                            {new Date(v.createdAt).toLocaleDateString()}{' '}
                            <span className="text-[10px] text-slate-500">
                              {new Date(v.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {!v.isFalsePositive && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleResolved(v.id)}
                                  title={v.resolved ? 'Reopen Violation' : 'Mark Violation as Resolved'}
                                  className={`px-2 py-1 rounded-lg border transition-colors flex items-center gap-1 text-[11px] ${
                                    v.resolved
                                      ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                                      : 'bg-slate-800 hover:bg-emerald-500/20 text-emerald-400 border-slate-700/60'
                                  }`}
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span className="hidden lg:inline">
                                    {v.resolved ? 'Resolved' : 'Resolve'}
                                  </span>
                                </button>
                              )}

                              {v.isFalsePositive ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnflagFalsePositive(v.id)}
                                  title="Undo False Positive"
                                  className="px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-colors flex items-center gap-1 text-[11px]"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span className="hidden sm:inline">Undo FP</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
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

                              {hasKnowledgeDocs && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPolicyViolation(v.type);
                                    setShowPolicyDrawer(true);
                                  }}
                                  title="View Safety Policy Reference"
                                  className="p-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 hover:text-violet-300 transition-colors"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setActiveModalViolation(v)}
                                title="Inspect Evidence Frame"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-amber-400 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {isAdmin && (
                                <button
                                  type="button"
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
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
                <span className="text-slate-400">
                  Page {safePage} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={safePage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Incident Management View */
        <div className="space-y-4">
          {/* Incidents Filter Toolbar */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search incidents, zones, titles..."
                  value={incidentSearchQuery}
                  onChange={(e) => setIncidentSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-56 sm:w-64"
                />
                {incidentSearchQuery && (
                  <button
                    type="button"
                    aria-label="Clear incident search"
                    onClick={() => setIncidentSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-amber-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={incidentSeverityFilter}
                onChange={(e) => setIncidentSeverityFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <select
                value={incidentStatusFilter}
                onChange={(e) => setIncidentStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="all">All Statuses ({incidents.length})</option>
                <option value="open">Open ({incidents.filter((i) => i.status === 'open').length})</option>
                <option value="investigating">Investigating ({incidents.filter((i) => i.status === 'investigating').length})</option>
                <option value="resolved">Resolved ({incidents.filter((i) => i.status === 'resolved').length})</option>
              </select>
            </div>

            <div className="text-xs font-mono text-slate-400">
              Total Incidents: <span className="text-amber-400 font-bold">{incidents.length}</span> (
              <span className="text-rose-400 font-bold">{incidents.filter((i) => i.status === 'open').length}</span> Open)
            </div>
          </div>

          {/* Incidents Cards List */}
          <div className="space-y-3">
            {incidents.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-2">
                <Workflow className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="text-sm font-semibold text-slate-300">No Safety Incidents Recorded</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Incidents are auto-logged by the SafeVision Agent or created by safety leads during audits.
                </p>
              </div>
            ) : (
              incidents
                .filter((inc) => {
                  const q = incidentSearchQuery.toLowerCase();
                  const matchesSearch =
                    (inc.title || '').toLowerCase().includes(q) ||
                    (inc.summary || '').toLowerCase().includes(q) ||
                    String(inc.incidentNumber).includes(q) ||
                    (inc.zone && inc.zone.toLowerCase().includes(q));
                  const matchesSeverity = incidentSeverityFilter === 'all' || inc.severity === incidentSeverityFilter;
                  const matchesStatus = incidentStatusFilter === 'all' || inc.status === incidentStatusFilter;
                  return matchesSearch && matchesSeverity && matchesStatus;
                })
                .map((inc) => (
                  <div
                    key={inc.id}
                    className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-md space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          #{inc.incidentNumber}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-100">{inc.title}</h3>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-mono">
                            <span>Zone {inc.zone || 'Site'}</span>
                            <span>·</span>
                            <span>{inc.cameraId || 'CCTV'}</span>
                            <span>·</span>
                            <span>{new Date(inc.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Severity chip */}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase font-mono ${
                            inc.severity === 'critical'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : inc.severity === 'high'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : inc.severity === 'medium'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {inc.severity}
                        </span>

                        {/* Status select dropdown */}
                        <select
                          value={inc.status}
                          onChange={(e) => handleUpdateIncidentStatus(inc.id, e.target.value as any)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-lg border focus:outline-none cursor-pointer ${
                            inc.status === 'open'
                              ? 'bg-rose-950/60 text-rose-300 border-rose-700/60'
                              : inc.status === 'investigating'
                              ? 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                              : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                          }`}
                        >
                          <option value="open">Open</option>
                          <option value="investigating">Investigating</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{inc.summary}</p>

                    {/* Policy Citations & Footer */}
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-slate-500 text-[11px]">Policy Cites:</span>
                        {inc.policyCitations && inc.policyCitations.length > 0 ? (
                          inc.policyCitations.map((cite, cIdx) => (
                            <span
                              key={cIdx}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/40 text-purple-300 border border-purple-800/50"
                            >
                              {cite}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 text-[11px] italic">Standard Site Safety Code</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/reports?from=incident&type=incident_investigation&incidentId=${encodeURIComponent(
                                inc.id
                              )}`
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <span>Generate Incident Report</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleInvestigateIncident(inc)}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-yellow-200 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        >
                          <Bot className="w-3.5 h-3.5" />
                          <span>Investigate with Agent</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* Modal with Full Annotated Evidence Image */}
      {activeModalViolation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold text-rose-400">
                  Evidence Frame &amp; Telemetry Inspection
                </h3>
              </div>
              <button
                onClick={() => setActiveModalViolation(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 bg-slate-800 hover:bg-slate-700 transition-colors"
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
                      Reason: <span className="font-semibold text-amber-300">{activeModalViolation.falsePositiveReason || 'Manual supervisory review'}</span>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
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
                <div className="text-[10px] text-slate-400 uppercase font-mono">Zone &amp; Camera</div>
                <div className="font-bold text-indigo-300 mt-0.5 font-mono">
                  {activeModalViolation.zone ? `Zone ${activeModalViolation.zone}` : 'Site'} · {activeModalViolation.cameraId || 'CCTV'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Source</div>
                <div className="font-bold text-cyan-300 mt-0.5 capitalize font-mono">
                  {activeModalViolation.sourceType}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Severity</div>
                <div className="font-bold text-orange-300 mt-0.5 uppercase font-mono">
                  {resolveViolationSeverity(activeModalViolation)}
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
              <div className="flex items-center gap-2 flex-wrap">
                {!activeModalViolation.isFalsePositive && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleToggleResolved(activeModalViolation.id)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        activeModalViolation.resolved
                          ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-yellow-200 border-emerald-500/40'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{activeModalViolation.resolved ? 'Reopen Violation' : 'Mark Resolved'}</span>
                    </button>
                    <button
                      type="button"
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
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    const target = activeModalViolation;
                    setActiveModalViolation(null);
                    handleInvestigateViolation(target);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-yellow-200 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-purple-950/30"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Investigate with Agent</span>
                </button>
                <button
                  onClick={() => {
                    const target = activeModalViolation;
                    setActiveModalViolation(null);
                    navigate(
                      `/reports?from=alert&zone=${target.zone || 'A'}&class=${encodeURIComponent(
                        target.type
                      )}`
                    );
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-amber-950/20"
                  title="Compile formal OSHA compliance report for this incident"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Generate Incident Report</span>
                </button>
                {hasKnowledgeDocs && (
                  <button
                    onClick={() => {
                      setSelectedPolicyViolation(activeModalViolation.type);
                      setShowPolicyDrawer(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-yellow-200 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-violet-950/30"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>View Policy Citations</span>
                  </button>
                )}
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

      {/* Regulatory Safety Policy Reference Drawer */}
      <PolicyDrawer
        isOpen={showPolicyDrawer}
        onClose={() => setShowPolicyDrawer(false)}
        violationType={selectedPolicyViolation}
      />
    </div>
  );
};

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Filter,
  Bookmark,
  Share2,
  FileText,
  HelpCircle,
  Camera,
  CheckCircle2,
  Plus,
  RefreshCw,
  ChevronRight,
  X,
  Bot,
  Trash2,
  Edit3,
  Cpu,
  BookOpen,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  ReferenceDot,
} from 'recharts';
import { repository } from '../services/storage';
import { knowledgeService } from '../services/knowledge';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import {
  Scan,
  Violation,
  Incident,
  CorrectiveAction,
  IntelligenceFilters,
  SavedView,
  ZoneRiskScore,
  WorkflowRun,
  CorrectiveActionStatus,
} from '../types';
import { computeIntelligenceOffloaded } from '../utils/analyticsWorkerClient';
import { computeIntelligenceBundle } from '../workers/analytics.worker';
import { getRiskBandColor, RiskBand, DEFAULT_RISK_WEIGHTS } from '../utils/risk';

const DARK_ZONE_COLORS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '#fbbf24',
  B: '#60a5fa',
  C: '#34d399',
  D: '#a78bfa',
};

const LIGHT_ZONE_COLORS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '#d97706',
  B: '#2563eb',
  C: '#059669',
  D: '#7c3aed',
};

const BAND_HEX: Record<RiskBand, string> = {
  Low: '#10b981',
  Medium: '#f59e0b',
  High: '#f97316',
  Critical: '#ef4444',
};

const DARK_CLASS_COLORS = ['#fbbf24', '#f87171', '#60a5fa', '#34d399', '#a78bfa', '#22d3ee', '#f472b6'];
const LIGHT_CLASS_COLORS = ['#d97706', '#dc2626', '#2563eb', '#059669', '#7c3aed', '#0891b2', '#db2777'];

function MiniSparkline({ data, stroke }: { data: number[]; stroke: string }) {
  const safe = data.length >= 2 ? data : [data[0] ?? 0, data[0] ?? 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = Math.max(1, max - min);
  const points = safe
    .map((v, i) => {
      const x = (i / Math.max(1, safe.length - 1)) * 100;
      const y = 22 - ((v - min) / span) * 18;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 24" className="w-full h-5 overflow-visible" aria-hidden="true">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export const IntelligencePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const { addToast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const ZONE_COLORS = isLight ? LIGHT_ZONE_COLORS : DARK_ZONE_COLORS;
  const CLASS_COLORS = isLight ? LIGHT_CLASS_COLORS : DARK_CLASS_COLORS;
  const chartTooltipStyle = {
    backgroundColor: isLight ? '#ffffff' : '#020617',
    borderColor: isLight ? '#cbd5e1' : '#334155',
    color: isLight ? '#0f172a' : '#f1f5f9',
    borderRadius: '10px',
    fontSize: '11px',
  };

  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState<Scan[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [hasPolicyKnowledge, setHasPolicyKnowledge] = useState(true);
  const [bundle, setBundle] = useState<(ReturnType<typeof computeIntelligenceBundle> & { usedWorker: boolean }) | null>(
    null
  );

  // Modals, drawers, dropdowns
  const [selectedZoneDrawer, setSelectedZoneDrawer] = useState<ZoneRiskScore | null>(null);
  const [showFormulaInfo, setShowFormulaInfo] = useState(false);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [showSavedViewsMenu, setShowSavedViewsMenu] = useState(false);
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [renameViewText, setRenameViewText] = useState('');
  const [newViewName, setNewViewName] = useState('');

  // Action CRUD modal state
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingAction, setEditingAction] = useState<CorrectiveAction | null>(null);
  const [actionForm, setActionForm] = useState<{
    title: string;
    zone: 'A' | 'B' | 'C' | 'D';
    ownerRole: string;
    dueDate: string;
    status: CorrectiveActionStatus;
    notes: string;
  }>({
    title: '',
    zone: 'A',
    ownerRole: 'Safety Supervisor',
    dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
    status: 'planned',
    notes: '',
  });

  // Grounded Insights state
  const [showDataPayload, setShowDataPayload] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insights, setInsights] = useState<
    { title: string; severity: 'low' | 'medium' | 'high' | 'critical'; text: string; action: string; citation: string }[]
  >([]);

  const settings = useMemo(() => repository.getSettings(), []);
  const riskWeights = settings.riskWeights || DEFAULT_RISK_WEIGHTS;

  const filters: IntelligenceFilters = useMemo(() => {
    return {
      dateRange: (searchParams.get('range') as any) || '30d',
      startDate: searchParams.get('start') || undefined,
      endDate: searchParams.get('end') || undefined,
      zone: (searchParams.get('zone') as any) || 'all',
      camera: searchParams.get('camera') || 'all',
      source: (searchParams.get('source') as any) || 'all',
      violationClass: searchParams.get('class') || 'all',
      severity: (searchParams.get('severity') as any) || 'all',
      incidentStatus: (searchParams.get('incidentStatus') as any) || 'all',
      comparePrevious: searchParams.get('compare') !== 'false',
    };
  }, [searchParams]);

  const updateFilters = useCallback(
    (newFilters: Partial<IntelligenceFilters>) => {
      const next = { ...filters, ...newFilters };
      const params = new URLSearchParams();
      if (next.dateRange !== '30d') params.set('range', next.dateRange);
      if (next.startDate) params.set('start', next.startDate);
      if (next.endDate) params.set('end', next.endDate);
      if (next.zone !== 'all') params.set('zone', next.zone);
      if (next.camera !== 'all') params.set('camera', next.camera);
      if (next.source !== 'all') params.set('source', next.source);
      if (next.violationClass !== 'all') params.set('class', next.violationClass);
      if (next.severity !== 'all') params.set('severity', next.severity);
      if (next.incidentStatus !== 'all') params.set('incidentStatus', next.incidentStatus);
      if (!next.comparePrevious) params.set('compare', 'false');
      setSearchParams(params);
    },
    [filters, setSearchParams]
  );

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, v, inc, ca, sv, wf, docs] = await Promise.all([
        repository.getAllScans(),
        repository.getAllViolations(),
        repository.getAllIncidents(),
        repository.getAllCorrectiveActions(),
        repository.getAllSavedViews(currentUser?.id),
        repository.getAllWorkflowRuns(),
        repository.getAllDocuments(),
      ]);
      setScans(s);
      setViolations(v);
      setIncidents(inc);
      setCorrectiveActions(ca);
      setSavedViews(sv);
      setWorkflowRuns(wf);
      setHasPolicyKnowledge(docs.length > 0);
    } catch (err) {
      console.warn('Failed to load intelligence data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Recompute analytics bundle via Web Worker (>5k records) or synchronously
  useEffect(() => {
    let active = true;
    computeIntelligenceOffloaded({
      scans,
      violations,
      incidents,
      workflowRuns,
      filters,
      weights: riskWeights,
      hasPolicyKnowledge,
    }).then((res) => {
      if (active) setBundle(res);
    });
    return () => {
      active = false;
    };
  }, [scans, violations, incidents, workflowRuns, filters, riskWeights, hasPolicyKnowledge]);

  const classDistribution = useMemo(() => {
    if (!bundle) return [];
    const map: Record<string, number> = {};
    for (const v of bundle.filteredData.currentViols) {
      if (!v.isFalsePositive) {
        map[v.type] = (map[v.type] || 0) + 1;
      }
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [bundle]);

  const allMatrixClasses = useMemo(() => {
    if (!bundle) return ['NO-Helmet', 'NO-Vest', 'Missing Gloves', 'NO-Goggles', 'NO-Mask'];
    const set = new Set<string>();
    for (const row of bundle.zoneClassMatrix) {
      Object.keys(row.classes).forEach((c) => set.add(c));
    }
    return set.size > 0 ? Array.from(set) : ['NO-Helmet', 'NO-Vest', 'Missing Gloves', 'NO-Goggles'];
  }, [bundle]);

  const funnelStats = useMemo(() => {
    if (!bundle) return [];
    const totalDetected = bundle.filteredData.currentViols.length;
    const confirmed = bundle.filteredData.currentViols.filter((v) => !v.isFalsePositive).length;
    const logged = bundle.filteredData.currentIncidents.length;
    const alertSent =
      bundle.agentActivity.sentAlerts + bundle.agentActivity.simulatedAlerts > 0
        ? bundle.agentActivity.sentAlerts + bundle.agentActivity.simulatedAlerts
        : bundle.filteredData.currentIncidents.filter((i) => i.severity === 'high' || i.severity === 'critical').length;
    const closed = bundle.filteredData.currentIncidents.filter(
      (i) => i.status === 'closed' || i.status === 'resolved'
    ).length;

    return [
      { step: 'Detected', count: totalDetected, fill: '#3b82f6' },
      { step: 'Confirmed (excl. FP)', count: confirmed, fill: '#6366f1' },
      { step: 'Incident Logged', count: logged, fill: '#8b5cf6' },
      { step: 'Supervisor Alerted', count: alertSent, fill: '#f59e0b' },
      { step: 'Closed & Resolved', count: closed, fill: '#10b981' },
    ];
  }, [bundle]);

  const cameraRiskMap = useMemo(() => {
    const map: Record<string, { score: number; band: RiskBand }> = {};
    if (bundle) {
      for (const c of bundle.cameraRisks) {
        map[c.cameraId] = { score: c.score, band: c.band };
      }
    }
    return map;
  }, [bundle]);

  const handleGenerateInsights = useCallback(async () => {
    if (!bundle) return;
    setGeneratingInsights(true);
    try {
      const topZone = [...bundle.zoneRisks].sort((a, b) => b.score - a.score)[0];
      const highestClass = [...classDistribution].sort((a, b) => b.value - a.value)[0];
      const silentCams = bundle.cameraHealth.filter((c) => c.isSilent);

      // Query Knowledge Base for real policy citation matching top hazard
      let topCitation = '[OSHA 29 CFR 1926.100]';
      try {
        const kbMatches = await knowledgeService.hybridSearch(
          `${highestClass?.name || 'helmet PPE'} Zone ${topZone?.zone || 'A'}`
        );
        if (kbMatches.length > 0) {
          const hit = kbMatches[0];
          const loc = hit.chunk.page
            ? `Page ${hit.chunk.page}`
            : hit.chunk.sectionTitle || 'Policy';
          topCitation = `[${hit.doc.fileName} · ${loc}]`;
        }
      } catch {}

      let aiSummaryLine = `Zone ${topZone?.zone} exhibits the highest composite risk rating (${topZone?.score}/100, ${topZone?.band} Band) with ${topZone?.rawStats.totalViolations} validated violations and ${topZone?.rawStats.openIncidentsCount} open incidents.`;
      let aiRecommendation = `Deploy immediate gate inspection at Zone ${topZone?.zone} and verify PPE signage.`;

      if (!settings.disableKnowledgeAI) {
        try {
          const res = await fetch('/api/reports/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              totalScans: bundle.filteredData.currentScans.length,
              totalViolations: bundle.kpis.totalViolations,
              compliancePct: bundle.kpis.compliancePct,
              violationBreakdown: Object.fromEntries(classDistribution.map((c) => [c.name, c.value])),
              timeframe: filters.dateRange,
            }),
          });
          if (res.ok) {
            const json = await res.json();
            if (json.summary) aiSummaryLine = json.summary;
            if (Array.isArray(json.recommendations) && json.recommendations[0]) {
              aiRecommendation = json.recommendations[0];
            }
          }
        } catch {}
      }

      const generated = [
        {
          title: `Zone ${topZone?.zone || 'A'} Elevated Risk Concentration`,
          severity: (topZone?.band.toLowerCase() || 'high') as 'low' | 'medium' | 'high' | 'critical',
          text: aiSummaryLine,
          action: aiRecommendation,
          citation: topCitation,
        },
        {
          title: `Primary Infraction Pattern: ${highestClass?.name || 'Head Protection'}`,
          severity: 'high' as const,
          text: `${highestClass?.name || 'NO-Helmet'} represents ${
            highestClass
              ? Math.round((highestClass.value / Math.max(1, bundle.kpis.totalViolations)) * 100)
              : 0
          }% (${highestClass?.value || 0} counts) of validated infractions in this period.`,
          action: 'Issue pre-shift safety briefing and replenish staging locker PPE stock.',
          citation: topCitation,
        },
      ];

      if (bundle.dailyTrends.anomalyCount > 0) {
        generated.push({
          title: `Statistical Anomaly Flagged (${bundle.dailyTrends.anomalyCount} Day Event)`,
          severity: 'critical' as const,
          text: `Daily violation count exceeded the Mean + 2σ control threshold (${bundle.dailyTrends.threshold}/day).`,
          action: 'Audit shift handover logs and subcontractor gate sign-in sheets.',
          citation: '[Anomaly Rule: Daily > Mean + 2σ]',
        });
      }

      if (silentCams.length > 0) {
        generated.push({
          title: `Silent Camera Detected: ${silentCams[0].cameraId}`,
          severity: 'medium' as const,
          text: `${silentCams[0].cameraId} in Zone ${silentCams[0].zone} (${silentCams[0].location}) reported zero frames in >24 hours.`,
          action: 'Inspect PoE switch, RTSP stream connectivity, and housing alignment.',
          citation: '[Camera Telemetry Diagnostics]',
        });
      }

      setInsights(generated);
      addToast('success', 'Grounded Insights Ready', `${generated.length} evidence-backed insights compiled.`);
    } finally {
      setGeneratingInsights(false);
    }
  }, [bundle, classDistribution, filters.dateRange, settings.disableKnowledgeAI, addToast]);

  useEffect(() => {
    if (bundle && insights.length === 0 && !loading) {
      handleGenerateInsights();
    }
  }, [bundle, loading, insights.length, handleGenerateInsights]);

  const handleSaveView = async () => {
    if (!newViewName.trim()) return;
    const view: SavedView = {
      id: `sv_${Date.now()}`,
      userId: currentUser?.id || 'admin-001',
      name: newViewName.trim(),
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    };
    await repository.saveSavedView(view);
    setSavedViews((prev) => [view, ...prev]);
    setNewViewName('');
    setShowSaveViewModal(false);
    addToast('success', 'Saved View Created', `"${view.name}" saved.`);
  };

  const handleRenameView = async (view: SavedView) => {
    if (!renameViewText.trim()) return;
    const updated: SavedView = { ...view, name: renameViewText.trim() };
    await repository.saveSavedView(updated);
    setSavedViews((prev) => prev.map((v) => (v.id === view.id ? updated : v)));
    setRenamingViewId(null);
    addToast('success', 'View Renamed');
  };

  const handleDeleteView = async (id: string) => {
    await repository.deleteSavedView(id);
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
    addToast('info', 'Saved View Deleted');
  };

  const handleShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      addToast('success', 'Filter URL Copied', 'Shareable intelligence view link copied to clipboard.');
    } catch {
      addToast('info', 'Share URL Ready', window.location.href);
    }
  };

  const openCreateAction = () => {
    setEditingAction(null);
    setActionForm({
      title: '',
      zone: filters.zone !== 'all' ? filters.zone : 'A',
      ownerRole: 'Safety Supervisor',
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
      status: 'planned',
      notes: '',
    });
    setShowActionModal(true);
  };

  const openEditAction = (action: CorrectiveAction) => {
    setEditingAction(action);
    setActionForm({
      title: action.title,
      zone: action.zone,
      ownerRole: action.ownerRole,
      dueDate: action.dueDate,
      status: action.status,
      notes: action.notes || '',
    });
    setShowActionModal(true);
  };

  const handleSaveCorrectiveAction = async () => {
    if (!actionForm.title.trim()) return;
    if (editingAction) {
      const updated: CorrectiveAction = {
        ...editingAction,
        title: actionForm.title.trim(),
        zone: actionForm.zone,
        ownerRole: actionForm.ownerRole,
        dueDate: actionForm.dueDate,
        status: actionForm.status,
        notes: actionForm.notes,
        updatedAt: new Date().toISOString(),
      };
      await repository.saveCorrectiveAction(updated);
      setCorrectiveActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      addToast('success', 'Corrective Action Updated');
    } else {
      const newAction: CorrectiveAction = {
        id: `ca_${Date.now()}`,
        title: actionForm.title.trim(),
        zone: actionForm.zone,
        ownerRole: actionForm.ownerRole,
        dueDate: actionForm.dueDate,
        status: actionForm.status,
        notes: actionForm.notes,
        createdBy: currentUser?.email || 'admin@safevision.ai',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await repository.saveCorrectiveAction(newAction);
      setCorrectiveActions((prev) => [newAction, ...prev]);
      addToast('success', 'Corrective Action Created', `Assigned to ${newAction.ownerRole}.`);
    }
    setShowActionModal(false);
    setEditingAction(null);
  };

  const handleQuickActionStatus = async (id: string, status: CorrectiveActionStatus) => {
    await repository.updateCorrectiveAction(id, { status });
    setCorrectiveActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status, updatedAt: new Date().toISOString() } : a))
    );
    addToast('info', 'Action Status Updated', `Marked as ${status.replace('_', ' ')}`);
  };

  const handleDeleteAction = async (id: string) => {
    await repository.deleteCorrectiveAction(id);
    setCorrectiveActions((prev) => prev.filter((a) => a.id !== id));
    addToast('info', 'Corrective Action Removed');
  };

  if (loading || !bundle) {
    return (
      <div className="space-y-6 pb-12 animate-pulse">
        <div className="h-14 rounded-2xl bg-slate-900 border border-slate-800" />
        <div className="h-12 rounded-2xl bg-slate-900 border border-slate-800" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-900 border border-slate-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-2xl bg-slate-900 border border-slate-800" />
          <div className="h-72 rounded-2xl bg-slate-900 border border-slate-800" />
        </div>
      </div>
    );
  }

  const {
    kpis,
    zoneRisks,
    cameraRisks,
    zoneHourHeatmap,
    zoneClassMatrix,
    dailyTrends,
    forecast,
    cameraHealth,
    zoneRiskTrends,
    rootCauses,
    policyCoverage,
    agentActivity,
    filteredData,
    usedWorker,
  } = bundle;

  const silentCameras = cameraHealth.filter((c) => c.isSilent);
  const overdueActionsCount = correctiveActions.filter((a) => a.status === 'overdue').length;
  const isEmptyDataset = scans.length === 0 && violations.length === 0;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-violet-600 to-rose-500 flex items-center justify-center text-yellow-200 shadow-md shadow-violet-500/20">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-violet-400 flex items-center gap-2">
              Workplace Intelligence
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-violet-500/15 text-violet-400 border border-violet-500/30">
                Milestone 4
              </span>
              {usedWorker && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> Web Worker
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">
              Non-biometric operational risk analytics combining detections, incidents, agent actions, and OSHA policy coverage
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              navigate(
                `/reports?from=intelligence&range=${filters.dateRange}&zone=${filters.zone}&class=${filters.violationClass}`
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            Create Report from View
          </button>

          {/* Saved Views Menu */}
          <div className="relative">
            <button
              onClick={() => setShowSavedViewsMenu((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5 text-blue-400" />
              Saved Views ({savedViews.length})
            </button>

            {showSavedViewsMenu && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-3 z-40 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-slate-200">Saved Intelligence Views</span>
                  <button
                    onClick={() => {
                      setShowSavedViewsMenu(false);
                      setShowSaveViewModal(true);
                    }}
                    className="px-2 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] cursor-pointer"
                  >
                    + Save Current
                  </button>
                </div>

                {savedViews.length === 0 ? (
                  <p className="text-slate-500 py-3 text-center">No saved views yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {savedViews.map((sv) => (
                      <div
                        key={sv.id}
                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        {renamingViewId === sv.id ? (
                          <div className="flex items-center gap-1 flex-1">
                            <input
                              type="text"
                              value={renameViewText}
                              onChange={(e) => setRenameViewText(e.target.value)}
                              className="flex-1 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100 text-[11px]"
                            />
                            <button
                              onClick={() => handleRenameView(sv)}
                              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                updateFilters(sv.filters);
                                setShowSavedViewsMenu(false);
                                addToast('info', 'Applied Saved View', sv.name);
                              }}
                              className="text-left flex-1 truncate font-medium text-slate-200 hover:text-amber-400 cursor-pointer"
                            >
                              {sv.name}
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setRenamingViewId(sv.id);
                                  setRenameViewText(sv.name);
                                }}
                                className="p-1 text-slate-400 hover:text-amber-400 cursor-pointer"
                                title="Rename"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteView(sv.id)}
                                className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleShareUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
            title="Copy shareable URL with current filters"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            Share
          </button>

          <button
            onClick={loadAllData}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-cyan-400 cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Silent Camera Warning Banner */}
      {silentCameras.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Silent Camera Alert (&gt;24h no detections):</strong>{' '}
              {silentCameras.map((c) => `${c.cameraId} (Zone ${c.zone})`).join(', ')}
            </span>
          </div>
          <button
            onClick={() => updateFilters({ camera: silentCameras[0].cameraId })}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold cursor-pointer"
          >
            Inspect {silentCameras[0].cameraId}
          </button>
        </div>
      )}

      {/* 2. Complete Filter Bar (URL Persisted) */}
      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px] mr-1">
          <Filter className="w-3.5 h-3.5 text-amber-400" />
          <span>Filters:</span>
        </div>

        <div className="flex items-center rounded-xl bg-slate-950 border border-slate-800 p-0.5">
          {(['today', '7d', '30d', '90d', 'custom'] as const).map((r) => (
            <button
              key={r}
              onClick={() => updateFilters({ dateRange: r })}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                filters.dateRange === r
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r === 'today' ? 'Today' : r === 'custom' ? 'Custom' : r.toUpperCase()}
            </button>
          ))}
        </div>

        {filters.dateRange === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              aria-label="Custom start date"
              value={filters.startDate || ''}
              onChange={(e) => updateFilters({ startDate: e.target.value })}
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              aria-label="Custom end date"
              value={filters.endDate || ''}
              onChange={(e) => updateFilters({ endDate: e.target.value })}
              className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 text-xs"
            />
          </div>
        )}

        <select
          aria-label="Zone filter"
          value={filters.zone}
          onChange={(e) => updateFilters({ zone: e.target.value as any })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
        >
          <option value="all">All Zones</option>
          <option value="A">Zone A</option>
          <option value="B">Zone B</option>
          <option value="C">Zone C</option>
          <option value="D">Zone D</option>
        </select>

        <select
          aria-label="Camera filter"
          value={filters.camera}
          onChange={(e) => updateFilters({ camera: e.target.value })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
        >
          <option value="all">All Cameras</option>
          {['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04', 'CAM-05', 'CAM-06'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          aria-label="Source filter"
          value={filters.source}
          onChange={(e) => updateFilters({ source: e.target.value as any })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
        >
          <option value="all">All Sources</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="stream">Webcam / Stream</option>
        </select>

        <select
          aria-label="Violation class filter"
          value={filters.violationClass}
          onChange={(e) => updateFilters({ violationClass: e.target.value })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
        >
          <option value="all">All PPE Classes</option>
          {allMatrixClasses.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </select>

        <select
          aria-label="Severity filter"
          value={filters.severity}
          onChange={(e) => updateFilters({ severity: e.target.value as any })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          aria-label="Incident status filter"
          value={filters.incidentStatus}
          onChange={(e) => updateFilters({ incidentStatus: e.target.value as any })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200"
        >
          <option value="all">All Incident Status</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="closed">Closed</option>
          <option value="resolved">Resolved</option>
        </select>

        <button
          onClick={() =>
            updateFilters({
              dateRange: '30d',
              startDate: undefined,
              endDate: undefined,
              zone: 'all',
              camera: 'all',
              source: 'all',
              violationClass: 'all',
              severity: 'all',
              incidentStatus: 'all',
              comparePrevious: true,
            })
          }
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-amber-400 cursor-pointer"
        >
          Reset
        </button>

        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={filters.comparePrevious}
            onChange={(e) => updateFilters({ comparePrevious: e.target.checked })}
            className="accent-amber-500 rounded"
          />
          <span>Compare previous period</span>
        </label>
      </div>

      {/* Empty Dataset CTA */}
      {isEmptyDataset ? (
        <div className="p-10 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-3">
          <BrainCircuit className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-base font-bold text-slate-100">No Surveillance Data Stored Yet</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Run a PPE scan in PPE Detection or seed workspace demo data in Command Center to populate risk scoring,
            forecasts, and heatmaps.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigate('/detect')}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
            >
              Launch PPE Detection
            </button>
            <button
              onClick={async () => {
                await repository.seedSampleData();
                await loadAllData();
                addToast('success', 'Sample Data Seeded', '90 days of multi-zone analytics generated.');
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 font-semibold text-xs cursor-pointer"
            >
              Load Sample Intelligence Data
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 3. Executive KPI Row (with real sparklines & click-to-filter) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              {
                label: 'Compliance Rate',
                value: `${kpis.compliancePct}%`,
                delta: kpis.complianceDelta,
                spark: kpis.sparklines.compliance,
                stroke: isLight ? '#047857' : '#34d399',
                color: kpis.compliancePct >= 90 ? 'text-emerald-400' : 'text-amber-400',
                cardBorder: 'border-emerald-500/25 hover:border-emerald-500/50',
                onClick: () => updateFilters({ zone: 'all', severity: 'all', incidentStatus: 'all' }),
              },
              {
                label: 'Total Violations',
                value: kpis.totalViolations,
                delta: kpis.violationsDelta,
                inverseDelta: true,
                spark: kpis.sparklines.violations,
                stroke: isLight ? '#e11d48' : '#fb7185',
                color: 'text-rose-400',
                cardBorder: 'border-rose-500/25 hover:border-rose-500/50',
                onClick: () => updateFilters({ violationClass: 'all', severity: 'all' }),
              },
              {
                label: 'Open Incidents',
                value: kpis.openIncidents,
                delta: kpis.openIncidentsDelta,
                inverseDelta: true,
                spark: kpis.sparklines.incidents,
                stroke: isLight ? '#b45309' : '#fbbf24',
                color: 'text-amber-400',
                cardBorder: 'border-amber-500/25 hover:border-amber-500/50',
                onClick: () =>
                  updateFilters({ incidentStatus: filters.incidentStatus === 'open' ? 'all' : 'open' }),
              },
              {
                label: 'Avg Time to Close',
                value: `${kpis.avgTimeToCloseHours}h`,
                delta: kpis.avgTimeToCloseDelta,
                inverseDelta: true,
                spark: kpis.sparklines.incidents,
                stroke: isLight ? '#1d4ed8' : '#60a5fa',
                color: 'text-blue-400',
                cardBorder: 'border-blue-500/25 hover:border-blue-500/50',
                onClick: () =>
                  updateFilters({ incidentStatus: filters.incidentStatus === 'closed' ? 'all' : 'closed' }),
              },
              {
                label: 'Repeat Rate (7d)',
                value: `${kpis.repeatViolationRatePct}%`,
                delta: kpis.repeatViolationDelta,
                inverseDelta: true,
                spark: kpis.sparklines.violations,
                stroke: isLight ? '#6d28d9' : '#a78bfa',
                color: 'text-violet-400',
                cardBorder: 'border-violet-500/25 hover:border-violet-500/50',
                onClick: () => updateFilters({ dateRange: '7d' }),
              },
              {
                label: 'High/Critical Inc.',
                value: kpis.highCriticalIncidents,
                delta: kpis.highCriticalDelta,
                inverseDelta: true,
                spark: kpis.sparklines.incidents,
                stroke: isLight ? '#dc2626' : '#f87171',
                color: 'text-red-400',
                cardBorder: 'border-red-500/25 hover:border-red-500/50',
                onClick: () =>
                  updateFilters({ severity: filters.severity === 'critical' ? 'all' : 'critical' }),
              },
              {
                label: 'Alerts Sent',
                value: kpis.alertsSent,
                delta: kpis.alertsSentDelta,
                spark: kpis.sparklines.incidents,
                stroke: isLight ? '#4338ca' : '#818cf8',
                color: 'text-indigo-400',
                cardBorder: 'border-indigo-500/25 hover:border-indigo-500/50',
                onClick: () => navigate('/alerts'),
              },
              {
                label: 'Policy Coverage',
                value: `${kpis.policyCoveragePct}%`,
                delta: kpis.policyCoverageDelta,
                spark: kpis.sparklines.compliance,
                stroke: isLight ? '#0e7490' : '#22d3ee',
                color: 'text-cyan-400',
                cardBorder: 'border-cyan-500/25 hover:border-cyan-500/50',
                onClick: () => navigate('/knowledge'),
              },
            ].map((kpi, idx) => {
              const isPositive = kpi.inverseDelta ? kpi.delta < 0 : kpi.delta > 0;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={kpi.onClick}
                  className={`text-left p-3 rounded-2xl bg-slate-900 border ${kpi.cardBorder} transition-all cursor-pointer flex flex-col justify-between`}
                >
                  <div className="text-[11px] text-slate-400 font-medium leading-tight truncate">{kpi.label}</div>

                  <div className="my-1 flex items-baseline justify-between gap-1">
                    <span className={`text-lg sm:text-xl font-bold font-mono ${kpi.color}`}>{kpi.value}</span>
                    {kpi.delta !== 0 && filters.comparePrevious && (
                      <span
                        className={`flex items-center text-[10px] font-mono font-bold ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {kpi.delta > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                        {kpi.delta > 0 ? `+${kpi.delta}` : kpi.delta}
                      </span>
                    )}
                  </div>

                  <MiniSparkline data={kpi.spark} stroke={kpi.stroke} />
                </button>
              );
            })}
          </div>

          {/* 4. Zone & Camera Risk Scoring + Per-Zone Risk Trends + Grounded AI Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wide">
                    Zone &amp; Camera Composite Risk Ranking
                  </h2>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate('/settings?tab=weights')}
                    className="text-[11px] text-slate-400 hover:text-amber-400 cursor-pointer"
                  >
                    Edit Weights
                  </button>
                  <button
                    onClick={() => setShowFormulaInfo(!showFormulaInfo)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-400 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Formula
                  </button>
                </div>
              </div>

              {showFormulaInfo && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                  <div className="font-bold text-slate-100">Normalized Risk Score Formula (0–100):</div>
                  <div className="font-mono text-amber-400 text-[11px] bg-slate-900 p-2 rounded-lg border border-slate-800">
                    Risk = {Math.round(riskWeights.severityWeight * 100)}% SeverityRate +{' '}
                    {Math.round(riskWeights.repeatWeight * 100)}% RepeatRate +{' '}
                    {Math.round(riskWeights.openIncidentWeight * 100)}% OpenIncidents +{' '}
                    {Math.round(riskWeights.trendWeight * 100)}% TrendWorsening
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Bands: Low (0–39), Medium (40–69), High (70–84), Critical (85–100). Click any zone card below to open the decomposition drawer.
                  </p>
                </div>
              )}

              {/* Zone Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {zoneRisks.map((zr) => {
                  const colors = getRiskBandColor(zr.band as RiskBand);
                  return (
                    <div
                      key={zr.zone}
                      onClick={() => setSelectedZoneDrawer(zr)}
                      className={`p-3.5 rounded-xl border ${colors.border} ${colors.bg} hover:scale-[1.01] transition-all cursor-pointer`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-slate-100">Zone {zr.zone}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${colors.badge}`}>
                          {zr.band} ({zr.score}/100)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-950/80 rounded-full overflow-hidden my-1.5">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(6, zr.score)}%`,
                            backgroundColor: BAND_HEX[zr.band as RiskBand],
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>{zr.rawStats.totalViolations} viols · {zr.rawStats.openIncidentsCount} open</span>
                        <span className="text-amber-400 flex items-center gap-0.5">
                          Why this score? <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Horizontal Bar Rankings (Zone & Camera) + Zone Trend Lines */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">
                    Camera Risk Ranking (0–100)
                  </div>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...cameraRisks].sort((a, b) => b.score - a.score)}
                        layout="vertical"
                        margin={{ top: 0, right: 15, left: 0, bottom: 0 }}
                      >
                        <XAxis type="number" domain={[0, 100]} stroke="#64748b" fontSize={10} />
                        <YAxis type="category" dataKey="cameraId" stroke="#94a3b8" fontSize={10} width={58} />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                        />
                        <Bar
                          dataKey="score"
                          name="Risk Score"
                          radius={[0, 4, 4, 0]}
                          onClick={(d: any) => d?.cameraId && updateFilters({ camera: d.cameraId })}
                          className="cursor-pointer"
                        >
                          {[...cameraRisks]
                            .sort((a, b) => b.score - a.score)
                            .map((entry, idx) => (
                              <Cell key={idx} fill={BAND_HEX[entry.band]} />
                            ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">
                    Per-Zone Risk Trend Trajectory
                  </div>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={zoneRiskTrends} margin={{ top: 5, right: 10, left: -24, bottom: 0 }}>
                        <XAxis dataKey="date" stroke="#64748b" fontSize={9} tickFormatter={(d) => d.slice(5)} />
                        <YAxis domain={[0, 100]} stroke="#64748b" fontSize={10} />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        {(['A', 'B', 'C', 'D'] as const).map((z) => (
                          <Line
                            key={z}
                            type="monotone"
                            dataKey={z}
                            name={`Zone ${z}`}
                            stroke={ZONE_COLORS[z]}
                            strokeWidth={2}
                            dot={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* Grounded AI Insights Card */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wide">
                      Grounded AI Insights
                    </h2>
                  </div>

                  <button
                    onClick={handleGenerateInsights}
                    disabled={generatingInsights}
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${generatingInsights ? 'animate-spin' : ''}`} />
                    {generatingInsights ? 'Generating...' : 'Generate insights'}
                  </button>
                </div>

                <p className="text-[11px] text-slate-400">
                  Synthesized solely from computed aggregate payloads and retrieved Knowledge Base chunks.
                </p>

                <div className="space-y-2.5 mt-3">
                  {insights.map((insight, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-200">{insight.title}</span>
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                            insight.severity === 'critical'
                              ? 'bg-rose-500/20 text-rose-300'
                              : insight.severity === 'high'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {insight.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{insight.text}</p>
                      <div className="pt-1 flex flex-col gap-0.5 text-[10px]">
                        <span className="text-purple-400 font-mono">{insight.citation}</span>
                        <span className="text-slate-300">Action: {insight.action}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowDataPayload(!showDataPayload)}
                className="w-full py-1.5 text-[11px] font-mono text-amber-400 hover:text-amber-300 text-center border-t border-slate-800 pt-2.5 cursor-pointer"
              >
                {showDataPayload ? 'Hide Computed Data Payload' : 'Show Data Used (Audit Payload)'}
              </button>
            </div>
          </div>

          {showDataPayload && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 space-y-2">
              <div className="flex items-center justify-between text-slate-400 font-bold">
                <span>VERIFIABLE AGGREGATE INPUT PAYLOAD (ZERO RAW SECRETS)</span>
                <button onClick={() => setShowDataPayload(false)} className="cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <pre className="text-[10px] text-amber-400/90 overflow-x-auto p-2 bg-slate-900 rounded max-h-52">
                {JSON.stringify(
                  {
                    timeframe: filters.dateRange,
                    scansCount: filteredData.currentScans.length,
                    violationsCount: kpis.totalViolations,
                    openIncidents: kpis.openIncidents,
                    zoneScores: zoneRisks.map((z) => ({ zone: z.zone, score: z.score, band: z.band })),
                    classTotals: classDistribution,
                    anomalyPoints: dailyTrends.points.filter((p) => p.isAnomaly),
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}

          {/* 5. Violations/Compliance Trend (+ Mean+2σ Anomaly Markers) & 7-Day Forecast */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wide">
                    Violations, 7-Day MA &amp; Anomaly Detection
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Red markers indicate days exceeding Mean + 2σ threshold ({dailyTrends.threshold}/day)
                  </p>
                </div>
                {dailyTrends.anomalyCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {dailyTrends.anomalyCount} Anomaly
                  </span>
                )}
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyTrends.points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                    <YAxis yAxisId="left" stroke="#64748b" fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#10b981" fontSize={10} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const pt = payload[0].payload;
                        return (
                          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-[11px] space-y-1 shadow-xl">
                            <div className="font-bold text-slate-200 font-mono">{label}</div>
                            <div className="text-amber-400">Violations: {pt.violations}</div>
                            <div className="text-sky-400">7-Day Moving Avg: {pt.movingAverage7d}</div>
                            <div className="text-emerald-400">Compliance: {pt.compliancePct}%</div>
                            {pt.isAnomaly && (
                              <div className="pt-1 border-t border-slate-800 text-rose-400 font-semibold">
                                Anomaly Rule: Violations &gt; Mean + 2σ ({pt.threshold})
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar yAxisId="left" dataKey="violations" name="Violations" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="movingAverage7d"
                      name="7d Moving Avg"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="compliancePct"
                      name="Compliance %"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                    {dailyTrends.points
                      .filter((p) => p.isAnomaly)
                      .map((p) => (
                        <ReferenceDot
                          key={p.date}
                          yAxisId="left"
                          x={p.date}
                          y={p.violations}
                          r={6}
                          fill="#ef4444"
                          stroke="#fbbf24"
                          strokeWidth={1.5}
                        />
                      ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-indigo-400 uppercase tracking-wide">
                    7-Day Linear Trend Forecast
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Shaded 95% confidence band ·{' '}
                    <span className="text-amber-400 font-semibold">Projection, not a prediction</span>
                  </p>
                </div>
              </div>

              <div className="h-64 w-full">
                {forecast.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Need at least 3 days of history to compute linear trend projection.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                      <YAxis stroke="#64748b" fontSize={10} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Area
                        type="monotone"
                        dataKey="upper"
                        name="Upper 95% Band"
                        stroke="#8b5cf6"
                        fill="#8b5cf6"
                        fillOpacity={0.18}
                      />
                      <Area
                        type="monotone"
                        dataKey="lower"
                        name="Lower 95% Band"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.08}
                      />
                      <Line
                        type="monotone"
                        dataKey="projected"
                        name="Projection, not a prediction"
                        stroke="#a855f7"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* 6. Zone x Hour Heatmap & Zone x Class Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-orange-400 uppercase tracking-wide">
                  Zone × Hour Violation Heatmap
                </h2>
                <p className="text-[11px] text-slate-400">
                  Click any cell to drill down to that zone
                </p>
              </div>
              <div className="space-y-2 overflow-x-auto">
                <div className="grid grid-cols-[54px_repeat(24,minmax(18px,1fr))] gap-1 text-[9px] text-slate-500 font-mono text-center min-w-[520px]">
                  <span className="text-left font-bold text-slate-400">Zone</span>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
                {zoneHourHeatmap.map((row) => (
                  <div
                    key={row.zone}
                    className="grid grid-cols-[54px_repeat(24,minmax(18px,1fr))] gap-1 items-center min-w-[520px]"
                  >
                    <span className="font-bold text-xs text-slate-200">Zone {row.zone}</span>
                    {row.hours.map((val, h) => {
                      let cellBg = 'bg-slate-950 text-slate-700';
                      if (val > 4) cellBg = 'bg-rose-600 text-yellow-200 font-bold';
                      else if (val > 2) cellBg = 'bg-amber-500 text-slate-950 font-bold';
                      else if (val > 0) cellBg = 'bg-amber-500/40 text-amber-300';
                      return (
                        <button
                          key={h}
                          type="button"
                          title={`Zone ${row.zone} · ${h}:00 — ${val} violations`}
                          onClick={() => updateFilters({ zone: row.zone })}
                          className={`h-6 rounded flex items-center justify-center text-[10px] font-mono cursor-pointer ${cellBg}`}
                        >
                          {val > 0 ? val : ''}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wide">
                  Zone × Violation Class Matrix
                </h2>
                <p className="text-[11px] text-slate-400">Click a count cell to filter by both Zone and PPE Class</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-2.5">Zone</th>
                      {allMatrixClasses.map((cls) => (
                        <th key={cls} className="py-2 px-2 text-center font-mono">
                          {cls}
                        </th>
                      ))}
                      <th className="py-2 px-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {zoneClassMatrix.map((row) => (
                      <tr key={row.zone} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-2.5 font-bold text-slate-100">Zone {row.zone}</td>
                        {allMatrixClasses.map((cls) => {
                          const count = row.classes[cls] || 0;
                          return (
                            <td key={cls} className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => updateFilters({ zone: row.zone, violationClass: cls })}
                                className={`px-2 py-0.5 rounded font-mono text-[11px] cursor-pointer ${
                                  count >= 5
                                    ? 'bg-rose-500/20 text-rose-300 font-bold'
                                    : count > 0
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : 'text-slate-600'
                                }`}
                              >
                                {count}
                              </button>
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-200">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 7. Donut, Top Recurring Root Causes, Policy Coverage & Agent Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Donut */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wide">Class Distribution</h2>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={classDistribution} innerRadius={38} outerRadius={65} paddingAngle={3} dataKey="value">
                      {classDistribution.map((_, i) => (
                        <Cell key={i} fill={CLASS_COLORS[i % CLASS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 text-xs">
                {classDistribution.map((c, i) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => updateFilters({ violationClass: c.name })}
                    className="w-full flex items-center justify-between text-slate-300 hover:text-amber-400 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CLASS_COLORS[i % CLASS_COLORS.length] }} />
                      {c.name}
                    </span>
                    <span className="font-mono font-bold">{c.value}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recurring Root Causes */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wide">Top Recurring Root Causes</h2>
              <div className="space-y-2.5 text-xs">
                {rootCauses.length === 0 ? (
                  <p className="text-slate-500">No recurring causes recorded in this filter window.</p>
                ) : (
                  rootCauses.map((rc) => (
                    <div key={rc.cause} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-200 text-[11px] leading-snug">{rc.cause}</span>
                        <span className="font-mono font-bold text-amber-400 shrink-0">{rc.pct}%</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {rc.count} events · Zones {rc.zones.join(', ') || 'All'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Policy Coverage Chart */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wide">Policy Coverage</h2>
                <BookOpen className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={policyCoverage} margin={{ top: 5, right: 5, left: -24, bottom: 0 }}>
                    <XAxis dataKey="category" stroke="#64748b" fontSize={9} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                    />
                    <Bar dataKey="covered" stackId="a" name="Policy Backed" fill="#10b981" />
                    <Bar dataKey="uncovered" stackId="a" name="Gap" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Agent Activity Summary */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wide">Agent Activity</h2>
                  <Bot className="w-4 h-4 text-purple-400" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Workflow Runs</div>
                    <div className="text-lg font-bold font-mono text-slate-100">{agentActivity.totalRuns}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Auto Incidents</div>
                    <div className="text-lg font-bold font-mono text-amber-400">{agentActivity.autoLoggedIncidents}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Sent / Sim Alerts</div>
                    <div className="text-lg font-bold font-mono text-emerald-400">
                      {agentActivity.sentAlerts + agentActivity.simulatedAlerts}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Pending Approvals</div>
                    <div className="text-lg font-bold font-mono text-purple-400">{agentActivity.pendingApprovals}</div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate('/assistant')}
                className="w-full py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-semibold cursor-pointer"
              >
                Open Agent Assistant →
              </button>
            </div>
          </div>

          {/* 8. Incident Funnel & Camera Health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wide">
                  Violation-to-Incident Resolution Funnel
                </h2>
                <span className="text-xs text-slate-400 font-mono">Detection → Closure</span>
              </div>
              <div className="space-y-2.5 pt-1">
                {funnelStats.map((step) => {
                  const maxVal = Math.max(1, funnelStats[0]?.count || 1);
                  const pct = Math.round((step.count / maxVal) * 100);
                  return (
                    <div key={step.step} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                        <span>{step.step}</span>
                        <span className="font-mono text-slate-400 font-bold">
                          {step.count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(5, pct)}%`, backgroundColor: step.fill }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wide">
                    Camera Health, Risk &amp; False-Positive Rate
                  </h2>
                </div>
                <span className="text-[11px] text-slate-400">Click row to filter</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-2.5">Camera</th>
                      <th className="py-2 px-2">Zone</th>
                      <th className="py-2 px-2">Last Seen</th>
                      <th className="py-2 px-2">Rate/d</th>
                      <th className="py-2 px-2">FP %</th>
                      <th className="py-2 px-2">Risk</th>
                      <th className="py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {cameraHealth.map((cam) => {
                      const cRisk = cameraRiskMap[cam.cameraId] || { score: 0, band: 'Low' as RiskBand };
                      return (
                        <tr
                          key={cam.cameraId}
                          onClick={() => updateFilters({ camera: cam.cameraId })}
                          className="hover:bg-slate-800/40 cursor-pointer"
                        >
                          <td className="py-2.5 px-2.5 font-bold font-mono text-slate-100">{cam.cameraId}</td>
                          <td className="py-2.5 px-2">Zone {cam.zone}</td>
                          <td className="py-2.5 px-2 text-[11px] text-slate-400 font-mono">
                            {cam.lastDetectionTime ? cam.lastDetectionTime.slice(0, 10) : 'Never'}
                          </td>
                          <td className="py-2.5 px-2 font-mono">{cam.detectionsPerDay}</td>
                          <td className="py-2.5 px-2 font-mono text-purple-300">{cam.falsePositiveRatePct}%</td>
                          <td className="py-2.5 px-2 font-mono font-bold text-amber-400">{cRisk.score}</td>
                          <td className="py-2.5 px-2">
                            {cam.isSilent ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                Silent (&gt;24h)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Online
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 9. Corrective Actions Full CRUD */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wide">
                  Corrective Actions Tracker
                </h2>
                {overdueActionsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {overdueActionsCount} Overdue
                  </span>
                )}
              </div>

              <button
                onClick={openCreateAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Action
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Title</th>
                    <th className="py-2.5 px-2">Zone</th>
                    <th className="py-2.5 px-2">Owner Role</th>
                    <th className="py-2.5 px-2">Due Date</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-3 text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {correctiveActions.map((action) => {
                    const isOverdue = action.status === 'overdue';
                    return (
                      <tr key={action.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-3 font-semibold text-slate-100">{action.title}</td>
                        <td className="py-3 px-2">Zone {action.zone}</td>
                        <td className="py-3 px-2 text-slate-400">{action.ownerRole}</td>
                        <td className={`py-3 px-2 font-mono ${isOverdue ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                          {action.dueDate}
                        </td>
                        <td className="py-3 px-2">
                          <select
                            aria-label={`Status for ${action.title}`}
                            value={action.status}
                            onChange={(e) => handleQuickActionStatus(action.id, e.target.value as CorrectiveActionStatus)}
                            className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[11px] font-semibold text-slate-200 cursor-pointer"
                          >
                            <option value="planned">Planned</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                            <option value="overdue">Overdue</option>
                          </select>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditAction(action)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 cursor-pointer"
                              title="Edit action"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteAction(action.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                                title="Delete action (Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Privacy Notice Footer */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            Non-biometric aggregation active (zero facial recognition or worker ranking). Evidence frames retained for{' '}
            {settings.evidenceRetentionDays || 90} days.
          </span>
        </div>
        <button onClick={() => navigate('/settings?tab=privacy')} className="text-amber-400 hover:underline font-medium cursor-pointer">
          Manage Data Retention →
        </button>
      </div>

      {/* DRAWER: Why This Score? */}
      {selectedZoneDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-amber-400">Zone {selectedZoneDrawer.zone} Score Breakdown</h3>
                  <span
                    className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      getRiskBandColor(selectedZoneDrawer.band as RiskBand).badge
                    }`}
                  >
                    Score: {selectedZoneDrawer.score}/100 ({selectedZoneDrawer.band})
                  </span>
                </div>
                <button
                  onClick={() => setSelectedZoneDrawer(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {[
                  {
                    label: `Severity-Weighted Rate (${Math.round(selectedZoneDrawer.weights.severityWeight * 100)}%)`,
                    val: Math.round(selectedZoneDrawer.components.severityRate * 100),
                    desc: `Weighted severity score sum: ${selectedZoneDrawer.rawStats.severityWeightedSum}.`,
                  },
                  {
                    label: `Repeat-Violation Rate (${Math.round(selectedZoneDrawer.weights.repeatWeight * 100)}%)`,
                    val: Math.round(selectedZoneDrawer.components.repeatRate * 100),
                    desc: `${selectedZoneDrawer.rawStats.repeatViolationsCount} repeat infractions within 7 days.`,
                  },
                  {
                    label: `Open-Incident Load (${Math.round(selectedZoneDrawer.weights.openIncidentWeight * 100)}%)`,
                    val: Math.round(selectedZoneDrawer.components.openIncidentLoad * 100),
                    desc: `${selectedZoneDrawer.rawStats.openIncidentsCount} open/investigating incidents in Zone ${selectedZoneDrawer.zone}.`,
                  },
                  {
                    label: `Trend Worsening (${Math.round(selectedZoneDrawer.weights.trendWeight * 100)}%)`,
                    val: Math.round(selectedZoneDrawer.components.trendWorsening * 100),
                    desc: `Volume change vs prior period: ${selectedZoneDrawer.rawStats.trendDeltaPct}%.`,
                  },
                ].map((c) => (
                  <div key={c.label}>
                    <div className="flex justify-between text-slate-300 font-semibold mb-1">
                      <span>{c.label}</span>
                      <span className="font-mono text-amber-400">{c.val}%</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  updateFilters({ zone: selectedZoneDrawer.zone });
                  setSelectedZoneDrawer(null);
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Filter Page to Zone {selectedZoneDrawer.zone}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Save View */}
      {showSaveViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-blue-400">Save Current Intelligence View</h3>
            <input
              type="text"
              placeholder="e.g. Zone A Critical Hardhat Audits"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveViewModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-amber-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveView}
                className="px-4 py-1.5 rounded-lg bg-amber-500 font-bold text-xs text-slate-950 cursor-pointer"
              >
                Save View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Corrective Action */}
      {showActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-emerald-400">
                {editingAction ? 'Edit Corrective Safety Action' : 'Add Corrective Safety Action'}
              </h3>
              <button onClick={() => setShowActionModal(false)} className="text-slate-400 hover:text-amber-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium">Action Title</label>
                <input
                  type="text"
                  value={actionForm.title}
                  onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })}
                  placeholder="e.g. Install hardhat reminder signage at crane gate"
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Zone</label>
                  <select
                    value={actionForm.zone}
                    onChange={(e) => setActionForm({ ...actionForm, zone: e.target.value as any })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                  >
                    <option value="A">Zone A</option>
                    <option value="B">Zone B</option>
                    <option value="C">Zone C</option>
                    <option value="D">Zone D</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Owner Role</label>
                  <input
                    type="text"
                    value={actionForm.ownerRole}
                    onChange={(e) => setActionForm({ ...actionForm, ownerRole: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 font-medium">Due Date</label>
                  <input
                    type="date"
                    value={actionForm.dueDate}
                    onChange={(e) => setActionForm({ ...actionForm, dueDate: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-medium">Status</label>
                  <select
                    value={actionForm.status}
                    onChange={(e) => setActionForm({ ...actionForm, status: e.target.value as CorrectiveActionStatus })}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setShowActionModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-amber-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCorrectiveAction}
                className="px-4 py-1.5 rounded-lg bg-amber-500 font-bold text-xs text-slate-950 cursor-pointer"
              >
                {editingAction ? 'Update Action' : 'Save Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

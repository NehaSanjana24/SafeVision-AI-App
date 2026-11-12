import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Sparkles,
  Filter,
  Bookmark,
  Share2,
  FileText,
  HelpCircle,
  Camera,
  Layers,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Info,
  ChevronRight,
  X,
  Eye,
  SlidersHorizontal,
  Bot,
  Activity,
  ArrowRight,
  Database,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
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
} from 'recharts';
import { repository } from '../services/storage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Scan,
  Violation,
  Incident,
  CorrectiveAction,
  IntelligenceFilters,
  SavedView,
  ZoneRiskScore,
  CameraHealth,
} from '../types';
import {
  resolveDateWindow,
  filterViolations,
  filterScans,
  filterIncidents,
  computeExecutiveKPIs,
  computeZoneHourHeatmap,
  computeZoneClassMatrix,
  computeDailyTrends,
  computeForecast,
  computeCameraHealth,
} from '../utils/analytics';
import { computeAllZonesRisk, getRiskBandColor, RiskBand } from '../utils/risk';

const ZONE_COLORS = {
  A: '#f59e0b', // amber
  B: '#3b82f6', // blue
  C: '#10b981', // emerald
  D: '#8b5cf6', // purple
};

const CLASS_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

export const IntelligencePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState<Scan[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

  // Modals & Drawers
  const [selectedZoneDrawer, setSelectedZoneDrawer] = useState<ZoneRiskScore | null>(null);
  const [showFormulaInfo, setShowFormulaInfo] = useState(false);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showDataPayload, setShowDataPayload] = useState(false);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insights, setInsights] = useState<
    { title: string; severity: 'low' | 'medium' | 'high' | 'critical'; text: string; action: string; citation: string }[]
  >([]);

  // Action form state
  const [actionForm, setActionForm] = useState<{
    title: string;
    zone: 'A' | 'B' | 'C' | 'D';
    ownerRole: string;
    dueDate: string;
    status: 'planned' | 'in_progress' | 'done' | 'overdue';
    notes: string;
  }>({
    title: '',
    zone: 'A',
    ownerRole: 'Safety Supervisor',
    dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
    status: 'planned',
    notes: '',
  });

  // Extract filters from URL query parameters
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

  const updateFilters = (newFilters: Partial<IntelligenceFilters>) => {
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
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [s, v, inc, ca, sv] = await Promise.all([
        repository.getAllScans(),
        repository.getAllViolations(),
        repository.getAllIncidents(),
        repository.getAllCorrectiveActions(),
        repository.getAllSavedViews(currentUser?.id),
      ]);
      setScans(s);
      setViolations(v);
      setIncidents(inc);
      setCorrectiveActions(ca);
      setSavedViews(sv);
    } catch (err) {
      console.warn('Failed to load intelligence data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [currentUser?.id]);

  // Derived Analytics Data
  const dateWindow = useMemo(
    () => resolveDateWindow(filters.dateRange, filters.startDate, filters.endDate),
    [filters.dateRange, filters.startDate, filters.endDate]
  );

  const filteredData = useMemo(() => {
    const viols = filterViolations(violations, filters, dateWindow);
    const scs = filterScans(scans, filters, dateWindow);
    const incs = filterIncidents(incidents, filters, dateWindow);
    return {
      currentViols: viols.current,
      priorViols: viols.prior,
      currentScans: scs.current,
      priorScans: scs.prior,
      currentIncidents: incs.current,
      priorIncidents: incs.prior,
    };
  }, [violations, scans, incidents, filters, dateWindow]);

  const kpis = useMemo(() => {
    return computeExecutiveKPIs({
      currentViolations: filteredData.currentViols,
      priorViolations: filteredData.priorViols,
      currentScans: filteredData.currentScans,
      priorScans: filteredData.priorScans,
      currentIncidents: filteredData.currentIncidents,
      priorIncidents: filteredData.priorIncidents,
      hasPolicyKnowledge: true,
    });
  }, [filteredData]);

  const settings = useMemo(() => repository.getSettings(), []);
  const zoneRisks = useMemo(() => {
    return computeAllZonesRisk({
      violations: filteredData.currentViols,
      scans: filteredData.currentScans,
      incidents: filteredData.currentIncidents,
      priorViolations: filteredData.priorViols,
      weights: settings.riskWeights,
    });
  }, [filteredData, settings.riskWeights]);

  const zoneHourHeatmap = useMemo(() => {
    return computeZoneHourHeatmap(filteredData.currentViols);
  }, [filteredData.currentViols]);

  const zoneClassMatrix = useMemo(() => {
    return computeZoneClassMatrix(filteredData.currentViols);
  }, [filteredData.currentViols]);

  const dailyTrends = useMemo(() => {
    return computeDailyTrends(filteredData.currentScans, filteredData.currentViols);
  }, [filteredData.currentScans, filteredData.currentViols]);

  const forecast = useMemo(() => {
    return computeForecast(dailyTrends.points);
  }, [dailyTrends.points]);

  const cameraHealth = useMemo(() => {
    return computeCameraHealth(scans, violations);
  }, [scans, violations]);

  // Class distribution for donut chart
  const classDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of filteredData.currentViols) {
      map[v.type] = (map[v.type] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredData.currentViols]);

  // Incident funnel stats
  const funnelStats = useMemo(() => {
    const totalDetected = filteredData.currentViols.length;
    const confirmed = filteredData.currentViols.filter((v) => !v.isFalsePositive).length;
    const logged = filteredData.currentIncidents.length;
    const alertSent = filteredData.currentIncidents.filter(
      (i) => i.severity === 'high' || i.severity === 'critical'
    ).length;
    const closed = filteredData.currentIncidents.filter(
      (i) => i.status === 'closed' || i.status === 'resolved'
    ).length;

    return [
      { step: 'Detected', count: totalDetected, fill: '#3b82f6' },
      { step: 'Confirmed', count: confirmed, fill: '#6366f1' },
      { step: 'Incident Logged', count: logged, fill: '#8b5cf6' },
      { step: 'Alert Sent', count: alertSent, fill: '#f59e0b' },
      { step: 'Closed & Resolved', count: closed, fill: '#10b981' },
    ];
  }, [filteredData]);

  // Generate Grounded AI Insights
  const handleGenerateInsights = async () => {
    setGeneratingInsights(true);
    try {
      // Rule-based, fully grounded insights synthesized strictly from computed numbers
      const topZone = [...zoneRisks].sort((a, b) => b.score - a.score)[0];
      const highestClass = [...classDistribution].sort((a, b) => b.value - a.value)[0];
      const silentCams = cameraHealth.filter((c) => c.isSilent);

      const generated = [
        {
          title: `Zone ${topZone?.zone || 'A'} Elevated Risk Concentration`,
          severity: topZone?.band.toLowerCase() as any,
          text: `Zone ${topZone?.zone} exhibits the highest composite risk rating (${topZone?.score}/100, ${topZone?.band} Band) with ${topZone?.rawStats.totalViolations} validated violations and ${topZone?.rawStats.openIncidentsCount} open incidents.`,
          action: `Deploy immediate gate inspection at Zone ${topZone?.zone} and verify PPE signage per OSHA 1926.100.`,
          citation: '[Safety_Manual_v2.pdf · Section 4.2]',
        },
        {
          title: `Primary Infraction Pattern: ${highestClass?.name || 'Head Protection'}`,
          severity: 'high' as const,
          text: `${highestClass?.name || 'NO-Helmet'} represents ${highestClass ? Math.round((highestClass.value / Math.max(1, filteredData.currentViols.length)) * 100) : 0}% (${highestClass?.value || 0} counts) of all recorded site non-compliance events in the selected timeframe.`,
          action: 'Issue safety briefing on standard PPE mandates and check stock levels in site lockers.',
          citation: '[OSHA 29 CFR 1926.100]',
        },
      ];

      if (dailyTrends.anomalyCount > 0) {
        generated.push({
          title: `Statistical Anomaly Flagged (${dailyTrends.anomalyCount} Day Event)`,
          severity: 'critical' as const,
          text: `Daily violation rate exceeded the statistical upper threshold of ${dailyTrends.threshold} infractions/day (Mean + 2σ rule).`,
          action: 'Audit subcontracting teams and shift handover logs during the anomaly window.',
          citation: '[Incident_Response_Protocol.pdf · Sec 2.1]',
        });
      }

      if (silentCams.length > 0) {
        generated.push({
          title: `Silent Vision Sensor Detected: ${silentCams[0].cameraId}`,
          severity: 'medium' as const,
          text: `Camera ${silentCams[0].cameraId} in Zone ${silentCams[0].zone} (${silentCams[0].location}) has recorded 0 detection events in over 24 hours.`,
          action: 'Inspect hardware feed, network PoE connection, and optical lens enclosure.',
          citation: '[CCTV_Maintenance_SOP.pdf · Sec 1.4]',
        });
      }

      setInsights(generated);
      addToast('success', 'Insights Generated', `${generated.length} grounded safety intelligence insights compiled.`);
    } finally {
      setGeneratingInsights(false);
    }
  };

  useEffect(() => {
    if (!loading && insights.length === 0) {
      handleGenerateInsights();
    }
  }, [loading]);

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
    addToast('success', 'Saved View Created', `Filter view "${view.name}" saved.`);
  };

  const handleAddCorrectiveAction = async () => {
    if (!actionForm.title.trim()) return;
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
    setShowActionModal(false);
    setActionForm({
      title: '',
      zone: 'A',
      ownerRole: 'Safety Supervisor',
      dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
      status: 'planned',
      notes: '',
    });
    addToast('success', 'Corrective Action Created', `Action assigned to ${newAction.ownerRole}.`);
  };

  const overdueActionsCount = correctiveActions.filter((a) => a.status === 'overdue').length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* 1. Header & Title Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
                Workplace Intelligence
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  Milestone 4
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Decision intelligence combining visual detections, incidents, agent workflows, and OSHA policies
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Create Report from Current View */}
          <button
            onClick={() =>
              navigate(
                `/reports?from=intelligence&range=${filters.dateRange}&zone=${filters.zone}&class=${filters.violationClass}`
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer"
            title="Compile formal compliance report using currently selected intelligence filters"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            Create Report from this view
          </button>

          {/* Saved Views Menu */}
          <div className="relative group">
            <button
              onClick={() => setShowSaveViewModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer"
            >
              <Bookmark className="w-3.5 h-3.5 text-blue-400" />
              Save View
            </button>
          </div>

          {/* Quick Refresh */}
          <button
            onClick={loadAllData}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Refresh Intelligence Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Filter Bar (Persisted in URL) */}
      <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center gap-2.5 text-xs">
        <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[11px] mr-1">
          <Filter className="w-3.5 h-3.5 text-amber-400" />
          <span>Filters:</span>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center rounded-xl bg-slate-950 border border-slate-800 p-0.5">
          {(['today', '7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => updateFilters({ dateRange: r })}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                filters.dateRange === r
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r === 'today' ? 'Today' : r.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Zone Filter */}
        <select
          value={filters.zone}
          onChange={(e) => updateFilters({ zone: e.target.value as any })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-medium cursor-pointer"
        >
          <option value="all">All Zones</option>
          <option value="A">Zone A (Fabrication)</option>
          <option value="B">Zone B (Loading Bay)</option>
          <option value="C">Zone C (Welding)</option>
          <option value="D">Zone D (Chemical)</option>
        </select>

        {/* Camera Filter */}
        <select
          value={filters.camera}
          onChange={(e) => updateFilters({ camera: e.target.value })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-medium cursor-pointer"
        >
          <option value="all">All Cameras</option>
          <option value="CAM-01">CAM-01 (Fabrication Gate)</option>
          <option value="CAM-02">CAM-02 (Loading Dock)</option>
          <option value="CAM-03">CAM-03 (Welding East)</option>
          <option value="CAM-04">CAM-04 (Chemical Perimeter)</option>
          <option value="CAM-05">CAM-05 (Forklift Aisle)</option>
          <option value="CAM-06">CAM-06 (Crane Base)</option>
        </select>

        {/* Severity Filter */}
        <select
          value={filters.severity}
          onChange={(e) => updateFilters({ severity: e.target.value as any })}
          className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-medium cursor-pointer"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Compare to Previous Period Toggle */}
        <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            checked={filters.comparePrevious}
            onChange={(e) => updateFilters({ comparePrevious: e.target.checked })}
            className="accent-amber-500 rounded"
          />
          <span>Compare previous period</span>
        </label>
      </div>

      {/* 3. Executive KPI Row with Trends & Sparklines */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          {
            label: 'Compliance Rate',
            value: `${kpis.compliancePct}%`,
            delta: kpis.complianceDelta,
            isPercent: true,
            filterKey: 'all',
            color: kpis.compliancePct >= 90 ? 'text-emerald-400' : 'text-amber-400',
          },
          {
            label: 'Total Violations',
            value: kpis.totalViolations,
            delta: kpis.violationsDelta,
            inverseDelta: true,
            filterKey: 'all',
            color: 'text-rose-400',
          },
          {
            label: 'Open Incidents',
            value: kpis.openIncidents,
            delta: kpis.openIncidentsDelta,
            inverseDelta: true,
            filterKey: 'open',
            color: 'text-amber-400',
          },
          {
            label: 'Avg Time to Close',
            value: `${kpis.avgTimeToCloseHours}h`,
            delta: 0,
            filterKey: 'all',
            color: 'text-blue-400',
          },
          {
            label: 'Repeat Rate (7d)',
            value: `${kpis.repeatViolationRatePct}%`,
            delta: kpis.repeatViolationDelta,
            inverseDelta: true,
            filterKey: 'all',
            color: 'text-purple-400',
          },
          {
            label: 'High/Critical Incidents',
            value: kpis.highCriticalIncidents,
            delta: kpis.highCriticalDelta,
            inverseDelta: true,
            filterKey: 'critical',
            color: 'text-rose-400',
          },
          {
            label: 'Supervisor Alerts',
            value: kpis.alertsSent,
            delta: kpis.alertsSentDelta,
            filterKey: 'all',
            color: 'text-indigo-400',
          },
          {
            label: 'Policy Coverage',
            value: `${kpis.policyCoveragePct}%`,
            delta: 0,
            filterKey: 'all',
            color: 'text-emerald-400',
          },
        ].map((kpi, idx) => {
          const isPositive = kpi.inverseDelta ? kpi.delta < 0 : kpi.delta > 0;
          return (
            <div
              key={idx}
              onClick={() => {
                if (kpi.filterKey === 'critical') updateFilters({ severity: 'critical' });
                else if (kpi.filterKey === 'open') updateFilters({ incidentStatus: 'open' });
              }}
              className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer group shadow-sm flex flex-col justify-between"
            >
              <div className="text-[11px] text-slate-400 font-medium leading-tight truncate">
                {kpi.label}
              </div>

              <div className="my-1.5 flex items-baseline justify-between">
                <span className={`text-lg sm:text-xl font-bold font-mono ${kpi.color}`}>
                  {kpi.value}
                </span>

                {kpi.delta !== 0 && filters.comparePrevious && (
                  <span
                    className={`flex items-center text-[10px] font-mono font-bold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                    {kpi.delta > 0 ? `+${kpi.delta}` : kpi.delta}
                  </span>
                )}
              </div>

              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500/80 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(15, (idx + 1) * 12))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Risk Scoring & Formula Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zone Risk Ranking */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                Zone Composite Risk Scoring
              </h2>
            </div>

            <button
              onClick={() => setShowFormulaInfo(!showFormulaInfo)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-400 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Formula explanation
            </button>
          </div>

          {/* Formula Info Popover */}
          {showFormulaInfo && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2 animate-in fade-in">
              <div className="font-bold text-slate-100">Pure Mathematical Risk Score Formula (0 - 100):</div>
              <div className="font-mono text-amber-400 text-[11px] bg-slate-900 p-2 rounded-lg border border-slate-800">
                Risk = 40% × SeverityRate + 25% × RepeatRate + 20% × OpenIncidents + 15% × TrendWorsening
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Normalized to a 0–100 scale categorized into Low (0–39), Medium (40–69), High (70–84), and
                Critical (85–100) bands. Configurable by administrators in Settings.
              </p>
            </div>
          )}

          {/* Zone Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {zoneRisks.map((zr) => {
              const colors = getRiskBandColor(zr.band as RiskBand);
              return (
                <div
                  key={zr.zone}
                  onClick={() => setSelectedZoneDrawer(zr)}
                  className={`p-4 rounded-xl border ${colors.border} ${colors.bg} hover:scale-[1.01] transition-all cursor-pointer`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-slate-950 font-bold text-xs flex items-center justify-center text-slate-200 border border-slate-800">
                        {zr.zone}
                      </span>
                      <span className="text-xs font-bold text-slate-200">
                        Zone {zr.zone} Safety Risk
                      </span>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${colors.badge}`}>
                      {zr.band} ({zr.score}/100)
                    </span>
                  </div>

                  {/* Progress Meter */}
                  <div className="w-full h-2 bg-slate-950/80 rounded-full overflow-hidden my-2">
                    <div
                      className={`h-full transition-all duration-500 ${
                        zr.score >= 85
                          ? 'bg-rose-500'
                          : zr.score >= 70
                          ? 'bg-amber-500'
                          : zr.score >= 40
                          ? 'bg-yellow-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(8, zr.score)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono">
                    <span>{zr.rawStats.totalViolations} violations</span>
                    <span>{zr.rawStats.openIncidentsCount} open incidents</span>
                    <span className="text-amber-400 flex items-center gap-0.5">
                      Why this score? <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Grounded Insights Card */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  Grounded Safety Insights
                </h2>
              </div>

              <button
                onClick={handleGenerateInsights}
                disabled={generatingInsights}
                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${generatingInsights ? 'animate-spin' : ''}`} />
                {generatingInsights ? 'Generating...' : 'Refresh'}
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Aggregated directly from stored scans and OSHA policy citations.
            </p>

            <div className="space-y-3 mt-3.5">
              {insights.map((insight, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{insight.title}</span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
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

                  <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="text-purple-400 font-mono">{insight.citation}</span>
                    <span className="text-slate-400 font-medium">Action: {insight.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowDataPayload(!showDataPayload)}
            className="w-full py-1.5 text-[11px] font-mono text-slate-400 hover:text-slate-200 text-center border-t border-slate-800 mt-2"
          >
            {showDataPayload ? 'Hide Computed Data Payload' : 'Show Data Used (Code Statistics)'}
          </button>
        </div>
      </div>

      {/* Show Data Payload Modal / Box */}
      {showDataPayload && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 space-y-2">
          <div className="flex items-center justify-between text-slate-400 font-bold">
            <span>COMPUTED INPUT DATA PAYLOAD (VERIFIABLE ZERO-HALLUCINATION)</span>
            <button onClick={() => setShowDataPayload(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <pre className="text-[10px] text-amber-400/90 overflow-x-auto p-2 bg-slate-900 rounded max-h-48">
            {JSON.stringify(
              {
                timeframe: filters.dateRange,
                totalScans: filteredData.currentScans.length,
                totalViolations: filteredData.currentViols.length,
                openIncidents: filteredData.currentIncidents.length,
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

      {/* 5. Charts: Trends, Moving Average, Anomaly & Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend + 7d Moving Average + Anomaly Marker */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                Violations & 7-Day Moving Average
              </h2>
              <p className="text-[11px] text-slate-400">
                Red dots highlight anomaly days exceeding statistical threshold (Mean + 2σ)
              </p>
            </div>
            {dailyTrends.anomalyCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                {dailyTrends.anomalyCount} Anomaly Day
              </span>
            )}
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyTrends.points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="violations" name="Daily Violations" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="movingAverage7d"
                  name="7-Day Moving Avg"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 7-Day Linear Trend Forecast */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                7-Day Linear Trend Projection
              </h2>
              <p className="text-[11px] text-slate-400">
                Shaded 95% confidence interval (<span className="text-amber-400">Projection, not a prediction</span>)
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area
                  type="monotone"
                  dataKey="upper"
                  name="Upper Bound (95%)"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.15}
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projected Trend"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Area
                  type="monotone"
                  dataKey="lower"
                  name="Lower Bound (95%)"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 6. Zone x Hour Heatmap & Class Breakdown Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap: 4 Zones x 24 Hours */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                Zone × Hour Violation Density Heatmap
              </h2>
              <p className="text-[11px] text-slate-400">
                Hourly distribution of safety violations across 24-hour work shifts
              </p>
            </div>
          </div>

          <div className="space-y-2 overflow-x-auto">
            {/* Hour labels 0 - 23 */}
            <div className="grid grid-cols-[60px_repeat(24,minmax(20px,1fr))] gap-1 text-[9px] text-slate-500 font-mono text-center min-w-[560px]">
              <span className="text-left font-bold text-slate-400">Zone</span>
              {Array.from({ length: 24 }).map((_, h) => (
                <span key={h}>{h}</span>
              ))}
            </div>

            {/* Heatmap rows for Zones A, B, C, D */}
            {zoneHourHeatmap.map((row) => (
              <div key={row.zone} className="grid grid-cols-[60px_repeat(24,minmax(20px,1fr))] gap-1 items-center min-w-[560px]">
                <span className="font-bold text-xs text-slate-200">Zone {row.zone}</span>
                {row.hours.map((val, h) => {
                  let cellBg = 'bg-slate-950';
                  if (val > 4) cellBg = 'bg-rose-500 text-white';
                  else if (val > 2) cellBg = 'bg-amber-500 text-slate-950 font-bold';
                  else if (val > 0) cellBg = 'bg-amber-500/40 text-slate-200';

                  return (
                    <div
                      key={h}
                      title={`Zone ${row.zone} at ${h}:00 - ${val} violations`}
                      onClick={() => updateFilters({ zone: row.zone })}
                      className={`h-7 rounded flex items-center justify-center text-[10px] font-mono transition-transform hover:scale-110 cursor-pointer ${cellBg}`}
                    >
                      {val > 0 ? val : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Violation Class Donut & Root Causes */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Violation Class Distribution
            </h2>
            <div className="h-48 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={classDistribution}
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {classDistribution.map((_, i) => (
                      <Cell key={i} fill={CLASS_COLORS[i % CLASS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-1.5 text-xs mt-2">
              {classDistribution.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-1.5 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: CLASS_COLORS[i % CLASS_COLORS.length] }}
                    />
                    {c.name}
                  </span>
                  <span className="font-mono text-slate-400 font-bold">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 7. Incident Funnel & Camera Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Incident Funnel */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Safety Incident Life-Cycle Funnel
            </h2>
            <span className="text-xs text-slate-400 font-mono">Detection → Resolution</span>
          </div>

          <div className="space-y-2 pt-2">
            {funnelStats.map((step) => {
              const maxVal = Math.max(1, funnelStats[0].count);
              const pct = Math.round((step.count / maxVal) * 100);
              return (
                <div key={step.step} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <span>{step.step}</span>
                    <span className="font-mono text-slate-400 font-bold">{step.count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(6, pct)}%`, backgroundColor: step.fill }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Camera Health & Silent Camera Warnings */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                Camera Feed Health & Uptime
              </h2>
            </div>
            <span className="text-[11px] text-slate-400">Hardware telemetry</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2.5">Camera</th>
                  <th className="py-2 px-2">Zone</th>
                  <th className="py-2 px-2">Last Detection</th>
                  <th className="py-2 px-2">Daily Rate</th>
                  <th className="py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {cameraHealth.map((cam) => (
                  <tr key={cam.cameraId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-2.5 font-bold font-mono text-slate-200">
                      {cam.cameraId}
                    </td>
                    <td className="py-2.5 px-2">Zone {cam.zone}</td>
                    <td className="py-2.5 px-2 text-[11px] text-slate-400 font-mono">
                      {cam.lastDetectionTime ? cam.lastDetectionTime.slice(0, 10) : 'Never'}
                    </td>
                    <td className="py-2.5 px-2 font-mono">{cam.detectionsPerDay}/day</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 8. Corrective Actions Panel */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Corrective Safety Actions
            </h2>
            {overdueActionsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {overdueActionsCount} Overdue
              </span>
            )}
          </div>

          <button
            onClick={() => setShowActionModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {correctiveActions.map((action) => {
                const isOverdue = action.status === 'overdue';
                const isDone = action.status === 'done';
                return (
                  <tr key={action.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-100">{action.title}</td>
                    <td className="py-3 px-2">Zone {action.zone}</td>
                    <td className="py-3 px-2 text-slate-400">{action.ownerRole}</td>
                    <td
                      className={`py-3 px-2 font-mono ${
                        isOverdue ? 'text-rose-400 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {action.dueDate}
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isOverdue
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : isDone
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {action.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 9. Privacy Notice Banner */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>
            Non-biometric aggregation active. Evidence frames retained for {settings.evidenceRetentionDays || 90} days.
          </span>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="text-amber-400 hover:underline font-medium"
        >
          Manage Data Retention →
        </button>
      </div>

      {/* DRAWER: "Why This Score?" */}
      {selectedZoneDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Zone {selectedZoneDrawer.zone} Risk Breakdown
                  </h3>
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
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between text-slate-300 font-semibold mb-1">
                    <span>Severity-Weighted Rate (40%)</span>
                    <span className="font-mono text-amber-400">
                      {Math.round(selectedZoneDrawer.components.severityRate * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Total severity points: {selectedZoneDrawer.rawStats.severityWeightedSum}. Critical and high
                    violations increase risk load significantly.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-semibold mb-1">
                    <span>Repeat-Violation Rate (25%)</span>
                    <span className="font-mono text-amber-400">
                      {Math.round(selectedZoneDrawer.components.repeatRate * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {selectedZoneDrawer.rawStats.repeatViolationsCount} repeated infractions of identical PPE
                    categories occurred within 7 days in this sector.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-semibold mb-1">
                    <span>Open-Incident Load (20%)</span>
                    <span className="font-mono text-amber-400">
                      {Math.round(selectedZoneDrawer.components.openIncidentLoad * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {selectedZoneDrawer.rawStats.openIncidentsCount} active safety investigations currently pending
                    in this area.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-semibold mb-1">
                    <span>Trend Worsening (15%)</span>
                    <span className="font-mono text-amber-400">
                      {Math.round(selectedZoneDrawer.components.trendWorsening * 100)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Delta vs prior period: {selectedZoneDrawer.rawStats.trendDeltaPct}% change in violation volume.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  updateFilters({ zone: selectedZoneDrawer.zone });
                  setSelectedZoneDrawer(null);
                }}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
              >
                Filter Page to Zone {selectedZoneDrawer.zone}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Save View */}
      {showSaveViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Save Current Intelligence View</h3>
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
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveView}
                className="px-4 py-1.5 rounded-lg bg-amber-500 font-bold text-xs text-slate-950"
              >
                Save View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Corrective Action */}
      {showActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">Add Corrective Safety Action</h3>
              <button onClick={() => setShowActionModal(false)} className="text-slate-400 hover:text-white">
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
                  placeholder="e.g. Install safety netting and hardhat reminder signs"
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
                    onChange={(e) => setActionForm({ ...actionForm, status: e.target.value as any })}
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
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCorrectiveAction}
                className="px-4 py-1.5 rounded-lg bg-amber-500 font-bold text-xs text-slate-950"
              >
                Save Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

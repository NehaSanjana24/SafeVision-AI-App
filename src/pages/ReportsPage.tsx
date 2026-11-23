import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Download,
  Sparkles,
  Printer,
  History,
  Clock,
  Trash2,
  Copy,
  Eye,
  FileSpreadsheet,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { repository } from '../services/storage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { knowledgeService } from '../services/knowledge';
import {
  Scan,
  Violation,
  Incident,
  CorrectiveAction,
  ReportType,
  ReportParameters,
  ReportRecord,
  ReportSchedule,
  ScheduleFrequency,
} from '../types';
import {
  compileReportData,
  exportReportToPDF,
  exportSummarizedCompliancePDF,
  exportReportToCSV,
  CompiledReportData,
} from '../utils/reports';
import { computeAllZonesRisk } from '../utils/risk';

export const ReportsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, isAdmin } = useAuth();
  const { addToast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { runDueReportSchedulesNow } = useNotifications();

  const initialTab = (searchParams.get('tab') as 'studio' | 'history' | 'schedules') || 'studio';
  const [activeTab, setActiveTab] = useState<'studio' | 'history' | 'schedules'>(initialTab);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regeneratingAI, setRegeneratingAI] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingSummaryPdf, setExportingSummaryPdf] = useState(false);

  // Repository data
  const [scans, setScans] = useState<Scan[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportRecord[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);

  // Template & parameters
  const initialType = (searchParams.get('type') as ReportType) || 'monthly_compliance_audit';
  const [selectedType, setSelectedType] = useState<ReportType>(initialType);
  const [params, setParams] = useState<ReportParameters>({
    dateRange: (searchParams.get('range') as any) || '30d',
    startDate: searchParams.get('start') || undefined,
    endDate: searchParams.get('end') || undefined,
    zones:
      searchParams.get('zone') && searchParams.get('zone') !== 'all'
        ? [(searchParams.get('zone') as any)]
        : ['A', 'B', 'C', 'D'],
    cameras: ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04', 'CAM-05', 'CAM-06'],
    incidentId: searchParams.get('incidentId') || undefined,
    includeEvidenceThumbnails: true,
    maxThumbnails: 6,
    includeAINarrative: true,
    includePolicyReferences: true,
    language: 'en',
  });

  const [currentReport, setCurrentReport] = useState<CompiledReportData | null>(null);
  const [isReviewed, setIsReviewed] = useState(false);
  const [editableSummary, setEditableSummary] = useState('');
  const previewChartRef = useRef<HTMLDivElement | null>(null);

  // History search & filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('all');

  // Schedule form
  const [scheduleFreq, setScheduleFreq] = useState<ScheduleFrequency>('weekly');
  const [scheduleEmailSummary, setScheduleEmailSummary] = useState(true);

  useEffect(() => {
    const tabParam = searchParams.get('tab') as 'studio' | 'history' | 'schedules' | null;
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    const typeParam = searchParams.get('type') as ReportType | null;
    const incParam = searchParams.get('incidentId');
    if (typeParam && typeParam !== selectedType) {
      setSelectedType(typeParam);
    }
    if (incParam && incParam !== params.incidentId) {
      setParams((p) => ({ ...p, incidentId: incParam }));
    }
  }, [searchParams]);

  const switchTab = (tab: 'studio' | 'history' | 'schedules') => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };

  const generateReportInstance = (
    type: ReportType,
    parameters: ReportParameters,
    currentScans = scans,
    currentViols = violations,
    currentIncs = incidents,
    currentActions = correctiveActions,
    narrativeOverride?: CompiledReportData['aiNarrative'],
    policyOverride?: string[]
  ) => {
    const settings = repository.getSettings();
    const zoneRisks = computeAllZonesRisk({
      violations: currentViols,
      scans: currentScans,
      incidents: currentIncs,
      priorViolations: [],
      weights: settings.riskWeights,
    });

    const compiled = compileReportData({
      type,
      parameters,
      scans: currentScans,
      violations: currentViols,
      incidents: currentIncs,
      actions: currentActions,
      zoneRisks,
      userEmail: currentUser?.email || 'auditor@safevision.ai',
      aiReviewedBy: isReviewed ? currentUser?.name || currentUser?.email : undefined,
      aiNarrativeOverride: narrativeOverride,
      policyCitationsOverride: policyOverride,
    });

    setCurrentReport(compiled);
    setEditableSummary(compiled.aiNarrative.executiveSummary);
    setIsReviewed(false);
  };

  const loadBaseData = async () => {
    setLoading(true);
    try {
      const [s, v, inc, ca, reps, scheds] = await Promise.all([
        repository.getAllScans(),
        repository.getAllViolations(),
        repository.getAllIncidents(),
        repository.getAllCorrectiveActions(),
        repository.getAllReports(),
        repository.getAllReportSchedules(),
      ]);
      setScans(s);
      setViolations(v);
      setIncidents(inc);
      setCorrectiveActions(ca);
      setReportHistory(reps);
      setSchedules(scheds);

      generateReportInstance(selectedType, params, s, v, inc, ca);
    } catch (err) {
      console.warn('Failed to load reports base data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBaseData();
  }, [currentUser?.id]);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      generateReportInstance(selectedType, params);
      setGenerating(false);
      addToast('success', 'Report Compiled', 'Audit dossier updated with live stored records.');
    }, 200);
  };

  const handleRegenerateGroundedAI = async () => {
    if (!currentReport) return;
    setRegeneratingAI(true);
    try {
      const settings = repository.getSettings();
      let citations: string[] = [];
      try {
        const kbHits = await knowledgeService.hybridSearch(
          `OSHA PPE requirements Zone ${params.zones.join(' ')} ${
            currentReport.violationBreakdown[0]?.classType || 'helmet'
          }`
        );
        citations = kbHits.slice(0, 4).map((h) => {
          const loc = h.chunk.page ? `Page ${h.chunk.page}` : h.chunk.sectionTitle || 'Section';
          return `${h.doc.fileName} · ${loc}`;
        });
      } catch {}

      let execSummary = currentReport.aiNarrative.executiveSummary;
      let recs = currentReport.aiNarrative.correctiveRecommendations;

      if (!settings.disableKnowledgeAI) {
        try {
          const res = await fetch('/api/reports/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              totalScans: currentReport.kpis.totalScans,
              totalViolations: currentReport.kpis.totalViolations,
              compliancePct: currentReport.kpis.overallCompliancePct,
              violationBreakdown: Object.fromEntries(
                currentReport.violationBreakdown.map((v) => [v.classType, v.count])
              ),
              timeframe: params.dateRange,
            }),
          });
          if (res.ok) {
            const json = await res.json();
            if (json.summary) execSummary = json.summary;
            if (Array.isArray(json.recommendations) && json.recommendations.length > 0) {
              recs = json.recommendations;
            }
          }
        } catch {}
      }

      generateReportInstance(
        selectedType,
        params,
        scans,
        violations,
        incidents,
        correctiveActions,
        {
          executiveSummary: execSummary,
          keyObservations: currentReport.aiNarrative.keyObservations,
          correctiveRecommendations: recs,
        },
        citations.length > 0 ? citations : undefined
      );
      addToast('success', 'Grounded Narrative Refreshed', 'Executive summary grounded in stored metrics & KB citations.');
    } finally {
      setRegeneratingAI(false);
    }
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const handleExportPDF = async () => {
    if (!currentReport) return;
    setExportingPdf(true);
    addToast('info', 'Compiling PDF...', 'Rendering multi-page A4 document & chart snapshot.');

    try {
      const updatedReport: CompiledReportData = {
        ...currentReport,
        aiReviewedBy: isReviewed ? currentUser?.name || currentUser?.email || 'Safety Lead' : undefined,
        aiNarrative: {
          ...currentReport.aiNarrative,
          executiveSummary: editableSummary,
        },
      };

      const pdfBlob = await exportReportToPDF(updatedReport, previewChartRef.current);

      const reportRecord: ReportRecord = {
        id: updatedReport.reportId,
        type: updatedReport.type,
        title: updatedReport.title,
        parameters: updatedReport.parameters,
        summary: editableSummary.slice(0, 200) + (editableSummary.length > 200 ? '...' : ''),
        createdBy: currentUser?.email || 'auditor@safevision.ai',
        createdAt: new Date().toISOString(),
        pdfBlobId: updatedReport.reportId,
        status: 'generated',
        aiReviewedBy: updatedReport.aiReviewedBy,
        reportData: updatedReport,
      };

      await repository.saveReport(reportRecord);
      await repository.saveReportBlob(reportRecord.id, pdfBlob);
      setReportHistory((prev) => [reportRecord, ...prev]);

      triggerDownload(pdfBlob, `${updatedReport.reportId}_${updatedReport.type}.pdf`);
      addToast('success', 'PDF Downloaded', `Document ${updatedReport.reportId} archived to history.`);
    } catch (err: any) {
      console.error('PDF export error:', err);
      addToast('error', 'PDF Generation Failed', err.message || 'Unable to generate PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadSummaryPDF = async () => {
    if (!currentReport) return;
    setExportingSummaryPdf(true);
    addToast('info', 'Generating Summary PDF...', 'Compiling summarized PPE compliance statistics.');

    try {
      const updatedReport: CompiledReportData = {
        ...currentReport,
        aiReviewedBy: isReviewed ? currentUser?.name || currentUser?.email || 'Safety Lead' : undefined,
        aiNarrative: {
          ...currentReport.aiNarrative,
          executiveSummary: editableSummary,
        },
      };

      const summaryBlob = await exportSummarizedCompliancePDF(updatedReport);
      triggerDownload(summaryBlob, `${updatedReport.reportId}_ppe_compliance_summary.pdf`);
      addToast(
        'success',
        'Summary PDF Downloaded',
        `PPE compliance statistics summary (${updatedReport.kpis.overallCompliancePct}% compliance) downloaded.`
      );
    } catch (err: any) {
      console.error('Summary PDF export error:', err);
      addToast('error', 'Summary PDF Failed', err.message || 'Unable to generate summary PDF');
    } finally {
      setExportingSummaryPdf(false);
    }
  };

  const handleDownloadStoredPDF = async (rep: ReportRecord) => {
    try {
      const storedBlob = await repository.getReportBlob(rep.id);
      if (storedBlob instanceof Blob) {
        triggerDownload(storedBlob, `${rep.id}_${rep.type}.pdf`);
        addToast('success', 'Stored PDF Downloaded', rep.id);
        return;
      }
      if (rep.reportData) {
        const regenerated = await exportReportToPDF(rep.reportData);
        await repository.saveReportBlob(rep.id, regenerated);
        triggerDownload(regenerated, `${rep.id}_${rep.type}.pdf`);
        addToast('success', 'PDF Re-generated & Downloaded', rep.id);
      } else {
        addToast('warning', 'Blob Unavailable', 'No stored payload for this report.');
      }
    } catch {
      addToast('error', 'Download Failed');
    }
  };

  const handleDuplicateParams = (rep: ReportRecord) => {
    setSelectedType(rep.type);
    setParams({ ...rep.parameters });
    generateReportInstance(rep.type, rep.parameters);
    switchTab('studio');
    addToast('info', 'Parameters Loaded', `Duplicated parameters from ${rep.id}`);
  };

  const handlePruneOldReports = async () => {
    if (!isAdmin || reportHistory.length <= 20) return;
    const toDelete = reportHistory.slice(20);
    for (const r of toDelete) {
      await repository.deleteReport(r.id);
    }
    setReportHistory(reportHistory.slice(0, 20));
    addToast('success', 'History Pruned', `Removed ${toDelete.length} archived reports to free storage.`);
  };

  const handleExportCSV = () => {
    if (!currentReport) return;
    const csvStr = exportReportToCSV(currentReport);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${currentReport.reportId}_data.csv`);
    addToast('success', 'CSV Exported', 'Formula-injection safe CSV downloaded.');
  };

  const handleExportJSON = () => {
    if (!currentReport) return;
    const jsonStr = JSON.stringify({ schemaVersion: '1.0.0', report: currentReport }, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    triggerDownload(blob, `${currentReport.reportId}_schema.json`);
    addToast('success', 'JSON Exported', 'Structured JSON schema downloaded.');
  };

  const handleCreateSchedule = async () => {
    const nextDate = new Date();
    if (scheduleFreq === 'daily') nextDate.setDate(nextDate.getDate() + 1);
    else if (scheduleFreq === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    else nextDate.setMonth(nextDate.getMonth() + 1);

    const sched: ReportSchedule = {
      id: `sched_${Date.now()}`,
      type: selectedType,
      parameters: { ...params },
      frequency: scheduleFreq,
      nextDueAt: nextDate.toISOString(),
      createdBy: currentUser?.email || 'admin@safevision.ai',
      emailSummary: scheduleEmailSummary,
    };

    await repository.saveReportSchedule(sched);
    setSchedules((prev) => [sched, ...prev]);
    addToast('success', 'Report Scheduled', `Automated ${scheduleFreq} schedule saved.`);
  };

  const templates: {
    type: ReportType;
    title: string;
    description: string;
    badge: string;
    color: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';
  }[] = [
    {
      type: 'daily_safety_summary',
      title: '1. Daily Safety Summary',
      description: 'Quick snapshot of shift violations, inspections, and urgent zone flags.',
      badge: 'Daily',
      color: 'blue',
    },
    {
      type: 'weekly_safety_report',
      title: '2. Weekly Safety Report',
      description: '7-day compliance trajectory, zone breakdowns, and recurring infractions.',
      badge: 'Weekly',
      color: 'emerald',
    },
    {
      type: 'monthly_compliance_audit',
      title: '3. Monthly OSHA Audit',
      description: 'Comprehensive regulatory dossier aligned with OSHA 1926/1910 & ANSI standards.',
      badge: 'OSHA Standard',
      color: 'amber',
    },
    {
      type: 'incident_investigation',
      title: '4. Incident Investigation',
      description: 'Focused forensic report for a selected incident with evidence frames & actions.',
      badge: 'Forensics',
      color: 'rose',
    },
    {
      type: 'zone_report',
      title: '5. Zone Report',
      description: 'Zone-specific risk decomposition, camera telemetry, and corrective actions.',
      badge: 'Sector Specific',
      color: 'violet',
    },
    {
      type: 'executive_summary',
      title: '6. Executive Brief',
      description: 'High-level leadership dossier with executive KPIs, chart snapshot, and sign-off.',
      badge: 'Leadership',
      color: 'cyan',
    },
  ];

  const TEMPLATE_STYLES: Record<string, { active: string; badge: string; dot: string }> = {
    blue: {
      active: 'bg-gradient-to-tr from-blue-500/15 to-blue-500/5 border-blue-500/60 ring-1 ring-blue-500/30',
      badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      dot: 'bg-blue-400',
    },
    emerald: {
      active: 'bg-gradient-to-tr from-emerald-500/15 to-emerald-500/5 border-emerald-500/60 ring-1 ring-emerald-500/30',
      badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      dot: 'bg-emerald-400',
    },
    amber: {
      active: 'bg-gradient-to-tr from-amber-500/15 to-amber-500/5 border-amber-500/60 ring-1 ring-amber-500/30',
      badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-400',
    },
    rose: {
      active: 'bg-gradient-to-tr from-rose-500/15 to-rose-500/5 border-rose-500/60 ring-1 ring-rose-500/30',
      badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      dot: 'bg-rose-400',
    },
    violet: {
      active: 'bg-gradient-to-tr from-violet-500/15 to-violet-500/5 border-violet-500/60 ring-1 ring-violet-500/30',
      badge: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
      dot: 'bg-violet-400',
    },
    cyan: {
      active: 'bg-gradient-to-tr from-cyan-500/15 to-cyan-500/5 border-cyan-500/60 ring-1 ring-cyan-500/30',
      badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      dot: 'bg-cyan-400',
    },
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-400 flex items-center gap-2">
              Compliance &amp; Safety Reports
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Audit Studio
              </span>
            </h1>
            <p className="text-xs text-cyan-400">
              OSHA-aligned A4 PDF dossiers, summarized compliance statistics PDF, chart snapshots, CSV/JSON exports, and scheduled runs
            </p>
          </div>
        </div>

        <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-0.5 text-xs font-semibold">
          {[
            { id: 'studio' as const, label: 'Report Studio', icon: Sparkles },
            { id: 'history' as const, label: `History (${reportHistory.length})`, icon: History },
            { id: 'schedules' as const, label: `Schedules (${schedules.length})`, icon: Clock },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === t.id
                    ? 'bg-gradient-to-r from-emerald-600 to-blue-700 text-yellow-200 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-blue-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: STUDIO */}
      {activeTab === 'studio' && (
        <div className="space-y-6">
          {/* Template Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {templates.map((tpl) => {
              const tStyle = TEMPLATE_STYLES[tpl.color];
              const isSelected = selectedType === tpl.type;
              return (
                <div
                  key={tpl.type}
                  onClick={() => {
                    setSelectedType(tpl.type);
                    const nextParams =
                      tpl.type === 'zone_report' && params.zones.length > 1
                        ? { ...params, zones: [params.zones[0]] as ('A' | 'B' | 'C' | 'D')[] }
                        : params;
                    setParams(nextParams);
                    generateReportInstance(tpl.type, nextParams);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? tStyle.active
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${tStyle.dot}`} />
                        {tpl.title}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono border ${tStyle.badge}`}>
                        {tpl.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{tpl.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full Parameter Controls */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-semibold">Timeframe:</span>
                <select
                  aria-label="Report timeframe"
                  value={params.dateRange}
                  onChange={(e) => setParams({ ...params, dateRange: e.target.value as any })}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                >
                  <option value="today">Today</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {params.dateRange === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={params.startDate || ''}
                    onChange={(e) => setParams({ ...params, startDate: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                  />
                  <span className="text-slate-500">→</span>
                  <input
                    type="date"
                    value={params.endDate || ''}
                    onChange={(e) => setParams({ ...params, endDate: e.target.value })}
                    className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold">
                  {selectedType === 'zone_report' ? 'Zone (Single):' : 'Zones:'}
                </span>
                {(['A', 'B', 'C', 'D'] as const).map((z) => {
                  const checked = params.zones.includes(z);
                  return (
                    <label key={z} className="flex items-center gap-1 text-slate-300 cursor-pointer select-none">
                      <input
                        type={selectedType === 'zone_report' ? 'radio' : 'checkbox'}
                        name="report-zone"
                        checked={checked}
                        onChange={() => {
                          if (selectedType === 'zone_report') {
                            setParams({ ...params, zones: [z] });
                          } else {
                            const next = checked ? params.zones.filter((item) => item !== z) : [...params.zones, z];
                            setParams({ ...params, zones: next.length > 0 ? next : ['A'] });
                          }
                        }}
                        className="accent-amber-500"
                      />
                      <span>{z}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-semibold">Language:</span>
                <select
                  aria-label="Report language"
                  value={params.language}
                  onChange={(e) => setParams({ ...params, language: e.target.value as 'en' | 'es' })}
                  className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
                >
                  <option value="en">English (EN)</option>
                  <option value="es">Español (ES)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-800/70">
              {selectedType === 'incident_investigation' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-semibold">Target Incident:</span>
                  <select
                    aria-label="Target incident"
                    value={params.incidentId || ''}
                    onChange={(e) => setParams({ ...params, incidentId: e.target.value || undefined })}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 max-w-xs"
                  >
                    <option value="">All Incidents in Window</option>
                    {incidents.map((inc) => (
                      <option key={inc.id} value={inc.id}>
                        #{inc.incidentNumber || inc.id.slice(-4)} · Zone {inc.zone || '?'} · {(inc.title || inc.summary).slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.includeEvidenceThumbnails}
                  onChange={(e) => setParams({ ...params, includeEvidenceThumbnails: e.target.checked })}
                  className="accent-amber-500 rounded"
                />
                <span>Include Evidence Frames</span>
              </label>

              {params.includeEvidenceThumbnails && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Max Thumbnails:</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={params.maxThumbnails}
                    onChange={(e) =>
                      setParams({ ...params, maxThumbnails: Math.min(12, Math.max(0, Number(e.target.value))) })
                    }
                    className="w-14 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                  />
                </div>
              )}

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.includeAINarrative}
                  onChange={(e) => setParams({ ...params, includeAINarrative: e.target.checked })}
                  className="accent-amber-500 rounded"
                />
                <span>AI Narrative</span>
              </label>

              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={params.includePolicyReferences}
                  onChange={(e) => setParams({ ...params, includePolicyReferences: e.target.checked })}
                  className="accent-amber-500 rounded"
                />
                <span>OSHA / Policy Refs</span>
              </label>

              <button
                onClick={handleGenerate}
                disabled={generating || loading}
                className="ml-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
              >
                {generating ? 'Compiling...' : 'Compile & Refresh'}
              </button>
            </div>
          </div>

          {/* Export Bar */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-semibold text-slate-200">Report Ready: {currentReport?.reportId}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                <span>CSV</span>
              </button>

              <button
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold cursor-pointer"
              >
                <span>JSON (Schema v1)</span>
              </button>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Print HTML</span>
              </button>

              <button
                onClick={handleDownloadSummaryPDF}
                disabled={exportingSummaryPdf || !currentReport}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-700 hover:from-emerald-500 hover:to-blue-600 text-yellow-200 font-bold shadow-md shadow-emerald-500/15 cursor-pointer disabled:opacity-50"
                title="Generate and download a concise 1-page summarized PDF report of PPE compliance statistics"
              >
                <Download className="w-4 h-4" />
                {exportingSummaryPdf ? 'Generating Summary...' : 'Download Summary PDF'}
              </button>

              <button
                onClick={handleExportPDF}
                disabled={exportingPdf}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {exportingPdf ? 'Generating PDF...' : 'Download PDF Dossier (A4)'}
              </button>
            </div>
          </div>

          {/* Live A4 Preview */}
          {currentReport && (
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 text-slate-200 max-w-5xl mx-auto">
              <div className="border-b border-slate-800 pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-amber-400 border border-slate-700">
                      {currentReport.reportId}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400">
                      {currentReport.classification}
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-slate-100 tracking-tight">{currentReport.title}</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Generated: {currentReport.generatedAt.replace('T', ' ').slice(0, 19)} by{' '}
                    <span className="text-slate-300">{currentReport.generatedBy}</span> · Language:{' '}
                    <span className="font-mono uppercase">{currentReport.parameters.language}</span>
                  </p>
                </div>

                <div className="text-right flex flex-col items-end">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center font-bold text-slate-950 text-base">
                    SV
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 mt-1">SafeVision Audit Engine</span>
                </div>
              </div>

              {/* Editable AI Narrative */}
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-purple-500/30 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                      {currentReport.sectionLabels.execSummary}
                    </span>
                    {isReviewed ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        AI-assisted, reviewed by {currentUser?.name || currentUser?.email || 'Safety Lead'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Editable draft
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRegenerateGroundedAI}
                      disabled={regeneratingAI}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-[11px] font-semibold cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${regeneratingAI ? 'animate-spin' : ''}`} />
                      {regeneratingAI ? 'Grounding...' : 'Regenerate Grounded Summary'}
                    </button>

                    {!isReviewed && (
                      <button
                        onClick={() => {
                          setIsReviewed(true);
                          addToast('success', 'Review Confirmed', 'Marked as reviewed.');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-[11px] font-semibold cursor-pointer"
                      >
                        Confirm Review
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  value={editableSummary}
                  onChange={(e) => {
                    setEditableSummary(e.target.value);
                    setIsReviewed(false);
                  }}
                  rows={3}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 leading-relaxed"
                />
              </div>

              {/* KPI Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                  <div className="text-[11px] text-slate-400 font-semibold">Compliance Rate</div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {currentReport.kpis.overallCompliancePct}%
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                  <div className="text-[11px] text-slate-400 font-semibold">Validated Violations</div>
                  <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                    {currentReport.kpis.totalViolations}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25">
                  <div className="text-[11px] text-slate-400 font-semibold">Visual Scans</div>
                  <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                    {currentReport.kpis.totalScans}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/25">
                  <div className="text-[11px] text-slate-400 font-semibold">FP Excluded</div>
                  <div className="text-xl font-bold font-mono text-violet-400 mt-1">
                    {currentReport.kpis.falsePositivesExcluded}
                  </div>
                </div>
              </div>

              {/* Embedded Chart Snapshot Container (Captured into PDF via html2canvas) */}
              <div ref={previewChartRef} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-slate-300 uppercase">
                  Zone Scans &amp; Violation Distribution (Embedded in PDF)
                </div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={currentReport.zoneBreakdown} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <XAxis
                        dataKey="zone"
                        stroke={isLight ? '#475569' : '#64748b'}
                        fontSize={10}
                        tickFormatter={(z) => `Zone ${z}`}
                      />
                      <YAxis stroke={isLight ? '#475569' : '#64748b'} fontSize={10} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isLight ? '#ffffff' : '#020617',
                          borderColor: isLight ? '#cbd5e1' : '#334155',
                          color: isLight ? '#0f172a' : '#f1f5f9',
                          borderRadius: '10px',
                          fontSize: '11px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar
                        dataKey="scansCount"
                        name="Visual Scans"
                        fill={isLight ? '#2563eb' : '#60a5fa'}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="violationsCount"
                        name="Violations"
                        fill={isLight ? '#e11d48' : '#fb7185'}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Zone Breakdown Table */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                  {currentReport.sectionLabels.zoneCompliance}
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Zone</th>
                        <th className="py-2.5 px-2">Scans</th>
                        <th className="py-2.5 px-2">Violations</th>
                        <th className="py-2.5 px-2">Compliance</th>
                        <th className="py-2.5 px-2">Risk Band</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {currentReport.zoneBreakdown.map((z) => (
                        <tr key={z.zone}>
                          <td className="py-2.5 px-3 font-bold text-slate-100">Zone {z.zone}</td>
                          <td className="py-2.5 px-2 font-mono">{z.scansCount}</td>
                          <td className="py-2.5 px-2 font-mono text-amber-400">{z.violationsCount}</td>
                          <td className="py-2.5 px-2 font-mono text-emerald-400">{z.compliancePct}%</td>
                          <td className="py-2.5 px-2 font-mono">{z.riskBand}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Policy Citations */}
              {currentReport.policyCitations.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                  <div className="font-bold text-slate-300 uppercase">Referenced Policies &amp; Standards</div>
                  <ul className="space-y-1 text-slate-400 list-disc pl-4">
                    {currentReport.policyCitations.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Evidence Thumbnails Preview */}
              {currentReport.evidenceThumbnails.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                    {currentReport.sectionLabels.evidenceAppendix} ({currentReport.evidenceThumbnails.length})
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {currentReport.evidenceThumbnails.map((ev, i) => (
                      <div key={i} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-1.5">
                        {ev.imageUrl ? (
                          <img src={ev.imageUrl} alt={ev.violationType} className="w-full h-24 object-cover rounded-lg" />
                        ) : (
                          <div className="w-full h-24 rounded-lg bg-slate-950 flex items-center justify-center text-[11px] text-slate-600 font-mono">
                            Frame Archived
                          </div>
                        )}
                        <div className="font-semibold text-slate-200">{ev.violationType}</div>
                        <div className="text-[10px] font-mono text-slate-500">
                          Zone {ev.zone} · {ev.cameraId} · {ev.timestamp.slice(0, 10)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REPORT HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {reportHistory.length > 20 && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Report archive exceeds 20 stored PDF blobs. Consider pruning older records to save quota.</span>
              </div>
              {isAdmin && (
                <button
                  onClick={handlePruneOldReports}
                  className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold cursor-pointer"
                >
                  Prune Oldest (&gt;20)
                </button>
              )}
            </div>
          )}

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search report ID or title..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            <select
              value={historyTypeFilter}
              onChange={(e) => setHistoryTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 text-xs"
            >
              <option value="all">All Report Types</option>
              <option value="daily_safety_summary">Daily Summary</option>
              <option value="weekly_safety_report">Weekly Report</option>
              <option value="monthly_compliance_audit">Monthly OSHA Audit</option>
              <option value="incident_investigation">Incident Investigation</option>
              <option value="zone_report">Zone Report</option>
              <option value="executive_summary">Executive Summary</option>
            </select>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Report ID</th>
                  <th className="py-3 px-3">Title</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Generated At</th>
                  <th className="py-3 px-3">Author</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {reportHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No archived reports yet. Export a PDF from Report Studio.
                    </td>
                  </tr>
                ) : (
                  reportHistory
                    .filter((r) => (historyTypeFilter === 'all' ? true : r.type === historyTypeFilter))
                    .filter((r) =>
                      historySearch
                        ? r.id.toLowerCase().includes(historySearch.toLowerCase()) ||
                          r.title.toLowerCase().includes(historySearch.toLowerCase())
                        : true
                    )
                    .map((rep) => (
                      <tr key={rep.id} className="hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">{rep.id}</td>
                        <td className="py-3 px-3 font-semibold text-slate-100">{rep.title}</td>
                        <td className="py-3 px-3 text-slate-400 capitalize">{rep.type.replace(/_/g, ' ')}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                          {rep.createdAt.replace('T', ' ').slice(0, 16)}
                        </td>
                        <td className="py-3 px-3 text-slate-400">{rep.createdBy}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                if (rep.reportData) {
                                  setCurrentReport(rep.reportData);
                                  setEditableSummary(rep.reportData.aiNarrative?.executiveSummary || '');
                                  switchTab('studio');
                                }
                              }}
                              className="p-1.5 rounded-lg text-blue-400 hover:text-amber-400 hover:bg-slate-800 cursor-pointer"
                              title="Re-open preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDownloadStoredPDF(rep)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 cursor-pointer"
                              title="Download stored PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => handleDuplicateParams(rep)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 cursor-pointer"
                              title="Duplicate parameters into Studio"
                            >
                              <Copy className="w-4 h-4" />
                            </button>

                            {isAdmin && (
                              <button
                                onClick={async () => {
                                  await repository.deleteReport(rep.id);
                                  setReportHistory((prev) => prev.filter((r) => r.id !== rep.id));
                                  addToast('info', 'Report Deleted', rep.id);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                                title="Delete report (Admin)"
                              >
                                <Trash2 className="w-4 h-4" />
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
        </div>
      )}

      {/* TAB 3: SCHEDULES */}
      {activeTab === 'schedules' && (
        <div className="space-y-5">
          <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Scheduler Execution Scope:</strong> Client-side schedules check for due timestamps automatically
              whenever an authenticated user opens the app. Continuous unattended execution while the browser is closed
              requires a server-side cron worker calling your webhook endpoint.
            </span>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  Automated Recurring Report Schedules
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generates reports using the currently selected Studio template ({selectedType.replace(/_/g, ' ')})
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 text-slate-300 mr-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleEmailSummary}
                    onChange={(e) => setScheduleEmailSummary(e.target.checked)}
                    className="accent-amber-500 rounded"
                  />
                  <span>Webhook summary</span>
                </label>

                <select
                  value={scheduleFreq}
                  onChange={(e) => setScheduleFreq(e.target.value as ScheduleFrequency)}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>

                <button
                  onClick={handleCreateSchedule}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Schedule
                </button>

                <button
                  onClick={async () => {
                    const ran = await runDueReportSchedulesNow();
                    await loadBaseData();
                    addToast(
                      'info',
                      ran > 0 ? 'Scheduled Reports Generated' : 'No Due Schedules',
                      ran > 0 ? `Generated ${ran} due report(s) and updated notifications.` : 'All schedules are up to date.'
                    );
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  Run Due Now
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {schedules.length === 0 ? (
                <p className="text-xs text-slate-500 col-span-full py-6 text-center">
                  No recurring report schedules configured yet.
                </p>
              ) : (
                schedules.map((s) => (
                  <div key={s.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200 capitalize">{s.frequency} Schedule</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20">
                        Active
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Template: <span className="text-slate-200 capitalize">{s.type.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      Next Due: {new Date(s.nextDueAt).toLocaleString()}
                    </div>
                    {s.lastRunAt && (
                      <div className="text-[10px] font-mono text-emerald-400">
                        Last Run: {new Date(s.lastRunAt).toLocaleString()}
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                      <span className="text-purple-400">
                        {s.emailSummary ? 'Bell + Webhook summary' : 'In-app Bell only'}
                      </span>
                      <button
                        onClick={async () => {
                          await repository.deleteReportSchedule(s.id);
                          setSchedules((prev) => prev.filter((item) => item.id !== s.id));
                          addToast('info', 'Schedule Deleted');
                        }}
                        className="text-rose-400 hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

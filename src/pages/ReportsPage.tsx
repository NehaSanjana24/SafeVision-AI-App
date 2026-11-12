import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Download,
  Calendar,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  HardHat,
  Printer,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  BookOpen,
  ExternalLink,
  History,
  Clock,
  Send,
  Trash2,
  Copy,
  Eye,
  FileSpreadsheet,
  Check,
  Layers,
  Search,
  Filter,
  Plus,
} from 'lucide-react';
import { repository } from '../services/storage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
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
  exportReportToCSV,
  CompiledReportData,
} from '../utils/reports';
import { computeAllZonesRisk } from '../utils/risk';

export const ReportsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, isAdmin } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'studio' | 'history' | 'schedules'>('studio');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Raw data from repository
  const [scans, setScans] = useState<Scan[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportRecord[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);

  // Selected Template & Parameters
  const [selectedType, setSelectedType] = useState<ReportType>('monthly_compliance_audit');
  const [params, setParams] = useState<ReportParameters>({
    dateRange: (searchParams.get('range') as any) || '30d',
    zones: searchParams.get('zone') && searchParams.get('zone') !== 'all' ? [(searchParams.get('zone') as any)] : ['A', 'B', 'C', 'D'],
    cameras: ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04', 'CAM-05', 'CAM-06'],
    incidentId: searchParams.get('incidentId') || undefined,
    includeEvidenceThumbnails: true,
    maxThumbnails: 6,
    includeAINarrative: true,
    includePolicyReferences: true,
    language: 'en',
  });

  // Compiled Report Preview State
  const [currentReport, setCurrentReport] = useState<CompiledReportData | null>(null);
  const [isReviewed, setIsReviewed] = useState(false);
  const [editableSummary, setEditableSummary] = useState('');

  // History search & filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('all');

  // Schedule modal / form
  const [scheduleFreq, setScheduleFreq] = useState<ScheduleFrequency>('weekly');

  useEffect(() => {
    loadBaseData();
  }, [currentUser?.id]);

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

      // Auto-generate initial preview
      generateReportInstance(selectedType, params, s, v, inc, ca);
    } catch (err) {
      console.warn('Failed to load reports base data:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateReportInstance = (
    type: ReportType,
    parameters: ReportParameters,
    currentScans = scans,
    currentViols = violations,
    currentIncs = incidents,
    currentActions = correctiveActions
  ) => {
    const zoneRisks = computeAllZonesRisk({
      violations: currentViols,
      scans: currentScans,
      incidents: currentIncs,
      priorViolations: [],
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
    });

    setCurrentReport(compiled);
    setEditableSummary(compiled.aiNarrative.executiveSummary);
    setIsReviewed(false);
  };

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      generateReportInstance(selectedType, params);
      setGenerating(false);
      addToast('success', 'Report Compiled', 'Audit dossier generated with zero-hallucination metrics.');
    }, 300);
  };

  const handleExportPDF = async () => {
    if (!currentReport) return;
    setExportingPdf(true);
    addToast('info', 'Compiling PDF...', 'Building multi-page A4 document with autoTable.');

    try {
      const updatedReport: CompiledReportData = {
        ...currentReport,
        aiNarrative: {
          ...currentReport.aiNarrative,
          executiveSummary: editableSummary,
        },
      };

      const pdfBlob = await exportReportToPDF(updatedReport);

      // Save to IndexedDB report history
      const reportRecord: ReportRecord = {
        id: updatedReport.reportId,
        type: updatedReport.type,
        title: updatedReport.title,
        parameters: updatedReport.parameters,
        summary: editableSummary.slice(0, 200) + '...',
        createdBy: currentUser?.email || 'auditor@safevision.ai',
        createdAt: new Date().toISOString(),
        status: 'generated',
        aiReviewedBy: isReviewed ? currentUser?.email || 'reviewer' : undefined,
        reportData: updatedReport,
      };

      await repository.saveReport(reportRecord);
      await repository.saveReportBlob(reportRecord.id, pdfBlob);
      setReportHistory((prev) => [reportRecord, ...prev]);

      // Download file in browser
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${updatedReport.reportId}_${updatedReport.type}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      addToast('success', 'PDF Downloaded', `Document ${updatedReport.reportId} saved.`);
    } catch (err: any) {
      console.error('PDF export error:', err);
      addToast('error', 'PDF Generation Failed', err.message);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportCSV = () => {
    if (!currentReport) return;
    const csvStr = exportReportToCSV(currentReport);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentReport.reportId}_data.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('success', 'CSV Exported', 'Formula-injection protected spreadsheet downloaded.');
  };

  const handleExportJSON = () => {
    if (!currentReport) return;
    const jsonStr = JSON.stringify(
      {
        schemaVersion: '1.0.0',
        report: currentReport,
      },
      null,
      2
    );
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentReport.reportId}_schema.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addToast('success', 'JSON Exported', 'Full report data schema downloaded.');
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
      emailSummary: true,
    };

    await repository.saveReportSchedule(sched);
    setSchedules((prev) => [sched, ...prev]);
    addToast('success', 'Report Scheduled', `Automated ${scheduleFreq} generation active.`);
  };

  const templates: {
    type: ReportType;
    title: string;
    description: string;
    badge: string;
  }[] = [
    {
      type: 'daily_safety_summary',
      title: '1. Daily Safety Summary',
      description: 'Quick snapshot of shift violations, active inspections, and urgent alerts.',
      badge: 'Daily',
    },
    {
      type: 'weekly_safety_report',
      title: '2. Weekly Safety Report',
      description: '7-day compliance trajectory, moving averages, and recurring infractions.',
      badge: 'Weekly',
    },
    {
      type: 'monthly_compliance_audit',
      title: '3. Monthly OSHA Audit',
      description: 'Comprehensive regulatory dossier referencing OSHA 1926/1910 and ANSI Z89/Z87 standards.',
      badge: 'OSHA Standard',
    },
    {
      type: 'incident_investigation',
      title: '4. Incident Investigation',
      description: 'Detailed breakdown of a specific event with evidence frames, root causes, and sign-off.',
      badge: 'Forensics',
    },
    {
      type: 'zone_report',
      title: '5. Zone Report',
      description: 'Sector-specific risk score decomposition, camera health, and localized corrective actions.',
      badge: 'Sector Specific',
    },
    {
      type: 'executive_summary',
      title: '6. Executive Brief',
      description: 'Single-page high-level leadership brief with executive KPIs, top 3 risks, and sign-off.',
      badge: 'C-Level',
    },
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
                Compliance &amp; Safety Reports
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Milestone 4 Studio
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Formal OSHA-aligned audits, multi-page jsPDF dossiers, and automated report scheduling
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-0.5 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'studio'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Report Studio
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Report History ({reportHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('schedules')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'schedules'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Schedules ({schedules.length})
          </button>
        </div>
      </div>

      {/* TAB 1: REPORT STUDIO */}
      {activeTab === 'studio' && (
        <div className="space-y-6">
          {/* 1. Template Picker */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Select Report Template
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {templates.map((tpl) => (
                <div
                  key={tpl.type}
                  onClick={() => {
                    setSelectedType(tpl.type);
                    generateReportInstance(tpl.type, params);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    selectedType === tpl.type
                      ? 'bg-gradient-to-tr from-amber-500/15 to-amber-500/5 border-amber-500/50 shadow-lg shadow-amber-950/20 ring-1 ring-amber-500/30'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-200">{tpl.title}</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-slate-800 text-amber-400 border border-slate-700">
                        {tpl.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{tpl.description}</p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Auto-calculated figures</span>
                    <span
                      className={`font-semibold ${
                        selectedType === tpl.type ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    >
                      {selectedType === tpl.type ? 'Selected' : 'Use Template →'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Parameter Controls Bar */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold">Timeframe:</span>
              <select
                value={params.dateRange}
                onChange={(e) => setParams({ ...params, dateRange: e.target.value as any })}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200"
              >
                <option value="today">Today</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold">Zones:</span>
              {(['A', 'B', 'C', 'D'] as const).map((z) => {
                const checked = params.zones.includes(z);
                return (
                  <label key={z} className="flex items-center gap-1 text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? params.zones.filter((item) => item !== z)
                          : [...params.zones, z];
                        setParams({ ...params, zones: next.length > 0 ? next : ['A'] });
                      }}
                      className="accent-amber-500 rounded"
                    />
                    <span>{z}</span>
                  </label>
                );
              })}
            </div>

            <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={params.includeEvidenceThumbnails}
                onChange={(e) => setParams({ ...params, includeEvidenceThumbnails: e.target.checked })}
                className="accent-amber-500 rounded"
              />
              <span>Evidence Thumbnails</span>
            </label>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="ml-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              {generating ? 'Compiling Metrics...' : 'Compile & Refresh'}
            </button>
          </div>

          {/* 3. Export Action Bar */}
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-semibold text-slate-200">
                Report Ready: {currentReport?.reportId}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400">{currentReport?.title}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer"
                title="Export raw tabular data to formula-injection safe CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                <span>CSV</span>
              </button>

              <button
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer"
                title="Export structured JSON schema"
              >
                <CodeIcon className="w-3.5 h-3.5 text-purple-400" />
                <span>JSON</span>
              </button>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Print HTML</span>
              </button>

              <button
                onClick={handleExportPDF}
                disabled={exportingPdf}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {exportingPdf ? 'Generating PDF...' : 'Download PDF Dossier (A4)'}
              </button>
            </div>
          </div>

          {/* 4. Live A4 Document Preview */}
          {currentReport && (
            <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 text-slate-200 max-w-5xl mx-auto">
              {/* Document Header & Classification */}
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
                  <h2 className="text-2xl font-black text-slate-100 tracking-tight">
                    {currentReport.title}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Generated: {currentReport.generatedAt.replace('T', ' ').slice(0, 19)} by{' '}
                    <span className="text-slate-300">{currentReport.generatedBy}</span>
                  </p>
                </div>

                <div className="text-right flex flex-col items-end">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center font-bold text-slate-950 text-base shadow-lg shadow-amber-500/20">
                    SV
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 mt-1">SafeVision Platform v4.0</span>
                </div>
              </div>

              {/* Editable AI Narrative Card */}
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                      Executive Narrative &amp; Findings
                    </span>
                    {isReviewed ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        AI-assisted, reviewed by {currentUser?.name || 'Safety Lead'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Editable draft
                      </span>
                    )}
                  </div>

                  {!isReviewed && (
                    <button
                      onClick={() => {
                        setIsReviewed(true);
                        addToast('success', 'Review Confirmed', 'Narrative marked as verified by supervisor.');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Confirm Review &amp; Lock
                    </button>
                  )}
                </div>

                <textarea
                  value={editableSummary}
                  onChange={(e) => {
                    setEditableSummary(e.target.value);
                    setIsReviewed(false);
                  }}
                  rows={3}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-purple-500 leading-relaxed font-sans"
                />

                <div className="space-y-1.5 pt-1 text-xs">
                  <span className="font-semibold text-slate-300">Grounding Policy Observations:</span>
                  {currentReport.aiNarrative.keyObservations.map((obs, idx) => (
                    <div key={idx} className="text-slate-400 flex items-start gap-1.5 text-[11px]">
                      <span className="text-purple-400 mt-0.5">•</span>
                      <span>{obs}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* KPI Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Site Compliance</div>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {currentReport.kpis.overallCompliancePct}%
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Validated Violations</div>
                  <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                    {currentReport.kpis.totalViolations}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Visual Scans Evaluated</div>
                  <div className="text-xl font-bold font-mono text-slate-200 mt-1">
                    {currentReport.kpis.totalScans}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Reconciled False Positives</div>
                  <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                    {currentReport.kpis.falsePositivesExcluded}
                  </div>
                </div>
              </div>

              {/* Zone Breakdown Table */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                  1. Zone Compliance &amp; Risk Ratings
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Zone</th>
                        <th className="py-2.5 px-2">Visual Scans</th>
                        <th className="py-2.5 px-2">Violations</th>
                        <th className="py-2.5 px-2">Compliance Rate</th>
                        <th className="py-2.5 px-2">Risk Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {currentReport.zoneBreakdown.map((z) => (
                        <tr key={z.zone} className="hover:bg-slate-900/50">
                          <td className="py-2.5 px-3 font-bold text-slate-100">Zone {z.zone}</td>
                          <td className="py-2.5 px-2 font-mono">{z.scansCount}</td>
                          <td className="py-2.5 px-2 font-mono text-amber-400">{z.violationsCount}</td>
                          <td className="py-2.5 px-2 font-mono text-emerald-400">{z.compliancePct}%</td>
                          <td className="py-2.5 px-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 border border-slate-700">
                              {z.riskBand}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Violation Breakdown & OSHA Standards Table */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                  2. Regulatory Standards Mapping (OSHA / ANSI)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Violation Class</th>
                        <th className="py-2.5 px-2">Count</th>
                        <th className="py-2.5 px-2">OSHA / ANSI Standard</th>
                        <th className="py-2.5 px-2">Risk Level</th>
                        <th className="py-2.5 px-2">Mandated PPE Protocol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {currentReport.violationBreakdown.map((v) => (
                        <tr key={v.classType} className="hover:bg-slate-900/50">
                          <td className="py-2.5 px-3 font-semibold text-slate-100">{v.classType}</td>
                          <td className="py-2.5 px-2 font-mono font-bold text-amber-400">{v.count}</td>
                          <td className="py-2.5 px-2 font-mono text-blue-400 text-[11px]">{v.oshaStandard}</td>
                          <td className="py-2.5 px-2">{v.riskRating}</td>
                          <td className="py-2.5 px-2 text-slate-400">{v.requiredPPE}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sign-off Block */}
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                  3. Audit Verification &amp; Formal Sign-Off
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {['Prepared By', 'Reviewed By (Safety Supervisor)', 'Approved By (Operations Director)'].map(
                    (title, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <div className="text-xs font-semibold text-slate-400">{title}</div>
                        <div className="pt-4 border-b border-slate-700/80 text-[11px] text-slate-300 font-mono">
                          {idx === 0 ? currentReport.generatedBy : 'Pending Digital Authorization'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">Date: {currentReport.generatedAt.slice(0, 10)}</div>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Appendix & Reconciliation Notes */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
                <div className="font-bold text-slate-300 uppercase">Appendix: Methodology &amp; Data Notes</div>
                <p>
                  Record reconciliation: {currentReport.kpis.totalViolations} valid violations recorded across{' '}
                  {currentReport.kpis.totalScans} detection scans. {currentReport.kpis.falsePositivesExcluded}{' '}
                  false-positive detections were flagged and segregated from penalty metrics in strict accordance with the SafeVision AI data verification protocol.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REPORT HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search generated reports by ID or title..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full bg-transparent border-0 text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            <select
              value={historyTypeFilter}
              onChange={(e) => setHistoryTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 text-xs"
            >
              <option value="all">All Report Types</option>
              <option value="monthly_compliance_audit">Monthly Compliance Audit</option>
              <option value="daily_safety_summary">Daily Safety Summary</option>
              <option value="weekly_safety_report">Weekly Safety Report</option>
              <option value="incident_investigation">Incident Investigation</option>
            </select>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Report ID</th>
                  <th className="py-3 px-3">Title</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Generated At</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {reportHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No reports generated yet. Compile your first report in the Report Studio!
                    </td>
                  </tr>
                ) : (
                  reportHistory
                    .filter((r) =>
                      historyTypeFilter === 'all' ? true : r.type === historyTypeFilter
                    )
                    .filter((r) =>
                      historySearch
                        ? r.id.toLowerCase().includes(historySearch.toLowerCase()) ||
                          r.title.toLowerCase().includes(historySearch.toLowerCase())
                        : true
                    )
                    .map((rep) => (
                      <tr key={rep.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-amber-400">{rep.id}</td>
                        <td className="py-3 px-3 font-semibold text-slate-100">{rep.title}</td>
                        <td className="py-3 px-3 text-slate-400 capitalize">
                          {rep.type.replace(/_/g, ' ')}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                          {rep.createdAt.replace('T', ' ').slice(0, 16)}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {rep.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                if (rep.reportData) {
                                  setCurrentReport(rep.reportData);
                                  setEditableSummary(rep.reportData.aiNarrative?.executiveSummary || '');
                                  setActiveTab('studio');
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Re-open preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {isAdmin && (
                              <button
                                onClick={async () => {
                                  await repository.deleteReport(rep.id);
                                  setReportHistory((prev) => prev.filter((r) => r.id !== rep.id));
                                  addToast('info', 'Report Deleted', `Report ${rep.id} removed.`);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                                title="Delete report"
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
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  Automated Recurring Reports
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  In-app scheduler generates dossiers automatically when supervisor/admin opens the app
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={scheduleFreq}
                  onChange={(e) => setScheduleFreq(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 text-xs"
                >
                  <option value="daily">Daily Schedule</option>
                  <option value="weekly">Weekly Schedule</option>
                  <option value="monthly">Monthly Schedule</option>
                </select>

                <button
                  onClick={handleCreateSchedule}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Schedule
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-3">
              {schedules.map((s) => (
                <div key={s.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 capitalize">{s.frequency} Report</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20">
                      Active
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Template: <span className="text-slate-300">{s.type.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    Next Due: {new Date(s.nextDueAt).toLocaleDateString()}
                  </div>
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                    <span className="text-purple-400">Email summary via webhook</span>
                    <button
                      onClick={async () => {
                        await repository.deleteReportSchedule(s.id);
                        setSchedules((prev) => prev.filter((item) => item.id !== s.id));
                        addToast('info', 'Schedule Removed');
                      }}
                      className="text-rose-400 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function CodeIcon(props: any) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

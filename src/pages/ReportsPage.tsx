import React, { useState, useEffect, useRef } from 'react';
import { repository } from '../services/storage';
import { Scan, Violation } from '../types';
import { useToast } from '../context/ToastContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { addToast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [scans, setScans] = useState<Scan[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range picker state
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // AI Summary state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<{ summary: string; recommendations: string[] } | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const allScans = await repository.getAllScans();
      const allViolations = await repository.getAllViolations();
      setScans(allScans);
      setViolations(allViolations);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Filtered scans within selected date range
  const filteredScans = scans.filter((s) => {
    const d = new Date(s.createdAt);
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    return d >= start && d <= end;
  });

  const scanIds = new Set(filteredScans.map((s) => s.id));
  const filteredViolations = violations.filter((v) => scanIds.has(v.scanId));

  // Report KPIs
  const totalScans = filteredScans.length;
  const totalViolations = filteredViolations.length;
  const compliancePct =
    totalScans > 0
      ? Math.round(filteredScans.reduce((acc, s) => acc + s.compliancePct, 0) / totalScans)
      : 100;

  // Breakdown by violation type
  const violationCounts: Record<string, number> = {};
  filteredViolations.forEach((v) => {
    violationCounts[v.type] = (violationCounts[v.type] || 0) + 1;
  });

  // Generate AI Executive Safety Summary
  const handleGenerateAiSummary = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/reports/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeframe: `${startDate} to ${endDate}`,
          totalScans,
          totalViolations,
          compliancePct,
          violationBreakdown: violationCounts,
        }),
      });

      if (!res.ok) {
        throw new Error(`Summary API returned ${res.status}`);
      }

      const data = await res.json();
      setAiReport(data);
      addToast('success', 'AI Analysis Complete', 'Executive safety briefing generated.');
    } catch (err: any) {
      console.error(err);
      addToast('error', 'AI Summary Failed', err.message || 'Could not reach model.');
    } finally {
      setAiLoading(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredViolations.length === 0) {
      addToast('warning', 'No Violations', 'No violations recorded in this date range.');
      return;
    }

    const headers = ['Violation ID', 'Scan ID', 'Violation Type', 'Confidence', 'Source', 'File Name', 'Timestamp'];
    const rows = filteredViolations.map((v) => [
      v.id,
      v.scanId,
      `"${v.type}"`,
      v.confidence,
      v.sourceType,
      `"${v.fileName}"`,
      `"${new Date(v.createdAt).toLocaleString()}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SafeVision_Violation_Report_${startDate}_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast('success', 'CSV Downloaded', 'Violation log successfully exported.');
  };

  // Export to PDF using html2canvas and jsPDF
  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setExportingPdf(true);
    addToast('info', 'Generating PDF...', 'Capturing report document.');

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#090d16',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`SafeVision_Safety_Audit_${startDate}_${endDate}.pdf`);

      addToast('success', 'PDF Exported', 'Executive safety document saved.');
    } catch (err: any) {
      console.error('PDF export error:', err);
      addToast('error', 'PDF Export Failed', err.message || 'Failed to render PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Range Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-amber-400" />
            <span>Safety Audit &amp; Violation Reports</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Generate formal OSHA-compliant PPE surveillance dossiers and executive hazard summaries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleGenerateAiSummary}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-purple-900/20 transition-all hover:scale-105"
          >
            {aiLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>AI Safety Brief</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleExportPDF}
            disabled={exportingPdf}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold shadow-md shadow-amber-500/20 transition-all hover:scale-105"
          >
            {exportingPdf ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            <span>Export PDF Dossier</span>
          </button>
        </div>
      </div>

      {/* Date Range Selector Strip */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-amber-400" /> Report Period:
          </span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-xs"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-xs"
            />
          </div>
        </div>

        <div className="text-xs font-mono text-slate-400">
          Scans in scope: <span className="font-bold text-amber-400">{totalScans}</span> | Violations:{' '}
          <span className="font-bold text-rose-400">{totalViolations}</span>
        </div>
      </div>

      {/* AI Summary Banner (if generated) */}
      {aiReport && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/30 border border-purple-500/30 shadow-xl space-y-4 animate-in fade-in">
          <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>AI Workplace Safety Analyst Briefing</span>
          </div>

          <p className="text-sm text-slate-200 leading-relaxed italic border-l-2 border-purple-500 pl-4 py-1">
            &ldquo;{aiReport.summary}&rdquo;
          </p>

          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              <span>Recommended Tactical Mitigation Steps:</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {aiReport.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Printable Report Container */}
      <div
        ref={printRef}
        className="p-8 sm:p-10 rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl space-y-8"
      >
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <HardHat className="w-7 h-7 text-slate-950" />
            </div>
            <div>
              <div className="text-xl font-black text-white tracking-tight">SafeVision AI</div>
              <div className="text-xs font-mono text-amber-400 tracking-wider uppercase">
                Enterprise Safety &amp; PPE Compliance Audit
              </div>
            </div>
          </div>

          <div className="text-right text-xs font-mono text-slate-400 space-y-0.5">
            <div>
              Generated: <span className="text-slate-200">{new Date().toLocaleDateString()}</span>
            </div>
            <div>
              Period:{' '}
              <span className="text-slate-200">
                {startDate} &rarr; {endDate}
              </span>
            </div>
            <div>
              Classification: <span className="text-emerald-400 font-bold">REGULATORY AUDIT</span>
            </div>
          </div>
        </div>

        {/* Executive Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="text-xs font-mono text-slate-400 uppercase">Monitored Scans</div>
            <div className="text-2xl font-black font-mono text-white mt-1">{totalScans}</div>
            <div className="text-[11px] text-slate-500 mt-1">Inspection media samples analyzed</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="text-xs font-mono text-slate-400 uppercase">Detected Violations</div>
            <div className="text-2xl font-black font-mono text-rose-400 mt-1">{totalViolations}</div>
            <div className="text-[11px] text-slate-500 mt-1">Non-compliant PPE events flagged</div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="text-xs font-mono text-slate-400 uppercase">Safety Compliance Rating</div>
            <div className="text-2xl font-black font-mono text-emerald-400 mt-1">{compliancePct}%</div>
            <div className="text-[11px] text-slate-500 mt-1">OSHA baseline target &ge; 90%</div>
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>1. PPE Violation Category Breakdown</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                  <th className="pb-2">Hazard Category</th>
                  <th className="pb-2">Incident Count</th>
                  <th className="pb-2">Share of Total</th>
                  <th className="pb-2">OSHA Reference Standard</th>
                  <th className="pb-2">Risk Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {Object.keys(violationCounts).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      No PPE violations recorded within this time window.
                    </td>
                  </tr>
                ) : (
                  Object.entries(violationCounts).map(([type, count]) => {
                    const share = Math.round((count / Math.max(1, totalViolations)) * 100);
                    const isSevere = type.includes('HELMET') || type.includes('VEST');
                    return (
                      <tr key={type} className="hover:bg-slate-900/40">
                        <td className="py-2.5 font-bold text-slate-200">{type}</td>
                        <td className="py-2.5 font-mono text-rose-400 font-bold">{count}</td>
                        <td className="py-2.5 font-mono text-slate-300">{share}%</td>
                        <td className="py-2.5 font-mono text-slate-400">
                          {type.includes('HELMET')
                            ? '29 CFR 1926.100'
                            : type.includes('VEST')
                            ? 'ANSI/ISEA 107'
                            : type.includes('GLOVE')
                            ? '29 CFR 1910.138'
                            : '29 CFR 1910.133'}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                              isSevere
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {isSevere ? 'CRITICAL' : 'MODERATE'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Evidence Thumbnails Gallery */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span>2. Annotated Evidence Gallery</span>
          </h3>
          <p className="text-xs text-slate-400">
            Automated image capture and bounding-box overlays captured at the instant of detected infraction.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-1">
            {filteredViolations.slice(0, 6).map((v) => (
              <div
                key={v.id}
                className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800 p-2 space-y-2"
              >
                <div className="aspect-video bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
                  {v.evidenceImage ? (
                    <img
                      src={v.evidenceImage}
                      alt={v.type}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-600">
                      <ShieldAlert className="w-8 h-8 text-rose-500/40 mb-1" />
                      <span className="text-[10px] font-mono">Evidence Logged</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-rose-400 font-mono truncate max-w-[120px]">
                    {v.type}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {(v.confidence * 100).toFixed(0)}% Conf
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {v.fileName} • {new Date(v.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sign-off footer */}
        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-500 font-mono gap-4">
          <div>
            Certified SafeVision AI Telemetry Verification
            <br />
            Report Reference: SV-AUDIT-{startDate.replace(/-/g, '')}
          </div>
          <div className="text-right">
            Site Safety Officer Sign-off: ___________________________
            <br />
            Date: ___________________________
          </div>
        </div>
      </div>
    </div>
  );
};

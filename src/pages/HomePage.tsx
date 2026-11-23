import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { repository } from '../services/storage';
import { KPICards, KPIMetricsData, DEMO_KPI_DATA } from '../components/dashboard/KPICards';
import {
  ScanEye,
  Video,
  LayoutDashboard,
  FileCheck2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [kpiData, setKpiData] = useState<KPIMetricsData>(DEMO_KPI_DATA);
  const [isDemoData, setIsDemoData] = useState<boolean>(true);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [scans, violations] = await Promise.all([
        repository.getAllScans(),
        repository.getAllViolations(),
      ]);

      if (scans.length > 0 || violations.length > 0) {
        const activeViolations = violations.filter((v) => !v.isFalsePositive);
        const resolvedCount = activeViolations.filter((v) => Boolean(v.resolved)).length;
        const falsePositives = violations.filter((v) => Boolean(v.isFalsePositive)).length;
        const avgCompliance =
          scans.length > 0
            ? Math.round(scans.reduce((acc, s) => acc + s.compliancePct, 0) / scans.length)
            : 100;
        setKpiData({
          totalInspections: scans.length,
          totalViolations: activeViolations.length,
          resolvedViolations: resolvedCount,
          compliancePercentage: avgCompliance,
          falsePositivesExcluded: falsePositives,
          openViolations: Math.max(0, activeViolations.length - resolvedCount),
        });
        setIsDemoData(false);
      } else {
        setKpiData(DEMO_KPI_DATA);
        setIsDemoData(true);
      }
    } finally {
      setLoadingStats(false);
    }
  };

  const features = [
    {
      icon: ScanEye,
      title: 'High-Speed Image Detection',
      desc: 'Instant computer vision scan on site photos, inspecting hardhats, high-visibility vests, gloves, goggles, and respirators in milliseconds.',
      tag: 'YOLOv8 + Gemini',
      color: 'amber',
    },
    {
      icon: Video,
      title: 'Real-Time Video Extraction',
      desc: 'Extract and analyze video frames every second from CCTV, drone footage, or mobile clips with timeline violation telemetry.',
      tag: 'Automated Sampling',
      color: 'emerald',
    },
    {
      icon: LayoutDashboard,
      title: 'Safety Command Center',
      desc: 'Interactive compliance metrics, trend lines, donut breakdown charts, and hourly risk heatmaps for safety superintendents.',
      tag: 'Live Analytics',
      color: 'blue',
    },
    {
      icon: FileCheck2,
      title: 'OSHA Violation Reporting',
      desc: 'One-click executive PDF and CSV export paired with an AI Safety Analyst that formulates actionable hazard mitigation steps.',
      tag: 'PDF & AI Summary',
      color: 'purple',
    },
  ];

  const steps = [
    {
      step: '01',
      title: 'Upload Media',
      desc: 'Drag & drop site inspection photographs or recorded surveillance video streams directly in the browser.',
    },
    {
      step: '02',
      title: 'AI Inspection',
      desc: 'Our dual-mode vision engine isolates every worker and inspects all requisite PPE safety garments.',
    },
    {
      step: '03',
      title: 'Flag Violations',
      desc: 'Instant visual bounding boxes pinpoint non-compliant hazards with exact confidence metrics.',
    },
    {
      step: '04',
      title: 'Audit & Report',
      desc: 'Store evidence securely, generate executive incident audits, and export regulatory-grade PDFs.',
    },
  ];

  const featureThemes: Record<string, { border: string; iconBg: string; tag: string; titleColor: string }> = {
    amber: {
      border: 'hover:border-amber-500/45 border-amber-500/20',
      iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      tag: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      titleColor: 'text-amber-400 group-hover:text-yellow-400',
    },
    emerald: {
      border: 'hover:border-emerald-500/45 border-emerald-500/20',
      iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      tag: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      titleColor: 'text-emerald-400 group-hover:text-teal-400',
    },
    blue: {
      border: 'hover:border-blue-500/45 border-blue-500/20',
      iconBg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      tag: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      titleColor: 'text-blue-400 group-hover:text-cyan-400',
    },
    purple: {
      border: 'hover:border-violet-500/45 border-violet-500/20',
      iconBg: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
      tag: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
      titleColor: 'text-violet-400 group-hover:text-purple-400',
    },
  };

  const stepColors = [
    'text-blue-500/70 dark:text-blue-400/80',
    'text-emerald-500/70 dark:text-emerald-400/80',
    'text-rose-500/70 dark:text-rose-400/80',
    'text-violet-500/70 dark:text-violet-400/80',
  ];

  const stepTitleColors = [
    'text-blue-400',
    'text-emerald-400',
    'text-rose-400',
    'text-violet-400',
  ];

  return (
    <div className="space-y-16 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-8 pb-12 sm:pt-14 sm:pb-16 text-center">
        {/* Ambient multi-color background glow */}
        <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-blue-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />
        <div className="absolute top-1/2 left-2/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-violet-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-400 text-xs font-semibold mb-6 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Next-Generation Workplace Safety AI</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-blue-400 max-w-4xl mx-auto leading-tight">
          Intelligent PPE Monitoring <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-amber-600 via-rose-600 to-violet-700 dark:from-amber-300 dark:via-rose-400 dark:to-violet-400 bg-clip-text text-transparent">
            Zero Safety Blindspots.
          </span>
        </h1>

        <p className="mt-5 text-base sm:text-lg text-sky-400 max-w-2xl mx-auto leading-relaxed">
          <span className="font-extrabold bg-gradient-to-r from-blue-600 via-violet-600 to-rose-600 dark:from-cyan-300 dark:via-violet-400 dark:to-amber-300 bg-clip-text text-transparent">
            SafeVision AI
          </span>{' '}
          automates Personal Protective Equipment compliance tracking across construction
          zones, manufacturing plants, and industrial yards using real-time computer vision.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => navigate('/detect')}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-violet-600 to-rose-600 hover:from-blue-500 hover:via-violet-500 hover:to-rose-500 text-yellow-200 font-bold text-sm shadow-xl shadow-violet-500/25 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <ScanEye className="w-4 h-4" />
            <span>Launch PPE Detection</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {currentUser ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-emerald-400 font-semibold text-sm border border-emerald-500/30 transition-all hover:scale-105 cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4 text-emerald-400" />
              <span>Safety Command Center</span>
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-cyan-400 font-semibold text-sm border border-cyan-500/30 transition-all hover:scale-105 cursor-pointer"
            >
              <span>Sign In / Demo Login</span>
            </button>
          )}
        </div>
      </section>

      {/* Workplace Safety KPI Cards */}
      <KPICards
        data={kpiData}
        isDemoData={isDemoData}
        loading={loadingStats}
        onCardClick={(card) => {
          if (card === 'inspections') navigate('/detect');
          else if (card === 'violations' || card === 'resolved') navigate('/alerts');
          else navigate('/dashboard');
        }}
      />

      {/* Feature Cards Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-emerald-400 tracking-tight">
            Industrial-Grade Safety Modules
          </h2>
          <p className="text-sm text-indigo-400 mt-2">
            Equipped with multi-engine computer vision to safeguard your field personnel.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feat) => {
            const Icon = feat.icon;
            const themeStyle = featureThemes[feat.color] || featureThemes.amber;
            return (
              <div
                key={feat.title}
                className={`group p-6 rounded-2xl bg-slate-900/60 hover:bg-slate-900/90 border ${themeStyle.border} transition-all duration-300 shadow-lg relative overflow-hidden`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border group-hover:scale-110 transition-transform ${themeStyle.iconBg}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-full border ${themeStyle.tag}`}>
                    {feat.tag}
                  </span>
                </div>
                <h3 className={`text-lg font-bold transition-colors ${themeStyle.titleColor}`}>
                  {feat.title}
                </h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  {feat.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* "How it Works" Step by Step */}
      <section className="p-8 sm:p-10 rounded-3xl bg-gradient-to-b from-slate-900/60 to-slate-950 border border-slate-800/80">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-violet-400">
            Four-Step Architecture
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-cyan-400 mt-1">
            How{' '}
            <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-rose-600 dark:from-cyan-300 dark:via-violet-400 dark:to-amber-300 bg-clip-text text-transparent">
              SafeVision AI
            </span>{' '}
            Operates
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, idx) => (
            <div
              key={s.step}
              className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 relative hover:border-slate-700 transition-colors"
            >
              <div className={`text-3xl font-black font-mono mb-2 ${stepColors[idx] || 'text-amber-400'}`}>
                {s.step}
              </div>
              <h4 className={`text-base font-bold mb-1.5 ${stepTitleColors[idx] || 'text-blue-400'}`}>{s.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="text-center p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-blue-500/10 via-violet-500/10 to-emerald-500/10 border border-violet-500/25">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-400">
          Ready to eliminate PPE non-compliance?
        </h2>
        <p className="text-sm text-indigo-400 max-w-xl mx-auto mt-2">
          Test sample inspection frames or upload your live camera clips now with zero setup.
        </p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => navigate('/detect')}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-700 hover:from-emerald-500 hover:to-blue-600 text-yellow-200 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 cursor-pointer"
          >
            <ScanEye className="w-4 h-4" />
            <span>Start Detection Workspace</span>
          </button>
        </div>
      </section>
    </div>
  );
};

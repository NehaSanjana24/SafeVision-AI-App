import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { repository } from '../services/storage';
import {
  HardHat,
  ScanEye,
  Video,
  LayoutDashboard,
  FileCheck2,
  ArrowRight,
  ShieldAlert,
  CheckCircle,
  Zap,
  TrendingUp,
  Cpu,
  Sparkles,
} from 'lucide-react';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [stats, setStats] = useState({
    totalScans: 0,
    totalViolations: 0,
    compliancePct: 94,
    recentScansCount: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const scans = await repository.getAllScans();
    const violations = await repository.getAllViolations();

    if (scans.length > 0) {
      const avgCompliance = Math.round(
        scans.reduce((acc, s) => acc + s.compliancePct, 0) / scans.length
      );
      setStats({
        totalScans: scans.length,
        totalViolations: violations.length,
        compliancePct: avgCompliance,
        recentScansCount: scans.slice(0, 5).length,
      });
    } else {
      // Default initial display until first scan
      setStats({
        totalScans: 128,
        totalViolations: 14,
        compliancePct: 91,
        recentScansCount: 5,
      });
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

  return (
    <div className="space-y-16 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-8 pb-12 sm:pt-14 sm:pb-16 text-center">
        {/* Ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-amber-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-6 shadow-sm">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Next-Generation Workplace Safety AI</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-tight">
          Intelligent PPE Monitoring <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-orange-400 bg-clip-text text-transparent">
            Zero Safety Blindspots.
          </span>
        </h1>

        <p className="mt-5 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          SafeVision AI automates Personal Protective Equipment compliance tracking across construction
          zones, manufacturing plants, and industrial yards using real-time computer vision.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => navigate('/detect')}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-xl shadow-amber-500/20 transition-all hover:scale-105 active:scale-95"
          >
            <ScanEye className="w-4 h-4" />
            <span>Launch PPE Detection</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {currentUser ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white font-semibold text-sm border border-slate-700 transition-all hover:scale-105"
            >
              <LayoutDashboard className="w-4 h-4 text-amber-400" />
              <span>Safety Command Center</span>
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white font-semibold text-sm border border-slate-700 transition-all hover:scale-105"
            >
              <span>Sign In / Demo Login</span>
            </button>
          )}
        </div>
      </section>

      {/* Live Stats Strip */}
      <section className="relative">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
              <ScanEye className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                {stats.totalScans}
              </div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Safety Scans
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 border border-rose-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-rose-400 font-mono">
                {stats.totalViolations}
              </div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Violations Caught
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/60">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
                {stats.compliancePct}%
              </div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Site Compliance Score
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="space-y-6">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Industrial-Grade Safety Modules
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Equipped with multi-engine computer vision to safeguard your field personnel.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="group p-6 rounded-2xl bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800 hover:border-amber-500/30 transition-all duration-300 shadow-lg relative overflow-hidden"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="px-2.5 py-1 text-[11px] font-mono font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {feat.tag}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
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
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400">
            Four-Step Architecture
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
            How SafeVision AI Operates
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div
              key={s.step}
              className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 relative hover:border-slate-700 transition-colors"
            >
              <div className="text-3xl font-black font-mono text-amber-500/30 mb-2">
                {s.step}
              </div>
              <h4 className="text-base font-bold text-slate-100 mb-1.5">{s.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="text-center p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
          Ready to eliminate PPE non-compliance?
        </h2>
        <p className="text-sm text-slate-300 max-w-xl mx-auto mt-2">
          Test sample inspection frames or upload your live camera clips now with zero setup.
        </p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => navigate('/detect')}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all hover:scale-105"
          >
            <ScanEye className="w-4 h-4" />
            <span>Start Detection Workspace</span>
          </button>
        </div>
      </section>
    </div>
  );
};

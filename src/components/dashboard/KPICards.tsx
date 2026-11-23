import React, { useEffect, useState } from 'react';
import {
  ClipboardCheck,
  ShieldAlert,
  CheckCircle2,
  ShieldCheck,
  Database,
  Sparkles,
} from 'lucide-react';
import { repository } from '../../services/storage';

export interface KPIMetricsData {
  totalInspections: number;
  totalViolations: number;
  resolvedViolations: number;
  compliancePercentage: number;
  falsePositivesExcluded?: number;
  openViolations?: number;
}

export const DEMO_KPI_DATA: KPIMetricsData = {
  totalInspections: 128,
  totalViolations: 14,
  resolvedViolations: 11,
  compliancePercentage: 91,
  falsePositivesExcluded: 2,
  openViolations: 3,
};

export type KPICardKey = 'inspections' | 'violations' | 'resolved' | 'compliance';

export interface KPICardsProps {
  /** Metrics supplied by parent (e.g. filtered Command Center telemetry). If omitted, component loads from repository or falls back to Demo Data. */
  data?: KPIMetricsData;
  /** Explicit flag indicating whether displayed values are Demo Data fallback instead of stored repository records. */
  isDemoData?: boolean;
  /** Loading skeleton state */
  loading?: boolean;
  /** Optional click handler when user selects one of the 4 KPI cards */
  onCardClick?: (card: KPICardKey) => void;
  /** Optional CTA callback when viewing Demo Data to persist realistic sample records */
  onSeedSampleData?: () => void;
}

export const KPICards: React.FC<KPICardsProps> = ({
  data,
  isDemoData,
  loading: loadingProp = false,
  onCardClick,
  onSeedSampleData,
}) => {
  const [internalData, setInternalData] = useState<KPIMetricsData | null>(null);
  const [internalDemo, setInternalDemo] = useState<boolean>(false);
  const [internalLoading, setInternalLoading] = useState<boolean>(data === undefined);

  useEffect(() => {
    if (data !== undefined) {
      setInternalLoading(false);
      return;
    }

    let cancelled = false;
    const loadMetrics = async () => {
      setInternalLoading(true);
      try {
        const [scans, violations] = await Promise.all([
          repository.getAllScans(),
          repository.getAllViolations(),
        ]);

        if (cancelled) return;

        if (scans.length > 0 || violations.length > 0) {
          const activeViolations = violations.filter((v) => !v.isFalsePositive);
          const resolvedCount = activeViolations.filter((v) => Boolean(v.resolved)).length;
          const falsePositives = violations.filter((v) => Boolean(v.isFalsePositive)).length;
          const compliancePct =
            scans.length > 0
              ? Math.round(
                  scans.reduce((acc, s) => acc + (s.compliancePct ?? 100), 0) / scans.length
                )
              : 100;

          setInternalData({
            totalInspections: scans.length,
            totalViolations: activeViolations.length,
            resolvedViolations: resolvedCount,
            compliancePercentage: compliancePct,
            falsePositivesExcluded: falsePositives,
            openViolations: Math.max(0, activeViolations.length - resolvedCount),
          });
          setInternalDemo(false);
        } else {
          setInternalData(DEMO_KPI_DATA);
          setInternalDemo(true);
        }
      } catch {
        if (!cancelled) {
          setInternalData(DEMO_KPI_DATA);
          setInternalDemo(true);
        }
      } finally {
        if (!cancelled) {
          setInternalLoading(false);
        }
      }
    };

    loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const metrics = data ?? internalData ?? DEMO_KPI_DATA;
  const showingDemo = isDemoData ?? (data !== undefined ? false : internalDemo);
  const isLoading = loadingProp || (data === undefined && internalLoading);

  const openCount =
    metrics.openViolations ?? Math.max(0, metrics.totalViolations - metrics.resolvedViolations);
  const resolutionRatePct =
    metrics.totalViolations > 0
      ? Math.round((metrics.resolvedViolations / metrics.totalViolations) * 100)
      : 100;

  const cards: Array<{
    key: KPICardKey;
    label: string;
    value: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    labelClass: string;
    borderClass: string;
    iconBoxClass: string;
    valueClass: string;
  }> = [
    {
      key: 'inspections',
      label: 'Total Inspections',
      value: metrics.totalInspections.toLocaleString(),
      subtitle: 'Visual & CCTV PPE scans',
      icon: ClipboardCheck,
      labelClass: 'text-blue-400',
      borderClass: 'border-blue-500/30 hover:border-blue-500/60',
      iconBoxClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      valueClass: 'text-cyan-400',
    },
    {
      key: 'violations',
      label: 'Total PPE Violations',
      value: metrics.totalViolations.toLocaleString(),
      subtitle:
        metrics.falsePositivesExcluded && metrics.falsePositivesExcluded > 0
          ? `${openCount} open · ${metrics.falsePositivesExcluded} FP excluded`
          : `${openCount} active unresolved`,
      icon: ShieldAlert,
      labelClass: 'text-rose-400',
      borderClass: 'border-rose-500/30 hover:border-rose-500/60',
      iconBoxClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      valueClass: 'text-rose-400',
    },
    {
      key: 'resolved',
      label: 'Resolved Violations',
      value: metrics.resolvedViolations.toLocaleString(),
      subtitle: `${resolutionRatePct}% remediation rate`,
      icon: CheckCircle2,
      labelClass: 'text-violet-400',
      borderClass: 'border-violet-500/30 hover:border-violet-500/60',
      iconBoxClass: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
      valueClass: 'text-purple-400',
    },
    {
      key: 'compliance',
      label: 'Compliance Percentage',
      value: `${metrics.compliancePercentage}%`,
      subtitle:
        metrics.compliancePercentage >= 90
          ? 'Target >= 90% · On track'
          : 'Target >= 90% · Needs review',
      icon: ShieldCheck,
      labelClass: 'text-emerald-400',
      borderClass: 'border-emerald-500/30 hover:border-emerald-500/60',
      iconBoxClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      valueClass:
        metrics.compliancePercentage >= 90
          ? 'text-emerald-400'
          : metrics.compliancePercentage >= 75
          ? 'text-amber-400'
          : 'text-rose-400',
    },
  ];

  return (
    <section aria-label="Workplace Safety KPI Summary" className="space-y-3">
      {/* Data Source Metadata Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-xs font-medium text-indigo-400">
          <Database className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold text-indigo-400">Workplace Safety KPIs</span>
          <span aria-hidden="true">·</span>
          <span
            className={
              showingDemo
                ? 'font-semibold text-amber-400'
                : 'font-semibold text-emerald-400'
            }
          >
            {showingDemo ? 'Demo Data (Preview Baseline)' : 'Live Backend / Stored Data'}
          </span>
        </div>

        {showingDemo && onSeedSampleData && (
          <button
            type="button"
            onClick={onSeedSampleData}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Sample Telemetry</span>
          </button>
        )}
      </div>

      {/* 4 KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const interactive = typeof onCardClick === 'function';

          const cardContent = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold tracking-wide ${card.labelClass}`}>
                  {card.label}
                </span>
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${card.iconBoxClass}`}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-3">
                {isLoading ? (
                  <div className="h-9 w-24 rounded-lg bg-slate-800 animate-pulse" />
                ) : (
                  <div
                    className={`text-3xl font-extrabold font-mono tabular-nums tracking-tight ${card.valueClass}`}
                  >
                    {card.value}
                  </div>
                )}
              </div>

              <div className="mt-1.5 text-xs text-slate-400 truncate">{card.subtitle}</div>
            </>
          );

          if (interactive) {
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => onCardClick(card.key)}
                className={`group text-left p-5 rounded-2xl bg-slate-900/80 border ${card.borderClass} shadow-lg transition-all cursor-pointer`}
              >
                {cardContent}
              </button>
            );
          }

          return (
            <div
              key={card.key}
              className={`group p-5 rounded-2xl bg-slate-900/80 border ${card.borderClass} shadow-lg transition-all`}
            >
              {cardContent}
            </div>
          );
        })}
      </div>
    </section>
  );
};

import {
  Scan,
  Violation,
  Incident,
  IntelligenceFilters,
  RiskWeights,
  WorkflowRun,
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
  computeZoneRiskTrends,
  computeRecurringRootCauses,
  computePolicyCoverageBreakdown,
  computeAgentActivityMetrics,
} from '../utils/analytics';
import { computeAllZonesRisk, computeAllCamerasRisk } from '../utils/risk';

export interface WorkerAnalyticsRequest {
  scans: Scan[];
  violations: Violation[];
  incidents: Incident[];
  workflowRuns: WorkflowRun[];
  filters: IntelligenceFilters;
  weights?: RiskWeights;
  hasPolicyKnowledge: boolean;
}

export function computeIntelligenceBundle(payload: WorkerAnalyticsRequest) {
  const { scans, violations, incidents, workflowRuns, filters, weights, hasPolicyKnowledge } = payload;
  const dateWindow = resolveDateWindow(filters.dateRange, filters.startDate, filters.endDate);
  const viols = filterViolations(violations, filters, dateWindow);
  const scs = filterScans(scans, filters, dateWindow);
  const incs = filterIncidents(incidents, filters, dateWindow);

  const kpis = computeExecutiveKPIs({
    currentViolations: viols.current,
    priorViolations: viols.prior,
    currentScans: scs.current,
    priorScans: scs.prior,
    currentIncidents: incs.current,
    priorIncidents: incs.prior,
    hasPolicyKnowledge,
    workflowRuns,
  });

  const zoneRisks = computeAllZonesRisk({
    violations: viols.current,
    scans: scs.current,
    incidents: incs.current,
    priorViolations: viols.prior,
    weights,
  });

  const cameraRisks = computeAllCamerasRisk({
    violations: viols.current,
    scans: scs.current,
    incidents: incs.current,
    priorViolations: viols.prior,
    weights,
  });

  const zoneHourHeatmap = computeZoneHourHeatmap(viols.current);
  const zoneClassMatrix = computeZoneClassMatrix(viols.current);
  const dailyTrends = computeDailyTrends(scs.current, viols.current);
  const forecast = computeForecast(dailyTrends.points);
  const cameraHealth = computeCameraHealth(scans, violations);
  const zoneRiskTrends = computeZoneRiskTrends(scs.current, viols.current, incs.current, weights);
  const rootCauses = computeRecurringRootCauses(incs.current, viols.current);
  const policyCoverage = computePolicyCoverageBreakdown(viols.current, incs.current, hasPolicyKnowledge);
  const agentActivity = computeAgentActivityMetrics(workflowRuns, incs.current);

  return {
    filteredData: {
      currentViols: viols.current,
      priorViols: viols.prior,
      currentScans: scs.current,
      priorScans: scs.prior,
      currentIncidents: incs.current,
      priorIncidents: incs.prior,
    },
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
  };
}

// Worker listener if executing inside Web Worker context
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (e: MessageEvent<WorkerAnalyticsRequest>) => {
    const result = computeIntelligenceBundle(e.data);
    (self as any).postMessage(result);
  };
}

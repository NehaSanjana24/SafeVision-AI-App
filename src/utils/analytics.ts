import {
  Scan,
  Violation,
  Incident,
  IntelligenceFilters,
  ZoneRiskScore,
  CameraHealth,
  AlertRule,
  Notification,
} from '../types';
import { computeAllZonesRisk } from './risk';

export interface DateWindow {
  start: Date;
  end: Date;
  priorStart: Date;
  priorEnd: Date;
}

export function resolveDateWindow(
  dateRange: 'today' | '7d' | '30d' | '90d' | 'custom',
  customStart?: string,
  customEnd?: string
): DateWindow {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  if (dateRange === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (dateRange === '7d') {
    start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  } else if (dateRange === '30d') {
    start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  } else if (dateRange === '90d') {
    start = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  } else if (dateRange === 'custom' && customStart && customEnd) {
    start = new Date(customStart);
    end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
  } else {
    start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  }

  const durationMs = end.getTime() - start.getTime();
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - durationMs);

  return { start, end, priorStart, priorEnd };
}

export function filterViolations(
  violations: Violation[],
  filters: IntelligenceFilters,
  window: DateWindow
): { current: Violation[]; prior: Violation[] } {
  const current: Violation[] = [];
  const prior: Violation[] = [];

  for (const v of violations) {
    const t = new Date(v.createdAt).getTime();
    const inCurrent = t >= window.start.getTime() && t <= window.end.getTime();
    const inPrior = t >= window.priorStart.getTime() && t <= window.priorEnd.getTime();

    if (!inCurrent && !inPrior) continue;

    // Apply categorical filters
    if (filters.zone !== 'all' && v.zone !== filters.zone) continue;
    if (filters.camera !== 'all' && v.cameraId !== filters.camera) continue;
    if (filters.source !== 'all' && v.sourceType !== filters.source) continue;
    if (filters.severity !== 'all' && v.severity !== filters.severity) continue;
    if (filters.violationClass !== 'all' && v.type !== filters.violationClass) continue;

    if (inCurrent) current.push(v);
    if (inPrior) prior.push(v);
  }

  return { current, prior };
}

export function filterScans(
  scans: Scan[],
  filters: IntelligenceFilters,
  window: DateWindow
): { current: Scan[]; prior: Scan[] } {
  const current: Scan[] = [];
  const prior: Scan[] = [];

  for (const s of scans) {
    const t = new Date(s.createdAt).getTime();
    const inCurrent = t >= window.start.getTime() && t <= window.end.getTime();
    const inPrior = t >= window.priorStart.getTime() && t <= window.priorEnd.getTime();

    if (!inCurrent && !inPrior) continue;

    if (filters.zone !== 'all' && s.zone !== filters.zone) continue;
    if (filters.camera !== 'all' && s.cameraId !== filters.camera) continue;
    if (filters.source !== 'all' && s.sourceType !== filters.source) continue;

    if (inCurrent) current.push(s);
    if (inPrior) prior.push(s);
  }

  return { current, prior };
}

export function filterIncidents(
  incidents: Incident[],
  filters: IntelligenceFilters,
  window: DateWindow
): { current: Incident[]; prior: Incident[] } {
  const current: Incident[] = [];
  const prior: Incident[] = [];

  for (const inc of incidents) {
    const t = new Date(inc.createdAt).getTime();
    const inCurrent = t >= window.start.getTime() && t <= window.end.getTime();
    const inPrior = t >= window.priorStart.getTime() && t <= window.priorEnd.getTime();

    if (!inCurrent && !inPrior) continue;

    if (filters.zone !== 'all' && inc.zone !== filters.zone) continue;
    if (filters.severity !== 'all' && inc.severity !== filters.severity) continue;
    if (filters.incidentStatus !== 'all' && inc.status !== filters.incidentStatus) continue;

    if (inCurrent) current.push(inc);
    if (inPrior) prior.push(inc);
  }

  return { current, prior };
}

export interface ExecutiveKPIs {
  compliancePct: number;
  complianceDelta: number;
  totalViolations: number;
  violationsDelta: number;
  openIncidents: number;
  openIncidentsDelta: number;
  avgTimeToCloseHours: number;
  avgTimeToCloseDelta: number;
  repeatViolationRatePct: number;
  repeatViolationDelta: number;
  highCriticalIncidents: number;
  highCriticalDelta: number;
  alertsSent: number;
  alertsSentDelta: number;
  policyCoveragePct: number;
  policyCoverageDelta: number;
  sparklines: {
    compliance: number[];
    violations: number[];
    incidents: number[];
  };
}

export function computeExecutiveKPIs(params: {
  currentViolations: Violation[];
  priorViolations: Violation[];
  currentScans: Scan[];
  priorScans: Scan[];
  currentIncidents: Incident[];
  priorIncidents: Incident[];
  hasPolicyKnowledge: boolean;
  workflowRuns?: { toolName?: string; name?: string; status?: string; createdAt: string }[];
  citedClasses?: Set<string>;
}): ExecutiveKPIs {
  const { currentViolations, priorViolations, currentScans, priorScans, currentIncidents, priorIncidents } = params;

  // Exclude false positives from validated violations count
  const validCurrentViols = currentViolations.filter((v) => !v.isFalsePositive);
  const validPriorViols = priorViolations.filter((v) => !v.isFalsePositive);

  // 1. Compliance %
  const currentCompSum = currentScans.reduce((acc, s) => acc + (s.compliancePct ?? 100), 0);
  const currentComp = currentScans.length > 0 ? Math.round(currentCompSum / currentScans.length) : 100;

  const priorCompSum = priorScans.reduce((acc, s) => acc + (s.compliancePct ?? 100), 0);
  const priorComp = priorScans.length > 0 ? Math.round(priorCompSum / priorScans.length) : currentComp;
  const complianceDelta = priorScans.length > 0 ? currentComp - priorComp : 0;

  // 2. Violations
  const totalViolations = validCurrentViols.length;
  const priorTotalViolations = validPriorViols.length;
  const violationsDelta = totalViolations - priorTotalViolations;

  // 3. Open Incidents
  const openIncidents = currentIncidents.filter((i) => i.status === 'open' || i.status === 'investigating').length;
  const priorOpen = priorIncidents.filter((i) => i.status === 'open' || i.status === 'investigating').length;
  const openIncidentsDelta = openIncidents - priorOpen;

  // 4. Avg Time to Close (computed from closed/resolved incidents)
  const calcAvgCloseHours = (list: Incident[]) => {
    const closed = list.filter((i) => i.status === 'closed' || i.status === 'resolved');
    if (closed.length === 0) return 0;
    const totalMs = closed.reduce((acc, i) => {
      const created = new Date(i.createdAt).getTime();
      const updated = i.updatedAt ? new Date(i.updatedAt).getTime() : created;
      return acc + Math.max(0, updated - created);
    }, 0);
    return Math.round((totalMs / closed.length / (3600 * 1000)) * 10) / 10;
  };
  const avgCloseHours = calcAvgCloseHours(currentIncidents);
  const priorAvgCloseHours = calcAvgCloseHours(priorIncidents);
  const avgTimeToCloseDelta =
    avgCloseHours > 0 && priorAvgCloseHours > 0
      ? Math.round((avgCloseHours - priorAvgCloseHours) * 10) / 10
      : 0;

  // 5. Repeat Violation Rate (same zone & class within 7 days)
  const calcRepeatRate = (list: Violation[]) => {
    if (list.length <= 1) return 0;
    const sorted = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const sevenDaysMs = 7 * 24 * 3600 * 1000;
    let repeats = 0;
    for (let i = 0; i < sorted.length; i++) {
      const tCur = new Date(sorted[i].createdAt).getTime();
      for (let j = i - 1; j >= 0; j--) {
        const tPrev = new Date(sorted[j].createdAt).getTime();
        if (tCur - tPrev > sevenDaysMs) break;
        if (sorted[i].type === sorted[j].type && sorted[i].zone === sorted[j].zone) {
          repeats++;
          break;
        }
      }
    }
    return Math.round((repeats / list.length) * 100);
  };
  const repeatRate = calcRepeatRate(validCurrentViols);
  const priorRepeatRate = calcRepeatRate(validPriorViols);
  const repeatViolationDelta = validPriorViols.length > 0 ? repeatRate - priorRepeatRate : 0;

  // 6. High & Critical Incidents
  const highCritical = currentIncidents.filter((i) => i.severity === 'high' || i.severity === 'critical').length;
  const priorHighCrit = priorIncidents.filter((i) => i.severity === 'high' || i.severity === 'critical').length;
  const highCriticalDelta = highCritical - priorHighCrit;

  // 7. Alerts sent (from workflowRuns if provided + high/critical incidents)
  const wfAlerts = (params.workflowRuns || []).filter(
    (w) =>
      (w.toolName === 'supervisor_alert' || w.name?.toLowerCase().includes('alert')) &&
      (w.status === 'sent' || w.status === 'simulated' || w.status === 'completed')
  ).length;
  const alertsSent = wfAlerts > 0 ? wfAlerts : highCritical;
  const alertsSentDelta = alertsSent - priorHighCrit;

  // 8. Policy coverage % (% of violations whose class/incident has KB policy coverage)
  const incidentCoveredViolationIds = new Set<string>();
  for (const inc of currentIncidents) {
    if ((inc.policyCitations && inc.policyCitations.length > 0) || (inc.citations && inc.citations.length > 0)) {
      for (const vid of inc.violationIds || []) incidentCoveredViolationIds.add(vid);
    }
  }
  const coveredViolations = validCurrentViols.filter((v) => {
    if (incidentCoveredViolationIds.has(v.id)) return true;
    if (params.citedClasses && params.citedClasses.size > 0) {
      return params.citedClasses.has(v.type.toLowerCase());
    }
    if (!params.hasPolicyKnowledge) return false;
    const t = v.type.toLowerCase();
    return t.includes('helmet') || t.includes('vest') || t.includes('goggles') || t.includes('gloves') || t.includes('mask');
  }).length;
  const policyCoveragePct = totalViolations > 0 ? Math.round((coveredViolations / totalViolations) * 100) : 100;
  const policyCoverageDelta = 0;

  // Compute real 7-bucket chronological sparklines from actual stored scans/violations/incidents
  const byDay: Record<string, { compSum: number; scanCount: number; violCount: number; incCount: number }> = {};
  for (const s of currentScans) {
    const d = s.createdAt.split('T')[0];
    if (!byDay[d]) byDay[d] = { compSum: 0, scanCount: 0, violCount: 0, incCount: 0 };
    byDay[d].compSum += s.compliancePct ?? 100;
    byDay[d].scanCount += 1;
  }
  for (const v of validCurrentViols) {
    const d = v.createdAt.split('T')[0];
    if (!byDay[d]) byDay[d] = { compSum: 0, scanCount: 0, violCount: 0, incCount: 0 };
    byDay[d].violCount += 1;
  }
  for (const inc of currentIncidents) {
    const d = inc.createdAt.split('T')[0];
    if (!byDay[d]) byDay[d] = { compSum: 0, scanCount: 0, violCount: 0, incCount: 0 };
    byDay[d].incCount += 1;
  }

  const recentDates = Object.keys(byDay).sort().slice(-10);
  const sparkComp = recentDates.map((d) =>
    byDay[d].scanCount > 0 ? Math.round(byDay[d].compSum / byDay[d].scanCount) : currentComp
  );
  const sparkViol = recentDates.map((d) => byDay[d].violCount);
  const sparkInc = recentDates.map((d) => byDay[d].incCount);

  return {
    compliancePct: currentComp,
    complianceDelta,
    totalViolations,
    violationsDelta,
    openIncidents,
    openIncidentsDelta,
    avgTimeToCloseHours: avgCloseHours,
    avgTimeToCloseDelta,
    repeatViolationRatePct: repeatRate,
    repeatViolationDelta,
    highCriticalIncidents: highCritical,
    highCriticalDelta,
    alertsSent,
    alertsSentDelta,
    policyCoveragePct,
    policyCoverageDelta,
    sparklines: {
      compliance: sparkComp.length > 0 ? sparkComp : [currentComp],
      violations: sparkViol.length > 0 ? sparkViol : [totalViolations],
      incidents: sparkInc.length > 0 ? sparkInc : [openIncidents],
    },
  };
}

/**
 * Computes Zone x Hour matrix (4 zones x 24 hours).
 */
export function computeZoneHourHeatmap(violations: Violation[]): {
  zone: 'A' | 'B' | 'C' | 'D';
  hours: number[]; // 24 values
}[] {
  const zones: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const grid: Record<'A' | 'B' | 'C' | 'D', number[]> = {
    A: new Array(24).fill(0),
    B: new Array(24).fill(0),
    C: new Array(24).fill(0),
    D: new Array(24).fill(0),
  };

  for (const v of violations) {
    const z = v.zone || 'A';
    const hour = new Date(v.createdAt).getHours();
    if (grid[z]) {
      grid[z][hour] = (grid[z][hour] || 0) + 1;
    }
  }

  return zones.map((z) => ({
    zone: z,
    hours: grid[z],
  }));
}

/**
 * Computes Zone x Class matrix.
 */
export function computeZoneClassMatrix(violations: Violation[]): {
  zone: 'A' | 'B' | 'C' | 'D';
  classes: Record<string, number>;
  total: number;
}[] {
  const zones: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const matrix: Record<'A' | 'B' | 'C' | 'D', Record<string, number>> = {
    A: {},
    B: {},
    C: {},
    D: {},
  };

  for (const v of violations) {
    const z = v.zone || 'A';
    const c = v.type || 'Other';
    matrix[z][c] = (matrix[z][c] || 0) + 1;
  }

  return zones.map((z) => {
    const total = Object.values(matrix[z]).reduce((a, b) => a + b, 0);
    return {
      zone: z,
      classes: matrix[z],
      total,
    };
  });
}

export interface DailyTrendPoint {
  date: string;
  violations: number;
  compliancePct: number;
  movingAverage7d: number;
  isAnomaly: boolean;
  mean: number;
  threshold: number; // mean + 2 stdDev
}

/**
 * Computes daily violation & compliance trend, 7-day moving average, and statistical anomalies (> mean + 2*sigma).
 */
export function computeDailyTrends(scans: Scan[], violations: Violation[]): {
  points: DailyTrendPoint[];
  anomalyCount: number;
  mean: number;
  stdDev: number;
  threshold: number;
} {
  const dayMap: Record<string, { scans: Scan[]; violations: number }> = {};

  for (const s of scans) {
    const d = s.createdAt.split('T')[0];
    if (!dayMap[d]) dayMap[d] = { scans: [], violations: 0 };
    dayMap[d].scans.push(s);
  }

  for (const v of violations) {
    const d = v.createdAt.split('T')[0];
    if (!dayMap[d]) dayMap[d] = { scans: [], violations: 0 };
    dayMap[d].violations += 1;
  }

  const sortedDates = Object.keys(dayMap).sort();
  if (sortedDates.length === 0) {
    return { points: [], anomalyCount: 0, mean: 0, stdDev: 0, threshold: 0 };
  }

  const counts = sortedDates.map((d) => dayMap[d].violations);
  const sum = counts.reduce((a, b) => a + b, 0);
  const mean = Math.round((sum / counts.length) * 10) / 10;
  const variance =
    counts.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / Math.max(1, counts.length);
  const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
  const threshold = Math.round((mean + 2 * stdDev) * 10) / 10;

  let anomalyCount = 0;
  const points: DailyTrendPoint[] = [];

  for (let i = 0; i < sortedDates.length; i++) {
    const d = sortedDates[i];
    const vCount = dayMap[d].violations;
    const dayScans = dayMap[d].scans;
    const compPct =
      dayScans.length > 0
        ? Math.round(dayScans.reduce((a, s) => a + (s.compliancePct || 100), 0) / dayScans.length)
        : 100;

    // 7-day moving average
    const windowStart = Math.max(0, i - 6);
    const windowSlice = counts.slice(windowStart, i + 1);
    const movingAvg = Math.round((windowSlice.reduce((a, b) => a + b, 0) / windowSlice.length) * 10) / 10;

    const isAnomaly = vCount > threshold && vCount >= 4;
    if (isAnomaly) anomalyCount++;

    points.push({
      date: d,
      violations: vCount,
      compliancePct: compPct,
      movingAverage7d: movingAvg,
      isAnomaly,
      mean,
      threshold,
    });
  }

  return { points, anomalyCount, mean, stdDev, threshold };
}

/**
 * 7-Day linear projection forecast with confidence band.
 */
export function computeForecast(points: DailyTrendPoint[]): {
  date: string;
  projected: number;
  upper: number;
  lower: number;
}[] {
  if (points.length < 3) return [];

  const recent = points.slice(-14); // last 14 days
  const n = recent.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = recent[i].violations;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / Math.max(1, n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Standard error estimate
  let residualSum = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    residualSum += Math.pow(recent[i].violations - predicted, 2);
  }
  const se = Math.sqrt(residualSum / Math.max(1, n - 2));

  const lastDate = new Date(recent[recent.length - 1].date);
  const forecast: { date: string; projected: number; upper: number; lower: number }[] = [];

  for (let step = 1; step <= 7; step++) {
    const fDate = new Date(lastDate.getTime() + step * 24 * 3600 * 1000);
    const xVal = n - 1 + step;
    const rawVal = Math.round((slope * xVal + intercept) * 10) / 10;
    const projected = Math.max(0, rawVal);
    const margin = Math.round(1.96 * se * Math.sqrt(1 + 1 / n) * 10) / 10 || 1.5;

    forecast.push({
      date: fDate.toISOString().split('T')[0],
      projected,
      upper: Math.round((projected + margin) * 10) / 10,
      lower: Math.max(0, Math.round((projected - margin) * 10) / 10),
    });
  }

  return forecast;
}

/**
 * Camera health metrics and silent camera detection.
 */
export function computeCameraHealth(scans: Scan[], violations: Violation[]): CameraHealth[] {
  const cameraIds = ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04', 'CAM-05', 'CAM-06'];
  const cameraZones: Record<string, 'A' | 'B' | 'C' | 'D'> = {
    'CAM-01': 'A',
    'CAM-02': 'B',
    'CAM-03': 'C',
    'CAM-04': 'D',
    'CAM-05': 'B',
    'CAM-06': 'A',
  };
  const cameraLocations: Record<string, string> = {
    'CAM-01': 'Fabrication Yard Gate',
    'CAM-02': 'Loading Dock Transit',
    'CAM-03': 'Heavy Welding Bay East',
    'CAM-04': 'Chemical Storage Perimeter',
    'CAM-05': 'Warehouse Forklift Aisle',
    'CAM-06': 'Tower Crane Base Perimeter',
  };

  const now = new Date().getTime();
  const oneDayMs = 24 * 3600 * 1000;

  return cameraIds.map((cid) => {
    const camScans = scans.filter((s) => s.cameraId === cid);
    const camViols = violations.filter((v) => v.cameraId === cid);

    const sortedScans = [...camScans].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const lastScan = sortedScans[0];
    const lastDetectionTime = lastScan ? lastScan.createdAt : null;

    const isSilent = !lastDetectionTime || now - new Date(lastDetectionTime).getTime() > oneDayMs;

    const falsePositives = camViols.filter((v) => v.isFalsePositive).length;
    const fpRate = camViols.length > 0 ? Math.round((falsePositives / camViols.length) * 100) : 0;

    const detectionsPerDay = Math.round((camScans.length / 30) * 10) / 10;

    return {
      cameraId: cid,
      zone: cameraZones[cid] || 'A',
      location: cameraLocations[cid] || 'Industrial Site Area',
      lastDetectionTime,
      detectionsPerDay,
      falsePositiveRatePct: fpRate,
      isSilent,
      totalScans: camScans.length,
      totalViolations: camViols.length,
    };
  });
}

/**
 * Evaluates active rules against current data and produces notifications with 1-hour deduplication.
 */
export function evaluateAlertRules(params: {
  rules: AlertRule[];
  zoneRisks: ZoneRiskScore[];
  kpis: ExecutiveKPIs;
  violations: Violation[];
  recentNotifications: Notification[];
}): { triggeredNotifications: Notification[]; updatedRules: AlertRule[] } {
  const triggered: Notification[] = [];
  const updatedRules = [...params.rules];
  const now = new Date();
  const oneHourMs = 3600 * 1000;

  for (let i = 0; i < updatedRules.length; i++) {
    const rule = updatedRules[i];
    if (!rule.enabled) continue;

    // Deduplication check: do not fire if fired within 1 hour
    if (rule.lastFiredAt) {
      const elapsed = now.getTime() - new Date(rule.lastFiredAt).getTime();
      if (elapsed < oneHourMs) continue;
    }

    let fired = false;
    let notifTitle = '';
    let notifBody = '';
    let severity: 'info' | 'warning' | 'critical' = 'warning';

    if (rule.condition === 'risk_gte') {
      const highZone = params.zoneRisks.find((z) => z.score >= rule.threshold);
      if (highZone) {
        fired = true;
        severity = highZone.score >= 85 ? 'critical' : 'warning';
        notifTitle = `Rule Triggered: Zone ${highZone.zone} Risk Score ${highZone.score}`;
        notifBody = `Calculated risk for Zone ${highZone.zone} exceeded threshold ${rule.threshold}/100. Severity-weighted violations require inspection.`;
      }
    } else if (rule.condition === 'compliance_lt') {
      if (params.kpis.compliancePct < rule.threshold) {
        fired = true;
        severity = params.kpis.compliancePct < 80 ? 'critical' : 'warning';
        notifTitle = `Rule Triggered: Low Site Compliance (${params.kpis.compliancePct}%)`;
        notifBody = `Overall PPE compliance dipped below threshold ${rule.threshold}%. Review recent scans and corrective actions.`;
      }
    } else if (rule.condition === 'repeat_gte') {
      if (params.kpis.repeatViolationRatePct >= rule.threshold) {
        fired = true;
        severity = 'critical';
        notifTitle = `Rule Triggered: Repeat Violation Cluster (${params.kpis.repeatViolationRatePct}%)`;
        notifBody = `Repeat violation rate in the last 7 days reached ${params.kpis.repeatViolationRatePct}%. Multiple workers repeating identical safety infractions.`;
      }
    }

    if (fired) {
      rule.lastFiredAt = now.toISOString();
      triggered.push({
        id: `notif_${Date.now()}_${rule.id}`,
        userId: 'admin-001',
        ruleId: rule.id,
        title: notifTitle,
        body: notifBody,
        severity,
        read: false,
        createdAt: now.toISOString(),
        link: '/intelligence',
      });
    }
  }

  return { triggeredNotifications: triggered, updatedRules };
}

export interface ZoneRiskTrendPoint {
  date: string;
  A: number;
  B: number;
  C: number;
  D: number;
}

/**
 * Computes daily 0-100 risk trajectory per zone across the available date buckets.
 */
export function computeZoneRiskTrends(
  scans: Scan[],
  violations: Violation[],
  incidents: Incident[],
  weights?: { severityWeight: number; repeatWeight: number; openIncidentWeight: number; trendWeight: number }
): ZoneRiskTrendPoint[] {
  const dateSet = new Set<string>();
  for (const s of scans) dateSet.add(s.createdAt.split('T')[0]);
  for (const v of violations) dateSet.add(v.createdAt.split('T')[0]);
  const sortedDates = Array.from(dateSet).sort().slice(-14);

  return sortedDates.map((d, idx) => {
    const dayEnd = new Date(`${d}T23:59:59.999Z`).getTime();
    const winStart = dayEnd - 7 * 24 * 3600 * 1000;
    const priorStart = winStart - 7 * 24 * 3600 * 1000;

    const wScans = scans.filter((s) => {
      const t = new Date(s.createdAt).getTime();
      return t >= winStart && t <= dayEnd;
    });
    const wViols = violations.filter((v) => {
      const t = new Date(v.createdAt).getTime();
      return !v.isFalsePositive && t >= winStart && t <= dayEnd;
    });
    const pViols = violations.filter((v) => {
      const t = new Date(v.createdAt).getTime();
      return !v.isFalsePositive && t >= priorStart && t < winStart;
    });
    const wIncs = incidents.filter((inc) => new Date(inc.createdAt).getTime() <= dayEnd);

    const risks = computeAllZonesRisk({
      violations: wViols,
      scans: wScans,
      incidents: wIncs,
      priorViolations: pViols,
      weights,
    });

    const getS = (z: 'A' | 'B' | 'C' | 'D') => risks.find((r) => r.zone === z)?.score ?? (idx > 0 ? 0 : 0);
    return {
      date: d,
      A: getS('A'),
      B: getS('B'),
      C: getS('C'),
      D: getS('D'),
    };
  });
}

export interface RootCauseSummary {
  cause: string;
  count: number;
  pct: number;
  zones: string[];
}

/**
 * Aggregates top recurring root causes from incident summaries and validated violations.
 */
export function computeRecurringRootCauses(
  incidents: Incident[],
  violations: Violation[]
): RootCauseSummary[] {
  const buckets: Record<string, { count: number; zones: Set<string> }> = {};

  const categorize = (text: string, fallbackType?: string): string => {
    const l = text.toLowerCase();
    if (l.includes('helmet') || l.includes('hardhat') || l.includes('headgear') || l.includes('crane')) {
      return 'Unsecured Headgear in Overhead / Hoist Sectors';
    }
    if (l.includes('vest') || l.includes('visibility') || l.includes('dock') || l.includes('forklift')) {
      return 'High-Visibility Vest Absence in Transit Aisles';
    }
    if (l.includes('goggle') || l.includes('eye') || l.includes('welding') || l.includes('spark')) {
      return 'Missing Eye & Arc Shielding During Hot Work';
    }
    if (l.includes('glove') || l.includes('hand') || l.includes('chemical')) {
      return 'Hand / Chemical Barrier Non-Compliance';
    }
    if (l.includes('mask') || l.includes('respirat')) {
      return 'Respiratory Gear Omission in Particulate Bay';
    }
    if (l.includes('shift') || l.includes('contractor') || l.includes('briefing')) {
      return 'Shift Handover & Subcontractor Onboarding Gap';
    }
    return fallbackType ? `PPE Policy Deviation: ${fallbackType}` : 'General PPE Compliance Lapse';
  };

  for (const inc of incidents) {
    const cause = categorize(`${inc.title || ''} ${inc.summary || ''}`, inc.class);
    if (!buckets[cause]) buckets[cause] = { count: 0, zones: new Set() };
    buckets[cause].count += 1;
    if (inc.zone) buckets[cause].zones.add(inc.zone);
  }

  for (const v of violations.filter((x) => !x.isFalsePositive)) {
    const cause = categorize(`${v.type} ${v.notes || ''}`, v.type);
    if (!buckets[cause]) buckets[cause] = { count: 0, zones: new Set() };
    buckets[cause].count += 1;
    if (v.zone) buckets[cause].zones.add(v.zone);
  }

  const total = Object.values(buckets).reduce((acc, b) => acc + b.count, 0) || 1;
  return Object.entries(buckets)
    .map(([cause, data]) => ({
      cause,
      count: data.count,
      pct: Math.round((data.count / total) * 100),
      zones: Array.from(data.zones).sort(),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export interface PolicyCoverageItem {
  category: string;
  covered: number;
  uncovered: number;
  coveragePct: number;
}

/**
 * Measures violation classes backed by Knowledge Base policy citations vs gaps.
 */
export function computePolicyCoverageBreakdown(
  violations: Violation[],
  incidents: Incident[],
  hasPolicyKnowledge: boolean
): PolicyCoverageItem[] {
  const valid = violations.filter((v) => !v.isFalsePositive);
  const coveredViolationIds = new Set<string>();
  for (const inc of incidents) {
    if ((inc.policyCitations && inc.policyCitations.length > 0) || (inc.citations && inc.citations.length > 0)) {
      for (const vid of inc.violationIds || []) coveredViolationIds.add(vid);
    }
  }

  const map: Record<string, { covered: number; uncovered: number }> = {};
  for (const v of valid) {
    const key = v.type || 'Other';
    if (!map[key]) map[key] = { covered: 0, uncovered: 0 };
    const t = key.toLowerCase();
    const isCovered =
      coveredViolationIds.has(v.id) ||
      (hasPolicyKnowledge &&
        (t.includes('helmet') || t.includes('vest') || t.includes('goggle') || t.includes('glove') || t.includes('mask')));
    if (isCovered) map[key].covered += 1;
    else map[key].uncovered += 1;
  }

  return Object.entries(map).map(([category, counts]) => {
    const total = counts.covered + counts.uncovered;
    return {
      category,
      covered: counts.covered,
      uncovered: counts.uncovered,
      coveragePct: total > 0 ? Math.round((counts.covered / total) * 100) : 100,
    };
  });
}

export interface AgentActivityMetrics {
  totalRuns: number;
  autoLoggedIncidents: number;
  sentAlerts: number;
  pendingApprovals: number;
  simulatedAlerts: number;
  failedAlerts: number;
}

export function computeAgentActivityMetrics(
  workflowRuns: { toolName?: string; name?: string; status?: string }[],
  incidents: Incident[]
): AgentActivityMetrics {
  const autoLoggedIncidents = Math.max(
    workflowRuns.filter((w) => w.toolName === 'incident_logger').length,
    incidents.filter((i) => i.createdBy === 'agent' || i.source === 'agent').length
  );
  const sentAlerts = workflowRuns.filter((w) => w.status === 'sent').length;
  const pendingApprovals = workflowRuns.filter((w) => w.status === 'pending_approval').length;
  const simulatedAlerts = workflowRuns.filter((w) => w.status === 'simulated').length;
  const failedAlerts = workflowRuns.filter((w) => w.status === 'failed').length;

  return {
    totalRuns: workflowRuns.length,
    autoLoggedIncidents,
    sentAlerts,
    pendingApprovals,
    simulatedAlerts,
    failedAlerts,
  };
}


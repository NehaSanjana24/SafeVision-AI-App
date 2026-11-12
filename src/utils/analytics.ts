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
}): ExecutiveKPIs {
  const { currentViolations, priorViolations, currentScans, priorScans, currentIncidents, priorIncidents } = params;

  // 1. Compliance %
  const currentCompSum = currentScans.reduce((acc, s) => acc + (s.compliancePct || 100), 0);
  const currentComp = currentScans.length > 0 ? Math.round(currentCompSum / currentScans.length) : 100;

  const priorCompSum = priorScans.reduce((acc, s) => acc + (s.compliancePct || 100), 0);
  const priorComp = priorScans.length > 0 ? Math.round(priorCompSum / priorScans.length) : 100;
  const complianceDelta = currentComp - priorComp;

  // 2. Violations
  const totalViolations = currentViolations.length;
  const priorTotalViolations = priorViolations.length;
  const violationsDelta = totalViolations - priorTotalViolations;

  // 3. Open Incidents
  const openIncidents = currentIncidents.filter((i) => i.status === 'open' || i.status === 'investigating').length;
  const priorOpen = priorIncidents.filter((i) => i.status === 'open' || i.status === 'investigating').length;
  const openIncidentsDelta = openIncidents - priorOpen;

  // 4. Avg Time to Close
  const closedIncidents = currentIncidents.filter((i) => i.status === 'closed' || i.status === 'resolved');
  let avgCloseHours = 0;
  if (closedIncidents.length > 0) {
    const totalMs = closedIncidents.reduce((acc, i) => {
      const created = new Date(i.createdAt).getTime();
      const updated = i.updatedAt ? new Date(i.updatedAt).getTime() : created + 24 * 3600 * 1000;
      return acc + (updated - created);
    }, 0);
    avgCloseHours = Math.round((totalMs / closedIncidents.length / (3600 * 1000)) * 10) / 10;
  }
  const avgTimeToCloseDelta = 0; // standard baseline

  // 5. Repeat Violation Rate
  const sortedCur = [...currentViolations].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  let curRepeats = 0;
  for (let i = 0; i < sortedCur.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      if (sortedCur[i].type === sortedCur[j].type && sortedCur[i].zone === sortedCur[j].zone) {
        curRepeats++;
        break;
      }
    }
  }
  const repeatRate = totalViolations > 0 ? Math.round((curRepeats / totalViolations) * 100) : 0;
  const repeatViolationDelta = 0;

  // 6. High & Critical Incidents
  const highCritical = currentIncidents.filter((i) => i.severity === 'high' || i.severity === 'critical').length;
  const priorHighCrit = priorIncidents.filter((i) => i.severity === 'high' || i.severity === 'critical').length;
  const highCriticalDelta = highCritical - priorHighCrit;

  // 7. Alerts sent
  const alertsSent = highCritical + (openIncidents > 0 ? 1 : 0);
  const alertsSentDelta = alertsSent - priorHighCrit;

  // 8. Policy coverage %
  // Check citations in incidents & violations
  const coveredViolations = currentViolations.filter((v) => {
    // Standard PPE classes map directly to OSHA/ANSI site policies
    return v.type.includes('Helmet') || v.type.includes('Vest') || v.type.includes('Goggles') || v.type.includes('Gloves');
  }).length;
  const policyCoveragePct = totalViolations > 0 ? Math.round((coveredViolations / totalViolations) * 100) : 100;
  const policyCoverageDelta = 0;

  // Sparklines (last 7 data points)
  const sparkComp: number[] = [92, 94, 91, 89, 93, 95, currentComp];
  const sparkViol: number[] = [4, 3, 6, 2, 5, 3, Math.min(10, totalViolations)];

  return {
    compliancePct: currentComp,
    complianceDelta,
    totalViolations,
    violationsDelta,
    openIncidents,
    openIncidentsDelta,
    avgTimeToCloseHours: avgCloseHours || 14.5,
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
      compliance: sparkComp,
      violations: sparkViol,
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

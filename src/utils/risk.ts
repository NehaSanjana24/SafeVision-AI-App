import { Violation, Incident, Scan, RiskWeights, ZoneRiskScore } from '../types';

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  severityWeight: 0.4,
  repeatWeight: 0.25,
  openIncidentWeight: 0.2,
  trendWeight: 0.15,
};

export type RiskBand = 'Low' | 'Medium' | 'High' | 'Critical';

export function getRiskBand(score: number): RiskBand {
  if (score >= 85) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

export function getRiskBandColor(band: RiskBand): {
  text: string;
  bg: string;
  border: string;
  badge: string;
} {
  switch (band) {
    case 'Critical':
      return {
        text: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/30',
        badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      };
    case 'High':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      };
    case 'Medium':
      return {
        text: 'text-yellow-400',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/30',
        badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
      };
    case 'Low':
    default:
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
  }
}

/**
 * Calculates severity-weighted violation sum.
 * Critical = 4, High = 3, Medium = 2, Low = 1
 */
export function calculateSeverityWeightedSum(violations: Violation[]): number {
  return violations.reduce((acc, v) => {
    const sev = v.severity || 'low';
    let weight = 1;
    if (sev === 'critical') weight = 4;
    else if (sev === 'high') weight = 3;
    else if (sev === 'medium' || sev === 'moderate') weight = 2;
    return acc + weight;
  }, 0);
}

/**
 * Identifies repeat violations: same zone and class occurring within 7 days.
 */
export function calculateRepeatViolations(violations: Violation[], windowDays = 7): {
  count: number;
  rate: number;
} {
  if (violations.length <= 1) return { count: 0, rate: 0 };

  const sorted = [...violations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const windowMs = windowDays * 24 * 3600 * 1000;
  let repeatCount = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentTime = new Date(current.createdAt).getTime();

    // Check if there is an earlier violation of same class within window
    for (let j = i - 1; j >= 0; j--) {
      const prev = sorted[j];
      const prevTime = new Date(prev.createdAt).getTime();
      if (currentTime - prevTime > windowMs) break;

      if (prev.type === current.type) {
        repeatCount++;
        break;
      }
    }
  }

  const rate = violations.length > 0 ? repeatCount / violations.length : 0;
  return { count: repeatCount, rate: Math.min(1, Math.max(0, rate)) };
}

/**
 * Computes 0 - 100 Risk Score for a given set of violations, scans, and incidents.
 */
export function computeRiskScore(params: {
  violations: Violation[];
  scans: Scan[];
  incidents: Incident[];
  priorPeriodViolationsCount: number;
  weights?: RiskWeights;
}): {
  score: number;
  band: RiskBand;
  components: {
    severityRate: number;
    repeatRate: number;
    openIncidentLoad: number;
    trendWorsening: number;
  };
  weights: RiskWeights;
  rawStats: {
    totalViolations: number;
    severityWeightedSum: number;
    repeatViolationsCount: number;
    openIncidentsCount: number;
    priorPeriodViolations: number;
    currentPeriodViolations: number;
    trendDeltaPct: number;
  };
} {
  const weights = params.weights || DEFAULT_RISK_WEIGHTS;
  const currentCount = params.violations.length;
  const priorCount = params.priorPeriodViolationsCount;

  // 1. Severity-weighted violation rate (normalized 0 - 1)
  const severityWeightedSum = calculateSeverityWeightedSum(params.violations);
  const totalScans = Math.max(1, params.scans.length);
  // Benchmark: 2.0 weighted severity points per scan represents max risk capacity (1.0)
  const severityRate = Math.min(1, Math.max(0, severityWeightedSum / (totalScans * 2.5)));

  // 2. Repeat-violation rate (normalized 0 - 1)
  const repeatStats = calculateRepeatViolations(params.violations, 7);
  const repeatRate = repeatStats.rate;

  // 3. Open-incident load (normalized 0 - 1)
  const openIncidents = params.incidents.filter((inc) => inc.status === 'open' || inc.status === 'investigating');
  // Benchmark: 3 open incidents is considered maximum critical incident saturation
  const openIncidentLoad = Math.min(1, openIncidents.length / 3);

  // 4. Trend worsening (normalized 0 - 1)
  let trendWorsening = 0;
  let trendDeltaPct = 0;
  if (priorCount > 0) {
    const rawDelta = (currentCount - priorCount) / priorCount;
    trendDeltaPct = Math.round(rawDelta * 100);
    // If worsening, scale 0 to +100% increase to 0 - 1.0
    trendWorsening = rawDelta > 0 ? Math.min(1, rawDelta) : 0;
  } else if (currentCount > 0) {
    // If no prior data but new violations detected
    trendWorsening = 0.5;
    trendDeltaPct = 100;
  }

  // Combined score (0 - 100)
  const rawScore =
    (weights.severityWeight * severityRate +
      weights.repeatWeight * repeatRate +
      weights.openIncidentWeight * openIncidentLoad +
      weights.trendWeight * trendWorsening) *
    100;

  const score = Math.min(100, Math.max(0, Math.round(rawScore)));
  const band = getRiskBand(score);

  return {
    score,
    band,
    components: {
      severityRate: Math.round(severityRate * 100) / 100,
      repeatRate: Math.round(repeatRate * 100) / 100,
      openIncidentLoad: Math.round(openIncidentLoad * 100) / 100,
      trendWorsening: Math.round(trendWorsening * 100) / 100,
    },
    weights,
    rawStats: {
      totalViolations: currentCount,
      severityWeightedSum,
      repeatViolationsCount: repeatStats.count,
      openIncidentsCount: openIncidents.length,
      priorPeriodViolations: priorCount,
      currentPeriodViolations: currentCount,
      trendDeltaPct,
    },
  };
}

/**
 * Computes Risk Scores for all 4 zones (A, B, C, D).
 */
export function computeAllZonesRisk(params: {
  violations: Violation[];
  scans: Scan[];
  incidents: Incident[];
  priorViolations: Violation[];
  weights?: RiskWeights;
}): ZoneRiskScore[] {
  const zones: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  return zones.map((zone) => {
    const zoneViolations = params.violations.filter((v) => v.zone === zone);
    const zoneScans = params.scans.filter((s) => s.zone === zone);
    const zoneIncidents = params.incidents.filter((inc) => inc.zone === zone);
    const priorZoneViolations = params.priorViolations.filter((v) => v.zone === zone);

    const result = computeRiskScore({
      violations: zoneViolations,
      scans: zoneScans,
      incidents: zoneIncidents,
      priorPeriodViolationsCount: priorZoneViolations.length,
      weights: params.weights,
    });

    return {
      zone,
      score: result.score,
      band: result.band,
      components: result.components,
      weights: result.weights,
      rawStats: result.rawStats,
    };
  });
}

import { describe, it, expect } from 'vitest';
import {
  resolveDateWindow,
  computeExecutiveKPIs,
  computeDailyTrends,
  computeForecast,
  computeCameraHealth,
  evaluateAlertRules,
} from '../analytics';
import { Scan, Violation, Incident, AlertRule } from '../../types';

describe('Analytics Selector Layer (utils/analytics.ts)', () => {
  it('resolves date windows accurately', () => {
    const w7d = resolveDateWindow('7d');
    expect(w7d.start.getTime()).toBeLessThan(w7d.end.getTime());
    expect(w7d.priorStart.getTime()).toBeLessThan(w7d.priorEnd.getTime());

    // 7 days window length approx 7 * 24 * 3600 * 1000 ms
    const diff = w7d.end.getTime() - w7d.start.getTime();
    expect(diff).toBeGreaterThan(6 * 24 * 3600 * 1000);
  });

  it('computes executive KPIs from scan and violation data', () => {
    const mockScans: Scan[] = [
      {
        id: 's1',
        userId: 'u1',
        sourceType: 'image',
        fileName: 'f1.jpg',
        totalPersons: 2,
        totalViolations: 0,
        compliancePct: 100,
        detectedClasses: ['person', 'helmet'],
        createdAt: new Date().toISOString(),
      },
      {
        id: 's2',
        userId: 'u1',
        sourceType: 'image',
        fileName: 'f2.jpg',
        totalPersons: 2,
        totalViolations: 1,
        compliancePct: 50,
        detectedClasses: ['person'],
        createdAt: new Date().toISOString(),
      },
    ];

    const mockViolations: Violation[] = [
      {
        id: 'v1',
        scanId: 's2',
        sourceType: 'image',
        fileName: 'f2.jpg',
        type: 'NO-Helmet',
        severity: 'high',
        confidence: 0.9,
        bbox: [0, 0, 10, 10],
        createdAt: new Date().toISOString(),
      },
    ];

    const kpis = computeExecutiveKPIs({
      currentViolations: mockViolations,
      priorViolations: [],
      currentScans: mockScans,
      priorScans: [],
      currentIncidents: [],
      priorIncidents: [],
      hasPolicyKnowledge: true,
    });

    expect(kpis.compliancePct).toBe(75);
    expect(kpis.totalViolations).toBe(1);
    expect(kpis.openIncidents).toBe(0);
    expect(kpis.sparklines.compliance.length).toBeGreaterThan(0);
  });

  it('computes daily trends and flags anomalies exceeding mean + 2 stdDev', () => {
    const scans: Scan[] = [];
    const violations: Violation[] = [];

    // Create 10 normal days with 2 violations each
    for (let day = 1; day <= 10; day++) {
      const dateStr = `2026-03-${day < 10 ? '0' + day : day}T10:00:00.000Z`;
      for (let v = 0; v < 2; v++) {
        violations.push({
          id: `v_${day}_${v}`,
          scanId: `s_${day}`,
          sourceType: 'image',
          fileName: 'f.jpg',
          type: 'NO-Helmet',
          confidence: 0.9,
          bbox: [0, 0, 10, 10],
          createdAt: dateStr,
        });
      }
    }

    // Create 1 anomaly day with 15 violations
    const anomalyDate = '2026-03-11T10:00:00.000Z';
    for (let v = 0; v < 15; v++) {
      violations.push({
        id: `v_spike_${v}`,
        scanId: 's_spike',
        sourceType: 'image',
        fileName: 'f.jpg',
        type: 'NO-Helmet',
        confidence: 0.95,
        bbox: [0, 0, 10, 10],
        createdAt: anomalyDate,
      });
    }

    const result = computeDailyTrends(scans, violations);
    expect(result.points.length).toBe(11);
    expect(result.anomalyCount).toBeGreaterThanOrEqual(1);

    const spikePoint = result.points.find((p) => p.date === '2026-03-11');
    expect(spikePoint).toBeDefined();
    expect(spikePoint?.isAnomaly).toBe(true);
  });

  it('computes linear forecast with 7 future points and confidence bounds', () => {
    const trendPoints = [
      { date: '2026-03-01', violations: 2, compliancePct: 90, movingAverage7d: 2, isAnomaly: false, mean: 2, threshold: 4 },
      { date: '2026-03-02', violations: 3, compliancePct: 90, movingAverage7d: 2.5, isAnomaly: false, mean: 2, threshold: 4 },
      { date: '2026-03-03', violations: 3, compliancePct: 88, movingAverage7d: 2.7, isAnomaly: false, mean: 2, threshold: 4 },
      { date: '2026-03-04', violations: 4, compliancePct: 85, movingAverage7d: 3, isAnomaly: false, mean: 2, threshold: 4 },
    ];

    const forecast = computeForecast(trendPoints);
    expect(forecast.length).toBe(7);
    expect(forecast[0].upper).toBeGreaterThanOrEqual(forecast[0].projected);
    expect(forecast[0].lower).toBeLessThanOrEqual(forecast[0].projected);
  });

  it('detects silent cameras with no scans in 24 hours', () => {
    const recentScans: Scan[] = [
      {
        id: 's1',
        userId: 'u1',
        sourceType: 'image',
        fileName: 'cam1.jpg',
        cameraId: 'CAM-01',
        totalPersons: 1,
        totalViolations: 0,
        compliancePct: 100,
        detectedClasses: ['person'],
        createdAt: new Date().toISOString(), // recent
      },
    ];

    const health = computeCameraHealth(recentScans, []);
    const cam1 = health.find((c) => c.cameraId === 'CAM-01');
    const cam4 = health.find((c) => c.cameraId === 'CAM-04');

    expect(cam1?.isSilent).toBe(false);
    expect(cam4?.isSilent).toBe(true); // no scans at all -> silent
  });

  it('evaluates alert rules and deduplicates triggers within 1 hour', () => {
    const rules: AlertRule[] = [
      {
        id: 'r1',
        name: 'Compliance Alert',
        condition: 'compliance_lt',
        threshold: 90,
        enabled: true,
      },
    ];

    const kpis: any = { compliancePct: 75, repeatViolationRatePct: 0 };
    const res1 = evaluateAlertRules({
      rules,
      zoneRisks: [],
      kpis,
      violations: [],
      recentNotifications: [],
    });

    expect(res1.triggeredNotifications.length).toBe(1);
    expect(res1.updatedRules[0].lastFiredAt).toBeDefined();

    // Immediate second evaluation should be deduplicated
    const res2 = evaluateAlertRules({
      rules: res1.updatedRules,
      zoneRisks: [],
      kpis,
      violations: [],
      recentNotifications: res1.triggeredNotifications,
    });

    expect(res2.triggeredNotifications.length).toBe(0);
  });
});

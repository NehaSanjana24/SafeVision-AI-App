import { describe, it, expect } from 'vitest';
import {
  calculateSeverityWeightedSum,
  calculateRepeatViolations,
  computeRiskScore,
  getRiskBand,
  DEFAULT_RISK_WEIGHTS,
} from '../risk';
import { Violation, Scan, Incident } from '../../types';

describe('Risk Scoring Utility (utils/risk.ts)', () => {
  it('correctly maps score bands', () => {
    expect(getRiskBand(20)).toBe('Low');
    expect(getRiskBand(55)).toBe('Medium');
    expect(getRiskBand(75)).toBe('High');
    expect(getRiskBand(90)).toBe('Critical');
  });

  it('calculates severity-weighted sum correctly', () => {
    const mockViolations: Violation[] = [
      {
        id: '1',
        scanId: 's1',
        sourceType: 'image',
        fileName: 'f1.jpg',
        type: 'NO-Helmet',
        severity: 'critical',
        confidence: 0.9,
        bbox: [0, 0, 10, 10],
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        scanId: 's1',
        sourceType: 'image',
        fileName: 'f1.jpg',
        type: 'NO-Vest',
        severity: 'high',
        confidence: 0.9,
        bbox: [0, 0, 10, 10],
        createdAt: new Date().toISOString(),
      },
      {
        id: '3',
        scanId: 's1',
        sourceType: 'image',
        fileName: 'f1.jpg',
        type: 'Missing Gloves',
        severity: 'medium',
        confidence: 0.9,
        bbox: [0, 0, 10, 10],
        createdAt: new Date().toISOString(),
      },
      {
        id: '4',
        scanId: 's1',
        sourceType: 'image',
        fileName: 'f1.jpg',
        type: 'NO-Goggles',
        severity: 'low',
        confidence: 0.9,
        bbox: [0, 0, 10, 10],
        createdAt: new Date().toISOString(),
      },
    ];

    // Critical (4) + High (3) + Medium (2) + Low (1) = 10
    expect(calculateSeverityWeightedSum(mockViolations)).toBe(10);
  });

  it('detects repeat violations within 7 days', () => {
    const now = new Date();
    const v1: Violation = {
      id: 'v1',
      scanId: 's1',
      sourceType: 'image',
      fileName: 'f1.jpg',
      type: 'NO-Helmet',
      zone: 'A',
      confidence: 0.95,
      bbox: [0, 0, 10, 10],
      createdAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
    };
    const v2: Violation = {
      id: 'v2',
      scanId: 's2',
      sourceType: 'image',
      fileName: 'f2.jpg',
      type: 'NO-Helmet',
      zone: 'A',
      confidence: 0.92,
      bbox: [0, 0, 10, 10],
      createdAt: now.toISOString(), // same type 2 days later -> repeat
    };

    const res = calculateRepeatViolations([v1, v2], 7);
    expect(res.count).toBe(1);
    expect(res.rate).toBe(0.5);
  });

  it('computes composite risk score within 0 to 100 range', () => {
    const mockViolations: Violation[] = [
      {
        id: 'v1',
        scanId: 's1',
        sourceType: 'image',
        fileName: 'f.jpg',
        type: 'NO-Helmet',
        severity: 'critical',
        confidence: 0.95,
        bbox: [0, 0, 10, 10],
        createdAt: new Date().toISOString(),
      },
    ];
    const mockScans: Scan[] = [
      {
        id: 's1',
        userId: 'u1',
        sourceType: 'image',
        fileName: 'f.jpg',
        totalPersons: 1,
        totalViolations: 1,
        compliancePct: 50,
        detectedClasses: ['person', 'NO-Helmet'],
        createdAt: new Date().toISOString(),
      },
    ];
    const mockIncidents: Incident[] = [
      {
        id: 'inc1',
        violationIds: ['v1'],
        severity: 'critical',
        summary: 'Critical head injury risk',
        status: 'open',
        createdAt: new Date().toISOString(),
      },
    ];

    const result = computeRiskScore({
      violations: mockViolations,
      scans: mockScans,
      incidents: mockIncidents,
      priorPeriodViolationsCount: 0,
      weights: DEFAULT_RISK_WEIGHTS,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['Low', 'Medium', 'High', 'Critical']).toContain(result.band);
    expect(result.components.severityRate).toBeGreaterThanOrEqual(0);
    expect(result.components.severityRate).toBeLessThanOrEqual(1);
  });
});

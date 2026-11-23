import { describe, it, expect } from 'vitest';
import {
  compileReportData,
  preventCSVInjection,
  exportReportToCSV,
  exportSummarizedCompliancePDF,
  OSHA_STANDARDS,
} from '../reports';
import { Scan, Violation, Incident, CorrectiveAction } from '../../types';

describe('Reports Utility (utils/reports.ts)', () => {
  it('correctly maps OSHA standards for PPE violations', () => {
    expect(OSHA_STANDARDS['NO-Helmet'].standard).toContain('1926.100');
    expect(OSHA_STANDARDS['NO-Vest'].standard).toContain('1926.201');
    expect(OSHA_STANDARDS['NO-Goggles'].standard).toContain('1910.133');
  });

  it('prevents CSV formula injection vulnerabilities', () => {
    expect(preventCSVInjection('=SUM(A1:A10)')).toBe(`"'=SUM(A1:A10)"`);
    expect(preventCSVInjection('+12345')).toBe(`"'+12345"`);
    expect(preventCSVInjection('-10')).toBe(`"'-10"`);
    expect(preventCSVInjection('@cmd|calc')).toBe(`"'@cmd|calc"`);
    expect(preventCSVInjection('Safe Text')).toBe(`"Safe Text"`);
  });

  it('compiles report data with consistent totals, reconciles false positives, and generates a summarized PDF blob', async () => {
    const scans: Scan[] = [
      {
        id: 's1',
        userId: 'u1',
        sourceType: 'image',
        fileName: 'cam.jpg',
        zone: 'A',
        totalPersons: 2,
        totalViolations: 1,
        compliancePct: 80,
        detectedClasses: ['person'],
        createdAt: new Date().toISOString(),
      },
    ];

    const violations: Violation[] = [
      {
        id: 'v1',
        scanId: 's1',
        sourceType: 'image',
        fileName: 'cam.jpg',
        zone: 'A',
        type: 'NO-Helmet',
        severity: 'high',
        confidence: 0.9,
        bbox: [0, 0, 10, 10],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'v2',
        scanId: 's1',
        sourceType: 'image',
        fileName: 'cam.jpg',
        zone: 'A',
        type: 'NO-Vest',
        severity: 'low',
        confidence: 0.8,
        bbox: [0, 0, 10, 10],
        isFalsePositive: true, // Should be excluded from validated violations
        createdAt: new Date().toISOString(),
      },
    ];

    const report = compileReportData({
      type: 'monthly_compliance_audit',
      parameters: {
        dateRange: '30d',
        zones: ['A'],
        cameras: ['CAM-01'],
        includeEvidenceThumbnails: true,
        maxThumbnails: 5,
        includeAINarrative: true,
        includePolicyReferences: true,
        language: 'en',
      },
      scans,
      violations,
      incidents: [],
      actions: [],
      zoneRisks: [],
      userEmail: 'auditor@safevision.ai',
    });

    expect(report.kpis.totalViolations).toBe(1);
    expect(report.kpis.falsePositivesExcluded).toBe(1);
    expect(report.zoneBreakdown[0].zone).toBe('A');
    expect(report.violationBreakdown.length).toBe(1);
    expect(report.violationBreakdown[0].oshaStandard).toContain('1926.100');

    const csv = exportReportToCSV(report);
    expect(csv).toContain('NO-Helmet');

    const summaryPdfBlob = await exportSummarizedCompliancePDF(report);
    expect(summaryPdfBlob).toBeInstanceOf(Blob);
    expect(summaryPdfBlob.size).toBeGreaterThan(500);
    expect(summaryPdfBlob.type).toContain('pdf');
  });
});

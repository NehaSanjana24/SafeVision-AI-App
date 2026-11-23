import { describe, it, expect } from 'vitest';
import { repository } from '../storage';
import { Scan, Violation, Incident, ReportRecord, CorrectiveAction } from '../../types';

describe('Repository & Firestore Contract Parity Tests', () => {
  it('supports full lifecycle contract for scans, violations, incidents, correctiveActions, and reports', async () => {
    const now = new Date().toISOString();
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const scan: Scan = {
      id: `scan_contract_${suffix}`,
      userId: 'user_contract',
      sourceType: 'image',
      fileName: 'cam02.jpg',
      zone: 'B',
      cameraId: 'CAM-02',
      totalPersons: 2,
      totalViolations: 1,
      compliancePct: 75,
      detectedClasses: ['person', 'vest', 'NO-Helmet'],
      createdAt: now,
    };

    const violation: Violation = {
      id: `viol_contract_${suffix}`,
      scanId: scan.id,
      sourceType: 'image',
      fileName: 'cam02.jpg',
      zone: 'B',
      cameraId: 'CAM-02',
      type: 'NO-Helmet',
      severity: 'high',
      confidence: 0.91,
      bbox: [10, 10, 60, 60],
      createdAt: now,
    };

    const incident: Incident = {
      id: `inc_contract_${suffix}`,
      zone: 'B',
      cameraId: 'CAM-02',
      violationIds: [violation.id],
      severity: 'high',
      summary: 'Worker missing hardhat near scaffold',
      status: 'open',
      createdAt: now,
    };

    const action: CorrectiveAction = {
      id: `ca_contract_${suffix}`,
      title: 'Deploy Zone B Helmet Gate Check',
      zone: 'B',
      ownerRole: 'Site Supervisor',
      dueDate: '2026-06-15',
      status: 'planned',
      createdBy: 'admin@safevision.ai',
      createdAt: now,
      updatedAt: now,
    };

    const report: ReportRecord = {
      id: `rep_contract_${suffix}`,
      type: 'zone_report',
      title: 'Zone B Contract Audit',
      parameters: {
        dateRange: '7d',
        zones: ['B'],
        cameras: ['all'],
        includeEvidenceThumbnails: false,
        maxThumbnails: 0,
        includeAINarrative: false,
        includePolicyReferences: true,
        language: 'en',
      },
      summary: 'Contract validation report',
      createdBy: 'admin@safevision.ai',
      createdAt: now,
      status: 'generated',
    };

    await repository.saveScan(scan);
    await repository.saveViolation(violation);
    await repository.saveIncident(incident);
    await repository.saveCorrectiveAction(action);
    await repository.saveReport(report);

    expect((await repository.getScanById(scan.id))?.zone).toBe('B');
    expect((await repository.getAllViolations()).some((v) => v.id === violation.id)).toBe(true);
    expect((await repository.getAllIncidents()).some((i) => i.id === incident.id)).toBe(true);
    expect((await repository.getCorrectiveActionById(action.id))?.status).toBe('planned');
    expect((await repository.getReportById(report.id))?.title).toBe('Zone B Contract Audit');

    // Clean up records
    await repository.deleteReport(report.id);
    await repository.deleteCorrectiveAction(action.id);
    await repository.deleteScan(scan.id);
    await repository.deleteViolation(violation.id);
  });

  it('tracks collection counts for health diagnostics', async () => {
    const counts = await repository.getCollectionCounts();
    expect(counts).toHaveProperty('scans');
    expect(counts).toHaveProperty('violations');
    expect(counts).toHaveProperty('incidents');
    expect(counts).toHaveProperty('knowledge_docs');
  });
});

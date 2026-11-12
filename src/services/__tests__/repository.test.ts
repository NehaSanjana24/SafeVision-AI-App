import { describe, it, expect, beforeEach } from 'vitest';
import { repository, DEFAULT_SETTINGS } from '../storage';
import { CorrectiveAction, ReportRecord, AlertRule, Notification, SavedView } from '../../types';

describe('Repository Data Layer Contract Tests (services/storage.ts)', () => {
  it('loads default PPESettings with riskWeights and retentionDays', () => {
    const settings = repository.getSettings();
    expect(settings.confidenceThreshold).toBeDefined();
    expect(settings.evidenceRetentionDays).toBe(90);
    expect(settings.riskWeights).toBeDefined();
    expect(settings.riskWeights?.severityWeight).toBe(0.4);
    expect(settings.riskWeights?.repeatWeight).toBe(0.25);
  });

  it('correctly persists and retrieves Corrective Actions', async () => {
    const action: CorrectiveAction = {
      id: `test_ca_${Date.now()}`,
      title: 'Fix scaffold netting',
      zone: 'B',
      ownerRole: 'Safety Lead',
      dueDate: '2026-06-01',
      status: 'planned',
      createdBy: 'tester@safevision.ai',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repository.saveCorrectiveAction(action);
    const retrieved = await repository.getCorrectiveActionById(action.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe('Fix scaffold netting');

    // Update status
    await repository.updateCorrectiveAction(action.id, { status: 'in_progress' });
    const updated = await repository.getCorrectiveActionById(action.id);
    expect(updated?.status).toBe('in_progress');

    // Delete
    await repository.deleteCorrectiveAction(action.id);
    const afterDelete = await repository.getCorrectiveActionById(action.id);
    expect(afterDelete).toBeUndefined();
  });

  it('correctly persists and retrieves Reports and Report Blobs', async () => {
    const report: ReportRecord = {
      id: `test_rep_${Date.now()}`,
      type: 'monthly_compliance_audit',
      title: 'Monthly Safety Audit Test',
      parameters: {
        dateRange: '30d',
        zones: ['A', 'B'],
        cameras: ['CAM-01'],
        includeEvidenceThumbnails: false,
        maxThumbnails: 0,
        includeAINarrative: true,
        includePolicyReferences: true,
        language: 'en',
      },
      summary: 'Test summary briefing',
      createdBy: 'auditor@safevision.ai',
      createdAt: new Date().toISOString(),
      status: 'generated',
    };

    await repository.saveReport(report);
    const retrieved = await repository.getReportById(report.id);
    expect(retrieved?.title).toBe('Monthly Safety Audit Test');

    // Blob storage
    const fakeBlob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
    await repository.saveReportBlob(report.id, fakeBlob);
    const blobRetrieved = await repository.getReportBlob(report.id);
    expect(blobRetrieved).toBeDefined();

    await repository.deleteReport(report.id);
    const afterDelete = await repository.getReportById(report.id);
    expect(afterDelete).toBeUndefined();
  });

  it('manages In-App Notifications and mark-as-read state', async () => {
    const notif: Notification = {
      id: `test_notif_${Date.now()}`,
      userId: 'test_user',
      title: 'Threshold Exceeded',
      body: 'Zone Risk reached 80',
      severity: 'critical',
      read: false,
      createdAt: new Date().toISOString(),
    };

    await repository.saveNotification(notif);
    const notifs = await repository.getAllNotifications('test_user');
    expect(notifs.some((n) => n.id === notif.id)).toBe(true);

    await repository.markNotificationAsRead(notif.id);
    const afterRead = await repository.getAllNotifications('test_user');
    const target = afterRead.find((n) => n.id === notif.id);
    expect(target?.read).toBe(true);

    await repository.deleteNotification(notif.id);
  });

  it('provides default Alert Rules and manages Saved Views', async () => {
    const rules = await repository.getAllAlertRules();
    expect(rules.length).toBeGreaterThanOrEqual(3);

    const savedView: SavedView = {
      id: `test_sv_${Date.now()}`,
      userId: 'admin_test',
      name: 'Zone A Daily View',
      filters: {
        dateRange: 'today',
        zone: 'A',
        camera: 'all',
        source: 'all',
        violationClass: 'all',
        severity: 'all',
        incidentStatus: 'all',
        comparePrevious: false,
      },
      createdAt: new Date().toISOString(),
    };

    await repository.saveSavedView(savedView);
    const views = await repository.getAllSavedViews('admin_test');
    expect(views.some((v) => v.id === savedView.id)).toBe(true);

    await repository.deleteSavedView(savedView.id);
  });
});

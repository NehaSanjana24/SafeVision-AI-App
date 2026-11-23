import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Notification, AlertRule, ReportRecord } from '../types';
import { repository } from '../services/storage';
import { useAuth } from './AuthContext';
import {
  evaluateAlertRules,
  computeExecutiveKPIs,
  filterViolations,
  filterScans,
  filterIncidents,
  resolveDateWindow,
} from '../utils/analytics';
import { computeAllZonesRisk } from '../utils/risk';
import { compileReportData, exportReportToPDF } from '../utils/reports';
import { getAlertWebhookUrl } from '../utils/env';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  alertRules: AlertRule[];
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  triggerRuleEvaluation: () => Promise<void>;
  runDueReportSchedulesNow: () => Promise<number>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [loading] = useState(false);
  const scheduleRunningRef = useRef(false);

  const refreshNotifications = useCallback(async () => {
    try {
      const notifs = await repository.getAllNotifications(currentUser?.id);
      setNotifications(notifs);
      const rules = await repository.getAllAlertRules();
      setAlertRules(rules);
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const markAsRead = async (id: string) => {
    await repository.markNotificationAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllAsRead = async () => {
    await repository.markAllNotificationsAsRead(currentUser?.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = async (id: string) => {
    await repository.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const runDueReportSchedulesNow = useCallback(async (forceAll = false): Promise<number> => {
    if (scheduleRunningRef.current) return 0;
    scheduleRunningRef.current = true;
    let generatedCount = 0;

    try {
      const schedules = await repository.getAllReportSchedules();
      const nowMs = Date.now();
      const due = schedules.filter(
        (s) => forceAll || new Date(s.nextDueAt).getTime() <= nowMs
      );
      if (due.length === 0) return 0;

      const [scans, violations, incidents, actions] = await Promise.all([
        repository.getAllScans(),
        repository.getAllViolations(),
        repository.getAllIncidents(),
        repository.getAllCorrectiveActions(),
      ]);

      const settings = repository.getSettings();
      const zoneRisks = computeAllZonesRisk({
        violations,
        scans,
        incidents,
        priorViolations: [],
        weights: settings.riskWeights,
      });

      for (const sched of due) {
        const compiled = compileReportData({
          type: sched.type,
          parameters: sched.parameters,
          scans,
          violations,
          incidents,
          actions,
          zoneRisks,
          userEmail: sched.createdBy || currentUser?.email || 'scheduler@safevision.ai',
        });

        let pdfBlob: Blob | undefined;
        try {
          pdfBlob = await exportReportToPDF(compiled);
        } catch {
          // Headless/mocked test environments may not have canvas context
        }

        const record: ReportRecord = {
          id: compiled.reportId,
          type: compiled.type,
          title: `${compiled.title} (Scheduled ${sched.frequency})`,
          parameters: compiled.parameters,
          summary: compiled.aiNarrative.executiveSummary,
          createdBy: sched.createdBy || currentUser?.email || 'scheduler@safevision.ai',
          createdAt: new Date().toISOString(),
          status: 'generated',
          reportData: compiled,
        };

        await repository.saveReport(record);
        if (pdfBlob) {
          await repository.saveReportBlob(record.id, pdfBlob);
        }

        // Advance schedule nextDueAt
        const nextDate = new Date();
        if (sched.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
        else if (sched.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else nextDate.setMonth(nextDate.getMonth() + 1);

        await repository.saveReportSchedule({
          ...sched,
          lastRunAt: new Date().toISOString(),
          nextDueAt: nextDate.toISOString(),
        });

        // Bell notification
        await repository.saveNotification({
          id: `notif_sched_${Date.now()}_${sched.id}`,
          userId: currentUser?.id || 'admin-001',
          title: `Ready: Scheduled ${sched.frequency} report`,
          body: `${record.title} generated with ${compiled.kpis.overallCompliancePct}% compliance across ${compiled.kpis.totalScans} scans.`,
          severity: 'info',
          read: false,
          createdAt: new Date().toISOString(),
          link: '/reports?tab=history',
        });

        // Optional webhook delivery
        const webhookUrl = settings.alertWebhookUrl || getAlertWebhookUrl();
        if (webhookUrl && sched.emailSummary !== false) {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'scheduled_report_ready',
              reportId: record.id,
              title: record.title,
              frequency: sched.frequency,
              recipient: settings.supervisorEmail || sched.createdBy,
              kpis: compiled.kpis,
              summary: compiled.aiNarrative.executiveSummary,
              timestamp: new Date().toISOString(),
            }),
          }).catch(() => {});
        }

        generatedCount++;
      }

      if (generatedCount > 0) {
        await refreshNotifications();
      }
    } catch (err) {
      console.warn('Scheduled report execution warning:', err);
    } finally {
      scheduleRunningRef.current = false;
    }

    return generatedCount;
  }, [currentUser?.email, currentUser?.id, refreshNotifications]);

  const triggerRuleEvaluation = useCallback(async () => {
    try {
      const [scans, violations, incidents, rules, recentNotifs, docs, workflowRuns] = await Promise.all([
        repository.getAllScans(),
        repository.getAllViolations(),
        repository.getAllIncidents(),
        repository.getAllAlertRules(),
        repository.getAllNotifications(currentUser?.id),
        repository.getAllDocuments(),
        repository.getAllWorkflowRuns(),
      ]);

      const settings = repository.getSettings();
      const window = resolveDateWindow('30d');
      const defaultFilters = {
        dateRange: '30d' as const,
        zone: 'all' as const,
        camera: 'all',
        source: 'all' as const,
        violationClass: 'all',
        severity: 'all' as const,
        incidentStatus: 'all' as const,
        comparePrevious: true,
      };
      const filteredViols = filterViolations(violations, defaultFilters, window);
      const filteredScans = filterScans(scans, defaultFilters, window);
      const filteredIncs = filterIncidents(incidents, defaultFilters, window);

      const kpis = computeExecutiveKPIs({
        currentViolations: filteredViols.current,
        priorViolations: filteredViols.prior,
        currentScans: filteredScans.current,
        priorScans: filteredScans.prior,
        currentIncidents: filteredIncs.current,
        priorIncidents: filteredIncs.prior,
        hasPolicyKnowledge: docs.length > 0,
        workflowRuns,
      });

      const zoneRisks = computeAllZonesRisk({
        violations: filteredViols.current,
        scans: filteredScans.current,
        incidents: filteredIncs.current,
        priorViolations: filteredViols.prior,
        weights: settings.riskWeights,
      });

      const evaluation = evaluateAlertRules({
        rules,
        zoneRisks,
        kpis,
        violations: filteredViols.current,
        recentNotifications: recentNotifs,
      });

      if (evaluation.triggeredNotifications.length > 0) {
        for (const notif of evaluation.triggeredNotifications) {
          await repository.saveNotification(notif);
        }
        for (const rule of evaluation.updatedRules) {
          await repository.saveAlertRule(rule);
        }

        const webhookUrl = settings.alertWebhookUrl || getAlertWebhookUrl();
        if (webhookUrl) {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'safety_rule_triggered',
              alerts: evaluation.triggeredNotifications,
              timestamp: new Date().toISOString(),
            }),
          }).catch(() => {});
        }

        await refreshNotifications();
      }
    } catch (err) {
      console.warn('Rule evaluation warning:', err);
    }
  }, [currentUser?.id, refreshNotifications]);

  // Periodic rule evaluation & due schedule checks
  useEffect(() => {
    triggerRuleEvaluation();
    runDueReportSchedulesNow(false);
    const interval = setInterval(() => {
      triggerRuleEvaluation();
      runDueReportSchedulesNow(false);
    }, 120000);
    return () => clearInterval(interval);
  }, [triggerRuleEvaluation, runDueReportSchedulesNow]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        alertRules,
        loading,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        triggerRuleEvaluation,
        runDueReportSchedulesNow: () => runDueReportSchedulesNow(false),
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

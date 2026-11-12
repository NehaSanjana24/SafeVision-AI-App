import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Notification, AlertRule } from '../types';
import { repository } from '../services/storage';
import { useAuth } from './AuthContext';
import { evaluateAlertRules, computeExecutiveKPIs, filterViolations, filterScans, filterIncidents, resolveDateWindow } from '../utils/analytics';
import { computeAllZonesRisk } from '../utils/risk';

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
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);

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

  const triggerRuleEvaluation = useCallback(async () => {
    try {
      const [scans, violations, incidents, rules, recentNotifs] = await Promise.all([
        repository.getAllScans(),
        repository.getAllViolations(),
        repository.getAllIncidents(),
        repository.getAllAlertRules(),
        repository.getAllNotifications(currentUser?.id),
      ]);

      const window = resolveDateWindow('30d');
      const filteredViols = filterViolations(
        violations,
        {
          dateRange: '30d',
          zone: 'all',
          camera: 'all',
          source: 'all',
          violationClass: 'all',
          severity: 'all',
          incidentStatus: 'all',
          comparePrevious: true,
        },
        window
      );
      const filteredScans = filterScans(
        scans,
        {
          dateRange: '30d',
          zone: 'all',
          camera: 'all',
          source: 'all',
          violationClass: 'all',
          severity: 'all',
          incidentStatus: 'all',
          comparePrevious: true,
        },
        window
      );
      const filteredIncs = filterIncidents(
        incidents,
        {
          dateRange: '30d',
          zone: 'all',
          camera: 'all',
          source: 'all',
          violationClass: 'all',
          severity: 'all',
          incidentStatus: 'all',
          comparePrevious: true,
        },
        window
      );

      const kpis = computeExecutiveKPIs({
        currentViolations: filteredViols.current,
        priorViolations: filteredViols.prior,
        currentScans: filteredScans.current,
        priorScans: filteredScans.prior,
        currentIncidents: filteredIncs.current,
        priorIncidents: filteredIncs.prior,
        hasPolicyKnowledge: true,
      });

      const zoneRisks = computeAllZonesRisk({
        violations: filteredViols.current,
        scans: filteredScans.current,
        incidents: filteredIncs.current,
        priorViolations: filteredViols.prior,
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

        // Webhook notification if configured
        const settings = repository.getSettings();
        if (settings.alertWebhookUrl) {
          fetch(settings.alertWebhookUrl, {
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

  // Periodic rule evaluation check
  useEffect(() => {
    triggerRuleEvaluation();
    const interval = setInterval(triggerRuleEvaluation, 120000); // every 2 minutes
    return () => clearInterval(interval);
  }, [triggerRuleEvaluation]);

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

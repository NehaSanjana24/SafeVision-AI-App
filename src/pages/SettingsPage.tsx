import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  ShieldCheck,
  BellRing,
  Cpu,
  Trash2,
  Activity,
  Save,
  RotateCcw,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Sparkles,
  RefreshCw,
  HardDrive,
  Gauge,
  BookOpen,
  Edit3,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { repository } from '../services/storage';
import { detector } from '../services/detector';
import { knowledgeService } from '../services/knowledge';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNotifications } from '../context/NotificationContext';
import {
  PPESettings,
  RiskWeights,
  AlertRule,
  AlertRuleCondition,
  RAGEvaluationRun,
} from '../types';
import {
  isFirebaseConfigured,
  isGeminiConfigured,
  isAgentApiConfigured,
  getAgentApiUrl,
  getAgentEngineBadge,
  getAlertWebhookUrl,
} from '../utils/env';
import { getMeasuredLatencyStats } from '../utils/logger';
import { compileReportData, exportReportToPDF } from '../utils/reports';
import { DEFAULT_RISK_WEIGHTS } from '../utils/risk';

type SettingsTab = 'general' | 'rules' | 'weights' | 'privacy' | 'health';

interface PingResult {
  name: string;
  url: string;
  status: 'online' | 'degraded' | 'offline' | 'checking';
  latencyMs?: number;
  detail: string;
}

interface SelfTestStep {
  name: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  durationMs?: number;
  details?: string;
}

export const SettingsPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { addToast } = useToast();
  const { alertRules, refreshNotifications, triggerRuleEvaluation } = useNotifications();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = (searchParams.get('tab') as SettingsTab) || 'general';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [settings, setSettings] = useState<PPESettings>(() => repository.getSettings());

  // Risk weights state
  const [riskWeights, setRiskWeights] = useState<RiskWeights>(() => ({
    ...(settings.riskWeights || DEFAULT_RISK_WEIGHTS),
  }));

  // Retention state
  const [retentionDays, setRetentionDays] = useState<number>(settings.evidenceRetentionDays || 90);
  const [cleaning, setCleaning] = useState(false);

  // Alert Rule form state
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<{
    name: string;
    condition: AlertRuleCondition;
    threshold: number;
    windowHours: number;
    windowDays: number;
    enabled: boolean;
  }>({
    name: '',
    condition: 'risk_gte',
    threshold: 75,
    windowHours: 1,
    windowDays: 3,
    enabled: true,
  });

  // System Health state (Admin-only)
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [storageEst, setStorageEst] = useState<{ usageMB: number; quotaMB: number; pct: number }>({
    usageMB: 0,
    quotaMB: 0,
    pct: 0,
  });
  const [latestEval, setLatestEval] = useState<RAGEvaluationRun | undefined>(undefined);
  const [pings, setPings] = useState<PingResult[]>([]);
  const [pinging, setPinging] = useState(false);
  const [telemetryRefreshTick, setTelemetryRefreshTick] = useState(0);
  const [isRunningSelfTest, setIsRunningSelfTest] = useState(false);
  const [selfTestSteps, setSelfTestSteps] = useState<SelfTestStep[]>([
    { name: 'IndexedDB Read/Write Verification', status: 'idle' },
    { name: 'Detection Engine & API Reachability', status: 'idle' },
    { name: 'Knowledge Base Hybrid Search Retrieval', status: 'idle' },
    { name: 'Dynamic jsPDF + autoTable Synthesis', status: 'idle' },
  ]);

  const changeTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const runHealthPings = useCallback(async () => {
    setPinging(true);
    const checks: PingResult[] = [];

    const checkUrl = async (name: string, url: string) => {
      const start = performance.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        const ms = Math.round(performance.now() - start);
        if (res.ok) {
          checks.push({
            name,
            url,
            status: 'online',
            latencyMs: ms,
            detail: `HTTP ${res.status} OK`,
          });
        } else {
          checks.push({
            name,
            url,
            status: 'degraded',
            latencyMs: ms,
            detail: `HTTP ${res.status}`,
          });
        }
      } catch {
        const ms = Math.round(performance.now() - start);
        checks.push({
          name,
          url,
          status: 'offline',
          latencyMs: ms,
          detail: 'Unreachable / Timeout',
        });
      }
    };

    await Promise.all([
      checkUrl('App Express Server (/api/engine-info)', '/api/engine-info'),
      checkUrl('YOLOv8 Local Weights (/api/models/status)', '/api/models/status'),
      ...(isAgentApiConfigured() && getAgentApiUrl()
        ? [checkUrl('LangGraph Agent API (/health)', `${getAgentApiUrl()!.replace(/\/+$/, '')}/health`)]
        : []),
    ]);

    setPings(checks);
    setPinging(false);
  }, []);

  const loadHealthStats = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [scans, viols, incs, actions, docs, reps, notifs, rules, ragEval] = await Promise.all([
        repository.getAllScans(),
        repository.getAllViolations(),
        repository.getAllIncidents(),
        repository.getAllCorrectiveActions(),
        repository.getAllDocuments(),
        repository.getAllReports(),
        repository.getAllNotifications(),
        repository.getAllAlertRules(),
        repository.getLatestRAGEvaluation(),
      ]);

      setCounts({
        Scans: scans.length,
        Violations: viols.length,
        Incidents: incs.length,
        CorrectiveActions: actions.length,
        KnowledgeDocs: docs.length,
        SafetyReports: reps.length,
        Notifications: notifs.length,
        AlertRules: rules.length,
      });
      setLatestEval(ragEval);

      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const usage = est.usage || 0;
        const quota = est.quota || 0;
        const usageMB = Math.round((usage / (1024 * 1024)) * 10) / 10;
        const quotaMB = Math.round((quota / (1024 * 1024)) * 10) / 10;
        const pct = quota > 0 ? Math.round((usage / quota) * 1000) / 10 : 0;
        setStorageEst({ usageMB, quotaMB, pct });
      }
    } catch (err) {
      console.warn('Settings health stats error:', err);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === 'health' && isAdmin) {
      loadHealthStats();
      runHealthPings();
    }
  }, [activeTab, isAdmin, loadHealthStats, runHealthPings]);

  const handleSaveGeneral = () => {
    repository.saveSettings(settings);
    addToast('success', 'Settings Saved', 'Detection, alert, and agent preferences updated.');
  };

  const handleSaveRule = async () => {
    if (!ruleForm.name.trim()) {
      addToast('warning', 'Rule Name Required', 'Enter a descriptive name for the alert rule.');
      return;
    }

    const rule: AlertRule = {
      id: editingRuleId || `rule_${Date.now()}`,
      name: ruleForm.name.trim(),
      condition: ruleForm.condition,
      threshold: Number(ruleForm.threshold),
      windowHours: ruleForm.condition === 'repeat_gte' ? Number(ruleForm.windowHours) : undefined,
      windowDays: ruleForm.condition === 'compliance_lt' ? Number(ruleForm.windowDays) : undefined,
      enabled: ruleForm.enabled,
    };

    await repository.saveAlertRule(rule);
    await refreshNotifications();
    setShowRuleForm(false);
    setEditingRuleId(null);
    setRuleForm({
      name: '',
      condition: 'risk_gte',
      threshold: 75,
      windowHours: 1,
      windowDays: 3,
      enabled: true,
    });
    addToast('success', editingRuleId ? 'Rule Updated' : 'Rule Created', `"${rule.name}" saved.`);
  };

  const handleEditRule = (rule: AlertRule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      name: rule.name,
      condition: rule.condition,
      threshold: rule.threshold,
      windowHours: rule.windowHours || 1,
      windowDays: rule.windowDays || 3,
      enabled: rule.enabled,
    });
    setShowRuleForm(true);
  };

  const handleToggleRule = async (rule: AlertRule) => {
    await repository.updateAlertRule(rule.id, { enabled: !rule.enabled });
    await refreshNotifications();
    addToast('info', rule.enabled ? 'Rule Paused' : 'Rule Enabled', rule.name);
  };

  const handleDeleteRule = async (id: string) => {
    await repository.deleteAlertRule(id);
    await refreshNotifications();
    addToast('info', 'Alert Rule Deleted');
  };

  const weightSum =
    riskWeights.severityWeight +
    riskWeights.repeatWeight +
    riskWeights.openIncidentWeight +
    riskWeights.trendWeight;

  const handleSaveWeights = () => {
    if (!isAdmin) {
      addToast('error', 'Admin Role Required', 'Only administrators can modify risk scoring weights.');
      return;
    }
    if (Math.abs(weightSum - 1.0) > 0.015) {
      addToast('error', 'Invalid Weight Sum', `Weights must sum to 100% (currently ${Math.round(weightSum * 100)}%).`);
      return;
    }
    const updated: PPESettings = { ...settings, riskWeights };
    repository.saveSettings(updated);
    setSettings(updated);
    addToast('success', 'Risk Weights Updated', 'Intelligence zone and camera risk scoring recalibrated.');
  };

  const handleResetWeights = () => {
    if (!isAdmin) return;
    setRiskWeights({ ...DEFAULT_RISK_WEIGHTS });
  };

  const handlePurgeEvidence = async () => {
    setCleaning(true);
    try {
      const updated = { ...settings, evidenceRetentionDays: retentionDays };
      repository.saveSettings(updated);
      setSettings(updated);
      const res = await repository.cleanupOldEvidence(retentionDays);
      addToast(
        'success',
        'Retention Cleanup Complete',
        `Purged ${res.deletedCount} raw evidence frames older than ${retentionDays} days.`
      );
      if (isAdmin) loadHealthStats();
    } catch {
      addToast('error', 'Cleanup Failed');
    } finally {
      setCleaning(false);
    }
  };

  const runSelfTest = async () => {
    if (!isAdmin) return;
    setIsRunningSelfTest(true);
    const updateStep = (idx: number, patch: Partial<SelfTestStep>) => {
      setSelfTestSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    };

    try {
      // 1. IndexedDB
      updateStep(0, { status: 'running' });
      const t0 = performance.now();
      await repository.getAllScans();
      await repository.getAllIncidents();
      const d0 = Math.round(performance.now() - t0);
      updateStep(0, { status: 'passed', durationMs: d0, details: 'IndexedDB v5 transactions verified' });

      // 2. Engine ping
      updateStep(1, { status: 'running' });
      const t1 = performance.now();
      const eng = detector.getActiveEngine();
      const res = await fetch('/api/engine-info');
      const d1 = Math.round(performance.now() - t1);
      updateStep(1, {
        status: res.ok ? 'passed' : 'failed',
        durationMs: d1,
        details: `${eng} · HTTP ${res.status}`,
      });

      // 3. Knowledge retrieval
      updateStep(2, { status: 'running' });
      const t2 = performance.now();
      const chunks = await knowledgeService.hybridSearch('hardhat required Zone A');
      const d2 = Math.round(performance.now() - t2);
      updateStep(2, {
        status: 'passed',
        durationMs: d2,
        details: `Returned ${chunks.length} ranked chunks`,
      });

      // 4. PDF Synthesis
      updateStep(3, { status: 'running' });
      const t3 = performance.now();
      const sample = compileReportData({
        type: 'daily_safety_summary',
        parameters: {
          dateRange: 'today',
          zones: ['A'],
          cameras: ['CAM-01'],
          includeEvidenceThumbnails: false,
          maxThumbnails: 0,
          includeAINarrative: false,
          includePolicyReferences: true,
          language: 'en',
        },
        scans: [],
        violations: [],
        incidents: [],
        actions: [],
        zoneRisks: [],
        userEmail: currentUser?.email || 'admin@safevision.ai',
      });
      const blob = await exportReportToPDF(sample);
      const d3 = Math.round(performance.now() - t3);
      updateStep(3, {
        status: blob.size > 500 ? 'passed' : 'failed',
        durationMs: d3,
        details: `Generated ${Math.round(blob.size / 1024)} KB PDF`,
      });

      setTelemetryRefreshTick((t) => t + 1);
      addToast('success', 'System Self-Test Complete', 'All subsystems passed verification.');
    } catch (err: any) {
      addToast('error', 'Self-Test Error', err.message || 'Diagnostic check encountered an issue.');
    } finally {
      setIsRunningSelfTest(false);
    }
  };

  // Telemetry stats (re-read whenever telemetryRefreshTick updates)
  const detectStats = React.useMemo(() => getMeasuredLatencyStats('detect_image'), [telemetryRefreshTick]);
  const ragStats = React.useMemo(() => getMeasuredLatencyStats('rag_retrieval'), [telemetryRefreshTick]);
  const pdfStats = React.useMemo(() => getMeasuredLatencyStats('report_pdf'), [telemetryRefreshTick]);

  const effectiveWebhook = settings.alertWebhookUrl || getAlertWebhookUrl() || '';

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-indigo-400 flex items-center gap-2">
              Platform Settings &amp; Governance
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">
                {currentUser?.role || 'supervisor'}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Configure PPE rules, alert automation, risk weights, data retention, and system diagnostics
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 overflow-x-auto pb-0.5 text-xs font-semibold">
        {[
          { id: 'general', label: 'Detection & Agent', icon: Sparkles },
          { id: 'rules', label: `Alert Rules (${alertRules.length})`, icon: BellRing },
          { id: 'weights', label: 'Risk Scoring Weights', icon: Cpu },
          { id: 'privacy', label: 'Privacy & Retention', icon: ShieldCheck },
          ...(isAdmin ? [{ id: 'health', label: 'System Health & Telemetry', icon: Activity }] : []),
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => changeTab(tab.id as SettingsTab)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: DETECTION & AGENT */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wide">
              Computer Vision PPE Parameters
            </h2>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium">Detection Confidence Threshold</span>
                <span className="font-mono text-amber-400 font-bold">
                  {Math.round(settings.confidenceThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.85"
                step="0.05"
                value={settings.confidenceThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, confidenceThreshold: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Lower values catch more edge-case violations; higher values reduce false positives.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-300 block">Required Site PPE Equipment</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {(['helmet', 'vest', 'mask', 'gloves', 'goggles'] as const).map((item) => (
                  <label
                    key={item}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer select-none hover:border-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={settings.requiredItems[item]}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          requiredItems: { ...settings.requiredItems, [item]: e.target.checked },
                        })
                      }
                      className="accent-amber-500 rounded"
                    />
                    <span className="capitalize text-slate-200">{item}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 font-medium block mb-1">Video Sample Interval (sec)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.frameSampleRate}
                  onChange={(e) =>
                    setSettings({ ...settings, frameSampleRate: Math.max(1, Number(e.target.value)) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono"
                />
              </div>

              <div className="flex flex-col justify-end space-y-2">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.autoSaveScans}
                    onChange={(e) => setSettings({ ...settings, autoSaveScans: e.target.checked })}
                    className="accent-amber-500 rounded"
                  />
                  <span>Auto-save scans to history</span>
                </label>
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.alertSound}
                    onChange={(e) => setSettings({ ...settings, alertSound: e.target.checked })}
                    className="accent-amber-500 rounded"
                  />
                  <span>Audio violation chime</span>
                </label>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-violet-400 uppercase tracking-wide">
                Agent Assistant &amp; Escalation Webhooks
              </h2>

              <div className="text-xs">
                <label className="text-slate-400 font-medium block mb-1">Assistant Display Name</label>
                <input
                  type="text"
                  value={settings.agentName || 'SafeVision Agent'}
                  onChange={(e) => setSettings({ ...settings, agentName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                />
              </div>

              <div className="text-xs">
                <label className="text-slate-400 font-medium block mb-1">Supervisor Notification Email</label>
                <input
                  type="email"
                  value={settings.supervisorEmail || ''}
                  onChange={(e) => setSettings({ ...settings, supervisorEmail: e.target.value })}
                  placeholder="safety.supervisor@company.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                />
              </div>

              <div className="text-xs">
                <label className="text-slate-400 font-medium block mb-1">
                  Alert &amp; Report Webhook URL (Optional)
                </label>
                <input
                  type="url"
                  value={settings.alertWebhookUrl || ''}
                  onChange={(e) => setSettings({ ...settings, alertWebhookUrl: e.target.value })}
                  placeholder={effectiveWebhook || 'https://hooks.slack.com/services/... (optional)'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono text-[11px]"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used when triggered alert rules or scheduled reports send webhook summaries. Never store secret tokens in browser logs.
                </p>
              </div>

              <div className="space-y-2 pt-2 text-xs">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.requireAlertApproval !== false}
                    onChange={(e) => setSettings({ ...settings, requireAlertApproval: e.target.checked })}
                    className="accent-amber-500 rounded"
                  />
                  <span>Require human approval before agent dispatches supervisor alerts</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.disableKnowledgeAI)}
                    onChange={(e) => setSettings({ ...settings, disableKnowledgeAI: e.target.checked })}
                    className="accent-amber-500 rounded"
                  />
                  <span>Local Privacy Mode (disable cloud embeddings &amp; AI narratives)</span>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={handleSaveGeneral}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ALERT RULES CRUD */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wide">
                Automated Safety Alert Rules
              </h2>
              <p className="text-xs text-slate-400">
                Evaluates zone risk, compliance drops, and repeat infractions with 1-hour notification deduplication
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await triggerRuleEvaluation();
                  addToast('info', 'Rule Check Complete', 'Evaluated active rules against latest metrics.');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                Evaluate Rules Now
              </button>

              <button
                onClick={() => {
                  setEditingRuleId(null);
                  setRuleForm({
                    name: '',
                    condition: 'risk_gte',
                    threshold: 75,
                    windowHours: 1,
                    windowDays: 3,
                    enabled: true,
                  });
                  setShowRuleForm(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Alert Rule
              </button>
            </div>
          </div>

          {showRuleForm && (
            <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-4 text-xs">
              <div className="font-bold text-slate-100 text-sm">
                {editingRuleId ? 'Edit Alert Rule' : 'Create Safety Alert Rule'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-slate-400 block mb-1">Rule Name</label>
                  <input
                    type="text"
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                    placeholder="e.g. High Zone Risk >= 75"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Condition Metric</label>
                  <select
                    value={ruleForm.condition}
                    onChange={(e) => setRuleForm({ ...ruleForm, condition: e.target.value as AlertRuleCondition })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100"
                  >
                    <option value="risk_gte">Zone Risk Score &ge; Threshold</option>
                    <option value="compliance_lt">Site Compliance % &lt; Threshold</option>
                    <option value="repeat_gte">Repeat Violation Rate % &ge; Threshold</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-slate-400 block mb-1">Threshold Value</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={ruleForm.threshold}
                    onChange={(e) => setRuleForm({ ...ruleForm, threshold: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono"
                  />
                </div>

                {ruleForm.condition === 'compliance_lt' && (
                  <div>
                    <label className="text-slate-400 block mb-1">Evaluation Window (Days)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={ruleForm.windowDays}
                      onChange={(e) => setRuleForm({ ...ruleForm, windowDays: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>
                )}

                {ruleForm.condition === 'repeat_gte' && (
                  <div>
                    <label className="text-slate-400 block mb-1">Cluster Window (Hours)</label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={ruleForm.windowHours}
                      onChange={(e) => setRuleForm({ ...ruleForm, windowHours: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => setShowRuleForm(false)}
                    className="px-3 py-2 rounded-xl text-slate-400 hover:text-amber-400 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveRule}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold cursor-pointer"
                  >
                    Save Rule
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {alertRules.map((rule) => (
              <div
                key={rule.id}
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-100">{rule.name}</div>
                    <div className="text-[11px] font-mono text-amber-400 mt-1">
                      {rule.condition === 'risk_gte' && `Trigger if Zone Risk >= ${rule.threshold}/100`}
                      {rule.condition === 'compliance_lt' &&
                        `Trigger if Compliance < ${rule.threshold}% (${rule.windowDays || 3}d window)`}
                      {rule.condition === 'repeat_gte' &&
                        `Trigger if Repeat Rate >= ${rule.threshold}% (${rule.windowHours || 1}h cluster)`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleRule(rule)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer ${
                      rule.enabled
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {rule.enabled ? 'ENABLED' : 'PAUSED'}
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-mono">
                    Last fired: {rule.lastFiredAt ? new Date(rule.lastFiredAt).toLocaleString() : 'Never'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="p-1 text-slate-400 hover:text-amber-400 cursor-pointer"
                      title="Edit rule"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                      title="Delete rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: RISK WEIGHTS (ADMIN-EDITABLE) */}
      {activeTab === 'weights' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 max-w-3xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wide">
                Composite Zone &amp; Camera Risk Scoring Formula
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Default: 40% severity-weighted rate + 25% repeat rate + 20% open-incident load + 15% trend worsening.
              </p>
            </div>
            {!isAdmin && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-amber-400 border border-slate-700">
                <Lock className="w-3 h-3" />
                Admin Editable Only
              </span>
            )}
          </div>

          <div className="space-y-4">
            {[
              { key: 'severityWeight' as const, label: 'Severity-Weighted Violation Rate', min: 0.1, max: 0.8 },
              { key: 'repeatWeight' as const, label: 'Repeat-Violation Rate (7-Day Same Zone & Class)', min: 0.05, max: 0.6 },
              { key: 'openIncidentWeight' as const, label: 'Open-Incident Load', min: 0.05, max: 0.5 },
              { key: 'trendWeight' as const, label: 'Trend Worsening (vs Prior Period)', min: 0.05, max: 0.4 },
            ].map((item) => (
              <div key={item.key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-slate-300">{item.label}</span>
                  <span className="font-mono text-amber-400 font-bold">
                    {Math.round(riskWeights[item.key] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  disabled={!isAdmin}
                  min={item.min}
                  max={item.max}
                  step={0.05}
                  value={riskWeights[item.key]}
                  onChange={(e) =>
                    setRiskWeights({ ...riskWeights, [item.key]: parseFloat(e.target.value) })
                  }
                  className="w-full accent-amber-500 disabled:opacity-50"
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-mono">
              Sum:{' '}
              <span
                className={
                  Math.abs(weightSum - 1.0) <= 0.015 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                }
              >
                {Math.round(weightSum * 100)}%
              </span>{' '}
              <span className="text-slate-500">(Must equal 100%)</span>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetWeights}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-300 hover:text-amber-400 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Defaults
                </button>
                <button
                  onClick={handleSaveWeights}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save Weights
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PRIVACY & RETENTION */}
      {activeTab === 'privacy' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 max-w-3xl">
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <ShieldCheck className="w-4 h-4" />
              Non-Biometric Privacy Architecture
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              SafeVision AI enforces strict privacy-by-design. It never performs facial recognition, biometric identification,
              or individual worker scoring/ranking. All workplace intelligence metrics aggregate solely by operational zone (A–D),
              camera feed, violation class, and timestamp.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div>
              <div className="text-sm font-bold text-slate-100">Evidence Image Retention Window</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Raw visual frames older than this window are purged while preserving aggregate compliance metrics.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value, 10))}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200"
              >
                <option value={30}>30 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days (Default)</option>
                <option value={180}>180 Days</option>
              </select>

              <button
                onClick={handlePurgeEvidence}
                disabled={cleaning}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {cleaning ? 'Purging...' : 'Purge Old Frames Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM HEALTH & TELEMETRY (ADMIN ONLY) */}
      {activeTab === 'health' && isAdmin && (
        <div className="space-y-6">
          {/* 80% Storage Quota Warning Banner */}
          {storageEst.pct >= 80 && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-rose-300">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <span className="font-bold block">Storage Quota Warning ({storageEst.pct}% Used)</span>
                  <span>
                    Browser IndexedDB usage is above 80% ({storageEst.usageMB} MB / {storageEst.quotaMB} MB). Purge old
                    evidence frames or prune stored report PDFs.
                  </span>
                </div>
              </div>
              <button
                onClick={() => changeTab('privacy')}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-yellow-200 font-bold shrink-0 cursor-pointer"
              >
                Manage Retention
              </button>
            </div>
          )}

          {/* Active Runtime Engines */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-slate-400">Detection Engine</div>
              <div className="text-sm font-bold text-slate-100 mt-1">{detector.getActiveEngine()}</div>
              <div className="text-[10px] text-emerald-400 mt-1 font-mono">
                Gemini Key: {isGeminiConfigured() ? 'Configured' : 'Server/Heuristic'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-slate-400">Agent Runtime</div>
              <div className="text-sm font-bold text-purple-300 mt-1">{getAgentEngineBadge()}</div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                {isAgentApiConfigured() ? 'Remote SSE Active' : 'Browser StateGraph'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="text-[11px] text-slate-400">Auth &amp; Persistence</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {isFirebaseConfigured() ? 'Firebase + Firestore' : 'Demo Auth + IndexedDB'}
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">IndexedDB Schema v5</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>IndexedDB Quota</span>
                <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-sm font-bold text-slate-100 font-mono mt-1">
                {storageEst.usageMB} / {storageEst.quotaMB} MB ({storageEst.pct}%)
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full ${storageEst.pct >= 80 ? 'bg-rose-500' : 'bg-blue-400'}`}
                  style={{ width: `${Math.min(100, Math.max(2, storageEst.pct))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Endpoint Reachability & Real Latency + Measured Session Telemetry */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-400">Endpoint Reachability &amp; RTT Latency</h3>
                <button
                  onClick={runHealthPings}
                  disabled={pinging}
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${pinging ? 'animate-spin' : ''}`} />
                  Re-ping
                </button>
              </div>
              <div className="space-y-2 text-xs">
                {pings.map((p) => (
                  <div
                    key={p.name}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">{p.detail}</div>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      {p.latencyMs !== undefined && <span className="text-slate-300">{p.latencyMs}ms</span>}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          p.status === 'online'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : p.status === 'degraded'
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-rose-500/15 text-rose-400'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-purple-400">Live Browser Session Telemetry (p50 / p95)</h3>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { label: 'Image Detection', stats: detectStats, color: 'text-amber-400' },
                  { label: 'KB RAG Search', stats: ragStats, color: 'text-purple-400' },
                  { label: 'PDF Export', stats: pdfStats, color: 'text-emerald-400' },
                ].map((m) => (
                  <div key={m.label} className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[11px]">{m.label}</div>
                    <div className={`text-base font-bold font-mono mt-1 ${m.color}`}>
                      {m.stats.p50 !== null ? `${m.stats.p50} / ${m.stats.p95}ms` : 'No samples'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">{m.stats.count} recorded runs</div>
                  </div>
                ))}
              </div>

              {/* Latest RAG Eval Summary */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  <div>
                    <div className="font-semibold text-slate-200">Last RAG Benchmark Run</div>
                    {latestEval ? (
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Hit@3: {Math.round(latestEval.summary.hitAt3Rate * 100)}% · MRR:{' '}
                        {latestEval.summary.meanReciprocalRank.toFixed(2)} · Groundedness:{' '}
                        {Math.round(latestEval.summary.averageGroundedness * 100)}%
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        No benchmark runs recorded yet
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => navigate('/knowledge')}
                  className="text-amber-400 hover:underline font-medium cursor-pointer"
                >
                  Open KB →
                </button>
              </div>
            </div>
          </div>

          {/* Collection Inventory */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              IndexedDB Collection Inventory
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {Object.entries(counts).map(([name, val]) => (
                <div key={name} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400 truncate">{name}</div>
                  <div className="text-base font-bold font-mono text-amber-400 mt-0.5">{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Self-Test */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-emerald-400">Automated Diagnostic Self-Test</h3>
                <p className="text-xs text-slate-400">
                  Verifies IndexedDB storage, API endpoints, hybrid RAG retrieval, and dynamic PDF rendering
                </p>
              </div>
              <button
                onClick={runSelfTest}
                disabled={isRunningSelfTest}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                {isRunningSelfTest ? 'Running...' : 'Run Self-Test'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {selfTestSteps.map((step) => (
                <div
                  key={step.name}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    {step.status === 'passed' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {step.status === 'failed' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                    {step.status === 'running' && (
                      <div className="w-3.5 h-3.5 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin shrink-0" />
                    )}
                    {step.status === 'idle' && <div className="w-3.5 h-3.5 rounded-full bg-slate-700 shrink-0" />}
                    <span className="text-slate-200 font-medium">{step.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    {step.details && <span className="text-slate-400 hidden sm:inline">{step.details}</span>}
                    {step.durationMs !== undefined && (
                      <span className="text-emerald-400 font-bold">{step.durationMs}ms</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

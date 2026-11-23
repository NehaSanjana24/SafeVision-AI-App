import {
  Scan,
  Violation,
  PPESettings,
  FalsePositiveFeedback,
  KnowledgeDocument,
  DocumentChunk,
  ExtractedField,
  SearchHistoryItem,
  ReviewStatus,
  Conversation,
  Message,
  Incident,
  WorkflowRun,
  RAGEvaluationRun,
  CorrectiveAction,
  ReportRecord,
  ReportSchedule,
  Notification,
  SavedView,
  AlertRule,
} from '../types';
import { idbGetAll, idbPut, idbDelete, idbGet, idbClear } from './db';

const SETTINGS_KEY = 'safevision_ppe_settings';

export const DEFAULT_SETTINGS: PPESettings = {
  confidenceThreshold: 0.4,
  requiredItems: {
    helmet: true,
    vest: true,
    mask: false,
    gloves: true,
    goggles: false,
  },
  frameSampleRate: 1, // 1 frame per second
  alertSound: true,
  autoSaveScans: true,
  agentName: 'SafeVision Agent',
  requireAlertApproval: true,
  alertWebhookUrl: '',
  supervisorEmail: 'safety.lead@safevision.ai',
  evidenceRetentionDays: 90,
  riskWeights: {
    severityWeight: 0.40,
    repeatWeight: 0.25,
    openIncidentWeight: 0.20,
    trendWeight: 0.15,
  },
};

// Repository Module
export const repository = {
  // Scans
  async getAllScans(): Promise<Scan[]> {
    try {
      const scans = await idbGetAll<Scan>('scans');
      return scans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.warn('IDB failed, falling back to localStorage for scans', err);
      const raw = localStorage.getItem('safevision_scans_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async getScanById(id: string): Promise<Scan | undefined> {
    try {
      return await idbGet<Scan>('scans', id);
    } catch {
      const all = await this.getAllScans();
      return all.find((s) => s.id === id);
    }
  },

  async saveScan(scan: Scan): Promise<void> {
    try {
      await idbPut('scans', scan);
    } catch (err) {
      console.warn('IDB put scan failed, storing in localStorage fallback', err);
      const scans = await this.getAllScans();
      const updated = [scan, ...scans.filter((s) => s.id !== scan.id)];
      // Exclude large evidence frame in localStorage fallback to avoid quota limit
      const light = updated.map((s) => ({ ...s, evidenceFrame: undefined, annotatedThumbnail: undefined }));
      localStorage.setItem('safevision_scans_fallback', JSON.stringify(light.slice(0, 50)));
    }
  },

  async deleteScan(id: string): Promise<void> {
    try {
      await idbDelete('scans', id);
    } catch (err) {
      console.error(err);
    }
    // Also delete associated violations
    const violations = await this.getAllViolations();
    for (const v of violations) {
      if (v.scanId === id) {
        await this.deleteViolation(v.id);
      }
    }
  },

  // Violations
  async getAllViolations(): Promise<Violation[]> {
    try {
      const violations = await idbGetAll<Violation>('violations');
      return violations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.warn('IDB violations fallback', err);
      const raw = localStorage.getItem('safevision_violations_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async saveViolation(violation: Violation): Promise<void> {
    try {
      await idbPut('violations', violation);
    } catch (err) {
      console.warn('IDB put violation failed, storing in localStorage fallback', err);
      const existing = await this.getAllViolations();
      const updated = [violation, ...existing.filter((v) => v.id !== violation.id)];
      const light = updated.map((v) => ({ ...v, evidenceImage: undefined }));
      localStorage.setItem('safevision_violations_fallback', JSON.stringify(light.slice(0, 100)));
    }
  },

  async deleteViolation(id: string): Promise<void> {
    try {
      await idbDelete('violations', id);
    } catch (err) {
      console.error(err);
      const existing = await this.getAllViolations();
      localStorage.setItem(
        'safevision_violations_fallback',
        JSON.stringify(existing.filter((v) => v.id !== id))
      );
    }
  },

  // Flag violation as False Positive and store model feedback
  async flagViolationAsFalsePositive(
    violationId: string,
    params: { reason: string; notes?: string; userEmail: string; userName?: string }
  ): Promise<Violation | null> {
    try {
      const violations = await this.getAllViolations();
      const target = violations.find((v) => v.id === violationId);
      if (!target) return null;

      const updatedViolation: Violation = {
        ...target,
        isFalsePositive: true,
        falsePositiveReason: params.reason,
        falsePositiveNotes: params.notes,
        flaggedBy: params.userEmail,
        flaggedAt: new Date().toISOString(),
      };

      await this.saveViolation(updatedViolation);

      // Save feedback entry to improve system confidence
      const feedbackEntry: FalsePositiveFeedback = {
        id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        violationId: target.id,
        scanId: target.scanId,
        className: target.type,
        confidence: target.confidence,
        reason: params.reason,
        notes: params.notes,
        flaggedBy: params.userEmail,
        flaggedByName: params.userName,
        sourceType: target.sourceType,
        fileName: target.fileName,
        createdAt: new Date().toISOString(),
      };
      await this.recordDetectionFeedback(feedbackEntry);

      // Recalculate parent scan metrics
      await this.recalculateScanMetrics(target.scanId);

      return updatedViolation;
    } catch (err) {
      console.error('Failed to flag false positive:', err);
      return null;
    }
  },

  // Undo false positive flag
  async unflagFalsePositive(violationId: string): Promise<Violation | null> {
    try {
      const violations = await this.getAllViolations();
      const target = violations.find((v) => v.id === violationId);
      if (!target) return null;

      const updatedViolation: Violation = {
        ...target,
        isFalsePositive: false,
        falsePositiveReason: undefined,
        falsePositiveNotes: undefined,
        flaggedBy: undefined,
        flaggedAt: undefined,
      };

      await this.saveViolation(updatedViolation);
      await this.recalculateScanMetrics(target.scanId);
      return updatedViolation;
    } catch (err) {
      console.error('Failed to unflag false positive:', err);
      return null;
    }
  },

  async toggleViolationResolved(violationId: string, resolved?: boolean): Promise<Violation | null> {
    try {
      const violations = await this.getAllViolations();
      const target = violations.find((v) => v.id === violationId);
      if (!target) return null;

      const nextResolved = resolved !== undefined ? resolved : !Boolean(target.resolved);
      const updatedViolation: Violation = {
        ...target,
        resolved: nextResolved,
      };

      await this.saveViolation(updatedViolation);
      return updatedViolation;
    } catch (err) {
      console.error('Failed to toggle violation resolved status:', err);
      return null;
    }
  },

  // Record feedback instance
  async recordDetectionFeedback(feedback: FalsePositiveFeedback): Promise<void> {
    try {
      await idbPut('feedback', feedback);
    } catch (err) {
      console.warn('IDB feedback fallback to localStorage', err);
      const raw = localStorage.getItem('safevision_feedback_fallback');
      const list: FalsePositiveFeedback[] = raw ? JSON.parse(raw) : [];
      list.push(feedback);
      localStorage.setItem('safevision_feedback_fallback', JSON.stringify(list.slice(-100)));
    }
  },

  async getAllFeedback(): Promise<FalsePositiveFeedback[]> {
    try {
      const list = await idbGetAll<FalsePositiveFeedback>('feedback');
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      const raw = localStorage.getItem('safevision_feedback_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  // Recalculate scan compliance score excluding false positives
  async recalculateScanMetrics(scanId: string): Promise<void> {
    try {
      const scan = await this.getScanById(scanId);
      if (!scan) return;

      const allViolations = await this.getAllViolations();
      const scanViolations = allViolations.filter((v) => v.scanId === scanId);
      const activeViolations = scanViolations.filter((v) => !v.isFalsePositive);

      const totalPersons = Math.max(scan.totalPersons || 1, 1);
      let newCompliance = 100;
      if (activeViolations.length > 0) {
        newCompliance = Math.max(15, Math.round(Math.max(0, 1 - activeViolations.length / (totalPersons * 2)) * 100));
      }

      const updatedScan: Scan = {
        ...scan,
        totalViolations: activeViolations.length,
        compliancePct: newCompliance,
      };
      await this.saveScan(updatedScan);
    } catch (err) {
      console.error('Failed to recalculate scan metrics:', err);
    }
  },

  async clearAllData(): Promise<void> {
    try {
      await idbClear('scans');
      await idbClear('violations');
    } catch (err) {
      console.error(err);
    }
    localStorage.removeItem('safevision_scans_fallback');
    localStorage.removeItem('safevision_violations_fallback');
  },

  // Settings
  getSettings(): PPESettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: PPESettings): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  // Seed sample data for empty states (90 days of realistic multi-zone data)
  async seedSampleData(): Promise<{ scansCount: number; violationsCount: number }> {
    const now = new Date();
    const violationTypes = ['NO-Helmet', 'NO-Vest', 'Missing Gloves', 'NO-Goggles', 'NO-Mask'];
    const dummyNames = [
      'cctv_zone_a_cam01.jpg',
      'crane_deck_assembly.mp4',
      'scaffolding_tower_lvl2.jpg',
      'welding_bay_east.mp4',
      'loading_dock_feed.jpg',
      'chemical_handling_bay.jpg',
      'tunnel_excavation_section_3.mp4',
      'structural_steel_framing.jpg',
      'gate_access_security.jpg',
      'heavy_equipment_perimeter.mp4',
    ];
    const zones: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const cameras = ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04', 'CAM-05', 'CAM-06'];

    const newScans: Scan[] = [];
    const newViolations: Violation[] = [];

    // 1. Specially inject Zone A morning NO-Helmet violation today at 08:45:00 (for Milestone 3 Assistant flow)
    const todayMorning = new Date();
    todayMorning.setHours(8, 45, 0, 0);

    const morningScanId = `scan_morning_zone_a_${Date.now()}`;
    const morningScan: Scan = {
      id: morningScanId,
      userId: 'admin-001',
      userEmail: 'safety.lead@safevision.ai',
      sourceType: 'image',
      fileName: 'cctv_zone_a_cam01_morning.jpg',
      zone: 'A',
      cameraId: 'CAM-01',
      location: 'Zone A - Fabrication Bay & Crane Yard',
      totalPersons: 2,
      totalViolations: 1,
      compliancePct: 50,
      detectedClasses: ['person', 'vest', 'NO-Helmet'],
      createdAt: todayMorning.toISOString(),
    };
    newScans.push(morningScan);

    const morningViolation: Violation = {
      id: `viol_${morningScanId}_0`,
      scanId: morningScanId,
      sourceType: 'image',
      fileName: 'cctv_zone_a_cam01_morning.jpg',
      zone: 'A',
      cameraId: 'CAM-01',
      type: 'NO-Helmet',
      severity: 'high',
      confidence: 0.94,
      bbox: [140, 60, 310, 380],
      resolved: false,
      createdAt: todayMorning.toISOString(),
    };
    newViolations.push(morningViolation);

    // 2. Generate 90 days of varied historical scans
    // Note: CAM-04 is intentionally SILENT in the past 24h (only appears >= 3 days ago)
    for (let day = 0; day < 90; day++) {
      const isAnomalyDay = day === 5; // Exactly 5 days ago: severe safety spike
      const scansInDay = isAnomalyDay ? 12 : Math.floor(Math.random() * 2) + 1; // 1-2 scans regular, 12 on anomaly day

      for (let s = 0; s < scansInDay; s++) {
        const hour = isAnomalyDay ? (7 + s) % 24 : Math.floor(Math.random() * 14) + 6; // mostly work hours 6am - 8pm
        const minute = Math.floor(Math.random() * 59);
        const scanDate = new Date(now.getTime() - day * 24 * 3600 * 1000);
        scanDate.setHours(hour, minute, 0, 0);

        const scanId = `scan_${Date.now()}_d${day}_s${s}`;
        const isVideo = s % 3 === 0;
        const fileName = dummyNames[(day + s) % dummyNames.length];
        const assignedZone = zones[(day + s) % zones.length];

        // CAM-04 must NOT have any data in the last 24h (day === 0)
        let assignedCamera = cameras[(day * 2 + s) % cameras.length];
        if (day === 0 && assignedCamera === 'CAM-04') {
          assignedCamera = 'CAM-01';
        }

        const persons = Math.floor(Math.random() * 4) + 1;
        // On anomaly day, high violation probability
        const hasViolation = isAnomalyDay ? true : Math.random() > 0.45;
        const violationCount = hasViolation ? (isAnomalyDay ? Math.floor(Math.random() * 2) + 2 : 1) : 0;
        const compliancePct = violationCount === 0 ? 100 : Math.max(25, Math.round(((persons - violationCount * 0.5) / persons) * 100));

        const detectedClasses = ['person'];
        if (Math.random() > 0.2) detectedClasses.push('helmet');
        if (Math.random() > 0.3) detectedClasses.push('vest');
        if (Math.random() > 0.6) detectedClasses.push('gloves');

        const scan: Scan = {
          id: scanId,
          userId: 'admin-001',
          userEmail: 'safety.lead@safevision.ai',
          sourceType: isVideo ? 'video' : 'image',
          fileName,
          zone: assignedZone,
          cameraId: assignedCamera,
          location: `Zone ${assignedZone} - Sector ${((day + s) % 4) + 1}`,
          totalPersons: persons,
          totalViolations: violationCount,
          compliancePct,
          detectedClasses,
          createdAt: scanDate.toISOString(),
        };
        newScans.push(scan);

        for (let v = 0; v < violationCount; v++) {
          const vType = violationTypes[(day + v) % violationTypes.length];
          const vId = `viol_${scanId}_${v}`;
          const conf = Math.round((0.75 + Math.random() * 0.22) * 100) / 100;
          const severity: 'low' | 'moderate' | 'medium' | 'high' | 'critical' =
            vType.includes('Helmet') ? 'high' : vType.includes('Vest') ? 'medium' : isAnomalyDay ? 'critical' : 'low';

          // Mark some older ones as resolved, and flag 2 false positives
          const isFalsePositive = day > 10 && day % 17 === 0 && v === 0;

          const violation: Violation = {
            id: vId,
            scanId,
            sourceType: scan.sourceType,
            fileName,
            zone: assignedZone,
            cameraId: assignedCamera,
            type: vType,
            severity,
            confidence: conf,
            frameTime: isVideo ? Math.floor(Math.random() * 30) + 1 : undefined,
            bbox: [100 + v * 40, 70 + v * 30, 260 + v * 40, 310 + v * 30],
            resolved: day > 7,
            isFalsePositive,
            falsePositiveReason: isFalsePositive ? 'High-contrast shadow mistaken for missing vest' : undefined,
            flaggedBy: isFalsePositive ? 'safety.lead@safevision.ai' : undefined,
            flaggedAt: isFalsePositive ? scanDate.toISOString() : undefined,
            createdAt: scanDate.toISOString(),
          };
          newViolations.push(violation);
        }
      }
    }

    // Save scans & violations
    for (const s of newScans) {
      await repository.saveScan(s);
    }
    for (const v of newViolations) {
      await repository.saveViolation(v);
    }

    // 3. Seed Realistic Incidents
    const sampleIncidents: Incident[] = [
      {
        id: `inc_${Date.now()}_1`,
        incidentNumber: 101,
        title: 'High Severity: Missing Head Protection in Zone A Yard',
        summary: 'Automated CCTV detected contractor personnel without required helmet near crane lift perimeter.',
        zone: 'A',
        cameraId: 'CAM-01',
        severity: 'high',
        status: 'open',
        source: 'agent',
        violationIds: [morningViolation.id],
        scanIds: [morningScanId],
        policyCitations: ['OSHA 1926.100 - Head Protection', 'SafeVision Site Rules Sec 4.1'],
        assignedTo: 'safety.lead@safevision.ai',
        createdAt: todayMorning.toISOString(),
        updatedAt: todayMorning.toISOString(),
      },
      {
        id: `inc_${Date.now()}_2`,
        incidentNumber: 102,
        title: 'Multiple High-Visibility Vest Infractions in Loading Bay',
        summary: 'Forklift transit corridor observed with 3 logistics workers missing reflective vests during night shift.',
        zone: 'B',
        cameraId: 'CAM-02',
        severity: 'critical',
        status: 'investigating',
        source: 'agent',
        violationIds: [],
        policyCitations: ['OSHA 1926.201 - High-Visibility Apparel', 'Site Traffic Rules Sec 2.3'],
        assignedTo: 'supervisor@safevision.ai',
        createdAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: `inc_${Date.now()}_3`,
        incidentNumber: 103,
        title: 'Anomaly Day Cluster: Missing Face Shields in Welding Bay',
        summary: 'Major PPE anomaly detected during structural welding operations with unshielded torch operations.',
        zone: 'C',
        cameraId: 'CAM-03',
        severity: 'critical',
        status: 'closed',
        source: 'agent',
        violationIds: [],
        policyCitations: ['OSHA 1910.133 - Eye and Face Protection', 'Hot Work SOP Sec 7.2'],
        assignedTo: 'safety.lead@safevision.ai',
        createdAt: new Date(now.getTime() - 5 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString(),
      },
    ];

    for (const inc of sampleIncidents) {
      await repository.saveIncident(inc);
    }

    // 4. Seed Corrective Actions (with overdue ones for verification)
    const overdueDate = new Date(now.getTime() - 4 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const upcomingDate = new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const nextWeekDate = new Date(now.getTime() + 10 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const sampleActions: CorrectiveAction[] = [
      {
        id: `ca_1_${Date.now()}`,
        incidentId: sampleIncidents[0].id,
        zone: 'A',
        title: 'Install physical barricade and hardhat sign at Crane Gate A',
        ownerRole: 'Site Engineer',
        dueDate: overdueDate, // OVERDUE
        status: 'overdue',
        notes: 'Awaiting heavy steel stanchions delivery from supplier.',
        createdBy: 'safety.lead@safevision.ai',
        createdAt: new Date(now.getTime() - 12 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: `ca_2_${Date.now()}`,
        incidentId: sampleIncidents[1].id,
        zone: 'B',
        title: 'Reflective vest replenishment at Loading Dock lockers',
        ownerRole: 'Safety Supervisor',
        dueDate: overdueDate, // OVERDUE
        status: 'overdue',
        notes: 'Distribute 50 Class-3 ANSI certified vests to night shift team.',
        createdBy: 'safety.lead@safevision.ai',
        createdAt: new Date(now.getTime() - 8 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: `ca_3_${Date.now()}`,
        incidentId: sampleIncidents[2].id,
        zone: 'C',
        title: 'Perform welding fume and optical radiation safety toolbox talk',
        ownerRole: 'Safety Supervisor',
        dueDate: upcomingDate,
        status: 'in_progress',
        notes: 'Toolbox session scheduled with welding subcontractors.',
        createdBy: 'safety.lead@safevision.ai',
        createdAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: `ca_4_${Date.now()}`,
        zone: 'D',
        title: 'Replace scratched lenses on CAM-04 enclosure to restore visual stream',
        ownerRole: 'Maintenance Lead',
        dueDate: nextWeekDate,
        status: 'planned',
        notes: 'Enclosure cleaning and optical inspection scheduled for Saturday.',
        createdBy: 'safety.lead@safevision.ai',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `ca_5_${Date.now()}`,
        zone: 'A',
        title: 'Update contractor safety badge verification protocol',
        ownerRole: 'Site Operations Manager',
        dueDate: new Date(now.getTime() - 15 * 24 * 3600 * 1000).toISOString().split('T')[0],
        status: 'done',
        notes: 'Automated turnstile scanner successfully integrated.',
        createdBy: 'safety.lead@safevision.ai',
        createdAt: new Date(now.getTime() - 20 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString(),
      },
    ];

    for (const ca of sampleActions) {
      await repository.saveCorrectiveAction(ca);
    }

    // 5. Seed Alert Rules & Saved Views & Notifications
    await repository.getAllAlertRules(); // will trigger defaults
    await repository.saveSavedView({
      id: `sv_high_risk`,
      userId: 'admin-001',
      name: 'High Risk Zones (A & B)',
      filters: {
        dateRange: '30d',
        zone: 'A',
        camera: 'all',
        source: 'all',
        violationClass: 'all',
        severity: 'high',
        incidentStatus: 'all',
        comparePrevious: true,
      },
      createdAt: new Date().toISOString(),
    });

    await repository.saveNotification({
      id: `notif_spike_${Date.now()}`,
      userId: 'admin-001',
      ruleId: 'rule_risk_high',
      title: 'Zone A Risk Threshold Exceeded',
      body: 'Calculated Risk Score for Zone A reached 74/100 (Critical Band) due to repeated head protection infractions.',
      severity: 'critical',
      read: false,
      createdAt: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
      link: '/intelligence?zone=A',
    });

    await repository.saveNotification({
      id: `notif_cam_${Date.now()}`,
      userId: 'admin-001',
      ruleId: 'rule_compliance_low',
      title: 'Silent Camera Detected: CAM-04',
      body: 'Camera 04 in Zone D has not transmitted any detection frames in over 24 hours. Check hardware feed.',
      severity: 'warning',
      read: false,
      createdAt: new Date(now.getTime() - 5 * 3600 * 1000).toISOString(),
      link: '/intelligence',
    });

    return { scansCount: newScans.length, violationsCount: newViolations.length };
  },

  // ==========================================
  // KNOWLEDGE BASE (Document Intelligence)
  // ==========================================
  async getAllDocuments(): Promise<KnowledgeDocument[]> {
    try {
      const docs = await idbGetAll<KnowledgeDocument>('documents');
      return docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.warn('IDB get documents error:', err);
      const raw = localStorage.getItem('safevision_docs_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async getDocumentById(id: string): Promise<KnowledgeDocument | undefined> {
    try {
      return await idbGet<KnowledgeDocument>('documents', id);
    } catch {
      const all = await this.getAllDocuments();
      return all.find((d) => d.id === id);
    }
  },

  async saveDocument(doc: KnowledgeDocument): Promise<void> {
    try {
      await idbPut('documents', doc);
    } catch (err) {
      console.warn('IDB put document failed:', err);
    }
  },

  async deleteDocument(id: string): Promise<void> {
    try {
      await idbDelete('documents', id);
      await idbDelete('documentBlobs', id);

      // Delete associated chunks
      const allChunks = await this.getAllChunks();
      for (const c of allChunks) {
        if (c.docId === id) {
          await idbDelete('chunks', c.id);
        }
      }

      // Delete associated extracted fields
      const allFields = await this.getAllExtractedFields();
      for (const f of allFields) {
        if (f.docId === id) {
          await idbDelete('extractedFields', f.id);
        }
      }
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  },

  async getAllChunks(): Promise<DocumentChunk[]> {
    try {
      return await idbGetAll<DocumentChunk>('chunks');
    } catch (err) {
      console.warn('IDB get chunks error:', err);
      return [];
    }
  },

  async getChunksByDocId(docId: string): Promise<DocumentChunk[]> {
    try {
      const all = await this.getAllChunks();
      return all.filter((c) => c.docId === docId);
    } catch {
      return [];
    }
  },

  async saveChunks(chunks: DocumentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      try {
        await idbPut('chunks', chunk);
      } catch (err) {
        console.warn('IDB put chunk error:', err);
      }
    }
  },

  async getAllExtractedFields(): Promise<ExtractedField[]> {
    try {
      return await idbGetAll<ExtractedField>('extractedFields');
    } catch (err) {
      console.warn('IDB get extractedFields error:', err);
      return [];
    }
  },

  async getExtractedFieldsByDocId(docId: string): Promise<ExtractedField[]> {
    try {
      const all = await this.getAllExtractedFields();
      return all.filter((f) => f.docId === docId);
    } catch {
      return [];
    }
  },

  async saveExtractedField(field: ExtractedField): Promise<void> {
    try {
      await idbPut('extractedFields', field);
    } catch (err) {
      console.warn('IDB put field error:', err);
    }
  },

  async saveExtractedFields(fields: ExtractedField[]): Promise<void> {
    for (const f of fields) {
      try {
        await idbPut('extractedFields', f);
      } catch (err) {
        console.warn('IDB put field error:', err);
      }
    }
  },

  async updateExtractedFieldReview(id: string, status: ReviewStatus, value?: string): Promise<void> {
    try {
      const field = await idbGet<ExtractedField>('extractedFields', id);
      if (field) {
        field.reviewStatus = status;
        if (value !== undefined) {
          field.value = value;
        }
        await idbPut('extractedFields', field);
      }
    } catch (err) {
      console.warn('Update review status failed:', err);
    }
  },

  async getSearchHistory(limit = 5): Promise<SearchHistoryItem[]> {
    try {
      const items = await idbGetAll<SearchHistoryItem>('searchHistory');
      return items
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);
    } catch {
      return [];
    }
  },

  async addSearchHistory(item: SearchHistoryItem): Promise<void> {
    try {
      await idbPut('searchHistory', item);
    } catch {}
  },

  async clearSearchHistory(): Promise<void> {
    try {
      await idbClear('searchHistory');
    } catch {}
  },

  async saveDocumentBlob(docId: string, mimeType: string, data: string | ArrayBuffer): Promise<void> {
    try {
      await idbPut('documentBlobs', { id: docId, docId, mimeType, data });
    } catch (err) {
      console.warn('Save document blob error:', err);
    }
  },

  async getDocumentBlob(docId: string): Promise<{ mimeType: string; data: string | ArrayBuffer } | undefined> {
    try {
      return await idbGet<{ id: string; docId: string; mimeType: string; data: string | ArrayBuffer }>('documentBlobs', docId);
    } catch {
      return undefined;
    }
  },

  async getKnowledgeStats(): Promise<{
    docCount: number;
    chunkCount: number;
    extractedCount: number;
    reviewRatePct: number | null;
  }> {
    const docs = await this.getAllDocuments();
    const chunks = await this.getAllChunks();
    const fields = await this.getAllExtractedFields();

    const reviewedFields = fields.filter((f) => f.reviewStatus !== 'unreviewed');
    const confirmedFields = fields.filter((f) => f.reviewStatus === 'confirmed');

    // Show "n/a" until at least 5 reviews as instructed
    const reviewRatePct =
      reviewedFields.length >= 5
        ? Math.round((confirmedFields.length / reviewedFields.length) * 100)
        : null;

    return {
      docCount: docs.length,
      chunkCount: chunks.length,
      extractedCount: fields.length,
      reviewRatePct,
    };
  },

  // ==========================================
  // CONVERSATIONS & MESSAGES (Milestone 3 RAG Agent)
  // ==========================================
  async getAllConversations(): Promise<Conversation[]> {
    try {
      const items = await idbGetAll<Conversation>('conversations');
      return items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
      return [];
    }
  },

  async getConversationById(id: string): Promise<Conversation | undefined> {
    try {
      return await idbGet<Conversation>('conversations', id);
    } catch {
      return undefined;
    }
  },

  async saveConversation(conv: Conversation): Promise<void> {
    try {
      await idbPut('conversations', conv);
    } catch (err) {
      console.warn('IDB put conversation failed:', err);
    }
  },

  async deleteConversation(id: string): Promise<void> {
    try {
      await idbDelete('conversations', id);
      // Delete associated messages
      const msgs = await this.getMessagesByConversationId(id);
      for (const m of msgs) {
        await idbDelete('messages', m.id);
      }
      // Also delete workflow runs for this conversation
      const runs = await this.getWorkflowRunsByConversationId(id);
      for (const r of runs) {
        await idbDelete('workflowRuns', r.id);
      }
    } catch (err) {
      console.warn('Delete conversation failed:', err);
    }
  },

  async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    try {
      const items = await idbGetAll<Message>('messages');
      return items
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } catch {
      return [];
    }
  },

  async saveMessage(msg: Message): Promise<void> {
    try {
      await idbPut('messages', msg);
    } catch (err) {
      console.warn('IDB put message failed:', err);
    }
  },

  async deleteMessage(id: string): Promise<void> {
    try {
      await idbDelete('messages', id);
    } catch (err) {
      console.warn('Delete message failed:', err);
    }
  },

  // ==========================================
  // INCIDENTS (Workflow & Escalation)
  // ==========================================
  async getAllIncidents(): Promise<Incident[]> {
    try {
      const items = await idbGetAll<Incident>('incidents');
      return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      const raw = localStorage.getItem('safevision_incidents_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async getIncidentById(id: string): Promise<Incident | undefined> {
    try {
      return await idbGet<Incident>('incidents', id);
    } catch {
      const all = await this.getAllIncidents();
      return all.find((i) => i.id === id);
    }
  },

  async saveIncident(incident: Incident): Promise<void> {
    try {
      await idbPut('incidents', incident);
    } catch (err) {
      console.warn('IDB put incident failed, storing in localStorage fallback', err);
      const existing = await this.getAllIncidents();
      const updated = [incident, ...existing.filter((i) => i.id !== incident.id)];
      localStorage.setItem('safevision_incidents_fallback', JSON.stringify(updated.slice(0, 100)));
    }
  },

  async updateIncidentStatus(id: string, status: Incident['status']): Promise<void> {
    try {
      const target = await this.getIncidentById(id);
      if (target) {
        target.status = status;
        target.updatedAt = new Date().toISOString();
        await this.saveIncident(target);
      }
    } catch (err) {
      console.warn('Update incident status failed:', err);
    }
  },

  async deleteIncident(id: string): Promise<void> {
    try {
      await idbDelete('incidents', id);
    } catch (err) {
      console.warn('Delete incident failed:', err);
    }
    const existing = await this.getAllIncidents();
    if (existing.some((i) => i.id === id)) {
      localStorage.setItem(
        'safevision_incidents_fallback',
        JSON.stringify(existing.filter((i) => i.id !== id))
      );
    }
  },

  async getNextIncidentNumber(): Promise<number> {
    const incidents = await this.getAllIncidents();
    if (incidents.length === 0) return 101;
    const maxNum = Math.max(...incidents.map((i) => i.incidentNumber || 100));
    return maxNum + 1;
  },

  // ==========================================
  // WORKFLOW RUNS (Active Workflows Panel)
  // ==========================================
  async getAllWorkflowRuns(): Promise<WorkflowRun[]> {
    try {
      const runs = await idbGetAll<WorkflowRun>('workflowRuns');
      return runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  },

  async getWorkflowRunsByConversationId(conversationId: string): Promise<WorkflowRun[]> {
    try {
      const runs = await this.getAllWorkflowRuns();
      return runs.filter((r) => r.conversationId === conversationId);
    } catch {
      return [];
    }
  },

  async saveWorkflowRun(run: WorkflowRun): Promise<void> {
    try {
      await idbPut('workflowRuns', run);
    } catch (err) {
      console.warn('IDB put workflowRun failed:', err);
    }
  },

  async updateWorkflowRun(id: string, updates: Partial<WorkflowRun>): Promise<void> {
    try {
      const run = await idbGet<WorkflowRun>('workflowRuns', id);
      if (run) {
        const updated = { ...run, ...updates, updatedAt: new Date().toISOString() };
        await idbPut('workflowRuns', updated);
      }
    } catch (err) {
      console.warn('Update workflow run failed:', err);
    }
  },

  // ==========================================
  // RAG EVALUATION RUNS
  // ==========================================
  async getAllRAGEvaluations(): Promise<RAGEvaluationRun[]> {
    try {
      const evals = await idbGetAll<RAGEvaluationRun>('ragEvaluations');
      return evals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  },

  async getLatestRAGEvaluation(): Promise<RAGEvaluationRun | undefined> {
    const all = await this.getAllRAGEvaluations();
    return all[0];
  },

  async saveRAGEvaluation(evalRun: RAGEvaluationRun): Promise<void> {
    try {
      await idbPut('ragEvaluations', evalRun);
    } catch (err) {
      console.warn('IDB put ragEvaluation failed:', err);
    }
  },

  // ==========================================
  // MILESTONE 4: CORRECTIVE ACTIONS
  // ==========================================
  async getAllCorrectiveActions(): Promise<CorrectiveAction[]> {
    try {
      const actions = await idbGetAll<CorrectiveAction>('correctiveActions');
      return actions.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    } catch {
      const raw = localStorage.getItem('safevision_ca_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async getCorrectiveActionById(id: string): Promise<CorrectiveAction | undefined> {
    try {
      return await idbGet<CorrectiveAction>('correctiveActions', id);
    } catch {
      const all = await this.getAllCorrectiveActions();
      return all.find((a) => a.id === id);
    }
  },

  async saveCorrectiveAction(action: CorrectiveAction): Promise<void> {
    try {
      await idbPut('correctiveActions', action);
    } catch {
      const all = await this.getAllCorrectiveActions();
      const updated = [action, ...all.filter((a) => a.id !== action.id)];
      localStorage.setItem('safevision_ca_fallback', JSON.stringify(updated));
    }
  },

  async updateCorrectiveAction(id: string, updates: Partial<CorrectiveAction>): Promise<void> {
    const existing = await this.getCorrectiveActionById(id);
    if (!existing) return;
    const updated: CorrectiveAction = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await this.saveCorrectiveAction(updated);
  },

  async deleteCorrectiveAction(id: string): Promise<void> {
    try {
      await idbDelete('correctiveActions', id);
    } catch {
      const all = await this.getAllCorrectiveActions();
      localStorage.setItem('safevision_ca_fallback', JSON.stringify(all.filter((a) => a.id !== id)));
    }
  },

  // ==========================================
  // MILESTONE 4: SAFETY & COMPLIANCE REPORTS
  // ==========================================
  async getAllReports(): Promise<ReportRecord[]> {
    try {
      const reports = await idbGetAll<ReportRecord>('reports');
      return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      const raw = localStorage.getItem('safevision_reports_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async getReportById(id: string): Promise<ReportRecord | undefined> {
    try {
      return await idbGet<ReportRecord>('reports', id);
    } catch {
      const all = await this.getAllReports();
      return all.find((r) => r.id === id);
    }
  },

  async saveReport(report: ReportRecord): Promise<void> {
    try {
      await idbPut('reports', report);
    } catch {
      const all = await this.getAllReports();
      const updated = [report, ...all.filter((r) => r.id !== report.id)];
      localStorage.setItem('safevision_reports_fallback', JSON.stringify(updated.slice(0, 30)));
    }
  },

  async updateReport(id: string, updates: Partial<ReportRecord>): Promise<void> {
    const existing = await this.getReportById(id);
    if (!existing) return;
    const updated: ReportRecord = { ...existing, ...updates };
    await this.saveReport(updated);
  },

  async deleteReport(id: string): Promise<void> {
    try {
      await idbDelete('reports', id);
      await idbDelete('reportBlobs', id);
    } catch {
      const all = await this.getAllReports();
      localStorage.setItem('safevision_reports_fallback', JSON.stringify(all.filter((r) => r.id !== id)));
    }
  },

  async saveReportBlob(id: string, blob: Blob | ArrayBuffer): Promise<void> {
    try {
      await idbPut('reportBlobs', { id, blob, createdAt: new Date().toISOString() });
    } catch (err) {
      // In-memory fallback for test and constrained environments
      (window as any).__safevision_blob_store = (window as any).__safevision_blob_store || new Map();
      (window as any).__safevision_blob_store.set(id, blob);
    }
  },

  async getReportBlob(id: string): Promise<any | undefined> {
    try {
      const record = await idbGet<{ id: string; blob: any }>('reportBlobs', id);
      if (record?.blob) return record.blob;
    } catch {}
    return (window as any).__safevision_blob_store?.get(id);
  },

  // ==========================================
  // MILESTONE 4: REPORT SCHEDULES
  // ==========================================
  async getAllReportSchedules(): Promise<ReportSchedule[]> {
    try {
      return await idbGetAll<ReportSchedule>('reportSchedules');
    } catch {
      const raw = localStorage.getItem('safevision_schedules_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async saveReportSchedule(sched: ReportSchedule): Promise<void> {
    try {
      await idbPut('reportSchedules', sched);
    } catch {
      const all = await this.getAllReportSchedules();
      const updated = [sched, ...all.filter((s) => s.id !== sched.id)];
      localStorage.setItem('safevision_schedules_fallback', JSON.stringify(updated));
    }
  },

  async deleteReportSchedule(id: string): Promise<void> {
    try {
      await idbDelete('reportSchedules', id);
    } catch {
      const all = await this.getAllReportSchedules();
      localStorage.setItem('safevision_schedules_fallback', JSON.stringify(all.filter((s) => s.id !== id)));
    }
  },

  // ==========================================
  // MILESTONE 4: IN-APP NOTIFICATIONS
  // ==========================================
  async getAllNotifications(userId?: string): Promise<Notification[]> {
    try {
      const notifs = await idbGetAll<Notification>('notifications');
      const filtered = userId ? notifs.filter((n) => !n.userId || n.userId === userId) : notifs;
      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      const raw = localStorage.getItem('safevision_notifs_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async saveNotification(notif: Notification): Promise<void> {
    try {
      await idbPut('notifications', notif);
    } catch {
      const all = await this.getAllNotifications();
      const updated = [notif, ...all.filter((n) => n.id !== notif.id)];
      localStorage.setItem('safevision_notifs_fallback', JSON.stringify(updated.slice(0, 50)));
    }
  },

  async markNotificationAsRead(id: string): Promise<void> {
    try {
      const notif = await idbGet<Notification>('notifications', id);
      if (notif) {
        notif.read = true;
        await idbPut('notifications', notif);
      }
    } catch {
      const all = await this.getAllNotifications();
      const updated = all.map((n) => (n.id === id ? { ...n, read: true } : n));
      localStorage.setItem('safevision_notifs_fallback', JSON.stringify(updated));
    }
  },

  async markAllNotificationsAsRead(userId?: string): Promise<void> {
    const all = await this.getAllNotifications(userId);
    for (const n of all) {
      if (!n.read) {
        n.read = true;
        await idbPut('notifications', n).catch(() => {});
      }
    }
    localStorage.setItem(
      'safevision_notifs_fallback',
      JSON.stringify(all.map((n) => ({ ...n, read: true })))
    );
  },

  async deleteNotification(id: string): Promise<void> {
    try {
      await idbDelete('notifications', id);
    } catch {
      const all = await this.getAllNotifications();
      localStorage.setItem('safevision_notifs_fallback', JSON.stringify(all.filter((n) => n.id !== id)));
    }
  },

  // ==========================================
  // MILESTONE 4: SAVED VIEWS
  // ==========================================
  async getAllSavedViews(userId?: string): Promise<SavedView[]> {
    try {
      const views = await idbGetAll<SavedView>('savedViews');
      const filtered = userId ? views.filter((v) => !v.userId || v.userId === userId) : views;
      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      const raw = localStorage.getItem('safevision_views_fallback');
      return raw ? JSON.parse(raw) : [];
    }
  },

  async saveSavedView(view: SavedView): Promise<void> {
    try {
      await idbPut('savedViews', view);
    } catch {
      const all = await this.getAllSavedViews();
      const updated = [view, ...all.filter((v) => v.id !== view.id)];
      localStorage.setItem('safevision_views_fallback', JSON.stringify(updated));
    }
  },

  async deleteSavedView(id: string): Promise<void> {
    try {
      await idbDelete('savedViews', id);
    } catch {
      const all = await this.getAllSavedViews();
      localStorage.setItem('safevision_views_fallback', JSON.stringify(all.filter((v) => v.id !== id)));
    }
  },

  // ==========================================
  // MILESTONE 4: ALERT RULES
  // ==========================================
  async getAllAlertRules(): Promise<AlertRule[]> {
    try {
      const rules = await idbGetAll<AlertRule>('alertRules');
      if (rules.length === 0) {
        // Return default seeded alert rules if none exist
        const defaultRules: AlertRule[] = [
          {
            id: 'rule_risk_high',
            name: 'Critical Zone Risk Level (Score ≥ 70)',
            condition: 'risk_gte',
            threshold: 70,
            enabled: true,
          },
          {
            id: 'rule_compliance_low',
            name: 'Low Compliance Warning (< 90% for 3 days)',
            condition: 'compliance_lt',
            threshold: 90,
            windowDays: 3,
            enabled: true,
          },
          {
            id: 'rule_repeat_violations',
            name: 'High Frequency Cluster (≥ 3 in 1 hour)',
            condition: 'repeat_gte',
            threshold: 3,
            windowHours: 1,
            enabled: true,
          },
        ];
        for (const r of defaultRules) {
          await idbPut('alertRules', r).catch(() => {});
        }
        return defaultRules;
      }
      return rules;
    } catch {
      const raw = localStorage.getItem('safevision_rules_fallback');
      if (raw) return JSON.parse(raw);
      return [
        {
          id: 'rule_risk_high',
          name: 'Critical Zone Risk Level (Score ≥ 70)',
          condition: 'risk_gte',
          threshold: 70,
          enabled: true,
        },
        {
          id: 'rule_compliance_low',
          name: 'Low Compliance Warning (< 90% for 3 days)',
          condition: 'compliance_lt',
          threshold: 90,
          windowDays: 3,
          enabled: true,
        },
        {
          id: 'rule_repeat_violations',
          name: 'High Frequency Cluster (≥ 3 in 1 hour)',
          condition: 'repeat_gte',
          threshold: 3,
          windowHours: 1,
          enabled: true,
        },
      ];
    }
  },

  async saveAlertRule(rule: AlertRule): Promise<void> {
    try {
      await idbPut('alertRules', rule);
    } catch {
      const all = await this.getAllAlertRules();
      const updated = [rule, ...all.filter((r) => r.id !== rule.id)];
      localStorage.setItem('safevision_rules_fallback', JSON.stringify(updated));
    }
  },

  async updateAlertRule(id: string, updates: Partial<AlertRule>): Promise<void> {
    const rules = await this.getAllAlertRules();
    const target = rules.find((r) => r.id === id);
    if (target) {
      const updated = { ...target, ...updates };
      await this.saveAlertRule(updated);
    }
  },

  async deleteAlertRule(id: string): Promise<void> {
    try {
      await idbDelete('alertRules', id);
    } catch {
      const all = await this.getAllAlertRules();
      localStorage.setItem('safevision_rules_fallback', JSON.stringify(all.filter((r) => r.id !== id)));
    }
  },

  // ==========================================
  // MILESTONE 4: DATA RETENTION CLEANUP
  // ==========================================
  async cleanupOldEvidence(retentionDays: number = 90): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffTime = cutoffDate.getTime();
    let deletedCount = 0;

    try {
      // 1. Scans older than cutoff - clean large evidence frames
      const scans = await this.getAllScans();
      for (const s of scans) {
        if (new Date(s.createdAt).getTime() < cutoffTime) {
          if (s.evidenceFrame || s.annotatedThumbnail) {
            s.evidenceFrame = undefined;
            s.annotatedThumbnail = undefined;
            await idbPut('scans', s);
            deletedCount++;
          }
        }
      }

      // 2. Violations older than cutoff - clean evidence images
      const violations = await this.getAllViolations();
      for (const v of violations) {
        if (new Date(v.createdAt).getTime() < cutoffTime) {
          if (v.evidenceImage) {
            v.evidenceImage = undefined;
            await idbPut('violations', v);
            deletedCount++;
          }
        }
      }
    } catch (err) {
      console.warn('Evidence cleanup warning:', err);
    }

    return { deletedCount };
  },

  async getCollectionCounts(): Promise<{
    scans: number;
    violations: number;
    incidents: number;
    corrective_actions: number;
    knowledge_docs: number;
    reports: number;
    notifications: number;
    alert_rules: number;
  }> {
    const [scans, violations, incidents, actions, docs, reports, notifications, rules] =
      await Promise.all([
        this.getAllScans(),
        this.getAllViolations(),
        this.getAllIncidents(),
        this.getAllCorrectiveActions(),
        this.getAllDocuments(),
        this.getAllReports(),
        this.getAllNotifications(),
        this.getAllAlertRules(),
      ]);
    return {
      scans: scans.length,
      violations: violations.length,
      incidents: incidents.length,
      corrective_actions: actions.length,
      knowledge_docs: docs.length,
      reports: reports.length,
      notifications: notifications.length,
      alert_rules: rules.length,
    };
  },
};


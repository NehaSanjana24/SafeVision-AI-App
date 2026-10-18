import { Scan, Violation, PPESettings, FalsePositiveFeedback } from '../types';
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
        await idbDelete('violations', v.id);
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
      console.warn('IDB put violation failed', err);
    }
  },

  async deleteViolation(id: string): Promise<void> {
    try {
      await idbDelete('violations', id);
    } catch (err) {
      console.error(err);
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

  // Seed sample data for empty states
  async seedSampleData(): Promise<{ scansCount: number; violationsCount: number }> {
    const now = new Date();
    const violationTypes = ['NO-Helmet', 'NO-Vest', 'Missing Gloves', 'NO-Goggles', 'NO-Mask'];
    const dummyNames = [
      'cctv_zone_b_gate4.jpg',
      'crane_deck_assembly.mp4',
      'scaffolding_tower_lvl2.jpg',
      'welding_bay_east.mp4',
      'loading_dock_feed.jpg',
      'chemical_handling_bay.jpg',
      'tunnel_excavation_section_3.mp4',
      'structural_steel_framing.jpg',
    ];

    const newScans: Scan[] = [];
    const newViolations: Violation[] = [];

    // Create 24 realistic scans over the last 14 days
    for (let i = 0; i < 24; i++) {
      const daysAgo = Math.floor(i / 2);
      const scanDate = new Date(now.getTime() - daysAgo * 24 * 3600 * 1000 - (i % 8) * 3600 * 1000);
      const id = `scan_${Date.now()}_${i}`;
      const isVideo = i % 3 === 0;
      const fileName = dummyNames[i % dummyNames.length];
      const persons = Math.floor(Math.random() * 4) + 1;
      
      // Some compliant scans, some with violations
      const hasViolation = i % 4 !== 0;
      const violationCount = hasViolation ? Math.floor(Math.random() * 2) + 1 : 0;
      const compliancePct = violationCount === 0 ? 100 : Math.max(30, Math.round(((persons - violationCount * 0.5) / persons) * 100));

      const detectedClasses = ['person'];
      if (Math.random() > 0.2) detectedClasses.push('helmet');
      if (Math.random() > 0.3) detectedClasses.push('vest');
      if (Math.random() > 0.5) detectedClasses.push('gloves');

      const scan: Scan = {
        id,
        userId: 'admin-001',
        userEmail: 'safety.lead@safevision.ai',
        sourceType: isVideo ? 'video' : 'image',
        fileName,
        totalPersons: persons,
        totalViolations: violationCount,
        compliancePct,
        detectedClasses,
        createdAt: scanDate.toISOString(),
      };

      newScans.push(scan);

      for (let v = 0; v < violationCount; v++) {
        const vType = violationTypes[(i + v) % violationTypes.length];
        const vId = `viol_${id}_${v}`;
        const conf = Math.round((0.72 + Math.random() * 0.25) * 100) / 100;
        
        const violation: Violation = {
          id: vId,
          scanId: id,
          sourceType: scan.sourceType,
          fileName,
          type: vType,
          confidence: conf,
          frameTime: isVideo ? Math.floor(Math.random() * 45) + 1 : undefined,
          bbox: [120 + v * 50, 80 + v * 40, 280 + v * 50, 320 + v * 40],
          resolved: i > 12,
          createdAt: scanDate.toISOString(),
        };

        newViolations.push(violation);
      }
    }

    for (const s of newScans) {
      await repository.saveScan(s);
    }
    for (const v of newViolations) {
      await repository.saveViolation(v);
    }

    return { scansCount: newScans.length, violationsCount: newViolations.length };
  },
};

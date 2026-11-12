import { z } from 'zod';
import { repository } from '../storage';
import { detectorService } from '../detector';
import { knowledgeService } from '../knowledge';
import { ToolTraceStep, Incident, WorkflowRun } from '../../types';
import { getAlertWebhookUrl } from '../../utils/env';

// ==========================================
// 1. VISUAL INSPECTOR TOOL
// ==========================================
export const visualInspectorInputSchema = z.object({
  imageBase64: z.string().optional().describe('Base64 data URL of the image to inspect'),
  violationId: z.string().optional().describe('Existing violation ID to load evidence for'),
  scanId: z.string().optional().describe('Existing scan ID to inspect'),
});

export type VisualInspectorInput = z.infer<typeof visualInspectorInputSchema>;

export const visualInspectorOutputSchema = z.object({
  sceneCaption: z.string(),
  totalPersons: z.number(),
  detectedClasses: z.array(z.string()),
  violations: z.array(
    z.object({
      type: z.string(),
      confidence: z.number(),
      severity: z.string().optional(),
      bbox: z.array(z.number()),
    })
  ),
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
  source: z.string(),
});

export type VisualInspectorOutput = z.infer<typeof visualInspectorOutputSchema>;

export async function visualInspectorTool(
  input: VisualInspectorInput,
  onTrace?: (trace: ToolTraceStep) => void
): Promise<VisualInspectorOutput> {
  const startTime = Date.now();
  let stepTrace: ToolTraceStep = {
    tool: 'visual_inspector',
    input: input.violationId ? `violation:${input.violationId}` : input.scanId ? `scan:${input.scanId}` : 'image:base64',
    durationMs: 0,
    resultSummary: 'Inspecting visual evidence...',
    timestamp: new Date().toISOString(),
  };

  try {
    const settings = repository.getSettings();

    // Case A: Existing violation ID specified
    if (input.violationId) {
      const allViolations = await repository.getAllViolations();
      const target = allViolations.find((v) => v.id === input.violationId);
      if (!target) {
        throw new Error(`Violation ${input.violationId} not found in database.`);
      }
      const scan = target.scanId ? await repository.getScanById(target.scanId) : undefined;
      
      const result: VisualInspectorOutput = {
        sceneCaption: `Visual evidence for ${target.type} detected on ${scan?.fileName || target.fileName || 'camera feed'}${target.zone ? ` in Zone ${target.zone}` : ''} (${target.cameraId || 'CCTV'}). Confidence: Math.round(${target.confidence * 100})%.`,
        totalPersons: scan?.totalPersons || 1,
        detectedClasses: scan?.detectedClasses || [target.type, 'person'],
        violations: [
          {
            type: target.type,
            confidence: target.confidence,
            severity: target.severity || 'high',
            bbox: target.bbox || [100, 100, 200, 300],
          },
        ],
        source: 'Stored Evidence Record',
      };

      stepTrace = {
        ...stepTrace,
        durationMs: Date.now() - startTime,
        resultSummary: `Found evidence for ${target.type} (${target.zone ? `Zone ${target.zone}` : 'Active zone'}) with ${(target.confidence * 100).toFixed(0)}% confidence`,
      };
      onTrace?.(stepTrace);
      return result;
    }

    // Case B: Existing scan ID specified
    if (input.scanId) {
      const scan = await repository.getScanById(input.scanId);
      if (!scan) throw new Error(`Scan ${input.scanId} not found.`);
      const allViolations = await repository.getAllViolations();
      const scanViolations = allViolations.filter((v) => v.scanId === input.scanId);

      const result: VisualInspectorOutput = {
        sceneCaption: `Workplace surveillance frame from ${scan.fileName} (${scan.zone ? `Zone ${scan.zone}` : 'Field'}). ${scan.totalPersons || 1} person(s) observed. ${scanViolations.length} violation(s) identified.`,
        totalPersons: scan.totalPersons || 1,
        detectedClasses: scan.detectedClasses || ['person'],
        violations: scanViolations.map((v) => ({
          type: v.type,
          confidence: v.confidence,
          severity: v.severity || 'medium',
          bbox: v.bbox || [50, 50, 150, 250],
        })),
        source: 'Scan Record',
      };

      stepTrace = {
        ...stepTrace,
        durationMs: Date.now() - startTime,
        resultSummary: `Inspected scan #${input.scanId.slice(-6)}: ${scanViolations.length} violation(s), ${scan.totalPersons} person(s)`,
      };
      onTrace?.(stepTrace);
      return result;
    }

    // Case C: New image provided as Base64 data URL
    if (input.imageBase64) {
      // Convert data URL to Blob
      const res = await fetch(input.imageBase64);
      const blob = await res.blob();

      // Run detector
      const detectionRes = await detectorService.detect(blob, settings.confidenceThreshold);
      const evalRes = detectorService.evaluateViolations(detectionRes.detections, settings, {
        scanId: `scan_inspect_${Date.now()}`,
        fileName: 'agent_upload.jpg',
        sourceType: 'image',
      });

      // Construct descriptive scene caption
      const detectedNames: string[] = Array.from(new Set(detectionRes.detections.map((d: any) => d.class_name as string)));
      let caption = `Workplace environment containing ${evalRes.totalPersons} individual(s). Detected PPE elements: ${detectedNames.filter((n: string) => !n.toLowerCase().startsWith('no-')).join(', ') || 'none'}.`;
      if (evalRes.violations.length > 0) {
        caption += ` Flagged ${evalRes.violations.length} critical safety non-compliance issue(s): ${evalRes.violations.map((v: any) => v.type).join(', ')}.`;
      } else {
        caption += ' Full compliance observed across monitored requirements.';
      }

      const output: VisualInspectorOutput = {
        sceneCaption: caption,
        totalPersons: evalRes.totalPersons,
        detectedClasses: detectedNames,
        violations: evalRes.violations.map((v: any) => ({
          type: v.type,
          confidence: v.confidence,
          severity: v.type.includes('Helmet') ? 'high' : 'medium',
          bbox: v.bbox || [0, 0, 100, 100],
        })),
        imageWidth: detectionRes.image_width,
        imageHeight: detectionRes.image_height,
        source: detectionRes.source || 'Vision AI Engine',
      };

      stepTrace = {
        ...stepTrace,
        durationMs: Date.now() - startTime,
        resultSummary: `Inspected image: ${output.violations.length} safety infraction(s), ${output.totalPersons} person(s)`,
      };
      onTrace?.(stepTrace);
      return output;
    }

    throw new Error('visual_inspector requires imageBase64, violationId, or scanId.');
  } catch (err: any) {
    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Failed: ${err.message}`,
    };
    onTrace?.(stepTrace);
    throw err;
  }
}

// ==========================================
// 2. VIOLATION SEARCH TOOL
// ==========================================
export const violationSearchInputSchema = z.object({
  zone: z.enum(['A', 'B', 'C', 'D']).optional().describe('Target facility zone'),
  camera: z.string().optional().describe('Camera identifier (e.g., Camera 01)'),
  violationType: z.string().optional().describe('PPE violation class e.g. NO-Helmet, NO-Vest'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  resolved: z.boolean().optional(),
  dateRange: z
    .object({
      from: z.string().optional().describe('ISO timestamp or YYYY-MM-DD'),
      to: z.string().optional().describe('ISO timestamp or YYYY-MM-DD'),
    })
    .optional(),
  timePreset: z
    .enum(['today', 'this_morning', 'yesterday', 'this_week', 'last_7_days', 'all'])
    .optional()
    .describe('Relative temporal query filter'),
  limit: z.number().default(20).describe('Max records to return (capped at 20)'),
});

export type ViolationSearchInput = z.infer<typeof violationSearchInputSchema>;

export interface ViolationSearchResultItem {
  id: string;
  scanId: string;
  fileName: string;
  zone: string;
  cameraId: string;
  type: string;
  severity: string;
  confidence: number;
  createdAt: string;
  resolved: boolean;
}

export const violationSearchOutputSchema = z.object({
  totalCount: z.number(),
  violations: z.array(
    z.object({
      id: z.string(),
      scanId: z.string(),
      fileName: z.string(),
      zone: z.string(),
      cameraId: z.string(),
      type: z.string(),
      severity: z.string(),
      confidence: z.number(),
      createdAt: z.string(),
      resolved: z.boolean(),
    })
  ),
  evidenceIds: z.array(z.string()),
  summary: z.string(),
});

export type ViolationSearchOutput = z.infer<typeof violationSearchOutputSchema>;

export async function violationSearchTool(
  input: ViolationSearchInput,
  onTrace?: (trace: ToolTraceStep) => void
): Promise<ViolationSearchOutput> {
  const startTime = Date.now();
  let stepTrace: ToolTraceStep = {
    tool: 'violation_search',
    input: JSON.stringify({
      zone: input.zone,
      time: input.timePreset || input.dateRange,
      type: input.violationType,
    }),
    durationMs: 0,
    resultSummary: 'Searching violation records...',
    timestamp: new Date().toISOString(),
  };

  try {
    const allViolations = await repository.getAllViolations();
    const allScans = await repository.getAllScans();
    const scanMap = new Map(allScans.map((s) => [s.id, s]));

    // Compute temporal bounds
    let fromMs = 0;
    let toMs = Date.now() + 86400000;
    const now = new Date();

    if (input.timePreset === 'this_morning') {
      const morningStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0);
      const morningEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
      fromMs = morningStart.getTime();
      toMs = morningEnd.getTime();
    } else if (input.timePreset === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      fromMs = todayStart.getTime();
    } else if (input.timePreset === 'yesterday') {
      const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
      fromMs = yStart.getTime();
      toMs = yEnd.getTime();
    } else if (input.timePreset === 'this_week' || input.timePreset === 'last_7_days') {
      fromMs = now.getTime() - 7 * 24 * 3600 * 1000;
    }

    if (input.dateRange?.from) {
      fromMs = new Date(input.dateRange.from).getTime();
    }
    if (input.dateRange?.to) {
      toMs = new Date(input.dateRange.to).getTime();
    }

    // Filter matching violations
    const matched = allViolations.filter((v) => {
      const parentScan = v.scanId ? scanMap.get(v.scanId) : undefined;
      const vZone = v.zone || parentScan?.zone;
      const vCamera = v.cameraId || parentScan?.cameraId;
      const vCreatedMs = new Date(v.createdAt).getTime();

      // Zone filter
      if (input.zone && vZone !== input.zone) return false;
      // Camera filter
      if (input.camera && !vCamera?.toLowerCase().includes(input.camera.toLowerCase())) return false;
      // Type filter
      if (input.violationType) {
        const norm = input.violationType.toLowerCase().replace(/[^a-z]/g, '');
        const currentNorm = v.type.toLowerCase().replace(/[^a-z]/g, '');
        if (!currentNorm.includes(norm) && !norm.includes(currentNorm)) return false;
      }
      // Severity filter
      if (input.severity && v.severity !== input.severity) return false;
      // Resolved filter
      if (input.resolved !== undefined && v.resolved !== input.resolved) return false;
      // Date filter
      if (fromMs > 0 && vCreatedMs < fromMs) return false;
      if (toMs < Date.now() + 86400000 && vCreatedMs > toMs) return false;

      return true;
    });

    const cappedLimit = Math.min(input.limit || 20, 20);
    const paginated = matched.slice(0, cappedLimit);

    const formattedList: ViolationSearchResultItem[] = paginated.map((v) => {
      const parentScan = v.scanId ? scanMap.get(v.scanId) : undefined;
      return {
        id: v.id,
        scanId: v.scanId,
        fileName: v.fileName || parentScan?.fileName || 'scan_feed.jpg',
        zone: v.zone || parentScan?.zone || 'A',
        cameraId: v.cameraId || parentScan?.cameraId || 'Camera 01',
        type: v.type,
        severity: v.severity || (v.type.includes('Helmet') ? 'high' : 'medium'),
        confidence: Math.round(v.confidence * 100) / 100,
        createdAt: v.createdAt,
        resolved: !!v.resolved,
      };
    });

    const summaryText =
      formattedList.length === 0
        ? `No violations matched the query criteria (${input.zone ? `Zone ${input.zone}` : 'all zones'}, ${input.timePreset || 'selected period'}).`
        : `Found ${matched.length} total violation records (displaying ${formattedList.length}). Predominant issues: ${Array.from(new Set(formattedList.map((f) => f.type))).join(', ')}.`;

    const output: ViolationSearchOutput = {
      totalCount: matched.length,
      violations: formattedList,
      evidenceIds: formattedList.map((f) => f.id),
      summary: summaryText,
    };

    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Found ${matched.length} violation(s) matching criteria`,
    };
    onTrace?.(stepTrace);
    return output;
  } catch (err: any) {
    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Search failed: ${err.message}`,
    };
    onTrace?.(stepTrace);
    throw err;
  }
}

// ==========================================
// 3. DOCUMENT RETRIEVER TOOL
// ==========================================
export const docRetrieverInputSchema = z.object({
  queries: z.array(z.string()).min(1).describe('1-3 focused retrieval queries'),
  filterDocId: z.string().optional(),
  topK: z.number().default(6).describe('Number of top chunks to retrieve (default 6)'),
});

export type DocRetrieverInput = z.infer<typeof docRetrieverInputSchema>;

export interface RetrievedChunkResult {
  docId: string;
  chunkId: string;
  fileName: string;
  heading?: string;
  page?: number;
  row?: number;
  section?: string;
  text: string;
  score: number;
}

export const docRetrieverOutputSchema = z.object({
  totalFound: z.number(),
  chunks: z.array(
    z.object({
      docId: z.string(),
      chunkId: z.string(),
      fileName: z.string(),
      heading: z.string().optional(),
      page: z.number().optional(),
      row: z.number().optional(),
      section: z.string().optional(),
      text: z.string(),
      score: z.number(),
    })
  ),
  citationLabels: z.array(z.string()),
});

export type DocRetrieverOutput = z.infer<typeof docRetrieverOutputSchema>;

export async function docRetrieverTool(
  input: DocRetrieverInput,
  onTrace?: (trace: ToolTraceStep) => void
): Promise<DocRetrieverOutput> {
  const startTime = Date.now();
  let stepTrace: ToolTraceStep = {
    tool: 'doc_retriever',
    input: input.queries.join(' | '),
    durationMs: 0,
    resultSummary: 'Retrieving safety manual chunks...',
    timestamp: new Date().toISOString(),
  };

  try {
    const chunkMap = new Map<string, { chunk: any; score: number }>();

    for (const q of input.queries) {
      const results = await knowledgeService.hybridSearch(q, input.filterDocId);
      for (const r of results) {
        const existing = chunkMap.get(r.chunk.id);
        if (!existing || r.score > existing.score) {
          chunkMap.set(r.chunk.id, { chunk: r.chunk, score: r.score });
        }
      }
    }

    const sortedChunks = Array.from(chunkMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, input.topK || 6);

    const formatted: RetrievedChunkResult[] = sortedChunks.map((item) => ({
      docId: item.chunk.docId,
      chunkId: item.chunk.id,
      fileName: item.chunk.fileName || 'Safety_Manual.pdf',
      heading: item.chunk.heading,
      page: item.chunk.pageNumber,
      row: item.chunk.metadata?.row,
      section: item.chunk.heading || (item.chunk.pageNumber ? `Page ${item.chunk.pageNumber}` : undefined),
      text: item.chunk.text,
      score: Math.round(item.score * 100) / 100,
    }));

    const citationLabels = formatted.map((c) => {
      const sec = c.section ? ` · ${c.section}` : '';
      return `${c.fileName}${sec}`;
    });

    const output: DocRetrieverOutput = {
      totalFound: formatted.length,
      chunks: formatted,
      citationLabels: Array.from(new Set(citationLabels)),
    };

    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Retrieved ${formatted.length} relevant manual chunk(s)`,
    };
    onTrace?.(stepTrace);
    return output;
  } catch (err: any) {
    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Retrieval failed: ${err.message}`,
    };
    onTrace?.(stepTrace);
    throw err;
  }
}

// ==========================================
// 4. INCIDENT LOGGER TOOL
// ==========================================
export const incidentLoggerInputSchema = z.object({
  title: z.string().describe('Short descriptive incident headline'),
  summary: z.string().describe('Detailed incident description and root-cause analysis'),
  zone: z.enum(['A', 'B', 'C', 'D']).optional().describe('Factory/Site zone'),
  cameraId: z.string().optional().describe('Camera source ID'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  violationIds: z.array(z.string()).optional(),
  scanIds: z.array(z.string()).optional(),
  policyCitations: z.array(z.string()).optional(),
  conversationId: z.string().optional(),
});

export type IncidentLoggerInput = z.infer<typeof incidentLoggerInputSchema>;

export const incidentLoggerOutputSchema = z.object({
  incident: z.any(),
  deduped: z.boolean(),
  message: z.string(),
});

export type IncidentLoggerOutput = z.infer<typeof incidentLoggerOutputSchema>;

export async function incidentLoggerTool(
  input: IncidentLoggerInput,
  onTrace?: (trace: ToolTraceStep) => void
): Promise<IncidentLoggerOutput> {
  const startTime = Date.now();
  let stepTrace: ToolTraceStep = {
    tool: 'incident_logger',
    input: `${input.title} [Zone ${input.zone || 'Site'}, ${input.severity}]`,
    durationMs: 0,
    resultSummary: 'Checking duplicate open incidents...',
    timestamp: new Date().toISOString(),
  };

  try {
    const existingIncidents = await repository.getAllIncidents();
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

    // Deduplication check: Same zone, same severity/title keyword within 30 minutes
    const duplicate = existingIncidents.find((inc) => {
      if (inc.status !== 'open') return false;
      if (input.zone && inc.zone !== input.zone) return false;
      const incTime = new Date(inc.createdAt).getTime();
      if (incTime < thirtyMinutesAgo) return false;
      // Match title or violation class overlap
      const titleOverlap = (inc.title || '').toLowerCase().includes(input.title.slice(0, 15).toLowerCase());
      return titleOverlap;
    });

    if (duplicate) {
      stepTrace = {
        ...stepTrace,
        durationMs: Date.now() - startTime,
        resultSummary: `Deduped against Incident #${duplicate.incidentNumber} (already open)`,
      };
      onTrace?.(stepTrace);
      return {
        incident: duplicate,
        deduped: true,
        message: `Deduped: Open Incident #${duplicate.incidentNumber} already exists for ${input.zone ? `Zone ${input.zone}` : 'this zone'} created in the last 30 minutes.`,
      };
    }

    // Allocate next incident number
    const incidentNumber = await repository.getNextIncidentNumber();
    const newIncident: Incident = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      incidentNumber,
      title: input.title,
      summary: input.summary,
      zone: input.zone,
      cameraId: input.cameraId || 'Camera 01',
      severity: input.severity,
      status: 'open',
      source: 'agent',
      violationIds: input.violationIds || [],
      scanIds: input.scanIds || [],
      policyCitations: input.policyCitations || [],
      assignedTo: repository.getSettings().supervisorEmail || 'safety.lead@safevision.ai',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repository.saveIncident(newIncident);

    // Save workflow run record for the Active Workflows panel
    const workflowRun: WorkflowRun = {
      id: `wf_inc_${Date.now()}`,
      conversationId: input.conversationId || 'default',
      toolName: 'incident_logger',
      title: `Incident #${newIncident.incidentNumber}: ${newIncident.title}`,
      status: 'auto_triggered',
      summary: `Logged high-severity incident in Zone ${newIncident.zone || 'A'} (${newIncident.severity} priority).`,
      incidentId: newIncident.id,
      incidentNumber: newIncident.incidentNumber,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repository.saveWorkflowRun(workflowRun);

    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Logged Incident #${newIncident.incidentNumber} (${newIncident.severity})`,
    };
    onTrace?.(stepTrace);

    return {
      incident: newIncident,
      deduped: false,
      message: `Incident #${newIncident.incidentNumber} created and logged to audit trail.`,
    };
  } catch (err: any) {
    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Incident logging failed: ${err.message}`,
    };
    onTrace?.(stepTrace);
    throw err;
  }
}

// ==========================================
// 5. SUPERVISOR ALERT TOOL
// ==========================================
export const supervisorAlertInputSchema = z.object({
  title: z.string().describe('Subject line for the supervisor alert notification'),
  zone: z.string().optional().describe('Target facility zone'),
  cameraId: z.string().optional().describe('Camera feed identifier'),
  severity: z.string().default('high'),
  details: z.string().describe('Detailed incident facts and immediate safety instructions'),
  incidentId: z.string().optional(),
  incidentNumber: z.number().optional(),
  recipientEmail: z.string().optional(),
  conversationId: z.string().optional(),
  isApproved: z.boolean().optional().describe('Whether supervisor gate approved this action'),
});

export type SupervisorAlertInput = z.infer<typeof supervisorAlertInputSchema>;

export const supervisorAlertOutputSchema = z.object({
  status: z.enum(['sent_webhook', 'simulated', 'pending_approval', 'failed']),
  message: z.string(),
  workflowId: z.string(),
  recipient: z.string(),
  emailPayload: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
});

export type SupervisorAlertOutput = z.infer<typeof supervisorAlertOutputSchema>;

export async function supervisorAlertTool(
  input: SupervisorAlertInput,
  onTrace?: (trace: ToolTraceStep) => void
): Promise<SupervisorAlertOutput> {
  const startTime = Date.now();
  const settings = repository.getSettings();
  const recipient = input.recipientEmail || settings.supervisorEmail || 'safety.lead@safevision.ai';
  const webhookUrl = settings.alertWebhookUrl || getAlertWebhookUrl() || '';

  const emailPayload = {
    to: recipient,
    subject: `[SafeVision Alert] ${input.severity.toUpperCase()} Priority: ${input.title}`,
    body: `Dear Safety Supervisor,\n\nAn automated safety notification has been flagged by SafeVision AI.\n\nZone: ${input.zone || 'All Zones'}\nCamera: ${input.cameraId || 'CCTV Feed'}\nSeverity: ${input.severity.toUpperCase()}\nIncident Number: ${input.incidentNumber ? `#${input.incidentNumber}` : 'Pending'}\n\nDetails:\n${input.details}\n\nPlease inspect the designated zone immediately.\n\n---\nSafeVision AI Agent Monitoring System`,
  };

  let stepTrace: ToolTraceStep = {
    tool: 'supervisor_alert',
    input: `Recipient: ${recipient} | Subject: ${emailPayload.subject.slice(0, 30)}...`,
    durationMs: 0,
    resultSummary: 'Checking approval gate...',
    timestamp: new Date().toISOString(),
  };

  try {
    // Check approval gate
    if (settings.requireAlertApproval && !input.isApproved) {
      const pendingWorkflowRun: WorkflowRun = {
        id: `wf_alert_${Date.now()}`,
        conversationId: input.conversationId || 'default',
        toolName: 'supervisor_alert',
        title: `Supervisor Alert: ${input.title}`,
        status: 'pending_approval',
        summary: `Dispatch to ${recipient} is waiting for supervisor authorization.`,
        incidentId: input.incidentId,
        incidentNumber: input.incidentNumber,
        details: emailPayload.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await repository.saveWorkflowRun(pendingWorkflowRun);

      stepTrace = {
        ...stepTrace,
        durationMs: Date.now() - startTime,
        resultSummary: 'Awaiting human supervisor authorization gate',
      };
      onTrace?.(stepTrace);

      return {
        status: 'pending_approval',
        message: 'Supervisor Alert paused: Approval required before dispatching.',
        workflowId: pendingWorkflowRun.id,
        recipient,
        emailPayload,
      };
    }

    // If webhook configured, attempt real HTTP POST
    if (webhookUrl && webhookUrl.trim().startsWith('http')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'safety_alert',
            timestamp: new Date().toISOString(),
            incidentNumber: input.incidentNumber,
            zone: input.zone,
            severity: input.severity,
            email: emailPayload,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Webhook returned status ${res.status}`);
        }

        const runRecord: WorkflowRun = {
          id: `wf_alert_${Date.now()}`,
          conversationId: input.conversationId || 'default',
          toolName: 'supervisor_alert',
          title: `Supervisor Alert: ${input.title}`,
          status: 'sent',
          summary: `Alert webhook dispatched successfully to ${recipient}.`,
          incidentId: input.incidentId,
          incidentNumber: input.incidentNumber,
          details: emailPayload.body,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await repository.saveWorkflowRun(runRecord);

        stepTrace = {
          ...stepTrace,
          durationMs: Date.now() - startTime,
          resultSummary: `Dispatched webhook alert to ${recipient}`,
        };
        onTrace?.(stepTrace);

        return {
          status: 'sent_webhook',
          message: `Alert webhook sent successfully to ${recipient}.`,
          workflowId: runRecord.id,
          recipient,
          emailPayload,
        };
      } catch (webhookErr: any) {
        console.warn('Alert webhook failed, falling back to simulated:', webhookErr);
      }
    }

    // Default: Simulated mode (zero-key environment or fallback)
    const simulatedRun: WorkflowRun = {
      id: `wf_alert_${Date.now()}`,
      conversationId: input.conversationId || 'default',
      toolName: 'supervisor_alert',
      title: `Supervisor Alert: ${input.title}`,
      status: 'simulated',
      summary: `Simulated transmission to ${recipient}. Email payload generated & ready to copy.`,
      incidentId: input.incidentId,
      incidentNumber: input.incidentNumber,
      details: emailPayload.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repository.saveWorkflowRun(simulatedRun);

    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Alert prepared in Simulated Mode for ${recipient}`,
    };
    onTrace?.(stepTrace);

    return {
      status: 'simulated',
      message: `Alert successfully generated in Simulated Mode for ${recipient}.`,
      workflowId: simulatedRun.id,
      recipient,
      emailPayload,
    };
  } catch (err: any) {
    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Alert error: ${err.message}`,
    };
    onTrace?.(stepTrace);
    throw err;
  }
}

// ==========================================
// 6. COMPLIANCE CALCULATOR TOOL
// ==========================================
export const complianceCalculatorInputSchema = z.object({
  zone: z.enum(['A', 'B', 'C', 'D']).optional().describe('Facility zone to calculate compliance for'),
  days: z.number().default(7).describe('Analysis window in days (default 7)'),
});

export type ComplianceCalculatorInput = z.infer<typeof complianceCalculatorInputSchema>;

export interface ComplianceCalculatorOutput {
  zone: string;
  windowDays: number;
  totalScans: number;
  totalViolations: number;
  overallCompliancePct: number;
  gearBreakdown: Record<string, { violations: number; complianceRate: number }>;
  trend: 'improving' | 'stable' | 'declining';
  trendDeltaPct: number;
}

export async function complianceCalculatorTool(
  input: ComplianceCalculatorInput,
  onTrace?: (trace: ToolTraceStep) => void
): Promise<ComplianceCalculatorOutput> {
  const startTime = Date.now();
  let stepTrace: ToolTraceStep = {
    tool: 'compliance_calculator',
    input: `Zone: ${input.zone || 'All'}, Days: ${input.days}`,
    durationMs: 0,
    resultSummary: 'Computing compliance metrics...',
    timestamp: new Date().toISOString(),
  };

  try {
    const allScans = await repository.getAllScans();
    const allViolations = await repository.getAllViolations();
    const windowMs = (input.days || 7) * 24 * 3600 * 1000;
    const cutoffMs = Date.now() - windowMs;
    const priorCutoffMs = cutoffMs - windowMs;

    // Current period scans
    const currentScans = allScans.filter((s) => {
      const t = new Date(s.createdAt).getTime();
      if (t < cutoffMs) return false;
      if (input.zone && s.zone !== input.zone) return false;
      return true;
    });

    // Prior period scans (for trend calculation)
    const priorScans = allScans.filter((s) => {
      const t = new Date(s.createdAt).getTime();
      if (t < priorCutoffMs || t >= cutoffMs) return false;
      if (input.zone && s.zone !== input.zone) return false;
      return true;
    });

    // Violations in current period
    const currentViolations = allViolations.filter((v) => {
      const t = new Date(v.createdAt).getTime();
      if (t < cutoffMs) return false;
      if (input.zone && v.zone !== input.zone) return false;
      return !v.isFalsePositive;
    });

    const totalScans = currentScans.length;
    const totalViolations = currentViolations.length;

    const overallCompliancePct =
      totalScans > 0
        ? Math.round(
            currentScans.reduce((acc, s) => acc + (s.compliancePct || 100), 0) / totalScans
          )
        : 92;

    const priorCompliancePct =
      priorScans.length > 0
        ? Math.round(
            priorScans.reduce((acc, s) => acc + (s.compliancePct || 100), 0) / priorScans.length
          )
        : overallCompliancePct;

    const trendDeltaPct = overallCompliancePct - priorCompliancePct;
    const trend =
      trendDeltaPct > 2 ? 'improving' : trendDeltaPct < -2 ? 'declining' : 'stable';

    // Breakdown by gear
    const gearBreakdown: Record<string, { violations: number; complianceRate: number }> = {
      helmet: { violations: 0, complianceRate: 95 },
      vest: { violations: 0, complianceRate: 98 },
      gloves: { violations: 0, complianceRate: 92 },
      goggles: { violations: 0, complianceRate: 96 },
    };

    for (const v of currentViolations) {
      const t = v.type.toLowerCase();
      if (t.includes('helmet')) gearBreakdown.helmet.violations += 1;
      else if (t.includes('vest')) gearBreakdown.vest.violations += 1;
      else if (t.includes('glove')) gearBreakdown.gloves.violations += 1;
      else if (t.includes('goggle')) gearBreakdown.goggles.violations += 1;
    }

    // Estimate gear rates
    Object.keys(gearBreakdown).forEach((k) => {
      const count = gearBreakdown[k].violations;
      const rate = totalScans > 0 ? Math.max(40, 100 - Math.round((count / (totalScans * 1.5)) * 100)) : 95;
      gearBreakdown[k].complianceRate = rate;
    });

    const output: ComplianceCalculatorOutput = {
      zone: input.zone || 'Facility-wide',
      windowDays: input.days,
      totalScans,
      totalViolations,
      overallCompliancePct,
      gearBreakdown,
      trend,
      trendDeltaPct,
    };

    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `${output.overallCompliancePct}% compliance (${totalScans} scans, ${totalViolations} violations)`,
    };
    onTrace?.(stepTrace);
    return output;
  } catch (err: any) {
    stepTrace = {
      ...stepTrace,
      durationMs: Date.now() - startTime,
      resultSummary: `Calculation error: ${err.message}`,
    };
    onTrace?.(stepTrace);
    throw err;
  }
}

export type UserRole = 'admin' | 'supervisor';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash?: string;
  createdAt: string;
}

export interface DetectionBox {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
}

export interface DetectionResult {
  detections: DetectionBox[];
  image_width: number;
  image_height: number;
  source?: string;
  warning?: string;
}

export type SourceType = 'image' | 'video' | 'stream';

export interface Scan {
  id: string;
  userId: string;
  userEmail?: string;
  sourceType: SourceType;
  fileName: string;
  totalPersons: number;
  totalViolations: number;
  compliancePct: number;
  detectedClasses: string[];
  annotatedThumbnail?: string; // base64 or blob URL
  evidenceFrame?: string;
  zone?: 'A' | 'B' | 'C' | 'D';
  cameraId?: string;
  location?: string;
  createdAt: string;
}

export interface Violation {
  id: string;
  scanId: string;
  sourceType: SourceType;
  fileName: string;
  type: string; // e.g., 'NO-Helmet', 'NO-Vest', 'Missing Helmet', 'Missing Gloves'
  confidence: number;
  frameTime?: number; // for video in seconds
  bbox: [number, number, number, number];
  evidenceImage?: string; // annotated thumbnail/frame
  zone?: 'A' | 'B' | 'C' | 'D';
  cameraId?: string;
  location?: string;
  severity?: 'low' | 'moderate' | 'medium' | 'high' | 'critical';
  resolved?: boolean;
  notes?: string;
  isFalsePositive?: boolean;
  falsePositiveReason?: string;
  falsePositiveNotes?: string;
  flaggedBy?: string;
  flaggedAt?: string;
  createdAt: string;
}

export interface FalsePositiveFeedback {
  id: string;
  violationId?: string;
  scanId?: string;
  className: string;
  confidence: number;
  reason: string;
  notes?: string;
  flaggedBy: string;
  flaggedByName?: string;
  sourceType?: SourceType;
  fileName?: string;
  createdAt: string;
}

export interface PPESettings {
  confidenceThreshold: number; // e.g. 0.40
  requiredItems: {
    helmet: boolean;
    vest: boolean;
    mask: boolean;
    gloves: boolean;
    goggles: boolean;
  };
  frameSampleRate: number; // seconds per frame for video, default 1
  alertSound: boolean;
  autoSaveScans: boolean;
  disableKnowledgeAI?: boolean; // When true, uses keyword-only search & disables AI cloud transmission
  agentName?: string; // Default: 'SafeVision Agent'
  requireAlertApproval?: boolean; // Default: true (approval gate)
  mockAgentMode?: boolean; // Default: false (or true when no keys)
  alertWebhookUrl?: string; // Webhook URL for supervisor alerts
  supervisorEmail?: string; // Target email for supervisor notifications
  evidenceRetentionDays?: number; // Days to keep evidence images, default 90
  riskWeights?: {
    severityWeight: number; // default 0.40
    repeatWeight: number; // default 0.25
    openIncidentWeight: number; // default 0.20
    trendWeight: number; // default 0.15
  };
}

export interface EngineInfo {
  hasInferenceApi: boolean;
  inferenceUrl: string | null;
  hasGeminiKey: boolean;
  activeEngine: 'YOLOv8 API' | 'Gemini vision';
}

// Knowledge Base (Document Intelligence) Types
export type DocumentStatus = 'queued' | 'parsing' | 'chunking' | 'embedding' | 'extracting' | 'complete' | 'failed';
export type DocumentFileType = 'pdf' | 'docx' | 'csv' | 'xlsx' | 'txt' | 'md' | 'image';

export interface KnowledgeDocument {
  id: string;
  userId: string;
  fileName: string;
  fileType: DocumentFileType;
  sizeBytes: number;
  hash: string;
  status: DocumentStatus;
  progressPct: number;
  error?: string;
  pageCount?: number;
  ocrUsed?: boolean;
  createdAt: string;
  contentRaw?: string; // For rapid preview/rendering
}

export interface DocumentChunk {
  id: string;
  docId: string;
  text: string;
  page?: number;
  row?: number;
  sheet?: string;
  sectionTitle?: string;
  heading?: string;
  pageNumber?: number;
  fileName?: string;
  metadata?: any;
  embedding?: number[];
}

export type ExtractedFieldCategory =
  | 'ppe_requirements'
  | 'inspection_frequency'
  | 'penalties'
  | 'emergency_procedures'
  | 'roles_contacts'
  | 'effective_dates'
  | 'standards';

export type ReviewStatus = 'unreviewed' | 'confirmed' | 'rejected';

export interface ExtractedField {
  id: string;
  docId: string;
  category: ExtractedFieldCategory;
  label: string;
  value: string;
  sourceChunkId?: string;
  page?: number;
  row?: number;
  confidence: number;
  reviewStatus: ReviewStatus;
  createdAt: string;
}

export interface SearchHistoryItem {
  id: string;
  userId: string;
  query: string;
  createdAt: string;
}

export interface SearchResultItem {
  chunk: DocumentChunk;
  doc: KnowledgeDocument;
  score: number;
  snippet: string;
  matchTerms: string[];
}

export interface CitationItem {
  number: number;
  docId: string;
  fileName: string;
  location: string;
  page?: number;
  row?: number;
  sheet?: string;
  text: string;
}

// ==========================================
// Milestone 3: Multimodal RAG & Agentic Types
// ==========================================

export interface ToolTraceStep {
  name?: string;
  tool?: string;
  input?: string;
  inputSummary?: string;
  durationMs: number;
  resultSummary: string;
  status?: 'success' | 'warning' | 'error';
  timestamp: string;
}

export interface AgentCitation {
  type: 'document' | 'violation' | 'scan';
  label: string;
  docId?: string;
  chunkId?: string;
  fileName?: string;
  page?: number;
  row?: number;
  section?: string;
  violationId?: string;
  scanId?: string;
  cameraId?: string;
  timestamp?: string;
  excerpt?: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAttachment {
  type: 'image';
  url?: string;
  base64?: string;
  name?: string;
  fileName?: string;
  visualEvidence?: {
    caption?: string;
    detections?: DetectionBox[];
    violations?: Violation[];
  };
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachment?: MessageAttachment;
  attachments?: MessageAttachment[];
  toolTrace?: ToolTraceStep[];
  citations?: AgentCitation[];
  workflowRuns?: WorkflowRun[];
  pendingApproval?: {
    actionId: string;
    type: 'supervisor_alert';
    payload: any;
  };
  createdAt: string;
}

export interface Incident {
  id: string;
  number?: number;
  incidentNumber?: number;
  title?: string;
  violationIds: string[];
  scanIds?: string[];
  scanId?: string;
  zone?: 'A' | 'B' | 'C' | 'D';
  cameraId?: string;
  class?: string;
  severity: 'low' | 'moderate' | 'medium' | 'high' | 'critical';
  summary: string;
  policyCitations?: string[];
  citations?: string[];
  status: 'open' | 'investigating' | 'closed' | 'resolved';
  createdBy?: 'agent' | string;
  source?: 'agent' | string;
  assignedTo?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface WorkflowRun {
  id: string;
  conversationId: string;
  messageId?: string;
  name?: string;
  toolName?: string;
  title?: string;
  trigger?: 'auto' | 'manual';
  status: 'completed' | 'pending_approval' | 'rejected' | 'failed' | 'simulated' | 'sent' | 'auto_triggered';
  incidentId?: string;
  incidentNumber?: number;
  summary?: string;
  details?: string;
  payload?: any;
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface GoldenQuestion {
  id: string;
  question: string;
  expectedDoc?: string;
  expectedSection?: string;
  expectedKeywords: string[];
  category?: string;
}

export interface QuestionEvalResult {
  questionId: string;
  question: string;
  hitAt3: boolean;
  reciprocalRank?: number;
  firstRelevantRank?: number | null;
  retrievedDocs?: string[];
  groundednessScore: number;
  citationPrecision: number;
  passed?: boolean;
  pass?: boolean;
  citation?: string;
  notes?: string;
  expectedKeywords?: string[];
  retrievedChunksCount?: number;
  topChunkSnippet?: string;
}

export interface RAGEvaluationRun {
  id: string;
  runDate?: string;
  createdAt: string;
  totalQuestions: number;
  hitAt3Pct?: number;
  mrr?: number;
  avgGroundedness?: number;
  avgCitationPrecision?: number;
  summary: {
    hitAt3Rate: number;
    meanReciprocalRank: number;
    averageGroundedness: number;
    averageCitationPrecision: number;
    passedCount: number;
    failedCount: number;
  };
  results: QuestionEvalResult[];
}

// ==========================================
// Milestone 4: Workplace Intelligence, Reports & Production Types
// ==========================================

export type CorrectiveActionStatus = 'planned' | 'in_progress' | 'done' | 'overdue';

export interface CorrectiveAction {
  id: string;
  incidentId?: string;
  zone: 'A' | 'B' | 'C' | 'D';
  title: string;
  ownerRole: string; // e.g., 'Safety Supervisor', 'Site Engineer', 'Maintenance Lead'
  dueDate: string; // ISO string (YYYY-MM-DD)
  status: CorrectiveActionStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ReportType =
  | 'daily_safety_summary'
  | 'weekly_safety_report'
  | 'monthly_compliance_audit'
  | 'incident_investigation'
  | 'zone_report'
  | 'executive_summary';

export interface ReportParameters {
  dateRange: 'today' | '7d' | '30d' | '90d' | 'custom';
  startDate?: string;
  endDate?: string;
  zones: ('A' | 'B' | 'C' | 'D')[];
  cameras: string[];
  incidentId?: string;
  includeEvidenceThumbnails: boolean;
  maxThumbnails: number;
  includeAINarrative: boolean;
  includePolicyReferences: boolean;
  language: 'en' | 'es';
}

export interface ReportRecord {
  id: string;
  type: ReportType;
  title: string;
  parameters: ReportParameters;
  summary: string;
  createdBy: string;
  createdAt: string;
  pdfBlobId?: string;
  status: 'generated' | 'draft' | 'archived';
  aiReviewedBy?: string;
  reportData?: any; // Structured metrics snapshot
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface ReportSchedule {
  id: string;
  type: ReportType;
  parameters: ReportParameters;
  frequency: ScheduleFrequency;
  lastRunAt?: string;
  nextDueAt: string;
  createdBy: string;
  emailSummary?: boolean;
}

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  id: string;
  userId: string;
  ruleId?: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface IntelligenceFilters {
  dateRange: 'today' | '7d' | '30d' | '90d' | 'custom';
  startDate?: string;
  endDate?: string;
  zone: 'all' | 'A' | 'B' | 'C' | 'D';
  camera: string;
  source: 'all' | 'image' | 'video' | 'stream' | 'agent';
  violationClass: string;
  severity: 'all' | 'low' | 'moderate' | 'medium' | 'high' | 'critical';
  incidentStatus: 'all' | 'open' | 'investigating' | 'closed' | 'resolved';
  comparePrevious: boolean;
}

export interface SavedView {
  id: string;
  userId: string;
  name: string;
  filters: IntelligenceFilters;
  createdAt: string;
}

export type AlertRuleCondition = 'risk_gte' | 'compliance_lt' | 'repeat_gte';

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertRuleCondition;
  threshold: number;
  windowHours?: number;
  windowDays?: number;
  enabled: boolean;
  lastFiredAt?: string;
}

export interface RiskWeights {
  severityWeight: number;
  repeatWeight: number;
  openIncidentWeight: number;
  trendWeight: number;
}

export interface ZoneRiskScore {
  zone: 'A' | 'B' | 'C' | 'D';
  score: number; // 0 - 100
  band: 'Low' | 'Medium' | 'High' | 'Critical';
  components: {
    severityRate: number; // 0 - 1
    repeatRate: number; // 0 - 1
    openIncidentLoad: number; // 0 - 1
    trendWorsening: number; // 0 - 1
  };
  weights: RiskWeights;
  rawStats: {
    totalViolations: number;
    severityWeightedSum: number;
    repeatViolationsCount: number;
    openIncidentsCount: number;
    priorPeriodViolations: number;
    currentPeriodViolations: number;
    trendDeltaPct: number;
  };
}

export interface CameraHealth {
  cameraId: string;
  zone: 'A' | 'B' | 'C' | 'D';
  location: string;
  lastDetectionTime: string | null;
  detectionsPerDay: number;
  falsePositiveRatePct: number;
  isSilent: boolean; // no data within 24h
  totalScans: number;
  totalViolations: number;
}



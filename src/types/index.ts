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
}

export interface EngineInfo {
  hasInferenceApi: boolean;
  inferenceUrl: string | null;
  hasGeminiKey: boolean;
  activeEngine: 'YOLOv8 API' | 'Gemini vision';
}

import { Violation } from '../types';

export type ViolationStatusFilter =
  | 'all'
  | 'active'
  | 'unresolved'
  | 'resolved'
  | 'false_positive';

export type ViolationDateRange = 'all' | 'today' | '7d' | '30d' | '90d' | 'custom';

export type ViolationSortOption =
  | 'newest'
  | 'oldest'
  | 'confidence_desc'
  | 'confidence_asc'
  | 'type_asc'
  | 'severity_desc';

export type ViolationSeverityFilter =
  | 'all'
  | 'critical'
  | 'high'
  | 'medium'
  | 'moderate'
  | 'low';

export interface ViolationFilterCriteria {
  query: string;
  violationType: string;
  zone: string;
  cameraId: string;
  sourceType: string;
  status: ViolationStatusFilter;
  severity: ViolationSeverityFilter;
  minConfidence: number;
  dateRange: ViolationDateRange;
  startDate: string;
  endDate: string;
  sortBy: ViolationSortOption;
}

export const DEFAULT_VIOLATION_FILTERS: ViolationFilterCriteria = {
  query: '',
  violationType: 'all',
  zone: 'all',
  cameraId: 'all',
  sourceType: 'all',
  status: 'all',
  severity: 'all',
  minConfidence: 0,
  dateRange: 'all',
  startDate: '',
  endDate: '',
  sortBy: 'newest',
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  moderate: 2,
  low: 1,
};

export function resolveViolationSeverity(v: Violation): 'critical' | 'high' | 'medium' | 'low' {
  if (v.severity === 'critical') return 'critical';
  if (v.severity === 'high') return 'high';
  if (v.severity === 'medium' || v.severity === 'moderate') return 'medium';
  if (v.severity === 'low') return 'low';

  const t = (v.type || '').toLowerCase();
  if (t.includes('helmet') || t.includes('mask') || t.includes('respirator')) return 'high';
  if (t.includes('vest') || t.includes('goggle')) return 'medium';
  return 'low';
}

export function matchesViolationQuery(v: Violation, rawQuery: string): boolean {
  const trimmed = rawQuery.trim().toLowerCase();
  if (!trimmed) return true;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const severity = resolveViolationSeverity(v);
  const statusWords = v.isFalsePositive
    ? 'false positive fp calibrated'
    : v.resolved
    ? 'resolved closed remediated active'
    : 'unresolved open active hazard';

  const zoneText = v.zone ? `zone ${v.zone} ${v.zone}` : '';
  const dateObj = new Date(v.createdAt);
  const dateText = Number.isNaN(dateObj.getTime())
    ? ''
    : `${dateObj.toISOString().slice(0, 10)} ${dateObj.toLocaleDateString()}`;

  const searchable = [
    v.id,
    v.scanId,
    v.type,
    v.fileName,
    v.sourceType,
    zoneText,
    v.cameraId || '',
    v.location || '',
    severity,
    statusWords,
    v.notes || '',
    v.falsePositiveReason || '',
    v.falsePositiveNotes || '',
    v.flaggedBy || '',
    dateText,
    `${Math.round(v.confidence * 100)}%`,
  ]
    .join(' ')
    .toLowerCase();

  return tokens.every((token) => searchable.includes(token));
}

export function filterAndSortViolations(
  violations: Violation[],
  criteria: ViolationFilterCriteria,
  now: Date = new Date()
): Violation[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const filtered = violations.filter((v) => {
    // 1. Multi-token text search
    if (!matchesViolationQuery(v, criteria.query)) {
      return false;
    }

    // 2. PPE violation type filter
    if (criteria.violationType !== 'all') {
      const target = criteria.violationType.toLowerCase();
      if (!v.type.toLowerCase().includes(target)) {
        return false;
      }
    }

    // 3. Zone filter
    if (criteria.zone !== 'all') {
      if ((v.zone || '').toUpperCase() !== criteria.zone.toUpperCase()) {
        return false;
      }
    }

    // 4. Camera filter
    if (criteria.cameraId !== 'all') {
      if ((v.cameraId || '').toUpperCase() !== criteria.cameraId.toUpperCase()) {
        return false;
      }
    }

    // 5. Source type filter
    if (criteria.sourceType !== 'all') {
      if (v.sourceType !== criteria.sourceType) {
        return false;
      }
    }

    // 6. Status filter
    if (criteria.status === 'active' && v.isFalsePositive) return false;
    if (criteria.status === 'unresolved' && (v.isFalsePositive || v.resolved)) return false;
    if (criteria.status === 'resolved' && (v.isFalsePositive || !v.resolved)) return false;
    if (criteria.status === 'false_positive' && !v.isFalsePositive) return false;

    // 7. Severity filter
    if (criteria.severity !== 'all') {
      const resolved = resolveViolationSeverity(v);
      const wanted = criteria.severity === 'moderate' ? 'medium' : criteria.severity;
      if (resolved !== wanted) {
        return false;
      }
    }

    // 8. Minimum confidence filter
    if (criteria.minConfidence > 0 && v.confidence < criteria.minConfidence) {
      return false;
    }

    // 9. Date range filter
    if (criteria.dateRange !== 'all') {
      const createdMs = new Date(v.createdAt).getTime();
      if (Number.isNaN(createdMs)) return false;

      if (criteria.dateRange === 'today') {
        if (createdMs < startOfToday.getTime()) return false;
      } else if (criteria.dateRange === '7d' || criteria.dateRange === '30d' || criteria.dateRange === '90d') {
        const days = criteria.dateRange === '7d' ? 7 : criteria.dateRange === '30d' ? 30 : 90;
        const cutoff = now.getTime() - days * 24 * 3600 * 1000;
        if (createdMs < cutoff) return false;
      } else if (criteria.dateRange === 'custom') {
        if (criteria.startDate) {
          const startMs = new Date(`${criteria.startDate}T00:00:00`).getTime();
          if (!Number.isNaN(startMs) && createdMs < startMs) return false;
        }
        if (criteria.endDate) {
          const endMs = new Date(`${criteria.endDate}T23:59:59.999`).getTime();
          if (!Number.isNaN(endMs) && createdMs > endMs) return false;
        }
      }
    }

    return true;
  });

  // Sort
  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (criteria.sortBy) {
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'confidence_desc':
        return b.confidence - a.confidence || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'confidence_asc':
        return a.confidence - b.confidence || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'type_asc':
        return a.type.localeCompare(b.type) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'severity_desc': {
        const diff =
          (SEVERITY_RANK[resolveViolationSeverity(b)] || 0) -
          (SEVERITY_RANK[resolveViolationSeverity(a)] || 0);
        return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      case 'newest':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  return sorted;
}

export function getAvailableViolationOptions(violations: Violation[]): {
  zones: string[];
  cameras: string[];
  sources: string[];
  extraTypes: string[];
} {
  const standardTypeKeywords = ['helmet', 'vest', 'glove', 'goggle', 'mask'];
  const zoneSet = new Set<string>(['A', 'B', 'C', 'D']);
  const cameraSet = new Set<string>();
  const sourceSet = new Set<string>(['image', 'video', 'stream']);
  const extraTypeSet = new Set<string>();

  for (const v of violations) {
    if (v.zone) zoneSet.add(v.zone.toUpperCase());
    if (v.cameraId) cameraSet.add(v.cameraId.toUpperCase());
    if (v.sourceType) sourceSet.add(v.sourceType);
    if (v.type) {
      const lower = v.type.toLowerCase();
      if (!standardTypeKeywords.some((kw) => lower.includes(kw))) {
        extraTypeSet.add(v.type);
      }
    }
  }

  return {
    zones: Array.from(zoneSet).sort(),
    cameras: Array.from(cameraSet).sort(),
    sources: Array.from(sourceSet),
    extraTypes: Array.from(extraTypeSet).sort(),
  };
}

export function countActiveViolationFilters(criteria: ViolationFilterCriteria): number {
  let count = 0;
  if (criteria.query.trim()) count++;
  if (criteria.violationType !== 'all') count++;
  if (criteria.zone !== 'all') count++;
  if (criteria.cameraId !== 'all') count++;
  if (criteria.sourceType !== 'all') count++;
  if (criteria.status !== 'all') count++;
  if (criteria.severity !== 'all') count++;
  if (criteria.minConfidence > 0) count++;
  if (criteria.dateRange !== 'all') count++;
  return count;
}

export function parseViolationFiltersFromSearchParams(params: URLSearchParams): ViolationFilterCriteria {
  const statusRaw = params.get('status') || 'all';
  const validStatuses: ViolationStatusFilter[] = ['all', 'active', 'unresolved', 'resolved', 'false_positive'];
  const status = validStatuses.includes(statusRaw as ViolationStatusFilter)
    ? (statusRaw as ViolationStatusFilter)
    : 'all';

  const rangeRaw = params.get('range') || 'all';
  const validRanges: ViolationDateRange[] = ['all', 'today', '7d', '30d', '90d', 'custom'];
  const dateRange = validRanges.includes(rangeRaw as ViolationDateRange)
    ? (rangeRaw as ViolationDateRange)
    : 'all';

  const sevRaw = params.get('severity') || 'all';
  const validSeverities: ViolationSeverityFilter[] = ['all', 'critical', 'high', 'medium', 'moderate', 'low'];
  const severity = validSeverities.includes(sevRaw as ViolationSeverityFilter)
    ? (sevRaw as ViolationSeverityFilter)
    : 'all';

  const sortRaw = params.get('sort') || 'newest';
  const validSorts: ViolationSortOption[] = [
    'newest',
    'oldest',
    'confidence_desc',
    'confidence_asc',
    'type_asc',
    'severity_desc',
  ];
  const sortBy = validSorts.includes(sortRaw as ViolationSortOption)
    ? (sortRaw as ViolationSortOption)
    : 'newest';

  const confRaw = Number(params.get('conf') || '0');
  const minConfidence = !Number.isNaN(confRaw) && confRaw >= 0 && confRaw <= 1 ? confRaw : 0;

  return {
    query: params.get('q') || '',
    violationType: params.get('type') || 'all',
    zone: params.get('zone') || 'all',
    cameraId: params.get('camera') || 'all',
    sourceType: params.get('source') || 'all',
    status,
    severity,
    minConfidence,
    dateRange,
    startDate: params.get('from') || '',
    endDate: params.get('to') || '',
    sortBy,
  };
}

export function serializeViolationFiltersToSearchParams(
  criteria: ViolationFilterCriteria,
  tab: 'violations' | 'incidents'
): URLSearchParams {
  const next = new URLSearchParams();
  next.set('tab', tab);
  if (criteria.query.trim()) next.set('q', criteria.query.trim());
  if (criteria.violationType !== 'all') next.set('type', criteria.violationType);
  if (criteria.zone !== 'all') next.set('zone', criteria.zone);
  if (criteria.cameraId !== 'all') next.set('camera', criteria.cameraId);
  if (criteria.sourceType !== 'all') next.set('source', criteria.sourceType);
  if (criteria.status !== 'all') next.set('status', criteria.status);
  if (criteria.severity !== 'all') next.set('severity', criteria.severity);
  if (criteria.minConfidence > 0) next.set('conf', String(criteria.minConfidence));
  if (criteria.dateRange !== 'all') next.set('range', criteria.dateRange);
  if (criteria.dateRange === 'custom') {
    if (criteria.startDate) next.set('from', criteria.startDate);
    if (criteria.endDate) next.set('to', criteria.endDate);
  }
  if (criteria.sortBy !== 'newest') next.set('sort', criteria.sortBy);
  return next;
}

function escapeCsvCell(val: string | number | boolean | undefined): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildViolationsCSV(violations: Violation[]): string {
  const headers = [
    'Violation ID',
    'PPE Hazard',
    'Severity',
    'Confidence %',
    'Status',
    'Zone',
    'Camera ID',
    'Source Type',
    'File Name',
    'Created At',
    'False Positive Reason',
  ];

  const rows = violations.map((v) => {
    const statusLabel = v.isFalsePositive
      ? 'False Positive'
      : v.resolved
      ? 'Resolved'
      : 'Active Unresolved';
    return [
      escapeCsvCell(v.id),
      escapeCsvCell(v.type),
      escapeCsvCell(resolveViolationSeverity(v)),
      escapeCsvCell(Math.round(v.confidence * 100)),
      escapeCsvCell(statusLabel),
      escapeCsvCell(v.zone ? `Zone ${v.zone}` : ''),
      escapeCsvCell(v.cameraId || ''),
      escapeCsvCell(v.sourceType),
      escapeCsvCell(v.fileName),
      escapeCsvCell(v.createdAt),
      escapeCsvCell(v.falsePositiveReason || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

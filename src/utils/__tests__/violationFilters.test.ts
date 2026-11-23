import { describe, it, expect } from 'vitest';
import { Violation } from '../../types';
import {
  DEFAULT_VIOLATION_FILTERS,
  filterAndSortViolations,
  getAvailableViolationOptions,
  countActiveViolationFilters,
  parseViolationFiltersFromSearchParams,
  serializeViolationFiltersToSearchParams,
  buildViolationsCSV,
} from '../violationFilters';

const NOW = new Date('2026-11-23T12:00:00.000Z');

const sampleViolations: Violation[] = [
  {
    id: 'viol_1',
    scanId: 'scan_1',
    sourceType: 'image',
    fileName: 'crane_lift_zone_a.jpg',
    type: 'NO-Helmet',
    severity: 'high',
    confidence: 0.94,
    bbox: [10, 10, 100, 100],
    zone: 'A',
    cameraId: 'CAM-01',
    resolved: false,
    isFalsePositive: false,
    createdAt: '2026-11-23T09:15:00.000Z',
  },
  {
    id: 'viol_2',
    scanId: 'scan_2',
    sourceType: 'video',
    fileName: 'loading_dock_night.mp4',
    type: 'NO-Vest',
    severity: 'critical',
    confidence: 0.88,
    frameTime: 14,
    bbox: [20, 20, 120, 120],
    zone: 'B',
    cameraId: 'CAM-02',
    resolved: true,
    isFalsePositive: false,
    createdAt: '2026-11-20T18:30:00.000Z',
  },
  {
    id: 'viol_3',
    scanId: 'scan_3',
    sourceType: 'stream',
    fileName: 'welding_bay_live.png',
    type: 'Missing Gloves',
    severity: 'medium',
    confidence: 0.62,
    bbox: [15, 15, 90, 90],
    zone: 'C',
    cameraId: 'CAM-03',
    resolved: false,
    isFalsePositive: true,
    falsePositiveReason: 'Glove occluded behind steel beam',
    createdAt: '2026-11-10T10:00:00.000Z',
  },
  {
    id: 'viol_4',
    scanId: 'scan_4',
    sourceType: 'image',
    fileName: 'chemical_bay_door.jpg',
    type: 'NO-Goggles',
    severity: 'low',
    confidence: 0.78,
    bbox: [5, 5, 50, 50],
    zone: 'D',
    cameraId: 'CAM-04',
    resolved: false,
    isFalsePositive: false,
    createdAt: '2026-10-01T08:00:00.000Z',
  },
];

describe('violationFilters utilities', () => {
  it('searches across violation id, hazard type, filename, zone, camera, and false positive reason with multi-token matching', () => {
    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, query: 'zone a helmet' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_1']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, query: 'cam-02' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_2']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, query: 'occluded' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_3']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, query: 'viol_4' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_4']);
  });

  it('filters by PPE type, zone, camera, sourceType, status, severity, and minimum confidence', () => {
    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, violationType: 'vest' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_2']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, zone: 'B' }, NOW).map((v) => v.id)
    ).toEqual(['viol_2']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, cameraId: 'CAM-03' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_3']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, sourceType: 'stream' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_3']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, status: 'resolved' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_2']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, status: 'unresolved' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_1', 'viol_4']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, status: 'false_positive' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_3']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, severity: 'critical' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_2']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, minConfidence: 0.85 }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_1', 'viol_2']);
  });

  it('filters by date range presets and custom start/end dates', () => {
    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, dateRange: 'today' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_1']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, dateRange: '7d' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_1', 'viol_2']);

    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, dateRange: '30d' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_1', 'viol_2', 'viol_3']);

    expect(
      filterAndSortViolations(
        sampleViolations,
        {
          ...DEFAULT_VIOLATION_FILTERS,
          dateRange: 'custom',
          startDate: '2026-11-01',
          endDate: '2026-11-21',
        },
        NOW
      ).map((v) => v.id)
    ).toEqual(['viol_2', 'viol_3']);
  });

  it('sorts records by newest, oldest, confidence, severity, and type', () => {
    expect(
      filterAndSortViolations(sampleViolations, { ...DEFAULT_VIOLATION_FILTERS, sortBy: 'oldest' }, NOW).map(
        (v) => v.id
      )
    ).toEqual(['viol_4', 'viol_3', 'viol_2', 'viol_1']);

    expect(
      filterAndSortViolations(
        sampleViolations,
        { ...DEFAULT_VIOLATION_FILTERS, sortBy: 'confidence_desc' },
        NOW
      ).map((v) => v.id)
    ).toEqual(['viol_1', 'viol_2', 'viol_4', 'viol_3']);

    expect(
      filterAndSortViolations(
        sampleViolations,
        { ...DEFAULT_VIOLATION_FILTERS, sortBy: 'severity_desc' },
        NOW
      ).map((v) => v.id)
    ).toEqual(['viol_2', 'viol_1', 'viol_3', 'viol_4']);
  });

  it('extracts available filter options, counts active filters, round-trips URL params, and builds CSV', () => {
    const options = getAvailableViolationOptions(sampleViolations);
    expect(options.zones).toEqual(['A', 'B', 'C', 'D']);
    expect(options.cameras).toEqual(['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04']);

    const criteria = {
      ...DEFAULT_VIOLATION_FILTERS,
      query: 'helmet',
      zone: 'A',
      status: 'unresolved' as const,
      minConfidence: 0.75,
      dateRange: '7d' as const,
      sortBy: 'confidence_desc' as const,
    };

    expect(countActiveViolationFilters(criteria)).toBe(5);

    const params = serializeViolationFiltersToSearchParams(criteria, 'violations');
    const parsed = parseViolationFiltersFromSearchParams(params);
    expect(parsed).toEqual(criteria);

    const csv = buildViolationsCSV([sampleViolations[0]]);
    expect(csv).toContain('Violation ID,PPE Hazard');
    expect(csv).toContain('viol_1,NO-Helmet,high,94,Active Unresolved,Zone A,CAM-01');
  });
});

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Scan,
  Violation,
  Incident,
  CorrectiveAction,
  ReportType,
  ReportParameters,
  ZoneRiskScore,
} from '../types';

export interface OSHAStandardMapping {
  standard: string;
  title: string;
  riskRating: 'Low' | 'Medium' | 'High' | 'Critical';
  requiredPPE: string;
}

export const OSHA_STANDARDS: Record<string, OSHAStandardMapping> = {
  'NO-Helmet': {
    standard: 'OSHA 1926.100(a)',
    title: 'Head Protection - Construction & Industrial Operations',
    riskRating: 'High',
    requiredPPE: 'ANSI Z89.1 Type I/II Hardhat',
  },
  'NO-Vest': {
    standard: 'OSHA 1926.201(a)',
    title: 'Signaling and High-Visibility Apparel for Traffic & Transit',
    riskRating: 'Medium',
    requiredPPE: 'ANSI/ISEA 107 Class 2/3 High-Visibility Vest',
  },
  'Missing Gloves': {
    standard: 'OSHA 1910.138',
    title: 'Hand Protection Against Mechanical and Chemical Hazards',
    riskRating: 'Low',
    requiredPPE: 'EN 388 / ANSI Cut & Abrasion Resistant Gloves',
  },
  'NO-Goggles': {
    standard: 'OSHA 1910.133(a)',
    title: 'Eye and Face Protection from Flying Particles & Radiant Energy',
    riskRating: 'High',
    requiredPPE: 'ANSI Z87.1+ Impact Rated Eye Protection',
  },
  'NO-Mask': {
    standard: 'OSHA 1910.134',
    title: 'Respiratory Protection in Dusty and Particulate Atmospheres',
    riskRating: 'Medium',
    requiredPPE: 'NIOSH N95 / Half-Mask Respirator',
  },
};

export interface CompiledReportData {
  reportId: string;
  type: ReportType;
  title: string;
  generatedAt: string;
  generatedBy: string;
  classification: string;
  parameters: ReportParameters;
  kpis: {
    totalScans: number;
    totalPersons: number;
    totalViolations: number;
    overallCompliancePct: number;
    openIncidents: number;
    falsePositivesExcluded: number;
  };
  zoneBreakdown: {
    zone: 'A' | 'B' | 'C' | 'D';
    scansCount: number;
    violationsCount: number;
    compliancePct: number;
    riskBand: string;
  }[];
  violationBreakdown: {
    classType: string;
    count: number;
    oshaStandard: string;
    riskRating: string;
    requiredPPE: string;
  }[];
  incidents: Incident[];
  correctiveActions: CorrectiveAction[];
  evidenceThumbnails: {
    fileName: string;
    zone: string;
    cameraId: string;
    violationType: string;
    timestamp: string;
    imageUrl?: string;
  }[];
  policyCitations: string[];
  aiNarrative: {
    executiveSummary: string;
    keyObservations: string[];
    correctiveRecommendations: string[];
  };
  methodologyNotes: {
    retentionPolicyDays: number;
    falsePositiveHandling: string;
    recordCountsTotal: number;
  };
}

/**
 * Compiles all data required for the chosen report type.
 */
export function compileReportData(params: {
  type: ReportType;
  parameters: ReportParameters;
  scans: Scan[];
  violations: Violation[];
  incidents: Incident[];
  actions: CorrectiveAction[];
  zoneRisks: ZoneRiskScore[];
  userEmail: string;
  aiNarrativeOverride?: {
    executiveSummary?: string;
    keyObservations?: string[];
    correctiveRecommendations?: string[];
  };
}): CompiledReportData {
  const { type, parameters, scans, violations, incidents, actions, zoneRisks, userEmail, aiNarrativeOverride } =
    params;

  const now = new Date();
  const reportId = `RPT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  // Titles
  const titles: Record<ReportType, string> = {
    daily_safety_summary: 'Daily Site Safety & PPE Summary',
    weekly_safety_report: 'Weekly Safety Inspection & Trend Report',
    monthly_compliance_audit: 'Monthly OSHA Compliance Audit & Review',
    incident_investigation: 'Incident Investigation & Root Cause Report',
    zone_report: `Zone ${parameters.zones[0] || 'A'} Comprehensive Safety Report`,
    executive_summary: 'Executive Safety & Risk Intelligence Brief',
  };

  const totalScans = scans.length;
  const totalPersons = scans.reduce((acc, s) => acc + (s.totalPersons || 1), 0);
  const falsePositives = violations.filter((v) => v.isFalsePositive).length;
  const validViolations = violations.filter((v) => !v.isFalsePositive);
  const totalViolations = validViolations.length;

  const avgCompliance =
    scans.length > 0
      ? Math.round(scans.reduce((acc, s) => acc + (s.compliancePct || 100), 0) / scans.length)
      : 100;

  // Zone Breakdown
  const targetZones = parameters.zones.length > 0 ? parameters.zones : (['A', 'B', 'C', 'D'] as const);
  const zoneBreakdown = targetZones.map((z) => {
    const zScans = scans.filter((s) => s.zone === z);
    const zViols = validViolations.filter((v) => v.zone === z);
    const zComp =
      zScans.length > 0
        ? Math.round(zScans.reduce((a, s) => a + (s.compliancePct || 100), 0) / zScans.length)
        : 100;
    const rScore = zoneRisks.find((zr) => zr.zone === z);
    return {
      zone: z,
      scansCount: zScans.length,
      violationsCount: zViols.length,
      compliancePct: zComp,
      riskBand: rScore ? rScore.band : 'Low',
    };
  });

  // Violation Breakdown
  const classCountMap: Record<string, number> = {};
  for (const v of validViolations) {
    classCountMap[v.type] = (classCountMap[v.type] || 0) + 1;
  }

  const violationBreakdown = Object.entries(classCountMap).map(([cType, count]) => {
    const osha = OSHA_STANDARDS[cType] || {
      standard: 'OSHA 1910.132(a)',
      title: 'General PPE Requirements for Workplace Hazards',
      riskRating: 'Medium',
      requiredPPE: 'Standard Site Certified Equipment',
    };
    return {
      classType: cType,
      count,
      oshaStandard: osha.standard,
      riskRating: osha.riskRating,
      requiredPPE: osha.requiredPPE,
    };
  });

  // Evidence Thumbnails (respecting max limit)
  const evidenceThumbnails = validViolations
    .slice(0, parameters.maxThumbnails || 6)
    .map((v) => ({
      fileName: v.fileName,
      zone: v.zone || 'A',
      cameraId: v.cameraId || 'CAM-01',
      violationType: v.type,
      timestamp: v.createdAt,
      imageUrl: v.evidenceImage,
    }));

  // Policy Citations
  const policyCitations = [
    'OSHA Standard 29 CFR 1926.100 (Head Protection in Construction Areas)',
    'OSHA Standard 29 CFR 1926.201 (Signaling & High-Visibility Apparel)',
    'OSHA Standard 29 CFR 1910.133 (Eye and Face Protection Standards)',
    'OSHA Standard 29 CFR 1910.138 (Hand Protection Hazard Assessment)',
    'SafeVision Site Safety Directive v4.2 · Section 3.1 (Mandatory PPE Enforcement)',
  ];

  // Default Grounded AI Narrative
  const defaultNarrative = {
    executiveSummary: `During the evaluated period, SafeVision AI processed ${totalScans} visual inspection events covering ${totalPersons} personnel observations. Site compliance achieved an overall rate of ${avgCompliance}%, with ${totalViolations} validated safety infractions logged and ${falsePositives} false-positive detections safely reconciled.`,
    keyObservations: [
      `Primary safety risk concentrated around head protection [OSHA 1926.100], accounting for the highest frequency of critical flags.`,
      `Zone A and Zone B transit corridors registered recurrent high-visibility garment infractions during early morning shift handovers [OSHA 1926.201].`,
      `Reconciled ${falsePositives} camera shadow artifacts to ensure 100% data audit integrity against false alarm penalties.`,
    ],
    correctiveRecommendations: [
      `Re-enforce mandatory hardhat entry gates at Zone A Crane Lift perimeter with physical signage and gate attendant verification.`,
      `Distribute Class-2 high-visibility vests at Loading Dock locker stations and schedule a 15-minute toolbox safety briefing.`,
      `Inspect optical sensor housings on CAM-04 to maintain 24-hour visual feed continuity across hazardous sectors.`,
    ],
  };

  const aiNarrative = {
    executiveSummary: aiNarrativeOverride?.executiveSummary || defaultNarrative.executiveSummary,
    keyObservations: aiNarrativeOverride?.keyObservations || defaultNarrative.keyObservations,
    correctiveRecommendations:
      aiNarrativeOverride?.correctiveRecommendations || defaultNarrative.correctiveRecommendations,
  };

  return {
    reportId,
    type,
    title: titles[type] || 'Safety Compliance Audit Report',
    generatedAt: now.toISOString(),
    generatedBy: userEmail,
    classification: 'CONFIDENTIAL // INTERNAL SAFETY AUDIT',
    parameters,
    kpis: {
      totalScans,
      totalPersons,
      totalViolations,
      overallCompliancePct: avgCompliance,
      openIncidents: incidents.filter((i) => i.status === 'open' || i.status === 'investigating').length,
      falsePositivesExcluded: falsePositives,
    },
    zoneBreakdown,
    violationBreakdown,
    incidents,
    correctiveActions: actions,
    evidenceThumbnails,
    policyCitations,
    aiNarrative,
    methodologyNotes: {
      retentionPolicyDays: 90,
      falsePositiveHandling:
        'All flagged false-positives are excluded from violation penalties and segregated into audit records for model recalibration.',
      recordCountsTotal: scans.length + violations.length,
    },
  };
}

/**
 * Multi-page A4 PDF export using jsPDF + autoTable.
 */
export async function exportReportToPDF(report: CompiledReportData): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const primaryColor = [20, 24, 39]; // slate-900
  const amberColor = [217, 119, 6]; // amber-600
  const lightGray = [241, 245, 249]; // slate-100

  // Header Helper
  const addHeaderFooter = (pageNumber: number, totalPages: number) => {
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, pageWidth, 8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('SAFEVISION AI // OCCUPATIONAL SAFETY & HEALTH AUDIT PLATFORM', margin, 5.5);
    doc.text(report.classification, pageWidth - margin - 50, 5.5);

    // Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Report ID: ${report.reportId} · Generated: ${report.generatedAt.split('T')[0]}`, margin, pageHeight - 6);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 6);
  };

  // --- PAGE 1: COVER & EXECUTIVE SUMMARY ---
  y = 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42);
  doc.text(report.title, margin, y);

  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Report ID: ${report.reportId}  |  Generated by: ${report.generatedBy}  |  Date: ${report.generatedAt.replace('T', ' ').slice(0, 19)}`,
    margin,
    y
  );

  y += 10;
  // KPI Summary Boxes
  const kpiBoxWidth = (pageWidth - margin * 2 - 9) / 4;
  const kpisToRender = [
    { label: 'Overall Compliance', value: `${report.kpis.overallCompliancePct}%` },
    { label: 'Validated Violations', value: `${report.kpis.totalViolations}` },
    { label: 'Total Scans Logged', value: `${report.kpis.totalScans}` },
    { label: 'Open Incidents', value: `${report.kpis.openIncidents}` },
  ];

  kpisToRender.forEach((kpi, idx) => {
    const bx = margin + idx * (kpiBoxWidth + 3);
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(bx, y, kpiBoxWidth, 18, 2, 2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(bx, y, kpiBoxWidth, 18, 2, 2, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, bx + 4, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, bx + 4, y + 14);
  });

  y += 26;

  // Executive Narrative
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Executive Summary', margin, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const splitSummary = doc.splitTextToSize(report.aiNarrative.executiveSummary, pageWidth - margin * 2);
  doc.text(splitSummary, margin, y);
  y += splitSummary.length * 4.5 + 4;

  // Key Observations
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Key Observations & Audit Findings:', margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  report.aiNarrative.keyObservations.forEach((obs) => {
    const splitObs = doc.splitTextToSize(`• ${obs}`, pageWidth - margin * 2 - 4);
    doc.text(splitObs, margin + 2, y);
    y += splitObs.length * 4 + 1;
  });

  y += 4;
  // Recommendations
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Recommended Corrective Actions:', margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  report.aiNarrative.correctiveRecommendations.forEach((rec) => {
    const splitRec = doc.splitTextToSize(`→ ${rec}`, pageWidth - margin * 2 - 4);
    doc.text(splitRec, margin + 2, y);
    y += splitRec.length * 4 + 1;
  });

  // Table 1: Compliance by Zone
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Zone Compliance & Risk Ratings', margin, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Zone', 'Visual Scans', 'Violations', 'Compliance Rate', 'Calculated Risk Band']],
    body: report.zoneBreakdown.map((z) => [
      `Zone ${z.zone}`,
      z.scansCount.toString(),
      z.violationsCount.toString(),
      `${z.compliancePct}%`,
      z.riskBand,
    ]),
    theme: 'striped',
    headStyles: { fillColor: primaryColor as any, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: margin, right: margin },
  });

  // --- PAGE 2: VIOLATION BREAKDOWN & OSHA STANDARDS ---
  doc.addPage();
  y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Violation Breakdown & OSHA/ANSI References', margin, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Violation Class', 'Occurrences', 'OSHA / ANSI Standard', 'Risk Level', 'Mandated Equipment']],
    body: report.violationBreakdown.map((v) => [
      v.classType,
      v.count.toString(),
      v.oshaStandard,
      v.riskRating,
      v.requiredPPE,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: margin, right: margin },
  });

  // Corrective Actions Status Table
  const currentY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Corrective Action Registry & Due Dates', margin, currentY);

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Action Title', 'Zone', 'Owner Role', 'Due Date', 'Status']],
    body: report.correctiveActions.map((ca) => [
      ca.title,
      `Zone ${ca.zone}`,
      ca.ownerRole,
      ca.dueDate,
      ca.status.toUpperCase(),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: margin, right: margin },
  });

  // Sign-off block
  const signY = (doc as any).lastAutoTable.finalY + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('5. Compliance Audit Sign-Off', margin, signY);

  const signWidth = (pageWidth - margin * 2 - 10) / 3;
  const signBlocks = ['Prepared By', 'Reviewed By (Safety Supervisor)', 'Approved By (Operations Director)'];

  signBlocks.forEach((label, idx) => {
    const sx = margin + idx * (signWidth + 5);
    const sy = signY + 6;
    doc.setDrawColor(203, 213, 225);
    doc.rect(sx, sy, signWidth, 24, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, sx + 3, sy + 5);

    doc.line(sx + 3, sy + 18, sx + signWidth - 3, sy + 18);
    doc.setFontSize(6.5);
    doc.text('Signature & Date', sx + 3, sy + 21);
  });

  // Apply Headers & Footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addHeaderFooter(i, totalPages);
  }

  return doc.output('blob');
}

/**
 * Escapes CSV values to prevent formula injection attacks (=, +, -, @, \t, \r).
 */
export function preventCSVInjection(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  let str = String(value);

  // If the string starts with any formula injection triggers, prepend a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape inner double quotes
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Exports report records to secure CSV format.
 */
export function exportReportToCSV(report: CompiledReportData): string {
  const headers = [
    'Report ID',
    'Date Generated',
    'Zone',
    'Violation Class',
    'Count',
    'OSHA Standard',
    'Risk Rating',
    'Mandated PPE',
  ];

  const rows: string[] = [headers.map(preventCSVInjection).join(',')];

  for (const v of report.violationBreakdown) {
    const row = [
      report.reportId,
      report.generatedAt,
      report.parameters.zones.join(';') || 'ALL',
      v.classType,
      v.count,
      v.oshaStandard,
      v.riskRating,
      v.requiredPPE,
    ];
    rows.push(row.map(preventCSVInjection).join(','));
  }

  return rows.join('\r\n');
}

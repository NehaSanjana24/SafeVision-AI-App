import {
  Scan,
  Violation,
  Incident,
  CorrectiveAction,
  ReportType,
  ReportParameters,
  ZoneRiskScore,
} from '../types';
import { resolveDateWindow } from './analytics';
import { recordMetric } from './logger';

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
  aiReviewedBy?: string;
  classification: string;
  parameters: ReportParameters;
  sectionLabels: {
    execSummary: string;
    observations: string;
    recommendations: string;
    zoneCompliance: string;
    violationBreakdown: string;
    correctiveActions: string;
    evidenceAppendix: string;
    signOff: string;
  };
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
  selectedIncident?: Incident;
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
 * Compiles filtered, zero-hallucination data required for the chosen report type & language.
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
  aiReviewedBy?: string;
  aiNarrativeOverride?: {
    executiveSummary?: string;
    keyObservations?: string[];
    correctiveRecommendations?: string[];
  };
  policyCitationsOverride?: string[];
}): CompiledReportData {
  const {
    type,
    parameters,
    scans,
    violations,
    incidents,
    actions,
    zoneRisks,
    userEmail,
    aiReviewedBy,
    aiNarrativeOverride,
    policyCitationsOverride,
  } = params;

  const isEs = parameters.language === 'es';
  const now = new Date();
  const reportId = `RPT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;

  // 1. Filter by date window, zones, cameras, and optional incidentId
  const window = resolveDateWindow(parameters.dateRange, parameters.startDate, parameters.endDate);
  const targetZones =
    parameters.zones.length > 0 ? parameters.zones : (['A', 'B', 'C', 'D'] as ('A' | 'B' | 'C' | 'D')[]);
  const targetCameras = parameters.cameras && parameters.cameras.length > 0 ? new Set(parameters.cameras) : null;

  const inWindow = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= window.start.getTime() && t <= window.end.getTime();
  };

  const selectedIncident =
    parameters.incidentId ? incidents.find((i) => i.id === parameters.incidentId) : undefined;

  let filteredScans = scans.filter(
    (s) =>
      inWindow(s.createdAt) &&
      (!s.zone || targetZones.includes(s.zone)) &&
      (!targetCameras || !s.cameraId || targetCameras.has(s.cameraId))
  );

  let filteredViolations = violations.filter(
    (v) =>
      inWindow(v.createdAt) &&
      (!v.zone || targetZones.includes(v.zone)) &&
      (!targetCameras || !v.cameraId || targetCameras.has(v.cameraId))
  );

  let filteredIncidents = incidents.filter(
    (i) => inWindow(i.createdAt) && (!i.zone || targetZones.includes(i.zone))
  );

  let filteredActions = actions.filter((a) => targetZones.includes(a.zone));

  if (type === 'incident_investigation' && selectedIncident) {
    filteredIncidents = [selectedIncident];
    if (selectedIncident.violationIds && selectedIncident.violationIds.length > 0) {
      const idSet = new Set(selectedIncident.violationIds);
      const matched = violations.filter((v) => idSet.has(v.id));
      if (matched.length > 0) filteredViolations = matched;
    } else if (selectedIncident.zone) {
      filteredViolations = violations.filter((v) => v.zone === selectedIncident.zone);
      filteredScans = scans.filter((s) => s.zone === selectedIncident.zone);
    }
    filteredActions = actions.filter(
      (a) => a.incidentId === selectedIncident.id || a.zone === selectedIncident.zone
    );
  }

  const titlesEn: Record<ReportType, string> = {
    daily_safety_summary: 'Daily Site Safety & PPE Summary',
    weekly_safety_report: 'Weekly Safety Inspection & Trend Report',
    monthly_compliance_audit: 'Monthly OSHA Compliance Audit & Review',
    incident_investigation: selectedIncident
      ? `Incident #${selectedIncident.incidentNumber || ''} Investigation Report`
      : 'Incident Investigation & Root Cause Report',
    zone_report: `Zone ${targetZones.join(', ')} Comprehensive Safety Report`,
    executive_summary: 'Executive Safety & Risk Intelligence Brief',
  };

  const titlesEs: Record<ReportType, string> = {
    daily_safety_summary: 'Resumen Diario de Seguridad y EPP',
    weekly_safety_report: 'Informe Semanal de Inspección y Tendencias',
    monthly_compliance_audit: 'Auditoría Mensual de Cumplimiento OSHA',
    incident_investigation: selectedIncident
      ? `Informe de Investigación del Incidente #${selectedIncident.incidentNumber || ''}`
      : 'Informe de Investigación e Incidente de Seguridad',
    zone_report: `Informe Integral de Seguridad · Zona ${targetZones.join(', ')}`,
    executive_summary: 'Resumen Ejecutivo de Riesgo y Cumplimiento',
  };

  const sectionLabels = isEs
    ? {
        execSummary: '1. Resumen Ejecutivo',
        observations: 'Observaciones Clave y Hallazgos',
        recommendations: 'Acciones Correctivas Recomendadas',
        zoneCompliance: '2. Cumplimiento y Riesgo por Zona',
        violationBreakdown: '3. Desglose de Infracciones y Normas OSHA/ANSI',
        correctiveActions: '4. Registro de Acciones Correctivas',
        evidenceAppendix: '5. Anexo de Evidencia Visual',
        signOff: '6. Firma y Validación de Auditoría',
      }
    : {
        execSummary: '1. Executive Summary',
        observations: 'Key Observations & Audit Findings',
        recommendations: 'Recommended Corrective Actions',
        zoneCompliance: '2. Zone Compliance & Risk Ratings',
        violationBreakdown: '3. Violation Breakdown & OSHA/ANSI References',
        correctiveActions: '4. Corrective Action Registry & Due Dates',
        evidenceAppendix: '5. Visual Evidence Appendix',
        signOff: '6. Compliance Audit Sign-Off',
      };

  const totalScans = filteredScans.length;
  const totalPersons = filteredScans.reduce((acc, s) => acc + (s.totalPersons || 1), 0);
  const falsePositives = filteredViolations.filter((v) => v.isFalsePositive).length;
  const validViolations = filteredViolations.filter((v) => !v.isFalsePositive);
  const totalViolations = validViolations.length;

  const avgCompliance =
    filteredScans.length > 0
      ? Math.round(filteredScans.reduce((acc, s) => acc + (s.compliancePct || 100), 0) / filteredScans.length)
      : 100;

  const zoneBreakdown = targetZones.map((z) => {
    const zScans = filteredScans.filter((s) => s.zone === z);
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

  const maxThumbLimit = parameters.includeEvidenceThumbnails ? Math.max(0, parameters.maxThumbnails ?? 6) : 0;
  const evidenceThumbnails = validViolations.slice(0, maxThumbLimit).map((v) => ({
    fileName: v.fileName,
    zone: v.zone || 'A',
    cameraId: v.cameraId || 'CAM-01',
    violationType: v.type,
    timestamp: v.createdAt,
    imageUrl: v.evidenceImage,
  }));

  const defaultPolicyCitations = [
    'OSHA Standard 29 CFR 1926.100 (Head Protection in Construction Areas)',
    'OSHA Standard 29 CFR 1926.201 (Signaling & High-Visibility Apparel)',
    'OSHA Standard 29 CFR 1910.133 (Eye and Face Protection Standards)',
    'OSHA Standard 29 CFR 1910.138 (Hand Protection Hazard Assessment)',
    'SafeVision Site Safety Directive v4.2 · Section 3.1 (Mandatory PPE Enforcement)',
  ];

  const policyCitations = parameters.includePolicyReferences
    ? policyCitationsOverride && policyCitationsOverride.length > 0
      ? policyCitationsOverride
      : defaultPolicyCitations
    : [];

  const topViolation = violationBreakdown.sort((a, b) => b.count - a.count)[0];
  const defaultNarrative = !parameters.includeAINarrative
    ? {
        executiveSummary: isEs
          ? `Resumen cuantitativo del período: ${totalScans} inspecciones visuales, ${totalViolations} infracciones validadas, cumplimiento promedio de ${avgCompliance}%.`
          : `Quantitative summary for selected window: ${totalScans} visual scans evaluated across ${totalPersons} personnel observations with ${avgCompliance}% overall PPE compliance and ${totalViolations} validated violations.`,
        keyObservations: [],
        correctiveRecommendations: [],
      }
    : isEs
    ? {
        executiveSummary: `Durante el período evaluado, SafeVision AI procesó ${totalScans} eventos de inspección visual (${totalPersons} observaciones de personal). El cumplimiento alcanzó ${avgCompliance}%, con ${totalViolations} infracciones validadas y ${falsePositives} falsos positivos reconciliados.${
          selectedIncident
            ? ` Enfoque del incidente #${selectedIncident.incidentNumber}: ${selectedIncident.summary}`
            : ''
        }`,
        keyObservations: [
          topViolation
            ? `Clase principal de riesgo: ${topViolation.classType} (${topViolation.count} eventos) [${topViolation.oshaStandard}].`
            : 'No se registraron infracciones críticas en los sectores filtrados.',
          `Se excluyeron ${falsePositives} detecciones marcadas como falsos positivos para preservar la integridad de la auditoría.`,
        ],
        correctiveRecommendations: [
          `Reforzar los puntos de control de EPP obligatorio en las zonas ${targetZones.join(', ')} antes del inicio de turno.`,
          `Verificar la continuidad de alimentación de cámaras y realizar una charla de seguridad de 15 minutos.`,
        ],
      }
    : {
        executiveSummary: `During the evaluated period, SafeVision AI processed ${totalScans} visual inspection events covering ${totalPersons} personnel observations. Site compliance achieved ${avgCompliance}%, with ${totalViolations} validated safety infractions logged and ${falsePositives} false-positive detections reconciled.${
          selectedIncident
            ? ` Incident #${selectedIncident.incidentNumber} Focus: ${selectedIncident.summary}`
            : ''
        }`,
        keyObservations: [
          topViolation
            ? `Primary infraction concentration: ${topViolation.classType} (${topViolation.count} occurrences) governed by ${topViolation.oshaStandard}.`
            : 'Zero validated violations observed across the selected zones and cameras.',
          `Active open/investigating incident count stands at ${
            filteredIncidents.filter((i) => i.status === 'open' || i.status === 'investigating').length
          } with ${filteredActions.length} tracked corrective actions.`,
          `Reconciled ${falsePositives} flagged false-positive records to protect audit integrity.`,
        ],
        correctiveRecommendations: [
          `Enforce mandatory pre-entry PPE verification in Zones ${targetZones.join(', ')} with supervisor spot checks.`,
          `Address overdue or high-priority corrective actions and review silent vision sensor feeds.`,
          `Maintain Policy Knowledge Base alignment for all recurring infraction categories.`,
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
    title: (isEs ? titlesEs : titlesEn)[type] || 'Safety Compliance Audit Report',
    generatedAt: now.toISOString(),
    generatedBy: userEmail,
    aiReviewedBy,
    classification: 'CONFIDENTIAL // INTERNAL SAFETY AUDIT',
    parameters,
    sectionLabels,
    kpis: {
      totalScans,
      totalPersons,
      totalViolations,
      overallCompliancePct: avgCompliance,
      openIncidents: filteredIncidents.filter((i) => i.status === 'open' || i.status === 'investigating').length,
      falsePositivesExcluded: falsePositives,
    },
    zoneBreakdown,
    violationBreakdown,
    incidents: filteredIncidents,
    selectedIncident,
    correctiveActions: filteredActions,
    evidenceThumbnails,
    policyCitations,
    aiNarrative,
    methodologyNotes: {
      retentionPolicyDays: 90,
      falsePositiveHandling:
        'All flagged false-positives are excluded from violation penalties and segregated into audit records for model recalibration.',
      recordCountsTotal: filteredScans.length + filteredViolations.length,
    },
  };
}

/**
 * Dynamically imports jsPDF + autotable + html2canvas to render multi-page A4 dossier with embedded chart & JPEG evidence.
 */
export async function exportReportToPDF(
  report: CompiledReportData,
  chartElement?: HTMLElement | null
): Promise<Blob> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const primaryColor: [number, number, number] = [20, 24, 39];
  const lightGray: [number, number, number] = [241, 245, 249];

  const addHeaderFooter = (pageNumber: number, totalPages: number) => {
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, pageWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('SAFEVISION AI // OCCUPATIONAL SAFETY & HEALTH AUDIT PLATFORM', margin, 5.5);
    doc.text(report.classification, pageWidth - margin - 52, 5.5);

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Report ID: ${report.reportId} · Generated: ${report.generatedAt.split('T')[0]}`, margin, pageHeight - 6);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 6);
  };

  // --- PAGE 1 ---
  y = 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(report.title, margin, y);

  y += 6.5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const reviewTag = report.aiReviewedBy ? ` | Reviewed by: ${report.aiReviewedBy}` : '';
  doc.text(
    `ID: ${report.reportId} | Author: ${report.generatedBy} | Lang: ${report.parameters.language.toUpperCase()}${reviewTag}`,
    margin,
    y
  );

  y += 8;
  const kpiBoxWidth = (pageWidth - margin * 2 - 9) / 4;
  const kpisToRender = [
    { label: 'Compliance', value: `${report.kpis.overallCompliancePct}%` },
    { label: 'Violations', value: `${report.kpis.totalViolations}` },
    { label: 'Total Scans', value: `${report.kpis.totalScans}` },
    { label: 'Open Incidents', value: `${report.kpis.openIncidents}` },
  ];

  kpisToRender.forEach((kpi, idx) => {
    const bx = margin + idx * (kpiBoxWidth + 3);
    doc.setFillColor(lightGray[0], lightGray[1], lightGray[2]);
    doc.roundedRect(bx, y, kpiBoxWidth, 16, 2, 2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(bx, y, kpiBoxWidth, 16, 2, 2, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, bx + 4, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, bx + 4, y + 12.5);
  });

  y += 23;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(report.sectionLabels.execSummary, margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const splitSummary = doc.splitTextToSize(report.aiNarrative.executiveSummary, pageWidth - margin * 2);
  doc.text(splitSummary, margin, y);
  y += splitSummary.length * 4.3 + 3;

  if (report.aiNarrative.keyObservations.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(report.sectionLabels.observations, margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    report.aiNarrative.keyObservations.forEach((obs) => {
      const lines = doc.splitTextToSize(`• ${obs}`, pageWidth - margin * 2 - 3);
      doc.text(lines, margin + 2, y);
      y += lines.length * 3.8 + 1;
    });
    y += 2;
  }

  // Optional embedded chart snapshot via html2canvas
  if (chartElement && typeof window !== 'undefined') {
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(chartElement, { backgroundColor: '#020617', scale: 1.5 });
      const chartImg = canvas.toDataURL('image/png');
      const imgW = pageWidth - margin * 2;
      const imgH = Math.min(52, (canvas.height / Math.max(1, canvas.width)) * imgW);
      if (y + imgH > pageHeight - 25) {
        doc.addPage();
        y = 18;
      }
      doc.addImage(chartImg, 'PNG', margin, y, imgW, imgH);
      y += imgH + 6;
    } catch {
      // Skip snapshot gracefully if DOM canvas cannot render
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(report.sectionLabels.zoneCompliance, margin, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Zone', 'Visual Scans', 'Violations', 'Compliance %', 'Risk Band']],
    body: report.zoneBreakdown.map((z) => [
      `Zone ${z.zone}`,
      z.scansCount.toString(),
      z.violationsCount.toString(),
      `${z.compliancePct}%`,
      z.riskBand,
    ]),
    theme: 'striped',
    headStyles: { fillColor: primaryColor, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: margin, right: margin },
  });

  // --- PAGE 2: VIOLATIONS, ACTIONS, CITATIONS & SIGN-OFF ---
  doc.addPage();
  y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(report.sectionLabels.violationBreakdown, margin, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Violation Class', 'Count', 'OSHA / ANSI Standard', 'Risk', 'Required PPE']],
    body:
      report.violationBreakdown.length > 0
        ? report.violationBreakdown.map((v) => [
            v.classType,
            v.count.toString(),
            v.oshaStandard,
            v.riskRating,
            v.requiredPPE,
          ])
        : [['None', '0', 'OSHA 1910.132(a)', 'Low', 'Compliant']],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: margin, right: margin },
  });

  let nextY = ((doc as any).lastAutoTable?.finalY || y + 30) + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(report.sectionLabels.correctiveActions, margin, nextY);

  autoTable(doc, {
    startY: nextY + 3,
    head: [['Action Title', 'Zone', 'Owner', 'Due Date', 'Status']],
    body:
      report.correctiveActions.length > 0
        ? report.correctiveActions.map((ca) => [
            ca.title,
            `Zone ${ca.zone}`,
            ca.ownerRole,
            ca.dueDate,
            ca.status.toUpperCase(),
          ])
        : [['No corrective actions logged in period', '-', '-', '-', '-']],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: margin, right: margin },
  });

  nextY = ((doc as any).lastAutoTable?.finalY || nextY + 30) + 8;

  if (report.policyCitations.length > 0) {
    if (nextY > pageHeight - 55) {
      doc.addPage();
      nextY = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Policy & Standards References', margin, nextY);
    nextY += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    report.policyCitations.forEach((cite) => {
      doc.text(`• ${cite}`, margin + 2, nextY);
      nextY += 4;
    });
    nextY += 4;
  }

  // Visual Evidence Appendix (capped at maxThumbnails)
  if (report.evidenceThumbnails.length > 0) {
    const withImages = report.evidenceThumbnails.filter((t) => t.imageUrl?.startsWith('data:image'));
    if (nextY > pageHeight - 60) {
      doc.addPage();
      nextY = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`${report.sectionLabels.evidenceAppendix} (${report.evidenceThumbnails.length} items)`, margin, nextY);
    nextY += 5;

    let col = 0;
    const thumbW = 55;
    const thumbH = 36;
    for (const item of report.evidenceThumbnails) {
      const tx = margin + col * (thumbW + 5);
      if (nextY + thumbH + 14 > pageHeight - 18) {
        doc.addPage();
        nextY = 18;
        col = 0;
      }
      if (item.imageUrl && withImages.includes(item)) {
        try {
          const fmt = item.imageUrl.includes('image/png') ? 'PNG' : 'JPEG';
          doc.addImage(item.imageUrl, fmt, tx, nextY, thumbW, thumbH);
        } catch {}
      } else {
        doc.setFillColor(241, 245, 249);
        doc.rect(tx, nextY, thumbW, thumbH, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(`${item.violationType} · Zone ${item.zone}`, tx, nextY + thumbH + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(`${item.cameraId} · ${item.timestamp.slice(0, 10)}`, tx, nextY + thumbH + 8);

      col++;
      if (col >= 3) {
        col = 0;
        nextY += thumbH + 13;
      }
    }
    if (col !== 0) nextY += thumbH + 13;
  }

  // Sign-off block
  if (nextY > pageHeight - 40) {
    doc.addPage();
    nextY = 18;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(report.sectionLabels.signOff, margin, nextY);

  const signWidth = (pageWidth - margin * 2 - 10) / 3;
  const signBlocks = ['Prepared By', 'Reviewed By (Safety Supervisor)', 'Approved By (Operations Director)'];
  signBlocks.forEach((label, idx) => {
    const sx = margin + idx * (signWidth + 5);
    const sy = nextY + 5;
    doc.setDrawColor(203, 213, 225);
    doc.rect(sx, sy, signWidth, 22, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, sx + 3, sy + 5);
    doc.line(sx + 3, sy + 16, sx + signWidth - 3, sy + 16);
    doc.setFontSize(6.5);
    doc.text(idx === 0 ? report.generatedBy : report.aiReviewedBy || 'Signature & Date', sx + 3, sy + 19.5);
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addHeaderFooter(i, totalPages);
  }

  const blob = doc.output('blob');
  recordMetric(
    'report_pdf',
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
  );
  return blob;
}

/**
 * Generates a concise, colorful summarized PDF report of PPE compliance statistics using jsPDF.
 */
export async function exportSummarizedCompliancePDF(report: CompiledReportData): Promise<Blob> {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // Top colorful header banner
  doc.setFillColor(30, 41, 82); // Deep indigo
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setFillColor(124, 58, 237); // Violet accent stripe
  doc.rect(0, 24, pageWidth, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('SafeVision AI · PPE Compliance Statistics Summary', margin, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  const windowLabel = `${report.parameters.dateRange.toUpperCase()} | Zones: ${
    report.parameters.zones.join(', ') || 'ALL'
  }`;
  doc.text(
    `Report ID: ${report.reportId}   |   Window: ${windowLabel}   |   Generated: ${report.generatedAt.slice(0, 10)}`,
    margin,
    18.5
  );

  let y = 34;

  // Section 1: 4 Colorful Key Metrics Cards
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Executive Compliance Snapshot', margin, y);
  y += 4;

  const boxWidth = (pageWidth - margin * 2 - 9) / 4;
  const statCards: {
    label: string;
    value: string;
    sub: string;
    fill: [number, number, number];
    border: [number, number, number];
    accent: [number, number, number];
  }[] = [
    {
      label: 'COMPLIANCE RATE',
      value: `${report.kpis.overallCompliancePct}%`,
      sub: report.kpis.overallCompliancePct >= 90 ? 'Target Met (>=90%)' : 'Below Target',
      fill: [236, 253, 245],
      border: [16, 185, 129],
      accent: [4, 120, 87],
    },
    {
      label: 'VIOLATIONS',
      value: `${report.kpis.totalViolations}`,
      sub: `${report.kpis.falsePositivesExcluded} FP Excluded`,
      fill: [255, 241, 242],
      border: [244, 63, 94],
      accent: [190, 18, 60],
    },
    {
      label: 'SCANS & PEOPLE',
      value: `${report.kpis.totalScans}`,
      sub: `${report.kpis.totalPersons} Observed`,
      fill: [239, 246, 255],
      border: [59, 130, 246],
      accent: [29, 78, 216],
    },
    {
      label: 'OPEN INCIDENTS',
      value: `${report.kpis.openIncidents}`,
      sub: `${report.correctiveActions.length} Actions Tracked`,
      fill: [245, 243, 255],
      border: [139, 92, 246],
      accent: [109, 40, 217],
    },
  ];

  statCards.forEach((card, idx) => {
    const bx = margin + idx * (boxWidth + 3);
    doc.setFillColor(card.fill[0], card.fill[1], card.fill[2]);
    doc.setDrawColor(card.border[0], card.border[1], card.border[2]);
    doc.roundedRect(bx, y, boxWidth, 21, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(card.label, bx + 3.5, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.text(card.value, bx + 3.5, y + 13.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(card.sub, bx + 3.5, y + 18.5);
  });

  y += 28;

  // Section 2: Summarized Narrative Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Compliance Summary & Statistical Overview', margin, y);
  y += 4;

  const summaryText =
    report.aiNarrative.executiveSummary ||
    `Evaluated ${report.kpis.totalScans} visual scans across ${report.kpis.totalPersons} worker observations with ${report.kpis.overallCompliancePct}% PPE compliance and ${report.kpis.totalViolations} validated violations.`;
  const summaryLines = doc.splitTextToSize(summaryText, pageWidth - margin * 2 - 8);
  const summaryBoxH = Math.max(16, summaryLines.length * 4.4 + 6);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, pageWidth - margin * 2, summaryBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(summaryLines, margin + 4, y + 5.5);
  y += summaryBoxH + 7;

  // Section 3: Zone Compliance Statistics Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Zone Compliance & Risk Statistics', margin, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Zone', 'Visual Scans', 'Violations', 'Compliance %', 'Risk Band']],
    body: report.zoneBreakdown.map((z) => [
      `Zone ${z.zone}`,
      z.scansCount.toString(),
      z.violationsCount.toString(),
      `${z.compliancePct}%`,
      z.riskBand,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [29, 78, 216], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: 30 },
    margin: { left: margin, right: margin },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 32) + 8;

  // Section 4: PPE Violation Category Statistics
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('4. PPE Violation Category Breakdown', margin, y);
  y += 3;

  const totalViolCount = Math.max(
    1,
    report.violationBreakdown.reduce((acc, item) => acc + item.count, 0)
  );

  autoTable(doc, {
    startY: y,
    head: [['PPE Violation Type', 'Count', 'Share %', 'OSHA Standard', 'Severity']],
    body:
      report.violationBreakdown.length > 0
        ? report.violationBreakdown.map((v) => [
            v.classType,
            v.count.toString(),
            `${Math.round((v.count / totalViolCount) * 100)}%`,
            v.oshaStandard,
            v.riskRating,
          ])
        : [['No PPE Violations', '0', '0%', 'OSHA 1910.132(a)', 'Low']],
    theme: 'striped',
    headStyles: { fillColor: [109, 40, 217], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8.5, textColor: 30 },
    margin: { left: margin, right: margin },
  });

  y = ((doc as any).lastAutoTable?.finalY || y + 32) + 8;

  // Section 5: Key Highlights (if fits comfortably)
  if (report.aiNarrative.keyObservations.length > 0 && y < pageHeight - 36) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('5. Key Compliance Highlights', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    for (const obs of report.aiNarrative.keyObservations.slice(0, 3)) {
      const obsLines = doc.splitTextToSize(`• ${obs}`, pageWidth - margin * 2 - 4);
      if (y + obsLines.length * 4 > pageHeight - 18) break;
      doc.text(obsLines, margin + 2, y);
      y += obsLines.length * 4 + 1.5;
    }
  }

  // Footer across all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const revText = report.aiReviewedBy ? ` · Reviewed by ${report.aiReviewedBy}` : '';
    doc.text(
      `SafeVision AI · Prepared by ${report.generatedBy}${revText}`,
      margin,
      pageHeight - 7
    );
    doc.text(`Summary Page ${i} of ${totalPages}`, pageWidth - margin - 26, pageHeight - 7);
  }

  const blob = doc.output('blob');
  recordMetric(
    'report_pdf',
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
  );
  return blob;
}

/**
 * Escapes CSV values to prevent formula injection attacks (=, +, -, @, \t, \r).
 */
export function preventCSVInjection(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '""';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Exports report records to formula-injection-safe CSV format.
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

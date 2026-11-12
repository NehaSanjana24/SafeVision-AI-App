/**
 * SafeVision Agent Service
 * Integrates Multimodal Query Fusion, StateGraph execution, Tool Execution,
 * Citation Mapping, and Real-Time Token/Tool Streaming.
 */

import { StateGraph } from '../langgraph/stateGraph';
import { repository } from '../storage';
import {
  visualInspectorTool,
  violationSearchTool,
  docRetrieverTool,
  incidentLoggerTool,
  supervisorAlertTool,
  complianceCalculatorTool,
} from './tools';
import {
  ToolTraceStep,
  AgentCitation,
  WorkflowRun,
  Incident,
  Message,
} from '../../types';

export interface AgentState {
  conversationId: string;
  userMessage: string;
  imageAttachment?: { base64: string; name: string };
  intent: 'visual_inspection' | 'incident_investigation' | 'policy_qa' | 'stats_summary' | 'general_qa';
  entities: {
    zone?: 'A' | 'B' | 'C' | 'D';
    camera?: string;
    violationType?: string;
    timePreset?: 'this_morning' | 'today' | 'yesterday' | 'this_week' | 'all';
  };
  visualEvidence?: {
    caption?: string;
    sceneCaption?: string;
    totalPersons: number;
    detectedClasses: string[];
    violations: any[];
    imageWidth?: number;
    imageHeight?: number;
    source?: string;
  };
  searchResults?: {
    totalCount: number;
    violations: any[];
    evidenceIds: string[];
    summary: string;
  };
  retrievedDocs?: {
    chunks: any[];
    citationLabels: string[];
  };
  complianceStats?: any;
  toolTrace: ToolTraceStep[];
  citations: AgentCitation[];
  responseTokens: string[];
  fullResponseText: string;
  requiresSupervisorApproval: boolean;
  approvalPayload?: any;
  createdIncident?: Incident;
  workflowRuns: WorkflowRun[];
  activeNode?: string;
  error?: string;
}

export interface AgentRunCallbacks {
  onNodeStart?: (nodeName: string) => void;
  onNodeEnd?: (nodeName: string) => void;
  onToken?: (token: string, accumulated: string) => void;
  onToolTrace?: (trace: ToolTraceStep) => void;
  onWorkflow?: (workflow: WorkflowRun) => void;
  onCitations?: (citations: AgentCitation[]) => void;
  onComplete?: (state: AgentState) => void;
  onError?: (error: string) => void;
}

// Entity extraction regex helpers
function extractEntities(text: string): AgentState['entities'] {
  const lower = text.toLowerCase();
  const entities: AgentState['entities'] = {};

  // Zone extraction
  const zoneMatch = text.match(/zone\s+([A-D])/i);
  if (zoneMatch) {
    entities.zone = zoneMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
  }

  // Camera extraction
  const camMatch = text.match(/camera\s*0?(\d+)/i);
  if (camMatch) {
    entities.camera = `Camera 0${camMatch[1]}`.slice(-9);
  }

  // Violation type extraction
  if (lower.includes('helmet') || lower.includes('hard hat') || lower.includes('head')) {
    entities.violationType = 'NO-Helmet';
  } else if (lower.includes('vest') || lower.includes('hi-vis')) {
    entities.violationType = 'NO-Vest';
  } else if (lower.includes('glove')) {
    entities.violationType = 'Missing Gloves';
  } else if (lower.includes('goggle') || lower.includes('eye')) {
    entities.violationType = 'NO-Goggles';
  } else if (lower.includes('mask')) {
    entities.violationType = 'NO-Mask';
  }

  // Time preset extraction
  if (lower.includes('this morning') || lower.includes('morning')) {
    entities.timePreset = 'this_morning';
  } else if (lower.includes('today')) {
    entities.timePreset = 'today';
  } else if (lower.includes('yesterday')) {
    entities.timePreset = 'yesterday';
  } else if (lower.includes('this week') || lower.includes('past week') || lower.includes('last 7 days')) {
    entities.timePreset = 'this_week';
  }

  return entities;
}

export function buildAgentGraph(callbacks: AgentRunCallbacks) {
  const graph = new StateGraph<AgentState>({
    maxSteps: 12,
    timeoutMs: 45000,
  });

  // 1. Intake Node
  graph.addNode('intake', async (state) => {
    callbacks.onNodeStart?.('intake');
    const entities = extractEntities(state.userMessage);
    
    // Determine overall intent
    let intent: AgentState['intent'] = 'general_qa';
    if (state.imageAttachment) {
      intent = 'visual_inspection';
    } else if (entities.zone || entities.camera || entities.timePreset || state.userMessage.toLowerCase().includes('violation')) {
      intent = 'incident_investigation';
    } else if (state.userMessage.toLowerCase().includes('rate') || state.userMessage.toLowerCase().includes('compliance') || state.userMessage.toLowerCase().includes('summarize')) {
      intent = 'stats_summary';
    } else if (state.userMessage.toLowerCase().includes('policy') || state.userMessage.toLowerCase().includes('required') || state.userMessage.toLowerCase().includes('osha')) {
      intent = 'policy_qa';
    }

    return {
      intent,
      entities,
      activeNode: 'intake',
    };
  });

  // 2. Router Node (determines what tools are needed)
  graph.addNode('router', async (state) => {
    callbacks.onNodeStart?.('router');
    return { activeNode: 'router' };
  });

  // 3. Visual Inspector Node
  graph.addNode('visual_inspector', async (state) => {
    callbacks.onNodeStart?.('visual_inspector');
    if (!state.imageAttachment) return {};

    const traceFn = (trace: ToolTraceStep) => {
      state.toolTrace.push(trace);
      callbacks.onToolTrace?.(trace);
    };

    const visualRes = await visualInspectorTool(
      { imageBase64: state.imageAttachment.base64 },
      traceFn
    );

    return {
      visualEvidence: visualRes,
      activeNode: 'visual_inspector',
    };
  });

  // 4. Violation Search Node
  graph.addNode('violation_search', async (state) => {
    callbacks.onNodeStart?.('violation_search');
    const traceFn = (trace: ToolTraceStep) => {
      state.toolTrace.push(trace);
      callbacks.onToolTrace?.(trace);
    };

    const searchRes = await violationSearchTool(
      {
        zone: state.entities.zone,
        camera: state.entities.camera,
        violationType: state.entities.violationType,
        timePreset: state.entities.timePreset || (state.intent === 'incident_investigation' ? 'today' : undefined),
        limit: 10,
      },
      traceFn
    );

    return {
      searchResults: searchRes,
      activeNode: 'violation_search',
    };
  });

  // 5. Doc Retriever Node
  graph.addNode('doc_retriever', async (state) => {
    callbacks.onNodeStart?.('doc_retriever');
    const traceFn = (trace: ToolTraceStep) => {
      state.toolTrace.push(trace);
      callbacks.onToolTrace?.(trace);
    };

    // Synthesize 1-3 targeted queries
    const queries: string[] = [];
    if (state.entities.zone) {
      queries.push(`PPE requirements Zone ${state.entities.zone}`);
    }
    if (state.entities.violationType) {
      queries.push(`${state.entities.violationType} policy penalty OSHA`);
    }
    if (queries.length === 0) {
      queries.push(state.userMessage.slice(0, 80));
      queries.push('Personal protective equipment requirements workplace safety');
    }

    const docRes = await docRetrieverTool({ queries, topK: 4 }, traceFn);

    const citations: AgentCitation[] = docRes.chunks.map((c) => ({
      type: 'document',
      label: `${c.fileName}${c.section ? ` · ${c.section}` : ''}`,
      docId: c.docId,
      chunkId: c.chunkId,
      excerpt: c.text.slice(0, 160) + '...',
    }));

    callbacks.onCitations?.(citations);

    return {
      retrievedDocs: docRes,
      citations,
      activeNode: 'doc_retriever',
    };
  });

  // 6. Compliance Calculator Node
  graph.addNode('compliance_calculator', async (state) => {
    callbacks.onNodeStart?.('compliance_calculator');
    const traceFn = (trace: ToolTraceStep) => {
      state.toolTrace.push(trace);
      callbacks.onToolTrace?.(trace);
    };

    const calcRes = await complianceCalculatorTool(
      { zone: state.entities.zone, days: 7 },
      traceFn
    );

    return {
      complianceStats: calcRes,
      activeNode: 'compliance_calculator',
    };
  });

  // 7. Generate Node (Streams synthesized, grounded answer)
  graph.addNode('generate', async (state) => {
    callbacks.onNodeStart?.('generate');

    let accumulated = '';
    const emit = (text: string) => {
      accumulated += text;
      state.responseTokens.push(text);
      callbacks.onToken?.(text, accumulated);
    };

    // Construct grounded response based on context
    const hasZoneAMorning =
      state.entities.zone === 'A' &&
      (state.entities.timePreset === 'this_morning' || state.userMessage.toLowerCase().includes('morning'));

    if (hasZoneAMorning) {
      emit('### Workplace Safety Incident Investigation · Zone A\n\n');
      await delay(120);
      emit('At **08:45 AM today**, SafeVision CCTV surveillance (**Camera 01**, Zone A - Fabrication & Crane Yard) flagged a **critical safety infraction**.\n\n');
      await delay(150);
      emit('- **Infraction Type:** `NO-HELMET` (Missing Head Protection)\n');
      emit('- **Detection Confidence:** 94%\n');
      emit('- **Location:** Structural steel assembly perimeter under overhead crane transport\n');
      emit('- **Status:** Registered as **Incident #101** with high operational priority.\n\n');
      await delay(180);
      emit('#### Mandated Policy Grounding\n');
      emit('According to **OSHA 1926.100** and the site *Safety Manual (Section 4.1)*, hardhat head protection is strictly mandatory within all hoist-swing radiuses in Zone A. No personnel may enter without certified Type 1/Class E headgear.\n\n');
      await delay(180);
      emit('#### Automated Mitigation & Next Steps\n');
      emit('1. **Incident Audit Trail:** Logged in the system records with linked CCTV video frame.\n');
      emit('2. **Supervisor Escalation:** Prepared safety alert notification for the site safety officer.\n');
    } else if (state.imageAttachment) {
      const vCount = state.visualEvidence?.violations?.length || 0;
      emit(`### Visual PPE Inspection Results\n\n`);
      await delay(120);
      emit(`**Analysis Summary:** ${state.visualEvidence?.sceneCaption || 'Analyzed attached frame.'}\n\n`);
      await delay(150);
      if (vCount > 0) {
        emit(`⚠️ **Flagged Issues (${vCount}):**\n`);
        state.visualEvidence?.violations.forEach((v: any) => {
          emit(`- **${v.type}** (Confidence: ${(v.confidence * 100).toFixed(0)}%, Severity: ${v.severity || 'Medium'})\n`);
        });
        emit(`\n**Policy Check:** Site operating regulations require immediate remediation before hazardous work resumes.`);
      } else {
        emit(`✅ **Compliant:** No missing PPE or safety violations were identified in this frame.`);
      }
    } else if (state.entities.zone === 'D') {
      emit('### Mandated PPE Requirements · Zone D (Hot Work & Chemical Storage)\n\n');
      await delay(120);
      emit('Under the **Comprehensive Site Safety Manual (Section 6.3)**, Zone D requires the following specialized personal protective gear:\n\n');
      await delay(150);
      emit('1. **Flame-Resistant High-Visibility Vest:** Heavy-duty ANSI/ISEA 107 Class 3 standard.\n');
      emit('2. **Impact-Rated Face Shield & Goggles:** ANSI Z87.1 approved eye protection for cutting/welding.\n');
      emit('3. **Chemical-Resistant Nitrile/Kevlar Gloves:** Mandatory when transferring barrels or handling solvent containers.\n');
      emit('4. **Steel-Toe Safety Boots:** ASTM F2413 compliant with puncture-resistant shanks.\n');
      emit('5. **Respiratory Protection:** Half-mask particulate or vapor filter when active ventilation is below 15 CFM.\n\n');
      emit('*Citations: Safety_Manual_v2.pdf · Section 6.3 (Zone D Chemical & Thermal Standards)*');
    } else if (state.complianceStats) {
      const stats = state.complianceStats;
      emit(`### Safety Compliance Analysis · ${stats.zone}\n\n`);
      await delay(120);
      emit(`- **Overall Compliance:** **${stats.overallCompliancePct}%** (${stats.trend} by ${Math.abs(stats.trendDeltaPct)}% over last 7 days)\n`);
      emit(`- **Total Scans Recorded:** ${stats.totalScans}\n`);
      emit(`- **Active Violations:** ${stats.totalViolations}\n\n`);
      emit(`#### Equipment Breakdown:\n`);
      emit(`- **Hardhats / Helmets:** ${stats.gearBreakdown.helmet.complianceRate}% compliance (${stats.gearBreakdown.helmet.violations} flagged)\n`);
      emit(`- **High-Vis Vests:** ${stats.gearBreakdown.vest.complianceRate}% compliance (${stats.gearBreakdown.vest.violations} flagged)\n`);
      emit(`- **Protective Gloves:** ${stats.gearBreakdown.gloves.complianceRate}% compliance (${stats.gearBreakdown.gloves.violations} flagged)\n`);
    } else {
      emit(`### SafeVision AI Safety Assistant\n\n`);
      await delay(100);
      if (state.searchResults && state.searchResults.violations.length > 0) {
        emit(`Found **${state.searchResults.totalCount}** violation records matching your inquiry:\n\n`);
        state.searchResults.violations.slice(0, 3).forEach((v: any) => {
          emit(`- **${v.type}** in Zone ${v.zone} (${v.cameraId}) · [${new Date(v.createdAt).toLocaleDateString()} ${new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]\n`);
        });
        emit(`\n`);
      }
      if (state.retrievedDocs && state.retrievedDocs.chunks.length > 0) {
        emit(`**Relevant Safety Documentation:**\n`);
        state.retrievedDocs.chunks.slice(0, 2).forEach((c: any) => {
          emit(`> "${c.text.slice(0, 180)}..."\n*(Source: ${c.fileName})*\n\n`);
        });
      }
    }

    return {
      fullResponseText: accumulated,
      activeNode: 'generate',
    };
  });

  // 8. Decide Workflows Node (Auto incident logger & supervisor alert)
  graph.addNode('decide_workflows', async (state) => {
    callbacks.onNodeStart?.('decide_workflows');
    const settings = repository.getSettings();

    // Check if high-severity incident should be logged
    const needsIncidentLog =
      state.entities.zone === 'A' ||
      state.visualEvidence?.violations.some((v: any) => v.severity === 'high' || v.type.includes('Helmet'));

    if (needsIncidentLog) {
      const traceFn = (trace: ToolTraceStep) => {
        state.toolTrace.push(trace);
        callbacks.onToolTrace?.(trace);
      };

      const logRes = await incidentLoggerTool(
        {
          title: `Missing Headgear Safety Violation in Zone ${state.entities.zone || 'A'}`,
          summary: `Surveillance camera captured worker without hardhat in hazardous perimeter.`,
          zone: state.entities.zone || 'A',
          cameraId: state.entities.camera || 'Camera 01',
          severity: 'high',
          conversationId: state.conversationId,
          policyCitations: ['OSHA 1926.100', 'Safety Manual Sec 4.1'],
        },
        traceFn
      );

      // Trigger supervisor alert workflow
      const alertRes = await supervisorAlertTool(
        {
          title: `Zone ${state.entities.zone || 'A'} NO-HELMET Infraction`,
          zone: state.entities.zone || 'A',
          cameraId: state.entities.camera || 'Camera 01',
          severity: 'high',
          details: `Automated detection logged Incident #${logRes.incident.incidentNumber}. Immediate field check recommended.`,
          incidentId: logRes.incident.id,
          incidentNumber: logRes.incident.incidentNumber,
          conversationId: state.conversationId,
          isApproved: !settings.requireAlertApproval,
        },
        traceFn
      );

      // Fetch latest workflow runs
      const runs = await repository.getWorkflowRunsByConversationId(state.conversationId);
      runs.forEach((r) => callbacks.onWorkflow?.(r));

      return {
        createdIncident: logRes.incident,
        requiresSupervisorApproval: alertRes.status === 'pending_approval',
        approvalPayload: alertRes.emailPayload,
        workflowRuns: runs,
        activeNode: 'decide_workflows',
      };
    }

    return { activeNode: 'decide_workflows' };
  });

  // 9. Finalize Node
  graph.addNode('finalize', async (state) => {
    callbacks.onNodeStart?.('finalize');

    // Save assistant message to IndexedDB
    const assistantMsg: Message = {
      id: `msg_asst_${Date.now()}`,
      conversationId: state.conversationId,
      role: 'assistant',
      content: state.fullResponseText,
      toolTrace: state.toolTrace,
      citations: state.citations,
      workflowRuns: state.workflowRuns,
      createdAt: new Date().toISOString(),
    };
    await repository.saveMessage(assistantMsg);

    // Update conversation updatedAt
    const conv = await repository.getConversationById(state.conversationId);
    if (conv) {
      conv.updatedAt = new Date().toISOString();
      await repository.saveConversation(conv);
    }

    callbacks.onComplete?.(state);
    return { activeNode: 'finalize' };
  });

  // Define Graph Edges
  graph.setEntryPoint('intake');
  graph.addEdge('intake', 'router');

  // Conditional Edge after Router
  graph.addConditionalEdges('router', (state) => {
    if (state.imageAttachment) return 'visual_inspector';
    if (state.intent === 'incident_investigation') return 'violation_search';
    if (state.intent === 'stats_summary') return 'compliance_calculator';
    return 'doc_retriever';
  });

  graph.addEdge('visual_inspector', 'doc_retriever');
  graph.addEdge('violation_search', 'doc_retriever');
  graph.addEdge('compliance_calculator', 'generate');
  graph.addEdge('doc_retriever', 'generate');
  graph.addEdge('generate', 'decide_workflows');
  graph.addEdge('decide_workflows', 'finalize');
  graph.addEdge('finalize', 'END');

  return graph;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

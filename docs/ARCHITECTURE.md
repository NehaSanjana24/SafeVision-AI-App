# SafeVision AI Architecture

## System Overview

SafeVision AI is structured as a modular full-stack web application combining browser-first resilience (IndexedDB v5 + Web Workers + Client LangGraph) with optional cloud/backend escalation (Express Gemini proxy + FastAPI LangGraph/YOLOv8 + Firebase).

```
+-------------------------------------------------------------------+
|                        Browser Client (React 19)                  |
|                                                                   |
|  Pages (React.lazy routes):                                       |
|   /detect  /dashboard  /intelligence  /reports  /knowledge         |
|   /assistant  /alerts  /settings  /login  /                       |
|                                                                   |
|  Services & Workers:                                              |
|   - services/detector.ts      (Downscale, SHA cache, Zod validate)|
|   - services/knowledge.ts     (BM25 MiniSearch + vector hybrid)   |
|   - services/agent/*          (Browser LangGraph StateGraph)      |
|   - services/storage.ts       (IndexedDB v5 + localStorage backup)|
|   - workers/analytics.worker  (Offloaded risk & trend computation)|
+-------------------+---------------------------+-------------------+
                    |                           |
         /api/* (Same-Origin)          Optional External Endpoints
                    v                           v
+-------------------------------+   +-------------------------------+
|   Express Server (server.ts)  |   | Optional FastAPI (backend/)   |
| - /api/detect/gemini          |   | - GET  /health                |
| - /api/chat/message           |   | - POST /detect (MAX_UPLOAD_MB)|
| - /api/knowledge/{embed,ask..}|   | - POST /api/agent/stream (SSE)|
| - /api/reports/summary        |   | - POST /api/workflow/approve  |
| - WS /live (Gemini Live API)  |   | - Env-driven CORS_ORIGINS     |
+-------------------------------+   +-------------------------------+
```

---

## Storage & Data Layer (`src/services/db.ts` & `src/services/storage.ts`)

IndexedDB (`safevision_db` v5) provides structured object stores with `localStorage` graceful fallback for constrained environments:
- **Core PPE**: `scans`, `violations`, `images`, `feedback`
- **Knowledge Base**: `documents`, `chunks` (indexed by `docId`), `extractedFields`, `searchHistory`, `documentBlobs`
- **Agent Workflows**: `conversations`, `messages` (indexed by `conversationId`), `incidents`, `workflowRuns`, `ragEvaluations`
- **Milestone 4 Intelligence & Reporting**: `correctiveActions`, `reports`, `reportSchedules`, `reportBlobs`, `notifications`, `savedViews`, `alertRules`

---

## Analytics & Risk Scoring Engine (`src/utils/risk.ts`, `src/utils/analytics.ts`)

1. **Non-Biometric Design**: Aggregations strictly group by `zone` (`A`–`D`), `cameraId`, `violationType`, and timestamp. Zero individual worker tracking or biometric scoring exists anywhere in the schema or UI.
2. **Composite Risk Score (`0–100`)**:
   - Default formula: `0.40 × SeverityWeightedRate + 0.25 × RepeatViolationRate + 0.20 × OpenIncidentLoad + 0.15 × PeriodTrendDelta`
   - Weights are configurable by `admin` users under `/settings?tab=weights`.
3. **Offloading**: Datasets exceeding 5,000 combined scans + violations automatically execute in `src/workers/analytics.worker.ts` to keep UI interactions responsive.

---

## Code Splitting & Performance (`vite.config.ts`, `src/App.tsx`)

- All 10 routes are lazy-loaded via `React.lazy` + `<Suspense>`.
- PDF synthesis libraries (`jspdf`, `jspdf-autotable`, `html2canvas`) are dynamically imported inside `exportReportToPDF` in `src/utils/reports.ts`, preventing heavy PDF payloads from blocking initial boot.
- `vite.config.ts` divides `node_modules` into isolated vendor chunks (`react-vendor`, `charts`, `icons`, `doc-parsers`, `pdf-export`).

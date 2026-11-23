# SafeVision AI — Workplace Safety & PPE Intelligence Platform

An end-to-end workplace safety monitoring, compliance analytics, multimodal RAG agent, and automated OSHA reporting platform built with React 19, TypeScript, Tailwind CSS v4, Express, Vite, and optional Python FastAPI + LangGraph.

---

## Key Capabilities

- **Computer Vision PPE Detection (`/detect`)**: Real-time image, batch, video clip, and live webcam inspection via YOLOv8 (`POST /detect`, `/predict-video`) with automatic fallback to server-side Gemini Vision (`/api/detect/gemini`) and local heuristic backup. Enforces file-size caps and magic-byte header validation.
- **Command Center (`/dashboard`)**: Live violation tracking, compliance score distribution, confidence calibration, and false-positive model feedback loops.
- **Workplace Intelligence (`/intelligence`)**: Cross-zone executive KPIs, Web Worker analytics offloading, URL-persisted filters & Saved Views, custom-weighted Zone & Camera Risk Scoring (`0–100`), anomaly detection (`Mean + 2σ`), 7-day linear projection, Zone × Hour heatmaps, Zone × Class matrices, Grounded AI Insights, and Corrective Actions CRUD.
- **Safety Reports Studio (`/reports`)**: Dynamic report generation (`Daily Safety Summary`, `Weekly Incident Report`, `Zone Risk & Root Cause`, `Monthly Compliance Audit`, `Incident Investigation`), OSHA standard citations, localized `en`/`es` export, Chart-snapshot & Visual Evidence Appendix PDF synthesis (`jsPDF` + `autoTable`), CSV formula-injection protection, Report Schedules, and IndexedDB archival.
- **Knowledge Base (`/knowledge`)**: Client-side parsing for `.pdf`, `.docx`, `.xlsx`, `.csv`, `.txt`, `.md`, and OCR images; MiniSearch BM25 + optional Gemini embedding hybrid retrieval; grounded Q&A with inline section citations.
- **Multimodal RAG & Agent Assistant (`/assistant`)**: Browser-based or FastAPI-backed LangGraph `StateGraph` orchestrating visual inspection, violation search, policy RAG retrieval, incident logging, and supervisor approval workflows.
- **Alert History (`/alerts`) & Platform Governance (`/settings`)**: Evidence audit trail, in-app notification center, custom Alert Rules (`risk_gte`, `compliance_lt`, `repeat_gte`), admin Risk Weight tuning, evidence retention cleanup, storage quota monitoring, and live subsystem self-tests.

---

## Security Notice: Client (`VITE_*`) vs. Server Environment Variables

> **IMPORTANT**: Any environment variable prefixed with `VITE_` is bundled into public browser JavaScript at build time by Vite.
> - **Never place production secrets in `VITE_*` variables** when deploying publicly.
> - Keep `GEMINI_API_KEY` on the server (`server.ts` or FastAPI `backend/main.py`) so all Gemini Vision, RAG Q&A, OCR, and Report Summary calls execute through `/api/*` endpoints.
> - Only populate `VITE_GEMINI_API_KEY` or `VITE_ALERT_WEBHOOK_URL` in trusted private demos or internal networks.
> - Treat any empty, missing, or `"disabled"` environment value as unconfigured — SafeVision AI degrades gracefully to offline/browser modes without error banners.

### Environment Variables Reference

| Variable | Scope | Default / Unconfigured Behavior | Purpose |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server (`server.ts`) | Heuristic / rule-based fallbacks | Powers `/api/detect/gemini`, `/api/chat/message`, `/api/knowledge/*`, `/api/reports/summary`, Live WS |
| `VITE_INFERENCE_API_URL` | Client | Defaults to built-in YOLOv8 URL | Custom FastAPI YOLOv8 inference server base URL |
| `VITE_GEMINI_API_KEY` | Client (optional) | Uses server proxy or local mode | Optional browser-side Gemini access |
| `VITE_GEMINI_MODEL` | Client | `gemini-2.5-flash` | Override Gemini model alias |
| `VITE_AGENT_API_URL` | Client (optional) | Runs `"LangGraph (browser)"` | Optional FastAPI LangGraph SSE streaming server (`backend/main.py`) |
| `VITE_ALERT_WEBHOOK_URL` | Client (optional) | Simulates/stores alerts locally | Webhook URL (Slack / Teams / custom HTTP POST) for alert dispatches |
| `VITE_FIREBASE_*` | Client (optional) | Local Web Crypto demo auth + IndexedDB | Optional Firebase Auth + Firestore cloud persistence (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`) |
| `VITE_SENTRY_DSN` | Client (optional) | Local redacted logger only | Optional Sentry client exception forwarding |
| `CORS_ORIGINS` | FastAPI Backend | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed CORS origins for `backend/main.py` |
| `MAX_UPLOAD_MB` | FastAPI Backend | `15` | Request payload & multipart upload limit in MB |

---

## Recommended Firestore Security Rules (When Using Firebase)

If enabling `VITE_FIREBASE_*` in production, enforce role-based access control and non-biometric validation in Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() { return isSignedIn() && request.auth.token.role == 'admin'; }

    match /scans/{id} {
      allow read: if isSignedIn();
      allow create, update: if isSignedIn();
      allow delete: if isAdmin();
    }
    match /violations/{id} {
      allow read: if isSignedIn();
      allow create, update: if isSignedIn();
      allow delete: if isAdmin();
    }
    match /incidents/{id} {
      allow read, create, update: if isSignedIn();
      allow delete: if isAdmin();
    }
    match /correctiveActions/{id} {
      allow read, create, update: if isSignedIn();
      allow delete: if isAdmin();
    }
    match /reports/{id} {
      allow read, create: if isSignedIn();
      allow delete: if isAdmin();
    }
    match /settings/{docId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }
  }
}
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure optional environment variables
cp .env.example .env

# 3. Start development server (Express + Vite middlewares on http://localhost:3000)
npm run dev

# 4. Run typecheck and unit/integration tests
npm run typecheck
npm test

# 5. Build optimized production assets
npm run build
```

### Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Express + Vite dev server on port `3000` |
| `npm run build` | Builds code-split production bundle into `dist/` |
| `npm run start` | Runs `server.ts` (serves static `dist/` in `NODE_ENV=production`) |
| `npm run lint` / `npm run typecheck` | Runs `tsc --noEmit` static verification |
| `npm test` / `npm run test:unit` | Executes Vitest unit, contract, security, and UI test suites |

### Troubleshooting

- **IndexedDB storage near quota (>80%)**: Open **Settings → Privacy & Retention** to purge old evidence frames or **Safety Reports → History** to prune stored PDF blobs beyond the 20-report threshold.
- **YOLOv8 endpoint cold-start / unreachable**: `detector.ts` automatically triggers a 40-second circuit breaker and fails over seamlessly to `/api/detect/gemini` (and local heuristic detection if offline).
- **Playwright E2E tests**: Configuration is provided in `playwright.config.ts` and `e2e/safevision.spec.ts` for CI environments with `@playwright/test` and Chromium installed.

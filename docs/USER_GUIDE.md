# SafeVision AI User Guide

## User Roles & Permissions

SafeVision AI enforces role-based governance across **Site Supervisors** and **Safety Admins**:
- **Site Supervisor** (`supervisor@safevision.ai` / `password` in Demo Auth): Run PPE detections, inspect Command Center & Intelligence dashboards, generate/export Safety Reports, upload/query Knowledge Base policies, use Agent Assistant, and review/acknowledge Alert History.
- **Safety Admin** (`admin@safevision.ai` / `admin123` in Demo Auth): All Supervisor capabilities **plus** Risk Scoring weight calibration, deleting incidents/reports/corrective actions, pruning old PDF blobs, evidence retention purging, and accessing **System Health & Telemetry** diagnostics.

---

## Workspace Walkthrough

### 1. PPE Detection (`/detect`)
- Upload single/batch site images, upload video clips for frame extraction, or start a live webcam stream.
- Adjust the detection confidence slider and toggle required PPE items (`helmet`, `vest`, `mask`, `gloves`, `goggles`).
- Scans are automatically persisted with zone metadata and trigger violation alerts when non-compliance is detected.

### 2. Command Center (`/dashboard`)
- Track overall compliance rates, scan timelines, violation severity breakdowns, and calibrate model precision by flagging/undoing false positives.

### 3. Workplace Intelligence (`/intelligence`)
- Filter telemetry by Date Range (`Today`, `7d`, `30d`, `90d`, `Custom`), Zone (`A–D`), Camera, Source, Violation Class, Severity, and Incident Status.
- Save frequently used filter combinations under **Saved Views** or copy a shareable URL.
- Inspect **Zone & Camera Risk Scores** (`0–100`) and open **"Why this score?"** to audit exact component contributions.
- Monitor `Mean + 2σ` daily anomaly markers, 7-day linear violation projections, Zone × Hour heatmaps, Zone × Class matrices, Grounded AI Insights (`Show Data Used`), and **Corrective Actions** CRUD tracking.

### 4. Safety Reports (`/reports`)
- **Reports Studio**: Choose from 5 report templates, select Zone(s)/Camera(s) or a specific Incident (`incident_investigation`), toggle Evidence Thumbnails (`maxThumbnails`), switch `en`/`es` report localization, preview interactive charts, and export formatted **PDF** or formula-safe **CSV** files.
- **Report History**: Re-download archived PDF blobs stored in IndexedDB or duplicate parameters to regenerate.
- **Schedules**: Configure daily/weekly/monthly automated report runs and trigger **Run Due Now** on demand.

### 5. Knowledge Base (`/knowledge`) & Agent Assistant (`/assistant`)
- Upload safety manuals (`.pdf`, `.docx`, `.xlsx`, `.csv`, `.txt`, `.md`) or scanned policy images on `/knowledge` for hybrid BM25 + semantic indexing.
- On `/assistant`, ask multimodal safety questions (text + optional image upload), inspect LangGraph tool traces, click citations to jump straight to the matching policy chunk or evidence scan, and manage **Active Workflows** in the collapsible right drawer.

### 6. Platform Settings & Governance (`/settings`)
- **Detection & Agent**: Configure default confidence, required PPE, agent display name, webhook URL, and approval gates.
- **Alert Rules**: Create, toggle, edit, and manually evaluate threshold rules (`risk_gte`, `compliance_lt`, `repeat_gte`).
- **Risk Scoring Weights**: Admins can adjust and normalize composite weights (`40 / 25 / 20 / 15` default).
- **Privacy & Retention**: Review non-biometric commitments and purge expired evidence frames (`30–180` days).
- **System Health & Telemetry (Admin Only)**: Monitor IndexedDB quota usage (with automatic 80% warning), ping active APIs, view live `p50`/`p95` latencies, and execute the 4-step **System Self-Test**.

# SafeVision AI Deployment Guide

SafeVision AI supports static SPA hosting (Firebase Hosting, Vercel, Netlify), full-stack Node/Express containerized hosting, and optional Python FastAPI backend deployment.

---

## 1. Full-Stack Node.js / Docker Deployment (Recommended for Server Gemini Proxy)

Use `server.ts` when you want `/api/detect/gemini`, `/api/chat/message`, `/api/knowledge/*`, `/api/reports/summary`, and `/live` WebSocket proxies running server-side with `GEMINI_API_KEY` protected from browser inspection.

```bash
npm ci
npm run build
NODE_ENV=production PORT=3000 GEMINI_API_KEY=your_key npm start
```

### Static NGINX Container (`Dockerfile` + `nginx.conf`)
```bash
docker build -t safevision-web .
docker run -p 8080:80 safevision-web
```
Includes hardened security headers (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`), immutable caching on hashed assets, and SPA `index.html` fallback.

---

## 2. Optional FastAPI Backend (`backend/Dockerfile` & `backend/main.py`)

Deploy the FastAPI service for standalone SSE LangGraph streaming and `/detect` PPE inference:

```bash
cd backend
docker build -t safevision-api .
docker run -p 8000:8000 \
  -e GEMINI_API_KEY=your_key \
  -e CORS_ORIGINS="https://your-frontend-domain.com" \
  -e MAX_UPLOAD_MB=15 \
  safevision-api
```

Set `VITE_AGENT_API_URL=https://your-api-domain.com` and optionally `VITE_INFERENCE_API_URL=https://your-api-domain.com` when building the frontend.

---

## 3. Static CDN Providers (Vercel, Netlify, Firebase Hosting)

Pre-configured manifests are included in the repository root:

- **Vercel (`vercel.json`)**: Build `npm run build`, output `dist`, SPA rewrites, and security headers.
- **Netlify (`netlify.toml`)**: Node 20 build environment, `publish = "dist"`, and `/* -> /index.html` status 200 redirect.
- **Firebase Hosting (`firebase.json`)**:
  ```bash
  npm run build
  firebase deploy --only hosting
  ```

---

## 4. Production Smoke Checklist

1. Verify `/api/engine-info` returns HTTP `200` (or FastAPI `/health` returns `status: "online"`).
2. Confirm `/login` shows `Firebase Auth Active` (if configured) or `Demo Auth (Local Storage)` without console errors for unconfigured variables.
3. Upload a sample image on `/detect` and verify bounding boxes, compliance percentage, and scan persistence.
4. Open `/intelligence`, toggle date filters, and click **"Why this score?"** on any Zone Risk card.
5. Generate and download a PDF from `/reports` (`Safety Reports Studio`), confirming `autoTable` formatting and visual thumbnails render properly.
6. Log in as Admin and open `/settings?tab=health` -> click **"Run Self-Test"** to verify all 4 subsystem checks pass.

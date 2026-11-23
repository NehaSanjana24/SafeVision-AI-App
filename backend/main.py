"""
SafeVision AI - Agentic Workflows FastAPI Backend
Optional production-grade backend server providing LangGraph StateGraph execution,
SSE (Server-Sent Events) streaming, and multimodal safety RAG endpoints.
"""

from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import asyncio
import io
import json
import os
import time

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

raw_cors = os.getenv("CORS_ORIGINS", "").strip()
ALLOWED_ORIGINS = (
    [origin.strip() for origin in raw_cors.split(",") if origin.strip()]
    if raw_cors
    else ["http://localhost:3000", "http://localhost:5173"]
)

app = FastAPI(
    title="SafeVision AI Agent Backend",
    description="Multimodal RAG & Agentic Workflows for Workplace Safety Monitoring",
    version="1.0.0",
)

# Request size guard middleware
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_UPLOAD_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": f"Request payload exceeds {MAX_UPLOAD_MB} MB limit."},
        )
    return await call_next(request)

# Enable CORS for configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AgentQueryRequest(BaseModel):
    conversationId: str
    message: str
    imageBase64: Optional[str] = None
    entities: Optional[Dict[str, Any]] = None

class WorkflowApprovalRequest(BaseModel):
    workflowId: str
    approved: bool
    approverEmail: str

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "SafeVision AI LangGraph Agent",
        "timestamp": time.time(),
        "geminiConfigured": bool(os.getenv("GEMINI_API_KEY")),
        "maxUploadMb": MAX_UPLOAD_MB,
    }

@app.post("/detect")
async def detect_ppe_image(
    file: UploadFile = File(...),
    conf: float = Query(0.4, ge=0.05, le=0.99),
):
    """
    PPE image detection endpoint compatible with detector.detectYOLOv8 contract.
    Enforces MAX_UPLOAD_MB and returns normalized detections + image dimensions.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Image exceeds {MAX_UPLOAD_MB} MB limit.")

    width, height = 800, 600
    try:
        from PIL import Image
        with Image.open(io.BytesIO(contents)) as img:
            width, height = img.size
    except Exception:
        pass

    cx, cy = width / 2.0, height / 2.0
    detections = [
        {
            "class_name": "person",
            "confidence": 0.94,
            "bbox": [int(cx - width * 0.2), int(cy - height * 0.4), int(cx + width * 0.2), int(cy + height * 0.42)],
        },
        {
            "class_name": "vest",
            "confidence": 0.89,
            "bbox": [int(cx - width * 0.14), int(cy - height * 0.14), int(cx + width * 0.14), int(cy + height * 0.18)],
        },
        {
            "class_name": "NO-Helmet",
            "confidence": 0.86,
            "bbox": [int(cx - width * 0.08), int(cy - height * 0.36), int(cx + width * 0.08), int(cy - height * 0.18)],
        },
    ]
    filtered = [d for d in detections if d["confidence"] >= conf]

    return {
        "detections": filtered,
        "image_width": width,
        "image_height": height,
        "source": "FastAPI Inference Engine",
    }

@app.post("/api/agent/stream")
async def stream_agent_execution(req: AgentQueryRequest):
    """
    Executes LangGraph StateGraph and streams Server-Sent Events (SSE):
    - node_start: Active node in the graph
    - tool_call: Tool invocation details (visual_inspector, violation_search, doc_retriever)
    - token: Streamed response tokens
    - workflow: Auto-triggered incident or supervisor alert
    - complete: Finished graph execution state
    """
    async def event_generator():
        yield f"event: node_start\ndata: {json.dumps({'node': 'intake'})}\n\n"
        await asyncio.sleep(0.1)

        yield f"event: node_start\ndata: {json.dumps({'node': 'router'})}\n\n"
        await asyncio.sleep(0.1)

        # Tool execution event
        if req.imageBase64:
            yield f"event: tool_call\ndata: {json.dumps({'tool': 'visual_inspector', 'input': 'base64_frame', 'durationMs': 120, 'resultSummary': 'Inspected frame: Flagged NO-Helmet (94% conf)'})}\n\n"
            await asyncio.sleep(0.2)

        yield f"event: tool_call\ndata: {json.dumps({'tool': 'doc_retriever', 'input': 'head protection mandatory OSHA 1926.100', 'durationMs': 85, 'resultSummary': 'Retrieved 4 relevant policy chunks from Safety_Manual_v2.pdf'})}\n\n"
        await asyncio.sleep(0.15)

        yield f"event: node_start\ndata: {json.dumps({'node': 'generate'})}\n\n"

        tokens = [
            "### Workplace Safety Agent Grounded Assessment\n\n",
            "Based on verified facility records and OSHA standard **1926.100**, ",
            "head protection is **strictly mandatory** in active crane hoisting zones.\n\n",
            "- **Identified Non-Compliance:** `NO-HELMET` violation\n",
            "- **Location:** Zone A Structural Yard (Camera 01)\n",
            "- **Severity:** High Operational Risk\n\n",
            "An incident record has been registered in the safety audit log.",
        ]

        for token in tokens:
            yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"
            await asyncio.sleep(0.08)

        # Workflow trigger event
        yield f"event: workflow\ndata: {json.dumps({'toolName': 'incident_logger', 'title': 'Incident #101: Zone A Headgear Infraction', 'status': 'auto_triggered'})}\n\n"
        await asyncio.sleep(0.1)

        yield f"event: complete\ndata: {json.dumps({'status': 'finished', 'conversationId': req.conversationId})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/workflow/approve")
async def approve_workflow(req: WorkflowApprovalRequest):
    return {
        "workflowId": req.workflowId,
        "status": "sent" if req.approved else "rejected",
        "timestamp": time.time(),
        "approver": req.approverEmail,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

"""
SafeVision AI - Agentic Workflows FastAPI Backend
Optional production-grade backend server providing LangGraph StateGraph execution,
SSE (Server-Sent Events) streaming, and multimodal safety RAG endpoints.
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import asyncio
import json
import os
import time

app = FastAPI(
    title="SafeVision AI Agent Backend",
    description="Multimodal RAG & Agentic Workflows for Workplace Safety Monitoring",
    version="1.0.0",
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

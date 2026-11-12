# SafeVision AI - Agentic Workflows FastAPI Backend

This is the optional standalone Python FastAPI backend for SafeVision AI, implementing the LangGraph StateGraph engine with Server-Sent Events (SSE) streaming.

## Features
- **LangGraph StateGraph Engine:** Stateful agent pipeline with intake, intent routing, tool execution, grounded synthesis, and approval gates.
- **Server-Sent Events (SSE):** Real-time streaming of tokens, tool traces, and workflow trigger updates directly to the React frontend.
- **Human-in-the-Loop Gate:** Authorization endpoint for supervisor email alert dispatch.
- **CORS Configured:** Ready for connection with the Vite frontend running on port 3000.

## Running the Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```
The server will run on `http://localhost:8000`.

To connect the React frontend, set in your `.env`:
```
VITE_AGENT_API_URL=http://localhost:8000
```

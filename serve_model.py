"""
SafeVision AI - Custom YOLOv8 (best.pt) Inference Server
=========================================================
This script serves your custom trained `best.pt` weights file over a high-performance
FastAPI endpoint matching SafeVision AI's Mode A interface.

Setup & Run:
1. Place your `best.pt` file in the same folder as this script.
2. Install dependencies:
     pip install ultralytics fastapi uvicorn python-multipart pillow
3. Run the server:
     python serve_model.py
4. The server runs at http://localhost:8000.
   In SafeVision AI, open "Custom Model (best.pt)" and connect to http://localhost:8000.
"""

import io
import os
from fastapi import FastAPI, File, UploadFile, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

try:
    from ultralytics import YOLO
except ImportError:
    print("Warning: 'ultralytics' is not installed. Please run: pip install ultralytics")
    YOLO = None

app = FastAPI(
    title="SafeVision AI - YOLOv8 Inference API",
    description="High-speed PPE detection endpoint for custom best.pt weights",
    version="1.0.0"
)

# Enable CORS for the SafeVision AI web client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Look for best.pt in current folder or models/
MODEL_PATH = "best.pt"
if not os.path.exists(MODEL_PATH) and os.path.exists(os.path.join("models", "best.pt")):
    MODEL_PATH = os.path.join("models", "best.pt")

model = None
if YOLO and os.path.exists(MODEL_PATH):
    print(f"Loading custom weights from: {MODEL_PATH}")
    model = YOLO(MODEL_PATH)
    print(f"Model loaded successfully! Detected classes: {model.names}")
else:
    print(f"Note: '{MODEL_PATH}' not found yet. Place your best.pt file here.")

@app.get("/")
def health_check():
    return {
        "status": "ready" if model else "waiting_for_model",
        "model_file": MODEL_PATH,
        "model_loaded": model is not None,
        "classes": model.names if model else {},
        "target_endpoint": "/detect"
    }

@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    conf: float = Query(0.35, description="Confidence threshold between 0.0 and 1.0")
):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Model best.pt is not loaded. Ensure best.pt is in the directory and restart."
        )

    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        width, height = image.size

        # Run YOLO inference
        results = model.predict(image, conf=conf, verbose=False)
        detections = []

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names.get(cls_id, f"class_{cls_id}")
                confidence = float(box.conf[0])
                xyxy = box.xyxy[0].tolist()

                detections.append({
                    "class_name": cls_name,
                    "confidence": round(confidence, 3),
                    "bbox": [
                        max(0, int(xyxy[0])),
                        max(0, int(xyxy[1])),
                        min(width, int(xyxy[2])),
                        min(height, int(xyxy[3])),
                    ]
                })

        return {
            "detections": detections,
            "image_width": width,
            "image_height": height,
            "engine": "YOLOv8 custom best.pt"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    print("\n========================================================")
    print("SafeVision AI - Custom YOLOv8 Server Running")
    print("API URL: http://localhost:8000")
    print("Endpoint: http://localhost:8000/detect")
    print("========================================================\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)

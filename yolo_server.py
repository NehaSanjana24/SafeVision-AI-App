"""
SafeVision AI - Custom YOLOv8 (best.pt) Inference Server
=========================================================
This lightweight Python service loads your trained `best.pt` PyTorch weights
and serves the `/detect` endpoint expected by SafeVision AI.

Quick Start:
1. Place your `best.pt` file in the same directory as this script.
2. Install dependencies:
     pip install ultralytics fastapi uvicorn python-multipart pillow
3. Run the inference server:
     python yolo_server.py
   (or: uvicorn yolo_server:app --host 0.0.0.0 --port 8000 --reload)
4. In SafeVision AI:
   - Click the "Engine" badge in the top navbar or go to PPE Rules.
   - Enter your inference URL (e.g. http://localhost:8000) and click "Test Connection".
   - All image and video scans will now use your custom best.pt weights!
"""

import io
import sys
from pathlib import Path
from fastapi import FastAPI, File, UploadFile, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

try:
    from ultralytics import YOLO
except ImportError:
    print("\n[ERROR] Ultralytics is not installed. Please run: pip install ultralytics fastapi uvicorn python-multipart pillow\n")
    sys.exit(1)

app = FastAPI(title="SafeVision AI - YOLOv8 Inference API", version="1.0.0")

# Enable CORS so SafeVision AI web app can query this endpoint from any host
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Look for best.pt in current directory or model/ folder
MODEL_PATH = Path("best.pt")
if not MODEL_PATH.exists():
    # Check alternate common paths
    for alt in [Path("weights/best.pt"), Path("runs/detect/train/weights/best.pt"), Path("../best.pt")]:
        if alt.exists():
            MODEL_PATH = alt
            break

print(f"Loading custom YOLO weights from: {MODEL_PATH}")
try:
    model = YOLO(str(MODEL_PATH))
    print(f"Model loaded successfully! Detected classes: {model.names}")
except Exception as e:
    print(f"[WARNING] Could not load '{MODEL_PATH}': {e}")
    print("Please make sure your 'best.pt' file is placed in this directory.")
    model = None


@app.get("/")
@app.get("/health")
def health_check():
    """Health status and model metadata"""
    return {
        "status": "online",
        "engine": "YOLOv8 PyTorch API",
        "model_loaded": model is not None,
        "model_path": str(MODEL_PATH),
        "classes": model.names if model else {}
    }


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    conf: float = Query(0.35, ge=0.05, le=1.0, description="Confidence threshold")
):
    """
    Standard SafeVision AI detection endpoint:
    Accepts multipart/form-data with field 'file' and query param 'conf'.
    Returns bounding boxes, class names, confidence, and image dimensions.
    """
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Model best.pt is not loaded. Please place best.pt in the server directory and restart."
        )

    try:
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        width, height = image.size

        # Run inference
        results = model.predict(source=image, conf=conf, verbose=False)

        detections = []
        for r in results:
            boxes = r.boxes
            for box in boxes:
                cls_id = int(box.cls[0])
                class_name = model.names[cls_id]
                confidence = float(box.conf[0])
                # xyxy format: [x1, y1, x2, y2]
                xyxy = box.xyxy[0].tolist()

                detections.append({
                    "class_name": class_name,
                    "confidence": round(confidence, 3),
                    "bbox": [
                        max(0, round(xyxy[0])),
                        max(0, round(xyxy[1])),
                        min(width, round(xyxy[2])),
                        min(height, round(xyxy[3])),
                    ]
                })

        return {
            "detections": detections,
            "image_width": width,
            "image_height": height,
            "model_source": "custom_best_pt"
        }
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(err)}")


if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("  SafeVision AI - YOLOv8 Inference Server")
    print(f"  Target weights: {MODEL_PATH}")
    print("  Serving at: http://0.0.0.0:8000")
    print("=" * 60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)

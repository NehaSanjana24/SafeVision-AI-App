import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { DetectionBox } from '../../types';
import { detector } from '../../services/detector';

export interface BoundingBoxCanvasHandle {
  getAnnotatedDataUrl: () => string;
}

interface BoundingBoxCanvasProps {
  imageSrc: string;
  detections: DetectionBox[];
  className?: string;
  selectedClass?: string | null;
  onBoxClick?: (box: DetectionBox) => void;
}

export const BoundingBoxCanvas = forwardRef<BoundingBoxCanvasHandle, BoundingBoxCanvasProps>(
  ({ imageSrc, detections, className = '', selectedClass = null, onBoxClick }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useImperativeHandle(ref, () => ({
      getAnnotatedDataUrl: () => {
        if (!canvasRef.current || !imgRef.current) return '';
        // Create an offscreen canvas combining image + annotations
        const offscreen = document.createElement('canvas');
        const img = imgRef.current;
        offscreen.width = img.naturalWidth || 800;
        offscreen.height = img.naturalHeight || 600;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return '';

        // Draw source image
        ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
        // Draw annotations
        detector.drawAnnotations(offscreen, img, detections);
        return offscreen.toDataURL('image/jpeg', 0.9);
      },
    }));

    const renderOverlay = () => {
      const img = imgRef.current;
      const canvas = canvasRef.current;
      if (!img || !canvas || !img.complete) return;

      // Sync canvas dimensions with actual displayed image dimensions
      const displayW = img.clientWidth;
      const displayH = img.clientHeight;
      const naturalW = img.naturalWidth || displayW;
      const naturalH = img.naturalHeight || displayH;

      canvas.width = displayW;
      canvas.height = displayH;

      const scaleX = displayW / naturalW;
      const scaleY = displayH / naturalH;

      // Scale detection bboxes to current display coordinates
      const scaledDetections: DetectionBox[] = detections.map((d) => ({
        ...d,
        bbox: [
          Math.round(d.bbox[0] * scaleX),
          Math.round(d.bbox[1] * scaleY),
          Math.round(d.bbox[2] * scaleX),
          Math.round(d.bbox[3] * scaleY),
        ],
      }));

      detector.drawAnnotations(canvas, img, scaledDetections, {
        activeClassFilter: selectedClass,
      });
    };

    useEffect(() => {
      if (isLoaded) {
        renderOverlay();
      }
    }, [isLoaded, detections, selectedClass]);

    // Handle window resize
    useEffect(() => {
      const handleResize = () => {
        if (isLoaded) renderOverlay();
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [isLoaded, detections, selectedClass]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onBoxClick || !canvasRef.current || !imgRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const displayW = canvasRef.current.width;
      const displayH = canvasRef.current.height;
      const naturalW = imgRef.current.naturalWidth || displayW;
      const naturalH = imgRef.current.naturalHeight || displayH;
      const scaleX = displayW / naturalW;
      const scaleY = displayH / naturalH;

      // Find clicked box (check smallest bounding box first for precision)
      const clicked = detections.find((d) => {
        const x1 = d.bbox[0] * scaleX;
        const y1 = d.bbox[1] * scaleY;
        const x2 = d.bbox[2] * scaleX;
        const y2 = d.bbox[3] * scaleY;
        return clickX >= x1 && clickX <= x2 && clickY >= y1 && clickY <= y2;
      });

      if (clicked) {
        onBoxClick(clicked);
      }
    };

    return (
      <div
        ref={containerRef}
        className={`relative inline-block overflow-hidden rounded-xl bg-slate-950 border border-slate-800 ${className}`}
      >
        <img
          ref={imgRef}
          src={imageSrc}
          alt="Safety scan source"
          className="w-full h-auto max-h-[640px] object-contain block mx-auto"
          onLoad={() => {
            setIsLoaded(true);
            renderOverlay();
          }}
          crossOrigin="anonymous"
        />
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="absolute inset-0 w-full h-full cursor-crosshair"
        />
      </div>
    );
  }
);

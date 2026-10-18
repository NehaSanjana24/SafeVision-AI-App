import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { detector, detectVideo, API_URL } from '../services/detector';
import { repository } from '../services/storage';
import { DetectionBox, DetectionResult, PPESettings, Scan, Violation } from '../types';
import { BoundingBoxCanvas, BoundingBoxCanvasHandle } from '../components/detection/BoundingBoxCanvas';
import {
  Upload,
  Image as ImageIcon,
  Video as VideoIcon,
  ScanEye,
  Sliders,
  ShieldAlert,
  CheckCircle,
  Play,
  RotateCcw,
  Sparkles,
  Download,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Save,
  Flag,
} from 'lucide-react';
import { FalsePositiveModal, FalsePositiveTarget } from '../components/detection/FalsePositiveModal';
import { CustomModelModal } from '../components/model/CustomModelModal';

// Sample demonstration images for quick testing
const DEMO_SAMPLES = [
  {
    name: 'Construction Crew (Mixed PPE)',
    url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Industrial Welder & Scaffolders',
    url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1000&q=80',
  },
  {
    name: 'Factory Worker High-Vis',
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80',
  },
];

export const DetectionPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const canvasRef = useRef<BoundingBoxCanvasHandle>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active tab: 'image' or 'video'
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');

  // Detection Settings
  const [settings, setSettings] = useState<PPESettings>(() => repository.getSettings());
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showCustomModelModal, setShowCustomModelModal] = useState(false);

  // Image State
  const [selectedImage, setSelectedImage] = useState<string | null>(DEMO_SAMPLES[0].url);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageDetections, setImageDetections] = useState<DetectionBox[]>([]);
  const [detectingImage, setDetectingImage] = useState(false);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string | null>(null);
  const [lastViolationResult, setLastViolationResult] = useState<{
    violations: Violation[];
    compliancePct: number;
    totalPersons: number;
  } | null>(null);

  // Video State
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDetectingVideo, setIsDetectingVideo] = useState(false);
  const [showOriginalVideo, setShowOriginalVideo] = useState(false);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoTimeline, setVideoTimeline] = useState<
    Array<{
      time: number;
      frameBlob: Blob;
      dataUrl: string;
      detections: DetectionBox[];
      violations: Violation[];
      compliancePct: number;
    }>
  >([]);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<{
    time: number;
    dataUrl: string;
    detections: DetectionBox[];
    violations: Violation[];
  } | null>(null);

  // False Positive Feedback Modal State
  const [fpModalTarget, setFpModalTarget] = useState<FalsePositiveTarget | null>(null);
  const [flaggedFpKeys, setFlaggedFpKeys] = useState<Set<string>>(new Set());

  const handleFalsePositiveSuccess = (feedback: any) => {
    // Record flagged key (className + confidence)
    const key = `${feedback.className}_${(feedback.confidence * 100).toFixed(0)}`;
    setFlaggedFpKeys((prev) => new Set(prev).add(key));

    // Update active violation result dynamically if present
    if (lastViolationResult) {
      const remainingViolations = lastViolationResult.violations.filter(
        (v) => v.id !== feedback.violationId && !v.type.toLowerCase().includes(feedback.className.toLowerCase())
      );
      const totalPersons = lastViolationResult.totalPersons || 1;
      const newCompliance =
        remainingViolations.length === 0
          ? 100
          : Math.max(15, Math.round(Math.max(0, 1 - remainingViolations.length / (totalPersons * 2)) * 100));

      setLastViolationResult({
        ...lastViolationResult,
        violations: remainingViolations,
        compliancePct: newCompliance,
      });
    }
  };

  // Save settings when modified
  const handleSettingChange = (newSettings: PPESettings) => {
    setSettings(newSettings);
    repository.saveSettings(newSettings);
  };

  // Run image detection
  const runImageDetection = async (imgSource: string | Blob, fileName = 'inspection.jpg') => {
    setDetectingImage(true);
    setLastViolationResult(null);

    try {
      let blob: Blob;
      if (typeof imgSource === 'string') {
        const resp = await fetch(imgSource);
        blob = await resp.blob();
      } else {
        blob = imgSource;
      }

      const result: DetectionResult = await detector.detect(blob, settings.confidenceThreshold);
      setImageDetections(result.detections);

      // Generate scan ID and evaluate violations
      const scanId = `scan_${Date.now()}`;
      const evalResult = detector.evaluateViolations(result.detections, settings, {
        scanId,
        fileName,
        sourceType: 'image',
      });

      setLastViolationResult(evalResult);

      if (evalResult.violations.length > 0) {
        addToast(
          'alert',
          `${evalResult.violations.length} Safety Violation(s) Flagged!`,
          `Missing: ${Array.from(new Set(evalResult.violations.map((v) => v.type))).join(', ')}`
        );
      } else {
        addToast('success', '100% PPE Compliant', 'All required safety gear detected.');
      }

      // Auto-save scan & evidence if enabled
      if (settings.autoSaveScans && currentUser) {
        setTimeout(async () => {
          let annotatedDataUrl = '';
          if (canvasRef.current) {
            annotatedDataUrl = canvasRef.current.getAnnotatedDataUrl();
          }

          const scan: Scan = {
            id: scanId,
            userId: currentUser.id,
            userEmail: currentUser.email,
            sourceType: 'image',
            fileName,
            totalPersons: evalResult.totalPersons,
            totalViolations: evalResult.violations.length,
            compliancePct: evalResult.compliancePct,
            detectedClasses: Array.from(new Set(result.detections.map((d) => d.class_name))),
            annotatedThumbnail: annotatedDataUrl || undefined,
            createdAt: new Date().toISOString(),
          };

          await repository.saveScan(scan);

          for (const v of evalResult.violations) {
            await repository.saveViolation({
              ...v,
              evidenceImage: annotatedDataUrl || undefined,
            });
          }
        }, 300);
      }
    } catch (err: any) {
      console.error(err);
      addToast('error', 'Detection Failed', err.message || 'Vision service error');
    } finally {
      setDetectingImage(false);
    }
  };

  // Image Drag & Drop handlers
  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setImageFile(file);
        setSelectedImage(url);
        setImageDetections([]);
        setLastViolationResult(null);
      }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setImageFile(file);
      setSelectedImage(url);
      setImageDetections([]);
      setLastViolationResult(null);
    }
  };

  // Video Drag & Drop
  const handleVideoSelect = (file: File) => {
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoSrc(url);
    setVideoUrl(null);
    setShowOriginalVideo(false);
    setVideoTimeline([]);
    setSelectedTimelineItem(null);
    setVideoProgress(0);
  };

  // Video Detection via YOLOv8 /predict-video API (Render)
  const runYoloVideoDetection = async () => {
    if (!videoFile) {
      addToast('warning', 'No Video Selected', 'Please upload or choose a video file first.');
      return;
    }

    setIsDetectingVideo(true);
    setVideoUrl(null);

    try {
      addToast(
        'info',
        'YOLOv8 Video Processing Started',
        `Sending video to ${API_URL}/predict-video?confidence=${settings.confidenceThreshold || 0.25}...`
      );

      const returnedVideoUrl = await detectVideo(videoFile, settings.confidenceThreshold || 0.25);
      setVideoUrl(returnedVideoUrl);
      setShowOriginalVideo(false);

      addToast(
        'success',
        'YOLO Video Detection Complete!',
        'Annotated video with detected PPE bounding boxes ready.'
      );

      // Save scan record into database
      if (currentUser) {
        const scanId = `yolo_video_${Date.now()}`;
        const scan: Scan = {
          id: scanId,
          userId: currentUser.id,
          userEmail: currentUser.email,
          sourceType: 'video',
          fileName: videoFile.name,
          totalPersons: 1,
          totalViolations: 0,
          compliancePct: 100,
          detectedClasses: ['worker', 'ppe', 'helmet', 'vest'],
          createdAt: new Date().toISOString(),
        };
        await repository.saveScan(scan);
      }
    } catch (err: any) {
      console.error('YOLO video detection error:', err);
      addToast(
        'error',
        'Video Detection Failed',
        err.message?.includes('Failed to fetch')
          ? 'Unable to connect to SafeVision YOLO API on Render. The server may be waking up from free-tier sleep (~30-45s). You can retry or run browser frame extraction.'
          : err.message || 'Error executing video detection'
      );
    } finally {
      setIsDetectingVideo(false);
    }
  };

  // Video Frame Extraction and Sequential Detection
  const processVideoFrames = async () => {
    if (!videoSrc || !hiddenVideoRef.current) return;
    const video = hiddenVideoRef.current;

    setVideoProcessing(true);
    setVideoProgress(0);
    setVideoTimeline([]);
    setSelectedTimelineItem(null);

    const stepSeconds = Math.max(0.5, settings.frameSampleRate);
    const duration = video.duration || 10;
    const totalFrames = Math.min(20, Math.floor(duration / stepSeconds)); // cap at 20 frames for performance
    const timelineData: typeof videoTimeline = [];

    const offscreenCanvas = document.createElement('canvas');
    const ctx = offscreenCanvas.getContext('2d');

    const scanId = `video_scan_${Date.now()}`;
    let cumulativeViolations = 0;
    let totalPersonsSum = 0;

    for (let i = 0; i < totalFrames; i++) {
      const targetTime = i * stepSeconds;
      await new Promise<void>((resolve) => {
        video.currentTime = targetTime;
        video.onseeked = () => resolve();
      });

      offscreenCanvas.width = video.videoWidth || 640;
      offscreenCanvas.height = video.videoHeight || 360;
      if (ctx) {
        ctx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
      }

      const frameBlob = await new Promise<Blob | null>((resolve) =>
        offscreenCanvas.toBlob(resolve, 'image/jpeg', 0.85)
      );

      if (frameBlob) {
        const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.8);
        try {
          const res = await detector.detect(frameBlob, settings.confidenceThreshold);
          const evalRes = detector.evaluateViolations(res.detections, settings, {
            scanId,
            fileName: videoFile?.name || 'video_stream.mp4',
            sourceType: 'video',
            frameTime: Math.round(targetTime),
            evidenceImage: dataUrl,
          });

          timelineData.push({
            time: Math.round(targetTime),
            frameBlob,
            dataUrl,
            detections: res.detections,
            violations: evalRes.violations,
            compliancePct: evalRes.compliancePct,
          });

          cumulativeViolations += evalRes.violations.length;
          totalPersonsSum += evalRes.totalPersons;

          // Save violations immediately to storage
          for (const v of evalRes.violations) {
            await repository.saveViolation(v);
          }
        } catch (err) {
          console.warn(`Frame at ${targetTime}s detection error:`, err);
        }
      }

      setVideoProgress(Math.round(((i + 1) / totalFrames) * 100));
    }

    setVideoTimeline(timelineData);
    setVideoProcessing(false);

    // Save master video scan summary
    if (timelineData.length > 0 && currentUser) {
      const avgCompliance = Math.round(
        timelineData.reduce((acc, curr) => acc + curr.compliancePct, 0) / timelineData.length
      );

      const videoScan: Scan = {
        id: scanId,
        userId: currentUser.id,
        userEmail: currentUser.email,
        sourceType: 'video',
        fileName: videoFile?.name || 'surveillance_clip.mp4',
        totalPersons: Math.max(1, Math.round(totalPersonsSum / timelineData.length)),
        totalViolations: cumulativeViolations,
        compliancePct: avgCompliance,
        detectedClasses: Array.from(
          new Set(timelineData.flatMap((t) => t.detections.map((d) => d.class_name)))
        ),
        annotatedThumbnail: timelineData[0]?.dataUrl,
        createdAt: new Date().toISOString(),
      };
      await repository.saveScan(videoScan);
    }

    if (cumulativeViolations > 0) {
      addToast(
        'alert',
        `Video Audit Complete: ${cumulativeViolations} Violation(s)`,
        `Review the timeline below to inspect each violation timestamp.`
      );
    } else {
      addToast('success', 'Video Audit Clean', 'Zero safety violations detected in analyzed frames.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <ScanEye className="w-6 h-6 text-amber-400" />
            <span>PPE Detection Workspace</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time inference pipeline for hardhats, high-vis vests, respirators, and hand protection.
          </p>
        </div>

        {/* Tab switch & Settings toggle */}
        <div className="flex items-center gap-3">
          <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => setActiveTab('image')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'image'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Image Scan</span>
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'video'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <VideoIcon className="w-3.5 h-3.5" />
              <span>Video Extraction</span>
            </button>
          </div>

          <button
            onClick={() => setShowCustomModelModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-amber-400 transition-all cursor-pointer"
            title="Configure custom best.pt weights"
          >
            <Cpu className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Connect best.pt</span>
          </button>

          <button
            onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              showSettingsDrawer
                ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            }`}
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">PPE Rules</span>
            {showSettingsDrawer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expandable Settings Drawer */}
      {showSettingsDrawer && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4 animate-in slide-in-from-top-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Detection Thresholds &amp; Mandatory PPE Rules</h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Auto-saved to local repository
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
            {/* Confidence Threshold */}
            <div>
              <div className="flex justify-between font-semibold text-slate-300 mb-2">
                <span>Confidence Threshold:</span>
                <span className="font-mono text-amber-400 font-bold">
                  {(settings.confidenceThreshold * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.85"
                step="0.05"
                value={settings.confidenceThreshold}
                onChange={(e) =>
                  handleSettingChange({
                    ...settings,
                    confidenceThreshold: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Detections below this score are filtered out.
              </p>
            </div>

            {/* Video Sampling Rate */}
            <div>
              <div className="flex justify-between font-semibold text-slate-300 mb-2">
                <span>Video Sample Rate:</span>
                <span className="font-mono text-amber-400 font-bold">
                  1 frame every {settings.frameSampleRate}s
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={settings.frameSampleRate}
                onChange={(e) =>
                  handleSettingChange({
                    ...settings,
                    frameSampleRate: parseFloat(e.target.value),
                  })
                }
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Adjusts video frame extraction interval in browser.
              </p>
            </div>

            {/* Required PPE Checklist */}
            <div className="lg:col-span-1">
              <span className="font-semibold text-slate-300 block mb-2">
                Mandatory PPE Equipment Checklist:
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['helmet', 'vest', 'mask', 'gloves', 'goggles'] as const).map((item) => (
                  <label
                    key={item}
                    className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={settings.requiredItems[item]}
                      onChange={(e) =>
                        handleSettingChange({
                          ...settings,
                          requiredItems: {
                            ...settings.requiredItems,
                            [item]: e.target.checked,
                          },
                        })
                      }
                      className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="capitalize font-medium text-slate-300">
                      {item === 'helmet' ? 'Hardhat / Helmet' : item}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Red Violation Alert Banner */}
      {lastViolationResult && lastViolationResult.violations.length > 0 && (
        <div className="p-4 rounded-2xl bg-rose-950/80 border-2 border-rose-500/70 text-rose-100 shadow-xl shadow-rose-950/40 flex flex-col sm:flex-row sm:items-start justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3 flex-1">
            <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5 animate-bounce" />
            <div>
              <h3 className="font-extrabold text-base text-rose-200">
                CRITICAL SAFETY VIOLATION FLAGGED ({lastViolationResult.violations.length})
              </h3>
              <p className="text-xs text-rose-300 mt-1">
                Workers detected without mandatory PPE: {lastViolationResult.violations.map((v) => v.type).join(', ')}.
                Immediate site supervisor intervention recommended.
              </p>

              {/* Action buttons to flag false positives directly */}
              <div className="mt-3 flex flex-wrap gap-2">
                {lastViolationResult.violations.map((v) => (
                  <button
                    key={v.id}
                    onClick={() =>
                      setFpModalTarget({
                        violationId: v.id,
                        scanId: v.scanId,
                        className: v.type,
                        confidence: v.confidence,
                        fileName: v.fileName,
                        sourceType: 'image',
                        bbox: v.bbox,
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-rose-900/80 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-[11px] font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Flag className="w-3.5 h-3.5 text-amber-400" />
                    <span>Flag &ldquo;{v.type}&rdquo; as False Positive</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-xs uppercase font-mono font-bold px-2.5 py-1 rounded-md bg-rose-900 border border-rose-700 text-rose-200">
              Compliance: {lastViolationResult.compliancePct}%
            </span>
          </div>
        </div>
      )}

      {/* IMAGE DETECTION TAB */}
      {activeTab === 'image' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Visual Canvas & Upload Area (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            <div
              onDrop={handleImageDrop}
              onDragOver={(e) => e.preventDefault()}
              className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl flex flex-col items-center justify-center min-h-[420px]"
            >
              {selectedImage ? (
                <div className="w-full flex flex-col items-center">
                  <BoundingBoxCanvas
                    ref={canvasRef}
                    imageSrc={selectedImage}
                    detections={imageDetections}
                    selectedClass={selectedClassFilter}
                    className="shadow-2xl max-w-full"
                  />

                  {/* Canvas action bar */}
                  <div className="w-full mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Sample presets:</span>
                      {DEMO_SAMPLES.map((sample, idx) => (
                        <button
                          key={sample.name}
                          onClick={() => {
                            setSelectedImage(sample.url);
                            setImageFile(null);
                            setImageDetections([]);
                            setLastViolationResult(null);
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
                        >
                          Sample #{idx + 1}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Change Photo</span>
                      </button>

                      <button
                        disabled={detectingImage}
                        onClick={() => runImageDetection(imageFile || selectedImage!)}
                        className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 text-xs font-extrabold shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all hover:scale-105"
                      >
                        {detectingImage ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                            <span>Analyzing Model...</span>
                          </>
                        ) : (
                          <>
                            <ScanEye className="w-4 h-4" />
                            <span>Run PPE Scan</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8">
                  <Upload className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-slate-300">Drag and drop inspection photo</h4>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG, or WEBP up to 25MB</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Browse Files
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Detections & Classes Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Detected Objects &amp; PPE</span>
                </h3>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {imageDetections.length} Detected
                </span>
              </div>

              {/* Class Filter Tags */}
              {imageDetections.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-800">
                  <button
                    onClick={() => setSelectedClassFilter(null)}
                    className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-all ${
                      selectedClassFilter === null
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({imageDetections.length})
                  </button>
                  {Array.from(new Set(imageDetections.map((d) => d.class_name))).map((cls) => (
                    <button
                      key={cls}
                      onClick={() => setSelectedClassFilter(cls)}
                      className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-all ${
                        selectedClassFilter === cls
                          ? 'bg-amber-500 text-slate-950'
                          : cls.toLowerCase().startsWith('no-')
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              )}

              {/* Detections List Table */}
              <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                {imageDetections.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    <ScanEye className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    <p>No detections yet.</p>
                    <p className="text-[11px] mt-1 text-slate-400">Click &quot;Run PPE Scan&quot; to begin analysis.</p>
                  </div>
                ) : (
                  imageDetections
                    .filter(
                      (d) =>
                        selectedClassFilter === null ||
                        d.class_name.toLowerCase() === selectedClassFilter.toLowerCase()
                    )
                    .map((item, idx) => {
                      const isViolation = item.class_name.toLowerCase().startsWith('no-');
                      const itemKey = `${item.class_name}_${(item.confidence * 100).toFixed(0)}`;
                      const isFlaggedFp = flaggedFpKeys.has(itemKey);

                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-colors gap-2 ${
                            isFlaggedFp
                              ? 'bg-purple-950/20 border-purple-500/30 text-purple-200 opacity-80'
                              : isViolation
                              ? 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                              : 'bg-slate-950/70 border-slate-800 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isViolation ? (
                              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold uppercase tracking-wide truncate ${isFlaggedFp ? 'line-through text-slate-400' : ''}`}>
                                  {item.class_name}
                                </span>
                                {isFlaggedFp && (
                                  <span className="px-1.5 py-0.2 rounded font-mono text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold">
                                    FP CALIBRATED
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Box: [{item.bbox.join(', ')}]
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-amber-400">
                              {(item.confidence * 100).toFixed(0)}%
                            </span>

                            {!isFlaggedFp ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFpModalTarget({
                                    className: item.class_name,
                                    confidence: item.confidence,
                                    bbox: item.bbox,
                                    fileName: imageFile?.name || 'inspection.jpg',
                                    sourceType: 'image',
                                  });
                                }}
                                title="Flag as False Positive"
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-amber-500/20 hover:text-amber-400 text-slate-400 border border-slate-700/60 transition-colors flex items-center gap-1 text-[11px]"
                              >
                                <Flag className="w-3 h-3 text-amber-400" />
                                <span className="hidden sm:inline">Flag FP</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-purple-400 font-mono italic">
                                Flagged
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO EXTRACTION & YOLO PREDICTION TAB */}
      {activeTab === 'video' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <VideoIcon className="w-5 h-5 text-amber-400" />
                  <span>Video PPE Detection &amp; Analysis</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Upload workplace CCTV or inspection footage to run YOLOv8 model inference or extract frame-by-frame compliance timelines.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-2 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Video Clip</span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleVideoSelect(e.target.files[0]);
                      }
                    }}
                  />
                </label>

                {videoSrc && (
                  <>
                    <button
                      disabled={isDetectingVideo || videoProcessing}
                      onClick={runYoloVideoDetection}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all hover:scale-105 cursor-pointer"
                      title="Send video to SafeVision YOLO API (/predict-video) for bounding-box annotated video generation"
                    >
                      {isDetectingVideo ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                          <span>YOLO Predicting...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-slate-950" />
                          <span>Predict Video (YOLO API)</span>
                        </>
                      )}
                    </button>

                    <button
                      disabled={videoProcessing || isDetectingVideo}
                      onClick={processVideoFrames}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
                      title="Sample video frames locally in browser and evaluate safety telemetry timeline"
                    >
                      {videoProcessing ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-300 rounded-full animate-spin" />
                          <span>Extracting ({videoProgress}%)...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 text-amber-400" />
                          <span>Frame Timeline</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Video preview: Annotated or Uploaded */}
            {videoUrl ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <div>
                      <span className="text-xs font-bold text-emerald-300 block">
                        YOLOv8 Annotated Video Stream Ready
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Inference rendered via {API_URL}/predict-video
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowOriginalVideo(!showOriginalVideo)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      {showOriginalVideo ? 'View Annotated Video' : 'View Original Video'}
                    </button>
                    <a
                      href={videoUrl}
                      download={`annotated_${videoFile?.name || 'safevision_detection.mp4'}`}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 transition-colors shadow-md shadow-amber-500/20"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Video</span>
                    </a>
                  </div>
                </div>

                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-emerald-500/30 max-w-2xl mx-auto shadow-2xl">
                  <video
                    src={showOriginalVideo ? (videoSrc || undefined) : videoUrl}
                    controls
                    style={{ maxWidth: "100%" }}
                    className="w-full h-auto max-h-[420px] object-contain"
                  />
                </div>
              </div>
            ) : videoSrc ? (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 max-w-2xl mx-auto shadow-2xl">
                  <video
                    ref={hiddenVideoRef}
                    src={videoSrc}
                    controls
                    style={{ maxWidth: "100%" }}
                    className="w-full h-auto max-h-[380px] object-contain"
                  />
                </div>

                {/* YOLO API Uploading & Inferencing State */}
                {isDetectingVideo && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3 max-w-2xl mx-auto animate-pulse">
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <div>
                      <span className="font-bold block">Running YOLOv8 Prediction via Render API...</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Uploading clip to {API_URL}/predict-video?confidence={settings.confidenceThreshold || 0.25}. Generating annotated video stream.
                      </span>
                    </div>
                  </div>
                )}

                {/* Progress bar for frame extraction */}
                {videoProcessing && (
                  <div className="space-y-1.5 max-w-2xl mx-auto">
                    <div className="flex justify-between text-xs font-mono text-slate-400">
                      <span>Extracting &amp; Scanning Video Frames...</span>
                      <span className="font-bold text-amber-400">{videoProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                        style={{ width: `${videoProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-10 border-2 border-dashed border-slate-800 rounded-2xl text-center">
                <VideoIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-300">No video loaded</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Upload an MP4, WebM or MOV video recorded on site to inspect continuous safety compliance.
                </p>
              </div>
            )}
          </div>

          {/* Video Timeline & Extracted Frames */}
          {videoTimeline.length > 0 && (
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Play className="w-4 h-4 text-amber-400" />
                  <span>Extracted Frame Timeline ({videoTimeline.length} Samples)</span>
                </h4>
                <span className="text-xs text-slate-400 font-mono">
                  Violations:{' '}
                  <span className="text-rose-400 font-bold">
                    {videoTimeline.reduce((acc, t) => acc + t.violations.length, 0)}
                  </span>
                </span>
              </div>

              {/* Horizontal Scrollable Frame Timeline Strip */}
              <div className="flex gap-3 overflow-x-auto pb-4 pt-1">
                {videoTimeline.map((item) => {
                  const hasViolations = item.violations.length > 0;
                  return (
                    <div
                      key={item.time}
                      onClick={() => setSelectedTimelineItem(item)}
                      className={`shrink-0 cursor-pointer w-44 rounded-xl overflow-hidden border p-2 transition-all hover:scale-105 ${
                        selectedTimelineItem?.time === item.time
                          ? 'border-amber-500 ring-2 ring-amber-500/20 bg-slate-800'
                          : hasViolations
                          ? 'border-rose-500/60 bg-rose-950/20'
                          : 'border-slate-800 bg-slate-950/60'
                      }`}
                    >
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900">
                        <img
                          src={item.dataUrl}
                          alt={`Frame at ${item.time}s`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-slate-950/80 font-mono text-[9px] text-slate-300">
                          {item.time}s
                        </span>
                        {hasViolations ? (
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-rose-600 font-bold text-[9px] text-white">
                            {item.violations.length} VIOLATION
                          </span>
                        ) : (
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-emerald-600/90 font-bold text-[9px] text-white">
                            CLEAN
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex justify-between text-[10px] font-mono text-slate-400">
                        <span>Score: {item.compliancePct}%</span>
                        <span>{item.detections.length} Items</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Frame Detail Modal / Preview */}
              {selectedTimelineItem && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 font-mono">
                      Inspecting Timestamp: {selectedTimelineItem.time}s
                    </span>
                    <button
                      onClick={() => setSelectedTimelineItem(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Close Details &times;
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <img
                      src={selectedTimelineItem.dataUrl}
                      alt="Enlarged evidence frame"
                      className="rounded-lg border border-slate-800 max-h-64 object-contain mx-auto"
                    />
                    <div className="space-y-2 text-xs">
                      <div className="font-bold text-slate-300 uppercase tracking-wider">
                        Detected in this frame:
                      </div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {selectedTimelineItem.detections.map((d, i) => (
                          <div
                            key={i}
                            className="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between font-mono text-[11px]"
                          >
                            <span
                              className={
                                d.class_name.toLowerCase().startsWith('no-')
                                  ? 'text-rose-400 font-bold'
                                  : 'text-slate-300'
                              }
                            >
                              {d.class_name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-amber-400">
                                {(d.confidence * 100).toFixed(0)}%
                              </span>
                              <button
                                onClick={() =>
                                  setFpModalTarget({
                                    className: d.class_name,
                                    confidence: d.confidence,
                                    bbox: d.bbox,
                                    fileName: videoFile?.name || 'video_stream.mp4',
                                    sourceType: 'video',
                                  })
                                }
                                title="Flag False Positive"
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors"
                              >
                                <Flag className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* False Positive Feedback Modal */}
      <FalsePositiveModal
        isOpen={Boolean(fpModalTarget)}
        onClose={() => setFpModalTarget(null)}
        target={fpModalTarget}
        onSuccess={handleFalsePositiveSuccess}
      />

      {/* Custom YOLOv8 best.pt Model Connector Modal */}
      <CustomModelModal
        isOpen={showCustomModelModal}
        onClose={() => setShowCustomModelModal(false)}
      />
    </div>
  );
};

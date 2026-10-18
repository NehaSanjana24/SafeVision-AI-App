import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { repository } from '../../services/storage';
import { FalsePositiveFeedback, SourceType } from '../../types';
import {
  Flag,
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Cpu,
} from 'lucide-react';

export interface FalsePositiveTarget {
  violationId?: string;
  scanId?: string;
  className: string;
  confidence: number;
  fileName?: string;
  sourceType?: SourceType;
  bbox?: [number, number, number, number];
  evidenceImage?: string;
}

interface FalsePositiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: FalsePositiveTarget | null;
  onSuccess?: (feedback: FalsePositiveFeedback) => void;
}

const PRESET_REASONS = [
  'Item was actually worn (occluded / low-contrast / steep angle)',
  'Wrong class detected (e.g. regular cap mistaken for missing hardhat)',
  'Reflective glare or harsh shadow artifact',
  'Non-person object misclassified as human worker',
  'Approved alternative safety equipment in use (e.g. bump cap / specialized gear)',
  'Other detection error',
];

export const FalsePositiveModal: React.FC<FalsePositiveModalProps> = ({
  isOpen,
  onClose,
  target,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const { addToast } = useToast();

  const [selectedReason, setSelectedReason] = useState<string>(PRESET_REASONS[0]);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const userEmail = currentUser?.email || 'supervisor@safevision.ai';
      const userName = currentUser?.name || 'Safety Supervisor';

      let feedback: FalsePositiveFeedback;

      if (target.violationId) {
        // Flag existing violation in repository
        const updated = await repository.flagViolationAsFalsePositive(target.violationId, {
          reason: selectedReason,
          notes: notes.trim(),
          userEmail,
          userName,
        });

        feedback = {
          id: `fb_${Date.now()}`,
          violationId: target.violationId,
          scanId: target.scanId,
          className: target.className,
          confidence: target.confidence,
          reason: selectedReason,
          notes: notes.trim(),
          flaggedBy: userEmail,
          flaggedByName: userName,
          sourceType: target.sourceType,
          fileName: target.fileName,
          createdAt: new Date().toISOString(),
        };
      } else {
        // Record detection feedback directly
        feedback = {
          id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          scanId: target.scanId,
          className: target.className,
          confidence: target.confidence,
          reason: selectedReason,
          notes: notes.trim(),
          flaggedBy: userEmail,
          flaggedByName: userName,
          sourceType: target.sourceType,
          fileName: target.fileName,
          createdAt: new Date().toISOString(),
        };
        await repository.recordDetectionFeedback(feedback);
      }

      addToast(
        'success',
        'Flagged as False Positive',
        'Feedback recorded in database to calibrate future model confidence.'
      );

      if (onSuccess) {
        onSuccess(feedback);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      addToast('error', 'Feedback Submission Failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/20">
              <Flag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Flag as False Positive</h3>
              <p className="text-[11px] text-slate-400">
                Help tune vision confidence and suppress erroneous hazard alerts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Detection Badge */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
          <div>
            <span className="text-[10px] text-slate-400 font-mono uppercase block">Target Class:</span>
            <span className="font-extrabold text-amber-400 font-mono text-sm uppercase">
              {target.className}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-mono uppercase block">Confidence:</span>
            <span className="font-bold text-slate-200 font-mono">
              {(target.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Feedback Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1">
              <span>Reason for False Positive</span>
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
            >
              {PRESET_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Supervisory Notes / Context (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Worker was wearing certified ANSI-approved chin-strapped gear not recognized by standard training sets..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
            />
          </div>

          {/* Model calibration note */}
          <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 text-purple-200 text-[11px] flex items-start gap-2">
            <Cpu className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <span>
              This feedback will be stored in your safety database to refine engine inference weights and
              adjust compliance analytics.
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all hover:scale-105"
            >
              {submitting ? (
                <div className="w-3.5 h-3.5 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Record False Positive</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

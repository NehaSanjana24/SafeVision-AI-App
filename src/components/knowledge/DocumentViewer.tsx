import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import {
  KnowledgeDocument,
  DocumentChunk,
  ExtractedField,
  ReviewStatus,
  ExtractedFieldCategory,
} from '../../types';
import { repository } from '../../services/storage';
import { useToast } from '../../context/ToastContext';
import {
  FileText,
  CheckCircle,
  XCircle,
  Edit2,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Sparkles,
  Shield,
  FileCode,
  Check,
  X,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface DocumentViewerProps {
  document: KnowledgeDocument | null;
  highlightPassage?: string | null;
  targetLocation?: { page?: number; row?: number; sheet?: string } | null;
  onOpenSourceChunk?: (chunkId: string) => void;
  onFieldsUpdated?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document: doc,
  highlightPassage,
  targetLocation,
  onOpenSourceChunk,
  onFieldsUpdated,
}) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'document' | 'extracted' | 'chunks'>('document');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [docBlobUrl, setDocBlobUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string>('');

  useEffect(() => {
    if (doc) {
      loadDocData(doc.id);
    } else {
      setFields([]);
      setChunks([]);
      setDocBlobUrl(null);
      setRawText('');
    }
  }, [doc?.id]);

  const loadDocData = async (docId: string) => {
    const docFields = await repository.getExtractedFieldsByDocId(docId);
    const docChunks = await repository.getChunksByDocId(docId);
    setFields(docFields);
    setChunks(docChunks);

    // Try to load blob from IDB
    const blobRecord = await repository.getDocumentBlob(docId);
    if (blobRecord) {
      if (typeof blobRecord.data === 'string') {
        setRawText(blobRecord.data);
      } else {
        const blob = new Blob([blobRecord.data], { type: blobRecord.mimeType });
        const url = URL.createObjectURL(blob);
        setDocBlobUrl(url);
      }
    } else if (doc?.contentRaw) {
      setRawText(doc.contentRaw);
    }
  };

  const handleReviewStatus = async (fieldId: string, status: ReviewStatus, newValue?: string) => {
    await repository.updateExtractedFieldReview(fieldId, status, newValue);
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, reviewStatus: status, value: newValue ?? f.value } : f))
    );
    setEditingFieldId(null);
    onFieldsUpdated?.();
    addToast(
      status === 'confirmed' ? 'success' : status === 'rejected' ? 'info' : 'success',
      `Field ${status === 'confirmed' ? 'Confirmed' : status === 'rejected' ? 'Rejected' : 'Updated'}`,
      'Knowledge verification state saved.'
    );
  };

  if (!doc) {
    return (
      <div className="h-full min-h-[500px] rounded-2xl border border-slate-800 bg-slate-900/40 p-8 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-[#7C5CFF] flex items-center justify-center mb-4 shadow-lg shadow-violet-950/20">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-white">No Document Selected</h3>
        <p className="text-xs text-slate-400 max-w-sm mt-1">
          Select a file from the uploaded documents list on the left, or upload a safety manual, inspection CSV, or OSHA standard.
        </p>
      </div>
    );
  }

  // Category labels for grouping
  const categoryLabels: Record<ExtractedFieldCategory, string> = {
    ppe_requirements: 'Mandatory PPE Equipment & Zones',
    inspection_frequency: 'Inspection & Audit Timelines',
    penalties: 'Non-Compliance Penalties & Disciplinary Actions',
    emergency_procedures: 'Emergency Response & Evacuation',
    roles_contacts: 'Safety Personnel & Key Contacts',
    standards: 'Referenced Safety Standards (OSHA / ANSI)',
    effective_dates: 'Validity & Review Cycles',
  };

  const groupedFields = fields.reduce((acc, f) => {
    const cat = f.category || 'ppe_requirements';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {} as Record<string, ExtractedField[]>);

  return (
    <div className="h-full flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 shadow-2xl overflow-hidden">
      {/* Top Bar: Section Title + Document Info + Tabs + Zoom */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-violet-500/20 text-[#7C5CFF] border border-violet-500/30">
              {doc.fileType.toUpperCase()}
            </span>
            <h3 className="text-sm font-bold text-white truncate max-w-md" title={doc.fileName}>
              {doc.fileName}
            </h3>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
            {targetLocation?.page && (
              <span className="text-amber-400 font-mono font-medium">Page {targetLocation.page}</span>
            )}
            {targetLocation?.row && (
              <span className="text-amber-400 font-mono font-medium">
                {targetLocation.sheet ? `${targetLocation.sheet} · ` : ''}Row {targetLocation.row}
              </span>
            )}
            <span>•</span>
            <span>{chunks.length} Chunks</span>
            <span>•</span>
            <span>{fields.length} Extracted Rules</span>
            {doc.ocrUsed && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[9px] border border-amber-500/30">
                OCR Used
              </span>
            )}
          </p>
        </div>

        {/* Tab Switcher & Zoom */}
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-1 text-xs font-medium">
            <button
              onClick={() => setActiveTab('document')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'document'
                  ? 'bg-[#7C5CFF] text-white shadow-md shadow-violet-950/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Document
            </button>
            <button
              onClick={() => setActiveTab('extracted')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'extracted'
                  ? 'bg-[#7C5CFF] text-white shadow-md shadow-violet-950/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Extracted info</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-950 text-[10px] font-mono">
                {fields.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('chunks')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                activeTab === 'chunks'
                  ? 'bg-[#7C5CFF] text-white shadow-md shadow-violet-950/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Chunks
            </button>
          </div>

          {activeTab === 'document' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <button
                onClick={() => setZoomLevel((z) => Math.max(60, z - 15))}
                title="Zoom Out"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-[10px] font-mono text-slate-400 min-w-[40px] text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
                title="Zoom In"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                title="Reset Zoom"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-950/30">
        {/* TAB 1: DOCUMENT VIEWER */}
        {activeTab === 'document' && (
          <div className="space-y-4">
            {/* Section detected banner */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#7C5CFF]" />
                <span>
                  Section View: {doc.fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')}
                </span>
              </span>
              {highlightPassage && (
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] border border-amber-500/30 animate-pulse">
                  Matched Passage Highlighted
                </span>
              )}
            </div>

            {/* Document Render Surface */}
            {doc.fileType === 'pdf' ? (
              <div
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                className="transition-transform duration-200 space-y-4"
              >
                {/* White paper surface simulation for PDF */}
                <div className="bg-white text-slate-900 rounded-xl p-8 sm:p-12 shadow-2xl max-w-3xl mx-auto min-h-[600px] font-serif leading-relaxed text-sm select-text border border-slate-200">
                  <div className="border-b-2 border-slate-800 pb-3 mb-6 flex justify-between items-center">
                    <div>
                      <h1 className="text-base font-extrabold uppercase tracking-wide text-slate-900">
                        {doc.fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')}
                      </h1>
                      <p className="text-[11px] text-slate-500 font-sans">
                        Workplace Safety Manual &amp; PPE Protocol
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-400">OSHA 1926</span>
                  </div>

                  {chunks.map((chunk, idx) => {
                    const isMatched =
                      highlightPassage &&
                      chunk.text.toLowerCase().includes(highlightPassage.toLowerCase().slice(0, 40));

                    return (
                      <div
                        key={chunk.id}
                        id={chunk.id}
                        className={`mb-6 p-3 rounded-lg transition-all ${
                          isMatched
                            ? 'bg-amber-100 ring-2 ring-amber-400 text-slate-950 font-medium'
                            : ''
                        }`}
                      >
                        {chunk.sectionTitle && (
                          <div className="font-sans text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                            {chunk.sectionTitle}
                          </div>
                        )}
                        <p className="text-justify">{chunk.text}</p>
                        {chunk.page && (
                          <div className="text-right text-[10px] font-mono text-slate-400 mt-1 font-sans">
                            Page {chunk.page}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : doc.fileType === 'csv' || doc.fileType === 'xlsx' ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-950 text-slate-300 font-mono uppercase text-[11px] border-b border-slate-800 z-10">
                      <tr>
                        <th className="p-3 w-16">Row</th>
                        <th className="p-3">Safety Audit &amp; Protocol Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono">
                      {chunks.map((chunk, idx) => {
                        const isTargetRow = targetLocation?.row === (chunk.row || idx + 1);
                        const isMatched =
                          highlightPassage &&
                          chunk.text.toLowerCase().includes(highlightPassage.toLowerCase().slice(0, 30));

                        return (
                          <tr
                            key={chunk.id}
                            className={`transition-colors ${
                              isTargetRow || isMatched
                                ? 'bg-amber-500/20 text-amber-200'
                                : 'hover:bg-slate-800/50 text-slate-300'
                            }`}
                          >
                            <td className="p-3 text-slate-500 font-bold">{chunk.row || idx + 1}</td>
                            <td className="p-3 leading-relaxed">
                              {chunk.sectionTitle && (
                                <span className="text-[#7C5CFF] font-bold mr-2">
                                  [{chunk.sectionTitle}]
                                </span>
                              )}
                              <span>{chunk.text}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* DOCX, TXT, MD, Image */
              <div className="bg-slate-900 rounded-xl p-6 sm:p-8 border border-slate-800 max-w-3xl mx-auto shadow-xl space-y-4 text-xs text-slate-200 leading-relaxed">
                {chunks.map((chunk) => {
                  const isMatched =
                    highlightPassage &&
                    chunk.text.toLowerCase().includes(highlightPassage.toLowerCase().slice(0, 40));

                  return (
                    <div
                      key={chunk.id}
                      className={`p-3.5 rounded-xl border transition-colors ${
                        isMatched
                          ? 'border-amber-500/50 bg-amber-950/20 text-amber-100 ring-2 ring-amber-500/20'
                          : 'border-slate-800/80 bg-slate-950/50'
                      }`}
                    >
                      {chunk.sectionTitle && (
                        <h4 className="font-bold text-white text-xs uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFF]" />
                          <span>{chunk.sectionTitle}</span>
                        </h4>
                      )}
                      <p>{chunk.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EXTRACTED STRUCTURED INFORMATION */}
        {activeTab === 'extracted' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#7C5CFF]" />
                  <span>Structured Compliance Rules Extracted by AI</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Review and confirm extracted safety policies to pre-fill automated enforcement rules.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-violet-500/10 text-[#7C5CFF] border border-violet-500/30 font-mono text-xs font-bold">
                {fields.filter((f) => f.reviewStatus === 'confirmed').length} / {fields.length} Confirmed
              </span>
            </div>

            {fields.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No structured fields extracted for this document.
              </div>
            ) : (
              Object.entries(groupedFields).map(([category, catFields]) => (
                <div key={category} className="space-y-3">
                  <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#7C5CFF]" />
                    <span>{categoryLabels[category as ExtractedFieldCategory] || category}</span>
                    <span className="text-[10px] font-mono text-slate-500">({catFields.length})</span>
                  </h5>

                  <div className="grid grid-cols-1 gap-3">
                    {catFields.map((field) => (
                      <div
                        key={field.id}
                        className={`p-4 rounded-xl border text-xs transition-all ${
                          field.reviewStatus === 'confirmed'
                            ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-100'
                            : field.reviewStatus === 'rejected'
                            ? 'bg-slate-900/40 border-slate-800 opacity-60 text-slate-400'
                            : 'bg-slate-900/80 border-slate-800 text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-white tracking-wide">
                                {field.label}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                  field.reviewStatus === 'confirmed'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : field.reviewStatus === 'rejected'
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {field.reviewStatus}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                Conf: {Math.round(field.confidence * 100)}%
                              </span>
                            </div>

                            {editingFieldId === field.id ? (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-full p-2.5 rounded-lg bg-slate-950 border border-violet-500 text-xs text-white focus:outline-none"
                                  rows={3}
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleReviewStatus(field.id, 'confirmed', editValue)}
                                    className="px-3 py-1 rounded bg-[#7C5CFF] text-white font-bold text-xs"
                                  >
                                    Save &amp; Confirm
                                  </button>
                                  <button
                                    onClick={() => setEditingFieldId(null)}
                                    className="px-3 py-1 rounded bg-slate-800 text-slate-300 text-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-slate-300 leading-relaxed mt-1">{field.value}</p>
                            )}

                            {field.sourceChunkId && (
                              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-400">
                                {field.page && <span>Page {field.page}</span>}
                                {field.row && <span>Row {field.row}</span>}
                                <button
                                  onClick={() => {
                                    setActiveTab('document');
                                    onOpenSourceChunk?.(field.sourceChunkId!);
                                  }}
                                  className="text-[#7C5CFF] hover:underline flex items-center gap-1 font-mono text-[10px]"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Jump to source</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Confirm / Edit / Reject buttons */}
                          {editingFieldId !== field.id && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleReviewStatus(field.id, 'confirmed')}
                                title="Confirm rule"
                                className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingFieldId(field.id);
                                  setEditValue(field.value);
                                }}
                                title="Edit rule text"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReviewStatus(field.id, 'rejected')}
                                title="Reject rule"
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 3: CHUNKS (DEBUG) */}
        {activeTab === 'chunks' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#7C5CFF]" />
                  <span>Document Chunks &amp; Vector Embeddings ({chunks.length} Units)</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Underlying units (~500–800 chars with 100 overlap) indexed for hybrid BM25 + cosine vector retrieval.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {chunks.map((chunk, idx) => (
                <div
                  key={chunk.id}
                  id={chunk.id}
                  className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/70 font-mono text-xs space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-bold text-violet-300">#{idx + 1} • {chunk.id}</span>
                    <div className="flex items-center gap-3">
                      {chunk.page && <span>Page {chunk.page}</span>}
                      {chunk.row && <span>Row {chunk.row}</span>}
                      <span>{chunk.text.length} chars</span>
                      {chunk.embedding ? (
                        <span className="text-emerald-400">✓ Vectorized</span>
                      ) : (
                        <span className="text-slate-500">BM25 only</span>
                      )}
                    </div>
                  </div>
                  {chunk.sectionTitle && (
                    <div className="text-amber-400 font-sans font-bold text-xs">
                      {chunk.sectionTitle}
                    </div>
                  )}
                  <p className="text-slate-300 leading-relaxed font-sans">{chunk.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

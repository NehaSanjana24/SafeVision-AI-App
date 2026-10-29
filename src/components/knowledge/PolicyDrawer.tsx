import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { knowledgeService } from '../../services/knowledge';
import { SearchResultItem } from '../../types';
import {
  BookOpen,
  X,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  FileText,
} from 'lucide-react';

interface PolicyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  violationType: string;
  sourceType?: string;
  onSelectDoc?: (docId: string, location?: { page?: number; row?: number }) => void;
}

export const PolicyDrawer: React.FC<PolicyDrawerProps> = ({
  isOpen,
  onClose,
  violationType,
  sourceType,
  onSelectDoc,
}) => {
  const navigate = useNavigate();
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && violationType) {
      loadPolicyHits(violationType);
    }
  }, [isOpen, violationType]);

  const loadPolicyHits = async (type: string) => {
    setLoading(true);
    try {
      // Map violation type (e.g. "NO-Helmet", "Missing Vest") into high-relevance compliance queries
      let query = `${type.replace(/^(no-|missing\s*)/i, '')} mandatory required ppe protocol`;
      if (type.toLowerCase().includes('helmet')) {
        query = 'hard hat helmet ANSI Z89.1 head protection required';
      } else if (type.toLowerCase().includes('vest')) {
        query = 'high-vis safety vest ANSI 107 visibility required';
      } else if (type.toLowerCase().includes('glove')) {
        query = 'cut resistant work gloves hand protection EN 388';
      } else if (type.toLowerCase().includes('goggle')) {
        query = 'eye protection safety spectacles ANSI Z87.1 goggles';
      }

      const hits = await knowledgeService.hybridSearch(query);
      setResults(hits.slice(0, 3)); // Top 3 policy hits as specified
    } catch (err) {
      console.warn('Policy lookup error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-sm flex justify-end animate-fadeIn">
      <div
        className="relative w-full max-w-md bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col h-full transform transition-transform duration-300 ease-in-out"
        role="dialog"
        aria-label="Safety Policy Reference Drawer"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 text-[#7C5CFF] flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>Compliance Policy References</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Grounding for:{' '}
                <span className="text-rose-400 font-mono font-bold uppercase">
                  {violationType}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-500/30 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#7C5CFF] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Official Knowledge Base Citations</span>
              <span>
                These regulatory rules and safety manual guidelines directly apply to this detected violation.
              </span>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 pt-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse space-y-2">
                  <div className="h-4 bg-slate-800 rounded w-1/2" />
                  <div className="h-3 bg-slate-800 rounded w-full" />
                  <div className="h-3 bg-slate-800 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              {results.map((result, idx) => {
                const locationStr = result.chunk.page
                  ? `Page ${result.chunk.page}`
                  : result.chunk.row
                  ? `Row ${result.chunk.row}`
                  : result.chunk.sectionTitle || 'Section';

                return (
                  <div
                    key={result.chunk.id}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-violet-500/40 transition-all space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="w-4 h-4 text-violet-400 shrink-0" />
                        <span className="font-bold text-white truncate max-w-[180px]">
                          {result.doc.fileName}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                        {locationStr}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      &quot;{result.chunk.text}&quot;
                    </p>

                    <div className="pt-1 flex items-center justify-between text-[11px]">
                      <span className="text-[10px] font-mono text-slate-500">
                        Relevance: {result.score} pts
                      </span>
                      <button
                        onClick={() => {
                          onClose();
                          navigate('/knowledge');
                        }}
                        className="text-[#7C5CFF] hover:underline flex items-center gap-1 font-mono text-[11px] font-bold cursor-pointer"
                      >
                        <span>Open Document Intelligence</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center space-y-3">
              <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-sm font-bold text-slate-300">No indexed policy found</h4>
              <p className="text-xs text-slate-400">
                Upload your company safety manual or OSHA guidelines in the Knowledge Base to enable instant policy cross-referencing.
              </p>
              <button
                onClick={() => {
                  onClose();
                  navigate('/knowledge');
                }}
                className="mt-2 px-4 py-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6846f5] text-white text-xs font-bold transition-colors"
              >
                Go to Knowledge Base
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-400 font-mono">
            Top 3 safety citations shown
          </span>
          <button
            onClick={() => {
              onClose();
              navigate('/knowledge');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors"
          >
            <span>Browse All Manuals</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

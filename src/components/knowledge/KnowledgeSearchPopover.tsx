import React, { useState } from 'react';
import {
  SearchResultItem,
  CitationItem,
  KnowledgeDocument,
  DocumentFileType,
} from '../../types';
import {
  Search,
  Sparkles,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Clock,
  Filter,
  X,
  Bot,
} from 'lucide-react';

interface KnowledgeSearchPopoverProps {
  query: string;
  results: SearchResultItem[];
  isSearching: boolean;
  onSelectResult: (result: SearchResultItem) => void;
  onClose: () => void;
  recentSearches: string[];
  suggestedQueries: string[];
  onSelectQuery: (q: string) => void;
  // "Ask" Q&A toggle
  isAskMode: boolean;
  setIsAskMode: (ask: boolean) => void;
  onRunAsk: () => void;
  isAsking: boolean;
  askAnswer: string | null;
  askCitations: CitationItem[];
  // Filters
  filterFileType: string | null;
  setFilterFileType: (type: string | null) => void;
  documents: KnowledgeDocument[];
  filterDocId: string | null;
  setFilterDocId: (id: string | null) => void;
}

export const KnowledgeSearchPopover: React.FC<KnowledgeSearchPopoverProps> = ({
  query,
  results,
  isSearching,
  onSelectResult,
  onClose,
  recentSearches,
  suggestedQueries,
  onSelectQuery,
  isAskMode,
  setIsAskMode,
  onRunAsk,
  isAsking,
  askAnswer,
  askCitations,
  filterFileType,
  setFilterFileType,
  documents,
  filterDocId,
  setFilterDocId,
}) => {
  const [showFilters, setShowFilters] = useState(false);

  // File type icon helper
  const getFileIcon = (fileType: DocumentFileType) => {
    switch (fileType) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-rose-400" />;
      case 'docx':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'csv':
      case 'xlsx':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
      case 'image':
        return <Image className="w-4 h-4 text-amber-400" />;
      default:
        return <FileCode className="w-4 h-4 text-slate-400" />;
    }
  };

  // Highlight matched terms with violet
  const renderHighlightedSnippet = (snippet: string, matchTerms: string[]) => {
    if (!matchTerms || matchTerms.length === 0) return snippet;

    const regex = new RegExp(`(${matchTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = snippet.split(regex);

    return parts.map((part, i) =>
      matchTerms.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
        <span
          key={i}
          className="bg-violet-500/30 text-violet-200 px-1 py-0.2 rounded font-bold border border-violet-500/40"
        >
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-violet-500/40 bg-slate-950/98 shadow-2xl backdrop-blur-xl overflow-hidden max-h-[85vh] flex flex-col">
      {/* Header bar with Ask toggle and Filter button */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-extrabold uppercase tracking-wider text-slate-300">
            {query ? `SEARCH RESULTS: "${query}"` : 'DOCUMENT INTELLIGENCE SEARCH'}
          </span>
          {results.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-[#7C5CFF] font-mono text-[10px] font-bold">
              {results.length} found
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Ask Toggle */}
          <button
            onClick={() => {
              const next = !isAskMode;
              setIsAskMode(next);
              if (next && query) onRunAsk();
            }}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
              isAskMode
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI Ask Assistant</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isAskMode ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
          </button>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              showFilters || filterFileType || filterDocId
                ? 'bg-violet-500/20 border-violet-500/40 text-[#7C5CFF]'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Filter search"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Options Bar */}
      {showFilters && (
        <div className="p-3 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-slate-400 font-semibold">Filter by:</span>

          {/* File type filter */}
          <select
            value={filterFileType || ''}
            onChange={(e) => setFilterFileType(e.target.value || null)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none"
          >
            <option value="">All Formats (PDF, DOCX, CSV...)</option>
            <option value="pdf">PDF Manuals</option>
            <option value="docx">Word DOCX</option>
            <option value="csv">CSV Audit Logs</option>
            <option value="xlsx">Excel Sheets</option>
            <option value="image">Image OCR</option>
          </select>

          {/* Document filter */}
          <select
            value={filterDocId || ''}
            onChange={(e) => setFilterDocId(e.target.value || null)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none max-w-xs truncate"
          >
            <option value="">All Documents ({documents.length})</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fileName}
              </option>
            ))}
          </select>

          {(filterFileType || filterDocId) && (
            <button
              onClick={() => {
                setFilterFileType(null);
                setFilterDocId(null);
              }}
              className="text-violet-400 hover:underline text-[11px]"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* Ask AI Answer Panel */}
      {isAskMode && (
        <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-violet-950/40 to-slate-950 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-violet-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#7C5CFF] animate-pulse" />
              <span>Grounded AI Synthesis (Strictly based on retrieved sources)</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Model: Gemini 3.8 Flash
            </span>
          </div>

          {isAsking ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/60 text-xs text-slate-300 font-mono animate-pulse">
              <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              <span>Synthesizing answer with verified citations...</span>
            </div>
          ) : askAnswer ? (
            <div className="space-y-2">
              <div className="p-4 rounded-xl bg-slate-900/90 border border-violet-500/30 text-xs text-slate-200 leading-relaxed">
                {askAnswer}
              </div>

              {/* Citations List */}
              {askCitations.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Verified Source Citations:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {askCitations.map((cit) => (
                      <div
                        key={cit.number}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center gap-1.5"
                      >
                        <span className="w-4 h-4 rounded-full bg-[#7C5CFF] text-white flex items-center justify-center font-bold text-[9px]">
                          {cit.number}
                        </span>
                        <span className="text-violet-300 font-semibold truncate max-w-[140px]">
                          {cit.fileName}
                        </span>
                        <span className="text-amber-400 text-[10px]">({cit.location})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">
              Click &quot;Ask&quot; or press Enter to generate a grounded answer with citations from the retrieved safety documents.
            </div>
          )}
        </div>
      )}

      {/* Main Search Results or Suggestions */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isSearching ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse space-y-2">
                <div className="h-4 bg-slate-800 rounded w-1/3" />
                <div className="h-3 bg-slate-800 rounded w-full" />
                <div className="h-3 bg-slate-800 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-2.5">
            {results.map((result, idx) => {
              const locationStr = result.chunk.page
                ? `Page ${result.chunk.page}`
                : result.chunk.row
                ? `Row ${result.chunk.row}`
                : result.chunk.sectionTitle || 'Section';

              return (
                <div
                  key={result.chunk.id}
                  onClick={() => onSelectResult(result)}
                  className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 hover:bg-slate-900 hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-950/20 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(result.doc.fileType)}
                      <span className="text-xs font-bold text-white group-hover:text-violet-300 truncate transition-colors">
                        {result.doc.fileName}
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-semibold border border-amber-500/30">
                        {locationStr}
                      </span>
                    </div>

                    {/* Relevance bar */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-indigo-400"
                          style={{ width: `${Math.min(100, Math.max(15, result.score * 10))}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        {result.score} pts
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-violet-400 transition-colors" />
                    </div>
                  </div>

                  {/* Context Snippet with violet highlight */}
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {renderHighlightedSnippet(result.snippet, result.matchTerms)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : query ? (
          <div className="p-8 text-center space-y-2">
            <HelpCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="text-sm font-bold text-slate-300">No matching passages found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No direct matches for &quot;{query}&quot;. Try one of the suggested search queries below or adjust your filters.
            </p>
          </div>
        ) : null}

        {/* Suggested Queries & Recent Searches */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          {recentSearches.length > 0 && (
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Clock className="w-3 h-3" />
                <span>Recent Searches</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSelectQuery(q)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 font-mono text-[11px] transition-colors cursor-pointer"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3 h-3 text-[#7C5CFF]" />
              <span>Suggested Queries</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestedQueries.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelectQuery(q)}
                  className="px-2.5 py-1 rounded-lg bg-violet-950/20 hover:bg-violet-950/40 text-violet-300 hover:text-white border border-violet-500/20 font-mono text-[11px] transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

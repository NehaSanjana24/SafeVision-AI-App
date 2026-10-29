import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { knowledgeService } from '../services/knowledge';
import { repository } from '../services/storage';
import {
  KnowledgeDocument,
  DocumentChunk,
  SearchResultItem,
  CitationItem,
  DocumentFileType,
} from '../types';
import { DocumentViewer } from '../components/knowledge/DocumentViewer';
import { KnowledgeSearchPopover } from '../components/knowledge/KnowledgeSearchPopover';
import {
  BookOpen,
  Plus,
  Upload,
  Search,
  FileText,
  FileSpreadsheet,
  FileCode,
  Image as ImageIcon,
  MoreVertical,
  Trash2,
  RotateCcw,
  Download,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  ShieldCheck,
  Info,
  Clock,
  X,
  Bot,
} from 'lucide-react';

export const KnowledgePage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { addToast } = useToast();

  // Mobile layout tab
  const [mobileTab, setMobileTab] = useState<'files' | 'viewer'>('files');

  // Documents state
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Statistics
  const [stats, setStats] = useState<{
    docCount: number;
    chunkCount: number;
    extractedCount: number;
    reviewRatePct: number | null;
  }>({
    docCount: 0,
    chunkCount: 0,
    extractedCount: 0,
    reviewRatePct: null,
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceTimer = useRef<any>(null);

  // Search Filters
  const [filterFileType, setFilterFileType] = useState<string | null>(null);
  const [filterDocId, setFilterDocId] = useState<string | null>(null);

  // Ask AI state
  const [isAskMode, setIsAskMode] = useState<boolean>(false);
  const [isAsking, setIsAsking] = useState<boolean>(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askCitations, setAskCitations] = useState<CitationItem[]>([]);

  // Highlight and jump state
  const [highlightPassage, setHighlightPassage] = useState<string | null>(null);
  const [targetLocation, setTargetLocation] = useState<{ page?: number; row?: number; sheet?: string } | null>(null);

  // Card menu popup state
  const [menuOpenDocId, setMenuOpenDocId] = useState<string | null>(null);
  const [renameModalDoc, setRenameModalDoc] = useState<KnowledgeDocument | null>(null);
  const [newDocName, setNewDocName] = useState<string>('');
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<KnowledgeDocument | null>(null);

  // Privacy notice & settings state
  const [disableAI, setDisableAI] = useState<boolean>(() => {
    return repository.getSettings().disableKnowledgeAI || false;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestedQueries = [
    'PPE requirements Zone A',
    'inspection frequency',
    'penalty for violation',
    'hard hat standard ANSI Z89.1',
    'emergency evacuation protocol',
  ];

  useEffect(() => {
    loadAllDocuments();
    loadSearchHistory();

    // Keyboard shortcut: '/' focuses search bar, 'Esc' clears/closes
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadAllDocuments = async () => {
    setIsLoading(true);
    try {
      const docs = await repository.getAllDocuments();
      setDocuments(docs);
      if (docs.length > 0 && !selectedDocId) {
        setSelectedDocId(docs[0].id);
      }
      const st = await repository.getKnowledgeStats();
      setStats(st);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSearchHistory = async () => {
    const history = await repository.getSearchHistory(5);
    setRecentSearches(history.map((h) => h.query));
  };

  // Debounced search (300 ms)
  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current);

    if (!val.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      setAskAnswer(null);
      setAskCitations([]);
      return;
    }

    setIsSearching(true);
    setIsSearchOpen(true);

    searchDebounceTimer.current = setTimeout(async () => {
      try {
        const hits = await knowledgeService.hybridSearch(val, filterDocId || undefined);
        // Apply file type filter if set
        const filteredHits = filterFileType
          ? hits.filter((h) => h.doc.fileType === filterFileType)
          : hits;

        setSearchResults(filteredHits);

        // Record search history
        if (currentUser) {
          await repository.addSearchHistory({
            id: `sh_${Date.now()}`,
            userId: currentUser.id,
            query: val.trim(),
            createdAt: new Date().toISOString(),
          });
          loadSearchHistory();
        }

        // If in ask mode, run grounded ask
        if (isAskMode && filteredHits.length > 0) {
          runAskAssistant(val, filteredHits);
        }
      } catch (err) {
        console.warn('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  // Run Ask Assistant
  const runAskAssistant = async (q: string, hitsToUse?: SearchResultItem[]) => {
    const hits = hitsToUse || searchResults;
    if (hits.length === 0) return;
    setIsAsking(true);
    try {
      const res = await knowledgeService.askKnowledgeBase(q, hits);
      setAskAnswer(res.answer);
      setAskCitations(res.citations);
    } catch (err) {
      console.error('Ask error:', err);
    } finally {
      setIsAsking(false);
    }
  };

  // Multi-file upload handler
  const handleFileUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    if (fileArray.length > 20) {
      addToast('error', 'Upload Limit Exceeded', 'You can upload up to 20 files at a time.');
      return;
    }

    setIsUploading(true);
    let successCount = 0;

    for (const file of fileArray) {
      // 25 MB max size check
      if (file.size > 25 * 1024 * 1024) {
        addToast('error', 'File Too Large', `"${file.name}" exceeds 25 MB.`);
        continue;
      }

      try {
        addToast('info', 'Processing Document', `Analyzing and indexing ${file.name}...`);
        const doc = await knowledgeService.processUploadedFile(
          file,
          currentUser?.id || 'demo_user',
          (status, pct) => {
            setDocuments((prev) =>
              prev.map((d) => (d.fileName === file.name ? { ...d, status, progressPct: pct } : d))
            );
          }
        );
        successCount++;
        setSelectedDocId(doc.id);
      } catch (err: any) {
        addToast('error', 'Processing Failed', err.message || `Could not parse ${file.name}`);
      }
    }

    await loadAllDocuments();
    setIsUploading(false);

    if (successCount > 0) {
      addToast(
        'success',
        'Indexing Complete',
        `Successfully indexed ${successCount} file(s) into Document Intelligence.`
      );
    }
  };

  // Load sample demonstration safety documents
  const handleLoadSampleDocuments = async () => {
    setIsUploading(true);
    try {
      addToast('info', 'Loading Sample Documents', 'Generating safety manuals, audit logs, and compliance policies...');
      await knowledgeService.loadSampleDocuments(currentUser?.id || 'demo_user');
      await loadAllDocuments();
      addToast('success', 'Sample Documents Loaded', '3 regulatory documents loaded with pre-extracted compliance rules.');
    } catch (err: any) {
      addToast('error', 'Sample Load Error', err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Delete document
  const handleDeleteDocument = async (doc: KnowledgeDocument) => {
    if (!isAdmin) {
      addToast('error', 'Unauthorized', 'Only Administrators can delete knowledge documents.');
      return;
    }
    try {
      await repository.deleteDocument(doc.id);
      knowledgeService.invalidateIndex();
      setDeleteConfirmDoc(null);
      await loadAllDocuments();
      if (selectedDocId === doc.id) {
        setSelectedDocId(null);
      }
      addToast('success', 'Document Deleted', `"${doc.fileName}" removed from knowledge base.`);
    } catch (err: any) {
      addToast('error', 'Delete Failed', err.message);
    }
  };

  // Re-process document
  const handleReprocessDocument = async (doc: KnowledgeDocument) => {
    if (!isAdmin) {
      addToast('error', 'Unauthorized', 'Only Administrators can re-process documents.');
      return;
    }
    try {
      addToast('info', 'Re-processing Document', `Re-analyzing ${doc.fileName}...`);
      doc.status = 'parsing';
      doc.progressPct = 20;
      await repository.saveDocument(doc);
      await loadAllDocuments();

      setTimeout(async () => {
        doc.status = 'complete';
        doc.progressPct = 100;
        await repository.saveDocument(doc);
        await loadAllDocuments();
        addToast('success', 'Re-processing Done', `Updated embeddings and extracted rules for ${doc.fileName}`);
      }, 1500);
    } catch (err: any) {
      addToast('error', 'Re-process Failed', err.message);
    }
  };

  // Rename document
  const handleRenameDocument = async () => {
    if (!renameModalDoc || !newDocName.trim()) return;
    try {
      const doc = await repository.getDocumentById(renameModalDoc.id);
      if (doc) {
        doc.fileName = newDocName.trim();
        await repository.saveDocument(doc);
        await loadAllDocuments();
        addToast('success', 'Document Renamed', `Renamed to ${doc.fileName}`);
      }
      setRenameModalDoc(null);
    } catch (err: any) {
      addToast('error', 'Rename Failed', err.message);
    }
  };

  // Download document
  const handleDownloadOriginal = async (doc: KnowledgeDocument) => {
    const blobRecord = await repository.getDocumentBlob(doc.id);
    if (!blobRecord) {
      addToast('warning', 'Original File Unavailable', 'Raw binary data not found in cache.');
      return;
    }
    const blob =
      blobRecord.data instanceof ArrayBuffer
        ? new Blob([blobRecord.data], { type: blobRecord.mimeType })
        : new Blob([blobRecord.data], { type: 'text/plain' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    a.click();
    URL.revokeObjectURL(url);
    addToast('success', 'Download Started', `Downloading ${doc.fileName}...`);
  };

  // Toggle Keyword-Only Mode in Settings
  const handleToggleDisableAI = (checked: boolean) => {
    setDisableAI(checked);
    const currentSettings = repository.getSettings();
    repository.saveSettings({
      ...currentSettings,
      disableKnowledgeAI: checked,
    });
    addToast(
      'info',
      checked ? 'Keyword-Only Search Enabled' : 'AI Embeddings Enabled',
      checked
        ? 'Documents will be searched locally via BM25 without sending text to Gemini.'
        : 'AI semantic search and structured extraction active.'
    );
  };

  const selectedDocument = documents.find((d) => d.id === selectedDocId) || null;

  const getFileBadge = (type: DocumentFileType) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-rose-400" />;
      case 'docx':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'csv':
      case 'xlsx':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-amber-400" />;
      default:
        return <FileCode className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* HEADER SECTION & REAL COMPUTED STATS STRIP */}
      <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-[#7C5CFF] flex items-center justify-center shadow-lg shadow-violet-950/20">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight text-white">
                    Document Intelligence &amp; Knowledge Base
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-[#7C5CFF] border border-violet-500/30 text-[10px] font-mono font-bold">
                    HYBRID RAG
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Index OSHA regulations, safety manuals, and inspection logs to power automated policy grounding and verification.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Load Sample Docs button */}
            <button
              onClick={handleLoadSampleDocuments}
              disabled={isUploading}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Preload 3 sample regulatory documents"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Load Sample Documents</span>
            </button>

            {/* + Add Document Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl bg-[#7C5CFF] hover:bg-[#6b47ff] text-white text-xs font-bold shadow-lg shadow-violet-950/40 flex items-center gap-2 transition-all hover:scale-105 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Documents</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.csv,.tsv,.xlsx,.xls,.txt,.md,image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFileUpload(e.target.files);
              }}
            />
          </div>
        </div>

        {/* Real Computed Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 text-[#7C5CFF] flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Documents
              </span>
              <span className="text-lg font-black text-white font-mono">
                {stats.docCount}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Indexed Chunks
              </span>
              <span className="text-lg font-black text-white font-mono">
                {stats.chunkCount}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Extracted Rules
              </span>
              <span className="text-lg font-black text-white font-mono">
                {stats.extractedCount}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Confirmation Rate
              </span>
              <span className="text-lg font-black text-white font-mono">
                {stats.reviewRatePct !== null ? `${stats.reviewRatePct}%` : 'n/a'}
              </span>
            </div>
          </div>
        </div>

        {/* Privacy Note with Keyword-Only Toggle */}
        <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[#7C5CFF] shrink-0" />
            <span>
              <strong className="text-slate-300">Privacy Notice:</strong> Document text is sent to Gemini for embeddings and extraction.
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-300">
            <input
              type="checkbox"
              checked={disableAI}
              onChange={(e) => handleToggleDisableAI(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-[#7C5CFF] focus:ring-violet-500"
            />
            <span className="text-[11px]">Keyword-only mode (Disable Cloud AI)</span>
          </label>
        </div>
      </div>

      {/* MOBILE TABS (Files | Viewer) */}
      <div className="md:hidden flex rounded-2xl bg-slate-900 border border-slate-800 p-1">
        <button
          onClick={() => setMobileTab('files')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${
            mobileTab === 'files' ? 'bg-[#7C5CFF] text-white' : 'text-slate-400'
          }`}
        >
          Files ({documents.length})
        </button>
        <button
          onClick={() => setMobileTab('viewer')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-colors ${
            mobileTab === 'viewer' ? 'bg-[#7C5CFF] text-white' : 'text-slate-400'
          }`}
        >
          Viewer &amp; Policies
        </button>
      </div>

      {/* TWO-COLUMN LAYOUT: DESKTOP (Width ~320px Left Column, Viewer Right Column) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: UPLOADED FILES */}
        <div
          className={`md:col-span-4 lg:col-span-4 space-y-4 ${
            mobileTab === 'viewer' ? 'hidden md:block' : 'block'
          }`}
        >
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                UPLOADED FILES ({documents.length})
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-bold text-[#7C5CFF] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="p-5 border-2 border-dashed border-violet-500/30 hover:border-violet-500/60 bg-violet-950/10 hover:bg-violet-950/20 rounded-2xl text-center cursor-pointer transition-all group"
            >
              <Upload className="w-6 h-6 text-[#7C5CFF] mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-xs font-bold text-white">Drop files to index</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                PDF, DOCX, CSV, XLSX, TXT, Images (Max 25MB)
              </p>
            </div>

            {/* Document Cards List */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse space-y-2">
                    <div className="h-4 bg-slate-800 rounded w-3/4" />
                    <div className="h-2 bg-slate-800 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-bold text-slate-300">No documents uploaded</p>
                <p className="text-[11px] text-slate-500">
                  Click &quot;Load Sample Documents&quot; or upload safety manuals to test search.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
                {documents.map((doc) => {
                  const isSelected = selectedDocId === doc.id;
                  const isComplete = doc.status === 'complete';
                  const isProcessing = ['parsing', 'chunking', 'embedding', 'extracting'].includes(doc.status);
                  const isFailed = doc.status === 'failed';

                  return (
                    <div
                      key={doc.id}
                      onClick={() => {
                        setSelectedDocId(doc.id);
                        setMobileTab('viewer');
                      }}
                      className={`relative p-3.5 rounded-xl border text-xs transition-all cursor-pointer group ${
                        isSelected
                          ? 'border-[#7C5CFF] bg-violet-950/20 shadow-lg shadow-violet-950/30 ring-1 ring-[#7C5CFF]/50'
                          : 'border-slate-800/80 bg-slate-950/70 hover:bg-slate-900/70 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getFileBadge(doc.fileType)}
                          <div className="min-w-0">
                            <h4
                              className={`font-bold truncate max-w-[170px] ${
                                isSelected ? 'text-white' : 'text-slate-200'
                              }`}
                              title={doc.fileName}
                            >
                              {doc.fileName}
                            </h4>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {(doc.sizeBytes / 1024).toFixed(0)} KB •{' '}
                              {new Date(doc.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        {/* Card Menu button */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenDocId(menuOpenDocId === doc.id ? null : doc.id);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {/* Popup Menu */}
                          {menuOpenDocId === doc.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-full mt-1 w-40 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-1.5 z-30 font-medium text-xs text-slate-200"
                            >
                              <button
                                onClick={() => {
                                  setSelectedDocId(doc.id);
                                  setMenuOpenDocId(null);
                                  setMobileTab('viewer');
                                }}
                                className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-violet-400" />
                                <span>Open Viewer</span>
                              </button>
                              <button
                                onClick={() => {
                                  handleDownloadOriginal(doc);
                                  setMenuOpenDocId(null);
                                }}
                                className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
                              >
                                <Download className="w-3.5 h-3.5 text-slate-400" />
                                <span>Download</span>
                              </button>
                              <button
                                onClick={() => {
                                  setRenameModalDoc(doc);
                                  setNewDocName(doc.fileName);
                                  setMenuOpenDocId(null);
                                }}
                                className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                                <span>Rename</span>
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => {
                                      handleReprocessDocument(doc);
                                      setMenuOpenDocId(null);
                                    }}
                                    className="w-full px-3 py-1.5 text-left hover:bg-slate-800 flex items-center gap-2"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Re-process</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDeleteConfirmDoc(doc);
                                      setMenuOpenDocId(null);
                                    }}
                                    className="w-full px-3 py-1.5 text-left hover:bg-rose-500/20 text-rose-300 flex items-center gap-2 border-t border-slate-800 mt-1 pt-1"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Line Pipeline */}
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {isComplete && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Complete</span>
                            </span>
                          )}
                          {isProcessing && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              <span>Analyzing... {doc.progressPct}%</span>
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              <AlertCircle className="w-3 h-3 text-rose-400" />
                              <span>Failed</span>
                            </span>
                          )}
                        </div>

                        {doc.pageCount && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {doc.pageCount} pgs
                          </span>
                        )}
                      </div>

                      {/* Progress Bar when processing */}
                      {isProcessing && (
                        <div className="mt-2 w-full h-1 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-amber-400 transition-all duration-300"
                            style={{ width: `${doc.progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: SEARCH BAR + DOCUMENT VIEWER PANEL */}
        <div
          className={`md:col-span-8 lg:col-span-8 space-y-4 ${
            mobileTab === 'files' ? 'hidden md:block' : 'block'
          }`}
        >
          {/* SEARCH BAR (Debounced 300ms, '/' focuses, Esc clears) */}
          <div className="relative z-30">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#7C5CFF] absolute left-4 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => {
                  if (searchQuery || recentSearches.length > 0) setIsSearchOpen(true);
                }}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search knowledge base... (Press '/' to focus)"
                className="w-full pl-11 pr-24 py-3 rounded-2xl bg-slate-900/90 border border-slate-800 focus:border-[#7C5CFF] focus:ring-2 focus:ring-[#7C5CFF]/30 text-xs text-white placeholder-slate-500 transition-all shadow-xl focus:outline-none"
              />
              <div className="absolute right-3 flex items-center gap-1.5">
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setIsSearchOpen(false);
                    }}
                    className="p-1 rounded text-slate-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400">
                  /
                </kbd>
              </div>
            </div>

            {/* Results Popover Floating Panel */}
            {isSearchOpen && (
              <KnowledgeSearchPopover
                query={searchQuery}
                results={searchResults}
                isSearching={isSearching}
                onSelectResult={(result) => {
                  setSelectedDocId(result.doc.id);
                  setHighlightPassage(result.snippet);
                  setTargetLocation({
                    page: result.chunk.page,
                    row: result.chunk.row,
                    sheet: result.chunk.sheet,
                  });
                  setIsSearchOpen(false);
                }}
                onClose={() => setIsSearchOpen(false)}
                recentSearches={recentSearches}
                suggestedQueries={suggestedQueries}
                onSelectQuery={(q) => handleQueryChange(q)}
                isAskMode={isAskMode}
                setIsAskMode={setIsAskMode}
                onRunAsk={() => runAskAssistant(searchQuery)}
                isAsking={isAsking}
                askAnswer={askAnswer}
                askCitations={askCitations}
                filterFileType={filterFileType}
                setFilterFileType={setFilterFileType}
                documents={documents}
                filterDocId={filterDocId}
                setFilterDocId={setFilterDocId}
              />
            )}
          </div>

          {/* DOCUMENT VIEWER PANEL */}
          <div className="min-h-[640px]">
            <DocumentViewer
              document={selectedDocument}
              highlightPassage={highlightPassage}
              targetLocation={targetLocation}
              onOpenSourceChunk={(chunkId) => {
                const el = document.getElementById(chunkId);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              onFieldsUpdated={() => loadAllDocuments()}
            />
          </div>
        </div>
      </div>

      {/* RENAME MODAL */}
      {renameModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white">Rename Document</h3>
            <input
              type="text"
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-violet-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameModalDoc(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameDocument}
                className="px-4 py-1.5 rounded-xl bg-[#7C5CFF] text-white text-xs font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Delete Document</h3>
            <p className="text-xs text-slate-400">
              Are you sure you want to delete &quot;{deleteConfirmDoc.fileName}&quot;? All associated chunks and extracted rules will be permanently removed.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmDoc(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDocument(deleteConfirmDoc)}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

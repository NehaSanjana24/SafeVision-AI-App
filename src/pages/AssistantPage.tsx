import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bot,
  Send,
  Square,
  Image as ImageIcon,
  X,
  Plus,
  Trash2,
  Edit2,
  Search,
  Copy,
  RotateCcw,
  Network,
  Workflow,
  Sparkles,
  Check,
  Shield,
  Layers,
  ChevronLeft,
  ChevronRight,
  Mic,
  Cpu,
  ShieldAlert,
  SlidersHorizontal,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { repository } from '../services/storage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Conversation,
  Message,
  WorkflowRun,
  ToolTraceStep,
  AgentCitation,
} from '../types';
import { buildAgentGraph, AgentState } from '../services/agent/agentService';
import { AgentStatusChip, AgentStatusType } from '../components/assistant/AgentStatusChip';
import { ToolTraceAccordion } from '../components/assistant/ToolTraceAccordion';
import { CitationChip } from '../components/assistant/CitationChip';
import { WorkflowsPanel } from '../components/assistant/WorkflowsPanel';
import { AgentGraphModal } from '../components/assistant/AgentGraphModal';
import { MarkdownMessage } from '../components/assistant/MarkdownMessage';
import { LiveVoiceModal } from '../components/assistant/LiveVoiceModal';
import { getAgentEngineBadge } from '../utils/env';

export const AssistantPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();

  // Settings
  const settings = repository.getSettings();
  const agentName = settings.agentName || 'SafeVision Agent';

  // Multi-turn Model & Persona State
  const [selectedModel, setSelectedModel] = useState<'gemini-3.8-flash' | 'gemini-3.1-flash-lite' | 'gemini-4-argon'>('gemini-3.8-flash');
  const [selectedRole, setSelectedRole] = useState<'osha' | 'inspector' | 'investigator'>('osha');

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [convSearch, setConvSearch] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachedImage, setAttachedImage] = useState<{ base64: string; name: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Agent Execution State
  const [status, setStatus] = useState<AgentStatusType>('idle');
  const [currentTool, setCurrentTool] = useState<string | undefined>(undefined);
  const [activeNode, setActiveNode] = useState<string | undefined>(undefined);
  const [streamingTokens, setStreamingTokens] = useState<string>('');
  const [liveToolTrace, setLiveToolTrace] = useState<ToolTraceStep[]>([]);
  const [liveCitations, setLiveCitations] = useState<AgentCitation[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Active Workflows
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [isWorkflowsOpen, setIsWorkflowsOpen] = useState(true);

  // Modals
  const [showGraphModal, setShowGraphModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Copy state
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  // Keyboard shortcut: "/" to focus input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== inputRef.current &&
        !(document.activeElement instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-scroll on new message or streaming tokens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingTokens]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId);
      loadWorkflows(activeConvId);
    }
  }, [activeConvId]);

  // Handle incoming deep link prompt
  useEffect(() => {
    const deepPrompt = searchParams.get('prompt');
    if (deepPrompt && activeConvId) {
      handleSend(deepPrompt);
    }
  }, [searchParams, activeConvId]);

  const loadConversations = async () => {
    const all = await repository.getAllConversations();
    setConversations(all);
    if (all.length > 0) {
      setActiveConvId(all[0].id);
    } else {
      await createNewConversation();
    }
  };

  const loadMessages = async (convId: string) => {
    const msgs = await repository.getMessagesByConversationId(convId);
    setMessages(msgs);
  };

  const loadWorkflows = async (convId: string) => {
    const wfs = await repository.getWorkflowRunsByConversationId(convId);
    setWorkflowRuns(wfs);
  };

  const createNewConversation = async () => {
    const newConv: Conversation = {
      id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      userId: currentUser?.id || 'demo_user',
      title: 'New Safety Inquiry',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repository.saveConversation(newConv);
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);
    setMessages([]);
    setWorkflowRuns([]);
    return newConv;
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await repository.deleteConversation(convId);
    const updated = conversations.filter((c) => c.id !== convId);
    setConversations(updated);
    if (activeConvId === convId) {
      setActiveConvId(updated[0]?.id || null);
    }
    addToast('info', 'Conversation deleted');
  };

  const handleStartRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleSaveRename = async (convId: string) => {
    if (!editingTitle.trim()) {
      setEditingConvId(null);
      return;
    }
    const conv = await repository.getConversationById(convId);
    if (conv) {
      conv.title = editingTitle.trim();
      conv.updatedAt = new Date().toISOString();
      await repository.saveConversation(conv);
      setConversations((prev) => prev.map((c) => (c.id === convId ? conv : c)));
    }
    setEditingConvId(null);
  };

  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      addToast('error', 'Invalid file type', 'Please select an image file (PNG, JPG, WebP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast('error', 'Image too large', 'Image must be under 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage({
        base64: reader.result as string,
        name: file.name,
      });
      addToast('info', 'Image attached for visual inspection');
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          handleImageSelect(file);
          break;
        }
      }
    }
  };

  const handleSend = async (overridePrompt?: string) => {
    const textToSend = overridePrompt !== undefined ? overridePrompt : inputText;
    if (!textToSend.trim() && !attachedImage) return;

    let targetConvId = activeConvId;
    if (!targetConvId) {
      const created = await createNewConversation();
      targetConvId = created.id;
    }

    // Auto-update conversation title if first message
    const currentMsgs = await repository.getMessagesByConversationId(targetConvId);
    if (currentMsgs.length === 0) {
      const conv = await repository.getConversationById(targetConvId);
      if (conv) {
        conv.title = textToSend.slice(0, 32) || (attachedImage ? 'Visual Inspection' : 'Safety Inquiry');
        await repository.saveConversation(conv);
        setConversations((prev) => prev.map((c) => (c.id === targetConvId ? conv : c)));
      }
    }

    // Save user message
    const userMsg: Message = {
      id: `msg_user_${Date.now()}`,
      conversationId: targetConvId,
      role: 'user',
      content: textToSend.trim(),
      attachment: attachedImage
        ? {
            name: attachedImage.name,
            type: 'image',
            base64: attachedImage.base64,
          }
        : undefined,
      createdAt: new Date().toISOString(),
    };
    await repository.saveMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);

    const sentImage = attachedImage;
    setInputText('');
    setAttachedImage(null);

    // Setup Agent Execution
    setStatus('reasoning');
    setStreamingTokens('');
    setLiveToolTrace([]);
    setLiveCitations([]);
    abortControllerRef.current = new AbortController();

    const graph = buildAgentGraph({
      onNodeStart: (node) => {
        setActiveNode(node);
        if (['visual_inspector', 'violation_search', 'doc_retriever', 'compliance_calculator'].includes(node)) {
          setStatus('calling_tool');
          setCurrentTool(node.replace('_', ' '));
        } else if (node === 'generate') {
          setStatus('writing_answer');
          setCurrentTool(undefined);
        } else {
          setStatus('reasoning');
          setCurrentTool(undefined);
        }
      },
      onToken: (_token, accumulated) => {
        setStreamingTokens(accumulated);
      },
      onToolTrace: (trace) => {
        setLiveToolTrace((prev) => [...prev, trace]);
      },
      onCitations: (citations) => {
        setLiveCitations(citations);
      },
      onWorkflow: (wf) => {
        setWorkflowRuns((prev) => [wf, ...prev.filter((r) => r.id !== wf.id)]);
      },
      onComplete: async () => {
        setStatus('idle');
        setActiveNode(undefined);
        setStreamingTokens('');
        setLiveToolTrace([]);
        setLiveCitations([]);
        const refreshed = await repository.getMessagesByConversationId(targetConvId!);
        setMessages(refreshed);
        const wfs = await repository.getWorkflowRunsByConversationId(targetConvId!);
        setWorkflowRuns(wfs);
      },
      onError: (err) => {
        setStatus('error');
        addToast('error', 'Agent run failed', String(err));
      },
    });

    const initialState: AgentState = {
      conversationId: targetConvId,
      userMessage: textToSend.trim() || 'Inspect this image for PPE violations and cite relevant policy.',
      imageAttachment: sentImage || undefined,
      intent: sentImage ? 'visual_inspection' : 'general_qa',
      entities: {},
      toolTrace: [],
      citations: [],
      responseTokens: [],
      fullResponseText: '',
      requiresSupervisorApproval: false,
      workflowRuns: [],
    };

    try {
      await graph.invoke(initialState, abortControllerRef.current.signal);
    } catch (err: any) {
      if (err.message?.includes('aborted')) {
        addToast('info', 'Agent execution stopped');
      } else {
        console.error('StateGraph error:', err);
        addToast('error', 'Execution Error', err.message || 'Error executing agent graph');
      }
      setStatus('idle');
      setActiveNode(undefined);
      setStreamingTokens('');
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setStatus('idle');
    setActiveNode(undefined);
  };

  const handleRegenerate = async () => {
    if (messages.length === 0) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;
    await handleSend(lastUserMsg.content);
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    addToast('info', 'Message copied to clipboard');
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(convSearch.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-slate-950 text-slate-100">
      {/* 1. LEFT CONVERSATION SIDEBAR */}
      <div
        className={`${
          isSidebarOpen ? 'w-64 sm:w-72' : 'w-0'
        } transition-all duration-200 border-r border-slate-800 bg-slate-900/90 flex flex-col shrink-0 overflow-hidden relative`}
      >
        <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={createNewConversation}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            title="Fold Conversations sidebar"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <div className="px-3.5 py-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {filteredConversations.map((conv) => {
            const isActive = conv.id === activeConvId;
            const isEditing = conv.id === editingConvId;

            return (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                  isActive
                    ? 'bg-purple-950/40 text-purple-200 border border-purple-800/60 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editingTitle}
                    autoFocus
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => handleSaveRename(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename(conv.id);
                      if (e.key === 'Escape') setEditingConvId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-slate-950 px-2 py-0.5 rounded border border-purple-500 text-xs text-slate-100 focus:outline-none"
                  />
                ) : (
                  <>
                    <span className="truncate flex-1">{conv.title}</span>
                    <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-1">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(conv, e)}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* FOLDED LEFT RAIL (WHEN CONVERSATIONS CLOSED) */}
      {!isSidebarOpen && (
        <div className="border-r border-slate-800 bg-slate-900/95 flex flex-col items-center py-3 px-1.5 gap-2.5 shrink-0 z-10 transition-all">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            title="Expand Conversations (Chats)"
            className="p-2 rounded-xl text-slate-400 hover:text-purple-300 hover:bg-slate-800 transition-colors"
          >
            <PanelLeft className="w-4 h-4 text-purple-400" />
          </button>
          <button
            type="button"
            onClick={createNewConversation}
            title="Start New Chat"
            className="p-2 rounded-xl text-slate-400 hover:text-purple-300 hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="w-4 h-px bg-slate-800 my-1" />
          <span
            className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-semibold cursor-pointer select-none hover:text-purple-300 transition-colors"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            onClick={() => setIsSidebarOpen(true)}
            title="Click to expand conversations"
          >
            Chats ({conversations.length})
          </span>
        </div>
      )}

      {/* 2. CENTER CHAT CARD */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative h-full">
        {/* Orderly Unified Chat Header */}
        <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex items-center justify-between gap-3">
          {/* Cluster 1: Left Navigation & Agent Identity */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isSidebarOpen
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-purple-950/40 text-purple-300 border-purple-800/60 hover:bg-purple-900/50'
              }`}
              title={isSidebarOpen ? 'Fold Conversations' : 'Expand Conversations'}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>

            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold text-slate-100 truncate">{agentName}</h2>
                <AgentStatusChip status={status} currentTool={currentTool} />
                <span
                  className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  title="Agent Execution Engine"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {getAgentEngineBadge()}
                </span>
              </div>
            </div>
          </div>

          {/* Cluster 2: Center - Docked Persona & Model Configuration */}
          <div className="hidden lg:flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5 shadow-sm">
            {/* Role / Persona Selector */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] text-slate-400 font-medium">Role:</span>
              <select
                value={selectedRole}
                onChange={(e: any) => setSelectedRole(e.target.value)}
                className="bg-transparent text-[11px] font-medium text-slate-200 focus:outline-none cursor-pointer pr-1"
                title="Select safety agent persona"
              >
                <option value="osha" className="bg-slate-900 text-slate-200">
                  OSHA Compliance
                </option>
                <option value="inspector" className="bg-slate-900 text-slate-200">
                  Field Inspector
                </option>
                <option value="investigator" className="bg-slate-900 text-slate-200">
                  Incident Lead
                </option>
              </select>
            </div>

            <div className="w-px h-4 bg-slate-800" />

            {/* Model Selector */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
              <Cpu className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="text-[11px] text-slate-400 font-medium">Model:</span>
              <select
                value={selectedModel}
                onChange={(e: any) => setSelectedModel(e.target.value)}
                className="bg-transparent text-[11px] font-mono text-purple-300 focus:outline-none cursor-pointer pr-1"
                title="Select Gemini model"
              >
                <option value="gemini-3.8-flash" className="bg-slate-900 text-slate-200">
                  gemini-3.8-flash (General)
                </option>
                <option value="gemini-3.1-flash-lite" className="bg-slate-900 text-slate-200">
                  gemini-3.1-flash-lite (Fast)
                </option>
                <option value="gemini-4-argon" className="bg-slate-900 text-slate-200">
                  gemini-4-argon (Complex)
                </option>
              </select>
            </div>
          </div>

          {/* Cluster 3: Right - Ordered Actions & Sidebars Deck */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Live Voice Conversation Button */}
            <button
              type="button"
              onClick={() => setShowVoiceModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-md shadow-emerald-950/20 transition-all cursor-pointer"
              title="Start real-time voice conversation with gemini-3.8-live"
            >
              <Mic className="w-3.5 h-3.5 text-slate-950" />
              <span className="hidden sm:inline">Voice Session</span>
            </button>

            {/* Compact Tool Deck: Architecture & Max Space */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setShowGraphModal(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="How the Agent Works (LangGraph StateGraph Architecture)"
              >
                <Network className="w-4 h-4 text-purple-400" />
              </button>

              <div className="w-px h-4 bg-slate-800 mx-0.5" />

              <button
                type="button"
                onClick={() => {
                  const willMaximize = isSidebarOpen || isWorkflowsOpen;
                  setIsSidebarOpen(!willMaximize);
                  setIsWorkflowsOpen(!willMaximize);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  !isSidebarOpen && !isWorkflowsOpen
                    ? 'text-purple-400 bg-purple-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title={
                  isSidebarOpen || isWorkflowsOpen
                    ? 'Maximize Chat (Fold sidebars for maximum space)'
                    : 'Restore sidebars'
                }
              >
                {!isSidebarOpen && !isWorkflowsOpen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Active Workflows Fold/Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsWorkflowsOpen(!isWorkflowsOpen)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                isWorkflowsOpen
                  ? 'bg-purple-950/50 text-purple-200 border-purple-700/80 shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800 hover:bg-slate-800'
              }`}
              title={isWorkflowsOpen ? 'Fold Active Workflows panel' : 'Expand Active Workflows panel'}
            >
              <Workflow className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Workflows</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {workflowRuns.length}
              </span>
              {isWorkflowsOpen ? (
                <PanelRightClose className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <PanelRight className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar">
          {messages.length === 0 && !streamingTokens && (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4 shadow-lg shadow-purple-500/5">
                <Shield className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-100">
                SafeVision AI Workplace Safety Copilot
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 max-w-md leading-relaxed">
                Ask about OSHA 1926/1910 standards, analyze jobsite CCTV scans, verify zone PPE
                mandates, or attach a photo for automated visual inspection.
              </p>

              {/* Starter Prompt Pills */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                <button
                  type="button"
                  onClick={() => handleSend('Why was there a safety violation alert in Zone A this morning?')}
                  className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 transition-all text-xs text-slate-300 group"
                >
                  <span className="font-semibold text-purple-400 block group-hover:text-purple-300">
                    Zone A Morning Alert
                  </span>
                  <span className="text-[11px] text-slate-400 line-clamp-1">
                    "Why was there a safety violation alert in Zone A this morning?"
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSend('What PPE is required in Zone D?')}
                  className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 transition-all text-xs text-slate-300 group"
                >
                  <span className="font-semibold text-purple-400 block group-hover:text-purple-300">
                    Zone D Regulations
                  </span>
                  <span className="text-[11px] text-slate-400 line-clamp-1">
                    "What PPE is required in Zone D?"
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSend('Summarize this week\'s helmet violations and compliance trends.')}
                  className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 transition-all text-xs text-slate-300 group"
                >
                  <span className="font-semibold text-purple-400 block group-hover:text-purple-300">
                    Compliance Summary
                  </span>
                  <span className="text-[11px] text-slate-400 line-clamp-1">
                    "Summarize this week's helmet violations"
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 rounded-xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/50 transition-all text-xs text-slate-300 group"
                >
                  <span className="font-semibold text-purple-400 block group-hover:text-purple-300">
                    Visual Inspection
                  </span>
                  <span className="text-[11px] text-slate-400 line-clamp-1">
                    "Check this photo for PPE issues" (attach image)
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Render Message List */}
          {messages.map((msg) => {
            const isUser = msg.role === 'user';

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`space-y-2 max-w-2xl ${isUser ? 'items-end' : 'items-start'}`}>
                  {/* Tool Trace Accordion if message contains tool steps */}
                  {!isUser && msg.toolTrace && msg.toolTrace.length > 0 && (
                    <ToolTraceAccordion steps={msg.toolTrace} />
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`p-4 rounded-2xl shadow-sm text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? 'bg-purple-600 text-white rounded-tr-none'
                        : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none'
                    }`}
                  >
                    {/* Attached Image Preview if User */}
                    {isUser && msg.attachment?.base64 && (
                      <div className="mb-2.5 rounded-lg overflow-hidden border border-white/20 max-w-xs">
                        <img
                          src={msg.attachment.base64}
                          alt={msg.attachment.name || 'Attachment'}
                          className="w-full h-auto object-cover max-h-48"
                        />
                      </div>
                    )}

                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MarkdownMessage content={msg.content} />
                    )}
                  </div>

                  {/* Citations Chips under Assistant Answer */}
                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.citations.map((c, idx) => (
                        <CitationChip key={idx} citation={c} />
                      ))}
                    </div>
                  )}

                  {/* Bubble Actions */}
                  {!isUser && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 pl-1">
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="hover:text-slate-300 flex items-center gap-1 transition-colors"
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Streaming Assistant Response */}
          {status !== 'idle' && (
            <div className="flex gap-3 max-w-3xl mr-auto justify-start">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0 mt-1">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>

              <div className="space-y-2 max-w-2xl items-start">
                {liveToolTrace.length > 0 && <ToolTraceAccordion steps={liveToolTrace} />}

                <div className="p-4 rounded-2xl bg-slate-900/90 border border-purple-500/30 text-slate-200 rounded-tl-none shadow-sm">
                  {streamingTokens ? (
                    <MarkdownMessage content={streamingTokens} />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                      <span>
                        {status === 'reasoning'
                          ? 'Evaluating safety regulations and multimodal evidence...'
                          : status === 'calling_tool'
                          ? `Querying ${currentTool || 'inspection tools'}...`
                          : 'Synthesizing response...'}
                      </span>
                    </div>
                  )}
                </div>

                {liveCitations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {liveCitations.map((c, idx) => (
                      <CitationChip key={idx} citation={c} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 backdrop-blur">
          {attachedImage && (
            <div className="mb-3 flex items-center gap-2.5 p-2 rounded-xl bg-slate-950 border border-slate-800 w-fit">
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                <img
                  src={attachedImage.base64}
                  alt={attachedImage.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-xs">
                <p className="font-medium text-slate-200 truncate max-w-[200px]">{attachedImage.name}</p>
                <p className="text-[10px] text-purple-400">Attached for PPE detection</p>
              </div>
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) handleImageSelect(file);
            }}
            onPaste={handlePaste}
            className={`relative flex items-end gap-2 p-2 rounded-2xl bg-slate-950 border transition-all ${
              isDragging ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-800 focus-within:border-purple-500'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageSelect(f);
              }}
              accept="image/*"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors shrink-0"
              title="Attach inspection image"
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (status === 'idle') handleSend();
                }
              }}
              placeholder="Ask about workplace safety or upload an image (Press / to focus)..."
              rows={1}
              className="flex-1 bg-transparent border-0 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-32 py-2"
            />

            {status !== 'idle' ? (
              <button
                type="button"
                onClick={handleStop}
                className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-colors shrink-0"
                title="Stop execution"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!inputText.trim() && !attachedImage}
                className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white shadow-sm transition-all shrink-0 cursor-pointer"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. RIGHT ACTIVE WORKFLOWS PANEL */}
      {isWorkflowsOpen ? (
        <WorkflowsPanel
          workflowRuns={workflowRuns}
          onRefresh={() => activeConvId && loadWorkflows(activeConvId)}
          onClose={() => setIsWorkflowsOpen(false)}
          onCloseMobile={() => setIsWorkflowsOpen(false)}
        />
      ) : (
        <aside
          aria-label="Workflows rail"
          className="hidden sm:flex border-l border-slate-800 bg-slate-900/90 flex-col items-center py-3 px-1.5 gap-2.5 shrink-0 z-10 transition-all select-none"
        >
          <button
            type="button"
            onClick={() => setIsWorkflowsOpen(true)}
            title="Expand Active Workflows (Right panel)"
            className="p-2 rounded-xl text-slate-400 hover:text-purple-300 hover:bg-slate-800/80 transition-colors relative group"
          >
            <PanelRight className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
            {workflowRuns.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-purple-400 absolute top-1 right-1 ring-2 ring-slate-900 animate-pulse" />
            )}
          </button>
          <div className="w-4 h-px bg-slate-800 my-1" />
          <button
            type="button"
            onClick={() => setIsWorkflowsOpen(true)}
            title="Expand Active Workflows"
            className="text-[10px] font-mono uppercase tracking-widest text-slate-500 hover:text-purple-300 font-semibold cursor-pointer transition-colors py-2"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            Workflows {workflowRuns.length > 0 ? `(${workflowRuns.length})` : ''}
          </button>
        </aside>
      )}

      {/* Modals */}
      <AgentGraphModal
        isOpen={showGraphModal}
        onClose={() => setShowGraphModal(false)}
        activeNode={activeNode}
      />

      <LiveVoiceModal
        isOpen={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onTranscriptReceived={(text, isUser) => {
          if (!isUser && text) {
            // Live voice feedback can optionally be logged into conversation
          }
        }}
      />
    </div>
  );
};

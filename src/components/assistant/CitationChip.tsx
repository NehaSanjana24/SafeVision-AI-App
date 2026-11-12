import React from 'react';
import { BookOpen, ShieldAlert, ExternalLink } from 'lucide-react';
import { AgentCitation } from '../../types';
import { useNavigate } from 'react-router-dom';

interface CitationChipProps {
  citation: AgentCitation;
  onInspectEvidence?: (violationId: string) => void;
}

export const CitationChip: React.FC<CitationChipProps> = ({ citation, onInspectEvidence }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (citation.type === 'document') {
      if (citation.docId) {
        navigate(`/knowledge?docId=${citation.docId}&chunkId=${citation.chunkId || ''}`);
      } else {
        navigate('/knowledge');
      }
    } else if (citation.type === 'violation' || citation.type === 'scan') {
      if (citation.violationId && onInspectEvidence) {
        onInspectEvidence(citation.violationId);
      } else {
        navigate(`/alerts?target=${citation.violationId || citation.scanId || ''}`);
      }
    }
  };

  const isDoc = citation.type === 'document';

  return (
    <button
      type="button"
      onClick={handleClick}
      title={citation.excerpt || citation.label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all duration-150 cursor-pointer text-left ${
        isDoc
          ? 'bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border-purple-800/60 hover:border-purple-600'
          : 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border-amber-800/60 hover:border-amber-600'
      }`}
    >
      {isDoc ? (
        <BookOpen className="w-3 h-3 text-purple-400 shrink-0" />
      ) : (
        <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
      )}
      <span className="truncate max-w-[220px] font-mono text-[11px]">{citation.label}</span>
      <ExternalLink className="w-2.5 h-2.5 opacity-60 hover:opacity-100 shrink-0" />
    </button>
  );
};

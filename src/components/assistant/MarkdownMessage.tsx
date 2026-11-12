import React from 'react';
import DOMPurify from 'dompurify';

interface MarkdownMessageProps {
  content: string;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  // Simple fast robust parser for safety markdown
  const parseMarkdown = (text: string): string => {
    let html = text
      // Headers
      .replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-slate-100 mt-2 mb-1">$1</h3>')
      .replace(/^#### (.*$)/gim, '<h4 class="text-xs font-bold text-purple-300 mt-2 mb-1 uppercase tracking-wider">$1</h4>')
      .replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-slate-100 mt-2.5 mb-1.5">$1</h2>')
      // Bold & Italic
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-100">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-slate-300">$1</em>')
      // Code blocks and inline code
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono text-[11px]">$1</code>')
      // Blockquotes
      .replace(/^\> (.*$)/gim, '<blockquote class="border-l-2 border-purple-500 pl-3 py-1 my-2 text-slate-300 italic bg-purple-950/20 rounded-r text-xs">$1</blockquote>')
      // Bullet lists
      .replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-slate-300 text-xs my-0.5">$1</li>')
      .replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="ml-4 list-decimal text-slate-300 text-xs my-0.5"><span class="font-semibold text-slate-200">$1.</span> $2</li>')
      // Line breaks
      .replace(/\n\n/g, '<div class="h-2"></div>')
      .replace(/\n/g, '<br/>');

    return DOMPurify.sanitize(html);
  };

  return (
    <div
      className="text-xs sm:text-sm text-slate-200 leading-relaxed space-y-1.5 break-words"
      dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
    />
  );
};

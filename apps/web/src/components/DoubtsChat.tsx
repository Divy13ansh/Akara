import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Logo } from './Logo';
import { conceptMediaService } from '../services/conceptMediaService';
import { parseError } from '../services/http';

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

interface DoubtsChatProps {
  topicName?: string;
  conceptId?: string;
  language?: string;
}

function greetingFor(topicName: string, language?: string): string {
  const lang = (language || 'hi').toLowerCase();
  if (lang.startsWith('hi')) {
    return `Namaste! Ye video dekhte hue ${topicName} par koi bhi doubt ho to bejhijhak poochho!`;
  }
  return `Hello! If you have any doubts while watching this video on ${topicName}, ask me anytime!`;
}

/** Minimal readable renderer: paragraphs, **bold**, `code`, and line lists. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Math first: \(...\), \[...\], $$...$$ segments become KaTeX equations
  // (ChatGPT-style). Everything else keeps the bold/code treatment.
  const segments = text.split(/(\\\(.+?\\\)|\\\[.+?\\\]|\$\$.+?\$\$)/gs);
  return segments.map((seg, i) => {
    const math = seg.match(/^(\\\((.+?)\\\)|\\\[(.+?)\\\]|\$\$(.+?)\$\$)$/s);
    if (math) {
      const display = seg.startsWith('\\[') || seg.startsWith('$$');
      const tex = math[2] ?? math[3] ?? math[4] ?? '';
      let html = '';
      try {
        html = katex.renderToString(tex, { displayMode: display, throwOnError: false });
      } catch {
        return <React.Fragment key={`${keyPrefix}-m${i}`}>{seg}</React.Fragment>;
      }
      return (
        <span
          key={`${keyPrefix}-m${i}`}
          className={display ? 'block max-w-full overflow-x-auto py-1' : 'inline-block max-w-full overflow-x-auto align-middle px-0.5'}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    const parts = seg.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <React.Fragment key={`${keyPrefix}-s${i}`}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return <strong key={`${keyPrefix}-b${i}-${j}`} className="font-bold">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
            return <code key={`${keyPrefix}-c${i}-${j}`} className="font-mono text-[11px] sm:text-xs bg-black/5 px-1 py-0.5 rounded">{part.slice(1, -1)}</code>;
          }
          return <React.Fragment key={`${keyPrefix}-t${i}-${j}`}>{part}</React.Fragment>;
        })}
      </React.Fragment>
    );
  });
}

function FormattedText({ text }: { text: string }) {
  // Backend answers often arrive as ONE unbroken line (no \n at all). Split
  // those into sentences so each idea breathes on its own line.
  let blocks = text.split(/\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length <= 1 && text.length > 200) {
    const sentences = text
      .split(/(?<=[.!?।])\s+(?=[A-Z0-9\u0900-\u097F*])/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 1) blocks = sentences;
  }
  if (blocks.length <= 1) {
    return <p className="text-xs sm:text-[13px] font-medium leading-relaxed whitespace-pre-line break-words">{renderInline(text, 's')}</p>;
  }
  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        const listMatch = block.match(/^(\d+[.)]\s+|[-*•]\s+)(.*)$/s);
        if (listMatch) {
          return (
            <p key={i} className="text-xs sm:text-[13px] font-medium leading-relaxed flex gap-1.5 break-words">
              <span className="shrink-0 font-bold">{listMatch[1].trim()}</span>
              <span>{renderInline(listMatch[2], `b${i}`)}</span>
            </p>
          );
        }
        return <p key={i} className="text-xs sm:text-[13px] font-medium leading-relaxed break-words">{renderInline(block, `b${i}`)}</p>;
      })}
    </div>
  );
}

export function DoubtsChat({ topicName = 'this concept', conceptId, language }: DoubtsChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'ai',
      text: greetingFor(topicName, language),
      time: ''
    },
  ]);

  // Keep the opening greeting in the student's chosen language.
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'msg-1') {
        return [{ ...prev[0], text: greetingFor(topicName, language) }];
      }
      return prev;
    });
  }, [topicName, language]);

  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll the MESSAGES BOX only — never the page. (An earlier
  // scrollIntoView fallback scrolled the whole page on long answers.)
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 4) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, isTyping]);

  const handleSend = async () => {
    const question = inputVal.trim();
    if (!question || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: question,
      time: ''
    };

    const next = [...messages, userMsg];
    setMessages(next);
    setInputVal('');
    setIsTyping(true);
    setError(null);

    if (!conceptId) {
      setMessages((prev) => [...prev, { id: `ai-${Date.now()}`, sender: 'ai', text: 'Doubt chat is unavailable for this concept.', time: '' }]);
      setIsTyping(false);
      return;
    }

    try {
      const history = next
        .filter((m) => m.id !== 'msg-1')
        .slice(-10)
        .map((m) => ({ role: (m.sender === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user', content: m.text }));
      const res = await conceptMediaService.askDoubt(conceptId, question, history, language);
      setMessages((prev) => [...prev, { id: `ai-${Date.now()}`, sender: 'ai', text: res.answer, time: '' }]);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full flex flex-col h-full max-h-full bg-white rounded-3xl border border-stone-200 shadow-xs overflow-hidden font-sans">
      <div className="px-5 py-4 border-b border-stone-200/80 bg-stone-50/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="scale-75 origin-left -mr-4">
            <Logo size="small" />
          </div>
          <span className="text-2xl font-black text-stone-900 tracking-tight font-sans leading-none">
            AI
          </span>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="chat-scroll flex-1 min-h-0 p-4 overflow-y-auto overflow-x-hidden space-y-3 text-xs sm:text-sm overscroll-contain"
      >
        {messages.map((m) => {
          const isAI = m.sender === 'ai';
          return (
            <div
              key={m.id}
              className={`flex min-w-0 ${isAI ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[85%] min-w-0 px-4 py-2.5 rounded-2xl leading-relaxed [overflow-wrap:anywhere] ${
                  isAI
                    ? 'bg-[#F6F4F0] text-stone-900 border border-stone-200/70 rounded-tl-xs'
                    : 'bg-[#6d0e00] text-white rounded-tr-xs'
                }`}
              >
                <FormattedText text={m.text} />
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="text-stone-600 text-xs pl-2 italic font-medium">
            Akara AI is typing…
          </div>
        )}
        {error && (
          <div role="alert" className="text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-stone-100 bg-white shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Akara AI a doubt…"
            className="flex-1 bg-stone-100/80 border border-stone-200/80 focus:border-[#6d0e00] focus:bg-white text-xs sm:text-sm rounded-xl px-3.5 py-2.5 text-stone-800 placeholder:text-stone-600 outline-hidden transition-all"
          />
          <button
            type="submit"
            disabled={!inputVal.trim() || isTyping}
            className="p-2.5 rounded-xl bg-[#6d0e00] text-white hover:bg-[#540b00] disabled:opacity-40 disabled:hover:bg-[#6d0e00] transition-all shrink-0 cursor-pointer shadow-xs"
            aria-label="Send doubt"
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

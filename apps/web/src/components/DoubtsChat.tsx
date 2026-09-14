import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
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

export function DoubtsChat({ topicName = 'this concept', conceptId, language }: DoubtsChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'ai',
      text: `Hello! If you have any doubts while watching this video on ${topicName}, ask me anytime!`,
      time: ''
    },
  ]);

  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
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
        className="flex-1 min-h-0 p-4 overflow-y-auto space-y-3 text-xs sm:text-sm overscroll-contain"
      >
        {messages.map((m) => {
          const isAI = m.sender === 'ai';
          return (
            <div
              key={m.id}
              className={`flex ${isAI ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl leading-relaxed ${
                  isAI
                    ? 'bg-[#F6F4F0] text-stone-900 border border-stone-200/70 rounded-tl-xs'
                    : 'bg-[#6d0e00] text-white rounded-tr-xs'
                }`}
              >
                <p className="text-xs sm:text-[13px] font-medium leading-relaxed">{m.text}</p>
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

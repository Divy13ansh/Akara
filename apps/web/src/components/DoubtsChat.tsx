import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Logo } from './Logo';

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

interface DoubtsChatProps {
  topicName?: string;
}

export function DoubtsChat({ topicName = 'Types of Chemical Reactions' }: DoubtsChatProps) {
  // Hardcoded initial conversation (no timestamp display)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'ai',
      text: `Hello! If you have any doubts while watching this video on ${topicName}, ask me anytime!`,
      time: ''
    },
    {
      id: 'msg-2',
      sender: 'user',
      text: 'What is the main difference between combination and decomposition reactions?',
      time: ''
    },
    {
      id: 'msg-3',
      sender: 'ai',
      text: 'In a combination reaction, two or more substances combine to form a single product (A + B → AB). In decomposition, a single compound breaks down into two or more simpler substances (AB → A + B).',
      time: ''
    }
  ]);

  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
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

  const handleSend = () => {
    const question = inputVal.trim();
    if (!question) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: question,
      time: ''
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setIsTyping(true);

    // AI doubt-solving response generator
    setTimeout(() => {
      let aiResponseText = `In ${topicName}, remember that atoms are conserved according to the Law of Conservation of Mass. Always check reactant and product formulas!`;
      
      const lowerQ = question.toLowerCase();
      if (lowerQ.includes('displacement')) {
        aiResponseText = 'In a displacement reaction, a more reactive element displaces a less reactive element from its salt solution (e.g., Fe + CuSO₄ → FeSO₄ + Cu).';
      } else if (lowerQ.includes('exothermic')) {
        aiResponseText = 'Exothermic reactions release energy in the form of heat or light. Combustion and respiration are classic examples of exothermic reactions.';
      } else if (lowerQ.includes('endothermic')) {
        aiResponseText = 'Endothermic reactions absorb energy from their surroundings to proceed. For example, photosynthesis and the thermal decomposition of limestone (CaCO₃ → CaO + CO₂).';
      } else if (lowerQ.includes('redox') || lowerQ.includes('oxidation') || lowerQ.includes('rust')) {
        aiResponseText = 'Oxidation is the gain of oxygen or loss of electrons. Reduction is the loss of oxygen or gain of electrons. Both occur simultaneously in redox reactions like rusting of iron.';
      } else if (lowerQ.includes('double displacement') || lowerQ.includes('precipitate')) {
        aiResponseText = 'In double displacement reactions, two compounds exchange ions to form two new compounds, often forming a solid precipitate (e.g., Na₂SO₄ + BaCl₂ → BaSO₄↓ + 2NaCl).';
      } else if (lowerQ.includes('balance') || lowerQ.includes('equation')) {
        aiResponseText = 'A chemical equation must be balanced so that the number of atoms of each element is equal on both sides, adhering to the Law of Conservation of Mass.';
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiResponseText,
        time: ''
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 750);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full flex flex-col h-full max-h-full bg-white rounded-3xl border border-stone-200 shadow-xs overflow-hidden font-sans">
      {/* Chat Header: Akara small logo on the left, named Akara AI with bigger AI font */}
      <div className="px-5 py-4 border-b border-stone-200/80 bg-stone-50/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Small Akara Logo */}
          <div className="scale-75 origin-left -mr-4">
            <Logo size="small" />
          </div>
          {/* Bigger AI text */}
          <span className="text-2xl font-black text-stone-900 tracking-tight font-sans leading-none">
            AI
          </span>
        </div>
      </div>

      {/* Messages Scroll Area - min-h-0 ensures container height stays constant and auto-scrolls above */}
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

        {/* Typing indicator - minimal text */}
        {isTyping && (
          <div className="text-stone-600 text-xs pl-2 italic font-medium">
            Akara AI is typing…
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Row */}
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

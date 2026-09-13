import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store';
import { answerQuestion, type ChatMessage } from '@/hooks/useAIAssistant';
import { usePlan } from '@/lib/plan';

const SUGGESTIONS = [
  'Aaj profit kitna hai?',
  'Top selling product kya hai?',
  'Total pending payments kitni hai?',
  'Is mahine ka total expense kitna hai?',
  'Stock status kya hai?',
  'Best sales day kaunsa tha?',
];

export function AIAssistant() {
  const { db } = useStore();
  const { hasFeature } = usePlan();
  const aiUnlocked = hasFeature('ai');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  const handleSend = (text?: string) => {
    const query = (text ?? input).trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      const result = answerQuestion(query, db);
      const aiMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        text: result.text,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
      setTyping(false);
    }, 400 + Math.random() * 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!aiUnlocked) return null;

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-5 right-5 z-[100] w-14 h-14 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-lg shadow-sky-500/30 flex items-center justify-center touch-manipulation transition-all hover:scale-105 active:scale-95"
        aria-label="Ask AI Assistant"
      >
        {open ? (
          <i className="fa-solid fa-xmark text-xl" />
        ) : (
          <i className="fa-solid fa-microchip text-xl" />
        )}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-sky-400 animate-ping opacity-20" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[100] w-[calc(100vw-2.5rem)] sm:w-[380px] max-w-[380px] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
             style={{ maxHeight: 'min(70vh, 560px)' }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/60 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center flex-shrink-0">
              <i className="fa-solid fa-microchip text-white text-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-white text-sm">AI Business Assistant</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-zinc-500 font-mono">Online · Real-time data</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-500 hover:text-white transition p-1.5"
              aria-label="Close"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto">
                  <i className="fa-solid fa-lightbulb text-sky-400 text-lg" />
                </div>
                <div>
                  <p className="text-sm text-zinc-300 font-medium">Business ke baare mein koi bhi sawal puchein</p>
                  <p className="text-xs text-zinc-500 mt-1">Main aapki real-time data se jawab dunga</p>
                </div>
                <div className="space-y-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSend(s)}
                      className="block w-full text-left text-xs text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2 hover:bg-sky-500/20 transition touch-manipulation"
                    >
                      <i className="fa-solid fa-arrow-right text-[10px] mr-1.5 text-sky-500" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-sky-600 text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-200 border border-zinc-700/50 rounded-bl-sm'
                }`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-mono text-sky-400">
                      <i className="fa-solid fa-microchip" /> AI
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 border border-zinc-700/50 rounded-xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-zinc-800 flex items-end gap-2 flex-shrink-0">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sawal type karein..."
              rows={1}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-sky-500 transition resize-none max-h-24"
              style={{ minHeight: '38px' }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition touch-manipulation"
              aria-label="Send"
            >
              <i className="fa-solid fa-paper-plane text-xs" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

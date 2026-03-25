import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import DOMPurify from 'dompurify';
import { X, Send, Zap } from 'lucide-react';

import { apiFetch } from '../../client/apiClient';

/** Lightweight markdown → HTML for chat messages. No external deps. */
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^(\d+)\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/^[-•]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) =>
      m.includes('list-decimal') ? `<ol class="space-y-0.5">${m}</ol>` : `<ul class="space-y-0.5">${m}</ul>`
    )
    .replace(/\n/g, '<br/>');
}

interface OrchMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: Array<{ file: string; section: string; similarity: number }>;
}

interface OrchChatProps {
  onClose: () => void;
}

interface OrchChatResponse {
  sessionId: string;
  message: string;
  sources: Array<{ file: string; section: string; similarity: number }>;
  error?: string;
  error_type?: string;
}

export function OrchChat({ onClose }: OrchChatProps) {
  const [messages, setMessages] = useState<OrchMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Welcome message
  useEffect(() => {
    const pageName = getPageName(window.location.pathname);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `Oi! Sou o Orch, seu guia do sistema CoGEdu.\n\nVejo que voce esta na pagina **${pageName}**. Posso te ajudar a entender os campos, botoes e funcionalidades dessa tela.\n\nComo posso te ajudar?`,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: OrchMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await apiFetch<OrchChatResponse>('/orch-admin/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
          routeContext: window.location.pathname,
        }),
      });

      setSessionId(response.sessionId);

      const assistantMessage: OrchMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        sources: response.sources,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage =
        error?.error || 'Desculpe, tive um problema ao processar sua mensagem. Tente novamente.';
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: errorMessage,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, sessionId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-50/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <Zap size={18} className="text-blue-600" />
          </div>
          <div>
            <span className="font-semibold text-sm text-gray-800">Orch</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-[#F2F4F7] text-gray-800 rounded-tl-none'
              }`}
            >
              <div
                className="orch-md"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(renderMarkdown(msg.content)),
                }}
              />
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200/50 text-[10px] text-gray-500 flex flex-wrap gap-1">
                  {msg.sources.map((s, i) => (
                    <span key={i} className="bg-white/60 px-1.5 py-0.5 rounded">
                      {s.section || s.file}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#F2F4F7] rounded-2xl rounded-tl-none px-4 py-3">
              <div className="flex space-x-1.5">
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-white border-t border-gray-50 flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Pergunte sobre o sistema..."
            className="w-full bg-[#F8F9FB] rounded-2xl py-3 px-4 text-sm outline-none font-medium border border-transparent focus:border-blue-100 focus:bg-white transition-all placeholder:text-gray-300"
            disabled={isLoading}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/20 active:scale-90 transition-all disabled:opacity-50 disabled:scale-100 flex-shrink-0"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

function getPageName(pathname: string): string {
  const pageNames: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/educational/admission': 'Processos Seletivos',
    '/educational/collection': 'Colecoes',
    '/educational/pathway': 'Trilhas',
    '/educational/series': 'Series',
    '/educational/unit': 'Unidades',
    '/educational/class-instances': 'Turmas',
    '/assessments': 'Avaliacoes',
    '/questions': 'Banco de Questoes',
    '/users': 'Usuarios',
    '/employees': 'Funcionarios',
    '/companies': 'Empresas',
    '/certificates': 'Certificados',
    '/bi': 'Business Intelligence',
  };

  for (const [prefix, name] of Object.entries(pageNames)) {
    if (pathname.startsWith(prefix)) return name;
  }
  return pathname;
}

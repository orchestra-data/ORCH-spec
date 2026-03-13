import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, Copy, Sparkles } from 'lucide-react';
import { ScrollArea } from '../../ui/scroll-area';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { getMockAIChat } from '../../../data/mockAIChat';
import { Component } from '../../../types';
import { Message, TutorClient } from '@/lib/tutorClient'
import { useAuth } from '@/contexts/AuthContext'

interface AIChatTabProps {
  useMock: boolean;
  currentContent?: Component | null;
}

const AIChatTab: React.FC<AIChatTabProps> = ({ useMock, currentContent: _currentContent }) => {
  const { t } = useTranslation();
  const { token } = useAuth()
  const tutorClient = useMemo(
    () => new TutorClient(_currentContent?.id || '', token || ''),
    [_currentContent?.id, token]
  )

  const [messages, setMessages] = useState<Message[]>(useMock ? getMockAIChat() : []);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(!useMock);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Load previous conversation on mount
  useEffect(() => {
    if (useMock || !token || !_currentContent?.unitId) {
      setIsLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setIsLoadingHistory(true);

    tutorClient.loadConversation().then(loaded => {
      if (!cancelled && loaded.length > 0) {
        setMessages(loaded);
      }
    }).catch(err => {
      console.error('[AIChatTab] Failed to load conversation:', err);
    }).finally(() => {
      if (!cancelled) setIsLoadingHistory(false);
    });

    return () => { cancelled = true };
  }, [tutorClient, useMock, token, _currentContent?.unitId]);

  // Auto-scroll para última mensagem
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollAreaRef.current) {
        // Scroll para o final do conteúdo
        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const result = await tutorClient.sendMessage(messages, inputValue)
      // Attach analytics to the user message that was just sent
      if (result.analytics) {
        setMessages(prev => prev.map(m =>
          m.id === userMessage.id ? { ...m, analytics: result.analytics } : m
        ))
      }
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: result.answer,
        sender: 'assistant',
        timestamp: new Date()
      }])
    } finally {
      setIsTyping(false)
    }
  };

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Card principal envolvendo toda a conversa */}
      <Card className="h-full flex flex-col overflow-hidden bg-card border border-border/50 m-0">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border/30 flex items-center gap-3 bg-card flex-shrink-0">
          <div className="relative">
            <div className="w-9 h-9 bg-gradient-to-br from-primary/15 to-primary/5 rounded-full flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card">
              <div className="w-full h-full bg-green-500 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{t('player.aiChat.title')}</h3>
            <p className="text-xs text-muted-foreground/70">{t('player.aiChat.status')}</p>
          </div>
        </div>

        {/* Área de mensagens com scroll - altura fixa */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <ScrollArea className="absolute inset-0" ref={scrollAreaRef}>
            <div className="px-5 py-5 space-y-4 min-h-full">
              {isLoadingHistory ? (
                <div className="h-full flex items-center justify-center">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-primary/15 to-primary/5 rounded-full flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('player.aiChat.loadingHistory')}</p>
                  </motion.div>
                </div>
              ) : messages.length === 0 && !useMock ? (
                <div className="h-full flex items-center justify-center">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center"
                  >
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-foreground text-lg mb-2 font-medium">{t('player.aiChat.startConversation')}</p>
                    <p className="text-muted-foreground text-sm">{t('player.aiChat.askQuestions')}</p>
                  </motion.div>
                </div>
              ) : (
                <AnimatePresence>
                  {messages.map((message, index) => {
                    const isUser = message.sender === 'user';
                    const isCopied = copiedMessageId === message.id;

                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, delay: index * 0.02 }}
                        className={`flex group ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex items-start gap-2.5 max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                          {/* Avatar */}
                          {!isUser && (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Sparkles className="w-3.5 h-3.5 text-primary" />
                            </div>
                          )}

                          {/* Message bubble */}
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                            <div
                              className={`rounded-2xl px-4 py-3 shadow-sm ${isUser
                                ? 'bg-primary text-primary-foreground rounded-tr-md'
                                : 'bg-muted/40 text-foreground border border-border/30 rounded-tl-md'
                                }`}
                            >
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {message.text}
                              </p>
                            </div>

                            {/* Timestamp e ações */}
                            <div className={`flex items-center gap-2 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                              <span className="text-xs text-muted-foreground/50">
                                {formatTime(message.timestamp)}
                              </span>
                              {!isUser && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50"
                                    onClick={() => handleCopy(message.text, message.id)}
                                    title={t('player.aiChat.copy')}
                                  >
                                    {isCopied ? (
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="text-green-500 text-xs"
                                      >
                                        ✓
                                      </motion.div>
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Avatar do usuário */}
                          {isUser && (
                            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="text-xs">👤</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}

              {/* Indicador de digitação */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-start"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="bg-muted/40 border border-border/30 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                      <div className="flex gap-1.5">
                        <motion.div
                          className="w-2 h-2 bg-muted-foreground/50 rounded-full"
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                        />
                        <motion.div
                          className="w-2 h-2 bg-muted-foreground/50 rounded-full"
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                        />
                        <motion.div
                          className="w-2 h-2 bg-muted-foreground/50 rounded-full"
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Referência para auto-scroll */}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Input area fixa */}
        <div className="px-5 py-3.5 border-t border-border/30 bg-card flex-shrink-0">
          <div className="flex items-end gap-2 bg-background border border-border/50 rounded-xl px-3.5 py-2.5 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/10 transition-all shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 flex-shrink-0"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </Button>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t('player.aiChat.placeholder')}
              rows={1}
              className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 resize-none text-sm leading-relaxed max-h-32 overflow-y-auto"
              style={{
                height: 'auto',
                minHeight: '20px'
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isTyping}
              className="h-7 w-7 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 transition-all shadow-sm"
              size="icon"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AIChatTab;


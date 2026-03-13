import { generateTutorResponse, getLastConversation, TutorTurnAnalytics, TutorResponsePayload } from './api'

export type { TutorTurnAnalytics, TutorResponsePayload }

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  analytics?: TutorTurnAnalytics | null;
}

export interface TutorSendResult {
  answer: string;
  analytics: TutorTurnAnalytics | null;
  conversationId: string | null;
}

export class TutorClient {
  private conversationId: string | null = null;

  constructor(private componentId: string, private token: string) { }

  async loadConversation(): Promise<Message[]> {
    const { conversation } = await getLastConversation({ token: this.token, componentId: this.componentId })
    if (!conversation) return []

    this.conversationId = conversation.id
    return conversation.messages.map(m => ({
      id: m.id,
      text: m.text,
      sender: m.role === 'user' ? 'user' as const : 'assistant' as const,
      timestamp: new Date(m.createdAt),
      analytics: m.role === 'user' ? m.analytics : undefined,
    }))
  }

  async sendMessage(history: Message[], message: string): Promise<TutorSendResult> {
    const openaiMessages = history.map(message => ({
      role: message.sender === 'user' ? 'user' : 'assistant',
      content: message.text,
    })).slice(-6)

    const response = await generateTutorResponse({ token: this.token, componentId: this.componentId, conversationId: this.conversationId, message: message, history: openaiMessages })
    this.conversationId = response.conversationId;
    return {
      answer: response.answer,
      analytics: response.analytics,
      conversationId: response.conversationId,
    }
  }
}

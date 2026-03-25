import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HubTab } from './types';
import { Dock } from './Dock';
import { HubPanel } from './HubPanel';
import { ChatScreen } from './ChatScreen';
import { OrchChat } from './OrchChat';
import { useChatContext } from '../../contexts/ChatContext';
import { useAuth } from '../../auth/KeycloakAuthProvider';

export const CommunicationHub: React.FC = () => {
    const [activeTab, setActiveTab] = useState<string>('home');
    const [isHubOpen, setIsHubOpen] = useState(false);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [pendingChatUser, setPendingChatUser] = useState<string | null>(null); // For new chats

    const { conversations, notifications, contacts, sendMessage, sendClassMessage, markAsRead, markNotificationRead } = useChatContext();
    const { userId } = useAuth();

    // Expose openChat globally via window event
    useEffect(() => {
        const handleOpenChat = (event: CustomEvent<{ conversationId: string }>) => {
            setActiveChatId(event.detail.conversationId);
            setIsHubOpen(true);
            setActiveTab('messages');
        };

        window.addEventListener('open-chat' as any, handleOpenChat as any);
        return () => {
            window.removeEventListener('open-chat' as any, handleOpenChat as any);
        };
    }, []);

    const messagesCount = useMemo(() =>
        conversations.reduce((acc, curr) => acc + (curr.unread_count || 0), 0),
        [conversations]);

    const notificationsCount = notifications.filter(n => !n.read_at).length;

    const handleTabChange = (id: string) => {
        setActiveTab(id);
        if (id === 'messages' || id === 'notifications' || id === 'orch') {
            setIsHubOpen(true);
            setActiveChatId(null);
            setPendingChatUser(null);
        } else {
            setIsHubOpen(false);
            setActiveChatId(null);
            setPendingChatUser(null);
        }
    };

    const getActiveHubTab = (): HubTab | 'orch' => {
        if (activeTab === 'notifications') return HubTab.NOTIFICATIONS;
        if (activeTab === 'orch') return 'orch';
        return HubTab.MESSAGES;
    };

    // Derived active conversation (either existing or pending placeholder)
    const activeConversation = useMemo(() => {
        if (activeChatId) {
            return conversations.find(c => c.id === activeChatId);
        }
        if (pendingChatUser) {
            // Find existing if we somehow missed it or it appeared
            const existing = conversations.find(c => c.type === 'user' && c.participant_id === pendingChatUser);
            if (existing) {
                // Determine if we should switch to ID mode? 
                // We'll return it, but maybe we should effect-switch activeChatId?
                return existing;
            }
            // Create pending placeholder
            const contact = contacts.find(c => c.id === pendingChatUser);
            return {
                id: 'new',
                type: 'user',
                participant_id: pendingChatUser,
                participant_name: contact?.full_name || 'Usuário',
                participant_photo_url: contact?.photo_url,
                messages: [],
                last_message_at: new Date().toISOString(),
                unread_count: 0,
                // These are needed by type but might be optional/null
                creator_id: userId,
                class_instance_id: null,
            } as any;
        }
        return null;
    }, [activeChatId, pendingChatUser, conversations, contacts, userId]);

    // Effect to switch from pending to active if conversation Appears
    useEffect(() => {
        if (pendingChatUser && activeConversation && activeConversation.id !== 'new') {
            setActiveChatId(activeConversation.id);
            setPendingChatUser(null);
        }
    }, [pendingChatUser, activeConversation]);

    // Handle Open Chat (from HubPanel)
    const handleOpenChatFromPanel = (id: string, type: 'user' | 'class') => {
        if (type === 'class') {
            // Class conversations are always by conversation ID (for now)
            setActiveChatId(id);
        } else {
            // User: id could be conversation ID OR user ID (from contacts)
            // Start by checking if 'id' matches a conversation ID
            const convById = conversations.find(c => c.id === id);
            if (convById) {
                setActiveChatId(id);
                return;
            }

            // Check if 'id' is a participant ID for an existing conversation
            const convByPart = conversations.find(c => c.type === 'user' && c.participant_id === id);
            if (convByPart) {
                setActiveChatId(convByPart.id);
                return;
            }

            // If neither, treat 'id' as a target user ID and start new/pending
            // This handles "Start Chat" with a contact we have no history with
            setPendingChatUser(id);
            setActiveChatId(null);
        }
    };

    // Mark as read when chat opens
    useEffect(() => {
        if (activeChatId && activeConversation?.unread_count && activeConversation.unread_count > 0 && activeConversation.id !== 'new') {
            markAsRead(activeConversation.id);
        }
    }, [activeChatId, activeConversation?.unread_count, markAsRead, activeConversation]);

    const handleSendMessage = async (text: string) => {
        if (!activeConversation) return;

        if (activeConversation.type === 'user') {
            // For user messages, send to participant_id
            await sendMessage(activeConversation.participant_id, text);
            // If it was pending, the context update should trigger the effect to set activeChatId
        } else {
            // For class/group chats, we use the class_instance_id
            if (activeConversation.class_instance_id) {
                await sendClassMessage(activeConversation.class_instance_id, text);
            } else {
                console.error("Cannot send message: Missing class_instance_id for non-user conversation");
            }
        }
    };

    return (
        <>
            {/* Orch Chat Panel (replaces HubPanel when orch tab is active) */}
            <AnimatePresence mode="wait">
                {isHubOpen && activeTab === 'orch' && !activeChatId && !pendingChatUser && (
                    <motion.div
                        key="orch-panel"
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="fixed bottom-24 right-6 w-96 h-[65vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden z-[900]"
                    >
                        <OrchChat onClose={() => handleTabChange('home')} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hub Panel (Lists) - EXCLUDE when orch is active */}
            <AnimatePresence mode="wait">
                {isHubOpen && activeTab !== 'orch' && !activeChatId && !pendingChatUser && (
                    <HubPanel
                        key="hub-panel"
                        activeTab={getActiveHubTab() as HubTab}
                        onOpenChat={handleOpenChatFromPanel}
                        onClose={() => handleTabChange('home')}
                        conversations={conversations}
                        notifications={notifications}
                        contacts={contacts}
                        onMarkRead={markNotificationRead}
                    />
                )}
            </AnimatePresence>

            {/* Chat Screen (Conversation) */}
            <AnimatePresence mode="wait">
                {activeConversation && (
                    <ChatScreen
                        key={`chat-${activeConversation.id === 'new' ? 'new-' + pendingChatUser : activeConversation.id}`}
                        conversation={activeConversation}
                        messages={activeConversation.messages}
                        onBack={() => setActiveChatId(null)}
                        onSendMessage={handleSendMessage}
                        currentUserId={userId || undefined}
                    />
                )}
            </AnimatePresence>

            {/* Dock (Floating Button System) */}
            <Dock
                activeTab={activeChatId ? 'messages' : activeTab}
                onTabChange={handleTabChange}
                notificationsCount={notificationsCount}
                messagesCount={messagesCount}
            />
        </>
    );
};

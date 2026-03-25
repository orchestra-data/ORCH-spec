
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, BellRing, MessageSquarePlus } from 'lucide-react';
import { HubTab } from './types';
import type { Conversation as ApiConversation } from '../../client/apiClient';
import { useTranslation } from 'react-i18next';

// Helper to safely get conversation title
const getConversationTitle = (conv: ApiConversation): string => {
    if (conv.type === 'class') {
        return conv.class_name || "Turma";
    }
    return conv.participant_name || "Usuário";
};

interface HubPanelProps {
    onOpenChat: (id: string, type: 'user' | 'class') => void;
    activeTab: HubTab;
    onClose: () => void;
    conversations: ApiConversation[];
    notifications: any[];
    contacts: any[]; // UserContacts
    isLoading?: boolean;
    onMarkRead?: (id: string) => void;
}

export const HubPanel: React.FC<HubPanelProps> = ({ onOpenChat, activeTab, onClose, conversations, notifications, contacts, isLoading }) => {
    const [view, setView] = useState<'list' | 'contacts'>('list');
    const [searchTerm, setSearchTerm] = useState('');

    const { t } = useTranslation();

    const filteredConversations = conversations.filter(c => {
        const name = getConversationTitle(c);
        return name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    // Render Component for Multi-avatars
    const AvatarGroup = ({ avatars, single, title }: { avatars?: string[], single?: string | null, title?: string }) => {
        if (!avatars || avatars.length === 0) {
            return (
                <div className="w-14 h-14 rounded-full border-2 border-white shadow-sm ring-1 ring-gray-100 overflow-hidden flex-shrink-0 aspect-square flex items-center justify-center bg-gray-100">
                    {single ? (
                        <img src={single} className="w-full h-full object-cover" alt="" />
                    ) : (
                        <span className="text-gray-500 font-bold text-xs">{title?.substring(0, 2).toUpperCase() || "?"}</span>
                    )}
                </div>
            );
        }

        return (
            <div className="relative w-14 h-14 flex-shrink-0">
                {avatars.slice(0, 3).map((avatar, i) => (
                    <div
                        key={i}
                        className={`absolute w-9 h-9 rounded-full border-2 border-white shadow-sm ring-1 ring-gray-100 overflow-hidden transition-transform group-hover:scale-105`}
                        style={{
                            top: i === 0 ? 0 : i === 1 ? '16px' : '8px',
                            left: i === 0 ? 0 : i === 1 ? '16px' : '18px',
                            zIndex: 3 - i
                        }}
                    >
                        <img src={avatar} className="w-full h-full object-cover" alt="" />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.2, y: 0 }}
            animate={{ opacity: 1, scale: 1, y: -20 }}
            exit={{ opacity: 0, scale: 0.2, y: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-24 right-6 w-96 h-[65vh] bg-white rounded-[2.5rem] shadow-[0_30px_100px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden z-[900] border border-gray-100"
        >
            {/* Header */}
            <div className={`px-8 pt-10 pb-4`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        {view === 'contacts' ? (
                            <button onClick={() => setView('list')} className="mr-2 p-1 hover:bg-gray-100 rounded-full">
                                <span className="text-xl">←</span>
                            </button>
                        ) : null}
                        <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase leading-none">
                            {view === 'contacts' ? 'Nova Conversa' : activeTab}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {(activeTab === HubTab.MESSAGES || activeTab === HubTab.NOTIFICATIONS) && view === 'list' && (
                    <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                            <input
                                type="text"
                                placeholder={activeTab === HubTab.MESSAGES ? "Buscar no histórico..." : "Filtrar por nome..."}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-[#F8F9FB] border border-gray-100 rounded-2xl py-3.5 pl-12 pr-4 text-[15px] outline-none placeholder:text-gray-300 font-medium focus:bg-white focus:ring-2 focus:ring-blue-50 transition-all"
                            />
                        </div>
                        {activeTab === HubTab.MESSAGES && (
                            <button
                                onClick={() => setView('contacts')}
                                className="p-3.5 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200"
                            >
                                <MessageSquarePlus size={20} />
                            </button>
                        )}
                    </div>
                )}
                {view === 'contacts' && (
                    <div className="relative">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                        <input
                            type="text"
                            placeholder="Buscar pessoas..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[#F8F9FB] border border-gray-100 rounded-2xl py-3.5 pl-12 pr-4 text-[15px] outline-none placeholder:text-gray-300 font-medium focus:bg-white focus:ring-2 focus:ring-blue-50 transition-all"
                        />
                    </div>
                )}
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-2 custom-scrollbar">
                {(() => {
                    // CONTACTS VIEW
                    if (view === 'contacts') {
                        const filteredContacts = contacts.filter(c =>
                            c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            c.context?.toLowerCase().includes(searchTerm.toLowerCase())
                        );

                        const grouped = filteredContacts.reduce((acc: Record<string, any[]>, contact) => {
                            const cat = contact.category || 'Outros';
                            if (!acc[cat]) acc[cat] = [];
                            acc[cat].push(contact);
                            return acc;
                        }, {});

                        // Sort keys: Staff/Equipe first, then others
                        const sortedCategories = Object.keys(grouped).sort((a, b) => {
                            const priority = ['Staff', 'Equipe', 'Alunos', 'Students', 'Outros'];
                            const idxA = priority.indexOf(a);
                            const idxB = priority.indexOf(b);
                            // If both are in priority list, lower index comes first
                            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                            // If only a is in priority, it comes first
                            if (idxA !== -1) return -1;
                            // If only b is in priority, it comes first
                            if (idxB !== -1) return 1;
                            // Otherwise sort alphabetically
                            return a.localeCompare(b);
                        });

                        return (
                            <div className="space-y-6">
                                {sortedCategories.map((category) => (
                                    <div key={category}>
                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">{category}</h3>
                                        <div className="space-y-1">
                                            {grouped[category].map((contact: any) => (
                                                <button
                                                    key={contact.id}
                                                    onClick={() => {
                                                        onOpenChat(contact.id, 'user');
                                                    }}
                                                    className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors text-left group"
                                                >
                                                    <div className="relative">
                                                        <AvatarGroup single={contact.photo_url} title={contact.full_name} />
                                                        {contact.type === 'employee' && (
                                                            <div className="absolute -bottom-1 -right-1 bg-blue-100 text-blue-600 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-white">
                                                                {t('communicationHub.staff')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{contact.full_name}</h4>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {filteredContacts.length === 0 && (
                                    <div className="text-center py-8 text-gray-400">
                                        {t('communicationHub.noContacts')}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    // MESSAGES VIEW
                    if (activeTab === HubTab.MESSAGES) {
                        return (
                            <div className="space-y-1 mt-4">
                                {filteredConversations.length === 0 && !isLoading ? (
                                    <div className="text-center text-gray-400 py-10">
                                        <p>Nenhuma conversa encontrada</p>
                                    </div>
                                ) : null}

                                {filteredConversations.map((conv) => {
                                    const title = getConversationTitle(conv);
                                    const subtitle = conv.type === 'class' ? 'Grupo da Turma' : 'Mensagem Direta';
                                    const timestamp = conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                    const lastMessage = conv.messages?.[conv.messages.length - 1]?.content || '...';
                                    const avatar = conv.type === 'user' ? (conv.participant_photo_url || null) : null;
                                    const unread = conv.unread_count || 0;

                                    return (
                                        <button
                                            key={conv.id}
                                            onClick={() => onOpenChat(conv.id, conv.type || 'user')}
                                            className="w-full flex items-center gap-4 p-4 rounded-[2.5rem] hover:bg-gray-50 active:scale-[0.98] transition-all group"
                                        >
                                            <AvatarGroup single={avatar} title={title} />
                                            <div className="flex-1 text-left min-w-0">
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <h4 className="text-[14px] font-extrabold text-gray-900 truncate tracking-tight">{title}</h4>
                                                    <span className="text-[10px] text-gray-400 font-bold whitespace-nowrap">{timestamp}</span>
                                                </div>
                                                <p className="text-[12px] text-gray-400 truncate font-black uppercase tracking-tighter leading-none mb-1 opacity-60">{subtitle}</p>
                                                <p className="text-[12px] text-gray-500 truncate mt-0.5 font-medium">{lastMessage}</p>
                                            </div>
                                            {unread > 0 && (
                                                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-black text-white shadow-md shadow-red-200">
                                                    {unread > 99 ? '99+' : unread}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    }

                    // NOTIFICATIONS VIEW
                    return (
                        <div className="space-y-1 mt-4">
                            {notifications.length === 0 ? (
                                <div className="space-y-3 pt-4 text-center">
                                    <div className="p-10 flex flex-col items-center justify-center text-gray-400">
                                        <BellRing className="w-12 h-12 mb-3 opacity-20" />
                                        <p className="font-medium text-sm">Nenhuma notificação</p>
                                    </div>
                                </div>
                            ) : (
                                notifications.map((notif) => (
                                    <div key={notif.id} className="w-full flex items-start gap-4 p-4 rounded-[1.5rem] bg-white border border-gray-100 mb-2">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${notif.notification_type === 'error' ? 'bg-red-100 text-red-600' :
                                            notif.notification_type === 'warning' ? 'bg-yellow-100 text-yellow-600' :
                                                notif.notification_type === 'success' ? 'bg-green-100 text-green-600' :
                                                    'bg-blue-100 text-blue-600'
                                            }`}>
                                            <BellRing size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className="text-sm font-bold text-gray-900">{notif.title}</h4>
                                                <span className="text-[10px] text-gray-400 font-medium">
                                                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 leading-relaxed">{notif.message}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    );
                })()}
            </div>
        </motion.div>
    );
};

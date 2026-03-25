
import React from 'react';

interface FloatingHubButtonProps {
    onClick: () => void;
    notificationCount: number;
    isCritical?: boolean;
}

export const FloatingHubButton: React.FC<FloatingHubButtonProps> = ({
    onClick,
    notificationCount,
    isCritical = false,
}) => {
    return (
        <button
            onClick={onClick}
            aria-label="Abrir hub de comunicação"
            className={`fixed bottom-8 right-8 z-[1000] w-16 h-16 rounded-2xl shadow-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 group ${isCritical ? 'bg-red-500 shadow-red-500/20' : 'bg-[#121212] border border-white/10 shadow-black/40'
                } text-white`}
        >
            <div className="relative">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-7 w-7 transition-transform group-hover:rotate-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                </svg>
                {notificationCount > 0 && (
                    <span className="absolute -top-3 -right-3 bg-red-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-lg shadow-lg border-2 border-[#121212]">
                        {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                )}
            </div>
        </button>
    );
};

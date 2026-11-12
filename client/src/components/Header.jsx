import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Clock, Globe, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationPanel';

const QUOTES = [
  '"Action cures fear."',
  '"Done is better than perfect."',
  '"Focus on being productive instead of busy."',
  '"Small steps every day lead to big results."',
  '"Make today count."',
  '"Dream big. Start small."',
  '"Discipline beats motivation every time."',
  '"One task at a time."'
];

export function Header({ onOpenBgSettings, sidebarHidden, onShowSidebar, onJoinRoom, onNavigate }) {
  const { user } = useAuth();
  const [time, setTime] = useState(new Date());
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours();
  let greeting = 'Good morning';
  if (hours >= 12 && hours < 17) greeting = 'Good afternoon';
  else if (hours >= 17) greeting = 'Good evening';

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
      <div className="flex items-center gap-3 min-w-0">
        {sidebarHidden && (
          <button
            onClick={onShowSidebar}
            title="Show Sidebar"
            aria-label="Open Navigation Menu"
            className="btn-tactile touch-control p-2.5 rounded-xl glass-card text-slate-300 hover:text-white hover:border-brand-purple/50 flex items-center justify-center shadow-md flex-shrink-0"
          >
            <PanelLeftOpen className="w-5 h-5 text-brand-purple" />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
            {greeting}{user ? `, ${user.name}` : ''}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5 truncate">{quote}</p>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 w-full sm:w-auto">
        <div className="flex items-center gap-2">
          <NotificationBell onJoinRoom={onJoinRoom} onNavigate={onNavigate} />

          <button
            onClick={onOpenBgSettings}
            title="Customize Workspace Wallpaper"
            aria-label="Customize Workspace Wallpaper"
            className="btn-tactile touch-control p-2.5 rounded-xl glass-card text-slate-300 hover:text-white hover:border-brand-purple/50 flex items-center justify-center shadow-md"
          >
            <ImageIcon className="w-5 h-5 text-brand-purple" />
          </button>
        </div>

        <div className="flex flex-col items-end flex-shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-brand-purple/20 border border-brand-purple/30 text-brand-purple font-mono font-bold text-xs sm:text-sm tracking-wider shadow-sm">
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>{time.toLocaleTimeString()}</span>
          </div>
          <span className="text-[10px] sm:text-[11px] text-slate-400 mt-1 hidden sm:flex items-center gap-1">
            <Globe className="w-3 h-3" />
            {timezone}
          </span>
        </div>
      </div>
    </header>
  );
}

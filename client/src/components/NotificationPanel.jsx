import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, Trash2, UserPlus, Video, MessageSquare, Clock, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

export function NotificationBell({ onJoinRoom, onNavigate }) {
  const { notifications, unreadCount, markAsRead, markAllRead, clearNotification, clearAll, refresh } = useNotifications();
  const { token } = useAuth();
  const { addToast } = useToast();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const panelRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const displayed = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  const handleAction = async (notif) => {
    markAsRead(notif.id);
    if (notif.type === 'room_invite' && notif.data?.roomId && onJoinRoom) {
      setOpen(false);
      onJoinRoom(notif.data.roomId);
    } else if (notif.type === 'dm' && onNavigate) {
      setOpen(false);
      onNavigate('friends');
    } else if (notif.type === 'friend_request' && onNavigate) {
      setOpen(false);
      onNavigate('friends');
    }
  };

  const handleRespondKnock = async (e, notif, action) => {
    e.stopPropagation();
    if (!token || !notif.data?.roomId || !notif.data?.requesterId) return;
    try {
      const res = await fetch(`/api/rooms/${notif.data.roomId}/knock/${notif.data.requesterId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        addToast(action === 'approve' ? `Admitted ${notif.data.requesterName}` : 'Declined request', 'success');
        clearNotification(notif.id);
        refresh();
      }
    } catch {}
  };

  const getIcon = (type) => {
    switch (type) {
      case 'friend_request':
      case 'friend_accepted':
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      case 'room_invite':
      case 'room_knock':
        return <Video className="w-4 h-4 text-brand-purple" />;
      case 'dm':
        return <MessageSquare className="w-4 h-4 text-blue-400" />;
      default:
        return <Clock className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Notifications"
        className="relative p-2.5 rounded-xl glass-card text-slate-300 hover:text-white hover:border-brand-purple/50 transition-all flex items-center justify-center shadow-md"
      >
        <Bell className="w-5 h-5 text-brand-purple" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-popover-in fixed inset-x-3 top-16 sm:inset-x-auto sm:top-auto sm:absolute sm:right-0 sm:mt-2 sm:w-96 max-h-[75dvh] rounded-2xl glass-panel border border-white/10 shadow-2xl z-50 overflow-hidden backdrop-blur-xl flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-purple/20 text-brand-purple font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-white/5 transition-colors"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  title="Clear all"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="px-4 py-2 border-b border-white/5 flex gap-2 bg-dark-900/40">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'all' ? 'bg-brand-purple/20 text-brand-purple' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'unread' ? 'bg-brand-purple/20 text-brand-purple' : 'text-slate-400 hover:text-white'
              }`}
            >
              Unread
            </button>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
            {displayed.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No {filter === 'unread' ? 'unread ' : ''}notifications right now.
              </div>
            ) : (
              displayed.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleAction(n)}
                  className={`p-3.5 hover:bg-white/5 cursor-pointer transition-colors flex items-start gap-3 ${
                    !n.is_read ? 'bg-brand-purple/5' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl bg-dark-900/80 border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold leading-snug ${!n.is_read ? 'text-white' : 'text-slate-300'}`}>
                        {n.title}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearNotification(n.id);
                        }}
                        className="text-slate-500 hover:text-slate-300 flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {n.body && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-slate-500">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {n.type === 'room_knock' && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => handleRespondKnock(e, n, 'approve')}
                            className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] font-semibold flex items-center gap-0.5"
                          >
                            <Check className="w-3 h-3" /> Admit
                          </button>
                          <button
                            onClick={(e) => handleRespondKnock(e, n, 'decline')}
                            className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-[10px] font-semibold"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      {n.type === 'room_invite' && (
                        <span className="text-[10px] font-semibold text-brand-purple">Click to Join &rarr;</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

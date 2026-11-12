import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { playNotificationPing } from '../utils/sound';
import { UserAvatar } from '../components/UserAvatar';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user, token } = useAuth();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [onlinePopups, setOnlinePopups] = useState([]);

  const friendMapRef = useRef(new Map());
  const popupTimersRef = useRef(new Map());

  const refreshFriendsCache = useCallback(async () => {
    if (!token || user?.is_guest) {
      friendMapRef.current.clear();
      return;
    }
    try {
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const prevMap = friendMapRef.current;
        const nextMap = new Map();
        (data.friends || []).forEach((f) => {
          const prevEntry = prevMap.get(f.id);
          nextMap.set(f.id, {
            id: f.id,
            name: f.name,
            avatar_url: f.avatar_url,
            avatar_color: f.avatar_color,
            avatar_frame: f.avatar_frame,
            online: !!f.online,
            lastPopupAt: prevEntry?.lastPopupAt || 0
          });
        });
        friendMapRef.current = nextMap;
      }
    } catch {}
  }, [token, user?.is_guest]);

  const dismissOnlinePopup = useCallback((popupId) => {
    setOnlinePopups((prev) => prev.filter((p) => p.popupId !== popupId));
    if (popupTimersRef.current.has(popupId)) {
      clearTimeout(popupTimersRef.current.get(popupId));
      popupTimersRef.current.delete(popupId);
    }
  }, []);

  useEffect(() => {
    refreshFriendsCache();
  }, [refreshFriendsCache]);

  useEffect(() => {
    return () => {
      popupTimersRef.current.forEach((t) => clearTimeout(t));
      popupTimersRef.current.clear();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setNotifications([]);
      return;
    }
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notif) => {
      setNotifications((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)].slice(0, 60));

      if (notif.type === 'friend_accepted' || notif.type === 'friend_request') {
        refreshFriendsCache();
      }

      const isDnd = user?.status_mode === 'busy' || user?.status_mode === 'dnd';
      const soundAllowed = user?.preferences?.soundEnabled !== false;
      if (!isDnd && soundAllowed) {
        playNotificationPing();
      }

      if (
        !isDnd &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        document.hidden
      ) {
        new Notification(notif.title, { body: notif.body || '' });
      }
    };

    const handlePresenceUpdate = (p) => {
      if (!p?.userId || p.userId === user?.id) return;
      const friend = friendMapRef.current.get(p.userId);
      if (!friend) return;

      const isNowOnline = !!p.online && p.statusMode !== 'offline' && p.statusMode !== 'invisible';
      const wasOnline = friend.online;
      friend.online = isNowOnline;
      if (p.avatarUrl !== undefined) friend.avatar_url = p.avatarUrl;
      if (p.avatarFrame !== undefined) friend.avatar_frame = p.avatarFrame;
      if (p.name) friend.name = p.name;

      const now = Date.now();
      const isDnd = user?.status_mode === 'busy' || user?.status_mode === 'dnd';

      if (!wasOnline && isNowOnline && !isDnd && now - (friend.lastPopupAt || 0) > 30000) {
        friend.lastPopupAt = now;
        const popupId = `online-${friend.id}-${now}`;
        const popupItem = {
          popupId,
          userId: friend.id,
          name: p.name || friend.name,
          avatarUrl: p.avatarUrl !== undefined ? p.avatarUrl : friend.avatar_url,
          avatarColor: p.avatarColor || friend.avatar_color,
          avatarFrame: p.avatarFrame !== undefined ? p.avatarFrame : friend.avatar_frame,
          statusMode: p.statusMode || 'online',
          roomName: p.currentRoomName || null
        };
        setOnlinePopups((prev) => [popupItem, ...prev].slice(0, 3));

        if (user?.preferences?.soundEnabled !== false) {
          playNotificationPing();
        }

        const timer = setTimeout(() => {
          dismissOnlinePopup(popupId);
        }, 4500);
        popupTimersRef.current.set(popupId, timer);
      }
    };

    socket.on('notification', handleNewNotification);
    socket.on('presence-update', handlePresenceUpdate);
    return () => {
      socket.off('notification', handleNewNotification);
      socket.off('presence-update', handlePresenceUpdate);
    };
  }, [socket, user?.id, user?.status_mode, user?.preferences?.soundEnabled, refreshFriendsCache, dismissOnlinePopup]);

  const pushLocalNotification = useCallback(({ type = 'system', title, body = '', data = {} }) => {
    const item = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      body,
      data,
      is_read: false,
      local: true,
      created_at: Date.now()
    };
    setNotifications((prev) => [item, ...prev].slice(0, 60));
  }, []);

  const markAsRead = async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    if (!token || String(id).startsWith('local-')) return;
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id })
      });
    } catch {}
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    if (!token) return;
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({})
      });
    } catch {}
  };

  const clearNotification = async (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!token || String(id).startsWith('local-')) return;
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
  };

  const clearAll = async () => {
    setNotifications([]);
    if (!token) return;
    try {
      await fetch('/api/notifications/all', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        refresh,
        markAsRead,
        markAllRead,
        clearNotification,
        clearAll,
        pushLocalNotification
      }}
    >
      {children}

      {/* Small Pop-Up Card when a Friend Comes Online */}
      {onlinePopups.length > 0 && (
        <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 left-3 sm:left-auto sm:right-4 z-[65] flex flex-col gap-2 sm:max-w-xs pointer-events-none">
          {onlinePopups.map((popup) => (
            <div
              key={popup.popupId}
              className="pointer-events-auto flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-dark-900/95 border border-emerald-500/35 shadow-2xl backdrop-blur-xl animate-slide-in"
            >
              <UserAvatar
                name={popup.name}
                avatarUrl={popup.avatarUrl}
                avatarColor={popup.avatarColor}
                avatarFrame={popup.avatarFrame}
                sizeClass="w-8 h-8 text-xs"
                statusMode={popup.statusMode || 'online'}
              />
              <div className="flex-1 min-w-0 pr-1">
                <div className="text-xs font-bold text-white truncate">
                  {popup.name} <span className="text-emerald-400 font-semibold">is online</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {popup.roomName ? `In "${popup.roomName}"` : 'Available on StudyHub'}
                </div>
              </div>
              <button
                onClick={() => dismissOnlinePopup(popup.popupId)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex-shrink-0"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

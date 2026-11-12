import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [myListening, setMyListening] = useState(null);

  useEffect(() => {
    const newSocket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000
    });

    newSocket.on('connect', () => {
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    newSocket.on('listening-ack', ({ listening }) => {
      setMyListening(listening || null);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Re-register global presence on connect or user profile updates
  useEffect(() => {
    if (!user?.id) {
      setMyListening(null);
      return;
    }
    if (socket && connected && user?.id) {
      socket.emit('register-presence', { user });
    }
  }, [socket, connected, user?.id, user?.status_mode, user?.status_text, user?.custom_emoji]);

  const updateListening = useCallback(
    async (url) => {
      if (!token) throw new Error('Authentication required');
      const res = await fetch('/api/auth/listening', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ url: url || '' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update YouTube activity');
      setMyListening(data.listening || null);
      return data.listening || null;
    },
    [token]
  );

  return (
    <SocketContext.Provider value={{ socket, connected, myListening, setMyListening, updateListening }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
}

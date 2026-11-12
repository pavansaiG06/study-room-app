import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('studyhub_jwt'));
  const [loading, setLoading] = useState(true);

  // Fetch current user on mount or token change (resilient to 5xx cold-start wakes)
  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      if (!token) {
        setLoading(false);
        return;
      }
      const delays = [0, 1500, 3000, 5000];
      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        if (cancelled) return;
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
          if (cancelled) return;
        }
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (cancelled) return;
          if (res.ok) {
            const data = await res.json();
            if (!cancelled) setUser(data.user);
            break;
          }
          if (res.status === 401 || res.status === 403) {
            // Only clear JWT when explicitly unauthorized/banned, never on transient 502/503 wakeups
            localStorage.removeItem('studyhub_jwt');
            if (!cancelled) {
              setToken(null);
              setUser(null);
            }
            break;
          }
        } catch (err) {
          if (attempt === delays.length - 1) {
            console.error('Error validating token:', err);
          }
        }
      }
      if (!cancelled) setLoading(false);
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Active-tab HTTP keepalive so Render Free Tier never idles mid-study session
  useEffect(() => {
    const pingTimer = setInterval(() => {
      fetch('/ping', { cache: 'no-store' }).catch(() => {});
    }, 8 * 60 * 1000);
    return () => clearInterval(pingTimer);
  }, []);

  const handleAuthSuccess = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('studyhub_jwt', authToken);
  };

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to login');
    handleAuthSuccess(data.user, data.token);
    return data.user;
  };

  const register = async (email, password, name, avatarColor, avatarUrl) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, avatarColor, avatarUrl })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to register');
    handleAuthSuccess(data.user, data.token);
    return data.user;
  };

  const guestLogin = async (name, avatarColor, avatarUrl) => {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, avatarColor, avatarUrl })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start guest session');
    handleAuthSuccess(data.user, data.token);
    return data.user;
  };

  const upgradeGuest = async (email, password, name) => {
    const res = await fetch('/api/auth/upgrade-guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ email, password, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upgrade account');
    handleAuthSuccess(data.user, data.token);
    return data.user;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update password');
    if (data.token) {
      handleAuthSuccess(data.user || user, data.token);
    }
    return true;
  };

  const logoutAllOtherSessions = async () => {
    const res = await fetch('/api/auth/logout-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to revoke other sessions');
    if (data.token) {
      handleAuthSuccess(data.user || user, data.token);
    }
    return true;
  };

  const deleteAccount = async (password = '') => {
    const res = await fetch('/api/auth/account', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete account');
    logout();
    return true;
  };

  const updateProfile = async (fields) => {
    if (!token) return;
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(fields)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update profile');
    setUser(data.user);
    return data.user;
  };

  const logStudyMinutes = async (minutes) => {
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/study-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ minutes })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) setUser(data.user);
        return data.user;
      }
    } catch {}
    return null;
  };

  const logout = () => {
    localStorage.removeItem('studyhub_jwt');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        guestLogin,
        upgradeGuest,
        changePassword,
        logoutAllOtherSessions,
        deleteAccount,
        logout,
        updateProfile,
        updateUser: setUser,
        logStudyMinutes
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

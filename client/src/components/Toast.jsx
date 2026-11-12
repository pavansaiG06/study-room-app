import React, { createContext, useContext, useState, useCallback } from 'react';
import { Info, CheckCircle, AlertTriangle, Bell, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts(prev => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast Render Host */}
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 left-3 sm:left-auto sm:right-4 z-[80] flex flex-col gap-2 sm:max-w-sm pointer-events-none">
        {toasts.map(toast => {
          let borderClass = 'border-l-purple-500';
          let Icon = Info;
          let iconColor = 'text-purple-400';

          if (toast.type === 'success') {
            borderClass = 'border-l-emerald-500';
            Icon = CheckCircle;
            iconColor = 'text-emerald-400';
          } else if (toast.type === 'error') {
            borderClass = 'border-l-rose-500';
            Icon = AlertTriangle;
            iconColor = 'text-rose-400';
          } else if (toast.type === 'alarm') {
            borderClass = 'border-l-amber-500';
            Icon = Bell;
            iconColor = 'text-amber-400';
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center gap-3 bg-dark-800/95 border border-white/10 border-l-4 ${borderClass} text-slate-100 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md transition-all duration-300 animate-slide-in text-sm`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${iconColor}`} />
              <span className="flex-1 font-medium">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

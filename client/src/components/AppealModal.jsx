import React, { useState } from 'react';
import { X, Send, ShieldAlert, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

export function AppealModal({ isOpen, onClose, userEmail = '', initialType = 'ban_appeal' }) {
  const { user, token } = useAuth();
  const { addToast } = useToast();

  const [email, setEmail] = useState(userEmail || user?.email || '');
  const [appealType, setAppealType] = useState(initialType);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedMsg = message.trim();
    if (!trimmedMsg) {
      setError('Please write a message explaining your case to the administrator.');
      return;
    }

    if (!user && !email.trim()) {
      setError('Please provide your registered email address.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = token ? '/api/auth/appeal-authenticated' : '/api/auth/appeal';
      const payload = token
        ? { message: trimmedMsg, appealType }
        : { email: email.trim().toLowerCase(), message: trimmedMsg, appealType };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        setSubmitted(true);
        addToast('Appeal submitted to the StudyHub Administrator', 'success');
      } else {
        setError(data.error || 'Failed to submit appeal');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 modal-backdrop-enter">
      <div className="w-full max-w-lg glass-panel p-6 sm:p-7 rounded-3xl border border-white/15 shadow-2xl relative animate-popover-in space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Appeal Ban or Penalty</h3>
              <p className="text-[11px] text-slate-400">Direct message to StudyHub Administration Team</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-white">Appeal Submitted Successfully</h4>
            <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
              Your explanation has been delivered to the admin dashboard. We will review your account history, room conduct, and appeal plea.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white font-semibold text-xs mt-2"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!user && (
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Registered Account Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full glass-input px-3.5 py-2 rounded-xl text-xs text-white"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Appeal Category
              </label>
              <select
                value={appealType}
                onChange={(e) => setAppealType(e.target.value)}
                className="w-full glass-input px-3 py-2 rounded-xl text-xs text-white bg-dark-900"
              >
                <option value="ban_appeal">Account Ban Appeal (Request Account Reactivation)</option>
                <option value="warning_appeal">Warning / Strike Removal Plea</option>
                <option value="room_ban_appeal">Room Ban Inconsistency</option>
                <option value="general_inquiry">General Safety / Behavioral Inquiry</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                Explain Your Situation / Plead Your Case
              </label>
              <textarea
                required
                rows={5}
                placeholder="Describe what occurred, why you believe the sanction should be re-evaluated, and your commitment to StudyHub's community safety guidelines..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full glass-input px-3 py-2.5 rounded-xl text-xs text-white resize-none"
                maxLength={2000}
              />
              <div className="text-[10px] text-slate-400 text-right mt-0.5">
                {message.length} / 2000 characters
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl glass-card hover:bg-white/10 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-brand-purple hover:bg-brand-purple/90 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-brand-purple/20"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Submitting...' : 'Send Appeal to Admin'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

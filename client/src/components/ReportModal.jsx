import React, { useState, useEffect, useRef } from 'react';
import { X, Flag, Upload, Trash2, ShieldAlert, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { compressBannerImage } from '../utils/image';

const REPORT_CATEGORIES = [
  'Harassment or abusive behavior',
  'Spam or unwanted self-promotion',
  'Inappropriate video, audio, or screen share',
  'Impersonation or privacy violation',
  'Restricted activity / cheating',
  'Other safety concern'
];

export function ReportModal({
  isOpen,
  onClose,
  targetUser = null,
  roomId = null,
  roomName = null,
  targetType = 'user',
  prefillDescription = ''
}) {
  const { user, token } = useAuth();
  const { addToast } = useToast();
  const fileRef = useRef(null);

  const [category, setCategory] = useState(REPORT_CATEGORIES[0]);
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState(prefillDescription);
  const [evidenceImage, setEvidenceImage] = useState(null);
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [notifyHost, setNotifyHost] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCategory(REPORT_CATEGORIES[0]);
      setSeverity('medium');
      setDescription(prefillDescription || '');
      setEvidenceImage(null);
      setAlsoBlock(false);
      setNotifyHost(true);
    }
  }, [isOpen, prefillDescription]);

  if (!isOpen) return null;

  const targetUserId = targetUser?.userId || targetUser?.id || null;
  const targetUserName = targetUser?.name || targetUser?.senderName || null;
  const isSelf = targetUserId && user?.id === targetUserId;

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressBannerImage(file, 1280, 960);
      setEvidenceImage(compressed);
    } catch (err) {
      addToast(err.message || 'Could not attach image', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      addToast('Sign in to submit a report', 'warning');
      return;
    }
    if (!description.trim()) {
      addToast('Please describe the restricted activity', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          targetUserId,
          roomId,
          targetType,
          category,
          severity,
          description: description.trim(),
          evidenceImage,
          notifyHost: !!roomId && notifyHost,
          alsoBlock: !!targetUserId && !isSelf && alsoBlock
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit report');

      addToast('Report submitted. Thank you for helping keep StudyHub safe.', 'success');
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm modal-backdrop-enter">
      <div className="glass-card modal-panel-enter w-full max-w-lg rounded-2xl border border-rose-500/25 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/10 bg-rose-500/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Report Restricted Activity</h2>
              <p className="text-[11px] text-slate-400">
                Confidential safety report • Photo evidence is optional
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="touch-control btn-tactile p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Context summary */}
          {(targetUserName || roomName) && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-dark-950/70 border border-white/10 text-xs">
              <Flag className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-slate-400">Reporting:</span>
              {targetUserName && (
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white font-semibold">
                  {targetUserName}
                </span>
              )}
              {roomName && (
                <span className="px-2 py-0.5 rounded-md bg-brand-purple/20 text-purple-200 border border-brand-purple/30">
                  Room: {roomName}
                </span>
              )}
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Violation Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950/80 border border-white/10 text-white text-sm focus:outline-none focus:border-rose-400"
            >
              {REPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Severity Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'low', label: 'Low', color: 'border-amber-500/40 bg-amber-500/15 text-amber-300' },
                { id: 'medium', label: 'Medium', color: 'border-orange-500/40 bg-orange-500/15 text-orange-300' },
                { id: 'high', label: 'High / Urgent', color: 'border-rose-500/50 bg-rose-500/20 text-rose-300' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeverity(s.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    severity === s.id
                      ? s.color
                      : 'border-white/10 bg-dark-950/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Details of What Happened *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the incident clearly (what occurred, approximate time, or message context)..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950/80 border border-white/10 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-rose-400 resize-none"
            />
          </div>

          {/* Optional Evidence Screenshot */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Screenshot / Photo Evidence <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              {evidenceImage && (
                <button
                  type="button"
                  onClick={() => setEvidenceImage(null)}
                  className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />

            {evidenceImage ? (
              <div className="relative rounded-xl overflow-hidden border border-white/15 bg-black/40">
                <img
                  src={evidenceImage}
                  alt="Report evidence"
                  className="w-full max-h-44 object-contain"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-4 px-4 rounded-xl border border-dashed border-white/15 bg-dark-950/40 hover:bg-white/5 hover:border-white/30 transition-all flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white"
              >
                <Upload className="w-4 h-4 text-slate-400" />
                Attach screenshot or photo (not required)
              </button>
            )}
          </div>

          {/* Safety options */}
          <div className="space-y-2 pt-1">
            {roomId && (
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyHost}
                  onChange={(e) => setNotifyHost(e.target.checked)}
                  className="rounded accent-rose-500"
                />
                Notify room owner & admins immediately so they can moderate
              </label>
            )}
            {targetUserId && !isSelf && (
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={alsoBlock}
                  onChange={(e) => setAlsoBlock(e.target.checked)}
                  className="rounded accent-rose-500"
                />
                Also block <strong className="text-white">{targetUserName || 'this user'}</strong> from messaging or friending me
              </label>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-500/20 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

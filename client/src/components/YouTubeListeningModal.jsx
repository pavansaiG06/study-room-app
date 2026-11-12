import React, { useState, useEffect } from 'react';
import { X, Music2, Video, Headphones, Check, Trash2, Sparkles, ExternalLink, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from './Toast';

export function YouTubeListeningModal({ isOpen, onClose }) {
  const { user, token } = useAuth();
  const { myListening, updateListening } = useSocket();
  const { addToast } = useToast();

  const [urlInput, setUrlInput] = useState('');
  const [onlyShareSongs, setOnlyShareSongs] = useState(true);
  const [previewMeta, setPreviewMeta] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(myListening?.url || '');
      setPreviewMeta(myListening || null);
    }
  }, [isOpen, myListening]);

  if (!isOpen) return null;

  const isGuest = !!user?.is_guest;

  const inspectUrl = async (e) => {
    e?.preventDefault();
    const clean = urlInput.trim();
    if (!clean || !token) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/auth/youtube/meta?url=${encodeURIComponent(clean)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not detect YouTube link');
      setPreviewMeta(data.meta);
    } catch (err) {
      addToast(err.message, 'error');
      setPreviewMeta(null);
    } finally {
      setChecking(false);
    }
  };

  const handleShare = async () => {
    const clean = urlInput.trim();
    if (!clean) return;
    setSaving(true);
    try {
      let resolved = previewMeta;
      if (!resolved || resolved.url !== clean) {
        const res = await fetch(`/api/auth/youtube/meta?url=${encodeURIComponent(clean)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not detect YouTube link');
        resolved = data.meta;
        setPreviewMeta(resolved);
      }

      if (onlyShareSongs && !resolved.isSong) {
        addToast('This YouTube link looks like a normal video, not a song. Uncheck "Songs only" if you still want to share it.', 'error', 5000);
        setSaving(false);
        return;
      }

      await updateListening(clean);
      addToast(
        resolved.isSong
          ? `Now sharing song: ${resolved.trackTitle}`
          : `Now sharing video: ${resolved.title}`,
        'success'
      );
      onClose();
    } catch (err) {
      addToast(err.message || 'Could not share track', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await updateListening(null);
      setUrlInput('');
      setPreviewMeta(null);
      addToast('Cleared YouTube listening status', 'info');
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to clear status', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm modal-backdrop-enter" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel modal-panel-enter w-full max-w-md max-h-[92dvh] overflow-y-auto p-5 sm:p-6 rounded-3xl border border-white/15 shadow-2xl relative space-y-4"
      >
        <button onClick={onClose} className="touch-control btn-tactile absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center justify-center">
            <Headphones className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">YouTube Now Listening</h3>
            <p className="text-[11px] text-slate-400">
              Automatically detects whether a YouTube link is a song vs a normal video.
            </p>
          </div>
        </div>

        {isGuest ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center space-y-1.5">
            <Lock className="w-5 h-5 text-amber-400 mx-auto" />
            <div className="text-xs font-bold text-amber-200">Registered Accounts Only</div>
            <p className="text-[11px] text-slate-300">
              Create a free StudyHub account to display live YouTube tracks on your room tile &amp; profile card.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={inspectUrl} className="flex gap-2">
              <input
                type="url"
                placeholder="Paste youtube.com or music.youtube.com link..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="flex-1 glass-input px-3 py-2 rounded-xl text-xs"
                required
              />
              <button
                type="submit"
                disabled={checking || !urlInput.trim()}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white disabled:opacity-40"
              >
                {checking ? 'Detecting...' : 'Detect'}
              </button>
            </form>

            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyShareSongs}
                onChange={(e) => setOnlyShareSongs(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              Only broadcast links classified as Music / Songs
            </label>

            {previewMeta && (
              <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-white/10 flex gap-3 items-center">
                {previewMeta.thumbnailUrl && (
                  <img
                    src={previewMeta.thumbnailUrl}
                    alt={previewMeta.title}
                    className="w-16 h-12 rounded-xl object-cover flex-shrink-0 border border-white/10"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {previewMeta.isSong ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-[9px] font-bold uppercase flex items-center gap-1">
                        <Music2 className="w-2.5 h-2.5" /> Song Detected ({previewMeta.category})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/35 text-sky-300 text-[9px] font-bold uppercase flex items-center gap-1">
                        <Video className="w-2.5 h-2.5" /> Video ({previewMeta.category})
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    {previewMeta.isSong ? previewMeta.trackTitle : previewMeta.title}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                    <span>{previewMeta.isSong ? previewMeta.artistName : previewMeta.author}</span>
                    {previewMeta.url && (
                      <a
                        href={previewMeta.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-white inline-flex items-center"
                        title="Open on YouTube"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              {myListening && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleClear}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              )}
              <button
                type="button"
                disabled={saving || !urlInput.trim()}
                onClick={handleShare}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-dark-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg disabled:opacity-40"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Updating...' : 'Show on My Profile & Room'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

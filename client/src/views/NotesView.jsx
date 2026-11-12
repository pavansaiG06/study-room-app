import React, { useState, useEffect, useRef } from 'react';
import { FileText, Copy, Check, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export function NotesView() {
  const { token } = useAuth();
  const { addToast } = useToast();

  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('All changes saved');
  const [copied, setCopied] = useState(false);
  const debounceTimerRef = useRef(null);

  // Load existing note
  useEffect(() => {
    if (!token) return;
    async function loadNote() {
      try {
        const res = await fetch('/api/notes', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setContent(data.content || '');
          if (data.updated_at) {
            setSaveStatus(`Saved at ${new Date(data.updated_at).toLocaleTimeString()}`);
          }
        }
      } catch (err) {}
    }
    loadNote();
  }, [token]);

  const saveNoteToServer = async (text) => {
    if (!token) return;
    try {
      setSaveStatus('Saving changes...');
      const res = await fetch('/api/notes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: text })
      });
      if (res.ok) {
        setSaveStatus(`Saved at ${new Date().toLocaleTimeString()}`);
      } else {
        setSaveStatus('Error saving');
      }
    } catch (err) {
      setSaveStatus('Failed to save');
    }
  };

  const handleChange = (e) => {
    const text = e.target.value;
    setContent(text);
    setSaveStatus('Unsaved edits...');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      saveNoteToServer(text);
    }, 700);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true);
      addToast('Notes copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="w-full py-2 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-brand-purple" />
            Study Notes & Scratchpad
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Quick jotting during research or study sessions.</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
            <Save className="w-3.5 h-3.5 text-emerald-400" />
            {saveStatus}
          </span>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl glass-card text-xs text-slate-300 hover:text-white transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-white/5 shadow-2xl flex flex-col">
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Start typing your study notes, formulas, or reminders here... Everything autosaves continuously."
          rows={16}
          className="w-full bg-transparent text-slate-100 text-sm leading-relaxed placeholder:text-slate-500 focus:outline-none resize-none font-mono"
        />

        <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-500">
          <span>{wordCount} words</span>
          <span>{charCount} characters</span>
        </div>
      </div>
    </div>
  );
}

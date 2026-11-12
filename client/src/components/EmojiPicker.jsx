import React, { useState, useRef, useEffect } from 'react';
import { Smile, Search, Sparkles, BookOpen, ThumbsUp, Heart, X } from 'lucide-react';

const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    name: 'Smileys',
    icon: Smile,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥹', '😊',
      '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😎', '🤓',
      '🧐', '🤔', '🤫', '🫡', '🤗', '🥳', '🤩', '🤯', '😴', '🥺'
    ]
  },
  {
    id: 'study',
    name: 'Study & Work',
    icon: BookOpen,
    emojis: [
      '📚', '📖', '📕', '📗', '📘', '📙', '📝', '✏️', '🖊️', '💡',
      '🧠', '🎯', '⏳', '⏰', '⏱️', '💻', '🖥️', '⌨️', '🎧', '☕',
      '🍵', '🔬', '🔭', '📊', '📈', '🎓', '🎒', '🏆', '🥇', '📌'
    ]
  },
  {
    id: 'hands',
    name: 'Gestures',
    icon: ThumbsUp,
    emojis: [
      '👍', '👎', '👏', '🙌', '👐', '🤝', '✌️', '🤞', '🤟', '🤘',
      '🤙', '👋', '✋', '🤚', '👊', '✊', '🤛', '🤜', '💪', '🙏',
      '🫶', '🫂', '💅', '✨', '🔥', '💯', '🚀', '⚡', '💥', '💫'
    ]
  },
  {
    id: 'hearts',
    name: 'Hearts & Vibe',
    icon: Heart,
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💖',
      '💗', '💓', '💞', '💕', '💘', '💝', '🎉', '🎊', '🎈', '⭐',
      '🌟', '☀️', '🌙', '☁️', '🌧️', '⚡', '🍀', '🌸', '🍕', '🍩'
    ]
  }
];

export function EmojiPicker({ onSelectEmoji, onClose, align = 'bottom' }) {
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [search, setSearch] = useState('');
  const pickerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose?.();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredEmojis = search.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((_, idx, arr) => arr.indexOf(_) === idx)
    : EMOJI_CATEGORIES.find((c) => c.id === activeCategory)?.emojis || [];

  return (
    <div
      ref={pickerRef}
      className={`animate-popover-in absolute z-50 w-72 sm:w-80 rounded-2xl glass-panel border border-white/20 shadow-2xl backdrop-blur-2xl p-2.5 flex flex-col gap-2 ${
        align === 'top' ? 'bottom-full mb-2 left-0' : 'bottom-12 right-0'
      }`}
    >
      {/* Search Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-dark-900/80 border border-white/10">
        <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search emojis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
          autoFocus
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Category Tabs */}
      {!search.trim() && (
        <div className="flex items-center gap-1 border-b border-white/10 pb-1.5 px-0.5">
          {EMOJI_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                title={cat.name}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all ${
                  active
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="grid grid-cols-6 sm:grid-cols-7 gap-1 max-h-48 overflow-y-auto no-scrollbar p-1">
        {filteredEmojis.map((emoji, index) => (
          <button
            key={`${emoji}-${index}`}
            type="button"
            onClick={() => {
              onSelectEmoji(emoji);
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:scale-125 hover:bg-white/10 active:scale-95 transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

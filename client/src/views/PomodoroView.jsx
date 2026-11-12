import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Coffee, Briefcase, Bell, CheckCircle2, Sparkles } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

export function PomodoroView() {
  const { addToast } = useToast();
  const { user, logStudyMinutes } = useAuth();
  const { pushLocalNotification } = useNotifications();

  const [workMinutes, setWorkMinutes] = useState(
    () => user?.preferences?.pomoWork || Number(localStorage.getItem('studyhub_pomo_work')) || 25
  );
  const [breakMinutes, setBreakMinutes] = useState(
    () => user?.preferences?.pomoBreak || Number(localStorage.getItem('studyhub_pomo_break')) || 5
  );
  const [timeLeft, setTimeLeft] = useState(workMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [lastFinishedSession, setLastFinishedSession] = useState(null);

  useEffect(() => {
    if (!isRunning && user?.preferences) {
      if (user.preferences.pomoWork) setWorkMinutes(user.preferences.pomoWork);
      if (user.preferences.pomoBreak) setBreakMinutes(user.preferences.pomoBreak);
    }
  }, [user?.preferences]);

  useEffect(() => {
    localStorage.setItem('studyhub_pomo_work', workMinutes);
    localStorage.setItem('studyhub_pomo_break', breakMinutes);
    if (!isRunning) {
      setTimeLeft(isBreak ? breakMinutes * 60 : workMinutes * 60);
    }
  }, [workMinutes, breakMinutes]);

  const playFanfareChime = () => {
    if (user?.preferences?.soundEnabled === false) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // 4-chord pleasant completion arpeggio (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const startTime = now + i * 0.16;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.28, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

        osc.start(startTime);
        osc.stop(startTime + 0.85);
      });
    } catch {}
  };

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          playFanfareChime();
          const nextIsBreak = !isBreak;

          if (!isBreak) {
            logStudyMinutes(workMinutes);
          }

          setIsBreak(nextIsBreak);
          const nextTime = nextIsBreak ? breakMinutes * 60 : workMinutes * 60;

          const title = nextIsBreak ? '🍅 Pomodoro Finished! Time for a break.' : '☕ Break ended! Time to focus.';
          const body = nextIsBreak
            ? `Awesome job! You completed ${workMinutes} minutes of focused study. Rest for ${breakMinutes}m.`
            : `Break is over! Get ready for your next ${workMinutes}-minute focus sprint.`;

          addToast(title, 'success', 8000);
          setLastFinishedSession({
            type: nextIsBreak ? 'work_done' : 'break_done',
            title,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });

          pushLocalNotification({
            type: 'system',
            title,
            body
          });

          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(title, {
                body,
                icon: '/icon-192.png'
              });
            } catch {}
          }

          return nextTime;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isBreak, workMinutes, breakMinutes, logStudyMinutes, addToast, pushLocalNotification]);

  const toggleTimer = () => {
    if (!isRunning && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setIsRunning((prev) => !prev);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsBreak(false);
    setTimeLeft(workMinutes * 60);
    setLastFinishedSession(null);
  };

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const seconds = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <div className="w-full max-w-3xl mx-auto py-4 space-y-4">
      {/* Session Finished Notification Banner */}
      {lastFinishedSession && (
        <div className="animate-popover-in glass-panel p-4 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-400/20 text-emerald-300 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                {lastFinishedSession.title}
                <span className="text-[10px] text-emerald-300 font-normal">at {lastFinishedSession.time}</span>
              </div>
              <div className="text-[11px] text-slate-300">
                {lastFinishedSession.type === 'work_done'
                  ? 'Your focus session was automatically saved to your study streak!'
                  : 'Time to dive back into learning.'}
              </div>
            </div>
          </div>
          <button
            onClick={() => setLastFinishedSession(null)}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-white/5 text-center shadow-2xl relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-brand-purple/20 blur-3xl pointer-events-none" />

        <div className="flex items-center justify-center gap-2 mb-6">
          {isBreak ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider border border-emerald-400/30 shadow-md">
              <Coffee className="w-4 h-4" /> Break Time
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-purple/20 text-brand-purple text-xs font-bold uppercase tracking-wider border border-brand-purple/30 shadow-md">
              <Briefcase className="w-4 h-4" /> Focus Session
            </span>
          )}
        </div>

        {/* Digital Countdown Display */}
        <div className="text-7xl sm:text-8xl font-black font-mono tracking-tight text-white mb-8 select-none">
          {minutes}:{seconds}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <button
            onClick={toggleTimer}
            className={`flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-base transition-all shadow-xl ${
              isRunning
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                : 'bg-gradient-to-r from-brand-purple to-brand-blue text-white hover:opacity-95 shadow-brand-purple/30'
            }`}
          >
            {isRunning ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            {isRunning ? 'Pause' : 'Start'}
          </button>

          <button
            onClick={resetTimer}
            className="flex items-center gap-2 px-5 py-3.5 rounded-2xl glass-card text-slate-300 hover:text-white hover:border-white/20 text-base font-semibold transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            Reset
          </button>
        </div>

        {/* Duration Sliders / Inputs */}
        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
          <div className="text-left">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Work Duration (min)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              disabled={isRunning}
              value={workMinutes}
              onChange={(e) => setWorkMinutes(Math.max(1, Math.min(120, Number(e.target.value))))}
              className="w-full glass-input px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            />
          </div>

          <div className="text-left">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Break Duration (min)
            </label>
            <input
              type="number"
              min="1"
              max="60"
              disabled={isRunning}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Math.max(1, Math.min(60, Number(e.target.value))))}
              className="w-full glass-input px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

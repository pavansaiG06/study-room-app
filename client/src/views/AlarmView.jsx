import React, { useState, useEffect, useRef } from 'react';
import { Bell, Plus, Trash2, Clock, Volume2, X, BellOff, RotateCcw } from 'lucide-react';
import { useToast } from '../components/Toast';
import { useNotifications } from '../context/NotificationContext';

export function AlarmView() {
  const { addToast } = useToast();
  const { pushLocalNotification } = useNotifications();
  const [alarms, setAlarms] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('studyhub_alarms')) || [];
    } catch {
      return [];
    }
  });
  const [alarmTime, setAlarmTime] = useState('');
  const [alarmLabel, setAlarmLabel] = useState('');
  const [ringingAlarm, setRingingAlarm] = useState(null);

  const ringAudioIntervalRef = useRef(null);
  const titleFlashIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('studyhub_alarms', JSON.stringify(alarms));
  }, [alarms]);

  // Continuous synthesised alarm chime generator
  const playChimeBurst = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      // High-low alternating wake tone
      [0, 0.25, 0.5, 0.75].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const freq = idx % 2 === 0 ? 880 : 1046.5; // A5 and C6
        osc.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(0.35, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);

        osc.start(now + offset);
        osc.stop(now + offset + 0.19);
      });
    } catch {}
  };

  const startContinuousRinging = (alarm) => {
    setRingingAlarm(alarm);

    // Initial burst immediately
    playChimeBurst();

    // Repeat every 1.4s continuously
    if (ringAudioIntervalRef.current) clearInterval(ringAudioIntervalRef.current);
    ringAudioIntervalRef.current = setInterval(playChimeBurst, 1400);

    // Flash tab title
    const originalTitle = document.title;
    let flash = false;
    if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current);
    titleFlashIntervalRef.current = setInterval(() => {
      document.title = flash ? `🔔 ALARM RINGING! (${alarm.time})` : originalTitle;
      flash = !flash;
    }, 900);
  };

  const stopRinging = () => {
    if (ringAudioIntervalRef.current) {
      clearInterval(ringAudioIntervalRef.current);
      ringAudioIntervalRef.current = null;
    }
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current);
      titleFlashIntervalRef.current = null;
      document.title = 'StudyHub — Live Virtual Study Rooms';
    }
    setRingingAlarm(null);
  };

  // Clock checker
  useEffect(() => {
    let lastCheckedDay = new Date().toDateString();

    const interval = setInterval(() => {
      const now = new Date();
      const currentDay = now.toDateString();

      // Reset triggered alarms on day change
      if (currentDay !== lastCheckedDay) {
        lastCheckedDay = currentDay;
        setAlarms((prev) => prev.map((a) => ({ ...a, triggered: false })));
      }

      const formattedNow = now.toTimeString().substring(0, 5);
      alarms.forEach((alarm) => {
        if (alarm.time === formattedNow && !alarm.triggered) {
          triggerAlarm(alarm);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [alarms]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (ringAudioIntervalRef.current) clearInterval(ringAudioIntervalRef.current);
      if (titleFlashIntervalRef.current) clearInterval(titleFlashIntervalRef.current);
    };
  }, []);

  const triggerAlarm = (alarm) => {
    startContinuousRinging(alarm);

    addToast(`⏰ ALARM RINGING: ${alarm.label || 'Study Time'} (${alarm.time})!`, 'alarm', 0); // stays until action
    pushLocalNotification({
      type: 'system',
      title: `⏰ Alarm Ringing (${alarm.time})`,
      body: alarm.label || 'Scheduled study alarm is firing now!'
    });

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`⏰ Alarm: ${alarm.label || 'Study Time'} (${alarm.time})`, {
          body: 'Click here or open StudyHub to turn off the alarm.',
          requireInteraction: true
        });
      } catch {}
    }

    setAlarms((prev) => prev.map((a) => (a.id === alarm.id ? { ...a, triggered: true } : a)));
  };

  const handleDismiss = () => {
    stopRinging();
    addToast('Alarm turned off', 'info');
  };

  const handleSnooze = () => {
    if (!ringingAlarm) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    const snoozeTime = now.toTimeString().substring(0, 5);

    const snoozedAlarm = {
      id: Date.now().toString(36),
      time: snoozeTime,
      label: `Snoozed: ${ringingAlarm.label || 'Alarm'}`,
      triggered: false
    };

    setAlarms((prev) => [...prev, snoozedAlarm]);
    stopRinging();
    addToast(`Snoozed for 5 minutes (will ring at ${snoozeTime})`, 'info');
  };

  const addAlarm = (e) => {
    e.preventDefault();
    if (!alarmTime) return;

    if (alarms.some((a) => a.time === alarmTime)) {
      addToast('An alarm for this time already exists', 'error');
      return;
    }

    const newAlarm = {
      id: Date.now().toString(36),
      time: alarmTime,
      label: alarmLabel.trim() || 'Study Session',
      triggered: false
    };

    setAlarms((prev) => [...prev, newAlarm]);
    setAlarmTime('');
    setAlarmLabel('');
    addToast(`Alarm set for ${alarmTime}`, 'success');

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const removeAlarm = (id) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
    addToast('Alarm removed', 'info');
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-4 space-y-6">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-3">
          <Bell className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Daily Alarms</h2>
        <p className="text-sm text-slate-400 mt-1">
          Set continuous ringing alarms for your classes, deadlines, and study blocks that stay on screen until dismissed.
        </p>
      </div>

      <div className="glass-panel p-6 rounded-3xl border border-white/5 shadow-2xl space-y-6">
        <form onSubmit={addAlarm} className="flex flex-col sm:flex-row gap-2">
          <input
            type="time"
            required
            value={alarmTime}
            onChange={(e) => setAlarmTime(e.target.value)}
            className="w-full sm:w-36 glass-input px-4 py-2.5 rounded-xl text-sm font-mono text-center text-white"
          />
          <input
            type="text"
            placeholder="Label (e.g. Physics lecture, Math prep)..."
            value={alarmLabel}
            onChange={(e) => setAlarmLabel(e.target.value)}
            className="flex-1 glass-input px-4 py-2.5 rounded-xl text-sm text-white placeholder-slate-400"
          />
          <button
            type="submit"
            className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white font-semibold text-sm transition-all shadow-md shadow-brand-purple/20 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Set Alarm
          </button>
        </form>

        <div className="space-y-2">
          {alarms.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-6">No alarms currently active.</p>
          ) : (
            alarms.map((alarm) => (
              <div
                key={alarm.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-dark-900/60 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-purple/20 text-brand-purple flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-white">{alarm.time}</span>
                      {alarm.triggered && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                          Fired today
                        </span>
                      )}
                    </div>
                    {alarm.label && (
                      <div className="text-xs text-slate-400">{alarm.label}</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeAlarm(alarm.id)}
                  className="p-2 text-slate-400 hover:text-rose-400 transition-colors rounded-lg hover:bg-white/5"
                  title="Delete alarm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PERSISTENT RINGING ALARM MODAL OVERLAY (Issue 7) */}
      {ringingAlarm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 modal-backdrop-enter">
          <div className="w-full max-w-sm glass-panel p-6 sm:p-8 rounded-3xl border-2 border-amber-500/60 shadow-[0_0_60px_rgba(245,158,11,0.35)] text-center space-y-6 animate-popover-in">
            {/* Animated Pulsing Bell */}
            <div className="relative mx-auto w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-300">
              <span className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-60" />
              <Bell className="w-10 h-10 animate-bounce" />
            </div>

            <div className="space-y-1">
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-bold uppercase tracking-wider">
                Alarm Ringing
              </span>
              <div className="text-4xl font-black font-mono tracking-tight text-white pt-2">
                {ringingAlarm.time}
              </div>
              <p className="text-sm font-semibold text-slate-200">
                {ringingAlarm.label || 'Time to study!'}
              </p>
              <p className="text-xs text-slate-400">
                This alarm will continue ringing until you turn it off.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleDismiss}
                className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-xl shadow-rose-600/30 flex items-center justify-center gap-2 transition-all"
              >
                <BellOff className="w-4 h-4" />
                Turn Off Alarm
              </button>

              <button
                onClick={handleSnooze}
                className="w-full py-2.5 px-4 rounded-xl glass-card hover:bg-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                Snooze for 5 Minutes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

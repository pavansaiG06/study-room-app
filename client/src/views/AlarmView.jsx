import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Clock } from 'lucide-react';
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

  useEffect(() => {
    localStorage.setItem('studyhub_alarms', JSON.stringify(alarms));
  }, [alarms]);

  // Clock checker
  useEffect(() => {
    let lastCheckedDay = new Date().toDateString();

    const interval = setInterval(() => {
      const now = new Date();
      const currentDay = now.toDateString();

      // Reset triggered alarms on day change
      if (currentDay !== lastCheckedDay) {
        lastCheckedDay = currentDay;
        setAlarms(prev => prev.map(a => ({ ...a, triggered: false })));
      }

      const formattedNow = now.toTimeString().substring(0, 5);
      alarms.forEach(alarm => {
        if (alarm.time === formattedNow && !alarm.triggered) {
          triggerAlarm(alarm);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [alarms]);

  const triggerAlarm = (alarm) => {
    playAlarmTone();
    addToast(`Alarm Triggered: It is now ${alarm.time}!`, 'alarm', 10000);
    pushLocalNotification({
      type: 'system',
      title: `Study Alarm (${alarm.time})`,
      body: `Scheduled alarm triggered at ${alarm.time}`
    });

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('StudyHub Alarm', { body: `It's ${alarm.time}` });
    }

    setAlarms(prev => prev.map(a => a.id === alarm.id ? { ...a, triggered: true } : a));
  };

  const playAlarmTone = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
      osc.start();
      osc.stop(audioCtx.currentTime + 1.5);
    } catch (e) {}
  };

  const addAlarm = (e) => {
    e.preventDefault();
    if (!alarmTime) return;

    if (alarms.some(a => a.time === alarmTime)) {
      addToast('An alarm for this time already exists', 'error');
      return;
    }

    const newAlarm = {
      id: Date.now().toString(36),
      time: alarmTime,
      triggered: false
    };

    setAlarms(prev => [...prev, newAlarm]);
    setAlarmTime('');
    addToast(`Alarm set for ${alarmTime}`, 'success');

    // Request notification permissions if not already decided
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const removeAlarm = (id) => {
    setAlarms(prev => prev.filter(a => a.id !== id));
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
          Set timed notifications for your classes, deadlines, and study blocks.
        </p>
      </div>

      <div className="glass-panel p-6 rounded-3xl border border-white/5 shadow-2xl">
        <form onSubmit={addAlarm} className="flex gap-2 mb-6">
          <input
            type="time"
            required
            value={alarmTime}
            onChange={(e) => setAlarmTime(e.target.value)}
            className="flex-1 glass-input px-4 py-2.5 rounded-xl text-sm font-mono text-center text-white"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white font-semibold text-sm transition-all shadow-md shadow-brand-purple/20"
          >
            <Plus className="w-4 h-4" />
            Set Alarm
          </button>
        </form>

        <div className="space-y-2">
          {alarms.length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-6">No alarms currently active.</p>
          ) : (
            alarms.map(alarm => (
              <div
                key={alarm.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-dark-900/60 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-brand-purple" />
                  <span className="font-mono text-base font-bold text-white">{alarm.time}</span>
                  {alarm.triggered && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      Fired today
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeAlarm(alarm.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

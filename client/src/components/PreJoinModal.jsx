import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Sparkles,
  Volume2,
  Users,
  ArrowRight,
  VolumeX,
  Headphones
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMediaSettings } from '../context/MediaSettingsContext';
import { UserAvatar } from './UserAvatar';

export function PreJoinModal({ isOpen, room, onCancel, onConfirmJoin }) {
  const { user } = useAuth();
  const {
    selectedMicId,
    setSelectedMicId,
    selectedCamId,
    setSelectedCamId,
    selectedSpeakerId,
    setSelectedSpeakerId,
    blurBackground,
    setBlurBackground,
    skipGreenRoom,
    setSkipGreenRoom
  } = useMediaSettings();

  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [devices, setDevices] = useState({ mics: [], cams: [], speakers: [] });
  const [micLevel, setMicLevel] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  // Enumerate devices and preview media when opened
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let audioCtx = null;

    async function setupPreview() {
      try {
        // Request devices only if user turned mic or cam on, or enumerate available devices
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices({
            mics: list.filter((d) => d.kind === 'audioinput'),
            cams: list.filter((d) => d.kind === 'videoinput'),
            speakers: list.filter((d) => d.kind === 'audiooutput')
          });
        }
      } catch {}
    }

    setupPreview();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioCtx) audioCtx.close().catch(() => {});
    };
  }, [isOpen]);

  // Manage live preview stream when micOn or camOn changes
  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let audioCtx = null;

    async function updateStream() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setMicLevel(0);

      if (!micOn && !camOn) {
        if (videoRef.current) videoRef.current.srcObject = null;
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: micOn ? (selectedMicId ? { deviceId: { exact: selectedMicId } } : true) : false,
          video: camOn ? (selectedCamId ? { deviceId: { exact: selectedCamId }, width: 640, height: 360 } : { width: 640, height: 360 }) : false
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current && camOn) {
          videoRef.current.srcObject = stream;
        }

        // Refresh device labels now that permission was granted
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices({
            mics: list.filter((d) => d.kind === 'audioinput'),
            cams: list.filter((d) => d.kind === 'videoinput'),
            speakers: list.filter((d) => d.kind === 'audiooutput')
          });
        }

        // Mic level meter
        if (micOn && stream.getAudioTracks().length > 0) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            audioCtx = new AudioCtx();
            const src = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 128;
            src.connect(analyser);
            const arr = new Uint8Array(analyser.frequencyBinCount);

            const tick = () => {
              analyser.getByteFrequencyData(arr);
              let sum = 0;
              for (let i = 0; i < arr.length; i++) sum += arr[i];
              setMicLevel(Math.min(100, Math.round((sum / arr.length) * 2)));
              rafRef.current = requestAnimationFrame(tick);
            };
            tick();
          }
        }
      } catch (err) {
        console.warn('Preview device unavailable:', err);
      }
    }

    updateStream();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioCtx) audioCtx.close().catch(() => {});
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, micOn, camOn, selectedMicId, selectedCamId]);

  if (!isOpen || !room) return null;

  const handleJoin = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    onConfirmJoin({ micOn: micOn && !deafened, camOn, deafened });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/75 backdrop-blur-md modal-backdrop-enter">
      <div className="glass-panel modal-panel-enter w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-3xl border border-white/10 shadow-2xl grid grid-cols-1 md:grid-cols-12">
        {/* Left: Video Green Room Preview */}
        <div className="md:col-span-7 p-4 sm:p-5 bg-dark-950/70 flex flex-col justify-between">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-dark-900 border border-white/10 flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] transition-all ${
                camOn ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
              } ${blurBackground ? 'blur-[2px] brightness-95' : ''}`}
            />

            {!camOn && (
              <div className="flex flex-col items-center gap-2">
                <UserAvatar
                  name={user?.name}
                  avatarUrl={user?.avatar_url}
                  avatarColor={user?.avatar_color}
                  sizeClass="w-20 h-20 text-2xl"
                />
                <span className="text-xs text-slate-400">Camera is off</span>
              </div>
            )}

            {/* Preview Blur badge */}
            {camOn && blurBackground && (
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-brand-purple/80 text-white text-[10px] font-semibold backdrop-blur-md">
                Edge Blur Active
              </span>
            )}

            {/* Quick Media Toggles overlaid on preview */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2.5 p-2 rounded-2xl bg-dark-900/85 backdrop-blur-md border border-white/10">
              <button
                type="button"
                onClick={() => setMicOn((p) => !p)}
                title={micOn ? 'Mute Mic' : 'Enable Mic'}
                className={`p-2.5 rounded-xl transition-all ${
                  micOn ? 'bg-emerald-500 text-white' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>

              <button
                type="button"
                disabled={!!user?.is_guest}
                onClick={() => !user?.is_guest && setCamOn((p) => !p)}
                title={user?.is_guest ? 'Camera disabled in Guest Mode' : camOn ? 'Turn Off Camera' : 'Enable Camera'}
                className={`p-2.5 rounded-xl transition-all ${
                  camOn && !user?.is_guest ? 'bg-brand-purple text-white' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {camOn && !user?.is_guest ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !deafened;
                  setDeafened(next);
                  if (next) setMicOn(false);
                }}
                title={deafened ? 'Undeafen' : 'Deafen'}
                className={`p-2.5 rounded-xl transition-all ${
                  deafened ? 'bg-rose-500 text-white' : 'bg-white/10 text-slate-300 hover:text-white'
                }`}
              >
                {deafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setBlurBackground((p) => !p)}
                title="Background Privacy Blur"
                className={`p-2.5 rounded-xl transition-all ${
                  blurBackground ? 'bg-brand-purple/40 text-brand-purple border border-brand-purple/40' : 'bg-white/10 text-slate-300 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mic Test Meter */}
          <div className="mt-3 flex items-center gap-2.5 px-2">
            <Volume2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div className="flex-1 h-2 rounded-full bg-dark-900 overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-100"
                style={{ width: `${micOn ? micLevel : 0}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 w-16 text-right">
              {micOn ? 'Mic Live' : 'Muted'}
            </span>
          </div>
        </div>

        {/* Right: Device Pickers & Room Summary */}
        <div className="md:col-span-5 p-4 sm:p-6 flex flex-col justify-between relative">
          <button
            onClick={onCancel}
            className="touch-control btn-tactile absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="space-y-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">
                Ready to join?
              </span>
              <h3 className="text-xl font-bold text-white mt-0.5 pr-6 truncate">{room.name}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                <span className="px-2 py-0.5 rounded-md bg-white/5 text-slate-300">{room.vibe || room.category || 'Study'}</span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {room.liveParticipantsCount || 0} in room
                </span>
              </div>
            </div>

            {/* Device Selectors */}
            <div className="space-y-2.5 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Microphone
                </label>
                <select
                  value={selectedMicId}
                  onChange={(e) => setSelectedMicId(e.target.value)}
                  className="w-full glass-input px-3 py-1.5 rounded-xl text-xs bg-dark-900 text-slate-200"
                >
                  <option value="">System Default Mic</option>
                  {devices.mics.map((m, i) => (
                    <option key={m.deviceId || i} value={m.deviceId}>
                      {m.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Camera
                </label>
                <select
                  value={selectedCamId}
                  onChange={(e) => setSelectedCamId(e.target.value)}
                  className="w-full glass-input px-3 py-1.5 rounded-xl text-xs bg-dark-900 text-slate-200"
                >
                  <option value="">System Default Camera</option>
                  {devices.cams.map((c, i) => (
                    <option key={c.deviceId || i} value={c.deviceId}>
                      {c.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              {devices.speakers.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Speaker Output
                  </label>
                  <select
                    value={selectedSpeakerId}
                    onChange={(e) => setSelectedSpeakerId(e.target.value)}
                    className="w-full glass-input px-3 py-1.5 rounded-xl text-xs bg-dark-900 text-slate-200"
                  >
                    <option value="">System Default Output</option>
                    {devices.speakers.map((s, i) => (
                      <option key={s.deviceId || i} value={s.deviceId}>
                        {s.label || `Speaker ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-4">
            {user?.is_guest && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200">
                Guest Mode: Camera, Screen Share, Chat &amp; Invite links are disabled for safety.
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={skipGreenRoom}
                onChange={(e) => setSkipGreenRoom(e.target.checked)}
                className="accent-purple-500 rounded"
              />
              Skip green room preview next time
            </label>

            <button
              onClick={handleJoin}
              className="btn-tactile w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-95 text-white font-bold text-sm transition-all shadow-lg shadow-brand-purple/25 flex items-center justify-center gap-2"
            >
              Join Now
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

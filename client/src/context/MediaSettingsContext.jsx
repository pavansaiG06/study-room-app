import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const MediaSettingsContext = createContext(null);

const STORAGE_KEY = 'studyhub_media_settings';

function loadLocalSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function MediaSettingsProvider({ children }) {
  const { user } = useAuth();
  const initial = loadLocalSettings();

  const [selectedMicId, setSelectedMicId] = useState(initial.selectedMicId || '');
  const [selectedCamId, setSelectedCamId] = useState(initial.selectedCamId || '');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(initial.selectedSpeakerId || '');

  const [noiseSuppression, setNoiseSuppression] = useState(initial.noiseSuppression ?? true);
  const [echoCancellation, setEchoCancellation] = useState(initial.echoCancellation ?? true);
  const [autoGain, setAutoGain] = useState(initial.autoGain ?? true);

  const [inputMode, setInputMode] = useState(initial.inputMode || 'vad'); // 'vad' | 'ptt'
  const [pttKey, setPttKey] = useState(initial.pttKey || 'Space');
  const [vadThreshold, setVadThreshold] = useState(initial.vadThreshold ?? 12);
  const [soundboardVolume, setSoundboardVolume] = useState(initial.soundboardVolume ?? 80);

  const [blurBackground, setBlurBackground] = useState(initial.blurBackground ?? false);
  const [deafened, setDeafened] = useState(false);
  const [micMuted, setMicMuted] = useState(false);

  const [chatDensity, setChatDensity] = useState(initial.chatDensity || 'cozy');
  const [selfViewMode, setSelfViewMode] = useState(initial.selfViewMode || 'grid');
  const [skipGreenRoom, setSkipGreenRoom] = useState(initial.skipGreenRoom ?? false);

  const [userVolumes, setUserVolumes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('studyhub_user_volumes')) || {};
    } catch {
      return {};
    }
  });

  // Sync saved preferences from authenticated user profile when available
  useEffect(() => {
    if (user?.voice_settings) {
      const vs = user.voice_settings;
      if (vs.noiseSuppression !== undefined) setNoiseSuppression(vs.noiseSuppression);
      if (vs.echoCancellation !== undefined) setEchoCancellation(vs.echoCancellation);
      if (vs.autoGain !== undefined) setAutoGain(vs.autoGain);
      if (vs.inputMode) setInputMode(vs.inputMode);
      if (vs.pttKey) setPttKey(vs.pttKey);
      if (vs.soundboardVolume !== undefined) setSoundboardVolume(vs.soundboardVolume);
    }
    if (user?.preferences) {
      if (user.preferences.chatDensity) setChatDensity(user.preferences.chatDensity);
      if (user.preferences.selfViewMode) setSelfViewMode(user.preferences.selfViewMode);
    }
  }, [user?.id]);

  // Persist local settings
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedMicId,
        selectedCamId,
        selectedSpeakerId,
        noiseSuppression,
        echoCancellation,
        autoGain,
        inputMode,
        pttKey,
        vadThreshold,
        soundboardVolume,
        blurBackground,
        chatDensity,
        selfViewMode,
        skipGreenRoom
      })
    );
  }, [
    selectedMicId,
    selectedCamId,
    selectedSpeakerId,
    noiseSuppression,
    echoCancellation,
    autoGain,
    inputMode,
    pttKey,
    vadThreshold,
    soundboardVolume,
    blurBackground,
    chatDensity,
    selfViewMode,
    skipGreenRoom
  ]);

  const setParticipantVolume = useCallback((userId, volumePercent) => {
    const clamped = Math.max(0, Math.min(200, Number(volumePercent)));
    setUserVolumes((prev) => {
      const next = { ...prev, [userId]: clamped };
      localStorage.setItem('studyhub_user_volumes', JSON.stringify(next));
      return next;
    });
  }, []);

  const getParticipantVolume = useCallback(
    (userId) => {
      return userVolumes[userId] !== undefined ? userVolumes[userId] : 100;
    },
    [userVolumes]
  );

  return (
    <MediaSettingsContext.Provider
      value={{
        selectedMicId,
        setSelectedMicId,
        selectedCamId,
        setSelectedCamId,
        selectedSpeakerId,
        setSelectedSpeakerId,
        noiseSuppression,
        setNoiseSuppression,
        echoCancellation,
        setEchoCancellation,
        autoGain,
        setAutoGain,
        inputMode,
        setInputMode,
        pttKey,
        setPttKey,
        vadThreshold,
        setVadThreshold,
        soundboardVolume,
        setSoundboardVolume,
        blurBackground,
        setBlurBackground,
        deafened,
        setDeafened,
        micMuted,
        setMicMuted,
        chatDensity,
        setChatDensity,
        selfViewMode,
        setSelfViewMode,
        skipGreenRoom,
        setSkipGreenRoom,
        userVolumes,
        setParticipantVolume,
        getParticipantVolume
      }}
    >
      {children}
    </MediaSettingsContext.Provider>
  );
}

export function useMediaSettings() {
  const ctx = useContext(MediaSettingsContext);
  if (!ctx) throw new Error('useMediaSettings must be used within MediaSettingsProvider');
  return ctx;
}

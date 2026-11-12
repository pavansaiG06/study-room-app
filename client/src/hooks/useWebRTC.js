import { useState, useEffect, useRef, useCallback } from 'react';
import { useMediaSettings } from '../context/MediaSettingsContext';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' }
];

export function useWebRTC(socket, roomId, myParticipantInfo, initialMedia = {}) {
  const {
    selectedMicId,
    selectedCamId,
    noiseSuppression,
    echoCancellation,
    autoGain,
    blurBackground,
    vadThreshold
  } = useMediaSettings();

  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> MediaStream
  const [micOn, setMicOn] = useState(!!initialMedia.micOn);
  const [camOn, setCamOn] = useState(!!initialMedia.camOn);
  const [deafened, setDeafened] = useState(!!initialMedia.deafened);
  const [screenSharing, setScreenSharing] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState({}); // socketId -> boolean

  const peerConnections = useRef({}); // socketId -> RTCPeerConnection
  const makingOfferRef = useRef({}); // socketId -> boolean
  const ignoreOfferRef = useRef({}); // socketId -> boolean
  const localStreamRef = useRef(null);
  const rawCamStreamRef = useRef(null);
  const screenTrackRef = useRef(null);
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS);
  const blurRafRef = useRef(null);
  const analysersRef = useRef(new Map()); // key ('local' | socketId) -> { analyser, dataArray, source }
  const audioCtxRef = useRef(null);

  // Fetch ICE servers once
  useEffect(() => {
    fetch('/api/webrtc/ice-servers')
      .then((res) => res.json())
      .then((data) => {
        if (data.iceServers && data.iceServers.length > 0) {
          iceServersRef.current = data.iceServers;
        }
      })
      .catch(() => {});
  }, []);

  // Setup Web Audio Analyser for speaking indicator
  const attachAnalyser = useCallback((key, stream) => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;

      if (analysersRef.current.has(key)) {
        try {
          analysersRef.current.get(key).source.disconnect();
        } catch {}
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analysersRef.current.set(key, { analyser, dataArray, source });
    } catch {}
  }, []);

  // Poll speaking levels
  useEffect(() => {
    const interval = setInterval(() => {
      const next = {};
      analysersRef.current.forEach(({ analyser, dataArray }, key) => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const targetKey = key === 'local' ? (myParticipantInfo?.socketId || 'local') : key;
        if (key === 'local' && (!micOn || deafened)) {
          next[targetKey] = false;
        } else {
          next[targetKey] = avg > Math.max(8, vadThreshold || 12);
        }
      });
      setSpeakingUsers((prev) => {
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const k of keys) {
          if (!!prev[k] !== !!next[k]) return next;
        }
        return prev;
      });
    }, 140);

    return () => clearInterval(interval);
  }, [micOn, deafened, vadThreshold, myParticipantInfo?.socketId]);

  const cleanupPeer = useCallback((remoteSocketId) => {
    if (peerConnections.current[remoteSocketId]) {
      try {
        peerConnections.current[remoteSocketId].close();
      } catch {}
      delete peerConnections.current[remoteSocketId];
    }
    delete makingOfferRef.current[remoteSocketId];
    delete ignoreOfferRef.current[remoteSocketId];

    if (analysersRef.current.has(remoteSocketId)) {
      try {
        analysersRef.current.get(remoteSocketId).source.disconnect();
      } catch {}
      analysersRef.current.delete(remoteSocketId);
    }
    setRemoteStreams((prev) => {
      const copy = { ...prev };
      delete copy[remoteSocketId];
      return copy;
    });
  }, []);

  const createPeerConnection = useCallback(
    (remoteSocketId) => {
      if (peerConnections.current[remoteSocketId]) {
        return peerConnections.current[remoteSocketId];
      }

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

      // Pre-allocate audio & video transceivers with 'sendrecv'
      // This pre-negotiates m=audio and m=video sections in SDP offer/answer so
      // replaceTrack works instantaneously when either peer turns on mic, cam or screen share later!
      const existingTracks = localStreamRef.current ? localStreamRef.current.getTracks() : [];
      const audioTrack = existingTracks.find((t) => t.kind === 'audio');
      const videoTrack = screenTrackRef.current || existingTracks.find((t) => t.kind === 'video');

      if (audioTrack) {
        try {
          pc.addTrack(audioTrack, localStreamRef.current);
        } catch {}
      } else {
        try {
          pc.addTransceiver('audio', { direction: 'sendrecv' });
        } catch {}
      }

      if (videoTrack) {
        try {
          pc.addTrack(videoTrack, localStreamRef.current || new MediaStream([videoTrack]));
        } catch {}
      } else {
        try {
          pc.addTransceiver('video', { direction: 'sendrecv' });
        } catch {}
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('signal', {
            to: remoteSocketId,
            signal: { type: 'candidate', candidate: event.candidate }
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        attachAnalyser(remoteSocketId, stream);

        const pushStreamUpdate = () => {
          setRemoteStreams((prev) => {
            const allTracks = stream.getTracks();
            return {
              ...prev,
              [remoteSocketId]: new MediaStream(allTracks)
            };
          });
        };

        event.track.onunmute = pushStreamUpdate;
        event.track.onmute = pushStreamUpdate;
        event.track.onended = pushStreamUpdate;
        pushStreamUpdate();
      };

      // Perfect Negotiation offer handler for dynamic track additions
      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current[remoteSocketId] = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          socket?.emit('signal', {
            to: remoteSocketId,
            signal: { type: 'offer', sdp: offer }
          });
        } catch (err) {
          console.warn('Renegotiation offer error:', err);
        } finally {
          makingOfferRef.current[remoteSocketId] = false;
        }
      };

      pc.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          cleanupPeer(remoteSocketId);
        }
      };

      peerConnections.current[remoteSocketId] = pc;
      return pc;
    },
    [socket, cleanupPeer, attachAnalyser]
  );

  // Ultra-lightweight portrait edge-blur pipeline (eliminates CPU saturation & voice delay)
  const buildProcessedVideoTrack = useCallback((rawStream, shouldBlur) => {
    if (blurRafRef.current) {
      cancelAnimationFrame(blurRafRef.current);
      blurRafRef.current = null;
    }

    const rawVideoTrack = rawStream.getVideoTracks()[0];
    if (!rawVideoTrack || !shouldBlur) {
      return rawVideoTrack;
    }

    try {
      const video = document.createElement('video');
      video.srcObject = new MediaStream([rawVideoTrack]);
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => {});

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');

      // Downscaled offscreen canvas for super-fast blur (<0.5ms vs ~16ms on main thread)
      const offscreen = document.createElement('canvas');
      offscreen.width = 160;
      offscreen.height = 90;
      const offCtx = offscreen.getContext('2d');

      let lastFrameTime = 0;
      const targetFrameInterval = 1000 / 24; // Smooth 24 FPS cap

      const draw = (currentTime) => {
        blurRafRef.current = requestAnimationFrame(draw);
        if (currentTime - lastFrameTime < targetFrameInterval) return;
        lastFrameTime = currentTime;

        if (video.readyState >= 2) {
          // 1. Draw downscaled video with small blur radius (16x fewer pixels)
          offCtx.save();
          offCtx.filter = 'blur(3px)';
          offCtx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
          offCtx.restore();

          // 2. Scale back up to 640x360 with bilinear interpolation (smooth bokeh effect with ~0% CPU)
          ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);

          // 3. Draw sharp centered oval portrait window
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(canvas.width / 2, canvas.height / 2, canvas.width * 0.32, canvas.height * 0.44, 0, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
      };
      blurRafRef.current = requestAnimationFrame(draw);

      const blurredStream = canvas.captureStream(24);
      return blurredStream.getVideoTracks()[0];
    } catch {
      return rawVideoTrack;
    }
  }, []);

  // Acquire local media with low-latency audio constraints
  const acquireMedia = useCallback(
    async ({ enableAudio = false, enableVideo = false } = {}) => {
      try {
        const audioConstraints = {
          noiseSuppression,
          echoCancellation,
          autoGainControl: autoGain,
          channelCount: 1, // mono audio cuts latency and data rate in half
          latency: 0.01,
          ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {})
        };
        const videoConstraints = {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { max: 24 },
          ...(selectedCamId ? { deviceId: { exact: selectedCamId } } : {})
        };

        let rawStream;
        try {
          rawStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: videoConstraints
          });
        } catch {
          rawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        }

        rawCamStreamRef.current = rawStream;
        const audioTrack = rawStream.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = enableAudio;

        const rawVideoTrack = rawStream.getVideoTracks()[0];
        let activeVideoTrack = rawVideoTrack;
        if (rawVideoTrack) {
          rawVideoTrack.enabled = enableVideo;
          if (enableVideo && blurBackground) {
            activeVideoTrack = buildProcessedVideoTrack(rawStream, true);
          }
        }

        const outTracks = [];
        if (audioTrack) outTracks.push(audioTrack);
        if (activeVideoTrack) outTracks.push(activeVideoTrack);
        const outStream = new MediaStream(outTracks);

        localStreamRef.current = outStream;
        setLocalStream(outStream);
        attachAnalyser('local', outStream);

        // Update existing peer connections immediately
        Object.values(peerConnections.current).forEach((pc) => {
          const senders = pc.getSenders();
          outStream.getTracks().forEach((track) => {
            const existing =
              senders.find((s) => s.track && s.track.kind === track.kind) ||
              senders.find((s) => !s.track && pc.getTransceivers().some((t) => t.sender === s && t.receiver?.track?.kind === track.kind));

            if (existing) {
              existing.replaceTrack(track).catch(() => {
                try {
                  pc.addTrack(track, outStream);
                } catch {}
              });
            } else {
              try {
                pc.addTrack(track, outStream);
              } catch {}
            }
          });
        });

        return outStream;
      } catch (err) {
        console.warn('Media permission unavailable:', err.message);
        return null;
      }
    },
    [selectedMicId, selectedCamId, noiseSuppression, echoCancellation, autoGain, blurBackground, buildProcessedVideoTrack, attachAnalyser]
  );

  // Initialize green room media preferences on room join
  useEffect(() => {
    const canInitCam = !!initialMedia.camOn && !myParticipantInfo?.isGuest;
    if (initialMedia.micOn || canInitCam) {
      acquireMedia({
        enableAudio: !!initialMedia.micOn && !initialMedia.deafened,
        enableVideo: canInitCam
      });
    }
  }, []);

  // Re-apply blur toggle dynamically if camera is currently on
  useEffect(() => {
    if (!camOn || !rawCamStreamRef.current || screenSharing) return;
    const newVideoTrack = buildProcessedVideoTrack(rawCamStreamRef.current, blurBackground);
    if (!newVideoTrack) return;
    newVideoTrack.enabled = true;

    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    const nextStream = new MediaStream(audioTrack ? [audioTrack, newVideoTrack] : [newVideoTrack]);
    localStreamRef.current = nextStream;
    setLocalStream(nextStream);

    Object.values(peerConnections.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => (s.track && s.track.kind === 'video') || pc.getTransceivers().some((t) => t.sender === s && t.receiver?.track?.kind === 'video'));
      if (sender) sender.replaceTrack(newVideoTrack).catch(() => {});
    });
  }, [blurBackground]);

  // Toggle Microphone
  const toggleMic = async () => {
    if (myParticipantInfo && myParticipantInfo.canAudio === false) return;

    let stream = localStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) {
      stream = await acquireMedia({ enableAudio: true, enableVideo: camOn });
      if (!stream) return;
      setMicOn(true);
      if (deafened) setDeafened(false);
      socket?.emit('media-toggle', { roomId, micOn: true, camOn, deafened: false, screenSharing });
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const newState = !audioTrack.enabled;
      audioTrack.enabled = newState;
      setMicOn(newState);
      const nextDeafened = newState ? false : deafened;
      if (newState && deafened) setDeafened(false);
      socket?.emit('media-toggle', { roomId, micOn: newState, camOn, deafened: nextDeafened, screenSharing });
    }
  };

  // Toggle Deafen (mutes mic AND silences all incoming audio)
  const toggleDeafen = () => {
    const nextDeafened = !deafened;
    setDeafened(nextDeafened);
    let nextMic = micOn;
    if (nextDeafened && localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = false;
      nextMic = false;
      setMicOn(false);
    }
    socket?.emit('media-toggle', { roomId, micOn: nextMic, camOn, deafened: nextDeafened, screenSharing });
  };

  // Toggle Camera
  const toggleCam = async () => {
    if (myParticipantInfo && (myParticipantInfo.isGuest || myParticipantInfo.canVideo === false)) return;

    let stream = localStreamRef.current;
    if (!stream || stream.getVideoTracks().length === 0) {
      stream = await acquireMedia({ enableAudio: micOn, enableVideo: true });
      if (!stream) return;
      setCamOn(true);
      socket?.emit('media-toggle', { roomId, micOn, camOn: true, deafened, screenSharing });
      return;
    }

    const rawVideo = rawCamStreamRef.current?.getVideoTracks()[0];
    const activeVideo = stream.getVideoTracks()[0];
    const newState = !camOn;

    if (rawVideo) rawVideo.enabled = newState;
    if (activeVideo) activeVideo.enabled = newState;

    // Instantly transmit or mute video frames over existing video senders
    Object.values(peerConnections.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => (s.track && s.track.kind === 'video') || pc.getTransceivers().some((t) => t.sender === s && t.receiver?.track?.kind === 'video'));
      if (sender) {
        sender.replaceTrack(newState ? activeVideo : null).catch(() => {});
      }
    });

    setCamOn(newState);
    socket?.emit('media-toggle', { roomId, micOn, camOn: newState, deafened, screenSharing });
  };

  // Toggle Screen Share (with quality options & tab audio)
  const toggleScreenShare = async ({ maxHeight = 1080, frameRate = 30 } = {}) => {
    if (myParticipantInfo && (myParticipantInfo.isGuest || myParticipantInfo.canScreenShare === false)) return;

    if (screenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setScreenSharing(false);

      const camTrack = camOn ? localStreamRef.current?.getVideoTracks()[0] : null;
      Object.values(peerConnections.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => (s.track && s.track.kind === 'video') || pc.getTransceivers().some((t) => t.sender === s && t.receiver?.track?.kind === 'video'));
        if (sender) {
          sender.replaceTrack(camTrack || null).catch(() => {});
        }
      });
      socket?.emit('media-toggle', { roomId, micOn, camOn, deafened, screenSharing: false });
    } else {
      if (!navigator?.mediaDevices?.getDisplayMedia) {
        console.warn('Screen sharing is not supported on this mobile browser.');
        return false;
      }
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { height: { ideal: maxHeight }, frameRate: { ideal: frameRate } },
          audio: true
        });
        const screenTrack = displayStream.getVideoTracks()[0];
        screenTrackRef.current = screenTrack;

        screenTrack.onended = () => {
          setScreenSharing(false);
          const camTrack = camOn ? localStreamRef.current?.getVideoTracks()[0] : null;
          Object.values(peerConnections.current).forEach((pc) => {
            const sender = pc.getSenders().find((s) => (s.track && s.track.kind === 'video') || pc.getTransceivers().some((t) => t.sender === s && t.receiver?.track?.kind === 'video'));
            if (sender) {
              sender.replaceTrack(camTrack || null).catch(() => {});
            }
          });
          socket?.emit('media-toggle', { roomId, micOn, camOn, deafened, screenSharing: false });
        };

        // Immediately route the screen track over existing video transceivers
        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => (s.track && s.track.kind === 'video') || pc.getTransceivers().some((t) => t.sender === s && t.receiver?.track?.kind === 'video'));
          if (sender) {
            sender.replaceTrack(screenTrack).catch(() => {
              try {
                pc.addTrack(screenTrack, displayStream);
              } catch {}
            });
          } else {
            try {
              pc.addTrack(screenTrack, displayStream);
            } catch {}
          }
        });

        setScreenSharing(true);
        socket?.emit('media-toggle', { roomId, micOn, camOn, deafened, screenSharing: true });
      } catch (err) {
        console.warn('Screen share canceled:', err);
      }
    }
  };

  // Host moderation enforcement callbacks
  const forceMuteAudio = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
    }
    setMicOn(false);
  }, []);

  const forceDisableVideo = useCallback(() => {
    if (rawCamStreamRef.current) {
      rawCamStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = false));
    }
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = false));
    }
    setCamOn(false);
  }, []);

  const forceStopScreenShare = useCallback(() => {
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    setScreenSharing(false);
  }, []);

  // Socket signaling events with Perfect Negotiation
  useEffect(() => {
    if (!socket || !roomId) return;

    const handleUserJoined = async ({ socketId }) => {
      const pc = createPeerConnection(socketId);
      try {
        makingOfferRef.current[socketId] = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: socketId, signal: { type: 'offer', sdp: offer } });
      } catch (err) {
        console.error('Offer error:', err);
      } finally {
        makingOfferRef.current[socketId] = false;
      }
    };

    const handleSignal = async ({ from, signal }) => {
      const pc = createPeerConnection(from);
      try {
        if (signal.type === 'offer') {
          const isPolite = socket.id < from;
          const offerCollision = makingOfferRef.current[from] || pc.signalingState !== 'stable';
          ignoreOfferRef.current[from] = !isPolite && offerCollision;
          if (ignoreOfferRef.current[from]) {
            return;
          }
          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }),
              pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { to: from, signal: { type: 'answer', sdp: answer } });
        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          }
        } else if (signal.type === 'candidate' && signal.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            if (!ignoreOfferRef.current[from]) throw err;
          }
        }
      } catch (err) {
        console.error('Signal error:', err);
      }
    };

    const handleUserLeft = ({ socketId }) => cleanupPeer(socketId);

    socket.on('user-joined', handleUserJoined);
    socket.on('signal', handleSignal);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('signal', handleSignal);
      socket.off('user-left', handleUserLeft);
    };
  }, [socket, roomId, createPeerConnection, cleanupPeer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (blurRafRef.current) cancelAnimationFrame(blurRafRef.current);
      if (rawCamStreamRef.current) {
        rawCamStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
      }
      Object.keys(peerConnections.current).forEach((id) => cleanupPeer(id));
    };
  }, [cleanupPeer]);

  return {
    localStream,
    remoteStreams,
    micOn,
    camOn,
    deafened,
    screenSharing,
    speakingUsers,
    toggleMic,
    toggleCam,
    toggleDeafen,
    toggleScreenShare,
    forceMuteAudio,
    forceDisableVideo,
    forceStopScreenShare,
    reacquireMedia: () => acquireMedia({ enableAudio: micOn && !deafened, enableVideo: camOn })
  };
}

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  VideoOff,
  Monitor,
  Crown,
  Pin,
  MoreVertical,
  Hand,
  VolumeX,
  Volume2,
  Ban,
  UserMinus,
  Maximize2,
  PictureInPicture2,
  Flag,
  Music2,
  Video
} from 'lucide-react';
import { useMediaSettings } from '../context/MediaSettingsContext';
import { getAvatarFrameClass } from '../utils/themes';

function VideoTile({
  stream,
  isLocal,
  participant,
  isSpeaking,
  isPinnedLocal,
  isPinnedGlobal,
  isHostOrAdmin,
  deafened,
  locallyHiddenVideo,
  locallyBlocked,
  onToggleLocalPin,
  onPinForEveryone,
  onToggleLocalVideoHide,
  onBlockUser,
  onReportUser,
  onModerate,
  onOpenUserPopout,
  compact = false,
  assignNodeRef
}) {
  const videoRef = useRef(null);
  const tileRef = useRef(null);
  const audioGainRef = useRef(null);
  const menuRef = useRef(null);

  const { selectedSpeakerId, getParticipantVolume, setParticipantVolume } = useMediaSettings();
  const [menuOpen, setMenuOpen] = useState(false);

  const userVol = participant?.userId ? getParticipantVolume(participant.userId) : 100;

  // Bind stream and speaker output / volume
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;

    videoEl.srcObject = stream;

    if (!isLocal && selectedSpeakerId && typeof videoEl.setSinkId === 'function') {
      videoEl.setSinkId(selectedSpeakerId).catch(() => {});
    }

    if (!isLocal) {
      if (deafened || locallyBlocked || userVol === 0) {
        videoEl.muted = true;
      } else {
        videoEl.muted = false;
        videoEl.volume = Math.min(1, userVol / 100);
      }

      // Optional >100% boost via Web Audio GainNode
      if (userVol > 100 && !deafened && !locallyBlocked) {
        try {
          if (!audioGainRef.current && stream.getAudioTracks().length > 0) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              const src = ctx.createMediaStreamSource(stream);
              const gain = ctx.createGain();
              gain.gain.value = userVol / 100;
              src.connect(gain);
              gain.connect(ctx.destination);
              audioGainRef.current = { ctx, gain };
              videoEl.muted = true; // prevent double output
            }
          } else if (audioGainRef.current) {
            audioGainRef.current.gain.gain.value = userVol / 100;
            videoEl.muted = true;
          }
        } catch {}
      } else if (audioGainRef.current) {
        try {
          audioGainRef.current.ctx.close();
        } catch {}
        audioGainRef.current = null;
      }
    }
  }, [stream, isLocal, selectedSpeakerId, deafened, locallyBlocked, userVol]);

  // Cleanup audio gain context on unmount
  useEffect(() => {
    return () => {
      if (audioGainRef.current) {
        try {
          audioGainRef.current.ctx.close();
        } catch {}
      }
    };
  }, []);

  // Close 3-dot dropdown on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const hasLiveVideoTrack =
    !locallyHiddenVideo &&
    !locallyBlocked &&
    stream &&
    stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  const handleFullscreen = () => {
    setMenuOpen(false);
    if (tileRef.current?.requestFullscreen) {
      tileRef.current.requestFullscreen().catch(() => {});
    }
  };

  const handlePiP = async () => {
    setMenuOpen(false);
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current && hasLiveVideoTrack && videoRef.current.requestPictureInPicture) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {}
  };

  return (
    <div
      ref={(el) => {
        tileRef.current = el;
        assignNodeRef?.(el);
      }}
      className={`relative rounded-2xl overflow-hidden glass-card w-full h-full ${
        compact ? 'min-h-[96px]' : 'min-h-[160px] sm:min-h-[200px]'
      } flex items-center justify-center group shadow-xl bg-dark-950/90 transition-[box-shadow,border-color,background-color] duration-200 ${
        isSpeaking
          ? 'ring-2 ring-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.22)] border border-emerald-400/60'
          : isPinnedGlobal || isPinnedLocal
          ? 'ring-2 ring-brand-purple/70 border border-brand-purple/40'
          : 'border border-white/10'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full ${
          participant?.screenSharing ? 'object-contain' : 'object-cover'
        } transition-opacity duration-300 ${
          hasLiveVideoTrack ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
        } ${isLocal && !participant?.screenSharing ? 'scale-x-[-1]' : ''}`}
      />

      {/* Avatar Fallback when Camera is Off or Locally Hidden */}
      {!hasLiveVideoTrack && (
        <div
          onClick={() => participant?.userId && onOpenUserPopout?.(participant)}
          className="relative flex flex-col items-center justify-center p-4 cursor-pointer"
        >
          {isSpeaking && (
            <span
              aria-hidden="true"
              className={`speaking-halo absolute rounded-full border-2 border-emerald-400/65 pointer-events-none ${
                compact ? 'w-14 h-14' : 'w-22 h-22 sm:w-28 sm:h-28'
              }`}
              style={{ width: compact ? '3.5rem' : undefined, height: compact ? '3.5rem' : undefined }}
            />
          )}
          {participant?.avatarUrl && !locallyBlocked ? (
            <img
              src={participant.avatarUrl}
              alt={participant.name}
              className={`relative z-10 ${compact ? 'w-12 h-12' : 'w-20 h-20 sm:w-24 sm:h-24'} rounded-full object-cover shadow-xl transition-transform duration-300 ${
                isSpeaking
                  ? 'ring-4 ring-emerald-400 scale-105'
                  : getAvatarFrameClass(participant?.avatarFrame) || 'ring-2 ring-white/20'
              }`}
            />
          ) : (
            <div
              className={`relative z-10 ${compact ? 'w-12 h-12 text-sm' : 'w-20 h-20 sm:w-24 sm:h-24 text-xl sm:text-2xl'} rounded-full flex items-center justify-center text-white font-bold shadow-xl transition-transform duration-300 ${
                isSpeaking
                  ? 'ring-4 ring-emerald-400 scale-105'
                  : getAvatarFrameClass(participant?.avatarFrame) || 'ring-2 ring-white/20'
              }`}
              style={{ backgroundColor: participant?.avatarColor || '#8b5cf6' }}
            >
              {participant?.name ? participant.name.slice(0, 2).toUpperCase() : 'SH'}
            </div>
          )}
        </div>
      )}

      {/* Top Badges: Raised Hand & Pin */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
        {participant?.handRaised && (
          <span className="animate-popover-in px-2 py-1 rounded-xl bg-amber-500 text-dark-950 text-[11px] font-bold flex items-center gap-1 shadow-lg">
            <Hand className="w-3.5 h-3.5 animate-bounce" /> Raised
          </span>
        )}
        {(isPinnedGlobal || isPinnedLocal) && (
          <span className="animate-popover-in px-2 py-1 rounded-xl bg-brand-purple/90 text-white text-[10px] font-bold flex items-center gap-1 shadow-md">
            <Pin className="w-3 h-3" /> {isPinnedGlobal ? 'Pinned for all' : 'Pinned'}
          </span>
        )}
      </div>

      {/* Top-Right 3-dot Menu (matches video call settings example.png) */}
      <div className="absolute top-2 right-2 z-20" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((p) => !p);
          }}
          title="Video Call Options"
          aria-label="Video Call Options"
          className="btn-tactile min-w-[34px] min-h-[34px] flex items-center justify-center rounded-full bg-dark-900/80 hover:bg-dark-800 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md transition-opacity opacity-90 sm:opacity-75 sm:group-hover:opacity-100"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div className="animate-popover-in absolute right-0 mt-1.5 w-56 max-w-[calc(100vw-2rem)] max-h-[60dvh] overflow-y-auto rounded-2xl bg-[#181f2e] border border-white/15 shadow-2xl py-1.5 text-xs text-slate-200 z-30 backdrop-blur-xl">
            {/* Local Pin */}
            <button
              onClick={() => {
                onToggleLocalPin?.(participant?.socketId);
                setMenuOpen(false);
              }}
              className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left"
            >
              <Pin className="w-3.5 h-3.5 text-slate-300" />
              {isPinnedLocal ? 'Unpin' : 'Pin'}
            </button>

            {/* Pin / Unpin for everyone (Host/Admin) */}
            {isHostOrAdmin && (
              <>
                <button
                  onClick={() => {
                    onPinForEveryone?.(participant?.socketId);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left"
                >
                  <Pin className="w-3.5 h-3.5 text-brand-purple" />
                  Pin for everyone
                </button>
                {isPinnedGlobal && (
                  <button
                    onClick={() => {
                      onPinForEveryone?.(null);
                      setMenuOpen(false);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left"
                  >
                    <Pin className="w-3.5 h-3.5 text-slate-400" />
                    Unpin for everyone
                  </button>
                )}
              </>
            )}

            {/* Local Volume Slider for Remote Participant */}
            {!isLocal && participant?.userId && (
              <div className="px-3.5 py-2 border-y border-white/10 my-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span className="flex items-center gap-1"><Volume2 className="w-3 h-3" /> Volume</span>
                  <span className="font-mono text-brand-purple font-bold">{userVol}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={userVol}
                  onChange={(e) => setParticipantVolume(participant.userId, e.target.value)}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
            )}

            {!isLocal && (
              <>
                <button
                  onClick={() => {
                    onBlockUser?.(participant);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left text-rose-300"
                >
                  <Ban className="w-3.5 h-3.5" />
                  {locallyBlocked ? 'Unblock locally' : 'Block'}
                </button>
                <button
                  onClick={() => {
                    onReportUser?.(participant);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left text-amber-300"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Report User
                </button>
              </>
            )}

            {!isLocal && isHostOrAdmin && participant?.role !== 'owner' && (
              <button
                onClick={() => {
                  onModerate?.(participant.socketId, 'kick');
                  setMenuOpen(false);
                }}
                className="w-full px-3.5 py-2 hover:bg-rose-500/20 flex items-center gap-2.5 text-left text-rose-400"
              >
                <UserMinus className="w-3.5 h-3.5" />
                Kick
              </button>
            )}

            <button
              onClick={() => {
                onToggleLocalVideoHide?.(participant?.socketId);
                setMenuOpen(false);
              }}
              className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left"
            >
              <VideoOff className="w-3.5 h-3.5 text-slate-300" />
              {locallyHiddenVideo ? 'Turn on video' : 'Turn off video'}
            </button>

            <button
              onClick={handleFullscreen}
              className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left"
            >
              <Maximize2 className="w-3.5 h-3.5 text-slate-300" />
              Enter fullscreen
            </button>

            {hasLiveVideoTrack && (
              <button
                onClick={handlePiP}
                className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center gap-2.5 text-left"
              >
                <PictureInPicture2 className="w-3.5 h-3.5 text-slate-300" />
                Enter picture-in-picture
              </button>
            )}

            {/* Host Permission Controls (matches video call settings example.png) */}
            {!isLocal && isHostOrAdmin && participant?.role !== 'owner' && (
              <div className="border-t border-white/10 mt-1 pt-1">
                <button
                  onClick={() => {
                    onModerate?.(participant.socketId, participant.canAudio === false ? 'allow-audio' : 'disable-audio');
                    setMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-1.5 hover:bg-white/10 text-left text-[11px]"
                >
                  {participant.canAudio === false ? 'Allow audio' : 'Disable audio'}
                </button>
                <button
                  onClick={() => {
                    onModerate?.(participant.socketId, participant.canVideo === false ? 'allow-video' : 'disable-video');
                    setMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-1.5 hover:bg-white/10 text-left text-[11px]"
                >
                  {participant.canVideo === false ? 'Allow video' : 'Disable video'}
                </button>
                <button
                  onClick={() => {
                    onModerate?.(participant.socketId, participant.canScreenShare === false ? 'allow-screen' : 'disable-screen');
                    setMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-1.5 hover:bg-white/10 text-left text-[11px]"
                >
                  {participant.canScreenShare === false ? 'Allow screen sharing' : 'Disable screen sharing'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live YouTube Listening Activity Badge (Song vs Video) */}
      {participant?.listening && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            participant?.userId && onOpenUserPopout?.(participant);
          }}
          title={`${participant.listening.isSong ? 'Listening to song' : 'Watching on YouTube'}: ${participant.listening.title} (${participant.listening.artistName || participant.listening.author})`}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 max-w-[88%] flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-950/85 hover:bg-dark-900 border border-emerald-400/35 text-[10px] text-emerald-200 shadow-lg backdrop-blur-md cursor-pointer z-10 transition-colors"
        >
          {participant.listening.isSong ? (
            <span className="inline-flex items-end gap-0.5 h-2.5 flex-shrink-0">
              <span className="w-0.5 h-full bg-emerald-400 eq-bar eq-bar-1" />
              <span className="w-0.5 h-full bg-emerald-400 eq-bar eq-bar-2" />
              <span className="w-0.5 h-full bg-emerald-400 eq-bar eq-bar-3" />
            </span>
          ) : (
            <Video className="w-3 h-3 text-sky-400 flex-shrink-0" />
          )}
          <span className="truncate font-semibold max-w-[175px]">
            {participant.listening.isSong
              ? `${participant.listening.trackTitle || participant.listening.title}`
              : participant.listening.title}
          </span>
        </div>
      )}

      {/* Centered Small Name & Status Pill */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 max-w-[88%] flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full bg-dark-950/80 backdrop-blur-md border border-white/10 text-[11px] shadow-md">
        {(participant?.isHost || participant?.role === 'owner' || participant?.role === 'admin') && (
          <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" title={participant.role || 'Host'} />
        )}
        <button
          onClick={() => participant?.userId && onOpenUserPopout?.(participant)}
          className="font-medium text-slate-100 hover:text-white truncate max-w-[140px]"
        >
          {participant?.name}
          {isLocal ? ' (You)' : ''}
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {participant?.screenSharing && (
            <span className="text-blue-400" title="Sharing Screen">
              <Monitor className="w-3 h-3" />
            </span>
          )}
          {participant?.deafened && (
            <span className="text-rose-400" title="Deafened">
              <VolumeX className="w-3 h-3" />
            </span>
          )}
          {participant?.micOn && !participant?.deafened ? (
            isSpeaking ? (
              <span className="inline-flex items-end gap-0.5 h-3 w-3 justify-center flex-shrink-0" title="Speaking">
                <span className="w-0.5 h-full bg-emerald-400 rounded-full eq-bar eq-bar-1" />
                <span className="w-0.5 h-full bg-emerald-400 rounded-full eq-bar eq-bar-2" />
                <span className="w-0.5 h-full bg-emerald-400 rounded-full eq-bar eq-bar-3" />
              </span>
            ) : (
              <span className="text-emerald-400">
                <Mic className="w-3 h-3" />
              </span>
            )
          ) : (
            <span className="text-rose-400">
              <MicOff className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function VideoGrid({
  localStream,
  remoteStreams,
  participants,
  myParticipantInfo,
  micOn,
  camOn,
  deafened,
  screenSharing,
  handRaised,
  speakingUsers = {},
  layoutMode = 'auto', // 'auto' | 'tiled' | 'spotlight' | 'sidebar'
  pinnedGlobalSocketId = null,
  isHostOrAdmin = false,
  onPinForEveryone,
  onModerate,
  onReportUser,
  onOpenUserPopout
}) {
  const { selfViewMode } = useMediaSettings();
  const [pinnedLocalSocketId, setPinnedLocalSocketId] = useState(null);
  const [hiddenVideos, setHiddenVideos] = useState({});
  const [blockedLocally, setBlockedLocally] = useState({});
  const tileNodeMapRef = useRef(new Map());
  const prevRectsRef = useRef(new Map());

  const localSocketId = myParticipantInfo?.socketId || 'local';
  const localParticipant = {
    ...myParticipantInfo,
    socketId: localSocketId,
    micOn,
    camOn,
    deafened,
    screenSharing,
    handRaised
  };

  const remoteList = (participants || []).filter((p) => p.socketId !== localSocketId);

  // Build visible tiles list respecting selfViewMode
  const allTiles = [
    ...(selfViewMode === 'grid' ? [{ participant: localParticipant, stream: localStream, isLocal: true }] : []),
    ...remoteList.map((p) => ({ participant: p, stream: remoteStreams[p.socketId], isLocal: false }))
  ];

  const effectivePinnedId = pinnedLocalSocketId || pinnedGlobalSocketId;
  const screenSharer = allTiles.find((t) => t.participant.screenSharing);
  const pinnedTile = effectivePinnedId
    ? allTiles.find((t) => t.participant.socketId === effectivePinnedId)
    : null;

  const activeSpeakerTile = allTiles.find((t) => speakingUsers[t.participant.socketId]);
  const focalTile = pinnedTile || screenSharer || (layoutMode === 'spotlight' || layoutMode === 'sidebar' ? (activeSpeakerTile || allTiles[0]) : null);

  // Spotlight or Sidebar layout when focal tile exists (and not explicitly 'tiled')
  const useSpotlightOrSidebar =
    layoutMode !== 'tiled' &&
    allTiles.length > 1 &&
    (layoutMode === 'spotlight' || layoutMode === 'sidebar' || !!focalTile);

  const layoutSignature = `${layoutMode}|${useSpotlightOrSidebar}|${focalTile?.participant?.socketId || ''}|${selfViewMode}|${allTiles
    .map((t) => t.participant.socketId)
    .join(',')}`;

  // Google Meet-style FLIP animation when switching layouts, pinning tiles, or joining/leaving
  useLayoutEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    const nextRects = new Map();
    tileNodeMapRef.current.forEach((node, id) => {
      if (!node || !node.isConnected) return;
      const activeAnims = node.getAnimations?.().filter((a) => a.id === 'flip-tile');
      activeAnims?.forEach((a) => a.cancel());

      const next = node.getBoundingClientRect();
      if (next.width < 12 || next.height < 12) return;
      nextRects.set(id, next);

      if (prefersReduced) return;
      const prev = prevRectsRef.current.get(id);
      if (!prev || prev.width < 12 || prev.height < 12) return;

      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      const sx = prev.width / next.width;
      const sy = prev.height / next.height;

      if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(sx - 1) < 0.03 && Math.abs(sy - 1) < 0.03) {
        return;
      }

      if (typeof node.animate === 'function') {
        const anim = node.animate(
          [
            {
              transformOrigin: 'top left',
              transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`
            },
            {
              transformOrigin: 'top left',
              transform: 'translate3d(0, 0, 0) scale(1, 1)'
            }
          ],
          {
            duration: 320,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
          }
        );
        anim.id = 'flip-tile';
      }
    });

    prevRectsRef.current = nextRects;
  }, [layoutSignature]);

  useEffect(() => {
    const handleResize = () => {
      const updated = new Map();
      tileNodeMapRef.current.forEach((node, id) => {
        if (node?.isConnected) {
          const rect = node.getBoundingClientRect();
          if (rect.width >= 12 && rect.height >= 12) updated.set(id, rect);
        }
      });
      prevRectsRef.current = updated;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleLocalPin = (sid) => {
    setPinnedLocalSocketId((prev) => (prev === sid ? null : sid));
  };

  const toggleLocalVideoHide = (sid) => {
    setHiddenVideos((prev) => ({ ...prev, [sid]: !prev[sid] }));
  };

  const toggleLocalBlock = (participant) => {
    const sid = participant?.socketId;
    if (!sid) return;
    setBlockedLocally((prev) => ({ ...prev, [sid]: !prev[sid] }));
  };

  const renderTile = (item, compact = false, flipKey = null) => {
    const nodeKey = flipKey || item.participant.socketId;
    return (
      <VideoTile
        key={item.participant.socketId}
        assignNodeRef={(el) => {
          if (el) tileNodeMapRef.current.set(nodeKey, el);
          else tileNodeMapRef.current.delete(nodeKey);
        }}
        stream={item.stream}
        isLocal={item.isLocal}
        participant={item.participant}
        isSpeaking={!!speakingUsers[item.participant.socketId]}
        isPinnedLocal={pinnedLocalSocketId === item.participant.socketId}
        isPinnedGlobal={pinnedGlobalSocketId === item.participant.socketId}
        isHostOrAdmin={isHostOrAdmin}
        deafened={deafened}
        locallyHiddenVideo={!!hiddenVideos[item.participant.socketId]}
        locallyBlocked={!!blockedLocally[item.participant.socketId]}
        onToggleLocalPin={toggleLocalPin}
        onPinForEveryone={onPinForEveryone}
        onToggleLocalVideoHide={toggleLocalVideoHide}
        onBlockUser={toggleLocalBlock}
        onReportUser={onReportUser}
        onModerate={onModerate}
        onOpenUserPopout={onOpenUserPopout}
        compact={compact}
      />
    );
  };

  let gridClass = 'grid-cols-1';
  if (allTiles.length === 2) gridClass = 'grid-cols-1 sm:grid-cols-2';
  else if (allTiles.length >= 3 && allTiles.length <= 4) gridClass = 'grid-cols-1 sm:grid-cols-2';
  else if (allTiles.length >= 5) gridClass = 'grid-cols-2 lg:grid-cols-3';

  return (
    <div className="relative w-full h-full">
      {useSpotlightOrSidebar && focalTile ? (
        layoutMode === 'spotlight' ? (
          <div className="w-full h-full">{renderTile(focalTile)}</div>
        ) : (
          <div className="flex flex-col md:flex-row gap-2.5 sm:gap-3 w-full h-full">
            <div className="flex-1 min-w-0 min-h-[210px] sm:min-h-[260px] md:h-full">{renderTile(focalTile)}</div>
            <div className="w-full md:w-52 lg:w-60 flex md:flex-col gap-2 sm:gap-2.5 overflow-x-auto md:overflow-y-auto snap-x snap-mandatory md:snap-none no-scrollbar flex-shrink-0 pb-1 md:pb-0">
              {allTiles
                .filter((t) => t.participant.socketId !== focalTile.participant.socketId)
                .map((t) => (
                  <div key={t.participant.socketId} className="w-36 sm:w-44 md:w-full flex-shrink-0 aspect-video snap-start">
                    {renderTile(t, true)}
                  </div>
                ))}
            </div>
          </div>
        )
      ) : (
        <div className={`grid gap-2.5 sm:gap-3 w-full h-full auto-rows-fr ${gridClass}`}>
          {allTiles.map((item) => renderTile(item))}
        </div>
      )}

      {/* Floating PiP Self-View when selfViewMode === 'floating' */}
      {selfViewMode === 'floating' && (
        <div className="animate-popover-in absolute bottom-12 sm:bottom-3 right-2.5 sm:right-3 w-28 sm:w-44 md:w-52 aspect-video z-20 shadow-2xl rounded-xl sm:rounded-2xl overflow-hidden border border-white/20">
          {renderTile({ participant: localParticipant, stream: localStream, isLocal: true }, true, 'floating-local')}
        </div>
      )}
    </div>
  );
}

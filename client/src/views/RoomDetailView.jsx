import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Send,
  Users,
  Clock,
  Crown,
  Play,
  Square,
  Sparkles,
  Lock,
  Globe,
  PanelLeftOpen,
  PanelLeftClose,
  Settings,
  UserPlus,
  Heart,
  Maximize2,
  Minimize2,
  Share2,
  LayoutGrid,
  Hand,
  Smile,
  Volume2,
  Headphones,
  VolumeX,
  Ban,
  Check,
  X,
  Youtube,
  Reply,
  Shield,
  ChevronRight,
  Flag,
  ShieldAlert,
  Power,
  PenTool,
  CloudRain,
  Target,
  Plus,
  Trash2,
  Music2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useMediaSettings } from '../context/MediaSettingsContext';
import { useNotifications } from '../context/NotificationContext';
import { useWebRTC } from '../hooks/useWebRTC';
import { VideoGrid } from '../components/VideoGrid';
import { WhiteboardCanvas } from '../components/WhiteboardCanvas';
import { RoomThemeBackdrop } from '../components/RoomThemeBackdrop';
import { YouTubeListeningModal } from '../components/YouTubeListeningModal';
import { UserAvatar } from '../components/UserAvatar';
import { UserPopoutCard } from '../components/UserPopoutCard';
import { ReportModal } from '../components/ReportModal';
import { NotificationBell } from '../components/NotificationPanel';
import { useToast } from '../components/Toast';
import { PRESET_COVERS, compressBannerImage } from '../utils/image';
import { playChime, playSoundboardClip, SOUNDBOARD_CLIPS } from '../utils/sound';
import { ambientEngine, SOUNDSCAPE_TRACKS } from '../utils/ambientAudio';
import { ROOM_THEMES, ROOM_ACCENT_PRESETS, getRoomThemeVisuals, getActivityMeta } from '../utils/themes';

const QUICK_REACTIONS = ['👍', '🔥', '❤️', '😂', '👏', '🎉'];
const LAYOUT_CYCLE = ['auto', 'tiled', 'spotlight', 'sidebar'];

function extractYoutubeId(url) {
  if (!url) return null;
  const reg = /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const m = url.match(reg);
  return m ? m[1] : null;
}

export function RoomDetailView({
  roomId,
  initialMedia = {},
  onLeaveRoom,
  onJoinRoom,
  onNavigate,
  sidebarHidden,
  onToggleSidebar,
  onRequestUpgrade
}) {
  const { user, token, logStudyMinutes } = useAuth();
  const { socket, myListening } = useSocket();
  const {
    blurBackground,
    setBlurBackground,
    soundboardVolume,
    chatDensity,
    inputMode,
    pttKey
  } = useMediaSettings();
  const { pushLocalNotification } = useNotifications();
  const { addToast } = useToast();

  // Room & Member States
  const [roomData, setRoomData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [myParticipantInfo, setMyParticipantInfo] = useState(null);
  const [membersData, setMembersData] = useState({ members: [], bans: [], requests: [] });
  const [isFavourite, setIsFavourite] = useState(false);

  // Right Drawer States (matches ROOM | MODES | MEMBER screenshots)
  const [drawerOpen, setDrawerOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [drawerTab, setDrawerTab] = useState('room'); // 'room' | 'modes' | 'member'
  const [memberSubTab, setMemberSubTab] = useState('all'); // 'all' | 'roles' | 'bans' | 'requests'

  const canDisplayMedia =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  // Personal View toggles (from MODES tab screenshot)
  const [showGroupCall, setShowGroupCall] = useState(true);
  const [showYouTube, setShowYouTube] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showChatView, setShowChatView] = useState(true);
  const [showFocusBar, setShowFocusBar] = useState(true);

  // Ambient Soundscape, Shared Goals & Whiteboard
  const [showSoundscape, setShowSoundscape] = useState(false);
  const [soundscapeVolumes, setSoundscapeVolumes] = useState(() => ({ ...ambientEngine.volumes }));
  const [roomGoals, setRoomGoals] = useState([]);
  const [newGoalText, setNewGoalText] = useState('');
  const [showGoalsSection, setShowGoalsSection] = useState(true);
  const [boardStrokes, setBoardStrokes] = useState([]);

  // Room Settings Draft (Owner / Admin only)
  const [draftName, setDraftName] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [draftCover, setDraftCover] = useState(null);
  const [draftVibe, setDraftVibe] = useState('Study');
  const [draftMode, setDraftMode] = useState('Group');
  const [draftTheme, setDraftTheme] = useState('default');
  const [draftThemeAccent, setDraftThemeAccent] = useState('');
  const [draftLocked, setDraftLocked] = useState(false);
  const [draftWaitingRoom, setDraftWaitingRoom] = useState(false);
  const [draftAllowMic, setDraftAllowMic] = useState(true);
  const [draftAllowCam, setDraftAllowCam] = useState(true);
  const [draftAllowScreen, setDraftAllowScreen] = useState(true);
  const [draftAllowChat, setDraftAllowChat] = useState(true);
  const [draftAllowMedia, setDraftAllowMedia] = useState(true);
  const [draftPassword, setDraftPassword] = useState('');
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);

  const [roomPerms, setRoomPerms] = useState({
    allow_mic: true,
    allow_cam: true,
    allow_screen: true,
    allow_chat: true,
    allow_media_control: true,
    waiting_room: false
  });
  const [roomReports, setRoomReports] = useState([]);
  const [reportModalState, setReportModalState] = useState({
    open: false,
    targetUser: null,
    targetType: 'room',
    prefillDescription: ''
  });

  // Chat & Engagement States
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [handRaised, setHandRaised] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showSoundboard, setShowSoundboard] = useState(false);

  // Focus & YouTube States
  const [focusState, setFocusState] = useState({ isRunning: false, endsAt: null, minutes: 25 });
  const [customFocusMins, setCustomFocusMins] = useState(25);
  const [focusTimeLeft, setFocusTimeLeft] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeInput, setYoutubeInput] = useState('');
  const [youtubeMeta, setYoutubeMeta] = useState(null);
  const [showListeningModal, setShowListeningModal] = useState(false);

  // Call Layout & Modals
  const [layoutMode, setLayoutMode] = useState('auto');
  const [pinnedGlobalSocketId, setPinnedGlobalSocketId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [popoutTarget, setPopoutTarget] = useState(null); // { userId, participant }

  const chatBottomRef = useRef(null);

  // WebRTC Hook
  const {
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
    forceStopScreenShare
  } = useWebRTC(socket, roomId, myParticipantInfo, initialMedia);

  const loadRoomDetails = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/rooms/${roomId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const r = data.room;
        setRoomData(r);
        setDraftName(r.name || '');
        setDraftDesc(r.description || '');
        setDraftCover(r.cover_url || null);
        setDraftVibe(r.vibe || 'Study');
        setDraftMode(r.mode || 'Group');
        setDraftTheme(r.theme || 'default');
        setDraftThemeAccent(r.theme_accent || '');
        setDraftLocked(!!r.is_locked);
        setDraftWaitingRoom(!!r.waiting_room);
        setDraftAllowMic(r.allow_mic !== false);
        setDraftAllowCam(r.allow_cam !== false);
        setDraftAllowScreen(r.allow_screen !== false);
        setDraftAllowChat(r.allow_chat !== false);
        setDraftAllowMedia(r.allow_media_control !== false);
        setRoomPerms({
          allow_mic: r.allow_mic !== false,
          allow_cam: r.allow_cam !== false,
          allow_screen: r.allow_screen !== false,
          allow_chat: r.allow_chat !== false,
          allow_media_control: r.allow_media_control !== false,
          waiting_room: !!r.waiting_room
        });
        if (r.focus) setFocusState(r.focus);
        if (r.pinnedSocketId) setPinnedGlobalSocketId(r.pinnedSocketId);
        if (r.youtube?.url || r.youtube_url) {
          const yt = r.youtube?.url || r.youtube_url;
          setYoutubeUrl(yt);
          setYoutubeInput(yt);
          if (r.youtube?.meta) setYoutubeMeta(r.youtube.meta);
        }
      } else {
        addToast('Room not found', 'error');
        onLeaveRoom();
      }
    } catch {}
  };

  const loadMembersData = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMembersData(data);
      }
    } catch {}
  };

  // Load room & favourite status
  useEffect(() => {
    loadRoomDetails();
    loadMembersData();
    if (token) {
      fetch('/api/rooms/favourites', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          if (d.favourites) setIsFavourite(d.favourites.includes(roomId));
        })
        .catch(() => {});
    }
  }, [roomId, token]);

  // Socket.IO room event lifecycle
  useEffect(() => {
    if (!socket || !roomId || !user) return;

    socket.emit('join-room', { roomId, user, initialMedia });

    const handleRoomState = (state) => {
      setParticipants(state.participants || []);
      setChatMessages(state.chat || []);
      if (state.focus) setFocusState(state.focus);
      if (state.permissions) {
        setRoomPerms((prev) => ({ ...prev, ...state.permissions }));
      }
      if (state.pinnedSocketId !== undefined) setPinnedGlobalSocketId(state.pinnedSocketId);
      if (state.youtube?.url) {
        setYoutubeUrl(state.youtube.url);
        setYoutubeInput(state.youtube.url);
        setYoutubeMeta(state.youtube.meta || null);
      }
      if (state.goals) setRoomGoals(state.goals);
      if (state.strokes) setBoardStrokes(state.strokes);
      setMyParticipantInfo(state.myParticipantInfo);
    };

    const handleUserJoined = ({ participant }) => {
      setParticipants((prev) =>
        prev.some((p) => p.socketId === participant.socketId) ? prev : [...prev, participant]
      );
    };

    const handleUserLeft = ({ socketId, newHost }) => {
      setParticipants((prev) => {
        let updated = prev.filter((p) => p.socketId !== socketId);
        if (newHost) {
          updated = updated.map((p) => (p.userId === newHost.userId ? { ...p, isHost: true } : p));
        }
        return updated;
      });
      if (newHost && newHost.userId === user.id) {
        setMyParticipantInfo((prev) => (prev ? { ...prev, isHost: true } : prev));
        addToast('You are now the room host', 'info');
      }
    };

    const handleParticipantsSync = (list) => {
      setParticipants(list || []);
      const me = (list || []).find((p) => p.socketId === socket.id);
      if (me) setMyParticipantInfo(me);
    };

    const handleUserMediaUpdated = (payload) => {
      setParticipants((prev) =>
        prev.map((p) => (p.socketId === payload.socketId ? { ...p, ...payload } : p))
      );
      if (payload.socketId === socket.id) {
        setMyParticipantInfo((prev) => (prev ? { ...prev, ...payload } : prev));
      }
    };

    const handleChatMessage = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    };

    const handleReaction = (rx) => {
      setFloatingReactions((prev) => [...prev, rx]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((item) => item.id !== rx.id));
      }, 3200);
    };

    const handleSoundboard = ({ soundId, senderName }) => {
      playSoundboardClip(soundId, soundboardVolume);
      addToast(`${senderName} played a soundboard clip`, 'info', 2000);
    };

    const handlePinnedUpdated = ({ pinnedSocketId }) => {
      setPinnedGlobalSocketId(pinnedSocketId);
    };

    const handleModerationNotice = ({ message, field, allowed }) => {
      addToast(message, allowed ? 'info' : 'error');
      if (!allowed) {
        if (field === 'audio') forceMuteAudio();
        if (field === 'video') forceDisableVideo();
        if (field === 'screen') forceStopScreenShare();
      }
    };

    const handleKicked = ({ reason }) => {
      addToast(reason || 'You were removed from the room', 'error');
      onLeaveRoom();
    };

    const handleRoomSettingsUpdated = (updatedRoom) => {
      setRoomData((prev) => ({ ...prev, ...updatedRoom }));
      setDraftName(updatedRoom.name || '');
      setDraftDesc(updatedRoom.description || '');
      setDraftCover(updatedRoom.cover_url || null);
      setDraftVibe(updatedRoom.vibe || 'Study');
      setDraftMode(updatedRoom.mode || 'Group');
      setDraftTheme(updatedRoom.theme || 'default');
      setDraftThemeAccent(updatedRoom.theme_accent || '');
      setDraftLocked(!!updatedRoom.is_locked);
      setDraftWaitingRoom(!!updatedRoom.waiting_room);
      setDraftAllowMic(updatedRoom.allow_mic !== false);
      setDraftAllowCam(updatedRoom.allow_cam !== false);
      setDraftAllowScreen(updatedRoom.allow_screen !== false);
      setDraftAllowChat(updatedRoom.allow_chat !== false);
      setDraftAllowMedia(updatedRoom.allow_media_control !== false);
      addToast('Room settings updated', 'info', 2500);
    };

    const handleRoomPermissionsUpdated = (perms) => {
      setRoomPerms((prev) => ({ ...prev, ...perms }));
      addToast(`Host (${perms.byName || 'Moderator'}) updated room permissions`, 'info', 2500);
    };

    const handleRoomEndedForAll = ({ endedBy }) => {
      addToast(`Room session ended by ${endedBy || 'Host'}`, 'info', 4000);
      onLeaveRoom();
    };

    const handleRoomReportsUpdated = () => {
      loadRoomReports();
    };

    const handleYoutubeSync = (yt) => {
      setYoutubeUrl(yt.url || '');
      setYoutubeInput(yt.url || '');
      setYoutubeMeta(yt.meta || null);
      if (yt.url) setShowYouTube(true);
    };

    const handleUserListeningUpdated = ({ userId, listening }) => {
      setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, listening } : p)));
      setMembersData((prev) => ({
        ...prev,
        members: (prev.members || []).map((m) => (m.id === userId ? { ...m, listening } : m))
      }));
    };

    const handleFocusUpdate = (focus) => {
      setFocusState(focus);
      if (focus.isRunning && user?.preferences?.soundEnabled !== false) {
        playChime();
      }
    };

    const handleRoomGoalsUpdated = (goals) => {
      setRoomGoals(goals || []);
    };

    const handleWhiteboardStroke = (stroke) => {
      setBoardStrokes((prev) => [...prev, stroke]);
    };

    const handleWhiteboardSync = (strokes) => {
      setBoardStrokes(strokes || []);
    };

    const handleWhiteboardClear = ({ byName }) => {
      setBoardStrokes([]);
      if (byName) addToast(`${byName} cleared the whiteboard`, 'info', 2000);
    };

    socket.on('room-state', handleRoomState);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('participants-sync', handleParticipantsSync);
    socket.on('user-media-updated', handleUserMediaUpdated);
    socket.on('chat-message', handleChatMessage);
    socket.on('reaction', handleReaction);
    socket.on('soundboard-play', handleSoundboard);
    socket.on('pinned-updated', handlePinnedUpdated);
    socket.on('moderation-notice', handleModerationNotice);
    socket.on('kicked-from-room', handleKicked);
    socket.on('room-settings-updated', handleRoomSettingsUpdated);
    socket.on('room-permissions-updated', handleRoomPermissionsUpdated);
    socket.on('room-ended-for-all', handleRoomEndedForAll);
    socket.on('room-reports-updated', handleRoomReportsUpdated);
    socket.on('room-members-updated', loadMembersData);
    socket.on('youtube-sync', handleYoutubeSync);
    socket.on('user-listening-updated', handleUserListeningUpdated);
    socket.on('focus-update', handleFocusUpdate);
    socket.on('room-goals-updated', handleRoomGoalsUpdated);
    socket.on('whiteboard-stroke', handleWhiteboardStroke);
    socket.on('whiteboard-sync', handleWhiteboardSync);
    socket.on('whiteboard-clear', handleWhiteboardClear);

    return () => {
      socket.emit('leave-room');
      ambientEngine.stopAll();
      socket.off('room-state', handleRoomState);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('participants-sync', handleParticipantsSync);
      socket.off('user-media-updated', handleUserMediaUpdated);
      socket.off('chat-message', handleChatMessage);
      socket.off('reaction', handleReaction);
      socket.off('soundboard-play', handleSoundboard);
      socket.off('pinned-updated', handlePinnedUpdated);
      socket.off('moderation-notice', handleModerationNotice);
      socket.off('kicked-from-room', handleKicked);
      socket.off('room-settings-updated', handleRoomSettingsUpdated);
      socket.off('room-permissions-updated', handleRoomPermissionsUpdated);
      socket.off('room-ended-for-all', handleRoomEndedForAll);
      socket.off('room-reports-updated', handleRoomReportsUpdated);
      socket.off('room-members-updated', loadMembersData);
      socket.off('youtube-sync', handleYoutubeSync);
      socket.off('user-listening-updated', handleUserListeningUpdated);
      socket.off('focus-update', handleFocusUpdate);
      socket.off('room-goals-updated', handleRoomGoalsUpdated);
      socket.off('whiteboard-stroke', handleWhiteboardStroke);
      socket.off('whiteboard-sync', handleWhiteboardSync);
      socket.off('whiteboard-clear', handleWhiteboardClear);
    };
  }, [socket, roomId, user?.id]);

  // Global keyboard shortcuts (Ctrl+Shift+M Mute, Ctrl+Shift+D Deafen, Ctrl+Shift+H Hand, PTT)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.ctrlKey && e.shiftKey) {
        if (e.code === 'KeyM') {
          e.preventDefault();
          toggleMic();
        } else if (e.code === 'KeyD') {
          e.preventDefault();
          toggleDeafen();
        } else if (e.code === 'KeyH') {
          e.preventDefault();
          toggleHandRaise();
        }
      } else if (inputMode === 'ptt' && e.code === pttKey && !e.repeat && !micOn) {
        toggleMic();
      }
    };

    const handleKeyUp = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (inputMode === 'ptt' && e.code === pttKey && micOn) {
        toggleMic();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [toggleMic, toggleDeafen, inputMode, pttKey, micOn]);

  // Focus countdown timer
  useEffect(() => {
    if (!focusState.isRunning || !focusState.endsAt) {
      setFocusTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, focusState.endsAt - Date.now());
      if (remaining <= 0) {
        setFocusTimeLeft('00:00');
        if (user?.preferences?.soundEnabled !== false) playChime();
        logStudyMinutes(focusState.minutes || 25);
        addToast('Focus session finished! Streak & focus time updated.', 'success', 7000);
        pushLocalNotification({
          type: 'system',
          title: 'Room Focus Session Finished',
          body: `Your study session in "${roomData?.name || 'Study Room'}" completed!`
        });
        clearInterval(interval);
      } else {
        const m = Math.floor(remaining / 60000).toString().padStart(2, '0');
        const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
        setFocusTimeLeft(`${m}:${s}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [focusState]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const myRole = myParticipantInfo?.role || (roomData?.host_id === user?.id ? 'owner' : 'member');
  const isHostOrAdmin = myParticipantInfo?.isHost || myRole === 'owner' || myRole === 'admin';

  const loadRoomReports = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/reports/room/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRoomReports(data.reports || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (isHostOrAdmin) {
      loadRoomReports();
    }
  }, [isHostOrAdmin, roomId, token]);

  const isGuestUser = !!user?.is_guest;

  useEffect(() => {
    if (isGuestUser) {
      forceDisableVideo();
      forceStopScreenShare();
    } else if (!isHostOrAdmin) {
      if (roomPerms.allow_mic === false) forceMuteAudio();
      if (roomPerms.allow_cam === false) forceDisableVideo();
      if (roomPerms.allow_screen === false) forceStopScreenShare();
    }
  }, [roomPerms, isHostOrAdmin, isGuestUser]);

  // Handlers
  const toggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    socket?.emit('media-toggle', { roomId, handRaised: next });
  };

  const sendReaction = (emoji) => {
    socket?.emit('reaction', { roomId, emoji });
    setShowReactionPicker(false);
  };

  const playClip = (soundId) => {
    if (isGuestUser) {
      addToast('Guest Mode: Create a free account to use room soundboard.', 'error');
      setShowSoundboard(false);
      return;
    }
    socket?.emit('soundboard-play', { roomId, soundId });
    setShowSoundboard(false);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (isGuestUser) {
      addToast('Guest Mode: Create a free account to chat in rooms.', 'error');
      return;
    }
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat-message', { roomId, text: chatInput.trim(), replyTo: replyingTo });
    setChatInput('');
    setReplyingTo(null);
  };

  const toggleFav = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/favourite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIsFavourite(data.isFavourite);
        addToast(data.isFavourite ? 'Added to Favourite Rooms' : 'Removed from Favourites', 'info');
      }
    } catch {}
  };

  const toggleFullscreenWindow = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const copyInviteCode = () => {
    if (isGuestUser) {
      addToast('Guest Mode: Create a free account to share room links.', 'error');
      return;
    }
    navigator.clipboard?.writeText(roomId).then(() => {
      addToast('Room invite code copied!', 'success');
    });
  };

  const cycleLayout = () => {
    const idx = LAYOUT_CYCLE.indexOf(layoutMode);
    const next = LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length];
    setLayoutMode(next);
    addToast(`Layout: ${next.toUpperCase()}`, 'info', 1500);
  };

  const openInviteFriends = async () => {
    if (isGuestUser) {
      addToast('Guest Mode: Create a free account to invite friends.', 'error');
      return;
    }
    setShowInviteModal(true);
    if (!token) return;
    try {
      const res = await fetch('/api/friends', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setFriendsList(data.friends || []);
      }
    } catch {}
  };

  const sendFriendInvite = async (friendId, friendName) => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ friendId })
      });
      if (res.ok) addToast(`Invited ${friendName}!`, 'success');
    } catch {}
  };

  // Save Room Settings (MODES tab - Owner/Admin only)
  const handleSaveRoomSettings = async (e) => {
    e.preventDefault();
    if (!token || !isHostOrAdmin) return;
    setSavingRoom(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: draftName,
          description: draftDesc,
          cover_url: draftCover,
          vibe: draftVibe,
          mode: draftMode,
          theme: draftTheme,
          theme_accent: draftThemeAccent,
          is_locked: draftLocked,
          waiting_room: draftWaitingRoom,
          allow_mic: draftAllowMic,
          allow_cam: draftAllowCam,
          allow_screen: draftAllowScreen,
          allow_chat: draftAllowChat,
          allow_media_control: draftAllowMedia,
          password: draftPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update room');
      if (data.room) {
        setRoomData((prev) => ({ ...prev, ...data.room }));
      }
      setDraftPassword('');
      addToast('Room settings saved!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSavingRoom(false);
    }
  };

  const handleMuteAll = () => {
    socket?.emit('moderate-all', { roomId, action: 'mute-all' });
    addToast('Muted all participants', 'info');
  };

  const handleStopAllVideos = () => {
    socket?.emit('moderate-all', { roomId, action: 'stop-all-videos' });
    addToast('Turned off participant cameras', 'info');
  };

  const handleEndRoomForAll = async () => {
    if (!token || myRole !== 'owner') return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Could not end room');
      }
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleReviewReport = async (reportId, status, reviewerNote = '') => {
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, reviewer_note: reviewerNote })
      });
      if (res.ok) {
        addToast(`Report marked ${status.replace('_', ' ')}`, 'success');
        loadRoomReports();
      }
    } catch {}
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressBannerImage(file);
      setDraftCover(compressed);
      setShowCoverPicker(false);
    } catch (err) {
      addToast(err.message, 'error');
    }
    e.target.value = '';
  };

  // Moderation Helpers
  const handleModerate = (targetSocketId, action) => {
    socket?.emit('moderate-participant', { roomId, targetSocketId, action });
  };

  const handleBan = async (targetUserId) => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId })
      });
      if (res.ok) {
        addToast('User banned from room', 'info');
        loadMembersData();
      }
    } catch {}
  };

  const handleUnban = async (targetUserId) => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/ban/${targetUserId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        addToast('User unbanned', 'success');
        loadMembersData();
      }
    } catch {}
  };

  const handleToggleAdmin = async (targetUserId, newRole) => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId, role: newRole })
      });
      if (res.ok) {
        addToast(newRole === 'admin' ? 'Promoted to Admin' : 'Demoted to Member', 'success');
        loadMembersData();
      }
    } catch {}
  };

  const handleKnockDecision = async (targetUserId, action) => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/knock/${targetUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        addToast(action === 'approve' ? 'User admitted!' : 'Request declined', 'info');
        loadMembersData();
      }
    } catch {}
  };

  const activeYoutubeId = extractYoutubeId(youtubeUrl);
  const previewRoomTheme =
    isHostOrAdmin && drawerOpen && drawerTab === 'modes'
      ? { ...roomData, theme: draftTheme, theme_accent: draftThemeAccent }
      : roomData;
  const roomThemeVisuals = getRoomThemeVisuals(previewRoomTheme);
  const activeRoomTheme = roomThemeVisuals.theme;
  const canUseMic = myParticipantInfo?.canAudio !== false && (isHostOrAdmin || roomPerms.allow_mic !== false);
  const canUseCam = !isGuestUser && myParticipantInfo?.canVideo !== false && (isHostOrAdmin || roomPerms.allow_cam !== false);
  const canUseScreen = !isGuestUser && myParticipantInfo?.canScreenShare !== false && (isHostOrAdmin || roomPerms.allow_screen !== false);
  const canUseChat = !isGuestUser && (isHostOrAdmin || roomPerms.allow_chat !== false);
  const canUseMedia = isHostOrAdmin || roomPerms.allow_media_control !== false;

  const activeAmbientCount = Object.values(soundscapeVolumes).filter((v) => v > 0).length;

  const handleAddGoal = (e) => {
    e.preventDefault();
    if (isGuestUser || !newGoalText.trim() || !socket) return;
    socket.emit('room-goal-add', { roomId, text: newGoalText.trim() });
    setNewGoalText('');
  };

  return (
    <div
      style={{
        '--room-accent': roomThemeVisuals.accent,
        ...roomThemeVisuals.stageBorderStyle
      }}
      className="flex flex-col lg:flex-row gap-2 sm:gap-2.5 h-[calc(100dvh-0.5rem)] sm:h-[calc(100dvh-1.25rem)] relative rounded-2xl sm:rounded-3xl p-1.5 sm:p-2.5 border transition-colors duration-500 overflow-hidden"
    >
      <RoomThemeBackdrop room={previewRoomTheme} />

      {/* Mobile & Tablet Backdrop when Right Sheet is open */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/55 backdrop-blur-xs z-30 modal-backdrop-enter"
        />
      )}

      {/* LEFT SECTION: FULL-HEIGHT CAMERA / VIDEO / WHITEBOARD / YOUTUBE STAGE */}
      <div className="order-2 lg:order-1 flex-1 min-w-0 min-h-0 flex flex-col relative z-10">
        {/* Floating Emoji Reactions Overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
          {floatingReactions.map((rx, idx) => (
            <div
              key={rx.id}
              className="animate-reaction-float absolute bottom-16 flex items-center gap-1.5 px-3 py-1 rounded-full bg-dark-900/85 border border-white/15 text-lg shadow-xl backdrop-blur-md"
              style={{ left: `${14 + ((idx * 17) % 68)}%` }}
            >
              <span>{rx.emoji}</span>
              <span className="text-[10px] text-slate-200 font-semibold">{rx.senderName}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-y-auto">
          {/* Synchronized YouTube Watch-Together Player */}
          {showYouTube && (
            <div className="glass-panel p-2.5 rounded-2xl border border-white/10 flex flex-col gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canUseMedia) return;
                  socket?.emit('youtube-sync', { roomId, url: youtubeInput.trim(), isPlaying: true });
                }}
                className="flex gap-2"
              >
                <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold px-2">
                  <Youtube className="w-4 h-4" /> YouTube
                </div>
                <input
                  type="text"
                  disabled={!canUseMedia}
                  placeholder={
                    canUseMedia
                      ? 'Paste YouTube video or lofi stream link...'
                      : 'Playback locked to Room Owner & Admins'
                  }
                  value={youtubeInput}
                  onChange={(e) => setYoutubeInput(e.target.value)}
                  className="flex-1 glass-input px-3 py-1.5 rounded-xl text-xs disabled:opacity-50"
                />
                {canUseMedia && (
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                  >
                    Sync Play
                  </button>
                )}
              </form>

              {activeYoutubeId ? (
                <div className="space-y-1.5">
                  {youtubeMeta && (
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-xl bg-dark-950/70 border border-white/10 text-[11px]">
                      <span className="truncate font-semibold text-white">
                        {youtubeMeta.isSong ? '🎵' : '📺'}{' '}
                        {youtubeMeta.isSong ? `${youtubeMeta.trackTitle} — ${youtubeMeta.artistName}` : youtubeMeta.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex-shrink-0 ${
                          youtubeMeta.isSong
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                        }`}
                      >
                        {youtubeMeta.isSong ? 'Song Detected' : youtubeMeta.category || 'Video'}
                      </span>
                    </div>
                  )}
                  <div className="aspect-video max-h-64 w-full rounded-xl overflow-hidden bg-black">
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${activeYoutubeId}?autoplay=1`}
                      title="StudyHub YouTube Watch Together"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-400">
                  Paste any YouTube URL above to watch or listen together in sync!
                </div>
              )}
            </div>
          )}

          {/* Collaborative Live Whiteboard (when toggled on) */}
          {showWhiteboard && (
            <div className={showGroupCall ? 'h-64 sm:h-72 flex-shrink-0' : 'flex-1 min-h-[280px]'}>
              <WhiteboardCanvas
                socket={socket}
                roomId={roomId}
                strokes={boardStrokes}
                setStrokes={setBoardStrokes}
                readOnly={isGuestUser}
              />
            </div>
          )}

          {/* Maximize Camera Stage */}
          {showGroupCall && (
            <div className="flex-1 min-h-[240px]">
              <VideoGrid
                localStream={localStream}
                remoteStreams={remoteStreams}
                participants={participants}
                myParticipantInfo={{
                  ...myParticipantInfo,
                  name: user?.name || myParticipantInfo?.name,
                  avatarColor: user?.avatar_color || myParticipantInfo?.avatarColor,
                  avatarUrl: user?.avatar_url || myParticipantInfo?.avatarUrl,
                  avatarFrame: user?.avatar_frame || myParticipantInfo?.avatarFrame,
                  listening: user?.status_mode === 'invisible' ? null : myListening
                }}
                micOn={micOn}
                camOn={camOn}
                deafened={deafened}
                screenSharing={screenSharing}
                handRaised={handRaised}
                speakingUsers={speakingUsers}
                layoutMode={layoutMode}
                pinnedGlobalSocketId={pinnedGlobalSocketId}
                isHostOrAdmin={isHostOrAdmin}
                onPinForEveryone={(targetSid) => socket?.emit('pin-for-everyone', { roomId, targetSocketId: targetSid })}
                onModerate={handleModerate}
                onReportUser={(p) => {
                  if (isGuestUser) {
                    addToast('Guest Mode: Create a free account to submit reports.', 'error');
                    return;
                  }
                  setReportModalState({
                    open: true,
                    targetUser: p,
                    targetType: 'user',
                    prefillDescription: ''
                  });
                }}
                onOpenUserPopout={(p) => setPopoutTarget({ userId: p.userId, participant: p })}
              />
            </div>
          )}

          {!showGroupCall && !showYouTube && !showWhiteboard && (
            <div className="flex-1 glass-panel rounded-2xl flex items-center justify-center text-sm text-slate-400">
              Enable &ldquo;Group call&rdquo;, &ldquo;YouTube&rdquo;, or &ldquo;Whiteboard&rdquo; to display content here.
            </div>
          )}
        </div>

        {/* BOTTOM MEET + DISCORD + SOUNDSCAPE + WHITEBOARD CONTROL BAR */}
        <div className="relative flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 mt-1.5 sm:mt-2 mb-[env(safe-area-inset-bottom)] rounded-2xl glass-panel self-center border border-white/10 shadow-2xl backdrop-blur-xl flex-wrap max-w-full z-20">
            {/* Mic */}
            <button
              onClick={toggleMic}
              disabled={!canUseMic}
              title={!canUseMic ? 'Microphones are disabled by host/admins' : micOn ? 'Mute Mic (Ctrl+Shift+M)' : 'Unmute Mic'}
              aria-label={micOn ? 'Mute Mic' : 'Unmute Mic'}
              className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                micOn && !deafened
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
              } disabled:opacity-40`}
            >
              {micOn && !deafened ? <Mic className="w-4 h-4 sm:w-5 sm:h-5" /> : <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Camera */}
            <button
              onClick={toggleCam}
              disabled={!canUseCam}
              title={
                isGuestUser
                  ? 'Guest Mode: Create a free account to turn on your camera'
                  : !canUseCam
                  ? 'Cameras are disabled by host/admins'
                  : camOn
                  ? 'Turn Off Camera'
                  : 'Turn On Camera'
              }
              aria-label={camOn ? 'Turn Off Camera' : 'Turn On Camera'}
              className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                camOn
                  ? 'bg-brand-purple text-white shadow-md shadow-brand-purple/20'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {camOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Deafen (Discord) */}
            <button
              onClick={toggleDeafen}
              title={deafened ? 'Undeafen (Ctrl+Shift+D)' : 'Deafen Audio'}
              aria-label={deafened ? 'Undeafen' : 'Deafen Audio'}
              className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                deafened
                  ? 'bg-rose-500 text-white'
                  : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
              }`}
            >
              {deafened ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Headphones className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Background Blur (Google Meet) */}
            <button
              onClick={() => setBlurBackground((p) => !p)}
              title="Toggle Portrait Background Blur"
              aria-label="Toggle Background Blur"
              className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                blurBackground
                  ? 'bg-brand-purple/30 text-brand-purple border border-brand-purple/40'
                  : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
              }`}
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Screen Share */}
            <button
              onClick={async () => {
                if (!canDisplayMedia) {
                  addToast('Screen sharing requires a desktop browser.', 'info');
                  return;
                }
                const ok = await toggleScreenShare({ maxHeight: 1080, frameRate: 30 });
                if (ok === false) {
                  addToast('Screen sharing is unavailable on this browser.', 'info');
                }
              }}
              disabled={!canUseScreen || !canDisplayMedia}
              title={
                !canDisplayMedia
                  ? 'Screen sharing is only available on desktop browsers'
                  : isGuestUser
                  ? 'Guest Mode: Create a free account to share your screen'
                  : !canUseScreen
                  ? 'Screen sharing disabled by host/admins'
                  : screenSharing
                  ? 'Stop Sharing'
                  : 'Share Screen + Tab Audio'
              }
              aria-label={screenSharing ? 'Stop Sharing Screen' : 'Share Screen'}
              className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                screenSharing
                  ? 'bg-blue-500 text-white animate-pulse'
                  : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Raise Hand (Google Meet) */}
            <button
              onClick={toggleHandRaise}
              title="Raise Hand (Ctrl+Shift+H)"
              aria-label={handRaised ? 'Lower Hand' : 'Raise Hand'}
              className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                handRaised
                  ? 'bg-amber-500 text-dark-950 font-bold shadow-md shadow-amber-500/20'
                  : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
              }`}
            >
              <Hand className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Reactions Picker */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowReactionPicker((p) => !p);
                  setShowSoundboard(false);
                  setShowSoundscape(false);
                }}
                title="Send Emoji Reaction"
                aria-label="Send Emoji Reaction"
                className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                  showReactionPicker ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
                }`}
              >
                <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {showReactionPicker && (
                <div className="animate-popover-in fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:absolute sm:bottom-14 sm:left-1/2 sm:-translate-x-1/2 flex justify-center gap-2 sm:gap-1.5 p-2 rounded-2xl glass-panel border border-white/15 shadow-2xl z-40">
                  {QUICK_REACTIONS.map((em) => (
                    <button
                      key={em}
                      onClick={() => sendReaction(em)}
                      className="btn-tactile text-lg hover:scale-125 transition-transform p-1.5 sm:p-1"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Soundboard (Discord) */}
            <div className="relative">
              <button
                onClick={() => {
                  if (isGuestUser) return;
                  setShowSoundboard((p) => !p);
                  setShowReactionPicker(false);
                  setShowSoundscape(false);
                }}
                disabled={isGuestUser}
                title={isGuestUser ? 'Guest Mode: Create a free account to use soundboard' : 'Room Soundboard'}
                aria-label="Room Soundboard"
                className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                  showSoundboard ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {showSoundboard && (
                <div className="animate-popover-in fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:absolute sm:bottom-14 sm:right-0 sm:w-48 max-h-[50dvh] overflow-y-auto p-2 rounded-2xl glass-panel border border-white/15 shadow-2xl z-40 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-slate-400 px-2 pb-1">Soundboard</div>
                  {SOUNDBOARD_CLIPS.map((clip) => (
                    <button
                      key={clip.id}
                      onClick={() => playClip(clip.id)}
                      className="btn-tactile w-full px-2.5 py-2 sm:py-1.5 rounded-xl hover:bg-white/10 flex items-center gap-2 text-xs text-slate-200 text-left"
                    >
                      <span>{clip.emoji}</span>
                      <span>{clip.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Collaborative Whiteboard Toggle */}
            <button
              onClick={() => setShowWhiteboard((p) => !p)}
              title="Toggle Collaborative Whiteboard"
              aria-label="Toggle Collaborative Whiteboard"
              className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                showWhiteboard
                  ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40'
                  : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
              }`}
            >
              <PenTool className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Ambient Soundscape Mixer (LifeAt-style focus audio) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSoundscape((p) => !p);
                  setShowReactionPicker(false);
                  setShowSoundboard(false);
                }}
                title="Ambient Focus Soundscape Mixer"
                aria-label="Ambient Soundscape Mixer"
                className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center relative p-2.5 sm:p-3 rounded-xl ${
                  activeAmbientCount > 0 || showSoundscape
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                    : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
                }`}
              >
                <CloudRain className="w-4 h-4 sm:w-5 sm:h-5" />
                {activeAmbientCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-dark-950 text-[9px] font-bold flex items-center justify-center">
                    {activeAmbientCount}
                  </span>
                )}
              </button>

              {showSoundscape && (
                <div className="animate-popover-in fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:absolute sm:bottom-14 sm:right-0 sm:w-64 max-h-[55dvh] overflow-y-auto p-3 rounded-2xl glass-panel border border-white/15 shadow-2xl z-40 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      Ambient Soundscape
                    </span>
                    {activeAmbientCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setSoundscapeVolumes(ambientEngine.stopAll())}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold"
                      >
                        Mute All
                      </button>
                    )}
                  </div>
                  {SOUNDSCAPE_TRACKS.map((track) => (
                    <div key={track.id} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-200 font-medium">
                          {track.emoji} {track.label}
                        </span>
                        <span className="font-mono text-emerald-300 text-[10px]">
                          {soundscapeVolumes[track.id] || 0}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={soundscapeVolumes[track.id] || 0}
                        onChange={(e) => setSoundscapeVolumes(ambientEngine.setVolume(track.id, e.target.value))}
                        className="w-full accent-emerald-400 cursor-pointer h-1.5"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Personal YouTube Listening Status (Song vs Video Detection) */}
            <button
              onClick={() => {
                if (isGuestUser) {
                  addToast('Guest Mode: Create a free account to share what you are listening to.', 'error');
                  return;
                }
                setShowListeningModal(true);
              }}
              title={
                isGuestUser
                  ? 'Guest Mode: Sign up to share YouTube track status'
                  : myListening
                  ? `Listening: ${myListening.trackTitle || myListening.title}`
                  : 'Share What YouTube Song You Are Listening To'
              }
              aria-label="YouTube Listening Status"
              className={`btn-tactile min-w-[40px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 rounded-xl ${
                myListening
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                  : 'bg-white/10 text-slate-300 hover:text-white hover:bg-white/15'
              } ${isGuestUser ? 'opacity-45' : ''}`}
            >
              <Music2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Leave Call */}
            <button
              onClick={onLeaveRoom}
              title="Leave Room"
              aria-label="Leave Room"
              className="btn-tactile min-w-[44px] min-h-[40px] sm:min-w-0 sm:min-h-0 flex items-center justify-center p-2.5 sm:p-3 px-3.5 sm:px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 ml-0.5 sm:ml-1"
            >
              <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* RIGHT SECTION (Top Header on Mobile/Tablet, Compact Right Column on Desktop lg+) */}
        <div
          className={
            drawerOpen
              ? 'order-1 lg:order-2 relative z-20 lg:z-10 w-full lg:w-[320px] xl:w-[348px] flex-shrink-0 flex flex-col gap-1.5 sm:gap-2 lg:min-h-0'
              : 'order-1 lg:order-2 relative z-20 lg:z-30 w-full lg:w-[320px] lg:absolute lg:top-2 lg:right-2 flex flex-col gap-1.5 flex-shrink-0'
          }
        >
          {/* STRIP 1 (Small Right-Side Room Header Strip) */}
          <div
            style={roomThemeVisuals.headerStyle}
            className={`relative z-30 px-2.5 py-2 rounded-2xl border backdrop-blur-xl transition-colors duration-500 ${activeRoomTheme.headerClass}`}
          >
            {roomData?.cover_url && (
              <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none select-none">
                <img
                  src={roomData.cover_url}
                  alt=""
                  className="w-full h-full object-cover opacity-20"
                />
              </div>
            )}
            <div className="relative z-10 space-y-1.5">
              {/* Row 1: Title + Vibe + Leave */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={onToggleSidebar}
                    title={sidebarHidden ? 'Expand Left Sidebar' : 'Hide Left Sidebar'}
                    className="p-1.5 rounded-lg bg-dark-900/70 text-slate-300 hover:text-white border border-white/10 flex-shrink-0"
                  >
                    {sidebarHidden ? <PanelLeftOpen className="w-3.5 h-3.5 text-brand-purple" /> : <PanelLeftClose className="w-3.5 h-3.5 text-brand-purple" />}
                  </button>
                  <h2 className="text-sm font-bold text-white truncate">{roomData?.name || 'Study Room'}</h2>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase flex-shrink-0 ${activeRoomTheme.badgeClass}`}>
                    {roomData?.vibe || 'Study'}
                  </span>
                  {roomData?.is_locked ? (
                    <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" title="Locked" />
                  ) : (
                    <Globe className="w-3 h-3 text-slate-400 flex-shrink-0" title="Open" />
                  )}
                </div>

                <button
                  onClick={onLeaveRoom}
                  className="px-2.5 py-1 rounded-lg border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 text-[10px] font-bold tracking-wider uppercase flex-shrink-0"
                >
                  LEAVE
                </button>
              </div>

              {/* Row 2: Compact Right-Aligned Actions */}
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setDrawerOpen(true);
                      setDrawerTab('modes');
                    }}
                    title={isHostOrAdmin ? 'Room Settings & Governance' : 'Personal View & Room Info'}
                    className="p-1.5 rounded-lg bg-dark-900/70 border border-white/10 text-slate-300 hover:text-white"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={openInviteFriends}
                    disabled={isGuestUser}
                    title={isGuestUser ? 'Guest Mode: Sign up to invite friends' : 'Invite Friends'}
                    className="p-1.5 rounded-lg bg-dark-900/70 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={toggleFav}
                    title={isFavourite ? 'Remove Favourite' : 'Favourite Room'}
                    className="p-1.5 rounded-lg bg-dark-900/70 border border-white/10 hover:bg-white/10"
                  >
                    <Heart className={`w-3.5 h-3.5 ${isFavourite ? 'text-rose-500 fill-rose-500' : 'text-slate-300'}`} />
                  </button>
                  <button
                    onClick={() => {
                      if (isGuestUser) return;
                      setReportModalState({
                        open: true,
                        targetUser: null,
                        targetType: 'room',
                        prefillDescription: ''
                      });
                    }}
                    disabled={isGuestUser}
                    title={isGuestUser ? 'Guest Mode: Sign up to submit safety reports' : 'Report Restricted Activity'}
                    className="p-1.5 rounded-lg bg-dark-900/70 border border-white/10 text-amber-400 hover:bg-amber-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={copyInviteCode}
                    disabled={isGuestUser}
                    title={isGuestUser ? 'Guest Mode: Sign up to copy & share room links' : 'Copy Invite Code'}
                    className="p-1.5 rounded-lg bg-dark-900/70 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={toggleFullscreenWindow}
                    title="Toggle Fullscreen"
                    className="p-1.5 rounded-lg bg-dark-900/70 border border-white/10 text-slate-300 hover:text-white"
                  >
                    {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={cycleLayout}
                    title={`Layout: ${layoutMode}`}
                    className="px-1.5 py-1 rounded-lg bg-dark-900/70 border border-white/10 text-[10px] font-semibold text-slate-300 hover:text-white flex items-center gap-1 capitalize"
                  >
                    <LayoutGrid className="w-3 h-3 text-brand-purple" />
                    {layoutMode}
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <NotificationBell onJoinRoom={onJoinRoom} onNavigate={onNavigate} />
                  {!drawerOpen && (
                    <button
                      onClick={() => setDrawerOpen(true)}
                      className="px-2 py-1 rounded-lg bg-brand-purple/25 text-brand-purple border border-brand-purple/40 text-[10px] font-bold"
                    >
                      Panel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* STRIP 2 (Small Right-Side Focus Timer Strip) */}
          {showFocusBar && (
            <div className="glass-panel px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 border border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-brand-purple/20 text-brand-purple flex items-center justify-center flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div className="text-[11px] font-semibold text-white truncate">
                  {focusState.isRunning ? (
                    <span className="text-brand-purple font-mono font-bold tracking-wider animate-pulse">
                      {focusTimeLeft || '00:00'}
                    </span>
                  ) : (
                    <span className="text-slate-300">Focus Timer</span>
                  )}
                </div>
              </div>

              {isHostOrAdmin && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!focusState.isRunning ? (
                    <>
                      <select
                        value={customFocusMins}
                        onChange={(e) => setCustomFocusMins(Number(e.target.value))}
                        className="glass-input px-1.5 py-0.5 rounded-lg text-[11px] bg-dark-900 text-white"
                      >
                        <option value={15}>15m</option>
                        <option value={25}>25m</option>
                        <option value={45}>45m</option>
                        <option value={60}>60m</option>
                      </select>
                      <button
                        onClick={() => socket?.emit('focus-start', { roomId, minutes: customFocusMins })}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-purple hover:bg-brand-purple/90 text-white text-[11px] font-semibold"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" /> Start
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => socket?.emit('focus-stop', { roomId })}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[11px] font-semibold"
                    >
                      <Square className="w-2.5 h-2.5" /> End
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* RIGHT DRAWER: ROOM | MODES | MEMBER (Floating Slide Sheet on Mobile/Tablet, Inline Sidebar on Desktop lg+) */}
          {drawerOpen && (
            <aside className="animate-popover-in lg:animate-none fixed inset-x-2 top-24 sm:top-28 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:left-auto sm:right-3 sm:w-[375px] z-40 lg:static lg:inset-auto lg:w-auto lg:z-auto lg:flex-1 min-h-0 flex flex-col glass-panel rounded-2xl overflow-hidden border border-white/15 lg:border-white/10 shadow-2xl lg:shadow-none">
            {/* Top Tabs Header (matches members & room settings screenshots) */}
            <div className="flex items-center justify-between px-3 border-b border-white/10 bg-dark-950/60">
              <div className="flex items-center gap-4">
                {[
                  ['room', 'ROOM'],
                  ['modes', 'MODES'],
                  ['member', 'MEMBER']
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setDrawerTab(id)}
                    className={`btn-tactile py-3 text-[11px] font-bold tracking-wider uppercase transition-all border-b-2 ${
                      drawerTab === id
                        ? 'text-white border-white'
                        : 'text-slate-500 border-transparent hover:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                title="Collapse Panel"
                aria-label="Collapse Panel"
                className="btn-tactile p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <ChevronRight className="w-4 h-4 hidden lg:block" />
                <X className="w-4 h-4 lg:hidden" />
              </button>
            </div>

            {/* TAB 1: ROOM (Session Study Goals + Live Chat) */}
            {drawerTab === 'room' && (
              showChatView ? (
                <div key="tab-room" className="animate-fade-in flex-1 flex flex-col min-h-0">
                  {/* Collapsible Focusmate-Style Session Goals Checklist */}
                  <div className="border-b border-white/10 bg-dark-950/40 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setShowGoalsSection((p) => !p)}
                      className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-300"
                    >
                      <span className="flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-emerald-400" />
                        Session Study Goals ({roomGoals.filter((g) => g.completed).length}/{roomGoals.length})
                      </span>
                      <span className="text-slate-500">{showGoalsSection ? 'Hide' : 'Show'}</span>
                    </button>

                    {showGoalsSection && (
                      <div className="mt-2 space-y-1.5">
                        {!isGuestUser ? (
                          <form onSubmit={handleAddGoal} className="flex gap-1">
                            <input
                              type="text"
                              value={newGoalText}
                              onChange={(e) => setNewGoalText(e.target.value)}
                              placeholder="Set a goal for this session..."
                              maxLength={120}
                              className="flex-1 glass-input px-2.5 py-1 rounded-lg text-[11px]"
                            />
                            <button
                              type="submit"
                              className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                              title="Add Goal"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : roomGoals.length === 0 ? (
                          <p className="text-[10px] text-slate-500">No session goals posted yet (view-only in Guest Mode).</p>
                        ) : null}

                        {roomGoals.length > 0 && (
                          <div className="max-h-24 overflow-y-auto space-y-1">
                            {roomGoals.map((goal) => {
                              const canModify = goal.userId === user?.id || isHostOrAdmin;
                              return (
                                <div
                                  key={goal.id}
                                  className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-dark-900/60 border border-white/5 text-[11px]"
                                >
                                  <button
                                    type="button"
                                    disabled={!canModify}
                                    onClick={() => socket?.emit('room-goal-toggle', { roomId, goalId: goal.id })}
                                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left disabled:cursor-default"
                                  >
                                    <span
                                      className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border ${
                                        goal.completed
                                          ? 'bg-emerald-500 border-emerald-400 text-dark-950'
                                          : 'border-slate-500'
                                      }`}
                                    >
                                      {goal.completed && <Check className="w-2.5 h-2.5" />}
                                    </span>
                                    <span className={`truncate ${goal.completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                                      <strong className="text-brand-purple font-semibold">{goal.userName}:</strong> {goal.text}
                                    </span>
                                  </button>
                                  {canModify && (
                                    <button
                                      type="button"
                                      onClick={() => socket?.emit('room-goal-delete', { roomId, goalId: goal.id })}
                                      className="text-slate-500 hover:text-rose-400 p-0.5"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={`flex-1 p-3 overflow-y-auto ${chatDensity === 'compact' ? 'space-y-1' : 'space-y-2.5'} text-xs`}>
                    {chatMessages.map((msg) => {
                      if (msg.system) {
                        return (
                          <div key={msg.id} className="text-center text-[10px] text-slate-500 italic py-0.5">
                            {msg.text}
                          </div>
                        );
                      }

                      const isMe = msg.senderId === user?.id;

                      return (
                        <div
                          key={msg.id}
                          className={`animate-chat-msg group flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                        >
                          {!isMe && chatDensity === 'cozy' && (
                            <button onClick={() => setPopoutTarget({ userId: msg.senderId })}>
                              <UserAvatar
                                name={msg.senderName}
                                avatarUrl={msg.avatarUrl}
                                avatarColor={msg.avatarColor}
                                avatarFrame={msg.avatarFrame}
                                sizeClass="w-6 h-6 text-[9px]"
                              />
                            </button>
                          )}

                          <div className={`flex flex-col max-w-[82%] ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-1.5 px-1 mb-0.5">
                              <button
                                onClick={() => setPopoutTarget({ userId: msg.senderId })}
                                className="text-[10px] text-slate-400 hover:text-white font-medium"
                              >
                                {msg.senderName}
                              </button>
                              <button
                                onClick={() => setReplyingTo({ id: msg.id, senderName: msg.senderName, text: msg.text })}
                                title="Reply"
                                className="opacity-75 sm:opacity-0 sm:group-hover:opacity-100 text-slate-500 hover:text-white transition-opacity p-0.5"
                              >
                                <Reply className="w-3 h-3" />
                              </button>
                              {!isMe && !isGuestUser && (
                                <button
                                  onClick={() =>
                                    setReportModalState({
                                      open: true,
                                      targetUser: { id: msg.senderId, name: msg.senderName },
                                      targetType: 'message',
                                      prefillDescription: `Reported chat message from ${msg.senderName}: "${msg.text}"`
                                    })
                                  }
                                  title="Report Message"
                                  className="opacity-75 sm:opacity-0 sm:group-hover:opacity-100 text-slate-500 hover:text-amber-400 transition-opacity p-0.5"
                                >
                                  <Flag className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            {msg.replyTo && (
                              <div className="text-[10px] text-slate-400 bg-dark-900/70 border-l-2 border-brand-purple px-2 py-1 rounded-md mb-1 max-w-full truncate">
                                <strong className="text-slate-300">{msg.replyTo.senderName}:</strong> {msg.replyTo.text}
                              </div>
                            )}

                            <div
                              className={`px-2.5 ${chatDensity === 'compact' ? 'py-1' : 'py-1.5'} rounded-xl leading-snug break-words shadow-sm ${
                                isMe
                                  ? 'bg-brand-purple text-white rounded-br-none'
                                  : 'bg-dark-800 text-slate-200 rounded-bl-none border border-white/5'
                              }`}
                            >
                              {msg.text}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Reply Banner */}
                  {replyingTo && (
                    <div className="px-3 py-1.5 bg-dark-900/80 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-300">
                      <span className="truncate">Replying to <strong>{replyingTo.senderName}</strong></span>
                      <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {canUseChat ? (
                    <form onSubmit={handleSendMessage} className="p-2.5 border-t border-white/10 flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Message the room..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="flex-1 glass-input px-3 py-1.5 rounded-xl text-xs"
                        maxLength={800}
                      />
                      <button
                        type="submit"
                        className="p-2 px-3 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white shadow-md"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : isGuestUser ? (
                    <div className="p-3 border-t border-white/10 bg-dark-950/80 text-center space-y-2">
                      <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-amber-300">
                        <Lock className="w-3.5 h-3.5" />
                        Guest Mode: View-Only Room Access
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Chat, video, screen share, whiteboard drawing &amp; invite sharing are disabled for guest sessions.
                      </p>
                      {onRequestUpgrade && (
                        <button
                          type="button"
                          onClick={onRequestUpgrade}
                          className="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue text-white text-[11px] font-bold shadow-md hover:opacity-95 transition-opacity"
                        >
                          Upgrade to Free Account
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 border-t border-white/10 bg-dark-950/70 text-[11px] text-amber-300 text-center">
                      Chat is currently limited to Host &amp; Admins.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-400">
                  Chat is turned off in your Personal View (MODES tab).
                </div>
              )
            )}

            {/* TAB 2: MODES (matches room settings sidebar example.png!) */}
            {drawerTab === 'modes' && (
              <div key="tab-modes" className="animate-fade-in flex-1 p-4 overflow-y-auto space-y-5">
                {/* PERSONAL VIEW toggles */}
                <div className="space-y-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">PERSONAL VIEW</div>
                  {[
                    ['Group call', Video, showGroupCall, setShowGroupCall],
                    ['Whiteboard', PenTool, showWhiteboard, setShowWhiteboard],
                    ['YouTube', Youtube, showYouTube, setShowYouTube],
                    ['Chat', Send, showChatView, setShowChatView],
                    ['Focus', Clock, showFocusBar, setShowFocusBar]
                  ].map(([label, Icon, checked, setter]) => (
                    <label key={label} className="flex items-center justify-between py-1 cursor-pointer">
                      <span className="flex items-center gap-2.5 text-xs font-medium text-slate-200">
                        <Icon className="w-4 h-4 text-slate-400" />
                        {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setter((p) => !p)}
                        className={`w-10 h-5 rounded-full transition-colors p-0.5 ${
                          checked ? 'bg-brand-purple' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            checked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>
                  ))}
                </div>

                {/* ROOM SETTINGS (Strict Owner / Admin governance vs Read-Only Member Summary) */}
                {isHostOrAdmin ? (
                  <form onSubmit={handleSaveRoomSettings} className="pt-4 border-t border-white/10 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        ROOM SETTINGS ({myRole === 'owner' ? 'OWNER' : 'ADMIN'})
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold uppercase">
                        Host Controls
                      </span>
                    </div>

                    {/* Cover Image Preview */}
                    <div className="h-24 rounded-xl overflow-hidden bg-dark-900 border border-white/10 flex items-center justify-center relative">
                      {draftCover ? (
                        <img src={draftCover} alt="Room cover" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-slate-500">No room cover banner</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowCoverPicker((p) => !p)}
                        className="flex-1 py-1.5 px-3 rounded-full border border-white/15 hover:bg-white/5 text-[11px] font-medium text-slate-200"
                      >
                        Choose banner / cover
                      </button>
                      {draftCover && (
                        <button
                          type="button"
                          onClick={() => setDraftCover(null)}
                          className="py-1.5 px-3 rounded-full border border-white/15 hover:bg-rose-500/15 text-[11px] text-slate-300 hover:text-rose-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {showCoverPicker && (
                      <div className="p-2.5 rounded-xl bg-dark-900/90 border border-white/10 space-y-2">
                        <div className="grid grid-cols-2 gap-1.5">
                          {PRESET_COVERS.map((cov) => (
                            <button
                              key={cov.id}
                              type="button"
                              onClick={() => {
                                setDraftCover(cov.url);
                                setShowCoverPicker(false);
                              }}
                              className="rounded-lg overflow-hidden border border-white/10 hover:border-brand-purple relative group"
                            >
                              <img src={cov.url} alt={cov.label} className="w-full h-12 object-cover" />
                              <span className="block text-[9px] text-slate-300 py-0.5 bg-dark-950/90">{cov.label}</span>
                            </button>
                          ))}
                        </div>
                        <label className="block text-center py-1.5 rounded-lg bg-brand-purple/20 hover:bg-brand-purple/30 text-brand-purple text-[11px] font-semibold cursor-pointer">
                          Upload Custom Banner
                          <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                        </label>
                      </div>
                    )}

                    {/* Room Theme & Background Accent Color Selector */}
                    <div className="space-y-2.5">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">ROOM THEME</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {Object.values(ROOM_THEMES).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setDraftTheme(t.id)}
                              className={`p-1.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                                draftTheme === t.id
                                  ? 'border-white bg-white/15 text-white'
                                  : 'border-white/10 bg-dark-900/60 text-slate-400 hover:text-white'
                              }`}
                            >
                              <span className="w-3.5 h-3.5 rounded flex-shrink-0" style={{ background: t.swatch }} />
                              <span className="text-[10px] font-semibold truncate">{t.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            BACKGROUND ACCENT COLOR
                          </span>
                          {draftThemeAccent && (
                            <button
                              type="button"
                              onClick={() => setDraftThemeAccent('')}
                              className="text-[10px] text-slate-400 hover:text-white"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ROOM_ACCENT_PRESETS.filter((p) => p.hex).map((preset) => (
                            <button
                              key={preset.hex}
                              type="button"
                              onClick={() => setDraftThemeAccent(preset.hex)}
                              title={preset.label}
                              style={{ backgroundColor: preset.hex }}
                              className={`w-5 h-5 rounded-full transition-transform ${
                                draftThemeAccent === preset.hex ? 'scale-125 ring-2 ring-white' : 'opacity-75 hover:opacity-100'
                              }`}
                            />
                          ))}
                          <label className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-dark-900 border border-white/15 text-[10px] text-slate-300 cursor-pointer ml-auto">
                            Custom
                            <input
                              type="color"
                              value={draftThemeAccent || ROOM_THEMES[draftTheme]?.defaultAccent || '#8b5cf6'}
                              onChange={(e) => setDraftThemeAccent(e.target.value)}
                              className="w-4 h-4 bg-transparent border-0 cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Room Name */}
                    <div>
                      <input
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        maxLength={60}
                        placeholder="Room name"
                        className="w-full glass-input px-3 py-2 rounded-xl text-xs"
                      />
                      <div className="text-[10px] text-slate-500 text-right mt-0.5">{draftName.length}/60</div>
                    </div>

                    {/* Description */}
                    <div>
                      <textarea
                        rows={2}
                        value={draftDesc}
                        onChange={(e) => setDraftDesc(e.target.value)}
                        maxLength={200}
                        placeholder="Room description"
                        className="w-full glass-input px-3 py-2 rounded-xl text-xs resize-none"
                      />
                      <div className="text-[10px] text-slate-500 text-right mt-0.5">{draftDesc.length}/200</div>
                    </div>

                    {/* VIBE Selector */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">VIBE</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['Chill', 'Study', 'Work'].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setDraftVibe(v)}
                            className={`py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                              draftVibe === v
                                ? 'bg-blue-600/30 border-blue-400 text-white'
                                : 'bg-dark-900/60 border-white/10 text-slate-400'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* MODE Selector */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">MODE</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['Group', 'Stream', 'Focus'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setDraftMode(m)}
                            className={`py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                              draftMode === m
                                ? 'bg-emerald-600/30 border-emerald-400 text-white'
                                : 'bg-dark-900/60 border-white/10 text-slate-400'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Access & Waiting Room */}
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ACCESS & GOVERNANCE</div>
                      {[
                        ['Lock Room', Lock, draftLocked, setDraftLocked],
                        ['Waiting Room (Host Admit)', Hand, draftWaitingRoom, setDraftWaitingRoom],
                        ['Allow Member Microphones', Mic, draftAllowMic, setDraftAllowMic],
                        ['Allow Member Cameras', Video, draftAllowCam, setDraftAllowCam],
                        ['Allow Screen Sharing', Monitor, draftAllowScreen, setDraftAllowScreen],
                        ['Allow Room Chat', Send, draftAllowChat, setDraftAllowChat],
                        ['Allow YouTube Control', Youtube, draftAllowMedia, setDraftAllowMedia]
                      ].map(([label, Icon, stateVal, setter]) => (
                        <div key={label} className="flex items-center justify-between py-0.5">
                          <span className="flex items-center gap-2 text-xs text-slate-200 font-medium">
                            <Icon className="w-3.5 h-3.5 text-slate-400" /> {label}
                          </span>
                          <button
                            type="button"
                            onClick={() => setter((p) => !p)}
                            className={`w-10 h-5 rounded-full transition-colors p-0.5 ${
                              stateVal ? 'bg-brand-purple' : 'bg-slate-700'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                stateVal ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      ))}
                    </div>

                    {draftLocked && (
                      <input
                        type="password"
                        value={draftPassword}
                        onChange={(e) => setDraftPassword(e.target.value)}
                        placeholder="Set or change room password..."
                        className="w-full glass-input px-3 py-2 rounded-xl text-xs"
                      />
                    )}

                    <button
                      type="submit"
                      disabled={savingRoom}
                      className="w-full py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-pink-500/20 disabled:opacity-50"
                    >
                      {savingRoom ? 'Saving...' : 'Save Room Settings'}
                    </button>

                    {/* Host / Owner Quick Governance Actions */}
                    <div className="pt-3 border-t border-white/10 space-y-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">HOST CONTROLS</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={handleMuteAll}
                          className="py-1.5 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1"
                        >
                          <MicOff className="w-3.5 h-3.5" /> Mute All
                        </button>
                        <button
                          type="button"
                          onClick={handleStopAllVideos}
                          className="py-1.5 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1"
                        >
                          <VideoOff className="w-3.5 h-3.5" /> Stop Videos
                        </button>
                      </div>
                      {myRole === 'owner' && (
                        <button
                          type="button"
                          onClick={handleEndRoomForAll}
                          className="w-full py-2 px-3 rounded-xl bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          <Power className="w-3.5 h-3.5" /> End Meeting for All
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ROOM OVERVIEW</div>
                    {roomData?.cover_url && (
                      <div className="h-20 rounded-xl overflow-hidden border border-white/10">
                        <img src={roomData.cover_url} alt="Room cover" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-3 rounded-xl bg-dark-900/50 border border-white/10 space-y-2 text-xs">
                      <div className="font-bold text-white">{roomData?.name}</div>
                      {roomData?.description && <p className="text-slate-400 leading-relaxed">{roomData.description}</p>}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${activeRoomTheme.badgeClass}`}>
                          {activeRoomTheme.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-white/5 text-slate-300 text-[10px]">
                          Mic: {roomPerms.allow_mic ? 'On' : 'Host Only'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-white/5 text-slate-300 text-[10px]">
                          Chat: {roomPerms.allow_chat ? 'On' : 'Host Only'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 pt-1">
                        Room settings can only be modified by the Room Owner or promoted Admins.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setReportModalState({
                          open: true,
                          targetUser: null,
                          targetType: 'room',
                          prefillDescription: ''
                        })
                      }
                      className="w-full py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Flag className="w-3.5 h-3.5" /> Report Room Activity
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MEMBER (matches members sidebar example .png!) */}
            {drawerTab === 'member' && (
              <div key="tab-member" className="animate-fade-in flex-1 flex flex-col min-h-0">
                {/* Member Icon Sub-tabs */}
                <div className={`grid ${isHostOrAdmin ? 'grid-cols-5' : 'grid-cols-4'} gap-1 p-2.5 border-b border-white/10`}>
                  {[
                    ['all', Users, participants.length],
                    ['roles', Crown, null],
                    ['bans', Ban, isHostOrAdmin ? membersData.bans.length || null : null],
                    ['requests', Clock, isHostOrAdmin ? membersData.requests.length || null : null],
                    ...(isHostOrAdmin
                      ? [['reports', Flag, roomReports.filter((r) => r.status === 'submitted' || r.status === 'under_review').length || null]]
                      : [])
                  ].map(([id, Icon, count]) => (
                    <button
                      key={id}
                      title={id.toUpperCase()}
                      onClick={() => setMemberSubTab(id)}
                      className={`py-2 rounded-xl flex items-center justify-center gap-1 text-xs transition-all border ${
                        memberSubTab === id
                          ? 'border-white text-white bg-white/10'
                          : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {count !== null && <span className="text-[11px] font-bold">{count}</span>}
                    </button>
                  ))}
                </div>

                <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
                  {/* All / Roles View */}
                  {(memberSubTab === 'all' || memberSubTab === 'roles') &&
                    (membersData.members.length > 0 ? membersData.members : participants.map((p) => ({
                      id: p.userId,
                      name: p.name,
                      avatar_url: p.avatarUrl,
                      avatar_color: p.avatarColor,
                      avatar_frame: p.avatarFrame,
                      role: p.role || 'member',
                      online: true,
                      isLive: true
                    }))).filter((m) => (memberSubTab === 'roles' ? m.role === 'owner' || m.role === 'admin' : true)).map((m) => {
                      const liveMatch = participants.find((p) => p.userId === m.id);
                      const isLive = !!liveMatch && m.online !== false;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setPopoutTarget({ userId: m.id, participant: liveMatch || { ...m, userId: m.id } })}
                          className="p-2 rounded-xl hover:bg-white/5 cursor-pointer flex items-center justify-between gap-2 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <UserAvatar
                              name={m.name}
                              avatarUrl={m.avatar_url}
                              avatarColor={m.avatar_color}
                              avatarFrame={m.avatar_frame}
                              sizeClass="w-9 h-9 text-xs"
                              statusMode={m.online ? (m.statusMode || m.status_mode || 'online') : 'offline'}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {m.role === 'owner' && <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                                {m.role === 'admin' && <Shield className="w-3.5 h-3.5 text-brand-purple flex-shrink-0" />}
                                <span className="text-xs font-bold text-white truncate">{m.name}</span>
                              </div>
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {m.role} • {m.online ? getActivityMeta(m.statusMode || m.status_mode).shortLabel : 'Offline'}
                              </div>
                              {(m.listening || liveMatch?.listening) && (
                                <div className="text-[10px] text-emerald-300 truncate max-w-[165px]">
                                  {(m.listening || liveMatch?.listening).isSong ? '🎵' : '📺'}{' '}
                                  {(m.listening || liveMatch?.listening).trackTitle || (m.listening || liveMatch?.listening).title}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {myRole === 'owner' && m.role !== 'owner' && m.id !== user?.id && (
                              <button
                                onClick={() => handleToggleAdmin(m.id, m.role === 'admin' ? 'member' : 'admin')}
                                title={m.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${
                                  m.role === 'admin'
                                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-rose-500/20 hover:text-rose-300'
                                    : 'bg-white/5 border-white/15 text-slate-300 hover:bg-brand-purple/25 hover:text-white'
                                }`}
                              >
                                {m.role === 'admin' ? 'Admin ✕' : '+ Admin'}
                              </button>
                            )}
                            {isLive && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                                LIVE
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {/* Banned View */}
                  {memberSubTab === 'bans' && (
                    !isHostOrAdmin ? (
                      <p className="text-center text-xs text-slate-500 py-8">Ban list is only visible to room owner and admins.</p>
                    ) : membersData.bans.length === 0 ? (
                      <p className="text-center text-xs text-slate-500 py-8">No banned users in this room.</p>
                    ) : (
                      membersData.bans.map((b) => (
                        <div key={b.id} className="p-2.5 rounded-xl bg-dark-900/50 border border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserAvatar name={b.name} avatarUrl={b.avatar_url} avatarColor={b.avatar_color} avatarFrame={b.avatar_frame} sizeClass="w-8 h-8 text-xs" />
                            <span className="text-xs font-semibold text-white">{b.name}</span>
                          </div>
                          <button
                            onClick={() => handleUnban(b.id)}
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] text-white"
                          >
                            Unban
                          </button>
                        </div>
                      ))
                    )
                  )}

                  {/* Pending Join Requests (Knocks / Waiting Room) */}
                  {memberSubTab === 'requests' && (
                    !isHostOrAdmin ? (
                      <p className="text-center text-xs text-slate-500 py-8">Waiting room queue is managed by the host and admins.</p>
                    ) : membersData.requests.length === 0 ? (
                      <p className="text-center text-xs text-slate-500 py-8">No pending waiting room requests.</p>
                    ) : (
                      membersData.requests.map((req) => (
                        <div key={req.id} className="p-2.5 rounded-xl bg-dark-900/50 border border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserAvatar name={req.name} avatarUrl={req.avatar_url} avatarColor={req.avatar_color} avatarFrame={req.avatar_frame} sizeClass="w-8 h-8 text-xs" />
                            <span className="text-xs font-semibold text-white">{req.name}</span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleKnockDecision(req.user_id, 'approve')}
                              className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleKnockDecision(req.user_id, 'decline')}
                              className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Incident Reports Moderation Queue (Owner / Admin Only) */}
                  {memberSubTab === 'reports' && isHostOrAdmin && (
                    roomReports.length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <ShieldAlert className="w-7 h-7 text-slate-500 mx-auto" />
                        <p className="text-xs text-slate-500">No incident reports in this room.</p>
                      </div>
                    ) : (
                      roomReports.map((rep) => (
                        <div key={rep.id} className="p-3 rounded-xl bg-dark-900/60 border border-white/10 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-white truncate">{rep.category}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                rep.status === 'resolved'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : rep.status === 'dismissed'
                                  ? 'bg-slate-500/20 text-slate-400'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {rep.status.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            By <strong className="text-slate-200">{rep.reporter_name || 'Member'}</strong>
                            {rep.target_user_name ? <> • Target: <strong className="text-amber-300">{rep.target_user_name}</strong></> : null}
                            {' '}• <span className="uppercase">{rep.severity}</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-snug">{rep.description}</p>
                          {rep.evidence_image && (
                            <img
                              src={rep.evidence_image}
                              alt="Evidence"
                              className="w-full max-h-32 object-cover rounded-lg border border-white/10"
                            />
                          )}
                          {(rep.status === 'submitted' || rep.status === 'under_review') && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {rep.status === 'submitted' && (
                                <button
                                  onClick={() => handleReviewReport(rep.id, 'under_review', 'Moderator reviewing')}
                                  className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold"
                                >
                                  Review
                                </button>
                              )}
                              <button
                                onClick={() => handleReviewReport(rep.id, 'resolved', 'Addressed by room moderators')}
                                className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-semibold"
                              >
                                Resolve
                              </button>
                              <button
                                onClick={() => handleReviewReport(rep.id, 'dismissed', 'No action required')}
                                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-[10px] font-semibold"
                              >
                                Dismiss
                              </button>
                              {rep.target_user_id && rep.target_user_id !== roomData?.host_id && (
                                <button
                                  onClick={() => handleBan(rep.target_user_id)}
                                  className="px-2 py-1 rounded-lg bg-rose-600/25 hover:bg-rose-600/40 text-rose-200 text-[10px] font-semibold"
                                >
                                  Ban Target
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* INVITE FRIENDS MODAL */}
      {showInviteModal && !isGuestUser && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="modal-panel-enter glass-panel w-full max-w-sm p-5 rounded-2xl border border-white/10 shadow-2xl relative max-h-[90dvh] overflow-y-auto">
            <button onClick={() => setShowInviteModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
            <h4 className="text-base font-bold text-white mb-1">Invite Friends to Room</h4>
            <p className="text-xs text-slate-400 mb-4">Or copy the invite code to share directly.</p>

            <div className="flex gap-2 mb-4">
              <input readOnly value={roomId} className="flex-1 glass-input px-3 py-1.5 rounded-xl text-xs font-mono" />
              <button onClick={copyInviteCode} className="px-3 py-1.5 rounded-xl bg-brand-purple text-white text-xs font-semibold">
                Copy
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2">
              {friendsList.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No friends added yet.</p>
              ) : (
                friendsList.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-2 rounded-xl bg-dark-900/50 border border-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar
                        name={f.name}
                        avatarUrl={f.avatar_url}
                        avatarColor={f.avatar_color}
                        sizeClass="w-8 h-8 text-xs"
                        statusMode={f.liveStatusMode}
                      />
                      <span className="text-xs font-semibold text-white truncate">{f.name}</span>
                    </div>
                    <button
                      onClick={() => sendFriendInvite(f.id, f.name)}
                      className="px-2.5 py-1 rounded-lg bg-brand-purple/20 hover:bg-brand-purple text-brand-purple hover:text-white text-[11px] font-semibold transition-colors"
                    >
                      Invite
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DISCORD USER POPOUT CARD */}
      {popoutTarget && (
        <UserPopoutCard
          targetUserId={popoutTarget.userId}
          roomContext={{
            roomId,
            myRole,
            participant: popoutTarget.participant,
            onKick: (sid) => handleModerate(sid, 'kick'),
            onBan: handleBan,
            onToggleAdmin: handleToggleAdmin
          }}
          onClose={() => setPopoutTarget(null)}
          onOpenDM={() => {
            setPopoutTarget(null);
            onNavigate?.('friends');
          }}
        />
      )}
      <ReportModal
        isOpen={reportModalState.open}
        onClose={() => setReportModalState((s) => ({ ...s, open: false }))}
        targetUser={reportModalState.targetUser}
        roomId={roomId}
        roomName={roomData?.name}
        targetType={reportModalState.targetType}
        prefillDescription={reportModalState.prefillDescription}
      />
      <YouTubeListeningModal
        isOpen={showListeningModal}
        onClose={() => setShowListeningModal(false)}
      />
    </div>
  );
}

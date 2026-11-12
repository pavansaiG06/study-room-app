import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AlertTriangle, Megaphone, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Background3D } from './components/Background3D';
import { AuthBackdrop } from './components/AuthBackdrop';
import { AuthModal } from './components/AuthModal';
import { LandingAuthPage } from './components/LandingAuthPage';
import { ProfileOnboardingModal } from './components/ProfileOnboardingModal';
import { UserSettingsModal } from './components/UserSettingsModal';
import { PreJoinModal } from './components/PreJoinModal';
import { useAuth } from './context/AuthContext';
import { useSocket } from './context/SocketContext';
import { useMediaSettings } from './context/MediaSettingsContext';
import { useToast } from './components/Toast';
import { runViewTransition } from './utils/viewTransition';

// Keep initial dashboard eager; code-split secondary views
import { DashboardView } from './views/DashboardView';

const lazyView = (loader, exportName) =>
  lazy(() => loader().then((m) => ({ default: m[exportName] })));

const RoomDetailView = lazyView(() => import('./views/RoomDetailView'), 'RoomDetailView');
const PomodoroView = lazyView(() => import('./views/PomodoroView'), 'PomodoroView');
const TasksView = lazyView(() => import('./views/TasksView'), 'TasksView');
const NotesView = lazyView(() => import('./views/NotesView'), 'NotesView');
const AlarmView = lazyView(() => import('./views/AlarmView'), 'AlarmView');
const FriendsView = lazyView(() => import('./views/FriendsView'), 'FriendsView');
const FavouritesView = lazyView(() => import('./views/FavouritesView'), 'FavouritesView');
const SafetyReportsView = lazyView(() => import('./views/SafetyReportsView'), 'SafetyReportsView');
const AdminConsoleView = lazyView(() => import('./views/AdminConsoleView'), 'AdminConsoleView');

export function App() {
  const { user, loading, token, logout } = useAuth();
  const { socket } = useSocket();
  const { skipGreenRoom, micMuted, deafened } = useMediaSettings();
  const { addToast } = useToast();

  const [currentView, setCurrentView] = useState('dashboard');
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [initialRoomMedia, setInitialRoomMedia] = useState({});
  const [preJoinRoom, setPreJoinRoom] = useState(null);
  const [sidebarHidden, setSidebarHidden] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const mainRef = useRef(null);

  // Modals & Onboarding
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBgSettings, setShowBgSettings] = useState(false);

  // Platform Announcements & Moderation Warnings
  const [announcement, setAnnouncement] = useState(null);
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState(null);
  const [warnings, setWarnings] = useState([]);

  // Reset workspace view when signed out
  useEffect(() => {
    if (!user) {
      setActiveRoomId(null);
      setPreJoinRoom(null);
      setCurrentView('dashboard');
      setSidebarHidden(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
      setWarnings([]);
    }
  }, [user]);

  // Fetch active global announcement & unacknowledged admin warnings
  useEffect(() => {
    if (!user) return;
    fetch('/api/auth/announcement')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.announcement) setAnnouncement(data.announcement);
      })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!user || !token || user.is_guest) {
      setWarnings([]);
      return;
    }
    fetch('/api/auth/warnings', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.warnings) {
          setWarnings(data.warnings.filter((w) => !w.acknowledged));
        }
      })
      .catch(() => {});
  }, [user?.id, user?.is_guest, token]);

  // Live moderation socket listeners (account ban kick, official warning, global broadcast)
  useEffect(() => {
    if (!socket) return;

    const handleBanned = ({ reason }) => {
      logout();
      setActiveRoomId(null);
      setPreJoinRoom(null);
      setCurrentView('dashboard');
      setSidebarHidden(false);
      addToast(reason || 'Your account has been permanently banned.', 'error', 9000);
    };

    const handleAdminWarning = (warning) => {
      if (warning) {
        setWarnings((prev) => [warning, ...prev.filter((w) => w.id !== warning.id)]);
        addToast(`Official Warning (${warning.severity}): ${warning.reason}`, 'error', 8000);
      }
    };

    const handleAnnouncement = (ann) => {
      setAnnouncement(ann || null);
      setDismissedAnnouncementId(null);
    };

    socket.on('account-banned', handleBanned);
    socket.on('account-deleted', handleBanned);
    socket.on('admin-warning', handleAdminWarning);
    socket.on('system-announcement', handleAnnouncement);

    return () => {
      socket.off('account-banned', handleBanned);
      socket.off('account-deleted', handleBanned);
      socket.off('admin-warning', handleAdminWarning);
      socket.off('system-announcement', handleAnnouncement);
    };
  }, [socket, logout, addToast]);

  const acknowledgeWarning = async (warningId) => {
    setWarnings((prev) => prev.filter((w) => w.id !== warningId));
    if (!token) return;
    try {
      await fetch(`/api/auth/warnings/${warningId}/ack`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
  };

  const enterRoomNow = (roomId, mediaOpts = { micOn: !micMuted && !deafened, camOn: false, deafened }) => {
    runViewTransition(() => {
      setPreJoinRoom(null);
      setInitialRoomMedia(mediaOpts);
      setActiveRoomId(roomId);
      setCurrentView('room');
      setSidebarHidden(true);
    }, mainRef);
  };

  const requestJoinRoom = async (roomOrId) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    let roomObj = typeof roomOrId === 'string' ? null : roomOrId;
    if (!roomObj && typeof roomOrId === 'string') {
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomOrId)}`);
        if (res.ok) {
          const data = await res.json();
          roomObj = data.room;
        }
      } catch {}
    }

    const targetId = roomObj?.id || roomOrId;
    if (skipGreenRoom || !roomObj) {
      enterRoomNow(targetId);
    } else {
      setPreJoinRoom(roomObj);
    }
  };

  const handleLeaveRoom = () => {
    runViewTransition(() => {
      setActiveRoomId(null);
      setCurrentView('dashboard');
      setSidebarHidden(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    }, mainRef);
  };

  const navigateToView = (view) => {
    runViewTransition(() => {
      if (currentView === 'room') {
        setActiveRoomId(null);
      }
      setCurrentView(view);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setSidebarHidden(true);
      } else if (currentView === 'room' && view !== 'room') {
        setSidebarHidden(false);
      }
    }, mainRef);
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-slate-100 relative p-4">
        <AuthBackdrop />
        <div className="relative z-10 glass-panel px-8 py-6 rounded-2xl border border-white/10 text-center space-y-3 modal-panel-enter">
          <div className="w-8 h-8 rounded-full border-2 border-brand-purple border-t-transparent animate-spin mx-auto" />
          <p className="text-sm text-slate-300 font-medium">Loading StudyHub workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LandingAuthPage onSignedUp={() => setShowOnboarding(true)} />;
  }

  return (
    <div className="min-h-[100dvh] flex text-slate-100 relative">
      {/* 3D Animated / Custom Background Layer (Hidden inside Study Rooms so Room Theme takes over) */}
      {currentView !== 'room' && (
        <Background3D
          showSettingsModal={showBgSettings}
          onCloseSettings={() => setShowBgSettings(false)}
        />
      )}

      {/* Sidebar Navigation + Discord User Dock */}
      <Sidebar
        currentView={currentView}
        isHidden={sidebarHidden}
        onToggleHide={() => setSidebarHidden((prev) => !prev)}
        onViewChange={navigateToView}
        onOpenAuthModal={() => (user?.is_guest ? setShowUpgradeModal(true) : setShowAuthModal(true))}
        onOpenProfileModal={() => setShowSettingsModal(true)}
      />

      {/* Main Content Viewport */}
      <main
        ref={mainRef}
        tabIndex={-1}
        style={{
          '--user-accent': user?.accent_color || '#8b5cf6',
          viewTransitionName: 'studyhub-stage'
        }}
        className={`flex-1 min-w-0 w-full outline-none transition-all duration-300 relative z-10 ${
          currentView === 'room'
            ? 'p-1 sm:p-2.5'
            : 'p-4 sm:p-8 pb-[max(1.25rem,env(safe-area-inset-bottom))]'
        }`}
      >
        {currentView !== 'room' && (
          <Header
            onOpenBgSettings={() => setShowBgSettings(true)}
            sidebarHidden={sidebarHidden}
            onShowSidebar={() => setSidebarHidden(false)}
            onJoinRoom={requestJoinRoom}
            onNavigate={navigateToView}
          />
        )}

        {/* System Announcement Banner */}
        {currentView !== 'room' && announcement && announcement.id !== dismissedAnnouncementId && (
          <div
            className={`mb-4 px-4 py-3 rounded-2xl border flex items-start justify-between gap-3 shadow-lg ${
              announcement.level === 'urgent' || announcement.level === 'critical'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-100'
                : announcement.level === 'warning'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-100'
                : 'bg-brand-purple/15 border-brand-purple/40 text-purple-100'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider">{announcement.title}</div>
                <p className="text-xs opacity-90 mt-0.5 break-words">{announcement.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissedAnnouncementId(announcement.id)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white flex-shrink-0"
              title="Dismiss announcement"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Unacknowledged Admin Warnings Banner */}
        {currentView !== 'room' && warnings.length > 0 && (
          <div className="mb-4 space-y-2">
            {warnings.map((w) => (
              <div
                key={w.id}
                className="px-4 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-start justify-between gap-3 text-amber-100 shadow-lg"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider">
                      Official Moderator Notice ({w.severity || 'warning'})
                    </div>
                    <p className="text-xs text-amber-50/90 mt-0.5 break-words">{w.reason}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => acknowledgeWarning(w.id)}
                  className="px-3 py-1 rounded-xl bg-amber-500 text-dark-950 text-[11px] font-bold hover:bg-amber-400 transition-colors flex-shrink-0"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        )}

        {/* View Switcher */}
        <Suspense
          fallback={
            <div className="glass-panel p-8 rounded-2xl text-center text-sm text-slate-400 animate-fade-in">
              Loading workspace view...
            </div>
          }
        >
          <div key={currentView === 'room' ? `room-${activeRoomId}` : currentView} className="animate-view-enter">
            {currentView === 'dashboard' && (
              <DashboardView
                onJoinRoom={requestJoinRoom}
                onViewChange={navigateToView}
                onRequestUpgrade={() => setShowUpgradeModal(true)}
              />
            )}

            {currentView === 'room' && activeRoomId && (
              <RoomDetailView
                roomId={activeRoomId}
                initialMedia={initialRoomMedia}
                onLeaveRoom={handleLeaveRoom}
                onJoinRoom={requestJoinRoom}
                onNavigate={navigateToView}
                sidebarHidden={sidebarHidden}
                onToggleSidebar={() => setSidebarHidden((prev) => !prev)}
                onRequestUpgrade={() => setShowUpgradeModal(true)}
              />
            )}

            {currentView === 'favourites' && (
              <FavouritesView onJoinRoom={requestJoinRoom} />
            )}

            {currentView === 'friends' && (
              <FriendsView
                onJoinRoom={requestJoinRoom}
                onRequestUpgrade={() => setShowUpgradeModal(true)}
              />
            )}
            {currentView === 'pomodoro' && <PomodoroView />}
            {currentView === 'notes' && <NotesView />}
            {currentView === 'tasks' && <TasksView />}
            {currentView === 'alarms' && <AlarmView />}
            {currentView === 'safety' && (
              <SafetyReportsView onRequestUpgrade={() => setShowUpgradeModal(true)} />
            )}

            {currentView === 'admin-overview' && user?.is_admin && <AdminConsoleView initialTab="overview" />}
            {currentView === 'admin-users' && user?.is_admin && <AdminConsoleView initialTab="users" />}
            {currentView === 'admin-reports' && user?.is_admin && <AdminConsoleView initialTab="reports" />}
            {currentView === 'admin-audit' && user?.is_admin && <AdminConsoleView initialTab="audit" />}
          </div>
        </Suspense>
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      <AuthModal
        isOpen={showUpgradeModal}
        upgradeMode={!!user?.is_guest}
        initialMode={user?.is_guest ? 'register' : 'login'}
        onUpgraded={() => setShowOnboarding(true)}
        onClose={() => setShowUpgradeModal(false)}
      />

      <ProfileOnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onOpenBgSettings={() => setShowBgSettings(true)}
      />

      <PreJoinModal
        isOpen={!!preJoinRoom}
        room={preJoinRoom}
        onCancel={() => setPreJoinRoom(null)}
        onConfirmJoin={(mediaOpts) => enterRoomNow(preJoinRoom.id, mediaOpts)}
      />
    </div>
  );
}

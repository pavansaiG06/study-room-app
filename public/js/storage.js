// ==========================================
// STORAGE LAYER
// Wraps localStorage with JSON (de)serialization and safe error handling,
// and doubles as a lightweight "realtime" bus: the browser fires a native
// `storage` event in every OTHER tab whenever localStorage changes, so we
// use that to simulate multiple people sharing a room in real time without
// a server. Swap loadJSON/saveJSON for real network calls (e.g. Firebase,
// Supabase, or your own WebSocket server) to go from "same-browser demo"
// to "real cross-device realtime" without touching the rest of the app —
// every other module only talks to Rooms/Profile/etc, never to
// localStorage directly.
// ==========================================

const STORAGE_KEYS = {
  PROFILE: 'studyhub_profile',
  ROOMS: 'studyhub_rooms',
  FAVOURITES: 'studyhub_favourite_rooms',
  TASKS: 'studyhub_tasks',
  NOTES: 'studyhub_notes',
  ALARMS: 'studyhub_alarms',
  POMODORO_SETTINGS: 'studyhub_pomodoro_settings',
  BACKGROUND: 'studyhub_background',
  CURRENT_ROOM: 'studyhub_current_room'
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Failed to read "${key}" from storage`, err);
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`Failed to save "${key}" to storage`, err);
    showToast('Could not save — your browser storage may be full.', 'error');
    return false;
  }
}

// Fires `callback` whenever another tab changes `key`. Same-tab writers
// should call their own render function directly, since the storage event
// intentionally never fires in the tab that made the change.
function onExternalStorageChange(key, callback) {
  window.addEventListener('storage', (e) => {
    if (e.key === key) callback(e);
  });
}

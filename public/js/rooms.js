// ==========================================
// ROOMS
// Public & private study rooms with join codes, live presence (heartbeat +
// stale-member cleanup), group chat, and a synced focus timer. There's no
// server here, so "real time" means: every open tab on this browser shares
// localStorage, and the native `storage` event lets tabs notice each
// other's changes instantly. That's enough to demo the full experience
// locally. To make it real across *different* devices, replace the
// getRooms/setRooms pair at the top with calls to a real backend
// (WebSocket room server, Firebase Realtime Database, Supabase Realtime,
// etc.) — nothing else in the app needs to change, since every screen only
// calls these functions, never localStorage directly.
// ==========================================

const ROOM_HEARTBEAT_INTERVAL_MS = 5000;
const ROOM_STALE_AFTER_MS = 20000;      // no heartbeat in 20s -> treated as disconnected
const ROOM_SWEEP_INTERVAL_MS = 8000;
const EMPTY_ROOM_TTL_MS = 60 * 60 * 1000; // empty user-created rooms are cleared after an hour

let currentRoomId = null;
let heartbeatTimer = null;
let sweepTimer = null;
let focusTickTimer = null;
let roomsSearchQuery = '';

// ---- persistence ----

function getRooms() {
  return loadJSON(STORAGE_KEYS.ROOMS, {});
}

function setRooms(rooms) {
  saveJSON(STORAGE_KEYS.ROOMS, rooms);
}

function seedDefaultRoomsIfNeeded() {
  const existing = loadJSON(STORAGE_KEYS.ROOMS, null);
  if (existing) return;

  const seedList = [
    { name: 'Silent Study Hall', category: 'Deep Focus', description: 'Cameras optional. Heads down, mics muted.', capacity: 30 },
    { name: 'Math & Physics Lounge', category: 'STEM', description: 'Work through problem sets together.', capacity: 20 },
    { name: 'Language Exchange', category: 'Languages', description: 'Practice conversation with fellow learners.', capacity: 15 },
    { name: 'Late Night Grind', category: 'Deep Focus', description: 'For the night owls powering through deadlines.', capacity: 25 },
    { name: 'Exam Crunch Room', category: 'Revision', description: 'Quiz each other and share flashcards.', capacity: 20 }
  ];

  const rooms = {};
  seedList.forEach(r => {
    const id = generateId();
    rooms[id] = {
      id,
      name: r.name,
      description: r.description,
      category: r.category,
      visibility: 'public',
      password: null,
      capacity: r.capacity,
      hostId: null,
      isSeed: true,
      createdAt: Date.now(),
      participants: {},
      chat: [{ id: generateId(), system: true, text: `Welcome to ${r.name}!`, ts: Date.now() }],
      focusEndsAt: null,
      focusMinutes: null
    };
  });
  setRooms(rooms);
}

// ---- CRUD ----

function createRoom({ name, description, category, visibility, password, capacity }) {
  const me = getProfile();
  const rooms = getRooms();
  const id = generateId();

  rooms[id] = {
    id,
    name: name.trim().slice(0, 60),
    description: (description || '').trim().slice(0, 160),
    category: category || 'General',
    visibility,
    password: visibility === 'private' && password ? hashSimple(password) : null,
    capacity: Math.min(Math.max(parseInt(capacity) || 8, 2), 50),
    hostId: me.id,
    isSeed: false,
    createdAt: Date.now(),
    participants: {
      [me.id]: { id: me.id, name: me.name, avatarColor: me.avatarColor, joinedAt: Date.now(), lastSeen: Date.now(), isHost: true }
    },
    chat: [{ id: generateId(), system: true, text: `${me.name} created the room`, ts: Date.now() }],
    focusEndsAt: null,
    focusMinutes: null
  };

  setRooms(rooms);
  showToast(`Room "${rooms[id].name}" created`, 'success');
  enterRoom(id);
}

function joinRoom(roomId, passwordAttempt) {
  const rooms = getRooms();
  const room = rooms[roomId];
  if (!room) {
    showToast('That room no longer exists', 'error');
    renderRoomLists();
    return false;
  }
  if (room.visibility === 'private' && room.password && room.password !== hashSimple(passwordAttempt || '')) {
    showToast('Incorrect room password', 'error');
    return false;
  }
  const me = getProfile();
  const alreadyIn = !!room.participants[me.id];
  if (!alreadyIn && Object.keys(room.participants).length >= room.capacity) {
    showToast('That room is full', 'error');
    return false;
  }

  room.participants[me.id] = {
    id: me.id,
    name: me.name,
    avatarColor: me.avatarColor,
    joinedAt: room.participants[me.id]?.joinedAt || Date.now(),
    lastSeen: Date.now(),
    isHost: room.hostId === me.id
  };
  if (!room.hostId) { room.hostId = me.id; room.participants[me.id].isHost = true; }
  rooms[roomId] = room;
  setRooms(rooms);

  enterRoom(roomId);
  return true;
}

function enterRoom(roomId) {
  currentRoomId = roomId;
  saveJSON(STORAGE_KEYS.CURRENT_ROOM, roomId);
  startHeartbeat();
  switchView('room-detail');
  renderRoomDetail();
}

function leaveRoom() {
  if (!currentRoomId) return;
  const rooms = getRooms();
  const room = rooms[currentRoomId];
  const me = getProfile();

  if (room) {
    delete room.participants[me.id];
    if (room.hostId === me.id) {
      const remainingIds = Object.keys(room.participants);
      room.hostId = remainingIds[0] || null;
      if (remainingIds[0]) room.participants[remainingIds[0]].isHost = true;
    }
    if (Object.keys(room.participants).length === 0 && !room.isSeed) {
      room.emptySince = Date.now();
    }
    rooms[currentRoomId] = room;
    setRooms(rooms);
  }

  stopHeartbeat();
  currentRoomId = null;
  saveJSON(STORAGE_KEYS.CURRENT_ROOM, null);
  switchView('dashboard');
  showToast('You left the room');
}

function closeRoom() {
  if (!currentRoomId) return;
  const rooms = getRooms();
  const room = rooms[currentRoomId];
  if (!room) return;
  const me = getProfile();
  if (room.hostId !== me.id) return;

  delete rooms[currentRoomId];
  setRooms(rooms);
  stopHeartbeat();
  currentRoomId = null;
  saveJSON(STORAGE_KEYS.CURRENT_ROOM, null);
  switchView('dashboard');
  showToast('Room closed');
}

function sendRoomMessage(text) {
  const trimmed = (text || '').trim();
  if (!trimmed || !currentRoomId) return;
  const rooms = getRooms();
  const room = rooms[currentRoomId];
  if (!room) return;
  const me = getProfile();

  room.chat = room.chat || [];
  room.chat.push({ id: generateId(), senderId: me.id, senderName: me.name, text: trimmed.slice(0, 500), ts: Date.now() });
  if (room.chat.length > 100) room.chat = room.chat.slice(-100);

  rooms[currentRoomId] = room;
  setRooms(rooms);
  renderRoomDetail({ preserveScroll: false });
}

function toggleFavourite(roomId) {
  const favs = loadJSON(STORAGE_KEYS.FAVOURITES, []);
  const idx = favs.indexOf(roomId);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(roomId);
  saveJSON(STORAGE_KEYS.FAVOURITES, favs);
  renderRoomLists();
}

// ---- presence: heartbeat + stale cleanup ----

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!currentRoomId) return;
    const rooms = getRooms();
    const room = rooms[currentRoomId];
    const me = getProfile();
    if (!room || !room.participants[me.id]) return;
    room.participants[me.id].lastSeen = Date.now();
    rooms[currentRoomId] = room;
    setRooms(rooms);
  }, ROOM_HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function sweepStaleRooms() {
  const rooms = getRooms();
  let changed = false;

  Object.values(rooms).forEach(room => {
    Object.keys(room.participants).forEach(pid => {
      if (Date.now() - room.participants[pid].lastSeen > ROOM_STALE_AFTER_MS) {
        delete room.participants[pid];
        changed = true;
        if (room.hostId === pid) {
          const remainingIds = Object.keys(room.participants);
          room.hostId = remainingIds[0] || null;
          if (remainingIds[0]) room.participants[remainingIds[0]].isHost = true;
        }
      }
    });
    if (Object.keys(room.participants).length === 0 && !room.isSeed && !room.emptySince) {
      room.emptySince = Date.now();
      changed = true;
    }
    if (Object.keys(room.participants).length > 0 && room.emptySince) {
      delete room.emptySince;
      changed = true;
    }
  });

  Object.keys(rooms).forEach(id => {
    const room = rooms[id];
    if (!room.isSeed && room.emptySince && Date.now() - room.emptySince > EMPTY_ROOM_TTL_MS) {
      delete rooms[id];
      changed = true;
    }
  });

  if (changed) {
    setRooms(rooms);
    renderRoomLists();
    if (currentRoomId) renderRoomDetail();
  }
}

// ---- rendering: room cards (dashboard + favourites) ----

function renderRoomCard(room, favs) {
  const count = Object.keys(room.participants).length;
  const isFav = favs.includes(room.id);
  const full = count >= room.capacity;
  const lockIcon = room.visibility === 'private' ? '<i class="bi bi-lock-fill small text-secondary ms-1"></i>' : '';

  return `
    <div class="col-md-6 col-lg-4">
      <div class="card room-card border-0 h-100 p-3" style="background-color: var(--card-bg);">
        <div class="d-flex justify-content-between align-items-start mb-2">
          <span class="badge bg-secondary-subtle text-light">${escapeHtml(room.category)}</span>
          <button class="btn btn-sm btn-link text-warning p-0" data-action="toggle-fav" data-room-id="${room.id}" aria-label="Toggle favourite">
            <i class="bi ${isFav ? 'bi-star-fill' : 'bi-star'}"></i>
          </button>
        </div>
        <h6 class="fw-bold mb-1">${escapeHtml(room.name)}${lockIcon}</h6>
        <p class="text-secondary small mb-3">${escapeHtml(room.description || '')}</p>
        <div class="d-flex justify-content-between align-items-center mt-auto pt-2">
          <span class="small text-secondary"><i class="bi bi-people-fill me-1"></i>${count}/${room.capacity}</span>
          <button class="btn btn-sm ${full ? 'btn-outline-secondary disabled' : 'btn-primary'}" data-action="join-room" data-room-id="${room.id}">
            ${full ? 'Full' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function matchesSearch(room, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return room.name.toLowerCase().includes(q) || room.category.toLowerCase().includes(q);
}

function renderRoomLists() {
  const favs = loadJSON(STORAGE_KEYS.FAVOURITES, []);
  const rooms = Object.values(getRooms()).sort((a, b) => b.createdAt - a.createdAt);

  const dashboardContainer = document.getElementById('roomsContainer');
  if (dashboardContainer) {
    const visible = rooms.filter(r => matchesSearch(r, roomsSearchQuery));
    dashboardContainer.innerHTML = visible.length
      ? visible.map(r => renderRoomCard(r, favs)).join('')
      : `<p class="text-secondary">No rooms match "${escapeHtml(roomsSearchQuery)}".</p>`;
  }

  const favContainer = document.getElementById('favouriteRoomsContainer');
  if (favContainer) {
    const favRooms = rooms.filter(r => favs.includes(r.id));
    favContainer.innerHTML = favRooms.length
      ? favRooms.map(r => renderRoomCard(r, favs)).join('')
      : `<p class="text-secondary">No favourite rooms yet — tap the star on any room to add it here.</p>`;
  }
}

// ---- rendering: room detail (chat, participants, focus timer) ----

function renderRoomDetail() {
  const room = getRooms()[currentRoomId];
  const view = document.getElementById('view-room-detail');
  if (!room || !view) {
    if (currentRoomId) { currentRoomId = null; switchView('dashboard'); }
    return;
  }
  const me = getProfile();
  const isHost = room.hostId === me.id;

  document.getElementById('roomDetailName').textContent = room.name;
  document.getElementById('roomDetailMeta').innerHTML =
    `<span class="badge bg-secondary-subtle text-light me-2">${escapeHtml(room.category)}</span>` +
    `${room.visibility === 'private' ? '<i class="bi bi-lock-fill me-1"></i>Private' : '<i class="bi bi-globe2 me-1"></i>Public'}` +
    ` &middot; ${Object.keys(room.participants).length}/${room.capacity} here`;
  document.getElementById('roomDetailDescription').textContent = room.description || '';

  document.getElementById('roomInviteWrap').classList.toggle('hidden', room.visibility !== 'private');
  document.getElementById('roomInviteCode').value = room.id;
  document.getElementById('closeRoomBtn').classList.toggle('hidden', !isHost || room.isSeed);

  const participants = Object.values(room.participants).sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0));
  document.getElementById('roomParticipantsList').innerHTML = participants.map(p => `
    <div class="d-flex align-items-center gap-2 py-1">
      <span class="participant-dot" style="background:${p.avatarColor}"></span>
      <span class="text-light small">${escapeHtml(p.name)}</span>
      ${p.isHost ? '<i class="bi bi-star-fill text-warning small" title="Host"></i>' : ''}
    </div>
  `).join('') || '<p class="text-secondary small">No one here yet.</p>';

  const chatBox = document.getElementById('roomChatMessages');
  const wasNearBottom = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 40;
  chatBox.innerHTML = (room.chat || []).map(m => {
    if (m.system) return `<div class="text-secondary small text-center my-1">${escapeHtml(m.text)}</div>`;
    const mine = m.senderId === me.id;
    return `
      <div class="chat-msg ${mine ? 'chat-msg-mine' : ''}">
        <div class="chat-msg-sender">${escapeHtml(m.senderName)}</div>
        <div class="chat-msg-bubble">${escapeHtml(m.text)}</div>
      </div>
    `;
  }).join('');
  if (wasNearBottom) chatBox.scrollTop = chatBox.scrollHeight;

  renderFocusTimer(room, isHost);
}

function renderFocusTimer(room, isHost) {
  const label = document.getElementById('roomFocusLabel');
  const hostControls = document.getElementById('roomFocusHostControls');
  hostControls.classList.toggle('hidden', !isHost || !!room.focusEndsAt);

  if (room.focusEndsAt) {
    const remaining = Math.max(0, room.focusEndsAt - Date.now());
    if (remaining <= 0) {
      label.textContent = 'Focus session finished';
      if (isHost) {
        const rooms = getRooms();
        if (rooms[currentRoomId]) {
          rooms[currentRoomId].focusEndsAt = null;
          setRooms(rooms);
        }
      }
    } else {
      const m = Math.floor(remaining / 60000).toString().padStart(2, '0');
      const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      label.textContent = `Focus session — ${m}:${s} left`;
    }
  } else {
    label.textContent = isHost ? 'No focus session running' : 'Waiting for the host to start a focus session';
  }
}

function startRoomFocus(minutes) {
  const rooms = getRooms();
  const room = rooms[currentRoomId];
  if (!room) return;
  room.focusMinutes = minutes;
  room.focusEndsAt = Date.now() + minutes * 60000;
  rooms[currentRoomId] = room;
  setRooms(rooms);
  renderRoomDetail();
  showToast(`Focus session started (${minutes} min)`, 'success');
}

// ---- wiring ----

function initRoomsFeature() {
  seedDefaultRoomsIfNeeded();
  renderRoomLists();

  const savedRoomId = loadJSON(STORAGE_KEYS.CURRENT_ROOM, null);
  if (savedRoomId && getRooms()[savedRoomId]?.participants[getProfile().id]) {
    currentRoomId = savedRoomId;
    startHeartbeat();
  }

  // React instantly to changes made in OTHER tabs (join/leave/chat/etc).
  onExternalStorageChange(STORAGE_KEYS.ROOMS, () => {
    renderRoomLists();
    if (currentRoomId) renderRoomDetail();
  });
  onExternalStorageChange(STORAGE_KEYS.FAVOURITES, renderRoomLists);

  sweepTimer = setInterval(sweepStaleRooms, ROOM_SWEEP_INTERVAL_MS);
  focusTickTimer = setInterval(() => {
    if (currentRoomId) renderRoomDetail();
  }, 1000);

  // Search
  document.getElementById('roomSearchInput')?.addEventListener('input', (e) => {
    roomsSearchQuery = e.target.value;
    renderRoomLists();
  });

  // Delegated clicks for room cards (dashboard + favourites)
  ['roomsContainer', 'favouriteRoomsContainer'].forEach(containerId => {
    document.getElementById(containerId)?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const roomId = btn.dataset.roomId;
      if (btn.dataset.action === 'toggle-fav') toggleFavourite(roomId);
      if (btn.dataset.action === 'join-room') handleJoinClick(roomId);
    });
  });

  // Create Room modal
  const createForm = document.getElementById('createRoomForm');
  const visibilitySelect = document.getElementById('createRoomVisibility');
  visibilitySelect?.addEventListener('change', () => {
    document.getElementById('createRoomPasswordWrap').classList.toggle('hidden', visibilitySelect.value !== 'private');
  });
  createForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    createRoom({
      name: document.getElementById('createRoomName').value,
      description: document.getElementById('createRoomDescription').value,
      category: document.getElementById('createRoomCategory').value,
      visibility: visibilitySelect.value,
      password: document.getElementById('createRoomPassword').value,
      capacity: document.getElementById('createRoomCapacity').value
    });
    createForm.reset();
    document.getElementById('createRoomPasswordWrap').classList.add('hidden');
    bootstrap.Modal.getInstance(document.getElementById('createRoomModal'))?.hide();
  });

  // Join-by-code
  document.getElementById('joinByCodeForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('joinByCodeInput').value.trim();
    if (code) handleJoinClick(code);
    document.getElementById('joinByCodeInput').value = '';
  });

  // Private room password prompt
  let pendingJoinRoomId = null;
  const joinPasswordForm = document.getElementById('joinPasswordForm');
  joinPasswordForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pwd = document.getElementById('joinPasswordInput').value;
    if (joinRoom(pendingJoinRoomId, pwd)) {
      bootstrap.Modal.getInstance(document.getElementById('joinPasswordModal'))?.hide();
      joinPasswordForm.reset();
    }
  });

  function handleJoinClick(roomId) {
    const room = getRooms()[roomId];
    if (!room) { showToast('Room not found — check the code and try again', 'error'); return; }
    if (room.visibility === 'private' && room.password) {
      pendingJoinRoomId = roomId;
      document.getElementById('joinPasswordRoomName').textContent = room.name;
      bootstrap.Modal.getOrCreateInstance(document.getElementById('joinPasswordModal')).show();
    } else {
      joinRoom(roomId);
    }
  }

  // Room detail controls
  document.getElementById('leaveRoomBtn')?.addEventListener('click', leaveRoom);
  document.getElementById('closeRoomBtn')?.addEventListener('click', closeRoom);
  document.getElementById('copyInviteBtn')?.addEventListener('click', () => {
    const inviteInput = document.getElementById('roomInviteCode');
    inviteInput.select();
    navigator.clipboard?.writeText(inviteInput.value).then(
      () => showToast('Invite code copied'),
      () => showToast('Copy this code manually: ' + inviteInput.value)
    );
  });

  const chatForm = document.getElementById('roomChatForm');
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('roomChatInput');
    sendRoomMessage(input.value);
    input.value = '';
  });

  document.getElementById('startFocusBtn')?.addEventListener('click', () => {
    const minutes = Math.min(180, Math.max(1, parseInt(document.getElementById('focusMinutesInput').value) || 25));
    startRoomFocus(minutes);
  });
}

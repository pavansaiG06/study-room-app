# StudyHub Workspace

A dark-themed virtual co-working dashboard: tasks, notes, alarms, a Pomodoro
timer, and now public/private study **rooms** with live chat and presence.

## What changed from the original

### Bugs fixed
- **"Available Rooms" did nothing.** There was a `roomsContainer` div in the
  HTML but no code ever populated it. It's now backed by a real rooms
  system (see below).
- **Nothing survived a refresh.** Tasks, notes, alarms, and Pomodoro
  settings all lived only in memory. Everything now persists to
  `localStorage`.
- **"Favourite Rooms" was hardcoded** to always show "No favourite rooms
  added yet." You can now star any room and it shows up there.
- **The StudyHub logo wasn't clickable.** Clicking it now always returns to
  the Dashboard, from anywhere in the app.
- **`alert()` calls froze the whole page**, including the running Pomodoro
  countdown and clock, because `alert()` blocks the JS thread. Alarms and
  Pomodoro completions now use non-blocking toast notifications (plus the
  Notification API if permitted) instead.
- **Inline `onclick="…(${id})"` handlers were fragile** — a task or room
  name containing a quote could break the generated HTML. Dynamic lists
  (tasks, alarms, rooms, chat) now use event delegation with `data-*`
  attributes instead.
- Daily alarms only ever fired once, since the "triggered" flag never
  reset. It now resets at midnight so a saved alarm fires every day.
- The two `<script>` tags previously sat between `</head>` and `<body>`,
  which is invalid document structure; scripts now load inside `<head>`.

### New: Rooms (public & private, real-time-ish)
- **Create a room** — name, description, category, capacity, and
  visibility (public or private+password).
- **Join a room** — from the dashboard grid, by pasting an invite code, or
  by password if it's private.
- **Presence** — each tab sends a heartbeat every 5s; a sweep every 8s
  drops anyone who's gone quiet for 20s+, so the participant list and room
  capacity stay accurate. If a host disconnects, the next participant is
  auto-promoted to host. Empty non-default rooms are cleaned up after an
  hour of inactivity so the room list doesn't fill up with ghosts.
- **Live group chat** per room.
- **A synced focus timer** the host can start, visible to everyone in the
  room as a countdown.
- **Favourites** — star any room from the dashboard or favourites view.

### New: custom background
Click the image icon next to the clock to either upload a photo from your
device (drag-and-drop or file picker) or reset to the default animated
particle background. Your choice is remembered for next time. Photos are
downscaled and re-compressed client-side before saving so they don't blow
past `localStorage`'s quota.

### New: a minimal profile
A one-time "what should we call you" prompt gives you a display name and a
colour, used in room participant lists and chat.

## How "real time" actually works here

There's no backend in this project — it's a static site. To make rooms feel
live anyway, this app uses `localStorage` as shared state and the browser's
native `storage` event (which fires in *other* tabs whenever localStorage
changes) as the realtime signal. Open the same `index.html` in two tabs (or
two browser profiles) and you'll see joins, chat, and the focus timer
update live between them.

This is intentionally honest about being a same-browser demo, not
cross-device realtime — and a private room's "password" is only a mild
deterrent (anyone can open devtools and read `localStorage`), not real
security. To go further:

- Swap the `getRooms()` / `setRooms()` functions in `js/rooms.js` for calls
  to a real backend (a small WebSocket server, Firebase Realtime Database,
  Supabase Realtime, etc.). Nothing else in the app talks to `localStorage`
  directly, so this is a contained change.
- Add real authentication and move password checks server-side.

## Project structure

```
index.html          markup + Bootstrap/Three.js/app script tags
styles.css           theme, rooms, modals, toasts, background picker
js/
  utils.js           escaping, ids, debounce, toast notifications
  storage.js         localStorage wrapper + cross-tab change listener
  profile.js         first-run name prompt, current user
  background.js      3D particle field + custom background image
  navigation.js       sidebar view switching, clickable brand
  header.js          clock, greeting, quote, geolocation timezone
  tasks.js           to-do list (persisted)
  alarms.js          local alarms (persisted, daily reset)
  pomodoro.js        work/break timer (settings persisted)
  notes.js           autosaving notes
  friends.js         friends tabs/search (no backend — honest empty states)
  rooms.js           create/join/leave rooms, chat, presence, focus timer
  app.js             calls each feature's init() in the right order
```

## Running it

No build step — open `index.html` directly, or serve the folder with any
static file server, e.g. `python3 -m http.server` from this directory.

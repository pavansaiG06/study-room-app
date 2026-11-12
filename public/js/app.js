// ==========================================
// APP BOOTSTRAP
// Everything else in /js attaches functions to `window` implicitly (plain
// scripts, loaded with `defer` so they run in document order after the DOM
// is parsed). This file just calls each feature's init function in a safe
// order once everything is defined.
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initProfileFeature();
  initBackgroundFeature();
  initNavigation();
  initHeaderAndLocation();
  initTasksFeature();
  initAlarmsFeature();
  initPomodoroFeature();
  initNotesFeature();
  initFriendsFeature();
  initRoomsFeature();

  switchView(currentRoomId ? 'room-detail' : 'dashboard');
});

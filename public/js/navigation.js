// ==========================================
// NAVIGATION & VIEW SWITCHER
// ==========================================

function switchView(viewName) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove('hidden');

  const activeLink = document.querySelector(`.sidebar-link[data-view="${viewName}"]`);
  if (activeLink) activeLink.classList.add('active');

  if (viewName === 'friends') renderFriendsList();
  if (viewName === 'tasks') renderTasks();
  if (viewName === 'dashboard' || viewName === 'favourite-rooms') renderRoomLists();
}

function initNavigation() {
  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', () => switchView(link.dataset.view));
  });

  // Requirement: clicking the StudyHub brand always returns to the dashboard.
  document.getElementById('brandLogo')?.addEventListener('click', () => switchView('dashboard'));
}

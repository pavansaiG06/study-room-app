const { dbAsync } = require('./db');
const {
  onlineUsers,
  liveRooms,
  getLiveRoom,
  getLiveParticipants,
  setUserRoomPresence
} = require('./roomsManager');

/**
 * Disconnects live participants and clears in-memory state when a room closes or is deleted.
 */
function cleanupLiveRoom(roomId, io, endedBy = 'Host') {
  if (!liveRooms.has(roomId)) return;
  const liveRoom = getLiveRoom(roomId);
  for (const [, p] of liveRoom.participants.entries()) {
    setUserRoomPresence(p.userId, null, null);
  }
  if (io) {
    io.to(roomId).emit('room-ended-for-all', { roomId, endedBy });
    io.emit('room-count-update', { roomId, count: 0 });
  }
  liveRoom.participants.clear();
  liveRooms.delete(roomId);
}

/**
 * Explicitly deletes a room and all child membership/role/ban/request records
 * (prevents orphaned rows across both local SQLite and remote stateless libSQL/Turso).
 */
async function deleteRoomCompletely(roomId) {
  await dbAsync.run('DELETE FROM favourite_rooms WHERE room_id = ?', [roomId]);
  await dbAsync.run('DELETE FROM room_memberships WHERE room_id = ?', [roomId]);
  await dbAsync.run('DELETE FROM room_roles WHERE room_id = ?', [roomId]);
  await dbAsync.run('DELETE FROM room_bans WHERE room_id = ?', [roomId]);
  await dbAsync.run('DELETE FROM room_join_requests WHERE room_id = ?', [roomId]);
  await dbAsync.run('DELETE FROM rooms WHERE id = ?', [roomId]);
}

/**
 * Permanently removes a user account and cascades across live sockets, rooms, and SQLite tables.
 */
async function deleteUserCompletely(userId, io = null, disconnectReason = 'Your account has been permanently deleted.') {
  const existing = await dbAsync.get('SELECT id, email, name, is_guest FROM users WHERE id = ?', [userId]);
  if (!existing) return { deleted: false };

  // 1. Delete rooms owned by this user and notify any active participants
  const ownedRooms = await dbAsync.all('SELECT id FROM rooms WHERE host_id = ?', [userId]);
  for (const r of ownedRooms) {
    cleanupLiveRoom(r.id, io, `${existing.name || 'Host'} (account deleted)`);
    await deleteRoomCompletely(r.id);
  }

  // 2. Evict user from any live rooms they were visiting
  for (const [roomId, liveRoom] of liveRooms.entries()) {
    let changed = false;
    for (const [sid, p] of liveRoom.participants.entries()) {
      if (p.userId === userId) {
        liveRoom.participants.delete(sid);
        changed = true;
        if (io) {
          io.to(sid).emit('kicked-from-room', { roomId, reason: disconnectReason });
        }
      }
    }
    if (changed && io) {
      io.to(roomId).emit('participants-sync', getLiveParticipants(roomId));
      io.to(roomId).emit('room-members-updated');
      io.emit('room-count-update', { roomId, count: liveRoom.participants.size });
    }
  }

  // 3. Notify active browser sessions & clear online presence
  const presenceEntry = onlineUsers.get(userId);
  if (io && presenceEntry?.sockets) {
    for (const sid of presenceEntry.sockets) {
      io.to(sid).emit('account-deleted', { reason: disconnectReason });
    }
  }
  onlineUsers.delete(userId);
  if (io) {
    io.emit('presence-update', { userId, online: false, statusMode: 'offline', statusText: '', customEmoji: '' });
  }

  // 4. Clean up all database rows referencing this user (including tables without ON DELETE CASCADE)
  await dbAsync.run('DELETE FROM tasks WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM notes WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM favourite_rooms WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM room_memberships WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM room_roles WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM room_bans WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM room_join_requests WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?', [userId, userId]);
  await dbAsync.run('DELETE FROM direct_messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId]);
  await dbAsync.run('DELETE FROM notifications WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM user_warnings WHERE user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM reports WHERE reporter_id = ?', [userId]);
  await dbAsync.run('UPDATE reports SET target_user_id = NULL WHERE target_user_id = ?', [userId]);
  await dbAsync.run('DELETE FROM users WHERE id = ?', [userId]);

  return { deleted: true, user: existing };
}

module.exports = {
  cleanupLiveRoom,
  deleteRoomCompletely,
  deleteUserCompletely
};

import React from 'react';
import { getActivityMeta, getAvatarFrameClass } from '../utils/themes';

export function UserAvatar({
  name = 'SH',
  avatarUrl = null,
  avatarColor = '#8b5cf6',
  avatarFrame = 'none',
  sizeClass = 'w-9 h-9 text-xs',
  statusMode = null,
  className = ''
}) {
  const initials = (name || 'SH')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const frameClass = getAvatarFrameClass(avatarFrame);
  const statusMeta = statusMode ? getActivityMeta(statusMode) : null;

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={`${sizeClass} rounded-full object-cover shadow-inner border border-white/10 ${frameClass}`}
        />
      ) : (
        <div
          style={{ backgroundColor: avatarColor || '#8b5cf6' }}
          className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white shadow-inner select-none ${frameClass}`}
        >
          {initials}
        </div>
      )}

      {statusMeta && (
        <span
          title={statusMeta.label}
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-dark-900 ${statusMeta.dotClass}`}
        />
      )}
    </div>
  );
}

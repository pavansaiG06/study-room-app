import React, { useState, useEffect } from 'react';
import { Star, Users, ArrowRight, Heart, Lock, Hand } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ROOM_THEMES } from '../utils/themes';

export function FavouritesView({ onJoinRoom }) {
  const { token } = useAuth();
  const [favouriteRooms, setFavouriteRooms] = useState([]);

  useEffect(() => {
    async function loadFavourites() {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/rooms', { headers });
        if (res.ok) {
          const data = await res.json();
          const allRooms = data.rooms || [];
          const favIds = data.favourites || [];
          setFavouriteRooms(allRooms.filter((r) => favIds.includes(r.id)));
        }
      } catch {}
    }
    loadFavourites();
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Heart className="w-6 h-6 text-brand-pink fill-brand-pink" />
          Favourite Rooms
        </h2>
        <p className="text-sm text-slate-400 mt-0.5">Quick access to your regular study groups and frequented spaces.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {favouriteRooms.length === 0 ? (
          <div className="col-span-full py-12 text-center glass-panel rounded-2xl border border-white/5">
            <Star className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No favourite rooms added yet.</p>
            <p className="text-xs text-slate-500 mt-1">Tap the star on any room card in the Dashboard to pin it here.</p>
          </div>
        ) : (
          favouriteRooms.map((room) => {
            const themeMeta = ROOM_THEMES[room.theme] || ROOM_THEMES.default;
            return (
              <div
                key={room.id}
                onClick={() => onJoinRoom(room)}
                className="glass-panel rounded-2xl border border-white/5 hover:border-brand-purple/40 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between group shadow-lg overflow-hidden"
              >
                {room.cover_url ? (
                  <div className="h-24 w-full overflow-hidden relative bg-dark-950">
                    <img src={room.cover_url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-900/90 to-transparent" />
                  </div>
                ) : (
                  <div className="h-3 w-full" style={{ background: themeMeta.swatch }} />
                )}

                <div className={`p-4 flex-1 flex flex-col justify-between bg-gradient-to-br ${themeMeta.bgGradient}`}>
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${themeMeta.badgeClass}`}>
                        {room.vibe || room.category || 'Study'} · {room.mode || 'Group'}
                      </span>
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    </div>
                    <h4 className="text-base font-bold text-white group-hover:text-brand-purple transition-colors mb-1 flex items-center gap-1.5">
                      {room.name}
                      {room.isPrivate && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                      {room.waiting_room && <Hand className="w-3.5 h-3.5 text-amber-400" title="Waiting Room Enabled" />}
                    </h4>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                      {room.description || 'No description.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{room.liveParticipantsCount}/{room.capacity}</span>
                    </div>
                    <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-brand-purple/20 text-brand-purple group-hover:bg-brand-purple group-hover:text-white transition-all flex items-center gap-1">
                      Join <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

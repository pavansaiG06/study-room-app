import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, Edit2, X, CheckSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export function TasksView() {
  const { token, user } = useAuth();
  const { addToast } = useToast();

  const [tasks, setTasks] = useState([]);
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [token]);

  const addTask = async (e) => {
    e.preventDefault();
    if (!newText.trim()) return;

    if (!token) {
      addToast('Please sign in to save tasks', 'info');
      return;
    }

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: newText.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(prev => [...prev, data.task]);
        setNewText('');
        addToast('Task added', 'success');
      }
    } catch (err) {
      addToast('Failed to add task', 'error');
    }
  };

  const toggleTask = async (id, currentStatus) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ completed: !currentStatus })
      });
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !currentStatus } : t));
      }
    } catch (err) {}
  };

  const deleteTask = async (id) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== id));
        addToast('Task deleted', 'info');
      }
    } catch (err) {}
  };

  const saveEdit = async (id) => {
    if (!editText.trim()) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: editText.trim() })
      });
      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, text: editText.trim() } : t));
        setEditingId(null);
      }
    } catch (err) {}
  };

  return (
    <div className="w-full py-2 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-brand-purple" />
            Tasks & To-Dos
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Stay accountable and organized throughout your study sessions.</p>
        </div>
      </div>

      {/* Add Task Input Form */}
      <form onSubmit={addTask} className="flex gap-2">
        <input
          type="text"
          placeholder="What do you want to accomplish today?"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          className="flex-1 glass-input px-4 py-3 rounded-2xl text-sm"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white font-semibold text-sm transition-all shadow-md shadow-brand-purple/20 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </form>

      {/* Task List */}
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="p-8 text-center glass-panel rounded-2xl border border-white/5">
            <p className="text-sm text-slate-400">No tasks created yet. Add one above to get started!</p>
          </div>
        ) : (
          tasks.map(task => {
            const isEditing = editingId === task.id;

            return (
              <div
                key={task.id}
                className="glass-panel p-3.5 sm:p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-3 group transition-all"
              >
                {isEditing ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="flex-1 glass-input px-3 py-1.5 rounded-xl text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(task.id)}
                      className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-2 rounded-xl bg-white/5 text-slate-400 hover:bg-white/10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      onClick={() => toggleTask(task.id, task.completed)}
                      className="flex items-center gap-3 flex-1 cursor-pointer select-none"
                    >
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors ${
                          task.completed
                            ? 'bg-brand-purple border-brand-purple text-white'
                            : 'border-white/20 hover:border-brand-purple'
                        }`}
                      >
                        {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <span
                        className={`text-sm transition-all ${
                          task.completed ? 'line-through text-slate-500' : 'text-slate-200'
                        }`}
                      >
                        {task.text}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingId(task.id); setEditText(task.text); }}
                        className="p-1.5 text-slate-400 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { ShieldAlert, Flag, CheckCircle2, Clock, Shield, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { ReportModal } from '../components/ReportModal';

export function SafetyReportsView({ onRequestUpgrade }) {
  const { user, token } = useAuth();
  const { addToast } = useToast();

  const [tab, setTab] = useState('mine'); // 'mine' | 'moderated'
  const [myReports, setMyReports] = useState([]);
  const [moderatedReports, setModeratedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const loadReports = async () => {
    if (!token) {
      setMyReports([]);
      setModeratedReports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [mineRes, modRes] = await Promise.all([
        fetch('/api/reports/mine', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/reports/moderated', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (mineRes.ok) {
        const d = await mineRes.json();
        setMyReports(d.reports || []);
      }
      if (modRes.ok) {
        const d = await modRes.json();
        setModeratedReports(d.reports || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadReports();
  }, [token, user?.id]);

  const handleModerateReport = async (reportId, status, reviewerNote) => {
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, reviewer_note: reviewerNote })
      });
      if (res.ok) {
        addToast(`Report marked ${status.replace('_', ' ')}`, 'success');
        loadReports();
      }
    } catch {
      addToast('Failed to update report', 'error');
    }
  };

  const pendingModCount = moderatedReports.filter(
    (r) => r.status === 'submitted' || r.status === 'under_review'
  ).length;

  const displayed = tab === 'mine' ? myReports : moderatedReports;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-rose-500/20 bg-gradient-to-r from-rose-500/10 via-dark-900/60 to-purple-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Safety &amp; Restricted Activity Reports</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
              Submit confidential reports on misconduct, spam, or unsafe behavior across rooms and DMs.
              Photo or screenshot evidence is helpful but completely optional.
            </p>
          </div>
        </div>

        {user?.is_guest ? (
          <button
            onClick={() => onRequestUpgrade?.()}
            className="px-4 py-2.5 rounded-xl bg-brand-purple hover:bg-brand-purple/90 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg flex-shrink-0"
          >
            Unlock Account to Report
          </button>
        ) : (
          <button
            onClick={() => setReportModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-500/25 flex-shrink-0 transition-all"
          >
            <Flag className="w-4 h-4" />
            Submit New Report
          </button>
        )}
      </div>

      {/* Tabs: My Reports vs Rooms I Moderate */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab('mine')}
          className={`btn-tactile touch-control px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
            tab === 'mine'
              ? 'bg-brand-purple/20 border-brand-purple text-white'
              : 'glass-card border-white/10 text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          My Submitted Reports ({myReports.length})
        </button>

        <button
          onClick={() => setTab('moderated')}
          className={`btn-tactile touch-control px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
            tab === 'moderated'
              ? 'bg-amber-500/20 border-amber-400 text-white'
              : 'glass-card border-white/10 text-slate-400 hover:text-white'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-amber-400" />
          Room Moderation Queue
          {pendingModCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
              {pendingModCount}
            </span>
          )}
        </button>
      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-xs text-slate-400">
          Loading safety reports...
        </div>
      ) : displayed.length === 0 ? (
        <div className="glass-panel p-10 rounded-2xl border border-white/5 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="text-sm font-semibold text-white">
            {tab === 'mine' ? 'No reports submitted yet' : 'No room incident reports to review'}
          </p>
          <p className="text-xs text-slate-400">
            {tab === 'mine'
              ? 'Use "Submit New Report" above or the flag icon inside any room or profile card.'
              : 'Incident reports filed inside rooms you own or administer appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayed.map((rep) => (
            <div key={rep.id} className="glass-panel p-4 rounded-2xl border border-white/10 space-y-3 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-white">{rep.category}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-2">
                    <span className="uppercase font-semibold text-slate-300">{rep.severity} severity</span>
                    {rep.room_name && <span>• Room: {rep.room_name}</span>}
                    {rep.target_user_name && <span>• Reported: {rep.target_user_name}</span>}
                    {tab === 'moderated' && rep.reporter_name && <span>• By: {rep.reporter_name}</span>}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0 ${
                    rep.status === 'resolved'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : rep.status === 'dismissed'
                      ? 'bg-slate-500/20 text-slate-400'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {rep.status.replace('_', ' ')}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{rep.description}</p>

              {rep.evidence_image && (
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  <img src={rep.evidence_image} alt="Evidence attachment" className="w-full max-h-44 object-contain" />
                </div>
              )}

              {rep.reviewer_note && (
                <div className="p-2.5 rounded-xl bg-dark-950/70 border border-white/10 text-[11px] text-purple-200">
                  Moderator Note: {rep.reviewer_note}
                </div>
              )}

              {tab === 'moderated' && (rep.status === 'submitted' || rep.status === 'under_review') && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => handleModerateReport(rep.id, 'resolved', 'Addressed by room moderator')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Resolve
                  </button>
                  <button
                    onClick={() => handleModerateReport(rep.id, 'dismissed', 'Reviewed — no action needed')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ReportModal
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          loadReports();
        }}
        targetType="activity"
      />
    </div>
  );
}

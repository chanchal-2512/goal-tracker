// frontend/src/pages/admin/Dashboard.jsx

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const PHASES = [
  { value: 'goal_setting', label: 'Goal Setting' },
  { value: 'q1',           label: 'Q1 Check-in' },
  { value: 'q2',           label: 'Q2 Check-in' },
  { value: 'q3',           label: 'Q3 Check-in' },
  { value: 'q4',           label: 'Q4 / Annual' },
];

const QUARTER_LABELS = { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' };

const TAB_LABELS = ['Overview', 'Cycles', 'Unlock Goals', 'Audit Log'];

const UOM_OPTIONS = [
  { value: 'min',      label: 'Numeric / % — Higher is better' },
  { value: 'max',      label: 'Numeric / % — Lower is better' },
  { value: 'timeline', label: 'Timeline — Date-based' },
  { value: 'zero',     label: 'Zero-based' },
];

const THRUST_AREAS = [
  'Revenue Growth', 'Cost Optimisation', 'Customer Satisfaction',
  'People & Culture', 'Process Excellence', 'Innovation',
  'Safety & Compliance', 'Digital Transformation',
];

const emptyShareForm = {
  thrust_area: '', title: '', description: '',
  uom_type: 'min', target_value: '', target_date: '',
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState(0);

  const [cycles,            setCycles]            = useState([]);
  const [allGoals,          setAllGoals]          = useState([]);
  const [auditLog,          setAuditLog]          = useState([]);
  const [users,             setUsers]             = useState([]);
  const [cycle,             setCycle]             = useState(null);
  const [checkinCompletion, setCheckinCompletion] = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [pageError,         setPageError]         = useState('');

  // Cycle form
  const [cycleForm,   setCycleForm]   = useState({ name: '', phase: 'goal_setting', opens_at: '', closes_at: '' });
  const [cycleError,  setCycleError]  = useState('');
  const [cycleSaving, setCycleSaving] = useState(false);

  // Unlock
  const [unlockGoalId, setUnlockGoalId] = useState(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlocking,    setUnlocking]    = useState(false);

  // Share KPI modal
  const [showShareModal,   setShowShareModal]   = useState(false);
  const [shareForm,        setShareForm]        = useState(emptyShareForm);
  const [shareEmployeeIds, setShareEmployeeIds] = useState([]);
  const [shareError,       setShareError]       = useState('');
  const [shareSaving,      setShareSaving]      = useState(false);

  async function loadData() {
    setLoading(true);
    setPageError('');
    try {
      const [cyclesRes, goalsRes, auditRes, usersRes, completionRes] = await Promise.all([
        api.get('/api/admin/cycles'),
        api.get('/api/admin/goals'),
        api.get('/api/admin/audit'),
        api.get('/api/admin/users'),
        api.get('/api/admin/checkin-completion'),
      ]);
      setCycles(cyclesRes.data             ?? []);
      setAllGoals(goalsRes.data            ?? []);
      setAuditLog(auditRes.data            ?? []);
      setUsers(usersRes.data               ?? []);
      setCheckinCompletion(completionRes.data ?? []);

      try {
        const cycleRes = await api.get('/api/goals/cycles/active');
        setCycle(cycleRes.data);
      } catch {
        setCycle(null);
      }
    } catch {
      setPageError('Failed to load admin data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []); // eslint-disable-line

  // Cycle actions
  const handleCreateCycle = async () => {
    if (!cycleForm.name || !cycleForm.opens_at || !cycleForm.closes_at) {
      setCycleError('All fields are required.'); return;
    }
    if (new Date(cycleForm.closes_at) <= new Date(cycleForm.opens_at)) {
      setCycleError('Close date must be after open date.'); return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (cycleForm.opens_at < today) {
      if (!window.confirm('Opens date is in the past. Create anyway?')) return;
    }
    setCycleSaving(true); setCycleError('');
    try {
      await api.post('/api/admin/cycles', cycleForm);
      setCycleForm({ name: '', phase: 'goal_setting', opens_at: '', closes_at: '' });
      await loadData();
    } catch (err) {
      setCycleError(err.response?.data?.error || 'Failed to create cycle.');
    } finally { setCycleSaving(false); }
  };

  const handleToggleCycle = async (cycleId, currentActive) => {
    try {
      await api.put(`/api/admin/cycles/${cycleId}`, { is_active: !currentActive });
      await loadData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to update cycle.'); }
  };

  // Unlock
  const handleUnlock = async () => {
    if (!unlockReason.trim()) { alert('Please provide a reason.'); return; }
    setUnlocking(true);
    try {
      await api.post(`/api/admin/goals/${unlockGoalId}/unlock`, { reason: unlockReason });
      setUnlockGoalId(null); setUnlockReason('');
      await loadData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to unlock goal.'); }
    finally { setUnlocking(false); }
  };

  // Share KPI
  const handleShare = async () => {
    if (!shareForm.thrust_area || !shareForm.title || !shareForm.uom_type) {
      setShareError('Thrust area, title, and UoM are required.'); return;
    }
    if (!shareEmployeeIds.length) { setShareError('Select at least one employee.'); return; }
    if (!cycle) { setShareError('No active cycle found.'); return; }
    setShareSaving(true); setShareError('');
    try {
      await api.post('/api/goals/share', {
        ...shareForm, cycle_id: cycle.id, employee_ids: shareEmployeeIds,
        target_value: shareForm.target_value || null,
        target_date:  shareForm.target_date  || null,
      });
      setShowShareModal(false); setShareForm(emptyShareForm); setShareEmployeeIds([]);
      await loadData();
      alert(`KPI shared with ${shareEmployeeIds.length} employee(s) successfully.`);
    } catch (err) { setShareError(err.response?.data?.error || 'Failed to share KPI.'); }
    finally { setShareSaving(false); }
  };

  // CSV export
  const handleExport = () => {
    const rows = [
      ['Employee', 'Email', 'Department', 'Thrust Area', 'Goal Title', 'UoM', 'Target', 'Weightage', 'Status', 'Locked'],
      ...allGoals.map(g => [
        g.employee_name, g.employee_email, g.department ?? '',
        g.thrust_area, g.title, g.uom_type,
        g.target_value ?? g.target_date ?? '-',
        g.weightage, g.status, g.is_locked ? 'Yes' : 'No',
      ]),
    ];
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'goal_tracker_report.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const employees   = users.filter(u => u.role === 'employee');
  const submitted   = [...new Set(allGoals.filter(g => ['submitted','approved'].includes(g.status)).map(g => g.employee_id))];
  const approved    = [...new Set(allGoals.filter(g => g.status === 'approved').map(g => g.employee_id))];
  const lockedGoals = allGoals.filter(g => g.is_locked);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm animate-pulse">Loading admin data...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Goal Tracker</h1>
          <p className="text-xs text-gray-400">Admin Portal</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/admin/analytics"
            className="text-xs bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg transition-colors">
            📊 Analytics
          </a>
          <button
            onClick={() => { setShowShareModal(true); setShareError(''); setShareForm(emptyShareForm); setShareEmployeeIds([]); }}
            className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-lg transition-colors">
            + Share KPI
          </button>
          <span className="text-sm text-gray-600">{user?.name}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500 transition-colors">Sign out</button>
        </div>
      </nav>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1 max-w-5xl mx-auto">
          {TAB_LABELS.map((label, i) => (
            <button key={i} onClick={() => setTab(i)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === i ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {pageError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700 mb-6">{pageError}</div>
        )}

        {/* ── TAB 0: Overview ── */}
        {tab === 0 && (
          <div className="space-y-6">

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Total employees', value: employees.length,   color: 'text-gray-900' },
                { label: 'Goals submitted', value: submitted.length,   color: 'text-blue-600' },
                { label: 'Fully approved',  value: approved.length,    color: 'text-green-600' },
                { label: 'Locked goals',    value: lockedGoals.length, color: 'text-indigo-600' },
              ].map(s => (
                <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Goal completion dashboard */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Goal completion dashboard</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Employee goal submission and approval status</p>
                </div>
                <button onClick={handleExport}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-1.5 rounded-lg transition-colors">
                  Export CSV
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {employees.length === 0 && (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">No employees found.</p>
                )}
                {employees.map(emp => {
                  const empGoals   = allGoals.filter(g => g.employee_id === emp.id);
                  const hasSubmit  = empGoals.some(g => ['submitted','approved'].includes(g.status));
                  const hasApprove = empGoals.length > 0 && empGoals.every(g => g.status === 'approved');
                  const total      = empGoals.filter(g => g.status !== 'returned')
                                            .reduce((s, g) => s + parseFloat(g.weightage || 0), 0);
                  return (
                    <div key={emp.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                        <p className="text-xs text-gray-400">{emp.email} · {emp.department}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400">{empGoals.length} goals · {total.toFixed(0)}%</span>
                        <span className={`px-2 py-1 rounded-full font-medium ${
                          hasApprove ? 'bg-green-100 text-green-700' :
                          hasSubmit  ? 'bg-blue-100 text-blue-700'   :
                                       'bg-gray-100 text-gray-500'
                        }`}>
                          {hasApprove ? '✓ Approved' : hasSubmit ? 'Submitted' : 'Draft / Not started'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Manager check-in completion dashboard */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">Manager check-in completion</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Which managers have conducted structured check-ins per employee
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {checkinCompletion.length === 0 && (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">
                    No check-ins logged yet. Check-ins appear after managers add comments on approved goals.
                  </p>
                )}
                {checkinCompletion.map((row, i) => {
                  const quarters = Array.isArray(row.checked_quarters)
                    ? row.checked_quarters.filter(Boolean)
                    : [];
                  const hasCheckins = parseInt(row.total_checkins) > 0;
                  return (
                    <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">{row.employee_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Manager: <span className="text-gray-600">{row.manager_name || 'Unassigned'}</span>
                          {' · '}{row.department}
                          {' · '}{row.total_approved_goals} approved goals
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Quarter badges */}
                        {['q1','q2','q3','q4'].map(q => (
                          <span key={q} className={`text-xs px-2 py-0.5 rounded font-medium ${
                            quarters.includes(q)
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}>
                            {QUARTER_LABELS[q]}
                          </span>
                        ))}
                        <span className={`ml-2 text-xs font-medium px-2 py-1 rounded-full ${
                          hasCheckins ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'
                        }`}>
                          {hasCheckins ? `${row.total_checkins} check-in${row.total_checkins > 1 ? 's' : ''}` : 'No check-ins'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 1: Cycles ── */}
        {tab === 1 && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-4">Create new cycle</h2>
              {cycleError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-lg mb-4">{cycleError}</div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cycle name</label>
                  <input type="text" value={cycleForm.name}
                    onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Q1 Check-in 2026"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phase</label>
                  <select value={cycleForm.phase}
                    onChange={e => setCycleForm(p => ({ ...p, phase: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {PHASES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Opens on</label>
                  <input type="date" value={cycleForm.opens_at}
                    onChange={e => setCycleForm(p => ({ ...p, opens_at: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Closes on</label>
                  <input type="date" value={cycleForm.closes_at}
                    onChange={e => setCycleForm(p => ({ ...p, closes_at: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <button onClick={handleCreateCycle} disabled={cycleSaving}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors">
                {cycleSaving ? 'Creating...' : 'Create cycle'}
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">All cycles</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {cycles.length === 0 && (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">No cycles yet.</p>
                )}
                {cycles.map(c => (
                  <div key={c.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {PHASES.find(p => p.value === c.phase)?.label} ·{' '}
                        {new Date(c.opens_at).toLocaleDateString('en-IN')} →{' '}
                        {new Date(c.closes_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <button onClick={() => handleToggleCycle(c.id, c.is_active)}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: Unlock Goals ── */}
        {tab === 2 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">Locked goals</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Unlock resets the goal to "submitted" so the manager can edit or return it. All unlocks are audit-logged.
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              {lockedGoals.length === 0 && (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">No locked goals.</p>
              )}
              {lockedGoals.map(goal => (
                <div key={goal.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {goal.employee_name} · {goal.thrust_area} · {goal.weightage}%
                    </p>
                  </div>
                  <button onClick={() => { setUnlockGoalId(goal.id); setUnlockReason(''); }}
                    className="flex-shrink-0 text-xs px-3 py-1.5 border border-orange-200 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors">
                    🔓 Unlock
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 3: Audit Log ── */}
        {tab === 3 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">Audit trail</h2>
              <p className="text-xs text-gray-400 mt-0.5">All changes to goals after the lock date — who changed what and when.</p>
            </div>
            <div className="divide-y divide-gray-50">
              {auditLog.length === 0 && (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">No audit entries yet.</p>
              )}
              {auditLog.map(entry => (
                <div key={entry.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm text-gray-800">
                        <span className="font-medium">{entry.changed_by_name}</span> changed{' '}
                        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{entry.field_changed}</span>
                        {' '}on <span className="font-medium">"{entry.goal_title}"</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        <span className="line-through">{entry.old_value}</span>{' → '}
                        <span className="text-gray-700">{entry.new_value}</span>
                      </p>
                      {entry.reason && (
                        <p className="text-xs text-indigo-600 mt-1">Reason: {entry.reason}</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(entry.changed_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Unlock modal ── */}
      {unlockGoalId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Unlock goal</h3>
            <p className="text-xs text-gray-400 mb-4">
              This sets the goal back to "submitted" so the manager can act on it. Logged in audit trail.
            </p>
            <textarea rows={3} value={unlockReason} onChange={e => setUnlockReason(e.target.value)}
              placeholder="Reason for unlocking (required)..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={handleUnlock} disabled={unlocking}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-sm font-medium py-2.5 rounded-lg">
                {unlocking ? 'Unlocking...' : 'Confirm unlock'}
              </button>
              <button onClick={() => setUnlockGoalId(null)}
                className="px-5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share KPI modal ── */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 my-8">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Share departmental KPI</h3>
            <p className="text-xs text-gray-400 mb-4">
              Push a goal to employees. Recipients can only adjust weightage.
              {cycle ? ` Active cycle: ${cycle.name}` : ' ⚠ No active cycle found.'}
            </p>
            {shareError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-lg mb-4">⚠ {shareError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Thrust area *</label>
                <select value={shareForm.thrust_area}
                  onChange={e => setShareForm(p => ({ ...p, thrust_area: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">Select...</option>
                  {THRUST_AREAS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Goal title *</label>
                <input type="text" value={shareForm.title}
                  onChange={e => setShareForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Achieve department NPS of 80+"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea rows={2} value={shareForm.description}
                  onChange={e => setShareForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Unit of measurement *</label>
                <select value={shareForm.uom_type}
                  onChange={e => setShareForm(p => ({ ...p, uom_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {UOM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {['min','max'].includes(shareForm.uom_type) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target value</label>
                  <input type="number" value={shareForm.target_value}
                    onChange={e => setShareForm(p => ({ ...p, target_value: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              )}
              {shareForm.uom_type === 'timeline' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target deadline</label>
                  <input type="date" value={shareForm.target_date}
                    onChange={e => setShareForm(p => ({ ...p, target_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Share with *</label>
                {employees.length === 0
                  ? <p className="text-xs text-gray-400 italic">No employees found.</p>
                  : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {employees.map(emp => (
                        <label key={emp.id}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            shareEmployeeIds.includes(emp.id) ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                          }`}>
                          <input type="checkbox" checked={shareEmployeeIds.includes(emp.id)}
                            onChange={() => setShareEmployeeIds(prev =>
                              prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                            )} className="accent-purple-600" />
                          <div>
                            <p className="text-xs font-medium text-gray-800">{emp.name}</p>
                            <p className="text-xs text-gray-400">{emp.email} · {emp.department}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleShare} disabled={shareSaving || !cycle}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                {shareSaving ? 'Sharing...' : `Share with ${shareEmployeeIds.length || 0} employee(s)`}
              </button>
              <button
                onClick={() => { setShowShareModal(false); setShareForm(emptyShareForm); setShareEmployeeIds([]); setShareError(''); }}
                className="px-5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

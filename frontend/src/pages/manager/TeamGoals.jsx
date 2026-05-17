// frontend/src/pages/manager/TeamGoals.jsx

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-500',
  submitted: 'bg-blue-50 text-blue-700',
  approved:  'bg-green-50 text-green-700',
  returned:  'bg-red-50 text-red-700',
};

const UOM_LABELS = {
  min:      'Higher is better',
  max:      'Lower is better',
  timeline: 'Timeline',
  zero:     'Zero-based',
};

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

const QUARTERS = [
  { value: 'q1', label: 'Q1', window: 'July' },
  { value: 'q2', label: 'Q2', window: 'October' },
  { value: 'q3', label: 'Q3', window: 'January' },
  { value: 'q4', label: 'Q4 / Annual', window: 'March–April' },
];

const emptyShareForm = {
  thrust_area: '', title: '', description: '',
  uom_type: 'min', target_value: '', target_date: '',
};

const scoreColor = (score) => {
  const s = parseFloat(score);
  if (isNaN(s)) return 'text-gray-400';
  if (s >= 80) return 'text-green-600 font-bold';
  if (s >= 50) return 'text-amber-600 font-bold';
  return 'text-red-500 font-bold';
};

export default function TeamGoals() {
  const { user, logout } = useAuth();

  const [cycle,         setCycle]         = useState(null);
  const [teamGoals,     setTeamGoals]     = useState([]);
  const [teamMembers,   setTeamMembers]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [pageError,     setPageError]     = useState('');

  // View mode: 'approval' or 'checkin'
  const [viewMode,      setViewMode]      = useState('approval');

  // Approval / return
  const [actionLoading, setActionLoading] = useState(null);
  const [returnGoalId,  setReturnGoalId]  = useState(null);
  const [returnComment, setReturnComment] = useState('');

  // Inline edit
  const [editingId,     setEditingId]     = useState(null);
  const [editForm,      setEditForm]      = useState({});

  // Check-in comment modal
  const [checkinGoalId,  setCheckinGoalId]  = useState(null);
  const [checkinPhase,   setCheckinPhase]   = useState('q1');
  const [checkinComment, setCheckinComment] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);

  // View check-ins per goal
  const [visibleCheckins, setVisibleCheckins] = useState({});

  // Achievements per goal (for planned vs actual view)
  const [goalAchievements, setGoalAchievements] = useState({});
  const [selectedQuarter,  setSelectedQuarter]  = useState('q1');

  // Log Achievement modal (shared KPIs)
  const [achievementGoalId,  setAchievementGoalId]  = useState(null);
  const [achievementPhase,   setAchievementPhase]   = useState('q1');
  const [achievementForm,    setAchievementForm]    = useState({ actual_value: '', actual_date: '', goal_status: 'on_track', score: '' });
  const [achievementError,   setAchievementError]   = useState('');
  const [achievementLoading, setAchievementLoading] = useState(false);

  // Share modal
  const [showShareModal,   setShowShareModal]   = useState(false);
  const [shareForm,        setShareForm]        = useState(emptyShareForm);
  const [shareEmployeeIds, setShareEmployeeIds] = useState([]);
  const [shareError,       setShareError]       = useState('');
  const [shareSaving,      setShareSaving]      = useState(false);

  async function loadData() {
    setLoading(true);
    setPageError('');
    try {
      const cycleRes = await api.get('/api/goals/cycles/active');
      const activeCycle = cycleRes.data;
      setCycle(activeCycle);

      const goalsRes = await api.get(`/api/goals/team?cycle_id=${activeCycle.id}`);
      setTeamGoals(goalsRes.data ?? []);

      const usersRes = await api.get('/api/admin/users').catch(() => ({ data: [] }));
      const myTeam = usersRes.data.filter(u => u.manager_id === user.id && u.role === 'employee');
      setTeamMembers(myTeam);
    } catch (err) {
      if (err.response?.status === 404) setPageError('No active cycle found.');
      else setPageError('Failed to load team goals. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []); // eslint-disable-line

  // Load achievements for all approved goals when switching to check-in view
  const loadAllAchievements = async (goals) => {
    const approvedGoals = goals.filter(g => g.status === 'approved');
    const results = await Promise.all(
      approvedGoals.map(g =>
        api.get(`/api/checkins/achievement/${g.id}`)
           .then(res => ({ goalId: g.id, data: res.data }))
           .catch(() => ({ goalId: g.id, data: [] }))
      )
    );
    const map = {};
    results.forEach(r => { map[r.goalId] = r.data; });
    setGoalAchievements(map);
  };

  const switchToCheckin = async () => {
    setViewMode('checkin');
    await loadAllAchievements(teamGoals);
  };

  // Group goals by employee
  const employeeMap = {};
  teamGoals.forEach(goal => {
    const key = goal.employee_id;
    if (!employeeMap[key]) {
      employeeMap[key] = { id: goal.employee_id, name: goal.employee_name, email: goal.employee_email, goals: [] };
    }
    employeeMap[key].goals.push(goal);
  });
  const employees = Object.values(employeeMap);

  const getEmployeeStatus = (goals) => {
    if (goals.every(g => g.status === 'approved'))  return 'approved';
    if (goals.some(g => g.status === 'submitted'))  return 'pending';
    if (goals.some(g => g.status === 'returned'))   return 'returned';
    return 'draft';
  };

  const getTotalWeightage = (goals) =>
    goals.filter(g => !['returned'].includes(g.status))
         .reduce((s, g) => s + parseFloat(g.weightage || 0), 0);

  // Approve all
  const handleApproveAll = async (emp) => {
    const submitted = emp.goals.filter(g => g.status === 'submitted');
    if (!submitted.length) return;
    const total = emp.goals.filter(g => ['approved', 'submitted'].includes(g.status))
                           .reduce((s, g) => s + parseFloat(g.weightage || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      alert(`Cannot approve — total weightage (approved + submitted) is ${total.toFixed(1)}%, must be 100%.`);
      return;
    }
    if (!window.confirm(`Approve ${submitted.length} goal(s) for ${emp.name}?`)) return;
    setActionLoading(`approve-${emp.id}`);
    try {
      await api.post(`/api/goals/${submitted[0].id}/approve`);
      await loadData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to approve.'); }
    finally { setActionLoading(null); }
  };

  // Return
  const handleReturn = async () => {
    if (!returnGoalId) return;
    setActionLoading(`return-${returnGoalId}`);
    try {
      await api.post(`/api/goals/${returnGoalId}/return`, { comment: returnComment });
      setReturnGoalId(null); setReturnComment('');
      await loadData();
    } catch (err) { alert(err.response?.data?.error || 'Failed to return.'); }
    finally { setActionLoading(null); }
  };

  // Inline edit
  const startEdit = (goal) => {
    setEditingId(goal.id);
    setEditForm({
      target_value: goal.target_value ?? '',
      target_date:  goal.target_date ? goal.target_date.split('T')[0] : '',
      weightage:    goal.weightage,
    });
  };
  const saveEdit = async (goalId) => {
    try { await api.put(`/api/goals/${goalId}`, editForm); setEditingId(null); await loadData(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to save.'); }
  };

  // Check-in
  const handleCheckin = async () => {
    if (!checkinComment.trim()) { alert('Please enter a comment.'); return; }
    setCheckinLoading(true);
    try {
      await api.post('/api/checkins', { goal_id: checkinGoalId, cycle_phase: checkinPhase, comment: checkinComment });
      setCheckinGoalId(null); setCheckinComment('');
      if (visibleCheckins[checkinGoalId]) toggleCheckins(checkinGoalId, true);
    } catch (err) { alert(err.response?.data?.error || 'Failed to save check-in.'); }
    finally { setCheckinLoading(false); }
  };

  // Log Achievement (shared KPIs)
  const handleLogAchievement = async () => {
    if (!achievementForm.goal_status) { setAchievementError('Status is required.'); return; }
    setAchievementLoading(true); setAchievementError('');
    try {
      await api.post('/api/checkins/achievement', {
        goal_id:      achievementGoalId,
        cycle_phase:  achievementPhase,
        actual_value: achievementForm.actual_value || null,
        actual_date:  achievementForm.actual_date  || null,
        goal_status:  achievementForm.goal_status,
        score:        achievementForm.score        || null,
      });
      setAchievementGoalId(null);
      await loadAllAchievements(teamGoals);
    } catch (err) { setAchievementError(err.response?.data?.error || 'Failed to save.'); }
    finally { setAchievementLoading(false); }
  };

  const toggleCheckins = async (goalId, forceRefresh = false) => {
    if (visibleCheckins[goalId] && !forceRefresh) {
      setVisibleCheckins(p => ({ ...p, [goalId]: null })); return;
    }
    try {
      const res = await api.get(`/api/checkins/${goalId}`);
      setVisibleCheckins(p => ({ ...p, [goalId]: res.data }));
    } catch (err) { console.error(err.message); }
  };

  // Share
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
      alert(`Goal shared with ${shareEmployeeIds.length} employee(s).`);
    } catch (err) { setShareError(err.response?.data?.error || 'Failed to share.'); }
    finally { setShareSaving(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm animate-pulse">Loading team goals...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Goal Tracker</h1>
          <p className="text-xs text-gray-400">Manager Portal</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setShowShareModal(true); setShareError(''); }}
            className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-lg">
            + Share KPI
          </button>
          <span className="text-sm text-gray-600">{user?.name}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500">Sign out</button>
        </div>
      </nav>

      {/* View mode tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1 max-w-4xl mx-auto">
          {[
            { key: 'approval', label: 'Goal Approval' },
            { key: 'checkin',  label: 'Check-in & Planned vs Actual' },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => tab.key === 'checkin' ? switchToCheckin() : setViewMode(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                viewMode === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {pageError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 text-sm text-yellow-800">{pageError}</div>
        )}

        {/* Cycle banner */}
        {cycle && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-indigo-800">{cycle.name}</p>
              <p className="text-xs text-indigo-500 mt-0.5">{employees.length} team member{employees.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                {employees.filter(e => getEmployeeStatus(e.goals) === 'approved').length} approved
              </span>
              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                {employees.filter(e => getEmployeeStatus(e.goals) === 'pending').length} pending
              </span>
            </div>
          </div>
        )}

        {employees.length === 0 && !pageError && (
          <div className="text-center py-14 bg-white border border-dashed border-gray-300 rounded-xl text-gray-400 text-sm">
            No team members have submitted goals yet.
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            VIEW MODE: APPROVAL
        ══════════════════════════════════════════════════ */}
        {viewMode === 'approval' && employees.map((emp) => {
          const status      = getEmployeeStatus(emp.goals);
          const total       = getTotalWeightage(emp.goals);
          const submitted   = emp.goals.filter(g => g.status === 'submitted');
          const isApproving = actionLoading === `approve-${emp.id}`;

          return (
            <div key={emp.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Employee header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    Math.abs(total - 100) < 0.01 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>{total.toFixed(0)}% allocated</span>
                  {submitted.length > 0 && (
                    <button onClick={() => handleApproveAll(emp)} disabled={isApproving}
                      className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium px-4 py-1.5 rounded-lg">
                      {isApproving ? 'Approving...' : `Approve all (${submitted.length})`}
                    </button>
                  )}
                  {status === 'approved' && (
                    <span className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1 rounded-full">✓ All approved</span>
                  )}
                </div>
              </div>

              {/* Goal rows */}
              <div className="divide-y divide-gray-50">
                {emp.goals.map((goal) => (
                  <div key={goal.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-medium">{goal.thrust_area}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md capitalize ${STATUS_COLORS[goal.status]}`}>{goal.status}</span>
                          {goal.is_shared && <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md font-medium">Shared KPI</span>}
                          {goal.is_locked && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">🔒 Locked</span>}
                        </div>
                        <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                        {goal.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{goal.description}</p>}

                        {/* Inline edit */}
                        {editingId === goal.id ? (
                          <div className="mt-3 flex flex-wrap items-end gap-3 bg-gray-50 rounded-lg p-3">
                            {['min', 'max'].includes(goal.uom_type) && (
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Target value</label>
                                <input type="number" value={editForm.target_value}
                                  onChange={e => setEditForm(p => ({ ...p, target_value: e.target.value }))}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                              </div>
                            )}
                            {goal.uom_type === 'timeline' && (
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Target date</label>
                                <input type="date" value={editForm.target_date}
                                  onChange={e => setEditForm(p => ({ ...p, target_date: e.target.value }))}
                                  className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                              </div>
                            )}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Weightage (%)</label>
                              <input type="number" value={editForm.weightage}
                                onChange={e => setEditForm(p => ({ ...p, weightage: e.target.value }))}
                                className="border border-gray-300 rounded px-2 py-1 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                            </div>
                            <button onClick={() => saveEdit(goal.id)}
                              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">Save</button>
                            <button onClick={() => setEditingId(null)}
                              className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                            <span>UoM: <span className="text-gray-600">{UOM_LABELS[goal.uom_type]}</span></span>
                            {goal.target_value != null && <span>Target: <span className="text-gray-600">{goal.target_value}</span></span>}
                            {goal.target_date && <span>By: <span className="text-gray-600">{new Date(goal.target_date).toLocaleDateString('en-IN')}</span></span>}
                            <span className="font-semibold text-indigo-600">{goal.weightage}%</span>
                          </div>
                        )}

                        {/* Check-in comments */}
                        <button onClick={() => toggleCheckins(goal.id)}
                          className="text-xs text-indigo-400 hover:text-indigo-600 mt-2 underline underline-offset-2">
                          {visibleCheckins[goal.id] ? 'Hide check-ins' : 'View check-ins'}
                        </button>
                        {visibleCheckins[goal.id] && (
                          <div className="mt-2 space-y-1.5">
                            {visibleCheckins[goal.id].length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No check-in comments yet.</p>
                            ) : visibleCheckins[goal.id].map(c => (
                              <div key={c.id} className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="font-semibold text-indigo-700 uppercase">{c.cycle_phase}</span>
                                  <span className="text-indigo-300">{new Date(c.created_at).toLocaleDateString('en-IN')}</span>
                                </div>
                                <p className="text-indigo-800">{c.comment}</p>
                                <p className="text-indigo-400 mt-0.5">by {c.manager_name}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {goal.status === 'submitted' && editingId !== goal.id && (
                          <>
                            <div className="flex gap-2">
                              <button onClick={() => startEdit(goal)}
                                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Edit</button>
                              <button onClick={() => { setReturnGoalId(goal.id); setReturnComment(''); }}
                                className="text-xs px-3 py-1.5 border border-red-100 rounded-lg text-red-500 hover:bg-red-50">Return</button>
                            </div>
                            <button onClick={() => { setCheckinGoalId(goal.id); setCheckinComment(''); setCheckinPhase('q1'); }}
                              className="text-xs px-3 py-1.5 border border-indigo-100 rounded-lg text-indigo-600 hover:bg-indigo-50">+ Check-in</button>
                          </>
                        )}
                        {goal.status === 'approved' && (
                          <button onClick={() => { setCheckinGoalId(goal.id); setCheckinComment(''); setCheckinPhase('q1'); }}
                            className="text-xs px-3 py-1.5 border border-indigo-100 rounded-lg text-indigo-600 hover:bg-indigo-50">+ Check-in</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* ══════════════════════════════════════════════════
            VIEW MODE: CHECK-IN & PLANNED VS ACTUAL
        ══════════════════════════════════════════════════ */}
        {viewMode === 'checkin' && (
          <div className="space-y-6">
            {/* Quarter selector */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Select quarter to view</p>
              <div className="flex gap-2 flex-wrap">
                {QUARTERS.map(q => (
                  <button key={q.value} onClick={() => setSelectedQuarter(q.value)}
                    className={`text-xs px-4 py-2 rounded-lg border font-medium transition-colors ${
                      selectedQuarter === q.value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                    }`}>
                    {q.label} <span className="opacity-60 font-normal">({q.window})</span>
                  </button>
                ))}
              </div>
            </div>

            {employees.map(emp => {
              const approvedGoals = emp.goals.filter(g => g.status === 'approved');
              if (!approvedGoals.length) return null;

              return (
                <div key={emp.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.email}</p>
                    </div>
                  </div>

                  {/* Planned vs Actual table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-5 py-3 text-gray-500 font-medium">Goal</th>
                          <th className="text-left px-3 py-3 text-gray-500 font-medium">UoM</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium">Weight</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium">Planned Target</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium">Actual ({selectedQuarter.toUpperCase()})</th>
                          <th className="text-right px-3 py-3 text-gray-500 font-medium">Status</th>
                          <th className="text-right px-5 py-3 text-gray-500 font-medium">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {approvedGoals.map(goal => {
                          const ach = (goalAchievements[goal.id] ?? []).find(a => a.cycle_phase === selectedQuarter);
                          return (
                            <tr key={goal.id} className="hover:bg-gray-50">
                              <td className="px-5 py-3">
                                <p className="font-medium text-gray-900">{goal.title}</p>
                                <p className="text-gray-400">{goal.thrust_area}</p>
                                {goal.is_shared && <span className="text-purple-500">Shared KPI</span>}
                              </td>
                              <td className="px-3 py-3 text-gray-600">{UOM_LABELS[goal.uom_type]}</td>
                              <td className="px-3 py-3 text-right font-medium text-indigo-600">{goal.weightage}%</td>
                              <td className="px-3 py-3 text-right text-gray-700">
                                {goal.uom_type === 'timeline'
                                  ? (goal.target_date ? new Date(goal.target_date).toLocaleDateString('en-IN') : '—')
                                  : goal.uom_type === 'zero' ? '0'
                                  : (goal.target_value ?? '—')}
                              </td>
                              <td className="px-3 py-3 text-right text-gray-700">
                                {ach
                                  ? (ach.actual_value != null ? ach.actual_value
                                    : ach.actual_date ? new Date(ach.actual_date).toLocaleDateString('en-IN')
                                    : '—')
                                  : <span className="text-gray-300 italic">Not logged</span>}
                              </td>
                              <td className="px-3 py-3 text-right">
                                {ach ? (
                                  <span className={`capitalize px-2 py-0.5 rounded-full text-xs font-medium ${
                                    ach.goal_status === 'completed' ? 'bg-green-100 text-green-700' :
                                    ach.goal_status === 'on_track'  ? 'bg-blue-100 text-blue-700' :
                                                                       'bg-gray-100 text-gray-500'
                                  }`}>
                                    {ach.goal_status?.replace('_', ' ')}
                                  </span>
                                ) : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-5 py-3 text-right">
                                {ach?.score != null
                                  ? <span className={scoreColor(ach.score)}>{parseFloat(ach.score).toFixed(0)}%</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Check-in comments for this employee */}
                  <div className="px-5 py-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-600 mb-2">Add check-in comment for {emp.name}</p>
                    <div className="flex gap-2 flex-wrap mb-2">
                      {approvedGoals.map(g => (
                        <div key={g.id} className="flex gap-1.5">
                          <button
                            onClick={() => { setCheckinGoalId(g.id); setCheckinComment(''); setCheckinPhase(selectedQuarter); }}
                            className="text-xs px-3 py-1.5 border border-indigo-100 rounded-lg text-indigo-600 hover:bg-indigo-50">
                            + Comment on "{g.title.substring(0, 20)}{g.title.length > 20 ? '...' : ''}"
                          </button>
                          {g.is_shared && (
                            <button
                              onClick={() => {
                                setAchievementGoalId(g.id);
                                setAchievementPhase(selectedQuarter);
                                setAchievementForm({ actual_value: '', actual_date: '', goal_status: 'on_track', score: '' });
                                setAchievementError('');
                              }}
                              className="text-xs px-3 py-1.5 border border-purple-100 rounded-lg text-purple-600 hover:bg-purple-50">
                              📊 Log Achievement
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Return modal ── */}
      {returnGoalId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Return goal for rework</h3>
            <p className="text-xs text-gray-400 mb-4">Your comment will be shown to the employee on their dashboard.</p>
            <textarea rows={3} value={returnComment} onChange={e => setReturnComment(e.target.value)}
              placeholder="Reason for returning (shown to employee)..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={handleReturn} disabled={!!actionLoading}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-sm font-medium py-2.5 rounded-lg">
                {actionLoading ? 'Returning...' : 'Return for rework'}
              </button>
              <button onClick={() => setReturnGoalId(null)}
                className="px-5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Check-in modal ── */}
      {checkinGoalId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Add check-in comment</h3>
            <p className="text-xs text-gray-400 mb-4">Document the quarterly discussion. Visible to both manager and employee.</p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Quarter</label>
              <select value={checkinPhase} onChange={e => setCheckinPhase(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="q1">Q1 — July</option>
                <option value="q2">Q2 — October</option>
                <option value="q3">Q3 — January</option>
                <option value="q4">Q4 / Annual — March–April</option>
              </select>
            </div>
            <textarea rows={4} value={checkinComment} onChange={e => setCheckinComment(e.target.value)}
              placeholder="e.g. On track — achieved 60% of Q1 target. Discussed blockers..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={handleCheckin} disabled={checkinLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium py-2.5 rounded-lg">
                {checkinLoading ? 'Saving...' : 'Save check-in'}
              </button>
              <button onClick={() => setCheckinGoalId(null)}
                className="px-5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log Achievement modal (shared KPIs only) ── */}
      {achievementGoalId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Log achievement — Shared KPI</h3>
            <p className="text-xs text-gray-400 mb-4">Records the actual result for this quarter's planned vs actual view.</p>
            {achievementError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-lg mb-4">⚠ {achievementError}</div>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Quarter</label>
                <select value={achievementPhase} onChange={e => setAchievementPhase(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="q1">Q1 — July</option>
                  <option value="q2">Q2 — October</option>
                  <option value="q3">Q3 — January</option>
                  <option value="q4">Q4 / Annual — March–April</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Actual value <span className="text-gray-400 font-normal">(numeric goals)</span>
                </label>
                <input type="number" value={achievementForm.actual_value}
                  onChange={e => setAchievementForm(p => ({ ...p, actual_value: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Actual date <span className="text-gray-400 font-normal">(timeline goals)</span>
                </label>
                <input type="date" value={achievementForm.actual_date}
                  onChange={e => setAchievementForm(p => ({ ...p, actual_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status *</label>
                <select value={achievementForm.goal_status}
                  onChange={e => setAchievementForm(p => ({ ...p, goal_status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="on_track">On track</option>
                  <option value="completed">Completed</option>
                  <option value="at_risk">At risk</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Score (%) <span className="text-gray-400 font-normal">(optional override)</span>
                </label>
                <input type="number" min="0" max="100" value={achievementForm.score}
                  onChange={e => setAchievementForm(p => ({ ...p, score: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleLogAchievement} disabled={achievementLoading}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium py-2.5 rounded-lg">
                {achievementLoading ? 'Saving...' : 'Save achievement'}
              </button>
              <button onClick={() => setAchievementGoalId(null)}
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
            <p className="text-xs text-gray-400 mb-4">Recipients can only adjust weightage — title and target are read-only.</p>
            {shareError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-lg mb-4">⚠ {shareError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Thrust area *</label>
                <select value={shareForm.thrust_area} onChange={e => setShareForm(p => ({ ...p, thrust_area: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">Select...</option>
                  {THRUST_AREAS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Goal title *</label>
                <input type="text" value={shareForm.title} onChange={e => setShareForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Achieve team NPS of 80+"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea rows={2} value={shareForm.description} onChange={e => setShareForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Unit of measurement *</label>
                <select value={shareForm.uom_type} onChange={e => setShareForm(p => ({ ...p, uom_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {UOM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {['min', 'max'].includes(shareForm.uom_type) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target value</label>
                  <input type="number" value={shareForm.target_value} onChange={e => setShareForm(p => ({ ...p, target_value: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              )}
              {shareForm.uom_type === 'timeline' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target deadline</label>
                  <input type="date" value={shareForm.target_date} onChange={e => setShareForm(p => ({ ...p, target_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Share with *</label>
                {teamMembers.length === 0
                  ? <p className="text-xs text-gray-400 italic">No team members found.</p>
                  : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {teamMembers.map(emp => (
                        <label key={emp.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          shareEmployeeIds.includes(emp.id) ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input type="checkbox" checked={shareEmployeeIds.includes(emp.id)}
                            onChange={() => setShareEmployeeIds(prev =>
                              prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                            )} className="accent-purple-600" />
                          <div>
                            <p className="text-xs font-medium text-gray-800">{emp.name}</p>
                            <p className="text-xs text-gray-400">{emp.email}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleShare} disabled={shareSaving}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium py-2.5 rounded-lg">
                {shareSaving ? 'Sharing...' : `Share with ${shareEmployeeIds.length} employee(s)`}
              </button>
              <button onClick={() => { setShowShareModal(false); setShareForm(emptyShareForm); setShareEmployeeIds([]); setShareError(''); }}
                className="px-5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

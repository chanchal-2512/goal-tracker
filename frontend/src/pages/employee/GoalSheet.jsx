// frontend/src/pages/employee/GoalSheet.jsx

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const THRUST_AREAS = [
  'Revenue Growth', 'Cost Optimisation', 'Customer Satisfaction',
  'People & Culture', 'Process Excellence', 'Innovation',
  'Safety & Compliance', 'Digital Transformation',
];

const UOM_OPTIONS = [
  { value: 'min',      label: 'Numeric / % — Higher is better', example: 'e.g. Sales Revenue, Conversion Rate' },
  { value: 'max',      label: 'Numeric / % — Lower is better',  example: 'e.g. TAT, Cost, Error Rate' },
  { value: 'timeline', label: 'Timeline — Date-based',           example: 'e.g. Project Launch, Feature Delivery' },
  { value: 'zero',     label: 'Zero-based',                      example: 'e.g. Safety Incidents, Complaints' },
];

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-50 text-blue-700',
  approved:  'bg-green-50 text-green-700',
  returned:  'bg-red-50 text-red-700',
};

const GOAL_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'on_track',    label: 'On Track' },
  { value: 'completed',   label: 'Completed' },
];

const QUARTERS = [
  { value: 'q1', label: 'Q1', window: 'July' },
  { value: 'q2', label: 'Q2', window: 'October' },
  { value: 'q3', label: 'Q3', window: 'January' },
  { value: 'q4', label: 'Q4 / Annual', window: 'March–April' },
];

function getActiveQuarter() {
  const month = new Date().getMonth() + 1;
  if (month >= 7  && month <= 9)  return 'q1';
  if (month >= 10 && month <= 12) return 'q2';
  if (month >= 1  && month <= 3)  return 'q3';
  return null;
}

const scoreColor = (score) => {
  const s = parseFloat(score);
  if (isNaN(s)) return 'text-gray-400';
  if (s >= 80) return 'text-green-600 font-bold';
  if (s >= 50) return 'text-amber-600 font-bold';
  return 'text-red-500 font-bold';
};

const emptyForm = {
  thrust_area: '', title: '', description: '',
  uom_type: 'min', target_value: '', target_date: '', weightage: '',
};

export default function GoalSheet() {
  const { user, logout } = useAuth();

  const [allCycles,       setAllCycles]       = useState([]);
  const [cycle,           setCycle]           = useState(null);
  const [selectedCycleId, setSelectedCycleId] = useState(null);
  const [goals,           setGoals]           = useState([]);
  const [showForm,        setShowForm]        = useState(false);
  const [editingGoal,     setEditingGoal]     = useState(null);
  const [form,            setForm]            = useState(emptyForm);
  const [formError,       setFormError]       = useState('');
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [pageError,       setPageError]       = useState('');

  // Achievement state
  const [achievements,  setAchievements]  = useState({});
  const [openAchGoalId, setOpenAchGoalId] = useState(null);
  const [achForm,       setAchForm]       = useState({ actual_value: '', actual_date: '', goal_status: 'not_started' });
  const [achPhase,      setAchPhase]      = useState(getActiveQuarter() || 'q1');
  const [achSaving,     setAchSaving]     = useState(false);
  const [achError,      setAchError]      = useState('');

  const formRef  = useRef(null);
  const errorRef = useRef(null);
  const topRef   = useRef(null);

  async function loadData(cycleId) {
    setLoading(true);
    setPageError('');
    try {
      // Fetch all cycles for the picker
      const cyclesRes = await api.get('/api/goals/cycles/all');
      const cycles = cyclesRes.data ?? [];
      setAllCycles(cycles);

      // Determine which cycle to show
      let targetCycle;
      if (cycleId) {
        targetCycle = cycles.find(c => c.id === cycleId);
      } else {
        targetCycle = cycles.find(c => c.is_active) || cycles[0];
      }

      if (!targetCycle) {
        setPageError('No cycles found. Ask your admin to create one.');
        setLoading(false);
        return;
      }

      setCycle(targetCycle);
      setSelectedCycleId(targetCycle.id);

      const goalsRes = await api.get(`/api/goals/my?cycle_id=${targetCycle.id}`);
      setGoals(goalsRes.data ?? []);
    } catch (err) {
      setPageError('Failed to load data. Please refresh.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(null); }, []); // eslint-disable-line

  const handleCycleChange = (cycleId) => {
    setSelectedCycleId(cycleId);
    setOpenAchGoalId(null);
    setShowForm(false);
    setEditingGoal(null);
    loadData(cycleId);
  };

  // Load achievements for a goal
  const loadAchievements = async (goalId) => {
    try {
      const res = await api.get(`/api/checkins/achievement/${goalId}`);
      setAchievements(prev => ({ ...prev, [goalId]: res.data ?? [] }));
      return res.data ?? [];
    } catch (err) {
      console.error('Failed to load achievements:', err.message);
      return [];
    }
  };

  const toggleAchievement = async (goalId) => {
    if (openAchGoalId === goalId) { setOpenAchGoalId(null); return; }
    setOpenAchGoalId(goalId);
    setAchError('');
    const data = await loadAchievements(goalId);
    const existing = data.find(a => a.cycle_phase === achPhase);
    setAchForm(existing ? {
      actual_value: existing.actual_value ?? '',
      actual_date:  existing.actual_date ? existing.actual_date.split('T')[0] : '',
      goal_status:  existing.goal_status ?? 'not_started',
    } : { actual_value: '', actual_date: '', goal_status: 'not_started' });
  };

  const handleSaveAchievement = async (goal) => {
    if (!achForm.goal_status) { setAchError('Please select a status.'); return; }
    setAchSaving(true); setAchError('');
    try {
      await api.post('/api/checkins/achievement', {
        goal_id:      goal.id,
        cycle_phase:  achPhase,
        actual_value: achForm.actual_value !== '' ? achForm.actual_value : null,
        actual_date:  achForm.actual_date  !== '' ? achForm.actual_date  : null,
        goal_status:  achForm.goal_status,
      });
      await loadAchievements(goal.id);
      alert('Achievement saved successfully.');
    } catch (err) {
      setAchError(err.response?.data?.error || 'Failed to save achievement.');
    } finally { setAchSaving(false); }
  };

  // ── Derived values ─────────────────────────────────────────
  const realGoals = goals.filter(g =>
    g.status !== 'returned' &&
    !(g.is_shared && g.status === 'draft' && parseFloat(g.weightage || 0) === 0)
  );
  const unsetSharedGoals = goals.filter(g =>
    g.is_shared && g.status === 'draft' && parseFloat(g.weightage || 0) === 0
  );
  const returnedGoals = goals.filter(g => g.status === 'returned');

  const totalWeightage = realGoals.reduce((s, g) => s + parseFloat(g.weightage || 0), 0);

  // KEY FIX: only add back editingWeight if goal is currently counted in totalWeightage
  // Returned goals and unset shared goals are NOT in realGoals, so don't add them back
  const editingWeight = (editingGoal &&
    editingGoal.status !== 'returned' &&
    !(editingGoal.is_shared && parseFloat(editingGoal.weightage || 0) === 0))
    ? parseFloat(editingGoal.weightage || 0)
    : 0;
  const remainingWeight   = parseFloat((100 - totalWeightage + editingWeight).toFixed(1));
  const weightageComplete = Math.abs(totalWeightage - 100) < 0.01;

  const hasDraftGoals     = goals.some(g =>
    ['draft', 'returned'].includes(g.status) &&
    !(g.is_shared && parseFloat(g.weightage || 0) === 0)
  );
  const hasSubmittedGoals = goals.some(g => g.status === 'submitted');
  const allApproved       = realGoals.length > 0 && realGoals.every(g => g.status === 'approved');
  const canAddMore        = realGoals.length < 8;
  const isFullyLocked     = realGoals.length > 0 && realGoals.every(g => g.is_locked);
  const activeQuarter     = getActiveQuarter();
  const isActiveCycle     = cycle?.is_active;

  // ── Form helpers ───────────────────────────────────────────
  const openAddForm = () => {
    setEditingGoal(null); setForm(emptyForm); setFormError(''); setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const openEditForm = (goal) => {
    setEditingGoal(goal);
    setForm({
      thrust_area: goal.thrust_area, title: goal.title,
      description: goal.description || '', uom_type: goal.uom_type,
      target_value: goal.target_value ?? '', weightage: goal.weightage,
      target_date: goal.target_date ? goal.target_date.split('T')[0] : '',
    });
    setFormError(''); setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const closeForm = () => { setShowForm(false); setEditingGoal(null); setForm(emptyForm); setFormError(''); };
  const handleChange = (e) => { setForm(p => ({ ...p, [e.target.name]: e.target.value })); setFormError(''); };

  const handleSaveDraft = async () => {
    if (!form.thrust_area || !form.title || !form.weightage) {
      setFormError('Thrust area, goal title, and weightage are required.');
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }
    const w = parseFloat(form.weightage);
    if (isNaN(w) || w < 10) {
      setFormError('Minimum weightage per goal is 10%.');
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }
    if (w > remainingWeight + 0.01) {
      setFormError(`Only ${remainingWeight}% weightage remaining.`);
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    }
    setSaving(true); setFormError('');
    try {
      if (editingGoal) {
        await api.put(`/api/goals/${editingGoal.id}`, {
          ...form, status: editingGoal.status === 'returned' ? 'draft' : editingGoal.status,
        });
      } else {
        await api.post('/api/goals', { ...form, cycle_id: cycle.id, status: 'draft' });
      }
      await loadData(selectedCycleId); closeForm();
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save.');
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (goalId) => {
    if (!window.confirm('Delete this goal?')) return;
    try { await api.delete(`/api/goals/${goalId}`); await loadData(selectedCycleId); }
    catch (err) { alert(err.response?.data?.error || 'Failed to delete.'); }
  };

  const handleSubmitAll = async () => {
    if (!weightageComplete) { alert(`Total must be 100%. Current: ${totalWeightage.toFixed(1)}%`); return; }
    const drafts = goals.filter(g =>
      ['draft', 'returned'].includes(g.status) &&
      !(g.is_shared && parseFloat(g.weightage || 0) === 0)
    );
    if (!drafts.length) { alert('No draft goals to submit.'); return; }
    if (!window.confirm(`Submit ${drafts.length} goal(s) for manager approval?`)) return;
    setSubmitting(true);
    try {
      await Promise.all(drafts.map(g => api.put(`/api/goals/${g.id}`, { status: 'submitted' })));
      await loadData(selectedCycleId);
    } catch (err) { alert(err.response?.data?.error || 'Failed to submit.'); }
    finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm animate-pulse">Loading your goals...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div ref={topRef} />

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Goal Tracker</h1>
          <p className="text-xs text-gray-400">Employee Portal</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.name}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500">Sign out</button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">

        {pageError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 text-sm text-yellow-800">{pageError}</div>
        )}

        {/* Cycle banner with picker */}
        {allCycles.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-semibold text-indigo-800">{cycle?.name}</p>
                <p className="text-xs text-indigo-500 mt-0.5">
                  {cycle && `Open until ${new Date(cycle.closes_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                  {!isActiveCycle && <span className="ml-2 text-orange-500 font-medium">(Inactive cycle — view only)</span>}
                  {activeQuarter && isActiveCycle && (
                    <span className="ml-2 font-medium text-indigo-700">
                      · {QUARTERS.find(q => q.value === activeQuarter)?.label} check-in active
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {allApproved && isActiveCycle && (
                  <span className="text-xs font-medium bg-green-100 text-green-700 px-3 py-1 rounded-full">All approved ✓</span>
                )}
                {allCycles.length > 1 && (
                  <select
                    value={selectedCycleId || ''}
                    onChange={e => handleCycleChange(parseInt(e.target.value))}
                    className="text-xs border border-indigo-200 rounded-lg px-2 py-1.5 bg-white text-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    {allCycles.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.is_active ? '(active)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Weightage tracker */}
        {cycle && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Total weightage</p>
              <p className={`text-sm font-semibold ${weightageComplete ? 'text-green-600' : 'text-gray-800'}`}>
                {totalWeightage.toFixed(1)}% / 100%
              </p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all duration-300 ${
                totalWeightage > 100 ? 'bg-red-500' : weightageComplete ? 'bg-green-500' : 'bg-indigo-500'
              }`} style={{ width: `${Math.min(totalWeightage, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>{realGoals.length} / 8 goals</span>
              <span>{weightageComplete ? '✓ Ready to submit' : `${(100 - totalWeightage).toFixed(1)}% still to allocate`}</span>
            </div>
            {unsetSharedGoals.length > 0 && (
              <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs text-purple-700">
                ⚠ {unsetSharedGoals.length} shared KPI{unsetSharedGoals.length > 1 ? 's' : ''} below need a weightage set before they count.
              </div>
            )}
          </div>
        )}

        {/* Returned goals */}
        {returnedGoals.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-700 mb-1">⚠ {returnedGoals.length} goal{returnedGoals.length > 1 ? 's' : ''} returned for rework</p>
            <p className="text-xs text-red-500 mb-3">Edit and resubmit these goals.</p>
            {returnedGoals.map(goal => (
              <div key={goal.id} className="bg-white border border-red-200 rounded-lg p-3 mb-2 last:mb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                    <p className="text-xs text-gray-400">{goal.thrust_area} · {goal.weightage}%</p>
                    {goal.return_comment && (
                      <div className="mt-2 bg-red-50 rounded px-2 py-1.5 text-xs text-red-700">
                        <span className="font-medium">Manager's note:</span> {goal.return_comment}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => openEditForm(goal)}
                      className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700">Edit & fix</button>
                    <button onClick={() => handleDelete(goal.id)}
                      className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Goal cards */}
        <div className="space-y-3">
          {realGoals.length === 0 && unsetSharedGoals.length === 0 && !showForm && (
            <div className="text-center py-14 bg-white border border-dashed border-gray-300 rounded-xl text-gray-400 text-sm">
              No goals yet — click "+ Add goal" below to get started.
            </div>
          )}

          {realGoals.map((goal) => {
            const goalAchs = achievements[goal.id] ?? [];
            const isAchOpen = openAchGoalId === goal.id;

            return (
              <div key={goal.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{goal.thrust_area}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md capitalize ${STATUS_COLORS[goal.status]}`}>{goal.status}</span>
                        {goal.is_shared && <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md font-medium">Shared KPI</span>}
                        {goal.is_locked && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">🔒 Locked</span>}
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">{goal.title}</h3>
                      {goal.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{goal.description}</p>}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                        <span>UoM: <span className="text-gray-600">{UOM_OPTIONS.find(u => u.value === goal.uom_type)?.label}</span></span>
                        {goal.target_value != null && <span>Target: <span className="text-gray-600">{goal.target_value}</span></span>}
                        {goal.target_date && <span>By: <span className="text-gray-600">{new Date(goal.target_date).toLocaleDateString('en-IN')}</span></span>}
                        <span className="font-semibold text-indigo-600">{goal.weightage}%</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {goal.status === 'draft' && !goal.is_locked && (
                        <div className="flex gap-2">
                          <button onClick={() => openEditForm(goal)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Edit</button>
                          <button onClick={() => handleDelete(goal.id)} className="text-xs px-3 py-1.5 border border-red-100 rounded-lg text-red-500 hover:bg-red-50">Delete</button>
                        </div>
                      )}
                      {goal.status === 'approved' && isActiveCycle && (
                        <button onClick={() => toggleAchievement(goal.id)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                            isAchOpen ? 'bg-indigo-600 text-white' : 'border border-indigo-200 text-indigo-600 hover:bg-indigo-50'
                          }`}>
                          {isAchOpen ? 'Close' : '📊 Log achievement'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Achievement panel */}
                {isAchOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 p-5">
                    <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Quarterly Achievement Tracking</h4>

                    {/* Past achievements grid */}
                    {goalAchs.length > 0 && (
                      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {QUARTERS.map(q => {
                          const ach = goalAchs.find(a => a.cycle_phase === q.value);
                          return (
                            <div key={q.value} className={`rounded-lg p-2.5 text-xs border ${
                              ach ? 'bg-white border-indigo-100' : 'bg-gray-100 border-gray-200 opacity-50'
                            }`}>
                              <p className="font-semibold text-gray-600">{q.label}</p>
                              {ach ? (
                                <>
                                  <p className="text-gray-800 mt-0.5">
                                    {ach.actual_value != null ? ach.actual_value : ach.actual_date ?? '—'}
                                  </p>
                                  <p className={`font-medium mt-0.5 capitalize ${
                                    ach.goal_status === 'completed' ? 'text-green-600' :
                                    ach.goal_status === 'on_track'  ? 'text-blue-600' : 'text-gray-400'
                                  }`}>{ach.goal_status?.replace('_', ' ')}</p>
                                  {ach.score != null && (
                                    <p className={`mt-0.5 ${scoreColor(ach.score)}`}>
                                      Score: {parseFloat(ach.score).toFixed(0)}%
                                    </p>
                                  )}
                                </>
                              ) : <p className="text-gray-400 mt-0.5">Not logged</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Log form */}
                    <div className="bg-white border border-indigo-100 rounded-xl p-4">
                      <p className="text-xs font-semibold text-gray-700 mb-3">
                        Log achievement
                        {activeQuarter
                          ? ` — ${QUARTERS.find(q => q.value === activeQuarter)?.label} window active`
                          : ' — No active check-in window (goal setting phase)'}
                      </p>

                      {achError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg mb-3">⚠ {achError}</div>
                      )}

                      {/* Quarter selector */}
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
                        <div className="flex gap-2 flex-wrap">
                          {QUARTERS.map(q => (
                            <button key={q.value} onClick={() => {
                              setAchPhase(q.value);
                              const existing = goalAchs.find(a => a.cycle_phase === q.value);
                              setAchForm(existing ? {
                                actual_value: existing.actual_value ?? '',
                                actual_date:  existing.actual_date ? existing.actual_date.split('T')[0] : '',
                                goal_status:  existing.goal_status ?? 'not_started',
                              } : { actual_value: '', actual_date: '', goal_status: 'not_started' });
                            }}
                              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                                achPhase === q.value ? 'bg-indigo-600 text-white border-indigo-600' :
                                q.value === activeQuarter ? 'border-indigo-300 text-indigo-600 bg-indigo-50' :
                                'border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}>
                              {q.label}{q.value === activeQuarter && <span className="ml-1">●</span>}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Window: {QUARTERS.find(q => q.value === achPhase)?.window}</p>
                      </div>

                      {['min', 'max'].includes(goal.uom_type) && (
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Actual value
                            {goal.target_value && <span className="text-gray-400 font-normal ml-1">(planned: {goal.target_value})</span>}
                          </label>
                          <input type="number" value={achForm.actual_value}
                            onChange={e => setAchForm(p => ({ ...p, actual_value: e.target.value }))}
                            placeholder="Enter actual achieved value"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      )}
                      {goal.uom_type === 'timeline' && (
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Actual completion date
                            {goal.target_date && <span className="text-gray-400 font-normal ml-1">(deadline: {new Date(goal.target_date).toLocaleDateString('en-IN')})</span>}
                          </label>
                          <input type="date" value={achForm.actual_date}
                            onChange={e => setAchForm(p => ({ ...p, actual_date: e.target.value }))}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      )}
                      {goal.uom_type === 'zero' && (
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Actual count (0 = success)</label>
                          <input type="number" value={achForm.actual_value} min="0"
                            onChange={e => setAchForm(p => ({ ...p, actual_value: e.target.value }))}
                            placeholder="0 for zero incidents"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      )}

                      <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Progress status</label>
                        <div className="flex gap-2">
                          {GOAL_STATUS_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => setAchForm(p => ({ ...p, goal_status: opt.value }))}
                              className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                                achForm.goal_status === opt.value
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                              }`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button onClick={() => handleSaveAchievement(goal)} disabled={achSaving}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium py-2.5 rounded-lg">
                        {achSaving ? 'Saving...' : 'Save achievement'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unset shared goals */}
          {unsetSharedGoals.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-purple-600 px-1">Shared KPIs — set your weightage to include these</p>
              {unsetSharedGoals.map(goal => (
                <div key={goal.id} className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{goal.thrust_area}</span>
                        <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-md font-medium">Shared KPI</span>
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">Weightage not set</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{goal.title}</p>
                      {goal.description && <p className="text-xs text-gray-500 mt-0.5">{goal.description}</p>}
                      <p className="text-xs text-purple-600 mt-2">ℹ Title and target are fixed. Only weightage can be changed.</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => openEditForm(goal)}
                        className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Set weightage</button>
                      <button onClick={() => handleDelete(goal.id)}
                        className="text-xs px-3 py-1.5 border border-purple-200 text-purple-500 rounded-lg hover:bg-purple-100">Decline</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add goal button */}
        {cycle && isActiveCycle && !isFullyLocked && canAddMore && !showForm && (
          remainingWeight < 10 && !editingGoal ? (
            <div className="w-full border-2 border-dashed border-orange-200 rounded-xl py-4 text-sm text-orange-500 text-center bg-orange-50">
              Only {remainingWeight}% remaining — edit an existing goal to free up space.
            </div>
          ) : (
            <button onClick={openAddForm}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl py-4 text-sm text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
              + Add goal
            </button>
          )
        )}

        {/* Goal form */}
        {showForm && (
          <div ref={formRef} className="bg-white border border-indigo-200 rounded-xl p-6 scroll-mt-20">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">
              {editingGoal?.is_shared ? 'Set weightage for shared KPI' : editingGoal ? 'Edit goal' : 'New goal'}
            </h2>

            {formError && (
              <div ref={errorRef} className="bg-red-50 border border-red-300 text-red-700 text-sm px-4 py-3 rounded-lg mb-4 font-medium">
                ⚠ {formError}
              </div>
            )}
            {!formError && (
              <div className="text-xs px-3 py-2 rounded-lg mb-4 bg-indigo-50 text-indigo-700">
                {editingGoal?.is_shared
                  ? `${remainingWeight}% available · currently ${editingGoal.weightage}% · minimum 10%`
                  : editingGoal
                    ? `Editing: currently ${editingGoal.weightage}% · up to ${remainingWeight}% available`
                    : `${remainingWeight}% available to allocate · minimum 10% per goal`}
              </div>
            )}

            <div className="space-y-4">
              {editingGoal?.is_shared ? (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                    <p><span className="font-medium">Title:</span> {editingGoal.title}</p>
                    <p><span className="font-medium">Thrust area:</span> {editingGoal.thrust_area}</p>
                    <p><span className="font-medium">UoM:</span> {UOM_OPTIONS.find(u => u.value === editingGoal.uom_type)?.label}</p>
                    {editingGoal.target_value && <p><span className="font-medium">Target:</span> {editingGoal.target_value}</p>}
                    <p className="text-purple-600 mt-1">Set by your manager — only weightage can be changed.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Your weightage (%) <span className="text-red-400">*</span></label>
                    <input type="number" name="weightage" value={form.weightage} onChange={handleChange}
                      min="10" max={remainingWeight} step="1"
                      placeholder={`Min 10% — up to ${remainingWeight}% available`}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Thrust area <span className="text-red-400">*</span></label>
                    <select name="thrust_area" value={form.thrust_area} onChange={handleChange}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Select thrust area...</option>
                      {THRUST_AREAS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Goal title <span className="text-red-400">*</span></label>
                    <input type="text" name="title" value={form.title} onChange={handleChange}
                      placeholder="e.g. Achieve ₹50L in Q1 sales"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea name="description" value={form.description} onChange={handleChange}
                      rows={2} placeholder="Brief context..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Unit of measurement <span className="text-red-400">*</span></label>
                    <div className="space-y-2">
                      {UOM_OPTIONS.map(opt => (
                        <label key={opt.value} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          form.uom_type === opt.value ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                          <input type="radio" name="uom_type" value={opt.value}
                            checked={form.uom_type === opt.value} onChange={handleChange} className="mt-0.5 accent-indigo-600" />
                          <div>
                            <p className="text-xs font-medium text-gray-800">{opt.label}</p>
                            <p className="text-xs text-gray-400">{opt.example}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  {['min', 'max'].includes(form.uom_type) && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Target value</label>
                      <input type="number" name="target_value" value={form.target_value} onChange={handleChange}
                        placeholder="e.g. 5000000 or 95"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  )}
                  {form.uom_type === 'timeline' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Target deadline</label>
                      <input type="date" name="target_date" value={form.target_date} onChange={handleChange}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  )}
                  {form.uom_type === 'zero' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
                      Zero-based: success = achieving zero. No numeric target needed.
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Weightage (%) <span className="text-red-400">*</span></label>
                    <input type="number" name="weightage" value={form.weightage} onChange={handleChange}
                      min="10" max="100" step="1"
                      placeholder={`Min 10% — ${remainingWeight}% available`}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="text-xs text-gray-400 mt-1">{remainingWeight}% available · minimum 10% per goal</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={handleSaveDraft} disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium py-2.5 rounded-lg">
                {saving ? 'Saving...' : editingGoal ? 'Save changes' : 'Save as draft'}
              </button>
              <button onClick={closeForm} disabled={saving}
                className="px-5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}

        {/* Submit banner */}
        {cycle && isActiveCycle && hasDraftGoals && !showForm && (
          <div className={`bg-white border rounded-xl p-5 ${weightageComplete ? 'border-green-200' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">Ready to submit?</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {weightageComplete
                    ? 'All 100% allocated. Submit for manager approval.'
                    : `${(100 - totalWeightage).toFixed(1)}% still to allocate before submitting.`}
                </p>
              </div>
              <button onClick={handleSubmitAll} disabled={submitting || !weightageComplete}
                className="flex-shrink-0 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium px-5 py-2.5 rounded-lg">
                {submitting ? 'Submitting...' : 'Submit for approval'}
              </button>
            </div>
          </div>
        )}

        {hasSubmittedGoals && !hasDraftGoals && !allApproved && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-700">
            ✓ Goals submitted — awaiting manager approval.
          </div>
        )}
      </div>
    </div>
  );
}

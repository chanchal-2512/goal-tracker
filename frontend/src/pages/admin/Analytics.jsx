// frontend/src/pages/admin/Analytics.jsx

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import api from '../../api/axios';

const COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

const QUARTERS = ['q1','q2','q3','q4'];
const QUARTER_LABELS = { q1:'Q1', q2:'Q2', q3:'Q3', q4:'Q4' };

export default function Analytics() {
  const { user, logout } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api.get('/api/admin/analytics')
      .then(res => setData(res.data))
      .catch(() => setError('Failed to load analytics data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-sm animate-pulse">Loading analytics...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-red-500 text-sm">{error}</p>
    </div>
  );

  // ── Process goal distribution by thrust area ──────────────
  const thrustMap = {};
  (data.goalDistribution || []).forEach(row => {
    if (!thrustMap[row.thrust_area]) thrustMap[row.thrust_area] = 0;
    thrustMap[row.thrust_area] += parseInt(row.count);
  });
  const thrustData = Object.entries(thrustMap).map(([name, value]) => ({ name, value }));

  // ── Process goal status distribution ─────────────────────
  const statusMap = {};
  (data.goalDistribution || []).forEach(row => {
    if (!statusMap[row.status]) statusMap[row.status] = 0;
    statusMap[row.status] += parseInt(row.count);
  });
  const statusData = Object.entries(statusMap).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), value
  }));

  // ── Process QoQ score trends ──────────────────────────────
  // Group by quarter, compute avg score
  const quarterScores = {};
  QUARTERS.forEach(q => { quarterScores[q] = { total: 0, count: 0 }; });
  (data.scoreData || []).forEach(row => {
    if (row.score != null && quarterScores[row.cycle_phase]) {
      quarterScores[row.cycle_phase].total += parseFloat(row.score);
      quarterScores[row.cycle_phase].count += 1;
    }
  });
  const trendData = QUARTERS.map(q => ({
    quarter: QUARTER_LABELS[q],
    avgScore: quarterScores[q].count > 0
      ? parseFloat((quarterScores[q].total / quarterScores[q].count).toFixed(1))
      : null,
    count: quarterScores[q].count,
  }));

  // ── Process employee score by quarter (for individual view) ─
  const empScores = {};
  (data.scoreData || []).forEach(row => {
    if (!empScores[row.employee_name]) {
      empScores[row.employee_name] = { name: row.employee_name };
      QUARTERS.forEach(q => { empScores[row.employee_name][q] = null; });
    }
    if (row.score != null) {
      empScores[row.employee_name][row.cycle_phase] = parseFloat(parseFloat(row.score).toFixed(1));
    }
  });
  const empScoreData = Object.values(empScores);

  // ── Check-in rates by manager ─────────────────────────────
  const checkinData = (data.checkinRates || []).map(r => ({
    name: r.manager_name,
    checkins: parseInt(r.checkin_count),
  }));

  // ── UoM distribution ──────────────────────────────────────
  const uomMap = {};
  (data.goalDistribution || []).forEach(row => {
    // We need uom from scoreData
  });
  (data.uomDistribution || []).forEach(row => {
    uomMap[row.uom_type] = parseInt(row.count);
  });
  const uomData = Object.entries(uomMap).map(([name, value]) => ({ name, value }));

  // ── Summary stats ─────────────────────────────────────────
  const totalGoals    = (data.goalDistribution || []).reduce((s, r) => s + parseInt(r.count), 0);
  const approvedGoals = statusMap['approved'] || 0;
  const avgScore      = (() => {
    const scored = (data.scoreData || []).filter(r => r.score != null);
    if (!scored.length) return null;
    return (scored.reduce((s, r) => s + parseFloat(r.score), 0) / scored.length).toFixed(1);
  })();
  const totalCheckins = (data.checkinRates || []).reduce((s, r) => s + parseInt(r.checkin_count), 0);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Goal Tracker</h1>
          <p className="text-xs text-gray-400">Analytics</p>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-xs text-indigo-600 hover:underline">← Admin Dashboard</a>
          <span className="text-sm text-gray-600">{user?.name}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500">Sign out</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total goals',       value: totalGoals,                color: 'text-gray-900' },
            { label: 'Approved goals',    value: approvedGoals,             color: 'text-green-600' },
            { label: 'Avg score',         value: avgScore ? `${avgScore}%` : '—', color: 'text-indigo-600' },
            { label: 'Check-ins logged',  value: totalCheckins,             color: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Row 1: Thrust area pie + Status pie */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Thrust area distribution */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Goal distribution by thrust area</h2>
            <p className="text-xs text-gray-400 mb-4">How goals are spread across strategic focus areas</p>
            {thrustData.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={thrustData} cx="50%" cy="50%" outerRadius={90}
                    dataKey="value" nameKey="name" label={({ name, percent }) =>
                      `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`
                    } labelLine={false}>
                    {thrustData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} goals`, 'Count']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Status distribution */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Goal status breakdown</h2>
            <p className="text-xs text-gray-400 mb-4">Current state of all goals across the organisation</p>
            {statusData.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={statusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" name="Goals" radius={[4,4,0,0]}>
                    {statusData.map((entry, i) => {
                      const colorMap = {
                        Draft: '#9ca3af', Submitted: '#6366f1',
                        Approved: '#22c55e', Returned: '#ef4444',
                      };
                      return <Cell key={i} fill={colorMap[entry.name] || COLORS[i]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* QoQ Score trend */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Quarter-on-Quarter average score trend</h2>
          <p className="text-xs text-gray-400 mb-4">Average achievement score across all employees per quarter</p>
          {trendData.every(d => d.avgScore === null) ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              No achievement scores logged yet. Employees need to log actuals first.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData} margin={{ top: 10, right: 30, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={v => v != null ? [`${v}%`, 'Avg Score'] : ['No data', 'Avg Score']} />
                <Line type="monotone" dataKey="avgScore" stroke="#6366f1" strokeWidth={2.5}
                  dot={{ fill: '#6366f1', r: 5 }} activeDot={{ r: 7 }}
                  connectNulls={false} name="Avg Score" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Employee score by quarter */}
        {empScoreData.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Individual employee scores by quarter</h2>
            <p className="text-xs text-gray-400 mb-4">Score per employee per check-in quarter</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={empScoreData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={v => v != null ? [`${v}%`, 'Score'] : ['No data', 'Score']} />
                <Legend />
                {QUARTERS.map((q, i) => (
                  <Bar key={q} dataKey={q} name={QUARTER_LABELS[q]}
                    fill={COLORS[i]} radius={[3,3,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Manager check-in effectiveness */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Manager check-in effectiveness</h2>
          <p className="text-xs text-gray-400 mb-4">Number of structured check-in comments logged per manager</p>
          {checkinData.length === 0 || checkinData.every(d => d.checkins === 0) ? (
            <p className="text-center text-gray-400 text-sm py-8">No check-ins logged yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={checkinData} layout="vertical" margin={{ top: 0, right: 30, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="checkins" name="Check-ins" fill="#6366f1" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Completion heatmap table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Achievement score heatmap</h2>
            <p className="text-xs text-gray-400 mt-0.5">Score per employee per quarter — green ≥80%, amber ≥50%, red &lt;50%</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Employee</th>
                  {QUARTERS.map(q => (
                    <th key={q} className="text-center px-4 py-3 text-gray-500 font-medium">{QUARTER_LABELS[q]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {empScoreData.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">No score data yet.</td></tr>
                ) : empScoreData.map(emp => (
                  <tr key={emp.name} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-800">{emp.name}</td>
                    {QUARTERS.map(q => {
                      const score = emp[q];
                      const bg = score == null ? 'bg-gray-100'
                        : score >= 80 ? 'bg-green-100'
                        : score >= 50 ? 'bg-amber-100'
                        : 'bg-red-100';
                      const text = score == null ? 'text-gray-400'
                        : score >= 80 ? 'text-green-700'
                        : score >= 50 ? 'text-amber-700'
                        : 'text-red-600';
                      return (
                        <td key={q} className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-1 rounded font-medium ${bg} ${text}`}>
                            {score != null ? `${score}%` : '—'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

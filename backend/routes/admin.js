// backend/routes/admin.js

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = [authenticate, requireRole('admin')];

// GET /api/admin/cycles
router.get('/cycles', ...adminOnly, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM goal_cycles ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/cycles
router.post('/cycles', ...adminOnly, async (req, res) => {
  const { name, phase, opens_at, closes_at } = req.body;
  if (!name || !phase || !opens_at || !closes_at)
    return res.status(400).json({ error: 'All fields are required' });
  if (new Date(closes_at) <= new Date(opens_at))
    return res.status(400).json({ error: 'Close date must be after open date' });
  try {
    const r = await pool.query(
      'INSERT INTO goal_cycles (name,phase,opens_at,closes_at,is_active) VALUES ($1,$2,$3,$4,FALSE) RETURNING *',
      [name, phase, opens_at, closes_at]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/admin/cycles/:id
router.put('/cycles/:id', ...adminOnly, async (req, res) => {
  const { is_active } = req.body;
  const cycleId = parseInt(req.params.id);
  try {
    if (is_active) await pool.query('UPDATE goal_cycles SET is_active=FALSE');
    const r = await pool.query(
      'UPDATE goal_cycles SET is_active=$1 WHERE id=$2 RETURNING *',
      [is_active, cycleId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Cycle not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/admin/goals
router.get('/goals', ...adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT g.*, u.name as employee_name, u.email as employee_email, u.department
       FROM goals g JOIN users u ON u.id=g.employee_id ORDER BY u.name, g.created_at ASC`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/admin/users — managers can also call this
router.get('/users', authenticate, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id,name,email,role,department,manager_id FROM users ORDER BY role,name'
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/admin/audit
router.get('/audit', ...adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.*, u.name as changed_by_name, g.title as goal_title
       FROM audit_log a JOIN users u ON u.id=a.changed_by JOIN goals g ON g.id=a.goal_id
       ORDER BY a.changed_at DESC LIMIT 200`
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/goals/:id/unlock
router.post('/goals/:id/unlock', ...adminOnly, async (req, res) => {
  const goalId = parseInt(req.params.id);
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required' });
  try {
    const gRes = await pool.query('SELECT * FROM goals WHERE id=$1', [goalId]);
    if (!gRes.rows.length) return res.status(404).json({ error: 'Goal not found' });
    if (!gRes.rows[0].is_locked) return res.status(400).json({ error: 'Goal is not locked' });
    await pool.query(
      "UPDATE goals SET is_locked=FALSE, status='submitted', updated_at=NOW() WHERE id=$1",
      [goalId]
    );
    await pool.query(
      "INSERT INTO audit_log (goal_id,changed_by,field_changed,old_value,new_value,reason) VALUES ($1,$2,'is_locked','true','false',$3)",
      [goalId, req.user.id, reason.trim()]
    );
    res.json({ message: 'Goal unlocked and set to submitted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/admin/analytics
router.get('/analytics', ...adminOnly, async (req, res) => {
  try {
    const [goalDist, scoreData, checkinRates, uomDist] = await Promise.all([
      pool.query(`
        SELECT thrust_area, status, uom_type, COUNT(*) as count
        FROM goals
        WHERE NOT is_shared OR is_shared IS NULL
        GROUP BY thrust_area, status, uom_type ORDER BY thrust_area
      `),
      pool.query(`
        SELECT u.name as employee_name, a.cycle_phase, a.score, g.title as goal_title, g.weightage
        FROM achievements a
        JOIN goals g ON g.id=a.goal_id
        JOIN users u ON u.id=g.employee_id
        WHERE a.score IS NOT NULL
        ORDER BY u.name, a.cycle_phase
      `),
      pool.query(`
        SELECT u.name as manager_name, COUNT(c.id) as checkin_count
        FROM users u LEFT JOIN checkin_comments c ON c.manager_id=u.id
        WHERE u.role='manager' GROUP BY u.name ORDER BY checkin_count DESC
      `),
      pool.query(`
        SELECT uom_type, COUNT(*) as count FROM goals
        WHERE NOT is_shared OR is_shared IS NULL GROUP BY uom_type
      `),
    ]);
    res.json({
      goalDistribution: goalDist.rows,
      scoreData:        scoreData.rows,
      checkinRates:     checkinRates.rows,
      uomDistribution:  uomDist.rows,
    });
  } catch (err) {
    console.error('Analytics error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/checkin-completion
// Shows which managers have conducted check-ins per employee per quarter
// Used in the Completion Dashboard
// ─────────────────────────────────────────────────────────────
router.get('/checkin-completion', ...adminOnly, async (req, res) => {
  try {
    // Get all employees with their approved goals and check-in status
    const result = await pool.query(`
      SELECT
        u.id   as employee_id,
        u.name as employee_name,
        u.email as employee_email,
        u.department,
        m.name as manager_name,
        COUNT(DISTINCT g.id) as total_approved_goals,
        COUNT(DISTINCT c.goal_id || '-' || c.cycle_phase) as total_checkins,
        COALESCE(
          json_agg(DISTINCT c.cycle_phase) FILTER (WHERE c.cycle_phase IS NOT NULL),
          '[]'
        ) as checked_quarters
      FROM users u
      LEFT JOIN users m ON m.id = u.manager_id
      LEFT JOIN goals g ON g.employee_id = u.id AND g.status = 'approved'
      LEFT JOIN checkin_comments c ON c.goal_id = g.id
      WHERE u.role = 'employee'
      GROUP BY u.id, u.name, u.email, u.department, m.name
      ORDER BY m.name, u.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Checkin completion error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

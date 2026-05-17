// backend/routes/checkins.js
// Manager check-in comments + employee achievement logging

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// POST /api/checkins
// Manager adds a structured check-in comment for a goal
// Body: { goal_id, cycle_phase, comment }
// ─────────────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('manager', 'admin'), async (req, res) => {
  const { goal_id, cycle_phase, comment } = req.body;

  if (!goal_id || !cycle_phase || !comment?.trim()) {
    return res.status(400).json({ error: 'goal_id, cycle_phase and comment are required' });
  }

  const validPhases = ['q1', 'q2', 'q3', 'q4'];
  if (!validPhases.includes(cycle_phase)) {
    return res.status(400).json({ error: 'cycle_phase must be q1, q2, q3, or q4' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO checkin_comments (goal_id, manager_id, cycle_phase, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [goal_id, req.user.id, cycle_phase, comment.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /checkins error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/checkins/:goal_id
// Get all check-in comments for a goal
// ─────────────────────────────────────────────────────────────
router.get('/:goal_id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name as manager_name
       FROM checkin_comments c
       JOIN users u ON u.id = c.manager_id
       WHERE c.goal_id = $1
       ORDER BY c.created_at DESC`,
      [req.params.goal_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /checkins error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/checkins/achievement
// Employee logs actual achievement for a quarter
// Body: { goal_id, cycle_phase, actual_value, actual_date, goal_status }
// ─────────────────────────────────────────────────────────────
router.post('/achievement', authenticate, requireRole('employee', 'manager', 'admin'), async (req, res) => {
  const { goal_id, cycle_phase, actual_value, actual_date, goal_status } = req.body;

  if (!goal_id || !cycle_phase || !goal_status) {
    return res.status(400).json({ error: 'goal_id, cycle_phase and goal_status are required' });
  }

  const validStatuses = ['not_started', 'on_track', 'completed'];
  if (!validStatuses.includes(goal_status)) {
    return res.status(400).json({ error: 'Invalid goal_status' });
  }

  // Verify this goal belongs to the employee
  try {
    const goalCheck = await pool.query(
      'SELECT * FROM goals WHERE id = $1 AND employee_id = $2',
      [goal_id, req.user.id]
    );
    if (!goalCheck.rows.length) {
      return res.status(403).json({ error: 'Goal not found or access denied' });
    }

    const goal = goalCheck.rows[0];

    // Compute score
    let score = null;
    if (goal.uom_type === 'min') {
      if (goal.target_value && actual_value != null)
        score = Math.min((parseFloat(actual_value) / parseFloat(goal.target_value)) * 100, 100);
    } else if (goal.uom_type === 'max') {
      if (goal.target_value && actual_value && parseFloat(actual_value) !== 0)
        score = Math.min((parseFloat(goal.target_value) / parseFloat(actual_value)) * 100, 100);
    } else if (goal.uom_type === 'timeline') {
      if (actual_date && goal.target_date)
        score = new Date(actual_date) <= new Date(goal.target_date) ? 100 : 0;
    } else if (goal.uom_type === 'zero') {
      score = parseFloat(actual_value) === 0 ? 100 : 0;
    }

    // Upsert — one record per goal per quarter
    const result = await pool.query(
      `INSERT INTO achievements (goal_id, cycle_phase, actual_value, actual_date, goal_status, score)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (goal_id, cycle_phase)
       DO UPDATE SET
         actual_value = EXCLUDED.actual_value,
         actual_date  = EXCLUDED.actual_date,
         goal_status  = EXCLUDED.goal_status,
         score        = EXCLUDED.score,
         updated_at   = NOW()
       RETURNING *`,
      [goal_id, cycle_phase, actual_value ?? null, actual_date ?? null, goal_status, score]
    );

    // After saving the achievement, sync to shared copies if this is a parent goal
    if (goal.is_shared && !goal.shared_from) {
      const children = await pool.query(
        'SELECT id FROM goals WHERE shared_from = $1', 
        [goal_id]
      );
      
      await Promise.all(children.rows.map(child =>
        pool.query(
          `INSERT INTO achievements (goal_id, cycle_phase, actual_value, actual_date, goal_status, score)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (goal_id, cycle_phase) 
           DO UPDATE SET
             actual_value = EXCLUDED.actual_value,
             actual_date  = EXCLUDED.actual_date,
             goal_status  = EXCLUDED.goal_status,
             score        = EXCLUDED.score,
             updated_at   = NOW()`,
          [child.id, cycle_phase, actual_value ?? null, actual_date ?? null, goal_status, score]
        )
      ));
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /achievement error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/checkins/achievement/:goal_id
// Get all achievement entries for a goal
// ─────────────────────────────────────────────────────────────
router.get('/achievement/:goal_id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM achievements WHERE goal_id = $1 ORDER BY cycle_phase`,
      [req.params.goal_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /achievement error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
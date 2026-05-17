// backend/routes/goals.js
// All goal-related endpoints with email notifications

const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { sendMail, emails } = require('../utils/mailer');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// HELPER — compute progress score
// ─────────────────────────────────────────────────────────────
const computeScore = (uom_type, target_value, actual_value, target_date, actual_date) => {
  switch (uom_type) {
    case 'min':
      if (!target_value || target_value === 0 || actual_value == null) return null;
      return Math.min((actual_value / target_value) * 100, 100);
    case 'max':
      if (!actual_value || actual_value === 0 || target_value == null) return null;
      return Math.min((target_value / actual_value) * 100, 100);
    case 'timeline':
      if (!actual_date || !target_date) return null;
      return new Date(actual_date) <= new Date(target_date) ? 100 : 0;
    case 'zero':
      return parseFloat(actual_value) === 0 ? 100 : 0;
    default:
      return null;
  }
};

// ─────────────────────────────────────────────────────────────
// HELPER — validate weightage rules
// ─────────────────────────────────────────────────────────────
const validateWeightage = async (employee_id, cycle_id, newWeightage, excludeGoalId = null) => {
  const exclusion = `
    AND status != 'returned'
    AND NOT (is_shared = TRUE AND status = 'draft' AND weightage = 0)
  `;
  let totalQ = `SELECT COALESCE(SUM(weightage),0) as total FROM goals WHERE employee_id=$1 AND cycle_id=$2 ${exclusion}`;
  let countQ = `SELECT COUNT(*) as count FROM goals WHERE employee_id=$1 AND cycle_id=$2 ${exclusion}`;
  const p = [employee_id, cycle_id];
  if (excludeGoalId) { totalQ += ' AND id!=$3'; countQ += ' AND id!=$3'; p.push(excludeGoalId); }

  const [tRes, cRes] = await Promise.all([pool.query(totalQ, p), pool.query(countQ, p)]);
  const total = parseFloat(tRes.rows[0].total);
  const count = parseInt(cRes.rows[0].count);

  if (newWeightage < 10) return { valid: false, error: 'Minimum weightage per goal is 10%' };
  if (count >= 8)        return { valid: false, error: 'Maximum 8 goals allowed per employee per cycle' };
  if (total + newWeightage > 100.01) return { valid: false, error: `Only ${(100 - total).toFixed(1)}% weightage remaining.` };
  return { valid: true };
};

// ─────────────────────────────────────────────────────────────
// GET /api/goals/cycles/active — MUST be first
// ─────────────────────────────────────────────────────────────
router.get('/cycles/active', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM goal_cycles WHERE is_active=TRUE ORDER BY created_at DESC LIMIT 1'
    );
    if (!result.rows.length) return res.status(404).json({ error: 'No active cycle found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/goals/cycles/all — all cycles for picker
// ─────────────────────────────────────────────────────────────
router.get('/cycles/all', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM goal_cycles ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/goals/my
// ─────────────────────────────────────────────────────────────
router.get('/my', authenticate, async (req, res) => {
  const { cycle_id } = req.query;
  if (!cycle_id) return res.status(400).json({ error: 'cycle_id is required' });
  try {
    const result = await pool.query(
      'SELECT g.* FROM goals g WHERE g.employee_id=$1 AND g.cycle_id=$2 ORDER BY g.created_at ASC',
      [req.user.id, cycle_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/goals/team
// ─────────────────────────────────────────────────────────────
router.get('/team', authenticate, requireRole('manager', 'admin'), async (req, res) => {
  const { cycle_id } = req.query;
  if (!cycle_id) return res.status(400).json({ error: 'cycle_id is required' });
  try {
    const result = await pool.query(
      `SELECT g.*, u.name as employee_name, u.email as employee_email
       FROM goals g JOIN users u ON u.id=g.employee_id
       WHERE u.manager_id=$1 AND g.cycle_id=$2
       ORDER BY u.name, g.created_at ASC`,
      [req.user.id, cycle_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/goals
// ─────────────────────────────────────────────────────────────
router.post('/', authenticate, requireRole('employee'), async (req, res) => {
  const { cycle_id, thrust_area, title, description, uom_type, target_value, target_date, weightage, status } = req.body;

  if (!cycle_id || !thrust_area || !title || !uom_type || weightage === undefined || weightage === '')
    return res.status(400).json({ error: 'Missing required fields' });
  if (!['draft','submitted'].includes(status))
    return res.status(400).json({ error: 'Status must be draft or submitted' });

  const wCheck = await validateWeightage(req.user.id, cycle_id, parseFloat(weightage));
  if (!wCheck.valid) return res.status(400).json({ error: wCheck.error });

  try {
    const result = await pool.query(
      `INSERT INTO goals (employee_id,cycle_id,thrust_area,title,description,uom_type,target_value,target_date,weightage,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, cycle_id, thrust_area, title, description, uom_type,
       target_value || null, target_date || null, weightage, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/goals/share — with email notification
// ─────────────────────────────────────────────────────────────
router.post('/share', authenticate, requireRole('manager', 'admin'), async (req, res) => {
  const { title, thrust_area, uom_type, target_value, target_date, description, cycle_id, employee_ids } = req.body;

  if (!title || !thrust_area || !uom_type || !cycle_id)
    return res.status(400).json({ error: 'title, thrust_area, uom_type, cycle_id are required' });
  if (!employee_ids?.length)
    return res.status(400).json({ error: 'Select at least one employee' });

  try {
    // Check 8-goal limit
    const blocked = [];
    for (const empId of employee_ids) {
      const r = await pool.query(
        `SELECT COUNT(*) as count FROM goals WHERE employee_id=$1 AND cycle_id=$2
         AND status!='returned' AND NOT (is_shared=TRUE AND status='draft' AND weightage=0)`,
        [empId, cycle_id]
      );
      if (parseInt(r.rows[0].count) >= 8) {
        const u = await pool.query('SELECT name FROM users WHERE id=$1', [empId]);
        blocked.push(u.rows[0]?.name || `Employee ${empId}`);
      }
    }
    if (blocked.length) return res.status(400).json({ error: `Cannot share — 8 goals limit reached for: ${blocked.join(', ')}` });

    const parent = await pool.query(
      `INSERT INTO goals (employee_id,cycle_id,thrust_area,title,description,uom_type,target_value,target_date,weightage,status,is_shared)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'approved',TRUE) RETURNING *`,
      [req.user.id, cycle_id, thrust_area, title, description, uom_type, target_value || null, target_date || null]
    );

    const copies = await Promise.all(employee_ids.map(empId =>
      pool.query(
        `INSERT INTO goals (employee_id,cycle_id,thrust_area,title,description,uom_type,target_value,target_date,weightage,status,is_shared,shared_from)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,'draft',TRUE,$9) RETURNING *`,
        [empId, cycle_id, thrust_area, title, description, uom_type, target_value || null, target_date || null, parent.rows[0].id]
      )
    ));

    // Get cycle name and sender name for emails
    const cycleRes = await pool.query('SELECT name FROM goal_cycles WHERE id=$1', [cycle_id]);
    const cycleName = cycleRes.rows[0]?.name || 'Goal Setting';

    // Send email to each recipient
    for (const empId of employee_ids) {
      const empRes = await pool.query('SELECT name, email FROM users WHERE id=$1', [empId]);
      const emp = empRes.rows[0];
      if (emp) {
        const tmpl = emails.kpiShared(emp.email, emp.name, req.user.name, title, cycleName);
        sendMail(tmpl.to, tmpl.subject, tmpl.html);
      }
    }

    res.status(201).json({ parent: parent.rows[0], copies: copies.map(c => c.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/goals/:id — with email on submission
// ─────────────────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  const goalId = parseInt(req.params.id);
  try {
    const gRes = await pool.query('SELECT * FROM goals WHERE id=$1', [goalId]);
    if (!gRes.rows.length) return res.status(404).json({ error: 'Goal not found' });
    const goal = gRes.rows[0];

    if (req.user.role === 'employee') {
      if (goal.employee_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      if (goal.is_locked) return res.status(403).json({ error: 'Goal is locked.' });
      if (!['draft','returned'].includes(goal.status)) return res.status(403).json({ error: 'Only draft or returned goals can be edited' });

      // Shared goal — only weightage + status
      if (goal.is_shared) {
        const { weightage, status } = req.body;
        if (weightage !== undefined) {
          const wCheck = await validateWeightage(goal.employee_id, goal.cycle_id, parseFloat(weightage), goalId);
          if (!wCheck.valid) return res.status(400).json({ error: wCheck.error });
        }
        const updated = await pool.query(
          `UPDATE goals SET weightage=COALESCE($1::numeric,weightage), status=COALESCE($2,status), updated_at=NOW()
           WHERE id=$3 RETURNING *`,
          [weightage != null && weightage !== '' ? weightage : null, status || null, goalId]
        );
        return res.json(updated.rows[0]);
      }
    }

    if (req.user.role === 'manager' && goal.status !== 'submitted')
      return res.status(403).json({ error: 'Can only edit goals pending approval' });

    const { thrust_area, title, description, uom_type, target_value, target_date, weightage, status, reason } = req.body;

    if (weightage !== undefined && weightage !== '' && parseFloat(weightage) !== parseFloat(goal.weightage)) {
      const wCheck = await validateWeightage(goal.employee_id, goal.cycle_id, parseFloat(weightage), goalId);
      if (!wCheck.valid) return res.status(400).json({ error: wCheck.error });
    }

    // Audit log for admin edits on locked goals
    if (req.user.role === 'admin' && goal.is_locked) {
      const changes = [];
      if (target_value !== undefined && target_value != goal.target_value) changes.push(['target_value', goal.target_value, target_value]);
      if (weightage !== undefined && weightage != goal.weightage) changes.push(['weightage', goal.weightage, weightage]);
      if (title !== undefined && title !== goal.title) changes.push(['title', goal.title, title]);
      for (const [field, oldVal, newVal] of changes) {
        await pool.query(
          'INSERT INTO audit_log (goal_id,changed_by,field_changed,old_value,new_value,reason) VALUES ($1,$2,$3,$4,$5,$6)',
          [goalId, req.user.id, field, String(oldVal), String(newVal), reason || null]
        );
      }
    }

    const wasNotSubmitted = goal.status !== 'submitted';
    const becomingSubmitted = status === 'submitted';

    const updated = await pool.query(
      `UPDATE goals SET
        thrust_area=COALESCE($1,thrust_area), title=COALESCE($2,title),
        description=COALESCE($3,description), uom_type=COALESCE($4,uom_type),
        target_value=COALESCE($5::numeric,target_value), target_date=COALESCE($6::date,target_date),
        weightage=COALESCE($7::numeric,weightage), status=COALESCE($8,status), updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [
        thrust_area || null, title || null, description || null, uom_type || null,
        target_value !== '' && target_value != null ? target_value : null,
        target_date  !== '' && target_date  != null ? target_date  : null,
        weightage    !== '' && weightage    != null ? weightage    : null,
        status || null, goalId
      ]
    );

    // Send email when employee submits goals
    if (wasNotSubmitted && becomingSubmitted && req.user.role === 'employee') {
      // Find manager email
      const managerRes = await pool.query(
        'SELECT u2.email, u2.name, gc.name as cycle_name FROM users u1 JOIN users u2 ON u2.id=u1.manager_id JOIN goal_cycles gc ON gc.id=$1 WHERE u1.id=$2',
        [goal.cycle_id, req.user.id]
      );
      if (managerRes.rows.length) {
        const mgr = managerRes.rows[0];
        const tmpl = emails.goalSubmitted(req.user.name, mgr.email, mgr.name, mgr.cycle_name);
        sendMail(tmpl.to, tmpl.subject, tmpl.html);
      }
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('PUT /:id error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/goals/:id/approve — with email notification
// ─────────────────────────────────────────────────────────────
router.post('/:id/approve', authenticate, requireRole('manager', 'admin'), async (req, res) => {
  const goalId = parseInt(req.params.id);
  try {
    const goal = await pool.query('SELECT * FROM goals WHERE id=$1', [goalId]);
    if (!goal.rows.length) return res.status(404).json({ error: 'Goal not found' });
    const { employee_id, cycle_id } = goal.rows[0];

    const totalRes = await pool.query(
      `SELECT COALESCE(SUM(weightage),0) as total FROM goals WHERE employee_id=$1 AND cycle_id=$2 AND status IN ('approved','submitted')`,
      [employee_id, cycle_id]
    );
    const total = parseFloat(totalRes.rows[0].total);
    if (Math.abs(total - 100) > 0.01)
      return res.status(400).json({ error: `Cannot approve — total weightage is ${total.toFixed(1)}%, must be 100%.` });

    const result = await pool.query(
      `UPDATE goals SET status='approved', is_locked=TRUE, updated_at=NOW()
       WHERE employee_id=$1 AND cycle_id=$2 AND status='submitted' RETURNING *`,
      [employee_id, cycle_id]
    );

    // Send approval email to employee
    const empRes = await pool.query(
      'SELECT u.email, u.name, gc.name as cycle_name FROM users u JOIN goal_cycles gc ON gc.id=$1 WHERE u.id=$2',
      [cycle_id, employee_id]
    );
    if (empRes.rows.length) {
      const emp = empRes.rows[0];
      const tmpl = emails.goalApproved(emp.email, emp.name, req.user.name, emp.cycle_name);
      sendMail(tmpl.to, tmpl.subject, tmpl.html);
    }

    res.json({ approved: result.rows.length, goals: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/goals/:id/return — with email notification
// ─────────────────────────────────────────────────────────────
router.post('/:id/return', authenticate, requireRole('manager', 'admin'), async (req, res) => {
  const goalId = parseInt(req.params.id);
  const { comment } = req.body;
  try {
    const result = await pool.query(
      `UPDATE goals SET status='returned', is_locked=FALSE, return_comment=$1, updated_at=NOW()
       WHERE id=$2 AND status='submitted' RETURNING *`,
      [comment || null, goalId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Goal not found or not submitted' });

    const goal = result.rows[0];

    // Send return email to employee
    const empRes = await pool.query(
      'SELECT u.email, u.name, gc.name as cycle_name FROM users u JOIN goal_cycles gc ON gc.id=$1 WHERE u.id=$2',
      [goal.cycle_id, goal.employee_id]
    );
    if (empRes.rows.length) {
      const emp = empRes.rows[0];
      const tmpl = emails.goalReturned(emp.email, emp.name, req.user.name, goal.title, comment, emp.cycle_name);
      sendMail(tmpl.to, tmpl.subject, tmpl.html);
    }

    res.json(goal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/goals/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireRole('employee'), async (req, res) => {
  const goalId = parseInt(req.params.id);
  try {
    const check = await pool.query(
      'SELECT * FROM goals WHERE id=$1 AND employee_id=$2 AND status IN (\'draft\',\'returned\')',
      [goalId, req.user.id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Goal not found or cannot be deleted' });

    await pool.query('DELETE FROM audit_log        WHERE goal_id=$1', [goalId]);
    await pool.query('DELETE FROM checkin_comments WHERE goal_id=$1', [goalId]);
    await pool.query('DELETE FROM achievements      WHERE goal_id=$1', [goalId]);
    await pool.query('DELETE FROM goals             WHERE id=$1',      [goalId]);

    res.json({ message: 'Goal deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

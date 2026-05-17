-- ============================================================
-- GOAL TRACKER PORTAL — DATABASE SCHEMA
-- Run this file with: psql -U postgres -d goaltracker -f schema.sql
-- ============================================================


-- ============================================================
-- 1. USERS
-- Stores all employees, managers, and admins
-- ============================================================
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,           -- bcrypt hashed
  role        VARCHAR(20) NOT NULL             -- 'employee' | 'manager' | 'admin'
                CHECK (role IN ('employee', 'manager', 'admin')),
  manager_id  INTEGER REFERENCES users(id),   -- NULL for managers/admins
  department  VARCHAR(100),
  created_at  TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- 2. GOAL CYCLES
-- Admin controls when each phase is open/closed
-- ============================================================
CREATE TABLE goal_cycles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,           -- e.g. 'Q1 2025', 'Annual 2025'
  phase       VARCHAR(20) NOT NULL             -- 'goal_setting' | 'q1' | 'q2' | 'q3' | 'q4'
                CHECK (phase IN ('goal_setting', 'q1', 'q2', 'q3', 'q4')),
  opens_at    DATE NOT NULL,
  closes_at   DATE NOT NULL,
  is_active   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- 3. GOALS
-- One row per goal per employee
-- ============================================================
CREATE TABLE goals (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES users(id),
  cycle_id        INTEGER NOT NULL REFERENCES goal_cycles(id),

  thrust_area     VARCHAR(100) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,

  uom_type        VARCHAR(20) NOT NULL         -- unit of measurement type
                    CHECK (uom_type IN ('min', 'max', 'timeline', 'zero')),
  target_value    NUMERIC,                     -- numeric/% targets
  target_date     DATE,                        -- for timeline UoM
  weightage       NUMERIC NOT NULL,            -- must sum to 100 per employee per cycle

  status          VARCHAR(20) DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'approved', 'returned')),

  is_shared       BOOLEAN DEFAULT FALSE,       -- true = pushed by manager/admin
  shared_from     INTEGER REFERENCES goals(id), -- parent goal if shared
  is_locked       BOOLEAN DEFAULT FALSE,       -- locked after manager approval

  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- 4. ACHIEVEMENTS
-- Employee logs actual progress each quarter
-- ============================================================
CREATE TABLE achievements (
  id              SERIAL PRIMARY KEY,
  goal_id         INTEGER NOT NULL REFERENCES goals(id),
  cycle_phase     VARCHAR(20) NOT NULL         -- which quarter this entry is for
                    CHECK (cycle_phase IN ('q1', 'q2', 'q3', 'q4')),

  actual_value    NUMERIC,                     -- numeric/% achievement
  actual_date     DATE,                        -- for timeline UoM
  goal_status     VARCHAR(20) DEFAULT 'not_started'
                    CHECK (goal_status IN ('not_started', 'on_track', 'completed')),

  score           NUMERIC,                     -- computed by backend (0-100)
  updated_at      TIMESTAMP DEFAULT NOW(),

  UNIQUE (goal_id, cycle_phase)               -- one entry per goal per quarter
);


-- ============================================================
-- 5. CHECKIN COMMENTS
-- Manager adds structured feedback during quarterly check-ins
-- ============================================================
CREATE TABLE checkin_comments (
  id          SERIAL PRIMARY KEY,
  goal_id     INTEGER NOT NULL REFERENCES goals(id),
  manager_id  INTEGER NOT NULL REFERENCES users(id),
  cycle_phase VARCHAR(20) NOT NULL
                CHECK (cycle_phase IN ('q1', 'q2', 'q3', 'q4')),
  comment     TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- 6. AUDIT LOG
-- Tracks every change made to goals after they are locked
-- ============================================================
CREATE TABLE audit_log (
  id            SERIAL PRIMARY KEY,
  goal_id       INTEGER NOT NULL REFERENCES goals(id),
  changed_by    INTEGER NOT NULL REFERENCES users(id),
  field_changed VARCHAR(100) NOT NULL,         -- e.g. 'target_value', 'weightage'
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,                          -- admin must provide reason for unlock
  changed_at    TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- 7. SEED DATA — 3 demo users (one per role)
-- Passwords are all: Password123
-- bcrypt hash of "Password123" with 10 rounds
-- ============================================================
INSERT INTO users (name, email, password, role, department) VALUES
  ('Admin User',    'admin@company.com',    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin',    'HR'),
  ('Sara Manager',  'manager@company.com',  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'manager',  'Engineering'),
  ('John Employee', 'employee@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee', 'Engineering');

UPDATE users SET manager_id = (
  SELECT id FROM users WHERE email = 'manager@company.com'
) WHERE email = 'employee@company.com';

-- Seed an active goal-setting cycle
INSERT INTO goal_cycles (name, phase, opens_at, closes_at, is_active) VALUES
  ('Goal Setting 2026', 'goal_setting', '2026-01-01', '2026-12-31', TRUE);

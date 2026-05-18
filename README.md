# Goal Tracker Portal — AtomQuest Hackathon 1.0

A full-stack web portal for employee goal setting, approval, and quarterly achievement tracking. Built for the AtomQuest Hackathon 1.0 problem statement: **In-House Goal Setting & Tracking Portal**.

---

## Live Demo

**Frontend:** https://goal-tracker-nine-steel.vercel.app
**Backend API:** https://goal-tracker-f5iz.onrender.com


### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin / HR | admin@company.com | Password123 |
| Manager (L1) | manager@company.com | Password123 |
| Employee | employee@company.com | Password123 |

---

## Features Implemented

### Phase 1 — Goal Creation & Approval
- Employee goal sheet with thrust area, title, UoM, target, and weightage
- System-enforced validation rules:
  - Total weightage must equal 100%
  - Minimum 10% weightage per goal
  - Maximum 8 goals per employee per cycle
- Four UoM types: Numeric/% Higher is better (min), Numeric/% Lower is better (max), Timeline, Zero-based
- Manager (L1) approval workflow with inline editing
- Goals locked on approval — no edits without admin intervention
- Return for rework with manager comment shown to employee
- Shared Goals (KPI push) — manager or admin pushes a departmental KPI to multiple employees; recipients can only adjust weightage

### Phase 2 — Achievement Tracking & Quarterly Check-ins
- Quarterly achievement logging by employees (Q1–Q4)
- Status selection per goal: Not Started / On Track / Completed
- System-computed progress scores using the correct formula per UoM type:
  - Min: Achievement ÷ Target × 100
  - Max: Target ÷ Achievement × 100
  - Timeline: 100% if completed on or before deadline, else 0%
  - Zero: 100% if actual = 0, else 0%
- Manager check-in module with Planned vs Actual table view per quarter
- Structured check-in comments per goal per quarter

### Admin & Governance
- Cycle management — create, activate, and deactivate goal cycles
- Cycle picker on employee and manager dashboards (no data corruption on cycle switch)
- Goal unlock with mandatory reason — resets to submitted for manager action
- Full audit trail — every post-lock change logged with who, what, when, and why
- Completion dashboard — real-time view of employee goal status
- CSV export of all goals with planned vs actual data

### Bonus Features
- **Analytics Module (5.4)** — interactive charts including:
  - Goal distribution by thrust area (pie chart)
  - Goal status breakdown (bar chart)
  - Quarter-on-Quarter average score trend (line chart)
  - Individual employee scores by quarter (grouped bar chart)
  - Manager check-in effectiveness (horizontal bar chart)
  - Achievement score heatmap table (color-coded green/amber/red)
- **Email Notifications (5.2)** — automated emails on:
  - Goal submission → notifies manager
  - Goal approval → notifies employee
  - Goal returned for rework → notifies employee with manager's comment
  - KPI shared → notifies all recipients

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Recharts |
| Backend | Node.js, Express.js |
| Database | PostgreSQL 16 |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Email | Nodemailer (Gmail SMTP) |
| Hosting — Frontend | Vercel |
| Hosting — Backend | Render |
| Hosting — Database | Render PostgreSQL |
| Version Control | GitHub |

---

## Architecture

```
┌─────────────┐     HTTPS/JWT      ┌──────────────────┐
│   Browser   │ ─────────────────► │  Express API     │
│  React App  │ ◄───────────────── │  Render (free)   │
│  Vercel     │                    └────────┬─────────┘
└─────────────┘                             │ pg driver
                                            ▼
                                   ┌──────────────────┐
                                   │  PostgreSQL 16   │
                                   │  Render (free)   │
                                   └──────────────────┘
                                            │
                                   ┌──────────────────┐
                                   │  Gmail SMTP      │
                                   │  Email alerts    │
                                   └──────────────────┘
```

---

## Project Structure

```
goal-tracker/
├── backend/
│   ├── routes/
│   │   ├── auth.js          # Login, JWT
│   │   ├── goals.js         # Goal CRUD, approval, sharing
│   │   ├── checkins.js      # Achievement logging, check-in comments
│   │   └── admin.js         # Cycle management, audit log, analytics
│   ├── middleware/
│   │   └── auth.js          # JWT verification, role guard
│   ├── utils/
│   │   └── mailer.js        # Email notification utility
│   ├── db.js                # PostgreSQL connection pool
│   ├── index.js             # Express entry point
│   └── schema.sql           # Database schema + seed data
└── frontend/
    └── src/
        ├── pages/
        │   ├── Login.jsx
        │   ├── employee/
        │   │   └── GoalSheet.jsx        # Goal creation + achievement logging
        │   ├── manager/
        │   │   └── TeamGoals.jsx        # Approval + planned vs actual
        │   └── admin/
        │       ├── Dashboard.jsx        # Cycle mgmt, unlock, audit log
        │       └── Analytics.jsx        # Charts and heatmap
        ├── context/AuthContext.jsx      # Global auth state
        ├── components/ProtectedRoute.jsx
        └── api/axios.js                 # Axios with JWT interceptor
```

---

## Running Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 16

### 1. Clone the repository
```bash
git clone https://github.com/chanchal-2512/goal-tracker.git
cd goal-tracker
```

### 2. Set up the database
```bash
psql -U postgres -c "CREATE DATABASE goaltracker;"
psql -U postgres -d goaltracker -f backend/schema.sql
```

### 3. Configure backend environment
Create `backend/.env`:
```
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/goaltracker
JWT_SECRET=your_secret_key_here
PORT=5000

# Optional — for email notifications
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=your-16-char-app-password
```

### 4. Install and run backend
```bash
cd backend
npm install
npm run dev
```
Backend runs on http://localhost:5000

### 5. Install and run frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on http://localhost:5173

---

## Email Notifications Setup

The portal sends automated emails on key events. To enable:

1. Enable 2-Step Verification on your Google account
2. Go to myaccount.google.com → Security → App passwords
3. Generate an app password for Mail
4. Add to `backend/.env`:
   ```
   EMAIL_USER=yourgmail@gmail.com
   EMAIL_PASS=yoursixteencharapppassword
   ```
5. Update user emails in the database to real addresses
6. Restart the backend

If credentials are not configured, the system gracefully falls back to console logging — no crashes.

---

## User Journey Summary

### Employee
1. Log in → view active goal cycle
2. Add goals (thrust area, title, UoM, target, weightage)
3. Ensure total weightage = 100%, then submit for approval
4. After approval, log quarterly achievements (Q1–Q4)
5. View computed scores per quarter

### Manager
1. Log in → Goal Approval tab shows team's submitted goals
2. Review, edit inline if needed, approve all or return for rework
3. Check-in & Planned vs Actual tab — view achievement data per quarter
4. Add structured check-in comments per goal
5. Share departmental KPIs to team members via "+ Share KPI"

### Admin / HR
1. Log in → Overview tab shows completion dashboard and CSV export
2. Cycles tab — create and activate/deactivate quarterly cycles
3. Unlock Goals tab — unlock approved goals with a reason (audit-logged)
4. Audit Log tab — view all post-lock changes
5. Analytics tab (`/admin/analytics`) — charts and heatmap
6. Share KPIs to any employee across the organisation

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Employees, managers, admins with org hierarchy |
| `goal_cycles` | Quarterly windows managed by admin |
| `goals` | Employee goals with status, weightage, UoM |
| `achievements` | Actual values logged per goal per quarter |
| `checkin_comments` | Manager check-in notes per goal per quarter |
| `audit_log` | All post-lock goal changes with reason |

---

## Validation Rules Enforced

| Rule | Where enforced |
|------|---------------|
| Total weightage = 100% before submit | Frontend + Backend |
| Min 10% weightage per goal | Frontend + Backend |
| Max 8 goals per employee per cycle | Frontend + Backend |
| Goals locked after manager approval | Backend |
| Admin unlock requires reason | Backend |
| Shared goal title/target read-only for recipients | Backend |
| Manager approval requires total = 100% | Backend |
| Partial re-approval (after unlock) checks approved + submitted = 100% | Backend |

---

## Submission Details

- **Hackathon:** AtomQuest Hackathon 1.0
- **Problem Statement:** In-House Goal Setting & Tracking Portal
- **Team:** Akshintala Chanchal
- **Repository:** https://github.com/chanchal-2512/goal-tracker

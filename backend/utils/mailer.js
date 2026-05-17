// backend/utils/mailer.js
// Email notification utility using nodemailer
// Install: npm install nodemailer
// Add to .env: EMAIL_USER=yourgmail@gmail.com  EMAIL_PASS=your-app-password

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendMail = async (to, subject, html) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[Email skipped — no credentials] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"Goal Tracker" <${process.env.EMAIL_USER}>`,
      to, subject, html,
    });
    console.log(`[Email sent] To: ${to} | Subject: ${subject}`);
  } catch (err) {
    console.error(`[Email failed] To: ${to} | Error: ${err.message}`);
    // Don't throw — email failure should never break the main flow
  }
};

// ── Email templates ───────────────────────────────────────────

const emails = {
  goalSubmitted: (employeeName, managerEmail, managerName, cycleeName) => ({
    to:      managerEmail,
    subject: `[Goal Tracker] ${employeeName} has submitted goals for approval`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="color:#4f46e5;margin-bottom:4px">Goal Tracker</h2>
        <p style="color:#6b7280;font-size:13px;margin-top:0">${cycleeName}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p>Hi ${managerName},</p>
        <p><strong>${employeeName}</strong> has submitted their goals and is awaiting your approval.</p>
        <a href="http://localhost:5173/manager"
           style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;margin:16px 0">
          Review goals →
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Goal Tracker · Automated notification</p>
      </div>
    `,
  }),

  goalApproved: (employeeEmail, employeeName, managerName, cycleeName) => ({
    to:      employeeEmail,
    subject: `[Goal Tracker] Your goals have been approved`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="color:#4f46e5;margin-bottom:4px">Goal Tracker</h2>
        <p style="color:#6b7280;font-size:13px;margin-top:0">${cycleeName}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p>Hi ${employeeName},</p>
        <p>Great news! <strong>${managerName}</strong> has approved your goals. They are now locked and you can begin tracking progress.</p>
        <a href="http://localhost:5173/employee"
           style="display:inline-block;background:#16a34a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;margin:16px 0">
          View your goals →
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Goal Tracker · Automated notification</p>
      </div>
    `,
  }),

  goalReturned: (employeeEmail, employeeName, managerName, goalTitle, comment, cycleeName) => ({
    to:      employeeEmail,
    subject: `[Goal Tracker] A goal has been returned for rework`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="color:#4f46e5;margin-bottom:4px">Goal Tracker</h2>
        <p style="color:#6b7280;font-size:13px;margin-top:0">${cycleeName}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p>Hi ${employeeName},</p>
        <p><strong>${managerName}</strong> has returned the goal <em>"${goalTitle}"</em> for rework.</p>
        ${comment ? `
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin:16px 0">
            <p style="margin:0;font-size:13px;color:#b91c1c"><strong>Manager's note:</strong> ${comment}</p>
          </div>
        ` : ''}
        <p>Please edit and resubmit this goal at your earliest convenience.</p>
        <a href="http://localhost:5173/employee"
           style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;margin:16px 0">
          Edit goal →
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Goal Tracker · Automated notification</p>
      </div>
    `,
  }),

  checkinReminder: (employeeEmail, employeeName, quarter, cycleeName) => ({
    to:      employeeEmail,
    subject: `[Goal Tracker] Reminder: ${quarter} check-in window is open`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="color:#4f46e5;margin-bottom:4px">Goal Tracker</h2>
        <p style="color:#6b7280;font-size:13px;margin-top:0">${cycleeName}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p>Hi ${employeeName},</p>
        <p>The <strong>${quarter} check-in window</strong> is now open. Please log your actual achievement against your planned targets.</p>
        <a href="http://localhost:5173/employee"
           style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;margin:16px 0">
          Log achievement →
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Goal Tracker · Automated notification</p>
      </div>
    `,
  }),

  kpiShared: (employeeEmail, employeeName, senderName, goalTitle, cycleeName) => ({
    to:      employeeEmail,
    subject: `[Goal Tracker] A KPI has been shared with you`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="color:#4f46e5;margin-bottom:4px">Goal Tracker</h2>
        <p style="color:#6b7280;font-size:13px;margin-top:0">${cycleeName}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p>Hi ${employeeName},</p>
        <p><strong>${senderName}</strong> has shared a departmental KPI with you: <em>"${goalTitle}"</em>.</p>
        <p>Please set your weightage for this goal on your dashboard.</p>
        <a href="http://localhost:5173/employee"
           style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;margin:16px 0">
          Set weightage →
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">Goal Tracker · Automated notification</p>
      </div>
    `,
  }),
};

module.exports = { sendMail, emails };

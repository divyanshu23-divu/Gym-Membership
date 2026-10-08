const db = require('../../database/db');
const { calculateStreak } = require('../utils/helpers');

/**
 * Mark member check-in (Admin or Member self check-in)
 * Enforces UNIQUE(member_id, date)
 */
function markCheckIn(req, res) {
  let memberId = req.body.member_id;

  // If member is calling endpoint directly
  if (req.user.role === 'member') {
    memberId = req.user.memberId;
  }

  if (!memberId) {
    return res.status(400).json({ success: false, message: 'Member ID is required.' });
  }

  const member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(memberId);
  if (!member) {
    return res.status(404).json({ success: false, message: 'Member not found.' });
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0];

  try {
    const result = db.prepare(`
      INSERT INTO attendance (member_id, date, check_in_time)
      VALUES (?, ?, ?)
    `).run(memberId, todayStr, timeStr);

    return res.status(201).json({
      success: true,
      message: `Check-in recorded for ${member.name} at ${timeStr}.`,
      data: {
        attendanceId: result.lastInsertRowid,
        memberId: member.id,
        memberName: member.name,
        date: todayStr,
        checkInTime: timeStr
      }
    });
  } catch (err) {
    // Check for SQLite UNIQUE constraint error
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      const existing = db.prepare('SELECT check_in_time FROM attendance WHERE member_id = ? AND date = ?').get(memberId, todayStr);
      const timeMsg = existing ? ` at ${existing.check_in_time}` : '';
      return res.status(400).json({
        success: false,
        message: `${member.name} has already checked in today${timeMsg}. Duplicate check-ins are not allowed.`
      });
    }
    console.error('Attendance error:', err);
    return res.status(500).json({ success: false, message: 'Failed to record attendance.' });
  }
}

/**
 * Get member's own attendance history, streak, and calendar days
 */
function getMemberAttendance(req, res) {
  const memberId = req.user.memberId;
  if (!memberId) {
    return res.status(404).json({ success: false, message: 'Member profile not found.' });
  }

  const monthParam = req.query.month; // Optional YYYY-MM
  const now = new Date();
  const currentYearMonth = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const allAttendance = db.prepare(`
    SELECT id, date, check_in_time
    FROM attendance
    WHERE member_id = ?
    ORDER BY date DESC
  `).all(memberId);

  const allDates = allAttendance.map(a => a.date);
  const streak = calculateStreak(allDates);

  // Month-filtered attendance
  const monthAttendance = allAttendance.filter(a => a.date.startsWith(currentYearMonth));
  const attendedDatesInMonth = monthAttendance.map(a => a.date);

  // Calculate monthly percentage
  const [yr, mo] = currentYearMonth.split('-').map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const daysElapsedInMonth = (yr === now.getFullYear() && (mo - 1) === now.getMonth()) ? now.getDate() : daysInMonth;
  const attendanceRate = Math.min(100, Math.round((monthAttendance.length / daysElapsedInMonth) * 100));

  return res.json({
    success: true,
    data: {
      streak,
      month: currentYearMonth,
      monthCheckinCount: monthAttendance.length,
      daysElapsedInMonth,
      monthlyPercentage: attendanceRate,
      attendedDates: attendedDatesInMonth,
      history: allAttendance.slice(0, 30) // last 30 records
    }
  });
}

/**
 * Admin view: Today's check-ins list
 */
function getTodayCheckins(req, res) {
  const todayStr = new Date().toISOString().split('T')[0];

  const checkins = db.prepare(`
    SELECT a.id, a.check_in_time, a.date, m.id as member_id, m.name as member_name,
           m.phone, m.fitness_goal, p.name as plan_name
    FROM attendance a
    JOIN members m ON a.member_id = m.id
    LEFT JOIN memberships ms ON ms.member_id = m.id
    LEFT JOIN plans p ON ms.plan_id = p.id
    WHERE a.date = ?
    ORDER BY a.check_in_time DESC
  `).all(todayStr);

  return res.json({ success: true, count: checkins.length, data: checkins });
}

module.exports = {
  markCheckIn,
  getMemberAttendance,
  getTodayCheckins
};

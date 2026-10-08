const db = require('../../database/db');
const { calculateMembershipDetails, calculateStreak, calculateBMIAndCalories } = require('../utils/helpers');

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Fetch consolidated data for Member Dashboard
 */
function getDashboard(req, res) {
  const memberId = req.user.memberId;
  if (!memberId) {
    return res.status(404).json({ success: false, message: 'Member profile not found.' });
  }

  // 1. Member profile & membership info
  const member = db.prepare(`
    SELECT m.*, t.name as trainer_name, t.specialization as trainer_spec,
           ms.start_date, ms.end_date, ms.status as membership_status,
           p.id as plan_id, p.name as plan_name, p.duration_days, p.price
    FROM members m
    LEFT JOIN trainers t ON m.trainer_id = t.id
    LEFT JOIN memberships ms ON ms.member_id = m.id
    LEFT JOIN plans p ON ms.plan_id = p.id
    WHERE m.id = ?
    ORDER BY ms.id DESC
    LIMIT 1
  `).get(memberId);

  if (!member) {
    return res.status(404).json({ success: false, message: 'Member record not found.' });
  }

  // 2. Dynamic Membership Countdown
  const countdown = calculateMembershipDetails(member.start_date, member.end_date, member.plan_name);

  // 3. Attendance records and streak calculation
  const attendanceRows = db.prepare(`
    SELECT date FROM attendance WHERE member_id = ? ORDER BY date DESC
  `).all(memberId);
  const attendanceDates = attendanceRows.map(r => r.date);
  const streak = calculateStreak(attendanceDates);

  // Monthly attendance % calculation
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyCheckins = attendanceDates.filter(d => d.startsWith(currentYearMonth)).length;
  const daysElapsedInMonth = Math.max(1, now.getDate());
  const monthlyAttendancePercent = Math.min(100, Math.round((monthlyCheckins / daysElapsedInMonth) * 100));

  // Check if checked in today
  const todayStr = now.toISOString().split('T')[0];
  const checkedInToday = attendanceDates.includes(todayStr);

  // 4. Today's Workout
  const currentDayName = DAYS_OF_WEEK[now.getDay()];
  const workoutPlan = db.prepare(`
    SELECT id, title, category FROM workout_plans
    WHERE assigned_to_member_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(memberId);

  let todaysExercises = [];
  if (workoutPlan) {
    todaysExercises = db.prepare(`
      SELECT id, exercise_name, sets, reps, notes
      FROM workout_exercises
      WHERE workout_plan_id = ? AND day_of_week = ?
    `).all(workoutPlan.id, currentDayName);
  }

  // 5. Health & Calorie Targets
  const healthMetrics = calculateBMIAndCalories(
    member.height_cm,
    member.weight_kg,
    member.age || 25,
    member.gender || 'male',
    member.fitness_goal
  );

  // 6. Recent Notifications (Top 5)
  const notifications = db.prepare(`
    SELECT id, title, message, type, is_read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY id DESC LIMIT 5
  `).all(req.user.id);

  // 7. Announcements (Top 3)
  const announcements = db.prepare(`
    SELECT a.id, a.title, a.content, a.priority, a.created_at, u.email as author_email
    FROM announcements a
    LEFT JOIN users u ON a.author_id = u.id
    ORDER BY a.priority DESC, a.id DESC LIMIT 3
  `).all();

  // 8. Pending renewal request check
  const pendingRenewal = db.prepare(`
    SELECT r.id, r.plan_id, p.name as plan_name, r.request_date
    FROM renewal_requests r
    JOIN plans p ON r.plan_id = p.id
    WHERE r.member_id = ? AND r.status = 'pending'
    ORDER BY r.id DESC LIMIT 1
  `).get(memberId);

  return res.json({
    success: true,
    data: {
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        age: member.age,
        gender: member.gender,
        height_cm: member.height_cm,
        weight_kg: member.weight_kg,
        fitness_goal: member.fitness_goal,
        avatar_url: member.avatar_url,
        trainer_name: member.trainer_name,
        trainer_spec: member.trainer_spec
      },
      countdown,
      attendance: {
        streak,
        monthlyCheckins,
        monthlyAttendancePercent,
        totalCheckins: attendanceDates.length,
        checkedInToday
      },
      workout: {
        dayName: currentDayName,
        planTitle: workoutPlan ? workoutPlan.title : 'Standard Routine',
        category: workoutPlan ? workoutPlan.category : 'General',
        exercises: todaysExercises
      },
      health: healthMetrics,
      notifications,
      announcements,
      pendingRenewal: pendingRenewal || null
    }
  });
}

/**
 * Update member profile metrics
 */
function updateProfile(req, res) {
  const memberId = req.user.memberId;
  const { name, phone, age, gender, height_cm, weight_kg, fitness_goal, avatar_url } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Name is required.' });
  }

  const currentMember = db.prepare('SELECT weight_kg FROM members WHERE id = ?').get(memberId);

  db.prepare(`
    UPDATE members
    SET name = ?, phone = ?, age = ?, gender = ?, height_cm = ?, weight_kg = ?, fitness_goal = ?, avatar_url = ?
    WHERE id = ?
  `).run(
    name,
    phone || null,
    age ? parseInt(age, 10) : null,
    gender || 'male',
    height_cm ? parseFloat(height_cm) : null,
    weight_kg ? parseFloat(weight_kg) : null,
    fitness_goal || 'General Fitness',
    avatar_url || null,
    memberId
  );

  // If weight changed significantly, insert a progress log
  if (weight_kg && currentMember && currentMember.weight_kg !== parseFloat(weight_kg)) {
    const todayStr = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO progress_logs (member_id, log_date, weight_kg, notes)
      VALUES (?, ?, ?, 'Profile update')
    `).run(memberId, todayStr, parseFloat(weight_kg));
  }

  return res.json({ success: true, message: 'Profile updated successfully.' });
}

module.exports = {
  getDashboard,
  updateProfile
};

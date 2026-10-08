const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'ironpulse.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Remove existing DB if rebuilding clean
if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log('🗑️ Cleaned previous ironpulse.db');
  } catch (err) {
    // ignore if locked
  }
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Execute fresh schema
console.log('🔄 Executing schema.sql...');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// Date formatting helper (YYYY-MM-DD)
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const today = new Date();
const todayStr = today.toISOString().split('T')[0];

console.log(`📅 Current system date: ${todayStr}`);

// Pre-compute common password hashes
const adminHash = bcrypt.hashSync('admin123', 10);
const memberHash = bcrypt.hashSync('member123', 10);

const insertUser = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)');
const insertTrainer = db.prepare('INSERT INTO trainers (name, email, phone, specialization, bio, avatar_url) VALUES (?, ?, ?, ?, ?, ?)');
const insertMember = db.prepare(`
  INSERT INTO members (user_id, trainer_id, name, phone, age, gender, height_cm, weight_kg, fitness_goal, avatar_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPlan = db.prepare('INSERT INTO plans (name, duration_days, price, description) VALUES (?, ?, ?, ?)');
const insertMembership = db.prepare('INSERT INTO memberships (member_id, plan_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)');
const insertPayment = db.prepare('INSERT INTO payments (member_id, plan_id, amount, payment_method, transaction_id, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertAttendance = db.prepare('INSERT INTO attendance (member_id, date, check_in_time) VALUES (?, ?, ?)');
const insertWorkoutPlan = db.prepare('INSERT INTO workout_plans (title, category, description, is_template, assigned_to_member_id) VALUES (?, ?, ?, ?, ?)');
const insertExercise = db.prepare('INSERT INTO workout_exercises (workout_plan_id, day_of_week, exercise_name, sets, reps, notes) VALUES (?, ?, ?, ?, ?, ?)');
const insertProgress = db.prepare('INSERT INTO progress_logs (member_id, log_date, weight_kg, chest_cm, waist_cm, biceps_cm, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertNotification = db.prepare('INSERT INTO notifications (user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, ?)');
const insertAnnouncement = db.prepare('INSERT INTO announcements (title, content, author_id, priority) VALUES (?, ?, ?, ?)');
const insertFeedback = db.prepare('INSERT INTO feedback (member_id, trainer_id, rating, comment) VALUES (?, ?, ?, ?)');
const insertRenewal = db.prepare('INSERT INTO renewal_requests (member_id, plan_id, status, notes) VALUES (?, ?, ?, ?)');

const seedTransaction = db.transaction(() => {
  // 1. Create Admin
  const adminUser = insertUser.run('admin@gym.com', adminHash, 'admin');
  const adminUserId = adminUser.lastInsertRowid;

  // 2. Create 2 Trainers
  const t1 = insertTrainer.run('Alex Vance', 'alex.trainer@gym.com', '+1-555-0101', 'Strength & Hypertrophy', 'CSCS Certified, 8 years elite coaching experience in progressive overload.', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80');
  const t2 = insertTrainer.run('Marcus Sterling', 'marcus.trainer@gym.com', '+1-555-0102', 'Fat Loss & Athletic Conditioning', 'Former track coach specializing in high-intensity metabolic conditioning and body recomposition.', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80');

  // 3. Create Subscription Plans
  const p1 = insertPlan.run('Monthly Starter', 30, 49.99, 'Full gym access, locker room, free fitness assessment.');
  const p2 = insertPlan.run('Quarterly Pro', 90, 129.99, 'All Starter features + 2 trainer consults & nutrition guide.');
  const p3 = insertPlan.run('Half-Yearly Elite', 180, 229.99, 'Unlimited access, free protein shakes monthly, bi-weekly progress scans.');
  const p4 = insertPlan.run('Annual Champion', 365, 399.99, 'Best value! All-inclusive VIP pass, dedicated locker & personalized workout routine.');

  // 4. Workout Plan Templates
  const wp1 = insertWorkoutPlan.run('Beginner Full Body Foundation', 'Beginner', '3-day split designed for neuromuscular adaptation and posture.', 1, null);
  const wp2 = insertWorkoutPlan.run('Hypertrophy Push-Pull-Legs', 'Muscle Gain', 'High volume hypertrophy protocol for maximum muscle growth.', 1, null);
  const wp3 = insertWorkoutPlan.run('HIIT & Metabolic Shred', 'Weight Loss', 'High tempo circuit designed for rapid caloric burn and cardiovascular health.', 1, null);

  // Exercises for templates
  const tplExercises = [
    // wp1 Beginner
    [wp1.lastInsertRowid, 'Monday', 'Goblet Squat', 3, '10-12', 'Focus on keeping chest upright'],
    [wp1.lastInsertRowid, 'Monday', 'Dumbbell Bench Press', 3, '10-12', 'Retract scapula, slow eccentric'],
    [wp1.lastInsertRowid, 'Monday', 'Lat Pulldown', 3, '12-15', 'Full stretch at top'],
    [wp1.lastInsertRowid, 'Wednesday', 'Romanian Deadlift', 3, '10', 'Hinge at the hips, flat back'],
    [wp1.lastInsertRowid, 'Wednesday', 'Seated Cable Row', 3, '12', 'Squeeze lats for 1 second'],
    [wp1.lastInsertRowid, 'Wednesday', 'Overhead Dumbbell Press', 3, '10', 'Keep core braced'],
    [wp1.lastInsertRowid, 'Friday', 'Leg Press', 3, '12-15', 'Do not lock knees at top'],
    [wp1.lastInsertRowid, 'Friday', 'Push-ups', 3, 'Max reps', 'Body in straight line'],
    [wp1.lastInsertRowid, 'Friday', 'Plank', 3, '45 sec hold', 'Breathe steadily'],

    // wp2 Hypertrophy
    [wp2.lastInsertRowid, 'Monday', 'Barbell Incline Bench Press', 4, '8-10', 'Explosive press, 2-sec eccentric'],
    [wp2.lastInsertRowid, 'Monday', 'Dumbbell Shoulder Press', 3, '10-12', 'Elbows slightly tucked'],
    [wp2.lastInsertRowid, 'Monday', 'Triceps Rope Pushdown', 4, '12-15', 'Flared ropes at bottom'],
    [wp2.lastInsertRowid, 'Tuesday', 'Barbell Bent Over Row', 4, '8-10', 'Underhand grip'],
    [wp2.lastInsertRowid, 'Tuesday', 'Pull-Ups / Lat Pulldown', 4, '8-12', 'Controlled tempo'],
    [wp2.lastInsertRowid, 'Tuesday', 'Incline Dumbbell Curl', 3, '10-12', 'Supinate forearms'],
    [wp2.lastInsertRowid, 'Thursday', 'Barbell Back Squat', 4, '6-8', 'Hit parallel depth'],
    [wp2.lastInsertRowid, 'Thursday', 'Hamstring Leg Curls', 4, '10-12', 'Full contraction'],
    [wp2.lastInsertRowid, 'Thursday', 'Standing Calf Raises', 4, '15-20', 'Pause at peak'],

    // wp3 HIIT
    [wp3.lastInsertRowid, 'Monday', 'Kettlebell Swings', 4, '20 reps', 'Hinge power from glutes'],
    [wp3.lastInsertRowid, 'Monday', 'Burpees', 4, '15 reps', 'High intensity pace'],
    [wp3.lastInsertRowid, 'Monday', 'Rowing Machine Sprint', 4, '250m', 'Sub 50-second pace'],
    [wp3.lastInsertRowid, 'Wednesday', 'Battle Ropes', 4, '30 sec', 'Alternating waves'],
    [wp3.lastInsertRowid, 'Wednesday', 'Box Jumps', 4, '12 reps', 'Step down carefully'],
    [wp3.lastInsertRowid, 'Wednesday', 'Medicine Ball Slams', 4, '15 reps', 'Triple extension slam'],
    [wp3.lastInsertRowid, 'Friday', 'Assault Bike Sprint', 5, '30s on / 30s off', 'All out effort'],
    [wp3.lastInsertRowid, 'Friday', 'Hanging Knee Raises', 4, '15 reps', 'Engage deep core']
  ];

  for (const ex of tplExercises) {
    insertExercise.run(...ex);
  }

  // 5. 15 Realistic Members with specific days-left states
  // Member definition: [name, email, planId, daysRemaining, trainerId, age, gender, height, weight, goal]
  const membersSpec = [
    // 4 Active (>15 days left) - Green
    ['Sarah Connor', 'sarah.member@gym.com', p4.lastInsertRowid, 240, t1.lastInsertRowid, 29, 'female', 168, 62, 'Athletic Conditioning', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80'],
    ['David Miller', 'david.member@gym.com', p3.lastInsertRowid, 85, t1.lastInsertRowid, 34, 'male', 182, 88, 'Muscle Gain', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80'],
    ['Elena Rostova', 'elena.member@gym.com', p2.lastInsertRowid, 42, t2.lastInsertRowid, 26, 'female', 170, 58, 'Fat Loss & Toning', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80'],
    ['Kevin Hart', 'kevin.member@gym.com', p1.lastInsertRowid, 21, t2.lastInsertRowid, 31, 'male', 172, 74, 'General Fitness', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=300&q=80'],

    // 3 Expiring in 7–15 days - Orange
    ['Rachel Green', 'rachel.member@gym.com', p2.lastInsertRowid, 14, t2.lastInsertRowid, 28, 'female', 165, 56, 'Toning', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80'],
    ['Michael Scott', 'michael.member@gym.com', p1.lastInsertRowid, 10, t1.lastInsertRowid, 42, 'male', 175, 82, 'Weight Loss', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&q=80'],
    ['Pam Beesly', 'pam.member@gym.com', p3.lastInsertRowid, 8, t2.lastInsertRowid, 30, 'female', 166, 60, 'Cardio & Flexibility', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'],

    // 4 Expiring in <7 days - Red + Banner
    // Alex Mercer: PRIMARY DEMO USER! (3 days left)
    ['Alex Mercer', 'alex.member@gym.com', p1.lastInsertRowid, 3, t1.lastInsertRowid, 27, 'male', 178, 76, 'Strength & Muscle Gain', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80'],
    ['Bruce Wayne', 'bruce.member@gym.com', p1.lastInsertRowid, 2, t1.lastInsertRowid, 35, 'male', 188, 95, 'Functional Strength', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&q=80'],
    ['Diana Prince', 'diana.member@gym.com', p2.lastInsertRowid, 5, t2.lastInsertRowid, 29, 'female', 179, 68, 'Powerlifting', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=300&q=80'],
    ['Peter Parker', 'peter.member@gym.com', p1.lastInsertRowid, 1, t2.lastInsertRowid, 22, 'male', 173, 67, 'Agility & Calisthenics', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80'],

    // 4 Expired - Grey
    ['Arthur Dent', 'arthur.member@gym.com', p1.lastInsertRowid, -5, t1.lastInsertRowid, 38, 'male', 176, 80, 'Stress Relief', 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=300&q=80'],
    ['Walter White', 'walter.member@gym.com', p2.lastInsertRowid, -18, t2.lastInsertRowid, 52, 'male', 180, 78, 'Health Recovery', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=300&q=80'],
    ['John Doe', 'john.member@gym.com', p1.lastInsertRowid, -45, t1.lastInsertRowid, 33, 'male', 177, 85, 'General Fitness', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80'],
    ['Jane Smith', 'jane.member@gym.com', p4.lastInsertRowid, -90, t2.lastInsertRowid, 28, 'female', 163, 55, 'Weight Loss', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80']
  ];

  const planDurations = {
    [p1.lastInsertRowid]: 30,
    [p2.lastInsertRowid]: 90,
    [p3.lastInsertRowid]: 180,
    [p4.lastInsertRowid]: 365
  };

  const planPrices = {
    [p1.lastInsertRowid]: 49.99,
    [p2.lastInsertRowid]: 129.99,
    [p3.lastInsertRowid]: 229.99,
    [p4.lastInsertRowid]: 399.99
  };

  const memberIds = [];

  for (let i = 0; i < membersSpec.length; i++) {
    const [name, email, planId, daysRemaining, trainerId, age, gender, height, weight, goal, avatar] = membersSpec[i];

    // Create user account
    const uRes = insertUser.run(email, memberHash, 'member');
    const userId = uRes.lastInsertRowid;

    // Create member profile
    const mRes = insertMember.run(
      userId,
      trainerId,
      name,
      `+1-555-01${(10 + i).toString().padStart(2, '0')}`,
      age,
      gender,
      height,
      weight,
      goal,
      avatar
    );
    const memberId = mRes.lastInsertRowid;
    memberIds.push({ memberId, userId, name, email, planId, daysRemaining });

    // Calculate start & end date based on daysRemaining
    const planDuration = planDurations[planId];
    const endDateStr = addDays(today, daysRemaining);
    const startDateStr = addDays(endDateStr, -planDuration);
    const status = daysRemaining > 0 ? 'active' : 'expired';

    // Insert membership
    insertMembership.run(memberId, planId, startDateStr, endDateStr, status);

    // Insert simulated payment
    const txnId = `TXN-SEED-${1000 + i}-${Date.now().toString().slice(-4)}`;
    insertPayment.run(memberId, planId, planPrices[planId], 'Credit Card (Simulated)', txnId, startDateStr + ' 10:30:00', 'completed');

    // Create personalized workout plan copy
    const targetTemplateId = (i % 3 === 0) ? wp2.lastInsertRowid : ((i % 3 === 1) ? wp3.lastInsertRowid : wp1.lastInsertRowid);
    const categoryName = (i % 3 === 0) ? 'Muscle Gain' : ((i % 3 === 1) ? 'Weight Loss' : 'Beginner');
    const userWorkout = insertWorkoutPlan.run(`${name}'s ${categoryName} Routine`, categoryName, `Personalized plan created by Coach`, 0, memberId);

    // Copy exercises for this user
    const tplRows = db.prepare('SELECT day_of_week, exercise_name, sets, reps, notes FROM workout_exercises WHERE workout_plan_id = ?').all(targetTemplateId);
    for (const r of tplRows) {
      insertExercise.run(userWorkout.lastInsertRowid, r.day_of_week, r.exercise_name, r.sets, r.reps, r.notes);
    }

    // Progress logs (give members 3-4 progress entries to plot Chart.js line graph)
    const baseWeight = weight;
    for (let pIdx = 4; pIdx >= 0; pIdx--) {
      const pDate = addDays(today, -(pIdx * 7));
      const pWeight = +(baseWeight + (pIdx * (goal.includes('Loss') ? 0.6 : -0.4))).toFixed(1);
      const pChest = +(98 - pIdx * 0.2).toFixed(1);
      const pWaist = +(82 - pIdx * 0.3).toFixed(1);
      const pBiceps = +(36 + pIdx * 0.1).toFixed(1);
      insertProgress.run(memberId, pDate, pWeight, pChest, pWaist, pBiceps, pIdx === 0 ? 'Current check-in' : 'Weekly check');
    }

    // Attendance seed: Give members attendance on recent days for streak visualization
    // We will mark attendance for the last 14 days with some variation
    const attendanceFrequency = (i % 4 === 0) ? 0.9 : ((i % 4 === 1) ? 0.75 : 0.6);
    for (let dayOffset = 14; dayOffset >= 1; dayOffset--) {
      // Deterministic check to create consistent streaks
      if (((dayOffset + i * 3) % 7 !== 0) && Math.random() < attendanceFrequency) {
        const attDate = addDays(today, -dayOffset);
        insertAttendance.run(memberId, attDate, '08:45:00');
      }
    }
    // Check in today for the first 5 active members
    if (i < 5) {
      insertAttendance.run(memberId, todayStr, '07:30:00');
    }

    // Notifications
    if (daysRemaining <= 7 && daysRemaining > 0) {
      insertNotification.run(userId, 'Membership Expiring Soon!', `Your ${planDurations[planId]}-day plan expires in ${daysRemaining} day(s). Tap Renew Now to keep your streak going!`, 'warning', 0);
    } else if (daysRemaining <= 0) {
      insertNotification.run(userId, 'Membership Expired', 'Your gym membership has expired. Renew today to regain full gym and locker access.', 'warning', 0);
    } else {
      insertNotification.run(userId, 'Welcome to IronPulse', 'Your membership is active! Check your daily workout schedule and track your attendance.', 'info', 1);
    }

    // Feedback
    if (i % 3 === 0) {
      insertFeedback.run(memberId, trainerId, 5, 'Outstanding trainers and high quality equipment! Loved the workout split.');
    } else if (i % 3 === 1) {
      insertFeedback.run(memberId, trainerId, 4, 'Great vibe, clean locker rooms. Would love 24/7 access option.');
    }
  }

  // 6. Renewal Requests (seed 2 pending renewals for admin to test approval)
  const alexMember = memberIds.find(m => m.email === 'alex.member@gym.com');
  const peterMember = memberIds.find(m => m.email === 'peter.member@gym.com');
  if (alexMember) {
    insertRenewal.run(alexMember.memberId, p2.lastInsertRowid, 'pending', 'Requesting upgrade to Quarterly Pro plan.');
  }
  if (peterMember) {
    insertRenewal.run(peterMember.memberId, p1.lastInsertRowid, 'pending', 'Monthly renewal request via student concession.');
  }

  // 7. General Announcements
  insertAnnouncement.run('🔥 Annual Deadlift & Bench Championship', 'IronPulse is hosting its annual strength meet on the 25th of this month! Register at the front desk. Prizes for open and novice divisions.', adminUserId, 'urgent');
  insertAnnouncement.run('🕒 Holiday Hours Update', 'The gym will operate from 6:00 AM to 1:00 PM on national holidays. Evening group classes will resume next business day.', adminUserId, 'normal');
  insertAnnouncement.run('🥗 New Smoothies at the Shake Bar', 'Try our high-protein Whey Isolate berry smoothie, now available after 7:00 AM at the juice counter.', adminUserId, 'normal');
});

seedTransaction();

console.log('✅ IronPulse Database successfully seeded!');
console.log('----------------------------------------------------');
console.log('🔑 ADMIN LOGIN CREDENTIALS:');
console.log('   Email:    admin@gym.com');
console.log('   Password: admin123');
console.log('');
console.log('👤 MEMBER DEMO ACCOUNTS (Password for all: member123):');
console.log('   1. alex.member@gym.com   -> Expiring in 3 days (Red Countdown + Alert Banner)');
console.log('   2. rachel.member@gym.com -> Expiring in 14 days (Orange Countdown)');
console.log('   3. sarah.member@gym.com  -> Active with 240 days left (Green Countdown)');
console.log('   4. arthur.member@gym.com -> Expired 5 days ago (Grey Badge)');
console.log('----------------------------------------------------');

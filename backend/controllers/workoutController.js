const db = require('../../database/db');

/**
 * Get member's assigned workout plan with exercises grouped by day
 */
function getMemberWorkout(req, res) {
  let memberId = req.user.memberId;
  if (req.user.role === 'admin' && req.query.member_id) {
    memberId = parseInt(req.query.member_id, 10);
  }

  if (!memberId) {
    return res.status(400).json({ success: false, message: 'Member ID required.' });
  }

  const plan = db.prepare(`
    SELECT * FROM workout_plans
    WHERE assigned_to_member_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(memberId);

  if (!plan) {
    // Return standard template if no custom plan assigned
    const fallbackTemplate = db.prepare('SELECT * FROM workout_plans WHERE is_template = 1 LIMIT 1').get();
    if (!fallbackTemplate) {
      return res.json({ success: true, data: null });
    }
    const exercises = db.prepare('SELECT * FROM workout_exercises WHERE workout_plan_id = ? ORDER BY id ASC').all(fallbackTemplate.id);
    return res.json({
      success: true,
      data: {
        ...fallbackTemplate,
        exercises
      }
    });
  }

  const exercises = db.prepare(`
    SELECT * FROM workout_exercises
    WHERE workout_plan_id = ?
    ORDER BY CASE day_of_week
      WHEN 'Monday' THEN 1
      WHEN 'Tuesday' THEN 2
      WHEN 'Wednesday' THEN 3
      WHEN 'Thursday' THEN 4
      WHEN 'Friday' THEN 5
      WHEN 'Saturday' THEN 6
      WHEN 'Sunday' THEN 7
      ELSE 8
    END, id ASC
  `).all(plan.id);

  return res.json({
    success: true,
    data: {
      ...plan,
      exercises
    }
  });
}

/**
 * Admin: Get all pre-built workout templates
 */
function getWorkoutTemplates(req, res) {
  const templates = db.prepare('SELECT * FROM workout_plans WHERE is_template = 1 ORDER BY id ASC').all();
  const templatesWithExercises = templates.map(t => {
    const exercises = db.prepare('SELECT * FROM workout_exercises WHERE workout_plan_id = ? ORDER BY id ASC').all(t.id);
    return { ...t, exercises };
  });

  return res.json({ success: true, data: templatesWithExercises });
}

/**
 * Admin: Assign a workout template to a member
 */
function assignWorkoutTemplate(req, res) {
  const { member_id, template_id } = req.body;

  if (!member_id || !template_id) {
    return res.status(400).json({ success: false, message: 'Member ID and Template ID are required.' });
  }

  const member = db.prepare('SELECT id, user_id, name FROM members WHERE id = ?').get(member_id);
  const template = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(template_id);

  if (!member || !template) {
    return res.status(404).json({ success: false, message: 'Member or Workout Template not found.' });
  }

  const assignTx = db.transaction(() => {
    // Check if member already has a personal plan, delete previous exercises
    const existingPlan = db.prepare('SELECT id FROM workout_plans WHERE assigned_to_member_id = ?').get(member_id);
    let planId;

    if (existingPlan) {
      db.prepare('DELETE FROM workout_exercises WHERE workout_plan_id = ?').run(existingPlan.id);
      db.prepare('UPDATE workout_plans SET title = ?, category = ?, description = ? WHERE id = ?').run(
        `${member.name}'s ${template.category} Routine`,
        template.category,
        template.description,
        existingPlan.id
      );
      planId = existingPlan.id;
    } else {
      const newPlan = db.prepare(`
        INSERT INTO workout_plans (title, category, description, is_template, assigned_to_member_id)
        VALUES (?, ?, ?, 0, ?)
      `).run(
        `${member.name}'s ${template.category} Routine`,
        template.category,
        template.description,
        member_id
      );
      planId = newPlan.lastInsertRowid;
    }

    // Copy template exercises into member's routine
    const tplExercises = db.prepare('SELECT * FROM workout_exercises WHERE workout_plan_id = ?').all(template_id);
    const insertEx = db.prepare(`
      INSERT INTO workout_exercises (workout_plan_id, day_of_week, exercise_name, sets, reps, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const ex of tplExercises) {
      insertEx.run(planId, ex.day_of_week, ex.exercise_name, ex.sets, ex.reps, ex.notes);
    }

    // Notify member
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, '🏋️ New Workout Plan Assigned', 'Trainer updated your workout routine to: ' || ?, 'info')
    `).run(member.user_id, template.title);

    return planId;
  });

  try {
    const planId = assignTx();
    return res.json({
      success: true,
      message: `Workout template "${template.title}" successfully assigned to ${member.name}.`,
      planId
    });
  } catch (err) {
    console.error('Workout assign error:', err);
    return res.status(500).json({ success: false, message: 'Failed to assign workout routine.' });
  }
}

module.exports = {
  getMemberWorkout,
  getWorkoutTemplates,
  assignWorkoutTemplate
};

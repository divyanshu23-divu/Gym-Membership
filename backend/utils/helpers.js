/**
 * IronPulse Helper Utilities
 * Pure functions for countdown computation, attendance streak tracking,
 * and fitness health metrics (BMI, Mifflin-St Jeor TDEE calorie target).
 */

function addDays(days) {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + days));
  return date.toISOString().split('T')[0];
}

function addDaysToDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().split('T')[0];
}

/**
 * Dynamically computes membership countdown, progress percentage, and status color.
 * Days left is dynamically calculated from today's date (not statically stored).
 */
function calculateMembershipDetails(startDateStr, endDateStr, planName) {
  if (!startDateStr || !endDateStr) {
    return {
      daysLeft: 0,
      totalDays: 0,
      daysElapsed: 0,
      percentUsed: 100,
      percentRemaining: 0,
      status: 'no_membership',
      color: 'grey',
      badge: 'No Plan',
      badgeClass: 'status-grey',
      showWarningBanner: false,
      startDate: null,
      endDate: null,
      planName: 'None'
    };
  }

  const now = new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const endMs = Date.UTC(ey, em - 1, ed);

  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.ceil((endMs - todayMs) / msPerDay);
  const totalDays = Math.max(1, Math.round((endMs - startMs) / msPerDay));
  const daysElapsed = Math.max(0, Math.round((todayMs - startMs) / msPerDay));

  let percentUsed = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDays) * 100)));
  if (daysLeft <= 0) {
    percentUsed = 100;
  }
  const percentRemaining = Math.max(0, 100 - percentUsed);

  let status, color, badge, badgeClass, showWarningBanner;

  if (daysLeft > 15) {
    status = 'active';
    color = 'green';
    badge = 'Active';
    badgeClass = 'status-green';
    showWarningBanner = false;
  } else if (daysLeft >= 7 && daysLeft <= 15) {
    status = 'expiring_soon';
    color = 'orange';
    badge = 'Expiring Soon';
    badgeClass = 'status-orange';
    showWarningBanner = false;
  } else if (daysLeft > 0 && daysLeft < 7) {
    status = 'urgent_expiry';
    color = 'red';
    badge = 'Expiring Soon';
    badgeClass = 'status-red';
    showWarningBanner = true;
  } else {
    status = 'expired';
    color = 'grey';
    badge = 'Expired';
    badgeClass = 'status-grey';
    showWarningBanner = true;
  }

  return {
    daysLeft: Math.max(0, daysLeft),
    rawDaysLeft: daysLeft,
    totalDays,
    daysElapsed,
    percentUsed,
    percentRemaining,
    status,
    color,
    badge,
    badgeClass,
    showWarningBanner,
    startDate: startDateStr,
    endDate: endDateStr,
    planName: planName || 'Standard'
  };
}

/**
 * Calculates current consecutive workout streak from distinct attendance dates.
 * Dates are expected in YYYY-MM-DD format.
 */
function calculateStreak(attendanceDates) {
  if (!attendanceDates || attendanceDates.length === 0) return 0;

  const now = new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;

  const uniqueTimestamps = Array.from(new Set(attendanceDates))
    .map(dStr => {
      const [y, m, d] = dStr.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    })
    .sort((a, b) => b - a);

  if (uniqueTimestamps.length === 0) return 0;

  const mostRecent = uniqueTimestamps[0];
  const diffDaysFromToday = Math.round((todayMs - mostRecent) / msPerDay);

  if (diffDaysFromToday > 1) {
    return 0;
  }

  let streak = 1;
  let prevDate = mostRecent;

  for (let i = 1; i < uniqueTimestamps.length; i++) {
    const curDate = uniqueTimestamps[i];
    const diff = Math.round((prevDate - curDate) / msPerDay);
    if (diff === 1) {
      streak++;
      prevDate = curDate;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculates BMI, BMI Category, and Mifflin-St Jeor TDEE target calories.
 */
function calculateBMIAndCalories(heightCm, weightKg, age = 25, gender = 'male', fitnessGoal = 'General Fitness') {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    return {
      bmi: 0,
      category: 'Unknown',
      categoryClass: 'status-grey',
      suggestedCalories: 2000
    };
  }

  const heightM = heightCm / 100;
  const bmi = +(weightKg / (heightM * heightM)).toFixed(1);

  let category = 'Normal weight';
  let categoryClass = 'status-green';

  if (bmi < 18.5) {
    category = 'Underweight';
    categoryClass = 'status-orange';
  } else if (bmi >= 18.5 && bmi < 25) {
    category = 'Normal weight';
    categoryClass = 'status-green';
  } else if (bmi >= 25 && bmi < 30) {
    category = 'Overweight';
    categoryClass = 'status-orange';
  } else {
    category = 'Obese';
    categoryClass = 'status-red';
  }

  // Mifflin-St Jeor formula
  let bmr;
  if (gender === 'female') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }

  let tdee = Math.round(bmr * 1.4);

  let targetCalories = tdee;
  const goalLower = (fitnessGoal || '').toLowerCase();
  if (goalLower.includes('loss') || goalLower.includes('cut') || goalLower.includes('shred')) {
    targetCalories = Math.max(1200, tdee - 500);
  } else if (goalLower.includes('gain') || goalLower.includes('muscle') || goalLower.includes('bulk')) {
    targetCalories = tdee + 400;
  }

  return {
    bmi,
    category,
    categoryClass,
    suggestedCalories: targetCalories
  };
}

module.exports = {
  addDays,
  addDaysToDate,
  calculateMembershipDetails,
  calculateStreak,
  calculateBMIAndCalories
};

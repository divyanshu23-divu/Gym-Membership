/**
 * Automated Test Suite for IronPulse Core Logic & REST API
 * Tests JWT Auth, Dynamic Countdown Engine, SQLite UNIQUE Attendance Constraints,
 * and Renewal Auto-Extension.
 */

const assert = require('assert');
const path = require('path');
const http = require('http');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = 3999;

const app = require('../backend/server');
const db = require('../database/db');
const { calculateMembershipDetails, calculateStreak, calculateBMIAndCalories } = require('../backend/utils/helpers');

let server;
const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}/api`;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting IronPulse Test Suite...\n');

  // Start temporary server
  await new Promise(resolve => {
    server = app.listen(PORT, resolve);
  });

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Pure Unit Test - Countdown Engine
    // ------------------------------------------------------------------------
    console.log('▶ Test 1: Membership Countdown & Color Status Calculations');
    const today = new Date();
    const dStr = (d) => d.toISOString().split('T')[0];

    // Green test (>15 days)
    const future30 = new Date(today);
    future30.setDate(today.getDate() + 30);
    const past10 = new Date(today);
    past10.setDate(today.getDate() - 10);
    const cdGreen = calculateMembershipDetails(dStr(past10), dStr(future30), 'Quarterly');
    assert.strictEqual(cdGreen.color, 'green', 'Should be green when > 15 days');
    assert.strictEqual(cdGreen.showWarningBanner, false, 'No warning banner when > 15 days');
    assert.ok(cdGreen.daysLeft >= 29, 'Days left should be approximately 30');

    // Orange test (7–15 days)
    const future10 = new Date(today);
    future10.setDate(today.getDate() + 10);
    const cdOrange = calculateMembershipDetails(dStr(past10), dStr(future10), 'Monthly');
    assert.strictEqual(cdOrange.color, 'orange', 'Should be orange when 7-15 days');
    assert.strictEqual(cdOrange.showWarningBanner, false, 'No warning banner for orange');

    // Red test (<7 days)
    const future3 = new Date(today);
    future3.setDate(today.getDate() + 3);
    const cdRed = calculateMembershipDetails(dStr(past10), dStr(future3), 'Monthly');
    assert.strictEqual(cdRed.color, 'red', 'Should be red when < 7 days');
    assert.strictEqual(cdRed.showWarningBanner, true, 'Warning banner must be active when < 7 days');

    // Expired test
    const past5 = new Date(today);
    past5.setDate(today.getDate() - 5);
    const cdExpired = calculateMembershipDetails(dStr(past10), dStr(past5), 'Monthly');
    assert.strictEqual(cdExpired.color, 'grey', 'Should be grey when expired');
    assert.strictEqual(cdExpired.status, 'expired', 'Status should be expired');
    assert.strictEqual(cdExpired.showWarningBanner, true, 'Warning banner active when expired');
    console.log('  ✅ Countdown calculations and color thresholds passed.\n');

    // ------------------------------------------------------------------------
    // TEST 2: Health Metrics (BMI & Mifflin-St Jeor TDEE)
    // ------------------------------------------------------------------------
    console.log('▶ Test 2: BMI and Target Calorie Formulas');
    const health = calculateBMIAndCalories(180, 80, 25, 'male', 'Weight Loss');
    assert.ok(health.bmi > 24 && health.bmi < 25, `Expected BMI around 24.7, got ${health.bmi}`);
    assert.strictEqual(health.category, 'Normal weight');
    assert.ok(health.suggestedCalories > 1500, 'Calorie target must be calculated');
    console.log(`  ✅ BMI: ${health.bmi} (${health.category}), Target Calories: ${health.suggestedCalories} kcal.\n`);

    // ------------------------------------------------------------------------
    // TEST 3: Auth API - Admin & Member Logins
    // ------------------------------------------------------------------------
    console.log('▶ Test 3: API Authentication (JWT & bcrypt)');
    
    // Admin login
    const adminLoginRes = await request('POST', '/auth/login', {
      email: 'admin@gym.com',
      password: 'admin123'
    });
    assert.strictEqual(adminLoginRes.status, 200);
    assert.strictEqual(adminLoginRes.body.success, true);
    assert.strictEqual(adminLoginRes.body.user.role, 'admin');
    const adminToken = adminLoginRes.body.token;
    console.log('  ✅ Admin login verified. Token generated.');

    // Demo Member login (Alex Mercer - 3 days left)
    const alexLoginRes = await request('POST', '/auth/login', {
      email: 'alex.member@gym.com',
      password: 'member123'
    });
    assert.strictEqual(alexLoginRes.status, 200);
    assert.strictEqual(alexLoginRes.body.user.role, 'member');
    const alexToken = alexLoginRes.body.token;
    console.log('  ✅ Member login verified for alex.member@gym.com.');

    // ------------------------------------------------------------------------
    // TEST 4: Member Dashboard Data & Real-time Countdown
    // ------------------------------------------------------------------------
    console.log('▶ Test 4: Member Dashboard Live API & Countdown Output');
    const dashRes = await request('GET', '/member/dashboard', null, alexToken);
    assert.strictEqual(dashRes.status, 200);
    const alexDash = dashRes.body.data;
    assert.strictEqual(alexDash.countdown.color, 'red', 'Alex Mercer should have red color countdown');
    assert.strictEqual(alexDash.countdown.showWarningBanner, true, 'Warning banner must be active for Alex');
    console.log(`  ✅ Live Dashboard: Alex has ${alexDash.countdown.daysLeft} days left (${alexDash.countdown.badge}, Color: ${alexDash.countdown.color}).`);

    // ------------------------------------------------------------------------
    // TEST 5: Attendance Duplicate Prevention Constraint
    // ------------------------------------------------------------------------
    console.log('▶ Test 5: SQLite UNIQUE(member_id, date) Attendance Constraint');
    // Attempting check-in for Alex (who may already be checked in today from seed)
    const checkinRes1 = await request('POST', '/attendance/checkin', {}, alexToken);
    if (checkinRes1.status === 201) {
      console.log('  ℹ️ Initial check-in recorded successfully.');
      // Now attempt duplicate check-in
      const checkinRes2 = await request('POST', '/attendance/checkin', {}, alexToken);
      assert.strictEqual(checkinRes2.status, 400, 'Duplicate check-in on the same day must return 400');
      assert.ok(checkinRes2.body.message.includes('already checked in today'), 'Friendly constraint error returned');
      console.log('  ✅ Duplicate check-in correctly rejected with 400.');
    } else {
      assert.strictEqual(checkinRes1.status, 400, 'Already checked in from seed');
      assert.ok(checkinRes1.body.message.includes('already checked in today'));
      console.log('  ✅ Duplicate check-in constraint enforced as expected.');
    }

    // ------------------------------------------------------------------------
    // TEST 6: Renewal Workflow & Auto Date Extension
    // ------------------------------------------------------------------------
    console.log('▶ Test 6: Renewal Workflow & Automatic Date Extension');
    // Get member Sarah Connor who is active
    const sarahUser = db.prepare("SELECT id, email FROM users WHERE email = 'sarah.member@gym.com'").get();
    const sarahMember = db.prepare("SELECT id FROM members WHERE user_id = ?").get(sarahUser.id);
    const initialMs = db.prepare("SELECT end_date FROM memberships WHERE member_id = ?").get(sarahMember.id);

    // Sarah requests a 30-day renewal
    const plan1 = db.prepare("SELECT id, duration_days FROM plans WHERE duration_days = 30").get();
    const renewalReqRes = db.prepare(`
      INSERT INTO renewal_requests (member_id, plan_id, status, notes)
      VALUES (?, ?, 'pending', 'Automated test request')
    `).run(sarahMember.id, plan1.id);
    const newReqId = renewalReqRes.lastInsertRowid;

    // Admin approves renewal
    const approveRes = await request('POST', `/renewals/${newReqId}/approve`, {}, adminToken);
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.success, true);

    const updatedMs = db.prepare("SELECT end_date FROM memberships WHERE member_id = ?").get(sarahMember.id);
    const [y1, m1, d1] = initialMs.end_date.split('-').map(Number);
    const [y2, m2, d2] = updatedMs.end_date.split('-').map(Number);
    const diffDays = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (1000 * 60 * 60 * 24));
    assert.strictEqual(diffDays, 30, `Membership end date should have extended by 30 days. Got ${diffDays}`);
    console.log(`  ✅ End date extended seamlessly from ${initialMs.end_date} to ${updatedMs.end_date} (+${diffDays} days).`);

    // ------------------------------------------------------------------------
    // TEST 7: CSV Exports
    // ------------------------------------------------------------------------
    console.log('▶ Test 7: Admin CSV Export Endpoints');
    const csvMembers = await request('GET', '/admin/export/members', null, adminToken);
    assert.strictEqual(csvMembers.status, 200);
    assert.ok(csvMembers.headers['content-type'].includes('text/csv'), 'Content-type must be text/csv');
    assert.ok(csvMembers.raw.includes('Member ID,Name,Email'), 'CSV headers present');

    const csvPayments = await request('GET', '/admin/export/payments', null, adminToken);
    assert.strictEqual(csvPayments.status, 200);
    assert.ok(csvPayments.headers['content-type'].includes('text/csv'));
    assert.ok(csvPayments.raw.includes('Payment ID,Transaction ID'), 'Payment headers present');
    console.log('  ✅ Both Member and Payment CSV downloads generated successfully.');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The IronPulse system is 100% verified.');

  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test failure:', err);
  if (server) server.close();
  process.exit(1);
});

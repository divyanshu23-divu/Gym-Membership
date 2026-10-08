-- ============================================================================
-- IronPulse – Gym Membership Manager
-- Relational Database Schema (SQLite 3)
-- Demonstrating DDL, Constraints, Foreign Keys, Unique Keys, and Indexes
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE (Authentication & Role Management)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'member')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 2. TRAINERS TABLE (Gym Fitness Instructors)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE COLLATE NOCASE,
    phone TEXT,
    specialization TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 3. MEMBERS TABLE (Gym Client Profile & Physical Metrics)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    trainer_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT,
    age INTEGER CHECK(age > 0 AND age < 120),
    gender TEXT CHECK(gender IN ('male', 'female', 'other')),
    height_cm REAL CHECK(height_cm > 50 AND height_cm < 300),
    weight_kg REAL CHECK(weight_kg > 20 AND weight_kg < 500),
    fitness_goal TEXT DEFAULT 'General Fitness',
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 4. PLANS TABLE (Membership Subscription Offerings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    duration_days INTEGER NOT NULL CHECK(duration_days > 0),
    price REAL NOT NULL CHECK(price >= 0),
    description TEXT,
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 5. MEMBERSHIPS TABLE (Active / Historical Subscriptions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'pending_renewal', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 6. RENEWAL_REQUESTS TABLE (Member Plan Extension Submissions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS renewal_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_date DATETIME,
    notes TEXT,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 7. PAYMENTS TABLE (Simulated Transaction Audit Trail)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    plan_id INTEGER,
    amount REAL NOT NULL CHECK(amount >= 0),
    payment_method TEXT DEFAULT 'UPI / Card (Simulated)',
    transaction_id TEXT UNIQUE NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'refunded', 'failed')),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 8. ATTENDANCE TABLE (Daily Check-in Records with Unique Constraint)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    date DATE NOT NULL,
    check_in_time TIME DEFAULT (TIME('now', 'localtime')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT uq_member_attendance_per_day UNIQUE(member_id, date)
);

-- ----------------------------------------------------------------------------
-- 9. WORKOUT_PLANS TABLE (Assigned Routines & Templates)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('Weight Loss', 'Muscle Gain', 'Beginner', 'Endurance', 'Custom')),
    description TEXT,
    is_template INTEGER DEFAULT 0 CHECK(is_template IN (0, 1)),
    assigned_to_member_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to_member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 10. WORKOUT_EXERCISES TABLE (Day-Wise Workout Breakdown)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_plan_id INTEGER NOT NULL,
    day_of_week TEXT NOT NULL CHECK(day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    exercise_name TEXT NOT NULL,
    sets INTEGER NOT NULL CHECK(sets > 0),
    reps TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY (workout_plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 11. PROGRESS_LOGS TABLE (Weight & Body Measurements over Time)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progress_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    log_date DATE NOT NULL,
    weight_kg REAL NOT NULL CHECK(weight_kg > 0),
    chest_cm REAL,
    waist_cm REAL,
    biceps_cm REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 12. NOTIFICATIONS TABLE (In-App Alerts & Expiry Warnings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK(type IN ('info', 'warning', 'success', 'renewal', 'announcement')),
    is_read INTEGER DEFAULT 0 CHECK(is_read IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 13. ANNOUNCEMENTS TABLE (Gym Bulletin Board)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER,
    priority TEXT DEFAULT 'normal' CHECK(priority IN ('normal', 'urgent')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 14. FEEDBACK TABLE (Trainer & Gym Rating System)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    trainer_id INTEGER,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- PERFORMANCE INDEXES (Optimizing High-Frequency Search/Filter Operations)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_trainer ON members(trainer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_member ON memberships(member_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_dates ON memberships(end_date);
CREATE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date);
CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_progress_member_date ON progress_logs(member_id, log_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_exercises_plan ON workout_exercises(workout_plan_id);

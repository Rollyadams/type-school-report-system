-- ================================================================
-- SCHOOL REPORT SYSTEM — COMPLETE TABLE AUDIT & FIX
-- Run this entire file in Supabase SQL Editor
-- ================================================================


-- ── 1. CORE TABLE STRUCTURE FIXES ───────────────────────────────

-- schools: add missing columns
ALTER TABLE schools ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- users: add missing columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_id uuid;

-- students: ensure school_id exists
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id);

-- classes: ensure school_id exists
ALTER TABLE classes ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS arm text;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS level text;

-- sessions: ensure school_id exists
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id);

-- terms: ensure school_id exists (CRITICAL — was missing)
ALTER TABLE terms ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id);
ALTER TABLE terms ADD COLUMN IF NOT EXISTS is_current boolean DEFAULT false;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS resumption_date date;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS total_days integer DEFAULT 62;

-- results: core columns
ALTER TABLE results ADD COLUMN IF NOT EXISTS student_id uuid;
ALTER TABLE results ADD COLUMN IF NOT EXISTS term_id uuid;
ALTER TABLE results ADD COLUMN IF NOT EXISTS subject_name text;
ALTER TABLE results ADD COLUMN IF NOT EXISTS ca_score numeric DEFAULT 0;
ALTER TABLE results ADD COLUMN IF NOT EXISTS exam_score numeric DEFAULT 0;

-- remarks: core columns
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS student_id uuid;
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS term_id uuid;
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS teacher_remark text;
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS principal_remark text;
ALTER TABLE remarks ADD COLUMN IF NOT EXISTS promotion_status text;

-- attendance: core columns
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS student_id uuid;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS term_id uuid;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS days_present integer DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS total_days integer DEFAULT 62;

-- notifications: ensure school_id exists
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES schools(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


-- ── 2. RLS POLICIES — DROP AND RECREATE CLEANLY ─────────────────
-- Drop all existing policies first to avoid conflicts

DROP POLICY IF EXISTS "schools_isolation" ON schools;
DROP POLICY IF EXISTS "allow_school_registration" ON schools;
DROP POLICY IF EXISTS "users_isolation" ON users;
DROP POLICY IF EXISTS "allow_user_registration" ON users;
DROP POLICY IF EXISTS "students_isolation" ON students;
DROP POLICY IF EXISTS "classes_isolation" ON classes;
DROP POLICY IF EXISTS "sessions_isolation" ON sessions;
DROP POLICY IF EXISTS "terms_isolation" ON terms;
DROP POLICY IF EXISTS "results_isolation" ON results;
DROP POLICY IF EXISTS "remarks_isolation" ON remarks;
DROP POLICY IF EXISTS "attendance_isolation" ON attendance;
DROP POLICY IF EXISTS "notifications_isolation" ON notifications;

-- Enable RLS on all tables
ALTER TABLE schools       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE students      ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE terms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE results       ENABLE ROW LEVEL SECURITY;
ALTER TABLE remarks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ── schools ──
-- Public INSERT for registration
CREATE POLICY "allow_school_registration" ON schools
  FOR INSERT WITH CHECK (true);
-- Logged-in users see only their school
CREATE POLICY "schools_isolation" ON schools
  FOR SELECT USING (id = current_school_id());
CREATE POLICY "schools_update" ON schools
  FOR UPDATE USING (id = current_school_id());

-- ── users ──
-- Public INSERT for registration
CREATE POLICY "allow_user_registration" ON users
  FOR INSERT WITH CHECK (true);
-- Logged-in users see only users from same school
CREATE POLICY "users_isolation" ON users
  FOR ALL USING (school_id = current_school_id());

-- ── students ──
CREATE POLICY "students_isolation" ON students
  FOR ALL USING (school_id = current_school_id());

-- ── classes ──
CREATE POLICY "classes_isolation" ON classes
  FOR ALL USING (school_id = current_school_id());

-- ── sessions ──
CREATE POLICY "sessions_isolation" ON sessions
  FOR ALL USING (school_id = current_school_id());

-- ── terms ──
CREATE POLICY "terms_isolation" ON terms
  FOR ALL USING (school_id = current_school_id());

-- ── results ──
CREATE POLICY "results_isolation" ON results
  FOR ALL USING (
    student_id IN (
      SELECT id FROM students WHERE school_id = current_school_id()
    )
  );

-- ── remarks ──
CREATE POLICY "remarks_isolation" ON remarks
  FOR ALL USING (
    student_id IN (
      SELECT id FROM students WHERE school_id = current_school_id()
    )
  );

-- ── attendance ──
CREATE POLICY "attendance_isolation" ON attendance
  FOR ALL USING (
    student_id IN (
      SELECT id FROM students WHERE school_id = current_school_id()
    )
  );

-- ── notifications ──
CREATE POLICY "notifications_isolation" ON notifications
  FOR ALL USING (school_id = current_school_id());


-- ── 3. HELPER FUNCTIONS ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_user_context(uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM set_config('app.current_user_id', uid::text, false);
END;
$$;

CREATE OR REPLACE FUNCTION current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT school_id FROM users
  WHERE id = current_setting('app.current_user_id', true)::uuid
  LIMIT 1;
$$;


-- ── 4. VERIFY ───────────────────────────────────────────────────
-- Run this query after to confirm RLS is ON for all tables:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

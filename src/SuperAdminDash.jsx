import { useState, useEffect } from 'react';
import { db, supabase } from './supabaseClient';

// Fire-and-forget audit log write. Never blocks or fails the action it's
// logging — a logging hiccup must never be mistaken for the real action
// (deactivate/delete/etc.) having failed.
async function logAudit(user, action, targetType, targetId, targetLabel, details = {}) {
  try {
    await db.post('audit_logs', {
      actor_id: user?.id || null,
      actor_name: user?.full_name || 'Unknown',
      action,
      target_type: targetType,
      target_id: targetId || null,
      target_label: targetLabel || null,
      details,
    });
  } catch (e) {
    console.error('Audit log write failed (action itself still succeeded):', e);
  }
}

// ── Shared layout for the Super Admin dashboard ──────────────────
// Deliberately standalone (does not reuse SidebarLayout) so that
// changes here can never affect PrincipalDash / TeacherDash, which
// depend on SidebarLayout's existing role branching in production.
function SuperAdminLayout({ user, onLogout, tab, setTab, children }) {
  const tabs = [
    { id: 'schools', label: 'Schools', icon: '🏫' },
    { id: 'revenue', label: 'Revenue', icon: '💰' },
    { id: 'activity', label: 'Activity', icon: '📜' },
    { id: 'health', label: 'Health', icon: '🩺' },
    { id: 'promos',  label: 'Promo Codes', icon: '🏷️' },
    { id: 'announcements', label: 'Announcements', icon: '📢' },
  ];
  const grad = 'linear-gradient(135deg,#7c2d12,#b91c1c)'; // distinct from principal/teacher colors on purpose
  const accent = '#dc2626';

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: "'Segoe UI',sans-serif", maxWidth: '100vw', overflowX: 'hidden' }}>
      {/* ── Top Bar ── */}
      <div style={{ background: grad, padding: '0 16px', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 24px #00000040' }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '0.01em' }}>Super Admin</div>
          <div style={{ color: '#fecaca', fontSize: 10, marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{user.full_name}</div>
        </div>
        <button onClick={onLogout} style={{ background: '#ffffff18', border: '1px solid #ffffff25', color: '#fff', borderRadius: 12, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Sign Out
        </button>
      </div>

      {/* ── Tab Strip ── */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 62, zIndex: 90, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {tabs.map(t => {
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: '0 0 auto', minWidth: 86, padding: '12px 10px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                borderBottom: isActive ? `3px solid ${accent}` : '3px solid transparent',
                color: isActive ? accent : '#64748b', fontWeight: isActive ? 800 : 600, fontSize: 13 }}>
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Page Content ── */}
      <div style={{ padding: '16px 16px 80px', maxWidth: 700, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

// ── Schools List ──────────────────────────────────────────────────
function SchoolsList({ user }) {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { school, typed }
  const [actionErr, setActionErr] = useState('');
  const [overrideId, setOverrideId] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ plan: 'pro', expiresAt: '', reason: '' });

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const data = await db.get('schools'); // no filter — RLS bypass returns all rows for super_admin
    data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setSchools(data);
    setLoading(false);
  };

  const now = new Date();
  const statusFor = (school) => {
    if (school.deactivated) return { label: 'Deactivated', color: '#78716c', bg: '#f5f5f4' };
    if (school.plan !== 'pro') return { label: 'Free / Trial', color: '#64748b', bg: '#f1f5f9' };
    const expires = school.plan_expires_at ? new Date(school.plan_expires_at) : null;
    if (!expires || expires <= now) return { label: 'Expired', color: '#dc2626', bg: '#fef2f2' };
    const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return { label: `Expires in ${daysLeft}d`, color: '#d97706', bg: '#fffbeb' };
    return { label: `Active · ${daysLeft}d left`, color: '#16a34a', bg: '#f0fdf4' };
  };

  const filtered = schools.filter(s =>
    !search.trim() ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleDeactivate = async (school) => {
    setBusyId(school.id);
    setActionErr('');
    const willBeDeactivated = !school.deactivated;
    await db.patch('schools', school.id, { deactivated: willBeDeactivated });
    await logAudit(user, willBeDeactivated ? 'school.deactivate' : 'school.reactivate', 'school', school.id, school.name);
    await load();
    setBusyId(null);
  };

  // Permanent delete walks child tables in the order required by their
  // FK delete rules. Tables with NO ACTION (referrals, referral_credit_ledger,
  // terms) MUST be deleted explicitly first or the schools delete will be
  // rejected outright by Postgres. Tables with CASCADE/SET NULL would be
  // handled automatically, but we delete results/students explicitly too
  // so nothing is silently orphaned.
  const deleteSchoolPermanently = async (school) => {
    setBusyId(school.id);
    setActionErr('');
    try {
      const students = await db.get('students', { school_id: school.id });
      const studentIds = students.map(s => s.id);

      // results/remarks/attendance reference student_id, not school_id directly —
      // clear them before removing students.
      for (const sid of studentIds) {
        const results = await db.get('results', { student_id: sid });
        for (const r of results) await db.delete('results', r.id);
        const remarks = await db.get('remarks', { student_id: sid });
        for (const r of remarks) await db.delete('remarks', r.id);
      }
      for (const sid of studentIds) await db.delete('students', sid);

      const referralsOut = await db.get('referrals', { referrer_school_id: school.id });
      for (const r of referralsOut) await db.delete('referrals', r.id);
      const referralsIn = await db.get('referrals', { referred_school_id: school.id });
      for (const r of referralsIn) await db.delete('referrals', r.id);

      const ledger = await db.get('referral_credit_ledger', { school_id: school.id });
      for (const l of ledger) await db.delete('referral_credit_ledger', l.id);

      const terms = await db.get('terms', { school_id: school.id });
      for (const t of terms) await db.delete('terms', t.id);

      // classes/users/sessions/students are SET NULL on school_id, but we
      // delete classes and users explicitly too rather than leave them
      // orphaned with school_id = null.
      const classes = await db.get('classes', { school_id: school.id });
      for (const c of classes) await db.delete('classes', c.id);

      const users = await db.get('users', { school_id: school.id });
      for (const u of users) await db.delete('users', u.id);

      const sessions = await db.get('sessions', { school_id: school.id });
      for (const s of sessions) await db.delete('sessions', s.id);

      // CASCADE tables (daily_attendance, notifications, push_subscriptions,
      // timetable) are handled automatically by Postgres once schools row
      // is deleted, no need to delete them manually.

      await db.delete('schools', school.id);
      await logAudit(user, 'school.delete', 'school', school.id, school.name, {
        students_deleted: studentIds.length,
        email: school.email,
      });
      setDeleteConfirm(null);
      await load();
    } catch (e) {
      setActionErr('Delete failed partway through — some data may need manual cleanup. Check console.');
      console.error('School delete error:', e);
    }
    setBusyId(null);
  };

  const openOverride = (school) => {
    const defaultExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setOverrideForm({
      plan: 'pro', // override defaults to granting Pro — the common case
      expiresAt: school.plan_expires_at ? new Date(school.plan_expires_at).toISOString().slice(0, 10) : defaultExpiry,
      reason: '',
    });
    setOverrideId(school.id);
  };

  // Manual override bypasses Paystack entirely — does NOT write to `payments`,
  // since this isn't a real transaction and would corrupt revenue numbers.
  // It IS logged to audit_logs so there's always a record of why a school's
  // plan changed without a matching payment.
  const applyOverride = async (school) => {
    setBusyId(school.id);
    setActionErr('');
    const patch = {
      plan: overrideForm.plan,
      plan_expires_at: overrideForm.plan === 'pro' ? new Date(overrideForm.expiresAt + 'T23:59:59').toISOString() : null,
    };
    await db.patch('schools', school.id, patch);
    await logAudit(user, 'school.plan_override', 'school', school.id, school.name, {
      from_plan: school.plan, to_plan: overrideForm.plan,
      plan_expires_at: patch.plan_expires_at, reason: overrideForm.reason.trim() || null,
    });
    setOverrideId(null);
    await load();
    setBusyId(null);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>⏳</div>
      <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>Loading schools…</div>
    </div>;
  }

  return (
    <div>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }}
      />

      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>
        {filtered.length} school{filtered.length !== 1 ? 's' : ''}
      </div>

      {actionErr && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 12, borderRadius: 10, fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{actionErr}</div>}

      {filtered.map(school => {
        const status = statusFor(school);
        const isExpanded = expandedId === school.id;
        const isBusy = busyId === school.id;
        return (
          <div key={school.id} style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px #0000000a' }}>
            <div onClick={() => setExpandedId(isExpanded ? null : school.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {school.name || 'Unnamed school'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {school.email || 'No email on file'}
                </div>
              </div>
              <div style={{ background: status.bg, color: status.color, fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {status.label}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#64748b' }}>
              <div><b style={{ color: '#1e293b' }}>{school.plan || 'free'}</b> plan</div>
              {school.credit_balance > 0 &&
                <div>₦{school.credit_balance.toLocaleString()} credit</div>}
              {school.plan_expires_at &&
                <div>Exp: {new Date(school.plan_expires_at).toLocaleDateString('en-NG')}</div>}
            </div>

            {isExpanded && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => toggleDeactivate(school)} disabled={isBusy}
                    style={{ flex: 1, background: school.deactivated ? '#f0fdf4' : '#fffbeb', color: school.deactivated ? '#16a34a' : '#d97706', border: 'none', borderRadius: 10, padding: '10px', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                    {isBusy ? '…' : school.deactivated ? 'Reactivate' : 'Deactivate'}
                  </button>
                  <button onClick={() => openOverride(school)} disabled={isBusy}
                    style={{ flex: 1, background: '#f5f3ff', color: '#7c3aed', border: 'none', borderRadius: 10, padding: '10px', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                    Override Plan
                  </button>
                  <button onClick={() => setDeleteConfirm({ school, typed: '' })} disabled={isBusy}
                    style={{ flex: 1, background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 10, padding: '10px', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                    Delete
                  </button>
                </div>

                {overrideId === school.id && (
                  <div style={{ marginTop: 10, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 800, marginBottom: 8 }}>
                      MANUAL OVERRIDE — bypasses Paystack, no payment recorded
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <select value={overrideForm.plan} onChange={e => setOverrideForm({ ...overrideForm, plan: e.target.value })}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12 }}>
                        <option value="pro">Pro</option>
                        <option value="free">Free</option>
                      </select>
                      {overrideForm.plan === 'pro' && (
                        <input type="date" value={overrideForm.expiresAt}
                          onChange={e => setOverrideForm({ ...overrideForm, expiresAt: e.target.value })}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, boxSizing: 'border-box' }} />
                      )}
                    </div>
                    <input value={overrideForm.reason} onChange={e => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                      placeholder="Reason (e.g. manual bank transfer, goodwill extension)"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setOverrideId(null)} style={{ flex: 1, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, padding: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button onClick={() => applyOverride(school)} disabled={isBusy}
                        style={{ flex: 1, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                        {isBusy ? '…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 &&
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
          No schools match "{search}"
        </div>}

      {/* ── Delete confirmation modal ── */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000080', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, maxWidth: 360, width: '100%' }}>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#dc2626', marginBottom: 8 }}>⚠️ Permanent Delete</div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.5 }}>
              This will permanently erase <b>{deleteConfirm.school.name}</b> — all students, results, teachers, terms and referral history. This cannot be undone.
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
              Type <b>{deleteConfirm.school.name}</b> to confirm:
            </div>
            <input
              value={deleteConfirm.typed}
              onChange={e => setDeleteConfirm({ ...deleteConfirm, typed: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #fecaca', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={() => deleteSchoolPermanently(deleteConfirm.school)}
                disabled={deleteConfirm.typed !== deleteConfirm.school.name || busyId === deleteConfirm.school.id}
                style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                  opacity: (deleteConfirm.typed !== deleteConfirm.school.name || busyId === deleteConfirm.school.id) ? 0.4 : 1 }}>
                {busyId === deleteConfirm.school.id ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── System Health ─────────────────────────────────────────────────
// NOTE: True edge function error logs / uptime require Supabase's
// Management API (service-role token) — not safe to call from a
// client-side app. What's below is everything genuinely checkable
// from data already in the tables, which covers the real failure mode
// that bit you before (validate-promo-code silently dying for weeks).
function SystemHealth() {
  const [schools, setSchools] = useState([]);
  const [payments, setPayments] = useState([]);
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const [s, p, l] = await Promise.all([
      db.get('schools'),
      db.get('payments'),
      supabase.from('login_attempts').select('*').order('attempted_at', { ascending: false }).limit(300).then(r => r.data || []),
    ]);
    setSchools(s);
    setPayments(p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    setLogins(l);
    setLoading(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>⏳</div>
      <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>Checking system health…</div>
    </div>;
  }

  const now = new Date();
  const cardStyle = { background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px #0000000a', marginBottom: 12 };

  // 1. Payment pipeline silence — the exact failure mode that caused the
  // validate-promo-code outage: nothing breaks loudly, payments just stop.
  const lastPayment = payments[0];
  const daysSincePayment = lastPayment ? Math.floor((now - new Date(lastPayment.created_at)) / 86400000) : null;
  const pipelineStatus = daysSincePayment === null ? { label: 'No payments yet', color: '#94a3b8', bg: '#f8fafc' }
    : daysSincePayment <= 7 ? { label: `Last payment ${daysSincePayment}d ago`, color: '#16a34a', bg: '#f0fdf4' }
    : daysSincePayment <= 14 ? { label: `${daysSincePayment}d since last payment`, color: '#d97706', bg: '#fffbeb' }
    : { label: `⚠️ ${daysSincePayment}d since last payment`, color: '#dc2626', bg: '#fef2f2' };

  // 2. Pro schools whose plan_expires_at has passed but the row is still
  // marked plan='pro' — the app gates correctly off the date anyway, but
  // these are real schools needing a renewal call.
  const expiredPro = schools.filter(s => s.plan === 'pro' && !s.deactivated && s.plan_expires_at && new Date(s.plan_expires_at) <= now);

  // 3. Pro schools expiring within 7 days — proactive renewal outreach list.
  const expiringSoon = schools.filter(s => {
    if (s.plan !== 'pro' || s.deactivated || !s.plan_expires_at) return false;
    const exp = new Date(s.plan_expires_at);
    const daysLeft = (exp - now) / 86400000;
    return daysLeft > 0 && daysLeft <= 7;
  });

  // 4. Login security — currently rate-limited emails (5+ fails in last 15 min,
  // same window as the app's own rate limiter) and total fails in 24h.
  const fifteenMinAgo = new Date(now - 15 * 60000);
  const dayAgo = new Date(now - 24 * 3600000);
  const failsByEmail = {};
  logins.forEach(a => {
    if (!a.success && new Date(a.attempted_at) >= fifteenMinAgo) {
      failsByEmail[a.email] = (failsByEmail[a.email] || 0) + 1;
    }
  });
  const lockedOut = Object.entries(failsByEmail).filter(([, count]) => count >= 5);
  const fails24h = logins.filter(a => !a.success && new Date(a.attempted_at) >= dayAgo).length;

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>PAYMENT PIPELINE</div>
        <div style={{ background: pipelineStatus.bg, color: pipelineStatus.color, display: 'inline-block', padding: '6px 12px', borderRadius: 20, fontWeight: 800, fontSize: 13 }}>
          {pipelineStatus.label}
        </div>
        {daysSincePayment > 14 && <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
          More than 2 weeks since the last successful payment. If schools are actively trying to pay, check the Paystack webhook logs in the Supabase dashboard.
        </div>}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>LOGIN SECURITY (last 24h)</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: lockedOut.length ? 10 : 0 }}>
          <div><div style={{ fontSize: 20, fontWeight: 900, color: fails24h > 20 ? '#dc2626' : '#1e293b' }}>{fails24h}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>failed logins</div></div>
          <div><div style={{ fontSize: 20, fontWeight: 900, color: lockedOut.length ? '#dc2626' : '#16a34a' }}>{lockedOut.length}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>locked out now</div></div>
        </div>
        {lockedOut.map(([email, count]) => (
          <div key={email} style={{ fontSize: 12, color: '#dc2626', padding: '4px 0' }}>🔒 {email} — {count} fails in last 15 min</div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>EXPIRED PRO — NOT RENEWED ({expiredPro.length})</div>
        {expiredPro.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>None — all caught up</div>}
        {expiredPro.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: '1px solid #f8fafc' }}>
            <span style={{ color: '#1e293b', fontWeight: 600 }}>{s.name}</span>
            <span style={{ color: '#dc2626' }}>expired {new Date(s.plan_expires_at).toLocaleDateString('en-NG')}</span>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>EXPIRING WITHIN 7 DAYS ({expiringSoon.length})</div>
        {expiringSoon.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>None coming up</div>}
        {expiringSoon.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: '1px solid #f8fafc' }}>
            <span style={{ color: '#1e293b', fontWeight: 600 }}>{s.name}</span>
            <span style={{ color: '#d97706' }}>{new Date(s.plan_expires_at).toLocaleDateString('en-NG')}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', padding: '4px 12px' }}>
        Edge function errors and uptime aren't visible here — check Supabase Dashboard → Edge Functions → Logs for those.
      </div>
    </div>
  );
}

// ── Revenue ───────────────────────────────────────────────────────
const naira = (n) => `₦${Number(n || 0).toLocaleString()}`;

function Revenue() {
  const [payments, setPayments] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const [p, s] = await Promise.all([db.get('payments'), db.get('schools')]);
    p.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setPayments(p);
    setSchools(s);
    setLoading(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>⏳</div>
      <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>Loading revenue…</div>
    </div>;
  }

  const schoolMap = Object.fromEntries(schools.map(s => [s.id, s]));
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const sumWhere = (fn) => payments.filter(fn).reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);

  const totalRevenue = sumWhere(() => true);
  const thisMonthRevenue = sumWhere(p => new Date(p.created_at) >= monthStart);
  const lastMonthRevenue = sumWhere(p => { const d = new Date(p.created_at); return d >= lastMonthStart && d < monthStart; });
  const momChange = lastMonthRevenue > 0
    ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : (thisMonthRevenue > 0 ? 100 : 0);

  const activeProCount = schools.filter(s => s.plan === 'pro' && !s.deactivated && s.plan_expires_at && new Date(s.plan_expires_at) > now).length;
  const freeCount = schools.length - activeProCount;

  const cycleBreakdown = payments.reduce((acc, p) => {
    const c = p.billing_cycle || 'unknown';
    acc[c] = (acc[c] || 0) + Number(p.amount_paid || 0);
    return acc;
  }, {});
  const cycleTotal = Object.values(cycleBreakdown).reduce((a, b) => a + b, 0) || 1;
  const CYCLE_COLOR = { monthly: '#3b82f6', termly: '#f59e0b', yearly: '#16a34a', unknown: '#94a3b8' };

  // last 6 calendar months
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  const trend = months.map(m => {
    const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const total = sumWhere(p => { const d = new Date(p.created_at); return d >= m && d < mEnd; });
    return { label: m.toLocaleDateString('en-NG', { month: 'short' }), total };
  });
  const maxTrend = Math.max(...trend.map(t => t.total), 1);

  const cardStyle = { background: '#fff', borderRadius: 14, padding: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px #0000000a' };

  return (
    <div>
      {/* ── Top stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>ALL-TIME REVENUE</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginTop: 4 }}>{naira(totalRevenue)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>THIS MONTH</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e293b', marginTop: 4 }}>{naira(thisMonthRevenue)}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: momChange >= 0 ? '#16a34a' : '#dc2626', marginTop: 2 }}>
            {momChange >= 0 ? '▲' : '▼'} {Math.abs(momChange)}% vs last month
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>ACTIVE PRO SCHOOLS</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>{activeProCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>FREE / TRIAL</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#64748b', marginTop: 4 }}>{freeCount}</div>
        </div>
      </div>

      {/* ── 6-month trend ── */}
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 12 }}>Last 6 months</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90 }}>
          {trend.map((t, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: '100%', maxWidth: 28,
                height: Math.max(4, (t.total / maxTrend) * 70),
                background: i === trend.length - 1 ? '#dc2626' : '#fecaca',
                borderRadius: 4,
              }} title={naira(t.total)} />
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Revenue by billing cycle ── */}
      <div style={{ ...cardStyle, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#1e293b', marginBottom: 10 }}>Revenue by plan</div>
        {Object.entries(cycleBreakdown).sort((a, b) => b[1] - a[1]).map(([cycle, amt]) => (
          <div key={cycle} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: '#374151', fontWeight: 700, textTransform: 'capitalize' }}>{cycle}</span>
              <span style={{ color: '#64748b', fontWeight: 700 }}>{naira(amt)}</span>
            </div>
            <div style={{ background: '#f1f5f9', borderRadius: 6, height: 6, overflow: 'hidden' }}>
              <div style={{ width: `${(amt / cycleTotal) * 100}%`, height: '100%', background: CYCLE_COLOR[cycle] || '#94a3b8' }} />
            </div>
          </div>
        ))}
        {payments.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>No payments yet</div>}
      </div>

      {/* ── Recent payments ── */}
      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>
        Recent payments ({payments.length})
      </div>
      {payments.slice(0, 15).map(p => {
        const school = schoolMap[p.school_id];
        return (
          <div key={p.id} style={{ ...cardStyle, marginBottom: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {school?.name || 'Unknown school'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {p.billing_cycle} · {new Date(p.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {p.promo_code && ` · promo ${p.promo_code}`}
                  {p.credit_used > 0 && ` · ${naira(p.credit_used)} credit used`}
                </div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 14, color: '#16a34a', whiteSpace: 'nowrap' }}>{naira(p.amount_paid)}</div>
            </div>
          </div>
        );
      })}
      {payments.length === 0 &&
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
          No payments recorded yet
        </div>}
    </div>
  );
}

// ── Activity Log ─────────────────────────────────────────────────
// Merges three independent sources into one chronological feed:
// audit_logs (admin actions), login_attempts (already written by App.js
// on every login), and payments (promo redemptions / plan upgrades).
// Each source is queried directly via supabase (ordered + limited) rather
// than db.get, since these tables grow unbounded and db.get has no
// order/limit support.
const ACTION_META = {
  'school.deactivate':    { icon: '⏸️', color: '#d97706', label: (l) => `${l.actor_name} deactivated ${l.target_label || 'a school'}` },
  'school.reactivate':    { icon: '▶️', color: '#16a34a', label: (l) => `${l.actor_name} reactivated ${l.target_label || 'a school'}` },
  'school.delete':        { icon: '🗑️', color: '#dc2626', label: (l) => `${l.actor_name} permanently deleted ${l.target_label || 'a school'}` },
  'school.plan_override': { icon: '🔧', color: '#7c3aed', label: (l) => `${l.actor_name} manually set ${l.target_label || 'a school'} to ${l.details?.to_plan} plan${l.details?.plan_expires_at ? ` (exp ${new Date(l.details.plan_expires_at).toLocaleDateString('en-NG')})` : ''}${l.details?.reason ? ` — ${l.details.reason}` : ''}` },
  'promo.create':         { icon: '🏷️', color: '#3b82f6', label: (l) => `${l.actor_name} created promo code ${l.target_label}` },
  'promo.enable':         { icon: '🏷️', color: '#16a34a', label: (l) => `${l.actor_name} enabled promo code ${l.target_label}` },
  'promo.disable':        { icon: '🏷️', color: '#d97706', label: (l) => `${l.actor_name} disabled promo code ${l.target_label}` },
  'announcement.create':  { icon: '📢', color: '#3b82f6', label: (l) => `${l.actor_name} created an announcement` },
  'announcement.enable':  { icon: '📢', color: '#16a34a', label: (l) => `${l.actor_name} enabled an announcement` },
  'announcement.disable': { icon: '📢', color: '#d97706', label: (l) => `${l.actor_name} disabled an announcement` },
  'announcement.delete':  { icon: '🗑️', color: '#dc2626', label: (l) => `${l.actor_name} deleted an announcement` },
  'impersonate.start':    { icon: '🕵️', color: '#7c3aed', label: (l) => `${l.actor_name} viewed ${l.target_label || 'a school'} as ${l.details?.as_role || 'user'}` },
  'impersonate.end':      { icon: '🕵️', color: '#94a3b8', label: (l) => `${l.actor_name} exited view-as for ${l.target_label || 'a school'}` },
};

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function ActivityLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const [logsRes, loginsRes, paysRes, schoolsRes] = await Promise.all([
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('login_attempts').select('*').order('attempted_at', { ascending: false }).limit(100),
      supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('schools').select('id,name'),
    ]);

    const schoolMap = Object.fromEntries((schoolsRes.data || []).map(s => [s.id, s.name]));

    const adminEvents = (logsRes.data || []).map(l => {
      const meta = ACTION_META[l.action] || { icon: '⚙️', color: '#64748b', label: (x) => `${x.actor_name} performed ${x.action}` };
      return { id: `audit-${l.id}`, type: 'admin', time: l.created_at, icon: meta.icon, color: meta.color, title: meta.label(l) };
    });

    const loginEvents = (loginsRes.data || []).map(a => ({
      id: `login-${a.id}`, type: 'login', time: a.attempted_at,
      icon: a.success ? '🔓' : '🚫', color: a.success ? '#16a34a' : '#dc2626',
      title: `${a.success ? 'Login success' : 'Failed login attempt'} — ${a.email}`,
    }));

    const paymentEvents = (paysRes.data || []).map(p => ({
      id: `pay-${p.id}`, type: 'payment', time: p.created_at, icon: '💳', color: '#16a34a',
      title: `${schoolMap[p.school_id] || 'Unknown school'} paid ${naira(p.amount_paid)} (${p.billing_cycle})${p.promo_code ? ` · promo ${p.promo_code}` : ''}`,
    }));

    const all = [...adminEvents, ...loginEvents, ...paymentEvents]
      .sort((a, b) => new Date(b.time) - new Date(a.time));

    setEvents(all);
    setLoading(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>⏳</div>
      <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>Loading activity…</div>
    </div>;
  }

  const FILTERS = [
    { id: 'all',     label: 'All' },
    { id: 'admin',   label: 'Admin' },
    { id: 'login',   label: 'Logins' },
    { id: 'payment', label: 'Payments' },
  ];
  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: filter === f.id ? 'none' : '1.5px solid #e2e8f0',
              background: filter === f.id ? '#dc2626' : '#fff',
              color: filter === f.id ? '#fff' : '#64748b',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>
        {filtered.length} event{filtered.length !== 1 ? 's' : ''} · last 100 per source
      </div>

      {filtered.map(e => (
        <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', borderRadius: 12, padding: '10px 12px', marginBottom: 8, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px #0000000a' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${e.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
            {e.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600, lineHeight: 1.4 }}>{e.title}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{timeAgo(e.time)}</div>
          </div>
        </div>
      ))}

      {filtered.length === 0 &&
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
          No activity yet
        </div>}
    </div>
  );
}

// ── Promo Codes ───────────────────────────────────────────────────
function PromoCodes({ user }) {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    code: '',
    discount: '',
    billing_cycle: 'termly',
    max_uses: 1,
    valid_until: '',
  });

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const data = await db.get('promo_codes');
    data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setCodes(data);
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ code: '', discount: '', billing_cycle: 'termly', max_uses: 1, valid_until: '' });
    setErr('');
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 — avoids visual ambiguity
    let suffix = '';
    for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
    setForm({ ...form, code: `PROMO-${suffix}` });
  };

  const createCode = async () => {
    const code = form.code.trim().toUpperCase();
    const discount = Number(form.discount);
    const maxUses = Number(form.max_uses);

    if (!code) { setErr('Enter a code'); return; }
    if (!discount || discount <= 0) { setErr('Enter a valid discount amount'); return; }
    if (!maxUses || maxUses <= 0) { setErr('Max uses must be at least 1'); return; }
    if (!form.valid_until) { setErr('Pick an expiry date'); return; }

    setSaving(true);
    setErr('');
    const result = await db.post('promo_codes', {
      code,
      discount,
      billing_cycle: form.billing_cycle,
      max_uses: maxUses,
      times_used: 0,
      active: true,
      valid_until: new Date(form.valid_until + 'T23:59:59').toISOString(),
    });
    setSaving(false);

    if (!result) {
      setErr('Could not create code — it may already exist.');
      return;
    }
    await logAudit(user, 'promo.create', 'promo_code', result.id, code, {
      discount, billing_cycle: form.billing_cycle, max_uses: maxUses,
    });
    resetForm();
    setShowForm(false);
    load();
  };

  const toggleActive = async (promo) => {
    const willBeActive = !promo.active;
    await db.patch('promo_codes', promo.id, { active: willBeActive });
    await logAudit(user, willBeActive ? 'promo.enable' : 'promo.disable', 'promo_code', promo.id, promo.code);
    load();
  };

  const PLAN_LABEL = { monthly: 'Monthly (₦10,000)', yearly: 'Yearly (₦86,000)', termly: 'Termly (₦28,500)' };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>⏳</div>
      <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>Loading promo codes…</div>
    </div>;
  }

  return (
    <div>
      {!showForm && (
        <button onClick={() => setShowForm(true)}
          style={{ width: '100%', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>
          + Generate New Promo Code
        </button>
      )}

      {showForm && (
        <div style={{ background: '#fff', border: '1.5px solid #fecaca', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', marginBottom: 12 }}>New Promo Code</div>

          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Code</label>
          <div style={{ display: 'flex', gap: 8, margin: '6px 0 12px' }}>
            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="e.g. END-OF-TERM"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
            <button onClick={generateRandomCode} type="button"
              style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 10, padding: '0 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              🎲 Generate
            </button>
          </div>

          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Billing cycle</label>
          <select value={form.billing_cycle} onChange={e => setForm({ ...form, billing_cycle: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }}>
            {Object.entries(PLAN_LABEL).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>

          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Discount amount (₦)</label>
          <input type="number" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })}
            placeholder="e.g. 3500"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }} />

          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Max uses</label>
          <input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }} />

          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Valid until</label>
          <input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }} />

          {err && <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setShowForm(false); resetForm(); }} disabled={saving}
              style={{ flex: 1, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={createCode} disabled={saving}
              style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Code'}
            </button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>
        {codes.length} code{codes.length !== 1 ? 's' : ''}
      </div>

      {codes.map(promo => {
        const isExpired = new Date(promo.valid_until) < new Date();
        const isExhausted = promo.times_used >= promo.max_uses;
        const isLive = promo.active && !isExpired && !isExhausted;
        return (
          <div key={promo.id} style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px #0000000a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b', letterSpacing: '0.02em' }}>{promo.code}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  ₦{Number(promo.discount).toLocaleString()} off · {promo.billing_cycle}
                </div>
              </div>
              <div style={{
                background: isLive ? '#f0fdf4' : '#fef2f2',
                color: isLive ? '#16a34a' : '#dc2626',
                fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap'
              }}>
                {!promo.active ? 'Disabled' : isExpired ? 'Expired' : isExhausted ? 'Used up' : 'Live'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                {promo.times_used}/{promo.max_uses} used · expires {new Date(promo.valid_until).toLocaleDateString('en-NG')}
              </div>
              <button onClick={() => toggleActive(promo)}
                style={{ background: 'none', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
                {promo.active ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        );
      })}

      {codes.length === 0 && !showForm &&
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
          No promo codes yet
        </div>}
    </div>
  );
}

// ── Announcements (Super Admin builder) ─────────────────────────────
function Announcements({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const blankForm = {
    message: '', severity: 'info', audience: 'all',
    link_label: '', link_target: '',
    starts_at: '', ends_at: '',
  };
  const [form, setForm] = useState(blankForm);

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    const data = await db.get('announcements');
    data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setItems(data);
    setLoading(false);
  };

  const resetForm = () => { setForm(blankForm); setErr(''); };

  const createAnnouncement = async () => {
    if (!form.message.trim()) { setErr('Enter a message'); return; }
    if (!form.starts_at || !form.ends_at) { setErr('Pick start and end dates'); return; }
    if (new Date(form.ends_at) <= new Date(form.starts_at)) { setErr('End date must be after start date'); return; }
    // Only one of link_label/link_target filled is an incomplete link — catch it
    // before saving rather than silently producing a banner with a dead button.
    if ((form.link_label && !form.link_target) || (!form.link_label && form.link_target)) {
      setErr('Fill both link label and link target, or leave both blank'); return;
    }

    setSaving(true);
    setErr('');
    const result = await db.post('announcements', {
      message: form.message.trim(),
      severity: form.severity,
      audience: form.audience,
      link_label: form.link_label.trim() || null,
      link_target: form.link_target.trim() || null,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at + 'T23:59:59').toISOString(),
      active: true,
    });
    setSaving(false);

    if (!result) { setErr('Could not create announcement.'); return; }
    await logAudit(user, 'announcement.create', 'announcement', result.id, form.message.trim().slice(0, 60), {
      severity: form.severity, audience: form.audience,
    });
    resetForm();
    setShowForm(false);
    load();
  };

  const toggleActive = async (item) => {
    const willBeActive = !item.active;
    await db.patch('announcements', item.id, { active: willBeActive });
    await logAudit(user, willBeActive ? 'announcement.enable' : 'announcement.disable', 'announcement', item.id, item.message?.slice(0, 60));
    load();
  };

  const deleteAnnouncement = async (item) => {
    await db.delete('announcements', item.id);
    await logAudit(user, 'announcement.delete', 'announcement', item.id, item.message?.slice(0, 60));
    load();
  };

  const SEVERITY_STYLE = {
    info:    { label: 'Info',    color: '#0ea5e9', bg: '#f0f9ff' },
    warning: { label: 'Warning', color: '#d97706', bg: '#fffbeb' },
    urgent:  { label: 'Urgent',  color: '#dc2626', bg: '#fef2f2' },
  };
  const AUDIENCE_LABEL = { all: 'Everyone', principal: 'Principals only', teacher: 'Teachers only' };

  const now = new Date();
  const statusFor = (item) => {
    if (!item.active) return { label: 'Disabled', color: '#78716c', bg: '#f5f5f4' };
    if (new Date(item.ends_at) < now) return { label: 'Ended', color: '#78716c', bg: '#f5f5f4' };
    if (new Date(item.starts_at) > now) return { label: 'Scheduled', color: '#7c3aed', bg: '#f5f3ff' };
    return { label: 'Showing now', color: '#16a34a', bg: '#f0fdf4' };
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>⏳</div>
      <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>Loading announcements…</div>
    </div>;
  }

  return (
    <div>
      {!showForm && (
        <button onClick={() => setShowForm(true)}
          style={{ width: '100%', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>
          + New Announcement
        </button>
      )}

      {showForm && (
        <div style={{ background: '#fff', border: '1.5px solid #fecaca', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b', marginBottom: 12 }}>New Announcement</div>

          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Message</label>
          <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
            placeholder="e.g. Termly promo ends Friday — renew now to lock in ₦25,000"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />

          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Severity</label>
          <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }}>
            <option value="info">Info (blue)</option>
            <option value="warning">Warning (amber)</option>
            <option value="urgent">Urgent (red)</option>
          </select>

          <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Audience</label>
          <select value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }}>
            <option value="all">Everyone</option>
            <option value="principal">Principals only</option>
            <option value="teacher">Teachers only</option>
          </select>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Link label (optional)</label>
              <input value={form.link_label} onChange={e => setForm({ ...form, link_label: e.target.value })}
                placeholder="Renew now"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Goes to tab</label>
              <select value={form.link_target} onChange={e => setForm({ ...form, link_target: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }}>
                <option value="">— none —</option>
                <option value="billing">Billing</option>
                <option value="settings">Settings</option>
                <option value="overview">Overview</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Starts</label>
              <input type="date" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Ends</label>
              <input type="date" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }} />
            </div>
          </div>

          {err && <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setShowForm(false); resetForm(); }} disabled={saving}
              style={{ flex: 1, background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={createAnnouncement} disabled={saving}
              style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>
        {items.length} announcement{items.length !== 1 ? 's' : ''}
      </div>

      {items.map(item => {
        const sev = SEVERITY_STYLE[item.severity] || SEVERITY_STYLE.info;
        const status = statusFor(item);
        return (
          <div key={item.id} style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px #0000000a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600, flex: 1 }}>{item.message}</div>
              <div style={{ background: status.bg, color: status.color, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {status.label}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
              <span style={{ color: sev.color, fontWeight: 700 }}>{sev.label}</span>
              <span>{AUDIENCE_LABEL[item.audience]}</span>
              <span>{new Date(item.starts_at).toLocaleDateString('en-NG')} → {new Date(item.ends_at).toLocaleDateString('en-NG')}</span>
              {item.link_label && <span>🔗 {item.link_label}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => toggleActive(item)}
                style={{ flex: 1, background: 'none', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', cursor: 'pointer' }}>
                {item.active ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => deleteAnnouncement(item)}
                style={{ flex: 1, background: 'none', border: '1.5px solid #fecaca', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {items.length === 0 && !showForm &&
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
          No announcements yet
        </div>}
    </div>
  );
}

// ── Announcement banner display (used on Principal/Teacher dashboards) ──
// Exported separately so App.js can render it inside SidebarLayout
// without SuperAdminDash itself needing to be involved.
export function AnnouncementBanners({ role, onNavigate }) {
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('dismissed_announcements') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    db.get('announcements').then(data => {
      const now = new Date();
      const visible = data.filter(a =>
        a.active &&
        new Date(a.starts_at) <= now &&
        new Date(a.ends_at) >= now &&
        (a.audience === 'all' || a.audience === role)
      );
      setItems(visible);
    });
  }, [role]);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { sessionStorage.setItem('dismissed_announcements', JSON.stringify(next)); } catch {}
  };

  const SEVERITY_STYLE = {
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
    urgent:  { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  };

  const visible = items.filter(i => !dismissed.includes(i.id));
  if (!visible.length) return null;

  return (
    <div style={{ padding: '10px 16px 0' }}>
      {visible.map(item => {
        const sev = SEVERITY_STYLE[item.severity] || SEVERITY_STYLE.info;
        return (
          <div key={item.id} style={{
            background: sev.bg, border: `1.5px solid ${sev.border}`, borderRadius: 12,
            padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10
          }}>
            <div style={{ flex: 1, fontSize: 13, color: sev.text, fontWeight: 600 }}>{item.message}</div>
            {item.link_label && item.link_target && onNavigate && (
              <button onClick={() => onNavigate(item.link_target)}
                style={{ background: sev.text, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {item.link_label}
              </button>
            )}
            <button onClick={() => dismiss(item.id)}
              style={{ background: 'none', border: 'none', color: sev.text, fontSize: 16, fontWeight: 700, cursor: 'pointer', padding: '0 4px', opacity: 0.6 }}>
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────
export default function SuperAdminDash({ user, onLogout }) {
  const [tab, setTab] = useState('schools');

  return (
    <SuperAdminLayout user={user} onLogout={onLogout} tab={tab} setTab={setTab}>
      {tab === 'schools' && <SchoolsList user={user} />}
      {tab === 'revenue' && <Revenue />}
      {tab === 'activity' && <ActivityLog />}
      {tab === 'health' && <SystemHealth />}
      {tab === 'promos' && <PromoCodes user={user} />}
      {tab === 'announcements' && <Announcements user={user} />}
    </SuperAdminLayout>
  );
}

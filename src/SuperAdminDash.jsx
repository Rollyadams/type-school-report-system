import { useState, useEffect } from 'react';
import { db } from './supabaseClient';

// ── Shared layout for the Super Admin dashboard ──────────────────
// Deliberately standalone (does not reuse SidebarLayout) so that
// changes here can never affect PrincipalDash / TeacherDash, which
// depend on SidebarLayout's existing role branching in production.
function SuperAdminLayout({ user, onLogout, tab, setTab, children }) {
  const tabs = [
    { id: 'schools', label: 'Schools', icon: '🏫' },
    { id: 'promos',  label: 'Promo Codes', icon: '🏷️' },
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
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 62, zIndex: 90 }}>
        {tabs.map(t => {
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, padding: '12px 8px', border: 'none', background: 'none', cursor: 'pointer',
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
function SchoolsList() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

      {filtered.map(school => {
        const status = statusFor(school);
        return (
          <div key={school.id} style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px #0000000a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
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
          </div>
        );
      })}

      {filtered.length === 0 &&
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>
          No schools match "{search}"
        </div>}
    </div>
  );
}

// ── Promo Codes ───────────────────────────────────────────────────
function PromoCodes() {
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
    resetForm();
    setShowForm(false);
    load();
  };

  const toggleActive = async (promo) => {
    await db.patch('promo_codes', promo.id, { active: !promo.active });
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
          <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="e.g. END-OF-TERM"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, margin: '6px 0 12px', boxSizing: 'border-box' }} />

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

// ── Main export ───────────────────────────────────────────────────
export default function SuperAdminDash({ user, onLogout }) {
  const [tab, setTab] = useState('schools');

  return (
    <SuperAdminLayout user={user} onLogout={onLogout} tab={tab} setTab={setTab}>
      {tab === 'schools' && <SchoolsList />}
      {tab === 'promos' && <PromoCodes />}
    </SuperAdminLayout>
  );
}

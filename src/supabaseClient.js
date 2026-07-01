import { createClient } from '@supabase/supabase-js';
import { offlineDB } from './offlineDB';
import { enqueue, readCache } from './syncEngine';
import * as Sentry from '@sentry/react';

const supabaseUrl     = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let _userId   = null;
let _schoolId = null;
let _sessionToken = null; // HMAC-signed token issued by secure-session edge function

const SESSION_FN = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/secure-session`;

// Issue a server-signed session token after login.
// Replaces the plain x-app-user-id header which any user could forge.
export async function issueSessionToken(userId) {
  try {
    const res = await fetch(SESSION_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
      body: JSON.stringify({ action: 'issue', userId }),
    });
    const data = await res.json();
    if (data.token) {
      _sessionToken = data.token;
      return data.token;
    }
  } catch (e) {
    console.error('Session token issue failed:', e);
  }
  return null;
}

// Custom fetch: stamps every request with the signed session token.
// Server-side RLS reads 'x-session-token' and verifies the HMAC signature
// before trusting userId/schoolId — cannot be forged by a client.
const fetchWithSessionToken = (url, options = {}) => {
  const headers = new Headers(options.headers || {});
  if (_sessionToken) headers.set('x-session-token', _sessionToken);
  // Keep x-app-user-id as fallback during migration only.
  // Remove this line once all RLS policies are updated to use x-session-token.
  if (_userId) headers.set('x-app-user-id', _userId);
  return fetch(url, { ...options, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithSessionToken },
});

export function setUserContext(userId, schoolId) {
  _userId = userId; _schoolId = schoolId;
}

export function clearUserContext() {
  _userId = null; _schoolId = null; _sessionToken = null;
}

export async function activateUserContext(userId) {
  try {
    _userId = userId;
    const { data } = await supabase.from('users').select('id,school_id').eq('id', userId).single();
    if (data) { _userId = data.id; _schoolId = data.school_id; }
    // Issue signed session token — replaces plain header for RLS verification
    await issueSessionToken(userId);
  } catch (e) {}
}

const CACHEABLE = {
  students:         'students_cache',
  classes:          'classes_cache',
  terms:            'terms_cache',
  results:          'results_cache',
  attendance:       'attendance_cache',
  daily_attendance: 'daily_att_cache',
  timetable:        'timetable_cache',
  remarks:          'remarks_cache',
};

const QUEUEABLE = ['results', 'attendance', 'daily_attendance', 'timetable', 'remarks'];

export const db = {
  get: async (table, filters = null) => {
    const cacheTable = CACHEABLE[table];
    if (!navigator.onLine && cacheTable) {
      try { return await readCache(cacheTable, filters); } catch (e) {}
    }
    let query = supabase.from(table).select('*');
    if (filters) {
      Object.entries(filters).forEach(([col, val]) => {
        query = Array.isArray(val) ? query.in(col, val) : query.eq(col, val);
      });
    }
    let data, error;
    try {
      const result = await Promise.race([
        query,
        new Promise((_, reject) => setTimeout(() => reject(new Error('db.get network timeout')), 10000)),
      ]);
      data = result.data; error = result.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      if (cacheTable) { try { return await readCache(cacheTable, filters); } catch (e) {} }
      return [];
    }
    if (data && cacheTable) { try { await offlineDB[cacheTable].bulkPut(data); } catch (e) {} }
    return data || [];
  },

  post: async (table, payload) => {
    if (!navigator.onLine && QUEUEABLE.includes(table)) {
      const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const record = { ...payload, id: tempId, _offline: true };
      const cacheTable = CACHEABLE[table];
      if (cacheTable) { try { await offlineDB[cacheTable].put(record); } catch (e) {} }
      await enqueue(table, 'insert', payload);
      return record;
    }
    let data, error;
    try {
      const result = await Promise.race([
        supabase.from(table).insert(payload).select().single(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('db.post network timeout')), 10000)),
      ]);
      data = result.data; error = result.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      if (QUEUEABLE.includes(table)) {
        const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        const record = { ...payload, id: tempId, _offline: true };
        const cacheTable = CACHEABLE[table];
        if (cacheTable) { try { await offlineDB[cacheTable].put(record); } catch (e) {} }
        await enqueue(table, 'insert', payload);
        return record;
      }
      console.error('db.post error:', error.message, table);
      Sentry.captureException(new Error(`db.post [${table}]: ${error.message}`));
      return null;
    }
    const cacheTable = CACHEABLE[table];
    if (data && cacheTable) { try { await offlineDB[cacheTable].put(data); } catch (e) {} }
    return data;
  },

  patch: async (table, id, payload) => {
    const full = { ...payload, id };
    if (!navigator.onLine && QUEUEABLE.includes(table)) {
      const cacheTable = CACHEABLE[table];
      if (cacheTable) { try { await offlineDB[cacheTable].update(id, payload); } catch (e) {} }
      await enqueue(table, 'update', full);
      return full;
    }
    let data, error;
    try {
      const result = await Promise.race([
        supabase.from(table).update(payload).eq('id', id).select().single(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('db.patch network timeout')), 10000)),
      ]);
      data = result.data; error = result.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      if (QUEUEABLE.includes(table)) {
        const cacheTable = CACHEABLE[table];
        if (cacheTable) { try { await offlineDB[cacheTable].update(id, payload); } catch (e) {} }
        await enqueue(table, 'update', full);
        return full;
      }
      console.error('db.patch error:', error.message, table);
      Sentry.captureException(new Error(`db.patch [${table}]: ${error.message}`));
      return null;
    }
    const cacheTable = CACHEABLE[table];
    if (data && cacheTable) { try { await offlineDB[cacheTable].put(data); } catch (e) {} }
    return data;
  },

  upsert: async (table, payload, conflictCol) => {
    const col = conflictCol || 'id';
    if (!navigator.onLine && QUEUEABLE.includes(table)) {
      const cacheTable = CACHEABLE[table];
      if (cacheTable) { try { await offlineDB[cacheTable].put(payload); } catch (e) {} }
      await enqueue(table, 'upsert', payload, col);
      return payload;
    }
    let data, error;
    try {
      const result = await Promise.race([
        supabase.from(table).upsert(payload, { onConflict: col }).select().single(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('db.upsert network timeout')), 10000)),
      ]);
      data = result.data; error = result.error;
    } catch (e) {
      error = e;
    }
    if (error) {
      if (QUEUEABLE.includes(table)) {
        const cacheTable = CACHEABLE[table];
        if (cacheTable) { try { await offlineDB[cacheTable].put(payload); } catch (e) {} }
        await enqueue(table, 'upsert', payload, col);
        return payload;
      }
      console.error('db.upsert error:', error.message, table);
      Sentry.captureException(new Error(`db.upsert [${table}]: ${error.message}`));
      return null;
    }
    const cacheTable = CACHEABLE[table];
    if (data && cacheTable) { try { await offlineDB[cacheTable].put(data); } catch (e) {} }
    return data;
  },

  delete: async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.error('db.delete error:', error.message);
      Sentry.captureException(new Error(`db.delete [${table}]: ${error.message}`));
    }
    const cacheTable = CACHEABLE[table];
    if (cacheTable) { try { await offlineDB[cacheTable].delete(id); } catch (e) {} }
  },
};

import { createClient } from '@supabase/supabase-js';
import { offlineDB } from './offlineDB';
import { enqueue, readCache } from './syncEngine';
import * as Sentry from '@sentry/react';

const supabaseUrl     = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let _userId   = null;
let _schoolId = null;

export function setUserContext(userId, schoolId) {
  _userId = userId; _schoolId = schoolId;
}

export function clearUserContext() {
  _userId = null; _schoolId = null;
}

export async function activateUserContext(userId) {
  try {
    const { data } = await supabase.from('users').select('id,school_id').eq('id', userId).single();
    if (data) { _userId = data.id; _schoolId = data.school_id; }
    await supabase.rpc('set_user_context', { uid: userId });
  } catch (e) {}
}

async function ensureContext() {
  if (!_userId) return;
  try {
    await Promise.race([
      supabase.rpc('set_user_context', { uid: _userId }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ensureContext timeout')), 5000)),
    ]);
  } catch (e) {
    // Non-fatal: if context-setting hangs or fails, proceed anyway —
    // RLS will simply reject the query below if context wasn't set,
    // which db.post/get already handle as a normal error case.
  }
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
    await ensureContext();
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
    await ensureContext();
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
    await ensureContext();
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
    await ensureContext();
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
    await ensureContext();
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.error('db.delete error:', error.message);
      Sentry.captureException(new Error(`db.delete [${table}]: ${error.message}`));
    }
    const cacheTable = CACHEABLE[table];
    if (cacheTable) { try { await offlineDB[cacheTable].delete(id); } catch (e) {} }
  },
};

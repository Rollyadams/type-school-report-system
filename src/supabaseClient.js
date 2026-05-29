import { createClient } from '@supabase/supabase-js';
import { offlineDB } from './offlineDB';
import { enqueue, readCache } from './syncEngine';

const supabaseUrl     = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function activateUserContext(userId) {
  try { await supabase.rpc('set_user_context', { uid: userId }); } catch (e) {}
}

const CACHEABLE = {
  students:        'students_cache',
  classes:         'classes_cache',
  terms:           'terms_cache',
  results:         'results_cache',
  attendance:      'attendance_cache',
  daily_attendance:'daily_att_cache',
};

const QUEUEABLE = ['results', 'attendance', 'daily_attendance'];

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
    const { data, error } = await query;
    if (error) {
      if (cacheTable) {
        try { return await readCache(cacheTable, filters); } catch (e) {}
      }
      return [];
    }
    if (data && cacheTable) {
      try { await offlineDB[cacheTable].bulkPut(data); } catch (e) {}
    }
    return data || [];
  },

  post: async (table, payload) => {
    if (!navigator.onLine && QUEUEABLE.includes(table)) {
      const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const record = { ...payload, id: tempId, _offline: true };
      const cacheTable = CACHEABLE[table];
      if (cacheTable) {
        try { await offlineDB[cacheTable].put(record); } catch (e) {}
      }
      await enqueue(table, 'insert', payload);
      return record;
    }
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) {
      if (QUEUEABLE.includes(table)) {
        const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const record = { ...payload, id: tempId, _offline: true };
        const cacheTable = CACHEABLE[table];
        if (cacheTable) { try { await offlineDB[cacheTable].put(record); } catch (e) {} }
        await enqueue(table, 'insert', payload);
        return record;
      }
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
      if (cacheTable) {
        try { await offlineDB[cacheTable].update(id, payload); } catch (e) {}
      }
      await enqueue(table, 'update', full);
      return full;
    }
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
    if (error) {
      if (QUEUEABLE.includes(table)) {
        const cacheTable = CACHEABLE[table];
        if (cacheTable) { try { await offlineDB[cacheTable].update(id, payload); } catch (e) {} }
        await enqueue(table, 'update', full);
        return full;
      }
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
    const { data, error } = await supabase.from(table).upsert(payload, { onConflict: col }).select().single();
    if (error) {
      if (QUEUEABLE.includes(table)) {
        const cacheTable = CACHEABLE[table];
        if (cacheTable) { try { await offlineDB[cacheTable].put(payload); } catch (e) {} }
        await enqueue(table, 'upsert', payload, col);
        return payload;
      }
      return null;
    }
    const cacheTable = CACHEABLE[table];
    if (data && cacheTable) { try { await offlineDB[cacheTable].put(data); } catch (e) {} }
    return data;
  },

  delete: async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) console.error('db.delete error:', error.message);
    const cacheTable = CACHEABLE[table];
    if (cacheTable) { try { await offlineDB[cacheTable].delete(id); } catch (e) {} }
  },
};

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '❌ Supabase env vars missing. Create a .env file with:\n' +
    'REACT_APP_SUPABASE_URL=...\n' +
    'REACT_APP_SUPABASE_ANON_KEY=...'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Activate RLS user context after login ─────────────────────
// Call this once after the user object is resolved.
// Sets app.user_id in Postgres so RLS policies can identify the caller.
export async function activateUserContext(userId) {
  try {
    await supabase.rpc('set_user_context', { uid: userId });
  } catch (e) {
    console.warn('[RLS] Could not set user context:', e.message);
  }
}

// ── Generic helpers ───────────────────────────────────────────

export const db = {
  get: async (table, filters = null) => {
    let query = supabase.from(table).select('*');
    if (filters) {
      Object.entries(filters).forEach(([col, val]) => {
        if (Array.isArray(val)) {
          query = query.in(col, val);
        } else {
          query = query.eq(col, val);
        }
      });
    }
    const { data, error } = await query;
    if (error) {
      console.error(`db.get(${table}) error:`, error.message);
      return [];
    }
    return data || [];
  },

  post: async (table, payload) => {
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error(`db.post(${table}) error:`, error.message);
      return null;
    }
    return data;
  },

  patch: async (table, id, payload) => {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error(`db.patch(${table}) error:`, error.message);
      return null;
    }
    return data;
  },

  delete: async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.error(`db.delete(${table}) error:`, error.message);
    }
  },

  upsert: async (table, payload, conflictCol = 'id') => {
    const { data, error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: conflictCol })
      .select()
      .single();
    if (error) {
      console.error(`db.upsert(${table}) error:`, error.message);
      return null;
    }
    return data;
  },
};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '❌ Supabase env vars missing. Create a .env file with:\n' +
    'REACT_APP_SUPABASE_URL=...\n' +
    'REACT_APP_SUPABASE_ANON_KEY=...'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Generic helpers used throughout the app ──────────────────

export const db = {
  /**
   * Fetch all rows from a table, with optional filters.
   * filters: object e.g. { role: 'teacher' } or null
   */
  get: async (table, filters = null) => {
    let query = supabase.from(table).select('*');
    if (filters) {
      Object.entries(filters).forEach(([col, val]) => {
        if (Array.isArray(val)) {
          query = query.in(col, val);
        } else {
          query = query.eq(col, val);
        }
      });
    }
    const { data, error } = await query;
    if (error) {
      console.error(`db.get(${table}) error:`, error.message);
      return [];
    }
    return data || [];
  },

  /** Insert a row and return the inserted record. */
  post: async (table, payload) => {
    const { data, error } = await supabase
      .from(table)
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error(`db.post(${table}) error:`, error.message);
      return null;
    }
    return data;
  },

  /** Update a row by id and return the updated record. */
  patch: async (table, id, payload) => {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error(`db.patch(${table}) error:`, error.message);
      return null;
    }
    return data;
  },

  /** Delete a row by id. */
  delete: async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.error(`db.delete(${table}) error:`, error.message);
    }
  },

  /**
   * Upsert (insert or update) based on a conflict column.
   * conflictCol: column name to match on, e.g. 'id'
   */
  upsert: async (table, payload, conflictCol = 'id') => {
    const { data, error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: conflictCol })
      .select()
      .single();
    if (error) {
      console.error(`db.upsert(${table}) error:`, error.message);
      return null;
    }
    return data;
  },
};

import { useState, useEffect, useCallback } from 'react';
import { offlineDB } from './offlineDB';
import { supabase } from './supabaseClient';

const MAX_RETRIES = 5;

export async function enqueue(table, operation, payload, conflictCol) {
  await offlineDB.queue.add({
    table,
    operation,
    payload,
    conflictCol: conflictCol || null,
    status: 'pending',
    retries: 0,
    created_at: new Date().toISOString(),
    last_attempt: null,
    error: null,
  });
}

async function processItem(item) {
  await offlineDB.queue.update(item.id, { status: 'syncing', last_attempt: new Date().toISOString() });
  try {
    let error;
    if (item.operation === 'insert') {
      ({ error } = await supabase.from(item.table).insert(item.payload));
    } else if (item.operation === 'update') {
      ({ error } = await supabase.from(item.table).update(item.payload).eq('id', item.payload.id));
    } else if (item.operation === 'upsert') {
      ({ error } = await supabase.from(item.table).upsert(item.payload, { onConflict: item.conflictCol || 'id' }));
    }
    if (error) throw error;
    await offlineDB.queue.update(item.id, { status: 'synced', error: null });
    return true;
  } catch (err) {
    const retries = item.retries + 1;
    const status = retries >= MAX_RETRIES ? 'failed' : 'pending';
    await offlineDB.queue.update(item.id, { status, retries, error: err.message });
    return false;
  }
}

export async function flushQueue() {
  const pending = await offlineDB.queue.where('status').equals('pending').toArray();
  if (!pending.length) return { synced: 0, failed: 0 };
  let synced = 0, failed = 0;
  for (const item of pending) {
    const ok = await processItem(item);
    ok ? synced++ : failed++;
  }
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await offlineDB.queue.where('status').equals('synced').and(i => i.created_at < cutoff).delete();
  return { synced, failed };
}

export async function getPendingCount() {
  return offlineDB.queue.where('status').anyOf(['pending', 'syncing']).count();
}

export async function getFailedCount() {
  return offlineDB.queue.where('status').equals('failed').count();
}

export async function retryFailed() {
  await offlineDB.queue.where('status').equals('failed').modify({ status: 'pending', retries: 0, error: null });
  return flushQueue();
}

export function useSyncEngine() {
  const [online, setOnline]         = useState(navigator.onLine);
  const [pendingCount, setPending]  = useState(0);
  const [failedCount, setFailed]    = useState(0);
  const [syncing, setSyncing]       = useState(false);
  const [lastSync, setLastSync]     = useState(null);

  const refresh = useCallback(async () => {
    setPending(await getPendingCount());
    setFailed(await getFailedCount());
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const result = await flushQueue();
    await refresh();
    setSyncing(false);
    if (result.synced > 0) setLastSync(new Date());
    return result;
  }, [refresh]);

  useEffect(() => {
    refresh();
    const onOnline  = async () => { setOnline(true);  await flush(); };
    const onOffline = () => { setOnline(false); refresh(); };
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    const interval = setInterval(async () => { if (navigator.onLine) await flush(); }, 30000);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, [flush, refresh]);

  return { online, pendingCount, failedCount, syncing, lastSync, flush, refresh, retryFailed };
}

export async function seedCache(table, cacheTable, data) {
  await offlineDB[cacheTable].bulkPut(data);
}

export async function readCache(cacheTable, filters) {
  let col = offlineDB[cacheTable];
  if (!filters) return col.toArray();
  const entries = Object.entries(filters);
  if (entries.length === 1) {
    const [key, val] = entries[0];
    if (Array.isArray(val)) return col.where(key).anyOf(val).toArray();
    return col.where(key).equals(val).toArray();
  }
  const [key, val] = entries[0];
  let q = Array.isArray(val) ? col.where(key).anyOf(val) : col.where(key).equals(val);
  return q.toArray().then(rows =>
    rows.filter(r => entries.slice(1).every(([k, v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v))
  );
}

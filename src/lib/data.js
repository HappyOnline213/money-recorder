import { supabase } from './supabase';

// ─── Date helpers: weeks run Sunday → Saturday ─────────────────────
export const startOfWeek = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
};
export const iso = (d) => {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const monthKey = (d) => iso(d).slice(0, 7);
export const fmt = (n) => `RM${Number(n).toFixed(2)}`;
export const prettyDate = (d) =>
  new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
export const prettyMonth = (mk) =>
  new Date(`${mk}-01`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });

export const DEFAULT_SETTINGS = {
  weeklyAllowance: 500,
  savingsRate: 0.10,
  budgets: { overall: 450, categories: { 'Games related': 50 } },
  categories: [
    'Food and Beverages',
    'Car petrol and Cleaning',
    'Games related',
    'Education Related',
  ],
  presets: [
    { id: 'bt', label: 'Bubble Tea', price: 8.40, cap: 7, category: 'Food and Beverages' },
    { id: 'cf', label: 'Coffee', price: 3.30, cap: 7, category: 'Food and Beverages' },
  ],
  subs: [
    { id: 's1', label: 'Claude Pro', price: 80.87, day: 1, category: 'Education Related' },
    { id: 's2', label: 'Gemini AI Plus', price: 11.99, day: 1, category: 'Education Related' },
    { id: 's3', label: 'YouTube Premium', price: 12.90, day: 1, category: 'Games related' },
    { id: 's4', label: 'Discord Nitro', price: 31.99, day: 5, category: 'Games related' },
  ],
  friends: ['Chloe', 'Weide'],
};

// ─── Load everything for the signed-in user ────────────────────────
export async function loadAll(userId) {
  const [st, tx, bl, fl] = await Promise.all([
    supabase.from('settings').select('data').eq('user_id', userId).maybeSingle(),
    supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('bills').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('flows').select('*').eq('user_id', userId).order('date', { ascending: false }),
  ]);
  const err = st.error || tx.error || bl.error || fl.error;
  if (err) throw err;

  let settings = st.data?.data;
  if (!settings) {
    settings = DEFAULT_SETTINGS;
    await supabase.from('settings').insert({ user_id: userId, data: settings });
  } else {
    // Backfill any keys added after the user's row was created.
    settings = { ...DEFAULT_SETTINGS, ...settings };
  }
  return {
    settings,
    txns: (tx.data ?? []).map(numTxn),
    bills: (bl.data ?? []).map(numBill),
    flows: (fl.data ?? []).map(numFlow),
  };
}

// Postgres numerics arrive as strings; normalize once at the edge.
const numTxn = (t) => ({
  ...t,
  amount: Number(t.amount),
  fronted: t.fronted == null ? null : Number(t.fronted),
});
const numBill = (b) => ({
  ...b,
  owed: Number(b.owed),
  received: Number(b.received),
  write_off: Number(b.write_off),
  waiting: b.waiting ?? [],
  paid: b.paid ?? [],
});
const numFlow = (f) => ({
  ...f,
  amount: Number(f.amount),
  to_savings: Number(f.to_savings),
});

export async function saveSettings(userId, data) {
  const { error } = await supabase
    .from('settings')
    .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function insertTxn(userId, txn) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...txn, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return numTxn(data);
}

export async function deleteTxnRow(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function insertBill(userId, bill) {
  const { data, error } = await supabase
    .from('bills')
    .insert({ ...bill, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return numBill(data);
}

export async function updateBill(id, patch) {
  const { data, error } = await supabase
    .from('bills')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return numBill(data);
}

export async function deleteBillRow(id) {
  const { error } = await supabase.from('bills').delete().eq('id', id);
  if (error) throw error;
}

export async function insertFlow(userId, flow) {
  const { data, error } = await supabase
    .from('flows')
    .insert({ ...flow, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return numFlow(data);
}

// ─── Derivations ───────────────────────────────────────────────────
// Everything below is computed from the event log, so deleting a row
// self-corrects every balance, debt, count, and report.

export function deriveBalances(txns, flows) {
  let allowance = 0;
  let savings = 0;
  for (const f of flows) {
    if (f.kind === 'allowance_in') { allowance += f.amount; savings += f.to_savings; }
    else if (f.kind === 'income') { allowance += f.amount - f.to_savings; savings += f.to_savings; }
    else if (f.kind === 'transfer') { allowance += f.amount; savings -= f.amount; }
    else if (f.kind === 'settle_pay') { allowance -= f.amount; }
    else if (f.kind === 'settle_receive') { allowance += f.amount; }
  }
  for (const t of txns) {
    if (t.account === 'savings') savings -= t.amount;
    else if (t.paid_by) { /* friend's money — balance untouched */ }
    else allowance -= (t.fronted ?? t.amount);
  }
  return { allowance, savings };
}

export function deriveDebts(txns, flows, friends) {
  const debts = {};
  for (const f of friends) debts[f] = 0;
  for (const t of txns) {
    if (t.paid_by) debts[t.paid_by] = (debts[t.paid_by] || 0) + t.amount;
  }
  for (const f of flows) {
    if (f.kind === 'settle_pay' && f.who) {
      debts[f.who] = Math.max((debts[f.who] || 0) - f.amount, 0);
    }
  }
  return debts;
}

export function deriveCounts(txns, presets, mk) {
  const counts = {};
  for (const p of presets) {
    counts[p.id] = txns.filter(
      (t) => t.preset_id === p.id && monthKey(t.date) === mk
    ).length;
  }
  return counts;
}

export function weekRange(offset) {
  const start = startOfWeek(new Date());
  start.setDate(start.getDate() + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

export function monthOf(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return monthKey(d);
}

export function txnsInWeek(txns, start, end) {
  return txns.filter((t) => {
    const d = new Date(t.date);
    return d >= start && d <= end && t.account === 'allowance';
  });
}

export function flowsInWeek(flows, start, end) {
  return flows.filter((f) => {
    const d = new Date(f.date);
    return d >= start && d <= end;
  });
}

import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from './lib/supabase';
import {
  loadAll, saveSettings, insertTxn, deleteTxnRow,
  insertBill, updateBill, deleteBillRow, insertFlow,
  deriveBalances, deriveDebts, deriveCounts,
  weekRange, monthOf, txnsInWeek, flowsInWeek,
  iso, monthKey, fmt, prettyDate, prettyMonth,
} from './lib/data';
import { exportXlsx } from './lib/exportXlsx';
import { S, CSS, PIE_COLORS } from './styles';

export default function App({ user }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState(null);
  const [txns, setTxns] = useState([]);
  const [bills, setBills] = useState([]);
  const [flows, setFlows] = useState([]);
  const [view, setView] = useState('today');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadAll(user.id)
      .then((d) => {
        setSettings(d.settings);
        setTxns(d.txns);
        setBills(d.bills);
        setFlows(d.flows);
        setLoaded(true);
      })
      .catch((e) => setLoadError(e.message || 'Failed to load'));
  }, [user.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Persist settings whenever they change (after initial load).
  const patchSettings = (next) => {
    setSettings(next);
    saveSettings(user.id, next).catch(() => setToast('Settings failed to save'));
  };

  const today = new Date();
  const thisWeek = weekRange(0);
  const thisMonth = monthOf(0);
  const weekKey = iso(thisWeek.start);

  // ─── Derived state — all from the event log ──────────────────────
  const { allowance, savings } = useMemo(
    () => deriveBalances(txns, flows), [txns, flows]
  );
  const debts = useMemo(
    () => deriveDebts(txns, flows, settings?.friends ?? []),
    [txns, flows, settings]
  );
  const counts = useMemo(
    () => deriveCounts(txns, settings?.presets ?? [], thisMonth),
    [txns, settings, thisMonth]
  );

  const currentWeekTxns = useMemo(
    () => txnsInWeek(txns, thisWeek.start, thisWeek.end),
    [txns, weekKey]
  );
  const weekSpent = currentWeekTxns.reduce((s, t) => s + t.amount, 0);
  const budgets = settings?.budgets ?? { overall: 0, categories: {} };
  const budgetPct = budgets.overall > 0 ? Math.min((weekSpent / budgets.overall) * 100, 100) : 0;
  const overBudget = weekSpent > budgets.overall;

  const weekByCat = useMemo(() => {
    const m = {};
    currentWeekTxns.forEach((t) => { m[t.category] = (m[t.category] || 0) + t.amount; });
    return m;
  }, [currentWeekTxns]);

  const creditedThisWeek = flows.some(
    (f) => f.kind === 'allowance_in' &&
      new Date(f.date) >= thisWeek.start && new Date(f.date) <= thisWeek.end
  );

  const budgetWarning = (amount, category) => {
    const msgs = [];
    const newTotal = weekSpent + amount;
    if (newTotal > budgets.overall) {
      msgs.push(
        weekSpent > budgets.overall
          ? `You're already past your ${fmt(budgets.overall)} weekly budget (${fmt(weekSpent)} spent).`
          : `This puts you over your ${fmt(budgets.overall)} weekly budget — ${fmt(newTotal)} total.`
      );
    }
    const catBudget = budgets.categories[category];
    if (catBudget != null) {
      const catNew = (weekByCat[category] || 0) + amount;
      if (catNew > catBudget) {
        msgs.push(`${category} goes to ${fmt(catNew)} of its ${fmt(catBudget)} budget.`);
      }
    }
    return msgs.length ? msgs.join(' ') : null;
  };

  // ─── Actions — DB write, then local state ────────────────────────
  const fail = () => setToast('Network problem — not saved');

  const addTxn = async (txn) => {
    try {
      const row = await insertTxn(user.id, txn);
      setTxns((prev) => [row, ...prev]);
      return row;
    } catch { fail(); return null; }
  };

  const addFlow = async (flow) => {
    try {
      const row = await insertFlow(user.id, flow);
      setFlows((prev) => [row, ...prev]);
      return row;
    } catch { fail(); return null; }
  };

  const logPreset = (p) => {
    const n = counts[p.id] ?? 0;
    const doLog = (over) => {
      addTxn({
        date: iso(today), amount: p.price, label: p.label,
        category: p.category, account: 'allowance', preset_id: p.id, over_cap: over,
      }).then((r) => r && setToast(`${p.label} logged — ${n + 1}/${p.cap}`));
    };
    if (n >= p.cap) {
      const bw = budgetWarning(p.price, p.category);
      setConfirm({
        title: `That's ${n + 1} this month`,
        body: `Your cap is ${p.cap}. Logging this puts you at ${n + 1}/${p.cap} — it'll show as an overshoot in this week's report.${bw ? ` Also: ${bw}` : ''}`,
        confirmLabel: 'Log it anyway',
        onConfirm: () => doLog(true),
      });
      return;
    }
    const bw = budgetWarning(p.price, p.category);
    if (bw) {
      setConfirm({ title: 'Over budget', body: bw, confirmLabel: 'Log it anyway', onConfirm: () => doLog(false) });
      return;
    }
    doLog(false);
  };

  const receiveAllowance = () => {
    const skim = settings.weeklyAllowance * settings.savingsRate;
    const spendable = settings.weeklyAllowance - skim;
    addFlow({ date: iso(today), kind: 'allowance_in', amount: spendable, to_savings: skim })
      .then((r) => r && setToast(`${fmt(spendable)} in — ${fmt(skim)} to Savings`));
  };

  const addIncome = (total, toSavings) => {
    addFlow({ date: iso(today), kind: 'income', amount: total, to_savings: toSavings })
      .then((r) => r && setToast(
        toSavings > 0
          ? `${fmt(total - toSavings)} to Allowance, ${fmt(toSavings)} to Savings`
          : `${fmt(total)} added to Allowance`
      ));
  };

  const transferToAllowance = (amount) => {
    addFlow({ date: iso(today), kind: 'transfer', amount })
      .then((r) => r && setToast(`${fmt(amount)} moved to Allowance`));
  };

  const logFriendPaid = (friend, share, category, label) => {
    addTxn({
      date: iso(today), amount: share, label: label || `Shared — ${category}`,
      category, account: 'allowance', paid_by: friend,
    }).then((r) => r && setToast(`${fmt(share)} logged — you owe ${friend}`));
  };

  const logIPaid = async (total, share, category, label, waiting) => {
    const owed = total - share;
    let billId = null;
    if (owed > 0) {
      try {
        const bill = await insertBill(user.id, {
          date: iso(today), label: label || category,
          owed, received: 0, waiting, paid: [], closed: false,
        });
        setBills((prev) => [bill, ...prev]);
        billId = bill.id;
      } catch { fail(); return; }
    }
    addTxn({
      date: iso(today), amount: share, label: label || `Shared — ${category}`,
      category, account: 'allowance', fronted: total, bill_id: billId,
    }).then((r) => r && setToast(`${fmt(share)} spent, ${fmt(owed)} owed to you`));
  };

  const settleFriend = (friend, amount) => {
    addFlow({ date: iso(today), kind: 'settle_pay', amount, who: friend })
      .then((r) => r && setToast(`Paid ${friend} ${fmt(amount)}`));
  };

  const closeBill = async (billId, writeOff = 0) => {
    try {
      const b = await updateBill(billId, {
        closed: true, closed_date: iso(new Date()), write_off: writeOff,
      });
      setBills((prev) => prev.map((x) => (x.id === billId ? b : x)));
      setToast(writeOff > 0 ? `${fmt(writeOff)} written off` : 'Bill closed');
    } catch { fail(); }
  };

  const receiveOnBill = async (billId, amount, names) => {
    const bill = bills.find((b) => b.id === billId);
    if (!bill || !amount || amount <= 0) return;
    const outstanding = bill.owed - bill.received;
    const amt = Math.min(amount, outstanding);
    const newWaiting = bill.waiting.filter((n) => !names.includes(n));
    const newPaid = [...bill.paid, ...names.filter((n) => bill.waiting.includes(n))];
    const newReceived = bill.received + amt;
    const newOutstanding = bill.owed - newReceived;

    const flow = await addFlow({ date: iso(today), kind: 'settle_receive', amount: amt, bill_id: billId });
    if (!flow) return;

    try {
      // Fully collected closes the bill even if someone wasn't ticked.
      if (newOutstanding <= 0.005) {
        const b = await updateBill(billId, {
          received: newReceived, waiting: [], paid: [...newPaid, ...newWaiting],
          closed: true, closed_date: iso(today), write_off: 0,
        });
        setBills((prev) => prev.map((x) => (x.id === billId ? b : x)));
        setToast('Bill fully settled');
        return;
      }
      const b = await updateBill(billId, {
        received: newReceived, waiting: newWaiting, paid: newPaid,
      });
      setBills((prev) => prev.map((x) => (x.id === billId ? b : x)));

      // Write-off prompt only when this receive cleared the last tagged person.
      if (bill.waiting.length > 0 && newWaiting.length === 0 && newOutstanding > 0.005) {
        setConfirm({
          title: 'Close this bill?',
          body: `Everyone's marked as paid, but ${fmt(newOutstanding)} never came in. Close it and write that off? It'll show in the monthly report.`,
          confirmLabel: 'Write off & close',
          onConfirm: () => closeBill(billId, newOutstanding),
        });
      } else {
        setToast(`${fmt(amt)} received`);
      }
    } catch { fail(); }
  };

  const deleteTxn = (t) => {
    if (t.fronted != null) {
      const bill = t.bill_id ? bills.find((b) => b.id === t.bill_id) : null;
      if (bill && (bill.received > 0 || bill.closed)) {
        setToast('Money was already received on this bill — can\u2019t delete');
        return;
      }
    }
    setConfirm({
      title: 'Delete this entry?',
      body: `${t.label} — ${fmt(t.amount)}${t.fronted != null ? ` (fronted ${fmt(t.fronted)})` : ''}. Balances, budgets, and counts will be corrected.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await deleteTxnRow(t.id);
          if (t.fronted != null && t.bill_id) {
            await deleteBillRow(t.bill_id);
            setBills((prev) => prev.filter((b) => b.id !== t.bill_id));
          }
          setTxns((prev) => prev.filter((x) => x.id !== t.id));
          setToast('Entry deleted');
        } catch { fail(); }
      },
    });
  };

  const spendConfirmed = (t) => {
    addTxn(t).then((r) => r && setToast(`${fmt(t.amount)} logged`));
  };

  // ─── Render ──────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div style={S.app}>
        <div style={{ ...S.overCard, margin: 20 }}>
          <div style={S.overTitle}>Couldn&apos;t load your data</div>
          <div style={S.overLine}>{loadError}</div>
          <div style={S.overLine}>Check your connection, then refresh. If it persists, make sure the schema.sql was run in Supabase.</div>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return <div style={S.app}><div style={S.empty}>Loading…</div></div>;
  }

  return (
    <div style={S.app}>
      <style>{CSS}</style>

      <header style={S.header}>
        <div style={S.balCard}>
          <div style={S.balLabel}>Allowance</div>
          <div style={S.balNum}>{fmt(allowance)}</div>
        </div>
        <div style={{ ...S.balCard, background: '#0f766e', border: 'none' }}>
          <div style={{ ...S.balLabel, color: 'rgba(255,255,255,0.75)' }}>Savings</div>
          <div style={{ ...S.balNum, color: '#fff' }}>{fmt(savings)}</div>
        </div>
      </header>

      <div style={S.budgetLine}>
        <span style={S.budgetText}>
          Week of {prettyDate(thisWeek.start)} · {fmt(weekSpent)} of {fmt(budgets.overall)} budget
        </span>
        {overBudget && <span style={S.budgetOver}>over</span>}
      </div>
      <div style={S.barTrack}>
        <div style={{
          ...S.barFill, width: `${budgetPct}%`,
          background: overBudget ? '#c2410c' : '#0f766e',
        }} />
      </div>

      <nav style={S.tabs}>
        {['today', 'split', 'week', 'month', 'setup'].map((v) => (
          <button
            key={v} onClick={() => setView(v)} className="tab"
            style={{ ...S.tab, ...(view === v ? S.tabOn : {}) }}
          >{v}</button>
        ))}
      </nav>

      <main style={S.main}>
        {view === 'today' && (
          <Today
            settings={settings} counts={counts} onLog={logPreset}
            savings={savings} onSpend={spendConfirmed}
            setConfirm={setConfirm} setToast={setToast}
            onReceive={receiveAllowance} creditedThisWeek={creditedThisWeek}
            onTransfer={transferToAllowance} onIncome={addIncome}
            budgetWarning={budgetWarning}
          />
        )}
        {view === 'split' && (
          <SplitView
            settings={settings} debts={debts} bills={bills}
            budgetWarning={budgetWarning}
            onFriendPaid={logFriendPaid} onIPaid={logIPaid}
            onSettle={settleFriend} onReceiveBill={receiveOnBill}
            onCloseBill={closeBill}
            setConfirm={setConfirm} setToast={setToast}
          />
        )}
        {view === 'week' && (
          <WeekReport
            txns={txns} flows={flows} settings={settings}
            offset={weekOffset} setOffset={setWeekOffset}
            onDelete={deleteTxn}
          />
        )}
        {view === 'month' && (
          <MonthReport
            txns={txns} bills={bills} settings={settings}
            offset={monthOffset} setOffset={setMonthOffset}
            onDelete={deleteTxn}
          />
        )}
        {view === 'setup' && (
          <Setup
            settings={settings} patchSettings={patchSettings}
            debts={debts} bills={bills}
            onExport={() => exportXlsx(txns, bills, flows)}
            onSignOut={() => supabase.auth.signOut()}
          />
        )}
      </main>

      <div style={{ textAlign: 'center', fontSize: 11, color: '#8a8378', marginTop: 36 }}>
        Money Recorder v0.3.1 — Phase 3
      </div>

      {confirm && <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} />}
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ─── Confirm sheet ─────────────────────────────────────────────────
function ConfirmSheet({ confirm, onClose }) {
  const [amt, setAmt] = useState(
    confirm.amountField != null ? String(confirm.amountField.toFixed(2)) : ''
  );
  const [checked, setChecked] = useState([]);
  const toggle = (n) =>
    setChecked((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n]));

  const go = () => {
    onClose(); // close first: handlers may open a follow-up sheet
    if (confirm.onConfirmAmount) confirm.onConfirmAmount(parseFloat(amt), checked);
    else confirm.onConfirm();
  };

  return (
    <div style={S.scrim} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.sheetTitle}>{confirm.title}</div>
        <div style={S.sheetBody}>{confirm.body}</div>
        {confirm.amountField != null && (
          <input
            style={{ ...S.input, marginTop: 14 }} inputMode="decimal"
            value={amt} onChange={(e) => setAmt(e.target.value)}
          />
        )}
        {confirm.checkList && confirm.checkList.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {confirm.checkList.map((n) => (
              <button
                key={n} onClick={() => toggle(n)}
                style={{ ...S.chip, ...(checked.includes(n) ? S.chipOn : {}) }}
              >{checked.includes(n) ? '✓ ' : ''}{n}</button>
            ))}
          </div>
        )}
        <div style={S.sheetRow}>
          <button style={S.btnGhost} onClick={onClose}>Cancel</button>
          <button style={S.btnSolid} onClick={go}>{confirm.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Category pie ──────────────────────────────────────────────────
function CategoryPie({ byCat }) {
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  // Pies get unreadable past ~6 slices: collapse the tail into Others.
  const top = entries.slice(0, 5);
  const rest = entries.slice(5).reduce((s, [, v]) => s + v, 0);
  const data = [
    ...top.map(([name, value]) => ({ name, value: Number(value.toFixed(2)) })),
    ...(rest > 0 ? [{ name: 'Others', value: Number(rest.toFixed(2)) }] : []),
  ];
  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data} dataKey="value" nameKey="name"
            cx="50%" cy="50%" innerRadius={48} outerRadius={80}
            paddingAngle={2} stroke="#faf8f4"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => fmt(v)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function PieLegend({ byCat }) {
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, 5);
  const rest = entries.slice(5).reduce((s, [, v]) => s + v, 0);
  const rows = [...top, ...(rest > 0 ? [['Others', rest]] : [])];
  return (
    <div style={{ marginTop: 4 }}>
      {rows.map(([name, v], i) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b655c', marginBottom: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block' }} />
          <span style={{ flex: 1 }}>{name}</span>
          <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600 }}>{fmt(v)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Today ─────────────────────────────────────────────────────────
function Today({
  settings, counts, onLog, savings, onSpend, setConfirm, setToast,
  onReceive, creditedThisWeek, onTransfer, onIncome, budgetWarning,
}) {
  const { presets, categories, weeklyAllowance, savingsRate } = settings;
  const [amt, setAmt] = useState('');
  const [label, setLabel] = useState('');
  const [cat, setCat] = useState(categories[0]);
  const [acct, setAcct] = useState('allowance');
  const [note, setNote] = useState('');
  const [xfer, setXfer] = useState('');
  const [inAmt, setInAmt] = useState('');
  const [inSav, setInSav] = useState('');

  const submit = () => {
    const v = parseFloat(amt);
    if (!v || v <= 0) return;
    const t = {
      date: iso(new Date()), amount: v,
      label: label || cat, category: cat, account: acct, note,
    };
    const clear = () => { setAmt(''); setLabel(''); setNote(''); };

    if (acct === 'savings') {
      if (v > savings) { setToast('Not enough in Savings'); return; }
      setConfirm({
        title: 'Spend from Savings?',
        body: `${fmt(v)} for ${label || cat}. This leaves ${fmt(savings - v)} and won't appear in your weekly report.`,
        confirmLabel: 'Confirm',
        onConfirm: () => { onSpend(t); clear(); },
      });
      return;
    }
    const bw = budgetWarning(v, cat);
    if (bw) {
      setConfirm({
        title: 'Over budget', body: bw, confirmLabel: 'Log it anyway',
        onConfirm: () => { onSpend(t); clear(); },
      });
      return;
    }
    onSpend(t); clear();
  };

  const submitIncome = () => {
    const total = parseFloat(inAmt);
    if (!total || total <= 0) return;
    const toSav = parseFloat(inSav) || 0;
    if (toSav < 0 || toSav > total) { setToast('Savings part can\u2019t exceed the total'); return; }
    onIncome(total, toSav);
    setInAmt(''); setInSav('');
  };

  const doTransfer = () => {
    const v = parseFloat(xfer);
    if (!v || v <= 0) return;
    if (v > savings) { setToast('Not enough in Savings'); return; }
    setConfirm({
      title: 'Move money to Allowance?',
      body: `${fmt(v)} out of Savings, leaving ${fmt(savings - v)}. Not an expense — it just makes the money spendable.`,
      confirmLabel: 'Move it',
      onConfirm: () => { onTransfer(v); setXfer(''); },
    });
  };

  return (
    <>
      <SectionLabel>Counters — this month</SectionLabel>
      <div style={S.counterGrid}>
        {presets.map((p) => {
          const n = counts[p.id] ?? 0;
          const over = n >= p.cap;
          return (
            <button key={p.id} onClick={() => onLog(p)} className="counter" style={S.counter}>
              <div style={S.counterTop}>
                <span style={S.counterName}>{p.label}</span>
                <span style={{ ...S.counterCount, color: over ? '#c2410c' : '#0f766e' }}>
                  {n}<span style={S.counterCap}>/{p.cap}</span>
                </span>
              </div>
              <div style={S.pipRow}>
                {Array.from({ length: Math.max(p.cap, n) }).map((_, i) => (
                  <span key={i} style={{
                    ...S.pip,
                    background: i < n ? (i >= p.cap ? '#c2410c' : '#0f766e') : '#d9d5cc',
                  }} />
                ))}
              </div>
              <div style={S.counterPrice}>{fmt(p.price)} · tap to log</div>
            </button>
          );
        })}
      </div>

      <SectionLabel>Record something else</SectionLabel>
      <div style={S.form}>
        <div style={S.row}>
          <input
            style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="0.00"
            value={amt} onChange={(e) => setAmt(e.target.value)}
          />
          <select style={{ ...S.input, flex: 1.4 }} value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <input style={S.input} placeholder="What was it?" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input style={S.input} placeholder="Note — who, where, why (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div style={S.segment}>
          {['allowance', 'savings'].map((a) => (
            <button
              key={a} onClick={() => setAcct(a)}
              style={{ ...S.segBtn, ...(acct === a ? S.segOn : {}) }}
            >{a === 'allowance' ? 'Allowance' : 'Savings'}</button>
          ))}
        </div>
        <button style={S.btnSolid} onClick={submit}>Record</button>
      </div>

      <SectionLabel>Allowance</SectionLabel>
      <button
        style={{ ...S.btnGhostWide, opacity: creditedThisWeek ? 0.5 : 1 }}
        onClick={onReceive}
      >
        {creditedThisWeek
          ? 'Already recorded this week — tap to add again'
          : `Allowance arrived — add ${fmt(weeklyAllowance * (1 - savingsRate))}, save ${fmt(weeklyAllowance * savingsRate)}`}
      </button>

      <SectionLabel>Money in — wages, extra allowance</SectionLabel>
      <div style={S.form}>
        <div style={S.row}>
          <input
            style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="Total received"
            value={inAmt} onChange={(e) => setInAmt(e.target.value)}
          />
          <input
            style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="To Savings (optional)"
            value={inSav} onChange={(e) => setInSav(e.target.value)}
          />
        </div>
        <button style={S.btnSolid} onClick={submitIncome}>Add money</button>
      </div>
      <div style={S.hint}>Whatever isn&apos;t sent to Savings lands in Allowance.</div>

      <SectionLabel>Move Savings → Allowance</SectionLabel>
      <div style={S.row}>
        <input
          style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="0.00"
          value={xfer} onChange={(e) => setXfer(e.target.value)}
        />
        <button style={S.btnSmall} onClick={doTransfer}>Move</button>
      </div>
      <div style={S.hint}>Not an expense — it only makes saved money spendable.</div>
    </>
  );
}

// ─── Split ─────────────────────────────────────────────────────────
function SplitView({
  settings, debts, bills, budgetWarning,
  onFriendPaid, onIPaid, onSettle, onReceiveBill, onCloseBill,
  setConfirm, setToast,
}) {
  const { friends, categories } = settings;
  const [fp, setFp] = useState({ friend: friends[0] || '', share: '', cat: categories[0], label: '' });
  const [ip, setIp] = useState({ total: '', share: '', cat: categories[0], label: '', waiting: [] });

  const totalOwed = friends.reduce((s, f) => s + (debts[f] || 0), 0);
  const openBills = bills.filter((b) => !b.closed);
  const outstanding = openBills.reduce((s, b) => s + (b.owed - b.received), 0);
  const openCount = (f) => openBills.filter((b) => b.waiting.includes(f)).length;

  const toggleWaiting = (n) =>
    setIp((p) => ({
      ...p,
      waiting: p.waiting.includes(n) ? p.waiting.filter((x) => x !== n) : [...p.waiting, n],
    }));

  const submitFriendPaid = () => {
    const v = parseFloat(fp.share);
    if (!fp.friend || !v || v <= 0) return;
    const go = () => { onFriendPaid(fp.friend, v, fp.cat, fp.label); setFp({ ...fp, share: '', label: '' }); };
    const bw = budgetWarning(v, fp.cat);
    if (bw) { setConfirm({ title: 'Over budget', body: bw, confirmLabel: 'Log it anyway', onConfirm: go }); return; }
    go();
  };

  const submitIPaid = () => {
    const total = parseFloat(ip.total);
    const share = parseFloat(ip.share);
    if (!total || total <= 0 || isNaN(share) || share < 0) return;
    if (share > total) { setToast('Your share can\u2019t exceed the total'); return; }
    if (total - share > 0 && ip.waiting.length === 0) { setToast('Tick who was in on the bill'); return; }
    const go = () => { onIPaid(total, share, ip.cat, ip.label, ip.waiting); setIp({ ...ip, total: '', share: '', label: '', waiting: [] }); };
    const bw = budgetWarning(share, ip.cat);
    if (bw) { setConfirm({ title: 'Over budget', body: bw, confirmLabel: 'Log it anyway', onConfirm: go }); return; }
    go();
  };

  const askSettle = (friend) => {
    const owed = debts[friend] || 0;
    if (owed <= 0) return;
    setConfirm({
      title: `Pay ${friend} back`,
      body: `You owe ${fmt(owed)}. Adjust below to pay part of it.`,
      confirmLabel: 'Pay',
      amountField: owed,
      onConfirmAmount: (v) => { if (v && v > 0) onSettle(friend, Math.min(v, owed)); },
    });
  };

  const askReceive = (bill) => {
    const left = bill.owed - bill.received;
    setConfirm({
      title: `Receive — ${bill.label}`,
      body: `${fmt(left)} still out. Enter what came in, and tick whoever just paid you.`,
      confirmLabel: 'Receive',
      amountField: left,
      checkList: bill.waiting,
      onConfirmAmount: (v, names) => { if (v && v > 0) onReceiveBill(bill.id, v, names || []); },
    });
  };

  const askClose = (bill) => {
    const left = bill.owed - bill.received;
    setConfirm({
      title: 'Close this bill?',
      body: `${fmt(left)} never came in. Close it and write that off? It'll show in the monthly report.`,
      confirmLabel: 'Write off & close',
      onConfirm: () => onCloseBill(bill.id, left),
    });
  };

  return (
    <>
      <SectionLabel>Friends</SectionLabel>
      {friends.length === 0 && <Empty>No friends in Setup yet.</Empty>}
      {friends.map((f) => {
        const owed = debts[f] || 0;
        const n = openCount(f);
        const meta = [
          owed > 0 ? `you owe ${fmt(owed)}` : null,
          n > 0 ? `waiting on ${n} bill${n > 1 ? 's' : ''}` : null,
        ].filter(Boolean).join(' · ') || 'all clear';
        return (
          <div key={f} style={S.entry}>
            <div>
              <div style={S.entryLabel}>{f}</div>
              <div style={S.entryMeta}>{meta}</div>
            </div>
            {owed > 0 ? (
              <button style={S.btnSmall} onClick={() => askSettle(f)}>Settle</button>
            ) : (
              <span style={{ ...S.mono, color: '#8a8378' }}>—</span>
            )}
          </div>
        );
      })}
      {totalOwed > 0 && (
        <div style={{ ...S.entry, borderBottom: 'none' }}>
          <div style={S.entryLabel}>Total you owe</div>
          <div style={{ ...S.mono, color: '#c2410c' }}>{fmt(totalOwed)}</div>
        </div>
      )}

      <SectionLabel>Owed to you — {fmt(outstanding)}</SectionLabel>
      {openBills.length === 0 && <Empty>No open bills.</Empty>}
      {openBills.map((b) => {
        const left = b.owed - b.received;
        return (
          <div key={b.id} style={S.billCard}>
            <div style={S.billTop}>
              <div>
                <div style={S.entryLabel}>{b.label}</div>
                <div style={S.entryMeta}>
                  {prettyDate(b.date)}
                  {b.waiting.length > 0 ? ` · waiting: ${b.waiting.join(', ')}` : ' · nobody tagged'}
                  {b.paid.length > 0 && ` · paid: ${b.paid.join(', ')}`}
                </div>
              </div>
              <div style={{ ...S.mono, color: '#0f766e' }}>{fmt(left)}</div>
            </div>
            <div style={{ ...S.row, marginTop: 10 }}>
              <button style={{ ...S.btnSmall, flex: 1 }} onClick={() => askReceive(b)}>Receive</button>
              {b.waiting.length === 0 && left > 0 && (
                <button style={{ ...S.btnGhost, flex: 1, padding: '8px 0' }} onClick={() => askClose(b)}>
                  Close bill
                </button>
              )}
            </div>
          </div>
        );
      })}

      <SectionLabel>Friend paid — log your share</SectionLabel>
      <div style={S.form}>
        <div style={S.row}>
          <select
            style={{ ...S.input, flex: 1 }} value={fp.friend}
            onChange={(e) => setFp({ ...fp, friend: e.target.value })}
          >
            {friends.map((f) => <option key={f}>{f}</option>)}
          </select>
          <input
            style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="Your share"
            value={fp.share} onChange={(e) => setFp({ ...fp, share: e.target.value })}
          />
        </div>
        <div style={S.row}>
          <select
            style={{ ...S.input, flex: 1.4 }} value={fp.cat}
            onChange={(e) => setFp({ ...fp, cat: e.target.value })}
          >
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input
            style={{ ...S.input, flex: 1.6 }} placeholder="What was it? (optional)"
            value={fp.label} onChange={(e) => setFp({ ...fp, label: e.target.value })}
          />
        </div>
        <button style={S.btnSolid} onClick={submitFriendPaid}>Log — I owe them</button>
      </div>

      <SectionLabel>I paid the whole bill</SectionLabel>
      <div style={S.form}>
        <div style={S.row}>
          <input
            style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="Total I paid"
            value={ip.total} onChange={(e) => setIp({ ...ip, total: e.target.value })}
          />
          <input
            style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="My own share"
            value={ip.share} onChange={(e) => setIp({ ...ip, share: e.target.value })}
          />
        </div>
        <div style={S.row}>
          <select
            style={{ ...S.input, flex: 1.4 }} value={ip.cat}
            onChange={(e) => setIp({ ...ip, cat: e.target.value })}
          >
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input
            style={{ ...S.input, flex: 1.6 }} placeholder="What was it? (optional)"
            value={ip.label} onChange={(e) => setIp({ ...ip, label: e.target.value })}
          />
        </div>
        <div>
          <div style={{ ...S.hint, marginTop: 0, marginBottom: 6 }}>Who&apos;s in on it?</div>
          {friends.map((f) => (
            <button
              key={f} onClick={() => toggleWaiting(f)}
              style={{ ...S.chip, ...(ip.waiting.includes(f) ? S.chipOn : {}) }}
            >{ip.waiting.includes(f) ? '✓ ' : ''}{f}</button>
          ))}
        </div>
        <button style={S.btnSolid} onClick={submitIPaid}>Log — rest owed to me</button>
      </div>
      <div style={S.hint}>
        Your share counts in this week&apos;s budget. Friends not in the list yet? Add them in Setup first.
      </div>
    </>
  );
}

// ─── Week report (with history) ────────────────────────────────────
function WeekReport({ txns, flows, settings, offset, setOffset, onDelete }) {
  const { start, end } = weekRange(offset);
  const weekTxns = txnsInWeek(txns, start, end);
  const weekFlows = flowsInWeek(flows, start, end)
    .filter((f) => f.kind === 'settle_pay' || f.kind === 'settle_receive');
  const budgets = settings.budgets;
  const presets = settings.presets;

  const spent = weekTxns.reduce((s, t) => s + t.amount, 0);
  const overs = weekTxns.filter((t) => t.over_cap);
  const byCat = {};
  weekTxns.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const overBudget = spent > budgets.overall;
  const catOvers = Object.entries(budgets.categories).filter(([c, b]) => (byCat[c] || 0) > b);

  return (
    <>
      <div style={S.navRow}>
        <button style={S.navBtn} onClick={() => setOffset(offset - 1)} aria-label="Previous week">←</button>
        <div style={S.navLabel}>
          {prettyDate(start)} — {prettyDate(end)}{offset === 0 && ' (this week)'}
        </div>
        <button
          style={{ ...S.navBtn, opacity: offset >= 0 ? 0.35 : 1 }}
          onClick={() => offset < 0 && setOffset(offset + 1)}
          aria-label="Next week"
        >→</button>
      </div>

      {!weekTxns.length && <Empty>Nothing recorded this week.</Empty>}

      {weekTxns.length > 0 && (
        <>
          <SectionLabel>Budgets</SectionLabel>
          <BudgetBar label="Overall" spent={spent} budget={budgets.overall} />
          {Object.entries(budgets.categories).map(([c, b]) => (
            <BudgetBar key={c} label={c} spent={byCat[c] || 0} budget={b} />
          ))}

          {(overBudget || catOvers.length > 0 || overs.length > 0) && (
            <div style={S.overCard}>
              <div style={S.overTitle}>Warnings</div>
              {overBudget && (
                <div style={S.overLine}>
                  Weekly budget exceeded — {fmt(spent)} of {fmt(budgets.overall)} ({fmt(spent - budgets.overall)} over)
                </div>
              )}
              {catOvers.map(([c, b]) => (
                <div key={c} style={S.overLine}>{c} over budget — {fmt(byCat[c])} of {fmt(b)}</div>
              ))}
              {overs.map((t) => {
                const p = presets.find((x) => x.id === t.preset_id);
                return (
                  <div key={t.id} style={S.overLine}>
                    {t.label} on {prettyDate(t.date)} — past your {p?.cap}/month cap
                  </div>
                );
              })}
            </div>
          )}

          <SectionLabel>Where it went</SectionLabel>
          <CategoryPie byCat={byCat} />
          <PieLegend byCat={byCat} />

          <SectionLabel>Entries</SectionLabel>
          {weekTxns.map((t) => (
            <div key={t.id} style={S.entry}>
              <div>
                <div style={S.entryLabel}>
                  {t.label}
                  {t.over_cap && <span style={S.flag}>over cap</span>}
                  {t.paid_by && <span style={S.flagTeal}>paid by {t.paid_by}</span>}
                </div>
                <div style={S.entryMeta}>
                  {prettyDate(t.date)} · {t.category}
                  {t.fronted != null && ` · fronted ${fmt(t.fronted)}`}
                  {t.note && ` · ${t.note}`}
                </div>
              </div>
              <div style={S.amtRow}>
                <div style={S.mono}>{fmt(t.amount)}</div>
                <button style={S.delBtn} onClick={() => onDelete(t)} aria-label="Delete entry">×</button>
              </div>
            </div>
          ))}
        </>
      )}

      {weekFlows.length > 0 && (
        <>
          <SectionLabel>Settlements — not spending</SectionLabel>
          {weekFlows.map((f) => (
            <div key={f.id} style={S.entry}>
              <div>
                <div style={S.entryLabel}>
                  {f.kind === 'settle_pay' ? `Paid ${f.who} back` : 'Received owed money'}
                </div>
                <div style={S.entryMeta}>{prettyDate(f.date)}</div>
              </div>
              <div style={{ ...S.mono, color: f.kind === 'settle_pay' ? '#1c1a17' : '#0f766e' }}>
                {f.kind === 'settle_pay' ? '−' : '+'}{fmt(f.amount)}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function BudgetBar({ label, spent, budget }) {
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const over = spent > budget;
  return (
    <div style={S.catRow}>
      <div style={S.catHead}>
        <span>{label}</span>
        <span style={{ ...S.mono, color: over ? '#c2410c' : '#1c1a17' }}>
          {fmt(spent)} / {fmt(budget)}
        </span>
      </div>
      <div style={S.catTrack}>
        <div style={{ ...S.catFill, width: `${pct}%`, background: over ? '#c2410c' : '#0f766e' }} />
      </div>
    </div>
  );
}

// ─── Month report (with history) ───────────────────────────────────
function MonthReport({ txns, bills, settings, offset, setOffset, onDelete }) {
  const mk = monthOf(offset);
  const monthTxns = txns.filter((t) => monthKey(t.date) === mk);
  const presets = settings.presets;
  const counts = deriveCounts(txns, presets, mk);

  const allowanceTxns = monthTxns.filter((t) => t.account === 'allowance');
  const savingsSpend = monthTxns.filter((t) => t.account === 'savings');
  const total = monthTxns.reduce((s, t) => s + t.amount, 0);
  const byCat = {};
  monthTxns.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const writtenOff = bills.filter(
    (b) => b.closed && b.write_off > 0 && b.closed_date && monthKey(b.closed_date) === mk
  );

  return (
    <>
      <div style={S.navRow}>
        <button style={S.navBtn} onClick={() => setOffset(offset - 1)} aria-label="Previous month">←</button>
        <div style={S.navLabel}>{prettyMonth(mk)}{offset === 0 && ' (this month)'}</div>
        <button
          style={{ ...S.navBtn, opacity: offset >= 0 ? 0.35 : 1 }}
          onClick={() => offset < 0 && setOffset(offset + 1)}
          aria-label="Next month"
        >→</button>
      </div>

      {!monthTxns.length && !writtenOff.length && <Empty>Nothing recorded this month.</Empty>}

      {(monthTxns.length > 0 || writtenOff.length > 0) && (
        <>
          <SectionLabel>This month — everything</SectionLabel>
          <div style={S.statRow}>
            <Stat label="Total spent" value={fmt(total)} />
            <Stat label="From Savings" value={fmt(savingsSpend.reduce((s, t) => s + t.amount, 0))} />
          </div>

          {monthTxns.length > 0 && (
            <>
              <SectionLabel>Where it went</SectionLabel>
              <CategoryPie byCat={byCat} />
              <PieLegend byCat={byCat} />
            </>
          )}

          <SectionLabel>Counts</SectionLabel>
          {presets.map((p) => {
            const n = counts[p.id] ?? 0;
            return (
              <div key={p.id} style={S.entry}>
                <div>
                  <div style={S.entryLabel}>{p.label}</div>
                  <div style={S.entryMeta}>{fmt(n * p.price)} total</div>
                </div>
                <div style={{ ...S.mono, color: n > p.cap ? '#c2410c' : '#1c1a17' }}>
                  {n}/{p.cap}
                </div>
              </div>
            );
          })}

          {savingsSpend.length > 0 && (
            <>
              <SectionLabel>Savings withdrawals</SectionLabel>
              {savingsSpend.map((t) => (
                <div key={t.id} style={S.entry}>
                  <div>
                    <div style={S.entryLabel}>{t.label}</div>
                    <div style={S.entryMeta}>{prettyDate(t.date)} · {t.category}</div>
                  </div>
                  <div style={S.amtRow}>
                    <div style={S.mono}>{fmt(t.amount)}</div>
                    <button style={S.delBtn} onClick={() => onDelete(t)} aria-label="Delete entry">×</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {writtenOff.length > 0 && (
            <>
              <SectionLabel>Written off — money never collected</SectionLabel>
              {writtenOff.map((b) => (
                <div key={b.id} style={S.entry}>
                  <div>
                    <div style={S.entryLabel}>{b.label}</div>
                    <div style={S.entryMeta}>closed {prettyDate(b.closed_date)}</div>
                  </div>
                  <div style={{ ...S.mono, color: '#c2410c' }}>−{fmt(b.write_off)}</div>
                </div>
              ))}
            </>
          )}

          {allowanceTxns.length > 0 && (
            <>
              <SectionLabel>Allowance spending</SectionLabel>
              {allowanceTxns.map((t) => (
                <div key={t.id} style={S.entry}>
                  <div>
                    <div style={S.entryLabel}>{t.label}</div>
                    <div style={S.entryMeta}>{prettyDate(t.date)} · {t.category}</div>
                  </div>
                  <div style={S.amtRow}>
                    <div style={S.mono}>{fmt(t.amount)}</div>
                    <button style={S.delBtn} onClick={() => onDelete(t)} aria-label="Delete entry">×</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

// ─── Setup ─────────────────────────────────────────────────────────
function Setup({ settings, patchSettings, debts, bills, onExport, onSignOut }) {
  const { categories, presets, subs, budgets, friends } = settings;
  const [newCat, setNewCat] = useState('');
  const [np, setNp] = useState({ label: '', price: '', cap: '' });
  const [nb, setNb] = useState({ cat: categories[0], amount: '' });
  const [newFriend, setNewFriend] = useState('');

  const onOpenBills = (f) => bills.some((b) => !b.closed && b.waiting.includes(f));

  return (
    <>
      <SectionLabel>Export</SectionLabel>
      <button style={S.btnGhostWide} onClick={onExport}>
        Export everything to Excel (.xlsx)
      </button>
      <div style={S.hint}>
        One file, three sheets — Transactions, Bills, Money Flows — with Week and Month columns for filtering.
      </div>

      <SectionLabel>Friends</SectionLabel>
      {friends.map((f) => {
        const blocked = (debts[f] || 0) > 0 || onOpenBills(f);
        return (
          <div key={f} style={S.entry}>
            <div>
              <div style={S.entryLabel}>{f}</div>
              {(debts[f] || 0) > 0 && <div style={S.entryMeta}>you still owe {fmt(debts[f])}</div>}
              {onOpenBills(f) && <div style={S.entryMeta}>still on open bills</div>}
            </div>
            <button
              style={{ ...S.remove, opacity: blocked ? 0.4 : 1 }}
              onClick={() => {
                if (blocked) return;
                patchSettings({ ...settings, friends: friends.filter((x) => x !== f) });
              }}
            >{blocked ? 'Settle first' : 'Remove'}</button>
          </div>
        );
      })}
      <div style={{ ...S.row, marginTop: 10 }}>
        <input
          style={{ ...S.input, flex: 1 }} placeholder="Add a friend"
          value={newFriend} onChange={(e) => setNewFriend(e.target.value)}
        />
        <button
          style={S.btnSmall}
          onClick={() => {
            const n = newFriend.trim();
            if (!n || friends.includes(n)) return;
            patchSettings({ ...settings, friends: [...friends, n] });
            setNewFriend('');
          }}
        >Add</button>
      </div>

      <SectionLabel>Weekly budgets</SectionLabel>
      <div style={S.entry}>
        <div style={S.entryLabel}>Overall</div>
        <input
          style={{ ...S.input, width: 110, textAlign: 'right' }}
          inputMode="decimal" value={budgets.overall}
          onChange={(e) =>
            patchSettings({ ...settings, budgets: { ...budgets, overall: parseFloat(e.target.value) || 0 } })
          }
        />
      </div>
      {Object.entries(budgets.categories).map(([c, b]) => (
        <div key={c} style={S.entry}>
          <div>
            <div style={S.entryLabel}>{c}</div>
            <button
              style={S.remove}
              onClick={() => {
                const next = { ...budgets.categories };
                delete next[c];
                patchSettings({ ...settings, budgets: { ...budgets, categories: next } });
              }}
            >Remove</button>
          </div>
          <input
            style={{ ...S.input, width: 110, textAlign: 'right' }}
            inputMode="decimal" value={b}
            onChange={(e) =>
              patchSettings({
                ...settings,
                budgets: { ...budgets, categories: { ...budgets.categories, [c]: parseFloat(e.target.value) || 0 } },
              })
            }
          />
        </div>
      ))}
      <div style={{ ...S.row, marginTop: 10 }}>
        <select
          style={{ ...S.input, flex: 1.4 }} value={nb.cat}
          onChange={(e) => setNb({ ...nb, cat: e.target.value })}
        >
          {categories.filter((c) => budgets.categories[c] == null).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="Amount"
          value={nb.amount} onChange={(e) => setNb({ ...nb, amount: e.target.value })}
        />
        <button
          style={S.btnSmall}
          onClick={() => {
            const v = parseFloat(nb.amount);
            if (!nb.cat || !v) return;
            patchSettings({
              ...settings,
              budgets: { ...budgets, categories: { ...budgets.categories, [nb.cat]: v } },
            });
            setNb({ cat: '', amount: '' });
          }}
        >Add</button>
      </div>

      <SectionLabel>Categories</SectionLabel>
      {categories.map((c) => (
        <div key={c} style={S.entry}>
          <div style={S.entryLabel}>{c}</div>
          <button
            style={S.remove}
            onClick={() => patchSettings({ ...settings, categories: categories.filter((x) => x !== c) })}
          >Remove</button>
        </div>
      ))}
      <div style={{ ...S.row, marginTop: 10 }}>
        <input
          style={{ ...S.input, flex: 1 }} placeholder="New category"
          value={newCat} onChange={(e) => setNewCat(e.target.value)}
        />
        <button
          style={S.btnSmall}
          onClick={() => {
            if (!newCat.trim()) return;
            patchSettings({ ...settings, categories: [...categories, newCat.trim()] });
            setNewCat('');
          }}
        >Add</button>
      </div>

      <SectionLabel>Counters</SectionLabel>
      {presets.map((p) => (
        <div key={p.id} style={S.entry}>
          <div>
            <div style={S.entryLabel}>{p.label}</div>
            <div style={S.entryMeta}>{fmt(p.price)} · cap {p.cap}/month</div>
          </div>
          <button
            style={S.remove}
            onClick={() => patchSettings({ ...settings, presets: presets.filter((x) => x.id !== p.id) })}
          >Remove</button>
        </div>
      ))}
      <div style={{ ...S.row, marginTop: 10 }}>
        <input
          style={{ ...S.input, flex: 1.6 }} placeholder="Name"
          value={np.label} onChange={(e) => setNp({ ...np, label: e.target.value })}
        />
        <input
          style={{ ...S.input, flex: 1 }} inputMode="decimal" placeholder="Price"
          value={np.price} onChange={(e) => setNp({ ...np, price: e.target.value })}
        />
        <input
          style={{ ...S.input, flex: 0.7 }} inputMode="numeric" placeholder="Cap"
          value={np.cap} onChange={(e) => setNp({ ...np, cap: e.target.value })}
        />
        <button
          style={S.btnSmall}
          onClick={() => {
            if (!np.label || !np.price || !np.cap) return;
            patchSettings({
              ...settings,
              presets: [...presets, {
                id: crypto.randomUUID(), label: np.label,
                price: parseFloat(np.price), cap: parseInt(np.cap),
                category: categories[0],
              }],
            });
            setNp({ label: '', price: '', cap: '' });
          }}
        >Add</button>
      </div>

      <SectionLabel>Subscriptions</SectionLabel>
      {subs.map((s) => (
        <div key={s.id} style={S.entry}>
          <div>
            <div style={S.entryLabel}>{s.label}</div>
            <div style={S.entryMeta}>day {s.day} each month · {s.category}</div>
          </div>
          <div style={S.mono}>{fmt(s.price)}</div>
        </div>
      ))}
      <div style={{ ...S.entry, borderBottom: 'none' }}>
        <div style={S.entryLabel}>Monthly total</div>
        <div style={S.mono}>{fmt(subs.reduce((a, s) => a + s.price, 0))}</div>
      </div>

      <SectionLabel>Account</SectionLabel>
      <button style={S.btnDanger} onClick={onSignOut}>Sign out</button>
    </>
  );
}

// ─── Small pieces ──────────────────────────────────────────────────
const SectionLabel = ({ children }) => <div style={S.sectionLabel}>{children}</div>;
const Empty = ({ children }) => <div style={S.empty}>{children}</div>;
const Stat = ({ label, value }) => (
  <div style={S.stat}>
    <div style={S.statLabel}>{label}</div>
    <div style={S.statValue}>{value}</div>
  </div>
);

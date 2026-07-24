import * as XLSX from 'xlsx';
import { iso, monthKey, startOfWeek } from './data';

// Everything in one file, with Month and Week columns so Excel's own
// filters do the slicing.
export function exportXlsx(txns, bills, flows) {
  const txnRows = txns.map((t) => ({
    Date: t.date,
    Week: iso(startOfWeek(new Date(t.date))),
    Month: monthKey(t.date),
    Label: t.label,
    Category: t.category,
    Account: t.account,
    'Amount (RM)': t.amount,
    'Paid by': t.paid_by || '',
    'Fronted (RM)': t.fronted ?? '',
    'Over cap': t.over_cap ? 'yes' : '',
    Note: t.note || '',
  }));

  const billRows = bills.map((b) => ({
    Date: b.date,
    Month: monthKey(b.date),
    Label: b.label,
    'Owed (RM)': b.owed,
    'Received (RM)': b.received,
    Waiting: (b.waiting || []).join(', '),
    Paid: (b.paid || []).join(', '),
    Closed: b.closed ? 'yes' : '',
    'Closed date': b.closed_date || '',
    'Written off (RM)': b.write_off || 0,
  }));

  const kindLabel = {
    allowance_in: 'Allowance in',
    income: 'Income',
    transfer: 'Savings → Allowance',
    settle_pay: 'Paid friend back',
    settle_receive: 'Received owed money',
  };
  const flowRows = flows.map((f) => ({
    Date: f.date,
    Week: iso(startOfWeek(new Date(f.date))),
    Month: monthKey(f.date),
    Kind: kindLabel[f.kind] || f.kind,
    'Amount (RM)': f.amount,
    'To Savings (RM)': f.to_savings || 0,
    Friend: f.who || '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnRows), 'Transactions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(billRows), 'Bills');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flowRows), 'Money Flows');
  XLSX.writeFile(wb, `money-recorder-${iso(new Date())}.xlsx`);
}

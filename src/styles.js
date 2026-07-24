export const mono = "ui-monospace, 'SF Mono', Menlo, monospace";
export const sans = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export const CSS = `
  * { box-sizing: border-box; }
  body { background: #faf8f4; }
  .tab:hover { color: #1c1a17; }
  .counter:active { transform: scale(0.985); }
  button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 2px solid #0f766e; outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

export const S = {
  app: { fontFamily: sans, background: '#faf8f4', minHeight: '100vh', maxWidth: 560, margin: '0 auto', color: '#1c1a17', paddingBottom: 48 },
  header: { padding: '24px 20px 14px', display: 'flex', gap: 10 },
  balCard: { flex: 1, background: '#fff', border: '1px solid #e8e4db', borderRadius: 11, padding: 14 },
  balLabel: { fontSize: 11, color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 },
  balNum: { fontFamily: mono, fontSize: 23, fontWeight: 700, marginTop: 5 },
  bigNum: { fontSize: 44, fontWeight: 700, fontFamily: mono, letterSpacing: '-0.03em', lineHeight: 1 },
  budgetLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', marginBottom: 7 },
  budgetText: { fontSize: 12, color: '#6b655c', fontWeight: 500 },
  budgetOver: { fontSize: 10, background: '#fde8dc', color: '#c2410c', padding: '2px 7px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },
  barTrack: { height: 5, background: '#e8e4db', margin: '0 20px', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', transition: 'width 0.3s ease' },
  tabs: { display: 'flex', gap: 4, padding: '16px 20px 0' },
  tab: { flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: 'none', border: 'none', borderBottom: '2px solid transparent', color: '#8a8378', cursor: 'pointer', fontFamily: sans },
  tabOn: { color: '#0f766e', borderBottom: '2px solid #0f766e' },
  main: { padding: '0 20px' },
  sectionLabel: { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8378', fontWeight: 600, margin: '26px 0 12px' },
  navRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 },
  navBtn: { background: '#fff', border: '1px solid #ddd8ce', borderRadius: 9, width: 36, height: 36, fontSize: 16, cursor: 'pointer', color: '#6b655c', fontFamily: sans },
  navLabel: { fontSize: 14, fontWeight: 700 },
  counterGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  counter: { background: '#fff', border: '1px solid #e8e4db', borderRadius: 12, padding: 14, textAlign: 'left', cursor: 'pointer', fontFamily: sans, transition: 'transform 0.1s' },
  counterTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  counterName: { fontSize: 13, fontWeight: 600 },
  counterCount: { fontFamily: mono, fontSize: 19, fontWeight: 700 },
  counterCap: { fontSize: 12, opacity: 0.5 },
  pipRow: { display: 'flex', gap: 3, margin: '10px 0 8px', flexWrap: 'wrap' },
  pip: { width: 12, height: 4, borderRadius: 2 },
  counterPrice: { fontSize: 11, color: '#8a8378' },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', gap: 8 },
  input: { padding: '11px 12px', border: '1px solid #ddd8ce', borderRadius: 9, fontSize: 14, background: '#fff', fontFamily: sans, width: '100%', color: '#1c1a17' },
  hint: { fontSize: 12, color: '#8a8378', marginTop: 8 },
  segment: { display: 'flex', gap: 4, background: '#efece5', padding: 3, borderRadius: 9 },
  segBtn: { flex: 1, padding: '8px 0', border: 'none', background: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, color: '#8a8378', cursor: 'pointer', fontFamily: sans },
  segOn: { background: '#fff', color: '#1c1a17', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },
  btnSolid: { padding: '12px 18px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: sans },
  btnGhost: { padding: '12px 18px', background: 'none', color: '#6b655c', border: '1px solid #ddd8ce', borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: sans },
  btnGhostWide: { width: '100%', padding: '12px', background: '#fff', color: '#0f766e', border: '1px solid #0f766e', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: sans },
  btnSmall: { padding: '10px 18px', background: '#1c1a17', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: sans, whiteSpace: 'nowrap' },
  btnDanger: { width: '100%', padding: '12px', background: 'none', color: '#c2410c', border: '1px solid #f0c9b5', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: sans },
  remove: { background: 'none', border: 'none', color: '#8a8378', fontSize: 12, cursor: 'pointer', fontFamily: sans, padding: 0, marginTop: 2 },
  statRow: { display: 'flex', gap: 10 },
  stat: { flex: 1, background: '#fff', border: '1px solid #e8e4db', borderRadius: 11, padding: 14 },
  statLabel: { fontSize: 11, color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 },
  statValue: { fontFamily: mono, fontSize: 21, fontWeight: 700, marginTop: 5 },
  overCard: { background: '#fef6f1', border: '1px solid #f0c9b5', borderRadius: 11, padding: 14, marginTop: 16 },
  overTitle: { fontSize: 12, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.06em' },
  overLine: { fontSize: 13, color: '#7c3a17', marginTop: 6 },
  catRow: { marginBottom: 14 },
  catHead: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 },
  catTrack: { height: 6, background: '#e8e4db', borderRadius: 3, overflow: 'hidden' },
  catFill: { height: '100%', background: '#0f766e' },
  entry: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #eeeae1' },
  entryLabel: { fontSize: 14, fontWeight: 500 },
  entryMeta: { fontSize: 12, color: '#8a8378', marginTop: 2 },
  flag: { fontSize: 10, background: '#fde8dc', color: '#c2410c', padding: '2px 6px', borderRadius: 4, marginLeft: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },
  flagTeal: { fontSize: 10, background: '#e0f0ee', color: '#0f766e', padding: '2px 6px', borderRadius: 4, marginLeft: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },
  amtRow: { display: 'flex', alignItems: 'center', gap: 8 },
  delBtn: { background: 'none', border: '1px solid #e8e4db', color: '#8a8378', width: 26, height: 26, borderRadius: 13, fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: sans, padding: 0 },
  chip: { padding: '8px 14px', border: '1px solid #ddd8ce', background: '#fff', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#6b655c', cursor: 'pointer', fontFamily: sans, marginRight: 6, marginBottom: 6 },
  chipOn: { background: '#0f766e', borderColor: '#0f766e', color: '#fff' },
  billCard: { background: '#fff', border: '1px solid #e8e4db', borderRadius: 12, padding: 14, marginBottom: 10 },
  billTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  mono: { fontFamily: mono, fontSize: 14, fontWeight: 600 },
  empty: { padding: '48px 0', textAlign: 'center', color: '#8a8378', fontSize: 14 },
  scrim: { position: 'fixed', inset: 0, background: 'rgba(28,26,23,0.35)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 },
  sheet: { background: '#fff', borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 560 },
  sheetTitle: { fontSize: 18, fontWeight: 700 },
  sheetBody: { fontSize: 14, color: '#6b655c', marginTop: 8, lineHeight: 1.5 },
  sheetRow: { display: 'flex', gap: 10, marginTop: 20 },
  toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1c1a17', color: '#fff', padding: '11px 18px', borderRadius: 9, fontSize: 13, fontWeight: 500, zIndex: 60 },
};

export const PIE_COLORS = ['#0f766e', '#c2410c', '#b45309', '#4338ca', '#0e7490', '#6d28d9', '#be185d', '#4d7c0f'];

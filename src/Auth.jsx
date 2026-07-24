import { useState } from 'react';
import { supabase, configured } from './lib/supabase';
import { S } from './styles';

export default function Auth() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!email || !password) return;
    setBusy(true);
    setMsg('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Account created. If email confirmation is on, check your inbox first.');
      }
    } catch (e) {
      setMsg(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.app, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 380, padding: 24 }}>
        <div style={{ ...S.bigNum, fontSize: 28, textAlign: 'center' }}>Money Recorder</div>
        {!configured && (
          <div style={{ ...S.overCard, marginTop: 16 }}>
            <div style={S.overTitle}>Not configured</div>
            <div style={S.overLine}>
              Copy .env.example to .env and fill in your Supabase URL and anon key, then restart.
            </div>
          </div>
        )}
        <div style={{ ...S.form, marginTop: 24 }}>
          <input
            style={S.input} type="email" placeholder="Email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <input
            style={S.input} type="password" placeholder="Password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
          <button style={S.btnSolid} disabled={busy} onClick={go}>
            {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          <button
            style={{ ...S.btnGhost, border: 'none' }}
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(''); }}
          >
            {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
          {msg && <div style={{ ...S.hint, textAlign: 'center' }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}

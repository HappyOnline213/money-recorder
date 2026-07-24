import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { supabase } from './lib/supabase';
import App from './App';
import Auth from './Auth';

function Root() {
  const [session, setSession] = useState(undefined); // undefined = still checking

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Auth />;
  return <App key={session.user.id} user={session.user} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

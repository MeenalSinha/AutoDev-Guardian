import React, { useState } from 'react';
import { api, tokenStore } from '../utils/api';

export default function Login({ onLogin }) {
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleLogin = async () => {
    if (!form.username || !form.password) { setError('All fields required'); return; }
    setLoading(true); setError('');
    try {
      const data = await api.login(form.username, form.password);
      tokenStore.set(data.access_token);
      const me = await api.me();
      onLogin(me);
    } catch (e) {
      setError(e.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!form.username || !form.password || !form.email) { setError('All fields required'); return; }
    setLoading(true); setError('');
    try {
      await api.register({ username: form.username, email: form.email, password: form.password });
      // Auto-login after register
      const data = await api.login(form.username, form.password);
      tokenStore.set(data.access_token);
      const me = await api.me();
      onLogin(me);
    } catch (e) {
      setError(e.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 380 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.4px' }}>
            Self-Improving AI Software Engineer
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            AutoDev Guardian — Autonomous SDLC Automation
          </div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: 20 }}>
            <button className={`tab${tab === 'login' ? ' active' : ''}`} onClick={() => setTab('login')}>Sign In</button>
            <button className={`tab${tab === 'register' ? ' active' : ''}`} onClick={() => setTab('register')}>Register</button>
          </div>

          {tab === 'login' && (
            <>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" value={form.username} onChange={set('username')}
                  placeholder="admin" autoComplete="username"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" value={form.password} onChange={set('password')}
                  placeholder="••••••••" autoComplete="current-password"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </div>
              <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 12 }}>
                Default credentials: <strong>admin</strong> / <strong>AdminPass123!</strong>
              </div>
              {error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>{error}</div>}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleLogin} disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </>
          )}

          {tab === 'register' && (
            <>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" value={form.username} onChange={set('username')}
                  placeholder="your_username" autoComplete="username" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email} onChange={set('email')}
                  placeholder="you@example.com" autoComplete="email" />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" value={form.password} onChange={set('password')}
                  placeholder="Min 8 characters" autoComplete="new-password" />
                <span className="form-hint">Min 8 characters, alphanumeric + underscore username</span>
              </div>
              {error && <div className="alert alert-warning" style={{ marginBottom: 12 }}>{error}</div>}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleRegister} disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </>
          )}
        </div>

        <div className="text-muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 11 }}>
          AutoDev Guardian v1.0 · Powered by Mistral 7B
        </div>
      </div>
    </div>
  );
}

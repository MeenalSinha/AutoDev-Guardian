import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import CommandCenter from './pages/CommandCenter';
import NewPipeline from './pages/NewPipeline';
import Pipelines from './pages/Pipelines';
import Research from './pages/Research';
import Deployment from './pages/Deployment';
import GitLab from './pages/GitLab';
import Security from './pages/Security';
import KnowledgeBase from './pages/KnowledgeBase';
import Login from './pages/Login';
import { api, tokenStore } from './utils/api';

const PAGE_TITLES = {
  dashboard:  { title: 'Dashboard',        sub: 'Overview — 7-stage autonomous SDLC pipeline' },
  command:    { title: 'Command Center',    sub: 'Live agent decisions, pipeline flow, and real-time metrics' },
  new:        { title: 'New Pipeline',     sub: 'Start a fully autonomous engineering pipeline' },
  pipelines:  { title: 'Pipelines',        sub: 'All pipeline runs, artifacts, logs, and exports' },
  research:   { title: 'Auto-Research',    sub: 'Self-improving optimization with real timeit benchmarks' },
  deployment: { title: 'Deployments',      sub: 'Deployed services, health checks, and Dockerfile' },
  gitlab:     { title: 'GitLab',           sub: 'Issues, Merge Requests, and CI/CD pipelines' },
  security:   { title: 'Security',         sub: 'Real bandit SAST findings and OWASP Top 10 coverage' },
  rag:        { title: 'Knowledge Base',   sub: 'RAG vector store — agent context retrieval' },
};

export default function App() {
  const [page, setPage] = useState('command'); // Default to Command Center for demos
  const [activePipelineId, setActivePipelineId] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = tokenStore.get();
    if (token) {
      api.me().then(u => { setUser(u); setAuthChecked(true); })
              .catch(() => { tokenStore.clear(); setAuthChecked(true); });
    } else {
      setAuthChecked(true);
    }
  }, []);

  const handleLogout = () => { tokenStore.clear(); setUser(null); };

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!user) return <Login onLogin={setUser} />;

  const { title, sub } = PAGE_TITLES[page] || PAGE_TITLES.command;

  const renderPage = () => {
    switch (page) {
      case 'dashboard':  return <Dashboard setPage={setPage} />;
      case 'command':    return <CommandCenter setPage={setPage} />;
      case 'new':        return <NewPipeline setPage={setPage} setActivePipelineId={setActivePipelineId} />;
      case 'pipelines':  return <Pipelines activePipelineId={activePipelineId} setActivePipelineId={setActivePipelineId} setPage={setPage} />;
      case 'research':   return <Research />;
      case 'deployment': return <Deployment />;
      case 'gitlab':     return <GitLab />;
      case 'security':   return <Security />;
      case 'rag':        return <KnowledgeBase />;
      default:           return <CommandCenter />;
    }
  };

  return (
    <div className="layout">
      <Sidebar page={page} setPage={setPage} />
      <div className="main">
        <div className="topbar">
          <div>
            <div className="topbar-title">{title}</div>
            <div className="topbar-subtitle">{sub}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user.username}</span>
            <span className="badge badge-success">Authenticated</span>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Sign Out</button>
          </div>
        </div>
        {renderPage()}
      </div>
    </div>
  );
}

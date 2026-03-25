import React from 'react';

const ICON = {
  command:   <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="14" height="10" rx="2"/><line x1="5" y1="14" x2="11" y2="14"/><line x1="8" y1="12" x2="8" y2="14"/><path d="M4 7l2 2 4-4"/></svg>,
  dashboard: <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,
  pipeline:  <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="3" cy="8" r="2"/><circle cx="13" cy="8" r="2"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="8" y1="3" x2="8" y2="5"/><line x1="8" y1="11" x2="8" y2="13"/><circle cx="8" cy="8" r="2"/></svg>,
  research:  <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1,12 5,7 8,9 11,4 15,6"/><line x1="1" y1="14" x2="15" y2="14"/></svg>,
  deploy:    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1l3 5H5zM5 9h6v6H5z"/><line x1="8" y1="6" x2="8" y2="9"/></svg>,
  gitlab:    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 14L1 6l2-5 2 4h6l2-4 2 5z"/></svg>,
  security:  <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1L2 3.5V8c0 3.3 2.4 5.7 6 7 3.6-1.3 6-3.7 6-7V3.5z"/><polyline points="5,8 7,10 11,6"/></svg>,
  rag:       <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="8" cy="4" rx="6" ry="2"/><path d="M2 4v4c0 1.1 2.7 2 6 2s6-.9 6-2V4"/><path d="M2 8v4c0 1.1 2.7 2 6 2s6-.9 6-2V8"/></svg>,
  new:       <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="7"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/></svg>,
};

const NAV_SECTIONS = [
  { label: 'Main', items: [
    { key: 'command',   label: 'Command Center', icon: 'command', highlight: true },
    { key: 'dashboard', label: 'Dashboard',      icon: 'dashboard' },
  ]},
  { label: 'Pipeline', items: [
    { key: 'new',        label: 'New Pipeline',  icon: 'new' },
    { key: 'pipelines',  label: 'Pipelines',     icon: 'pipeline' },
    { key: 'research',   label: 'Auto-Research', icon: 'research' },
    { key: 'deployment', label: 'Deployments',   icon: 'deploy' },
  ]},
  { label: 'Tools', items: [
    { key: 'gitlab',   label: 'GitLab',          icon: 'gitlab' },
    { key: 'security', label: 'Security',        icon: 'security' },
    { key: 'rag',      label: 'Knowledge Base',  icon: 'rag' },
  ]},
];

export default function Sidebar({ page, setPage }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <h1>AutoDev Guardian</h1>
        <p>Autonomous AI Engineer</p>
      </div>
      <div className="sidebar-nav">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map(({ key, label, icon, highlight }) => (
              <button key={key}
                className={`nav-item${page === key ? ' active' : ''}`}
                style={highlight && page !== key ? { background: 'var(--accent-light)', color: 'var(--accent)' } : {}}
                onClick={() => setPage(key)}>
                {ICON[icon]}
                {label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <div className="text-muted" style={{ fontSize: 11 }}>AutoDev Guardian v1.0</div>
        <div className="text-muted" style={{ fontSize: 11 }}>7-Stage SDLC · Real AI</div>
      </div>
    </nav>
  );
}

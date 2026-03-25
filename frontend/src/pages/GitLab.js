import React, { useCallback, useState } from 'react';
import { api } from '../utils/api';
import { usePolling } from '../hooks/usePolling';

export default function GitLab() {
  const fetchMRs = useCallback(() => api.listMRs(), []);
  const fetchPipelines = useCallback(() => api.listGitlabPipelines(), []);
  const { data: mrsData } = usePolling(fetchMRs, 4000);
  const { data: pipelinesData } = usePolling(fetchPipelines, 4000);

  const mrs = mrsData?.merge_requests || [];
  const pipelines = pipelinesData?.pipelines || [];

  const [newIssue, setNewIssue] = useState({ title: '', description: '' });
  const [createdIssue, setCreatedIssue] = useState(null);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('mrs');

  const handleCreateIssue = async () => {
    if (!newIssue.title.trim()) return;
    setCreating(true);
    try {
      const result = await api.createIssue({ title: newIssue.title, description: newIssue.description });
      setCreatedIssue(result.issue);
      setNewIssue({ title: '', description: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <div className="mb-16">
        <div style={{ fontSize: 18, fontWeight: 600 }}>GitLab Integration</div>
        <div className="text-muted mt-4">Issues, Merge Requests, and CI/CD pipelines managed autonomously</div>
      </div>

      <div className="alert alert-info mb-16" style={{ marginBottom: 16 }}>
        Running in mock mode. Set GITLAB_TOKEN and GITLAB_PROJECT_ID in .env to connect to a real GitLab instance.
      </div>

      <div className="grid-2 gap-16 mb-16">
        {/* Create issue */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Create Issue Manually</div>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" value={newIssue.title} onChange={e => setNewIssue(p => ({ ...p, title: e.target.value }))} placeholder="Issue title..." />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-textarea" rows={3} value={newIssue.description} onChange={e => setNewIssue(p => ({ ...p, description: e.target.value }))} placeholder="Describe the issue..." />
          </div>
          <button className="btn btn-primary" onClick={handleCreateIssue} disabled={creating || !newIssue.title}>
            {creating ? 'Creating...' : 'Create Issue'}
          </button>
          {createdIssue && (
            <div className="alert alert-success mt-8" style={{ marginTop: 10 }}>
              Issue #{createdIssue.iid} created: {createdIssue.title}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>GitLab Activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="flex justify-between items-center">
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Merge Requests</span>
              <span className="badge badge-info">{mrs.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>CI Pipelines</span>
              <span className="badge badge-info">{pipelines.length}</span>
            </div>
            <div className="divider" />
            <div className="text-muted text-sm">All MRs and pipelines are created automatically when you run an AutoDev Guardian pipeline.</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={`tab${activeTab === 'mrs' ? ' active' : ''}`} onClick={() => setActiveTab('mrs')}>Merge Requests ({mrs.length})</button>
          <button className={`tab${activeTab === 'pipelines' ? ' active' : ''}`} onClick={() => setActiveTab('pipelines')}>CI Pipelines ({pipelines.length})</button>
        </div>

        {activeTab === 'mrs' && (
          <div>
            {mrs.length === 0 ? (
              <div className="text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>No MRs yet. Run a pipeline to auto-create one.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>ID</th><th>Title</th><th>Branch</th><th>Target</th><th>Status</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {mrs.map(mr => (
                    <tr key={mr.id}>
                      <td className="text-mono">!{mr.iid}</td>
                      <td style={{ maxWidth: 300 }}><span className="truncate" style={{ display: 'block' }}>{mr.title}</span></td>
                      <td className="text-mono text-muted" style={{ fontSize: 11 }}>{mr.source_branch}</td>
                      <td className="text-mono text-muted" style={{ fontSize: 11 }}>{mr.target_branch}</td>
                      <td><span className="badge badge-warning">{mr.state}</span></td>
                      <td className="text-muted text-sm">{new Date(mr.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'pipelines' && (
          <div>
            {pipelines.length === 0 ? (
              <div className="text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>No CI pipelines triggered yet.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>ID</th><th>Ref</th><th>Stages</th><th>Status</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {pipelines.map(p => (
                    <tr key={p.id}>
                      <td className="text-mono">#{p.id}</td>
                      <td className="text-mono" style={{ fontSize: 11 }}>{p.ref}</td>
                      <td className="text-muted text-sm">{p.stages?.join(', ')}</td>
                      <td><span className="badge badge-warning">{p.status}</span></td>
                      <td className="text-muted text-sm">{new Date(p.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

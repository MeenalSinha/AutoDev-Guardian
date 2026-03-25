import React, { useCallback, useState } from 'react';
import { api } from '../utils/api';
import { usePolling, useOnce } from '../hooks/usePolling';

export default function KnowledgeBase() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);

  const fetchStats = useCallback(() => api.ragStats(), []);
  const { data: stats } = usePolling(fetchStats, 5000);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await api.ragSearch(query);
      setResults(data);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const typeColor = {
    code: 'badge-info',
    security: 'badge-danger',
    merge_request: 'badge-success',
    research: 'badge-warning',
    optimization: 'badge-warning',
    vulnerability: 'badge-danger',
    devops: 'badge-neutral',
    doc: 'badge-neutral',
  };

  return (
    <div className="page">
      <div className="mb-16">
        <div style={{ fontSize: 18, fontWeight: 600 }}>Knowledge Base</div>
        <div className="text-muted mt-4">
          RAG vector store — code snippets, security findings, MRs, and research results indexed for agent retrieval
        </div>
      </div>

      {/* Stats */}
      <div className="grid-4 mb-16">
        <div className="stat-card">
          <div className="stat-label">Total Documents</div>
          <div className="stat-value">{stats?.total_documents ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Store Type</div>
          <div className="stat-value" style={{ fontSize: 14, paddingTop: 8 }}>{stats?.store_type ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">FAISS Available</div>
          <div className="stat-value" style={{ fontSize: 14, paddingTop: 8 }}>
            <span className={`badge ${stats?.faiss_available ? 'badge-success' : 'badge-neutral'}`}>
              {stats?.faiss_available ? 'Yes' : 'In-memory fallback'}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Similarity</div>
          <div className="stat-value" style={{ fontSize: 14, paddingTop: 8 }}>Keyword overlap</div>
        </div>
      </div>

      {/* Search */}
      <div className="card mb-16">
        <div className="card-title" style={{ marginBottom: 12 }}>Semantic Search</div>
        <div className="flex gap-8" style={{ gap: 8, marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search: SQL injection fix, async database, JWT auth..."
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Quick searches */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['SQL injection', 'async performance', 'JWT authentication', 'CVE vulnerability', 'LRU cache'].map(q => (
            <button key={q} className="btn btn-secondary btn-sm" onClick={() => { setQuery(q); }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {results && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Results for "{results.query}"</div>
              <div className="card-subtitle">{results.results?.length} documents retrieved</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.results?.length === 0 && (
              <div className="text-muted text-sm">No matching documents found.</div>
            )}
            {(results.results || []).map((doc, i) => (
              <div key={i} style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-8" style={{ marginBottom: 6, gap: 8 }}>
                  <span className={`badge ${typeColor[doc.metadata?.type] || 'badge-neutral'}`}>{doc.metadata?.type || 'doc'}</span>
                  <span className="text-mono text-muted" style={{ fontSize: 10 }}>doc-{doc.id}</span>
                  {doc.metadata?.pipeline_id && (
                    <span className="text-muted text-sm">Pipeline: {doc.metadata.pipeline_id}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{doc.content}</div>
                {doc.metadata?.tags && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {doc.metadata.tags.map(tag => (
                      <span key={tag} className="badge badge-neutral" style={{ fontSize: 10 }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How agents use RAG */}
      <div className="card mt-16" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>How Agents Use the Knowledge Base</div>
        <table className="table">
          <thead>
            <tr><th>Agent</th><th>Query Type</th><th>Retrieved Context</th><th>Usage</th></tr>
          </thead>
          <tbody>
            {[
              { agent: 'Feature Builder', query: 'Feature-specific', ctx: 'Code patterns, API designs', usage: 'Generate consistent, idiomatic code' },
              { agent: 'Security Triage', query: 'Security-filtered', ctx: 'Known CVEs, OWASP fixes', usage: 'Identify matching vulnerabilities' },
              { agent: 'Dependency Healer', query: 'Code-filtered', ctx: 'Upgrade patterns, migration notes', usage: 'Safe upgrade recommendations' },
              { agent: 'Auto-Research', query: 'Optimization-filtered', ctx: 'Past improvements, techniques', usage: 'Avoid repeating failed strategies' },
            ].map(({ agent, query, ctx, usage }) => (
              <tr key={agent}>
                <td style={{ fontWeight: 500 }}>{agent}</td>
                <td className="text-muted">{query}</td>
                <td className="text-muted">{ctx}</td>
                <td className="text-muted">{usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Vite uses import.meta.env.VITE_* — we support both naming conventions
const BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && process.env?.REACT_APP_API_URL) ||
  'http://localhost:8000/api'
);

export const tokenStore = {
  get: () => localStorage.getItem('autodev_token'),
  set: (t) => localStorage.setItem('autodev_token', t),
  clear: () => localStorage.removeItem('autodev_token'),
};

async function request(path, options = {}) {
  const token = tokenStore.get();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (res.status === 401) { tokenStore.clear(); window.location.reload(); return; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (username, password) => {
    const body = new URLSearchParams({ username, password });
    return fetch(`${BASE}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }).then(async r => { if (!r.ok) throw new Error('Invalid credentials'); return r.json(); });
  },
  me: () => request('/auth/me'),
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  // Pipeline
  startPipeline: (body) => request('/pipeline/start', { method: 'POST', body: JSON.stringify(body) }),
  getPipeline: (id) => request(`/pipeline/${id}`),
  getPipelineLogs: (id, since = 0) => request(`/pipeline/${id}/logs?since=${since}`),
  cancelPipeline: (id) => request(`/pipeline/${id}/cancel`, { method: 'POST' }),
  exportPipeline: (id) => {
    const token = tokenStore.get();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch(`${BASE}/pipeline/${id}/export`, { headers }).then(r => r.blob());
  },
  listPipelines: () => request('/pipelines'),

  // Research
  triggerResearch: (body) => request('/research/trigger', { method: 'POST', body: JSON.stringify(body) }),
  getResearchSessions: () => request('/research/sessions'),
  getResearchSession: (id) => request(`/research/session/${id}`),

  // GitLab
  createIssue: (body) => request('/gitlab/issue', { method: 'POST', body: JSON.stringify(body) }),
  listMRs: () => request('/gitlab/mrs'),
  listGitlabPipelines: () => request('/gitlab/pipelines'),

  // Deployment
  getDeploymentStatus: (id) => request(`/deploy/${id}`),

  // Agents
  getAgentStatus: () => request('/agents/status'),

  // RAG
  ragStats: () => request('/rag/stats'),
  ragSearch: (query) => request(`/rag/search?query=${encodeURIComponent(query)}`),

  // Metrics & Stats
  getMetrics: () => request('/metrics'),
  getStats: () => request('/stats'),
  health: () => fetch(BASE.replace('/api', '') + '/health').then(r => r.json()),
};

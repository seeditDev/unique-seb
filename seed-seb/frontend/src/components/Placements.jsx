import React, { useEffect, useMemo, useState } from 'react';
import placementsExample from '../data/placements.example.json';
import '../styles/Placements.css';

const tryFetchJson = async (url) => {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_) {
    return null;
  }
};

const Placements = ({ user }) => {
  const [activeTab, setActiveTab] = useState('jobs');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [tag, setTag] = useState('');

  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      // Try public placements first
      const publicUrl = `/placements.json`;
      const data = await tryFetchJson(publicUrl);
      if (data && Array.isArray(data)) {
        setItems(data);
        setLoading(false);
        return;
      }
      // Fallback to example bundled JSON
      setItems(placementsExample || []);
      setLoading(false);
    };
    load();
  }, []);

  const userSummary = useMemo(() => {
    if (!user) return null;
    return {
      name: user.name || '-',
      email: user.email || '-',
      college: user.college || '-',
      department: user.department || '-',
      year: user.year || '-'
    };
  }, [user]);

  const allCompanies = useMemo(() => Array.from(new Set(items.map(p => p?.company?.name).filter(Boolean))).sort(), [items]);
  const allStatuses = useMemo(() => Array.from(new Set(items.map(p => p?.metadata?.status).filter(Boolean))).sort(), [items]);
  const allModes = useMemo(() => Array.from(new Set(items.map(p => p?.workMode).filter(Boolean))).sort(), [items]);
  const allTags = useMemo(() => {
    const tags = items.flatMap(p => (p?.metadata?.tags || []));
    const unique = Array.from(new Set(tags.filter(Boolean)));
    return unique.sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = (query ?? '').toLowerCase();
    return items.filter(p => {
      if (company && (p?.company?.name !== company)) return false;
      if (status && (p?.metadata?.status !== status)) return false;
      if (workMode && (p?.workMode !== workMode)) return false;
      if (tag && !(p?.metadata?.tags || []).includes(tag)) return false;
      if (q) {
        const hay = [
          p?.company?.name,
          p?.role?.title,
          p?.role?.category,
          ...(p?.metadata?.tags || [])
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, company, status, workMode, tag]);

  const Tile = ({ p }) => (
    <div className="placements-card" onClick={() => setSelected(p)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {p?.company?.logoUrl && (
          <img src={p.company.logoUrl} alt={p?.company?.name} style={{ width: 40, height: 40, objectFit: 'contain' }} />
        )}
        <div>
          <div style={{ fontWeight: 700 }}>{p?.company?.name ?? ''}</div>
          <div style={{ color: '#555' }}>{p?.role?.title ?? ''}</div>
          <div style={{ color: '#777', fontSize: 12 }}>{p?.ui?.tileSubtitle ?? ''}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(p?.ui?.badges || []).map((b, i) => (
          <span key={i} style={{ background: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>{b}</span>
        ))}
        {(p?.metadata?.tags || []).map((t, i) => (
          <span key={`t-${i}`} style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>{t}</span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="section-content">
      <div className="placements-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Placements</h2>
        {userSummary && (
          <div style={{ fontSize: 12, color: '#666' }}>
            {userSummary.name} • {userSummary.college} • {userSummary.department} • {userSummary.year}
          </div>
        )}
      </div>

      <div className="placements-tabs">
        <button
          className={activeTab === 'jobs' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('jobs')}
        >
          Jobs
        </button>
        <button
          className={activeTab === 'applications' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('applications')}
        >
          Applications
        </button>
        <button
          className={activeTab === 'resources' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('resources')}
        >
          Resources
        </button>
      </div>

      {activeTab === 'jobs' && (
        <>
          <div className="placements-filters">
            <input
              type="text"
              placeholder="Search company, role, tag..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">All Companies</option>
              {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Status</option>
              {allStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
              <option value="">All Work Modes</option>
              {allModes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All Tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {loading && <div className="placements-card">Loading...</div>}
          {error && <div className="placements-card" style={{ color: '#b91c1c' }}>{error}</div>}

          {!loading && !error && (
            <div className="placements-grid">
              {filtered.map(p => (
                <Tile key={p.id} p={p} />
              ))}
              {filtered.length === 0 && (
                <div className="placements-card">No postings match your filters.</div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'applications' && (
        <div className="placements-card">
          <h3 style={{ marginTop: 0 }}>Your Applications</h3>
          <p>Track your applications and status here. (Coming soon)</p>
        </div>
      )}

      {activeTab === 'resources' && (
        <div className="placements-card">
          <h3 style={{ marginTop: 0 }}>Preparation Resources</h3>
          <ul>
            <li>Interview preparation guides</li>
            <li>Company-specific questions</li>
            <li>Resume and portfolio tips</li>
          </ul>
        </div>
      )}

      {selected && (
        <div className="preview-overlay" onClick={() => setSelected(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h3 style={{ margin: 0 }}>{selected?.company?.name} • {selected?.role?.title}</h3>
              <div className="actions">
                {selected?.application?.jdUrl && (
                  <a className="btn-secondary" href={selected.application.jdUrl} target="_blank" rel="noreferrer">View JD</a>
                )}
                {selected?.application?.applyUrl && (
                  <a className="btn-primary" href={selected.application.applyUrl} target="_blank" rel="noreferrer">Apply</a>
                )}
                <button className="btn-secondary" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>
            <div className="preview-body">
              <div className="preview-row"><h4>Company</h4><div>{selected?.company?.name} • <a href={selected?.company?.website} target="_blank" rel="noreferrer">Website</a></div></div>
              <div className="preview-row"><h4>Role</h4><div>{selected?.role?.title} ({selected?.role?.level}) • {selected?.role?.type}</div></div>
              <div className="preview-row"><h4>Location / Mode</h4><div>{(selected?.locations || []).join(', ')} • {selected?.workMode ?? ''}</div></div>
              <div className="preview-row"><h4>Compensation</h4><div>{selected?.compensation?.ctc ?? ''} {selected?.compensation?.stipend ? `• Stipend ${selected?.compensation?.stipend}` : ''}</div></div>
              <div className="preview-row"><h4>Eligibility</h4><div>
                Batches: {(selected?.eligibility?.batches || []).join(', ') || '-'} • CGPA ≥ {selected?.eligibility?.minCGPA ?? '-'}<br />
                Departments: {(selected?.eligibility?.departmentsAllowed || selected?.eligibility?.departments || selected?.eligibility?.departmentsallowed || []).join(', ') || '-'}<br />
                Backlogs: {selected?.eligibility?.backlogPolicy ?? ''}
              </div></div>
              <div className="preview-row"><h4>Skills</h4><div>
                <strong>Required:</strong> {(selected?.skills?.required || []).join(', ') || '-'}<br />
                <strong>Preferred:</strong> {(selected?.skills?.preferred || []).join(', ') || '-'}
              </div></div>
              <div className="preview-row"><h4>Application</h4><div>
                Status: {selected?.metadata?.status ?? ''} • Priority: {selected?.metadata?.priority ?? ''}<br />
                Last date: {selected?.application?.lastDate ? new Date(selected.application.lastDate).toLocaleString() : '-'}
              </div></div>
              <div className="preview-row"><h4>Rounds</h4><div>
                {(selected?.application?.rounds || []).map((r, idx) => (<div key={idx}>• {r.name} {r.notes ? `- ${r.notes}` : ''}</div>))}
              </div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Placements;

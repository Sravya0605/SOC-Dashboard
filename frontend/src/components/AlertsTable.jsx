import { useState, useMemo } from "react";
import PropTypes from "prop-types";

const sevColor = s => {
  switch (s?.toLowerCase()) {
    case "critical": return "var(--sev-critical)";
    case "high": return "var(--sev-high)";
    case "medium": return "var(--sev-medium)";
    case "low": return "var(--sev-low)";
    default: return "#94a3b8";
  }
};

export default function AlertsTable({ alerts }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(1); // 1=asc, -1=desc
  const pageSize = 10;

  const filtered = useMemo(() => {
    let list = alerts;
    if (search) {
      const term = search.toLowerCase();
      list = list.filter(a =>
        a.user?.toLowerCase().includes(term) ||
        a.ip?.includes(term) ||
        a.hostname?.toLowerCase().includes(term) ||
        a.severity?.toLowerCase().includes(term) ||
        String(a.failed_logins || '').includes(term) ||
        String(a.score || '').includes(term)
      );
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const va = a[sortKey] || '';
        const vb = b[sortKey] || '';
        if (va < vb) return -1 * sortDir;
        if (va > vb) return 1 * sortDir;
        return 0;
      });
    }
    return list;
  }, [alerts, search, sortKey, sortDir]);

  const pageCount = Math.ceil(filtered.length / pageSize);
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportCsv = () => {
    const rows = [
      ['Time','User','IP','Hostname','Failed','Score','Severity'],
      ...filtered.map(a => [
        new Date(a.timestamp).toISOString(),
        a.user,
        a.ip,
        a.hostname,
        a.failed_logins,
        a.score!=null? a.score.toFixed(2) : '',
        a.severity
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v || ''}"`).join(',')).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alerts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrev = () => setPage(p => Math.max(1, p - 1));
  const handleNext = () => setPage(p => Math.min(pageCount, p + 1));

  return (
    <div>
      <div style={{ marginBottom: "8px", display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label>
          Search: 
          <input
            type="search"
            placeholder="user, ip, severity, etc."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            aria-label="Filter alerts"
          />
        </label>
        <button className="btn" onClick={exportCsv} aria-label="Export alerts as CSV">
          Export CSV
        </button>
      </div>
      <table aria-live="polite">
        <thead>
          <tr>
            {['timestamp','user','ip','hostname','failed_logins','score','severity'].map(col => (
              <th
                key={col}
                onClick={() => {
                  if (sortKey === col) {
                    setSortDir(d => -d);
                  } else {
                    setSortKey(col);
                    setSortDir(1);
                  }
                }}
                style={{ cursor: 'pointer' }}
                aria-sort={sortKey === col ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'}
              >
                {col === 'timestamp'
                  ? 'Time'
                  : col === 'failed_logins'
                  ? 'Failed'
                  : col === 'score'
                  ? 'Score'
                  : col.charAt(0).toUpperCase() + col.slice(1)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {pageData.map(a => (
            <tr key={a._id}>
              <td>{new Date(a.timestamp).toLocaleString()}</td>
              <td>{a.user}</td>
              <td>{a.ip}</td>
              <td>{a.hostname || '-'}</td>
              <td>{a.failed_logins ?? '-'}</td>
              <td>{a.score != null ? a.score.toFixed(2) : '-'}</td>
              <td>
                <span className="badge" style={{ background: sevColor(a.severity) }}>
                  {a.severity}
                </span>
              </td>
            </tr>
          ))}
          {pageData.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: "center" }}>No alerts</td>
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ marginTop: "8px" }}>
        <button className="btn" onClick={handlePrev} disabled={page === 1}>
          Prev
        </button>{" "}
        <button className="btn" onClick={handleNext} disabled={page === pageCount || pageCount === 0}>
          Next
        </button>
        <span style={{ marginLeft: "8px" }}>
          Page {page} of {pageCount || 1}
        </span>
      </div>
    </div>
  );
}

AlertsTable.propTypes = {
  alerts: PropTypes.arrayOf(PropTypes.shape({
    _id: PropTypes.string.isRequired,
    user: PropTypes.string,
    ip: PropTypes.string,
    hostname: PropTypes.string,
    failed_logins: PropTypes.number,
    score: PropTypes.number,
    severity: PropTypes.string,
    timestamp: PropTypes.string
  }))
};

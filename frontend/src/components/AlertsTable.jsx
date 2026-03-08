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
  return (
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>IP</th>
          <th>Severity</th>
          <th>Time</th>
        </tr>
      </thead>

      <tbody>
        {alerts.map(a => (
          <tr key={a._id}>
            <td>{a.user}</td>
            <td>{a.ip}</td>
            <td>
              <span className="badge" style={{ background: sevColor(a.severity) }}>
                {a.severity}
              </span>
            </td>
            <td>{new Date(a.timestamp).toLocaleTimeString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

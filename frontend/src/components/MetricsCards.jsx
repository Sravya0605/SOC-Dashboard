export default function MetricsCards({ metrics }) {
  return (
    <div className="grid">
      <div className="card metric">
        <div className="metric-label">Alerts / min</div>
        <div className="metric-value">{metrics.alertsPerMin}</div>
      </div>

      <div className="card metric">
        <div className="metric-label">Total Alerts</div>
        <div className="metric-value">{metrics.total}</div>
      </div>
    </div>
  );
}

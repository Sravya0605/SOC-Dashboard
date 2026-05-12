import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import PropTypes from "prop-types";

const COLORS = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)"
};

export default function SeverityChart({ data, style }) {
  // Ensure data is an array with valid entries
  const chartData = (data && Array.isArray(data)) ? data : [];
  
  return (
    <div className="card" style={style}>
      <h3 className="section-title">Severity Distribution</h3>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />

          <Bar dataKey="value">
            {chartData.map((d, i) => {
              const severityName = d?.name?.toLowerCase?.() || "unknown";
              return <Cell key={i} fill={COLORS[severityName] || "#64748b"} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

SeverityChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({ name: PropTypes.string, value: PropTypes.number })
  ),
  style: PropTypes.object
};

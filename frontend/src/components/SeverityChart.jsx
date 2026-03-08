import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)"
};

export default function SeverityChart({ data }) {
  return (
    <div className="card">
      <h3 className="section-title">Severity Distribution</h3>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />

          <Bar dataKey="value">
            {data.map((d, i) => (
              <Cell key={i} fill={COLORS[d.name.toLowerCase()] || "#64748b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { connectSocket } from "../socket";
import SeverityChart from "../components/SeverityChart";
import AlertsTable from "../components/AlertsTable";
import Loading from "../components/Loading";

// charts
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function DashboardPage() {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [metricsHistory, setMetricsHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAlerts = async () => {
    try {
      const a = await api.get("/alerts");
      setAlerts(a.data.alerts);
    } catch (err) {
      setError(err.message || "Unable to fetch alerts");
    }
  };

  const loadInitial = async () => {
    try {
      setLoading(true);
      const [m, a] = await Promise.all([
        api.get("/metrics"),
        api.get("/alerts")
      ]);
      setMetrics(m.data);
      setAlerts(a.data.alerts);
      setMetricsHistory([{ ts: Date.now(), alertsPerMin: m.data.alertsPerMin ?? 0 }]);
    } catch (err) {
      setError(err.message || "Unable to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
    const socket = connectSocket(token);
    socket.on('metrics', (newMetrics) => {
      setMetrics(newMetrics);
      setMetricsHistory(hist => {
        const next = [...hist, { ts: Date.now(), alertsPerMin: newMetrics.alertsPerMin ?? 0 }];
        return next.slice(-20);
      });
    });
    // poll alerts every 5 seconds
    const alertInterval = setInterval(loadAlerts, 5000);
    return () => {
      socket.disconnect();
      clearInterval(alertInterval);
    };
  }, [token]);

  if (loading) return <Loading />;

  if (error) return <div role="alert">{error}</div>;


  return (
    <>
      {/* history line chart + severity side by side */}
      <div className="section chart-row">
        <div>
          <h3 className="section-title">Alerts / Minute</h3>
          <div className="card" style={{ padding: 0, height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsHistory.length > 0 ? metricsHistory.map(p => ({
                time: new Date(p.ts).toLocaleTimeString(),
                // ensure we always have a numeric value (0 when alerts/min absent)
                value: p.alertsPerMin ?? 0
              })) : [{ time: new Date().toLocaleTimeString(), value: 0 }]}>
                <XAxis dataKey="time" />
                {/* always include zero on the y‑axis so the line can drop to 0 */}
                <YAxis domain={[0, "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <SeverityChart data={metrics.perSeverity} style={{ padding: 0, height: 260 }} />
        </div>
      </div>

      <div className="section">
        <AlertsTable alerts={alerts} />
      </div>
    </>
  );
}
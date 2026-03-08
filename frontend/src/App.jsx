import { useEffect, useState } from "react";
import { api } from "./api/client";
import { useAuth } from "./auth/useAuth";

import Login from "./auth/Login";
import Register from "./auth/Register";
import Header from "./components/Header";
import AlertsTable from "./components/AlertsTable";
import MetricsCards from "./components/MetricsCards";
import SeverityChart from "./components/SeverityChart";
import Loading from "./components/Loading";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  const { user, login, register, logout } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);

  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        setLoading(true);

        const [m, a] = await Promise.all([
          api.get("/metrics"),
          api.get("/alerts")
        ]);

        setMetrics(m.data);
        setAlerts(a.data.alerts);
      } finally {
        setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [user]);

  if (!user) {
    return isRegistering ? (
      <Register onRegister={register} onSwitchToLogin={() => setIsRegistering(false)} />
    ) : (
      <Login onLogin={login} onSwitchToRegister={() => setIsRegistering(true)} />
    );
  }
  if (loading || !metrics) return <Loading />;

  return (
    <ErrorBoundary>
      <div className="page">
        <Header onLogout={logout} />

        <MetricsCards metrics={metrics} />

        <div className="section">
          <SeverityChart data={metrics.perSeverity} />
        </div>

        <div className="section">
          <AlertsTable alerts={alerts} />
        </div>
      </div>
    </ErrorBoundary>
  );
}

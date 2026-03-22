import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";

// pages
import Login from "./auth/Login";
import Register from "./auth/Register";
import DashboardPage from "./pages/DashboardPage";
import ProfilePage from "./pages/ProfilePage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ErrorBoundary from "./components/ErrorBoundary";

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot" element={<ForgotPasswordPage />} />
            <Route
              path="/*"
              element={
                <PrivateRoute>
                  <LayoutWrapper />
                </PrivateRoute>
              }
            />
          </Routes>
        </Router>
      </ErrorBoundary>
    </AuthProvider>
  );
}

function LayoutWrapper() {
  const { logout } = useAuth();
  return (
    <Layout onLogout={logout}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/forgot" element={<ForgotPasswordPage />} />
      </Routes>
    </Layout>
  );
}

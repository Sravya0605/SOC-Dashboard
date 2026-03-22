import React, { createContext, useContext, useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import { api, setLogoutHandler } from "../api/client";

const AuthContext = createContext(null);

function parseToken(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function getExpiration(token) {
  const payload = parseToken(token);
  return payload?.exp;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("profile")) || {};
    } catch {
      return {};
    }
  });
  const [user, setUser] = useState(() => {
    if (token) {
      const parsed = parseToken(token);
      return parsed ? { ...parsed, ...profile } : { ...profile };
    }
    return null;
  });

  // Sync token to localStorage and parse user
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      const parsed = parseToken(token);
      setUser(parsed ? { ...parsed, ...profile } : { ...profile });
    } else {
      localStorage.removeItem("token");
      setUser(null);
    }
  }, [token, profile]);

  // persist profile separately
  useEffect(() => {
    try {
      localStorage.setItem("profile", JSON.stringify(profile));
    } catch {}
  }, [profile]);

  const updateProfile = React.useCallback(async (updates) => {
    try {
      await api.put("/profile", updates);
      setProfile(p => ({ ...p, ...updates }));
      setUser(u => (u ? { ...u, ...updates } : { ...updates }));
    } catch (err) {
      console.error("Failed to update profile:", err);
      throw err;
    }
  }, []);

  const logout = React.useCallback(() => {
    setToken(null);
    if (typeof window !== "undefined" && window.location) {
      window.location.href = "/login"; // force navigate to login
    }
  }, []);

  // Auto logout when token expires
  useEffect(() => {
    if (!token) return;
    const exp = getExpiration(token);
    if (!exp) return;
    const ms = exp * 1000 - Date.now();
    if (ms <= 0) {
      // already expired
      logout();
      return;
    }
    const id = setTimeout(() => {
      logout();
    }, ms);
    return () => clearTimeout(id);
  }, [token, logout]);

  const login = async (username, password) => {
    const { data } = await api.post("/login", { username, password });
    setToken(data.token);
    return data;
  };

  const register = async (username, password, role = "analyst") => {
    const { data } = await api.post("/register", { username, password, role });
    setToken(data.token);
    return data;
  };

  // register logout handler with api client so 401 responses force logout
  useEffect(() => {
    setLogoutHandler(logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

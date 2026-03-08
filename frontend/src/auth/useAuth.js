import { useState } from "react";
import { api } from "../api/client";

export function useAuth() {
  const [user, setUser] = useState(() => localStorage.getItem("token"));

  const login = async (username, password) => {
    const { data } = await api.post("/login", { username, password });
    localStorage.setItem("token", data.token);
    setUser(data.token);
  };

  const register = async (username, password) => {
    const { data } = await api.post("/register", { username, password });
    localStorage.setItem("token", data.token);
    setUser(data.token);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return { user, login, register, logout };
}

import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login({ navigate: propNavigate }) {
  const { login } = useAuth();

  // defer router import so tests don't need react-router-dom resolution
  let navigate = propNavigate;
  try {
    const { useNavigate } = require("react-router-dom");
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const hookNav = useNavigate();
    navigate = navigate || hookNav;
  } catch {
    navigate = navigate || (() => {});
  }
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  const submit = async e => {
    e.preventDefault();
    try {
      await login(form.username, form.password);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h2>SOC Login</h2>

        <label>
          Username
          <input
            aria-label="username"
            placeholder="Username"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            aria-label="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn full">Login</button>

        <p style={{ textAlign: "center", marginTop: "12px" }}>
          <a href="/forgot">Forgot password?</a>
        </p>

        <p style={{ textAlign: "center", marginTop: "16px", fontSize: "14px" }}>
          Don't have an account?{" "}
          <button
            type="button"
            onClick={() => navigate("/register")}
            style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer" }}
          >
            Register
          </button>
        </p>
      </form>
    </div>
  );
}

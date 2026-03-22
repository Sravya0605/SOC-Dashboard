import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Register({ navigate: propNavigate }) {
  const { register } = useAuth();

  let navigate = propNavigate;
  try {
    const { useNavigate } = require("react-router-dom");
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const hookNav = useNavigate();
    navigate = navigate || hookNav;
  } catch {
    navigate = navigate || (() => {});
  }
  const [form, setForm] = useState({ username: "", password: "", confirmPassword: "", role: "analyst" });
  const [error, setError] = useState("");

  const submit = async e => {
    e.preventDefault();
    setError("");

    if (!form.username || !form.password) {
      setError("All fields required");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      await register(form.username, form.password, form.role);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h2>Create Account</h2>

        <label>
          Username
          <input
            placeholder="Username"
            aria-label="username"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            placeholder="Password"
            aria-label="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>

        <label>
          Confirm Password
          <input
            type="password"
            placeholder="Confirm Password"
            aria-label="confirm-password"
            value={form.confirmPassword}
            onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
            required
          />
        </label>

        <label>
          Role
          <select
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
            aria-label="role"
          >
            <option value="analyst">Analyst</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn full">Register</button>

        <p style={{ textAlign: "center", marginTop: "16px", fontSize: "14px" }}>
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer" }}
          >
            Login
          </button>
        </p>
      </form>
    </div>
  );
}

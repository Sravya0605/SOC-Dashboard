import { useState } from "react";

export default function Register({ onRegister, onSwitchToLogin }) {
  const [form, setForm] = useState({ username: "", password: "", confirmPassword: "" });
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
      await onRegister(form.username, form.password);
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h2>Create Account</h2>

        <input
          placeholder="Username"
          value={form.username}
          onChange={e => setForm({ ...form, username: e.target.value })}
        />

        <input
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })}
        />

        <input
          type="password"
          placeholder="Confirm Password"
          value={form.confirmPassword}
          onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
        />

        {error && <p className="error">{error}</p>}

        <button className="btn full">Register</button>

        <p style={{ textAlign: "center", marginTop: "16px", fontSize: "14px" }}>
          Already have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer" }}
          >
            Login
          </button>
        </p>
      </form>
    </div>
  );
}

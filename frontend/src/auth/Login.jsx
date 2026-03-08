import { useState } from "react";

export default function Login({ onLogin, onSwitchToRegister }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");

  const submit = async e => {
    e.preventDefault();
    try {
      await onLogin(form.username, form.password);
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h2>SOC Login</h2>

        <input
          placeholder="Username"
          onChange={e => setForm({ ...form, username: e.target.value })}
        />

        <input
          type="password"
          placeholder="Password"
          onChange={e => setForm({ ...form, password: e.target.value })}
        />

        {error && <p className="error">{error}</p>}

        <button className="btn full">Login</button>

        <p style={{ textAlign: "center", marginTop: "16px", fontSize: "14px" }}>
          Don't have an account?{" "}
          <button
            type="button"
            onClick={onSwitchToRegister}
            style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer" }}
          >
            Register
          </button>
        </p>
      </form>
    </div>
  );
}

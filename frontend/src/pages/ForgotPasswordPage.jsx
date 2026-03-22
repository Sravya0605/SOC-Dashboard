import React, { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = e => {
    e.preventDefault();
    // stub - backend not implemented
    setSent(true);
  };
  return (
    <div>
      <h2>Forgot Password</h2>
      {sent ? (
        <p>If this were real, you'd receive an email shortly.</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <button className="btn" type="submit">
            Send reset link
          </button>
        </form>
      )}
    </div>
  );
}
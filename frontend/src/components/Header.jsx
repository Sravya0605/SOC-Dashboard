export default function Header({ onLogout }) {
  return (
    <header className="header">
      <h1 className="title">SOC Dashboard</h1>
      <button className="btn" onClick={onLogout}>
        Logout
      </button>
    </header>
  );
}

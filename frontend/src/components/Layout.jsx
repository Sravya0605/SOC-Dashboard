import { NavLink } from "react-router-dom";
import PropTypes from "prop-types";

export default function Layout({ children, onLogout }) {
  return (
    <div className="page">
      <header className="header">
        <h1 className="title">SOC Dashboard</h1>
        <nav className="nav" aria-label="Main navigation">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Dashboard
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
            Profile
          </NavLink>
        </nav>
        <button className="btn logout-btn" onClick={onLogout} aria-label="Log out">
          Logout
        </button>
      </header>

      <main>{children}</main>
    </div>
  );
}

Layout.propTypes = {
  children: PropTypes.node,
  onLogout: PropTypes.func.isRequired
};
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  // always initialise hooks in same order
  const [name, setName] = useState(user?.name || "");
  const [picture, setPicture] = useState(user?.picture || "");
  const [role, setRole] = useState(user?.role || "analyst");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch profile data from server on load
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get("/profile");
        const data = res.data;
        setName(data.name || "");
        setPicture(data.picture || "");
        setRole(data.role || "analyst");
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  if (!user) return null;

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit
        alert("File size must be less than 1MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setPicture(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      console.log("Submitting profile update:", { name, picture: picture ? "set" : "empty", role });
      await updateProfile({ name, picture, role });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || "Failed to save profile";
      setError(errorMsg);
      console.error("Profile update error:", {
        status: err.response?.status,
        error: errorMsg,
        fullError: err
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 400, margin: '0 auto' }}>
      <h2>Profile</h2>
      {loading && <p style={{ textAlign: 'center', color: '#999' }}>Loading...</p>}
      {!loading && error && (
        <div style={{ 
          padding: 10, 
          marginBottom: 12, 
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: 4,
          color: '#c00'
        }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{ 
          padding: 10, 
          marginBottom: 12, 
          backgroundColor: '#efe',
          border: '1px solid #cfc',
          borderRadius: 4,
          color: '#0a0'
        }}>
          ✓ Profile saved successfully
        </div>
      )}
      {picture && (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <img
            src={picture}
            alt="Profile"
            style={{
              width: 100,
              height: 100,
              objectFit: "cover",
              borderRadius: "50%",
              border: "2px solid #ddd"
            }}
          />
        </div>
      )}
      {!loading && (
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Name:
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Role:
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
            >
              <option value="analyst">Analyst</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>
            Picture: <span style={{ fontSize: '12px', color: '#999' }}>(optional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFile}
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
            />
          </label>
        </div>
        <button className="btn" type="submit" disabled={saving} style={{ width: '100%', padding: 10 }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
      )}

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button className="btn" onClick={() => navigate("/forgot")} style={{ backgroundColor: '#f0f0f0', color: '#333' }}>
          Forgot Password?
        </button>
      </div>
    </div>
  );
}
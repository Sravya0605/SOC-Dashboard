import axios from "axios";

// allow fallback to window if envvar isn\'t set (e.g. during development)
// and provide a sensible default so the app still works after a port change
const DEFAULT_BACKEND_PORT = 4000;
const inferredFromWindow =
  window.REACT_APP_API_URL ||
  window.location.origin.replace(/:\d+$/, `:${DEFAULT_BACKEND_PORT}`);
const API_URL = process.env.REACT_APP_API_URL || inferredFromWindow;

if (!API_URL) {
  console.error("REACT_APP_API_URL not set, requests will fail");
} else {
  // help debugging by printing where the client will send requests
  console.info("Using API base URL:", API_URL);
}

export const api = axios.create({
  baseURL: API_URL
});

// attach token automatically
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// logout helper is injected later to avoid circular import
let logoutFn = null;
export function setLogoutHandler(fn) {
  logoutFn = fn;
}

// intercept responses to catch auth errors and propagate messages
api.interceptors.response.use(
  res => {
    console.log("API Response:", res.config.method.toUpperCase(), res.config.url, res.status);
    return res;
  },
  err => {
    if (err.response) {
      console.error("API Error:", err.config?.method?.toUpperCase(), err.config?.url, err.response.status, err.response.data);
      if (err.response.status === 401 && logoutFn) {
        logoutFn();
      }
      // attach a user-friendly message if possible
      err.message = err.response.data?.error || err.response.statusText;
    } else {
      console.error("API Error (no response):", err.message);
    }
    return Promise.reject(err);
  }
);

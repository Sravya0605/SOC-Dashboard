import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL;
if (!API_URL) throw new Error("REACT_APP_API_URL environment variable is required");

export const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

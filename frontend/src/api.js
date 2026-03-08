import axios from "axios";

export const API = process.env.REACT_APP_API_URL;

export const api = token =>
  axios.create({
    baseURL: API,
    headers: { Authorization: `Bearer ${token}` }
  });
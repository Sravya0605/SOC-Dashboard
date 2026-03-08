import { io } from "socket.io-client";

const API_URL = process.env.REACT_APP_API_URL;

export const connectSocket = token =>
  io(API_URL, {
    auth: { token },
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });
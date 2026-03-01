import axios from "axios";

const BASE = "http://localhost:9090/api";

// Axios instance — automatically attaches JWT if present
const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("goc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Auth ────────────────────────────────────────────────────────────────────
export const registerUser = (data) => api.post("/auth/register", data);
export const loginUser    = (data) => api.post("/auth/login", data);

// ─── Files ───────────────────────────────────────────────────────────────────

/** Upload — multipart/form-data with field name "file" */
export const uploadFile = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/files/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/** List all files for the authenticated user */
export const listFiles = () => api.get("/files");

/** Delete a file by id */
export const deleteFile = (id) => api.delete(`/files/${id}`);

/** Download — returns blob */
export const downloadFile = (id) =>
  api.get(`/files/download/${id}`, { responseType: "blob" });

/** Storage usage */
export const getStorage = () => api.get("/files/storage");
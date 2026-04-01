import axios from "axios";

const BASE = "http://localhost:9090/api";

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
export const uploadFile = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/files/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const listFiles = () => api.get("/files");

export const deleteFile = (id) => api.delete(`/files/${id}`);

export const downloadFile = (id) =>
  api.get(`/files/download/${id}`, { responseType: "blob" });

export const previewFile = (id) =>  // ← NEW: ADD THIS LINE
  api.get(`/files/preview/${id}`, { responseType: "blob" });

export const getStorage = () => api.get("/files/storage");
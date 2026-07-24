import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });
api.interceptors.request.use((config) => { const token = localStorage.getItem('token'); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
export const downloadFile = async (path, filename) => {
  const response = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

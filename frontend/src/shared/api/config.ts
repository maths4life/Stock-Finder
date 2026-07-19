export const API_URL =
  import.meta.env.VITE_API_URL ??
  process.env.VITE_API_URL ??
  "http://127.0.0.1:8000";

console.log("API_URL =", API_URL);
console.log("import.meta.env.VITE_API_URL =", import.meta.env.VITE_API_URL);
console.log("process.env.VITE_API_URL =", process.env.VITE_API_URL);
import { readErrorMessage } from "./apiError";

// DB가 Supabase에서 Cloud SQL로 옮겨가면서, 화면이 테이블에 직접 쿼리하던 방식(supabase.from(...))
// 대신 이 백엔드 API를 거쳐야 한다. 이 파일은 그 호출을 위한 얇은 공통 래퍼다.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "요청에 실패했습니다."));
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path, token) => request("GET", path, { token }),
  post: (path, body, token) => request("POST", path, { token, body }),
  patch: (path, body, token) => request("PATCH", path, { token, body }),
  delete: (path, token) => request("DELETE", path, { token }),
};

// id 여러 개를 ?id=a,b,c 형태의 쿼리스트링으로 바꾼다 (백엔드의 _ids() 파서와 짝을 이룬다).
export function idsParam(name, ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return "";
  return `${name}=${list.map(encodeURIComponent).join(",")}`;
}

export function buildQuery(params) {
  const parts = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

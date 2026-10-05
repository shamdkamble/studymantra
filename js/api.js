export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function token() {
  try {
    return localStorage.getItem("sm-token") || "";
  } catch {
    return "";
  }
}

export function setToken(value) {
  if (value) localStorage.setItem("sm-token", value);
  else localStorage.removeItem("sm-token");
}

export async function api(path, { method = "GET", body, keepalive = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive,
    });
  } catch {
    throw new ApiError("You appear to be offline.", 0);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error?.message || "Request failed.", response.status, payload);
  }
  return payload;
}

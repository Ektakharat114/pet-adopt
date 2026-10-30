const BASE = import.meta.env.VITE_API_URL || "";

export const getToken = () => {
  try {
    return localStorage.getItem("admin_token") || "";
  } catch {
    return "";
  }
};
export const setToken = (t) => {
  try {
    if (t) localStorage.setItem("admin_token", t);
    else localStorage.removeItem("admin_token");
  } catch {
    /* storage unavailable: staff will simply log in again */
  }
};

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  // For FormData the browser sets the multipart Content-Type (with boundary) itself.
  if (body && !isForm) headers["Content-Type"] = "application/json";
  if (auth) headers["Authorization"] = `Bearer ${getToken()}`;
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = Array.isArray(data.detail)
        ? data.detail.map((d) => d.msg).join(", ")
        : data.detail || detail;
    } catch {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  centre: () => request("/centre"),
  pets: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    return request(`/pets${qs ? `?${qs}` : ""}`);
  },
  pet: (id) => request(`/pets/${id}`),
  stats: () => request("/stats"),
  apply: (data) => request("/applications", { method: "POST", body: data }),
  track: (code, email) => request("/applications/track", { method: "POST", body: { code, email } }),
  volunteer: (data) => request("/volunteers", { method: "POST", body: data }),

  login: (password) => request("/admin/login", { method: "POST", body: { password } }),
  dashboard: () => request("/admin/dashboard", { auth: true }),
  createPet: (data) => request("/pets", { method: "POST", body: data, auth: true }),
  updatePet: (id, data) => request(`/pets/${id}`, { method: "PUT", body: data, auth: true }),
  deletePet: (id) => request(`/pets/${id}`, { method: "DELETE", auth: true }),
  uploadPhoto: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/uploads", { method: "POST", body: form, auth: true });
  },
  applications: () => request("/applications", { auth: true }),
  setApplicationStatus: (id, status) =>
    request(`/applications/${id}`, { method: "PATCH", body: { status }, auth: true }),
  volunteers: () => request("/volunteers", { auth: true }),
  setVolunteerStatus: (id, status) =>
    request(`/volunteers/${id}`, { method: "PATCH", body: { status }, auth: true }),
};

/** Link to paste into WhatsApp, Facebook and so on. It serves the preview card, then sends people to the pet page. */
export const shareUrl = (id) => `${BASE || window.location.origin}/share/pets/${id}`;

export const SPECIES_EMOJI = { dog: "🐶", cat: "🐱", rabbit: "🐰", bird: "🦜", other: "🐾" };
/** Shows 1 year or older as "2 yrs" and under 1 year as "3 months". Ages are stored in years (3 months = 0.25). */
export const formatAge = (years) => {
  const y = Number(years) || 0;
  if (y < 1) {
    const m = Math.round(y * 12);
    if (m < 1) return "Under 1 month";
    return `${m} month${m === 1 ? "" : "s"}`;
  }
  return `${y} yr${y === 1 ? "" : "s"}`;
};
export const ENERGY_LABEL = { low: "Low energy", medium: "Medium energy", high: "High energy" };

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

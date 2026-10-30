// Saved pets live in this browser only (no account needed). A tiny store so every heart
// button and the nav counter stay in step.
import { useSyncExternalStore } from "react";

const KEY = "ph_favorites";
const listeners = new Set();

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

let ids = read();

function write(next) {
  ids = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: favorites last until the tab closes */
  }
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      ids = read();
      listeners.forEach((l) => l());
    }
  });
}

const subscribe = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function toggleFavorite(id) {
  write(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

export function useFavorites() {
  const list = useSyncExternalStore(subscribe, () => ids);
  return { ids: list, has: (id) => list.includes(id), toggle: toggleFavorite };
}

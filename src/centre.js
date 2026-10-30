import { useEffect, useState } from "react";
import { api } from "./api.js";

const FALLBACK = { name: "Paws & Hearts Adoption Centre", email: "", phone: "", address: "", upi_id: "", bank_details: "" };
let cached = null;
let pending = null;

/** Centre name, contact details and donation details, fetched once and shared by every page. */
export function useCentre() {
  const [centre, setCentre] = useState(cached || FALLBACK);
  useEffect(() => {
    if (cached) return;
    pending = pending || api.centre().then((c) => (cached = { ...FALLBACK, ...c })).catch(() => FALLBACK);
    let live = true;
    pending.then((c) => live && setCentre(c));
    return () => {
      live = false;
    };
  }, []);
  return centre;
}

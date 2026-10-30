import { useEffect } from "react";

const DEFAULT_TITLE = "Paws & Hearts Adoption Centre";
const DEFAULT_DESCRIPTION =
  "Adopt a dog, cat, rabbit or bird. Browse animals waiting for a home, apply online and track your application.";

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** Sets the browser tab title and the description/preview tags for the current page.
 *  Chat apps don't run scripts, so shared pet links use the backend's /share/pets/:id page. */
export function useSeo({ title, description = DEFAULT_DESCRIPTION, image = "" } = {}) {
  useEffect(() => {
    const full = title ? `${title} | ${DEFAULT_TITLE}` : DEFAULT_TITLE;
    document.title = full;
    setMeta("name", "description", description);
    setMeta("property", "og:title", full);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", image);
  }, [title, description, image]);
}

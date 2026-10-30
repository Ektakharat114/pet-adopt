import { useFavorites } from "../favorites.js";

export default function FavoriteButton({ pet, className = "" }) {
  const { has, toggle } = useFavorites();
  const saved = has(pet.id);
  return (
    <button
      type="button"
      className={`fav-btn ${saved ? "saved" : ""} ${className}`}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${pet.name} from saved pets` : `Save ${pet.name}`}
      title={saved ? "Saved" : "Save for later"}
      onClick={() => toggle(pet.id)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2 0 3.3 1.1 4 2.2h4C14.7 6.1 16 5 18 5c3.3 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

import { Link } from "react-router-dom";
import { ENERGY_LABEL, formatAge, SPECIES_EMOJI } from "../api.js";
import FavoriteButton from "./FavoriteButton.jsx";

export function PetImage({ pet, src, large = false }) {
  const cls = `pet-img ${large ? "large" : ""} sp-${pet.species}`;
  const url = src ?? pet.image_url;
  return url ? (
    <img className={cls} src={url} alt={pet.name} loading="lazy" />
  ) : (
    <div className={cls} aria-label={pet.name}>
      <span>{SPECIES_EMOJI[pet.species] || SPECIES_EMOJI.other}</span>
    </div>
  );
}

export default function PetCard({ pet }) {
  return (
    <div className="pet-card-wrap">
      <Link to={`/pets/${pet.id}`} className="card pet-card">
        <PetImage pet={pet} />
        <div className="card-body">
          <div className="row-between">
            <h3>{pet.name}</h3>
            <span className={`badge ${pet.status}`}>{pet.status}</span>
          </div>
          <p className="muted">
            {pet.breed || pet.species} · {formatAge(pet.age_years)} · {pet.gender}
          </p>
          <p className="chips">
            <span className="chip">{ENERGY_LABEL[pet.energy_level] || ENERGY_LABEL.medium}</span>
            {pet.special_needs && <span className="chip">Special care</span>}
          </p>
        </div>
      </Link>
      <FavoriteButton pet={pet} className="on-card" />
    </div>
  );
}

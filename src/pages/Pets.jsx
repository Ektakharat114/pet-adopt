import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useSeo } from "../seo.js";
import PetCard from "../components/PetCard.jsx";

const DEFAULTS = { q: "", species: "", size: "", energy: "", status: "available", kids: false, dogs: false, cats: false };

export default function Pets() {
  useSeo({ title: "Adopt a pet", description: "Browse dogs, cats, rabbits and birds waiting for a loving home." });
  const [filters, setFilters] = useState(DEFAULTS);
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.pets(filters)
        .then((p) => { setPets(p); setError(""); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [filters]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const changed = JSON.stringify(filters) !== JSON.stringify(DEFAULTS);

  return (
    <div className="container section">
      <h1>Adopt a pet</h1>
      <div className="filters">
        <input id="f-q" className="grow" aria-label="Search by name or breed" placeholder="Search by name or breed…" value={filters.q} onChange={set("q")} />
        <select id="f-species" aria-label="Species" value={filters.species} onChange={set("species")}>
          <option value="">All species</option>
          <option value="dog">Dogs</option>
          <option value="cat">Cats</option>
          <option value="rabbit">Rabbits</option>
          <option value="bird">Birds</option>
          <option value="other">Other</option>
        </select>
        <select id="f-size" aria-label="Size" value={filters.size} onChange={set("size")}>
          <option value="">Any size</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
        <select id="f-energy" aria-label="Energy level" value={filters.energy} onChange={set("energy")}>
          <option value="">Any energy</option>
          <option value="low">Low energy</option>
          <option value="medium">Medium energy</option>
          <option value="high">High energy</option>
        </select>
        <select id="f-status" aria-label="Adoption status" value={filters.status} onChange={set("status")}>
          <option value="available">Available</option>
          <option value="pending">Adoption pending</option>
          <option value="adopted">Adopted</option>
          <option value="">All</option>
        </select>
      </div>
      <div className="filter-checks" role="group" aria-label="Gets along with">
        <span className="muted">Good with</span>
        <label className="check"><input id="f-kids" type="checkbox" checked={filters.kids} onChange={set("kids")} /> Kids</label>
        <label className="check"><input id="f-dogs" type="checkbox" checked={filters.dogs} onChange={set("dogs")} /> Dogs</label>
        <label className="check"><input id="f-cats" type="checkbox" checked={filters.cats} onChange={set("cats")} /> Cats</label>
        {changed && <button type="button" className="btn small" onClick={() => setFilters(DEFAULTS)}>Clear filters</button>}
      </div>

      {error && <p className="error">Could not load pets: {error}</p>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : pets.length === 0 ? (
        <p className="muted">No pets match your search. Try changing the filters.</p>
      ) : (
        <>
          <p className="muted result-count" aria-live="polite">{pets.length} {pets.length === 1 ? "pet" : "pets"}</p>
          <div className="grid">{pets.map((p) => <PetCard key={p.id} pet={p} />)}</div>
        </>
      )}
    </div>
  );
}

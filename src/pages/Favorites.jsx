import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useFavorites } from "../favorites.js";
import { useSeo } from "../seo.js";
import PetCard from "../components/PetCard.jsx";

export default function Favorites() {
  useSeo({ title: "Saved pets" });
  const { ids } = useFavorites();
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(ids.length > 0);
  const [error, setError] = useState("");
  const key = ids.join(",");

  useEffect(() => {
    if (!key) {
      setPets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.pets({ ids: key })
      .then((p) => { setPets(p); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [key]);

  return (
    <div className="container section">
      <h1>Saved pets</h1>
      <p className="muted">Pets you've saved on this device. Tap the heart again to remove one.</p>
      {error && <p className="error">Could not load saved pets: {error}</p>}
      {ids.length === 0 ? (
        <div className="empty">
          <p>You haven't saved any pets yet.</p>
          <p className="muted">Tap the heart on a pet to keep them here while you decide.</p>
          <Link to="/pets" className="btn btn-primary">Meet our pets</Link>
        </div>
      ) : loading && pets.length === 0 ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="grid">{pets.map((p) => <PetCard key={p.id} pet={p} />)}</div>
      )}
    </div>
  );
}

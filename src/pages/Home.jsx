import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useSeo } from "../seo.js";
import PetCard from "../components/PetCard.jsx";

/** Big photo in the hero. Put hero-dog.jpeg and hero-cat.jpeg in frontend/public. Falls back to the emoji if the photo is missing. */
function HeroPhoto({ src, emoji }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span>{emoji}</span> : <img className="hero-photo" src={src} alt="" onError={() => setFailed(true)} />;
}

export default function Home() {
  useSeo({});
  const [pets, setPets] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.pets({ status: "available" }).then((p) => setPets(p.slice(0, 4))).catch((e) => setError(e.message));
    api.stats().then(setStats).catch(() => {});
  }, []);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <h1>Find your new best friend</h1>
            <p>
              Hundreds of loving animals are waiting for a forever home. Browse our dogs and cats,
              and start your adoption journey today.
            </p>
            <div className="row-gap">
              <Link to="/pets" className="btn btn-primary">Meet our pets</Link>
              <Link to="/track" className="btn">Track my application</Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <HeroPhoto src="/hero-dog.jpeg" emoji="🐕" />
            <HeroPhoto src="/hero-cat.jpeg" emoji="🐈" />
          </div>
        </div>
      </section>

      {stats && (
        <section className="container stats">
          <div><strong>{stats.available}</strong><span>Looking for homes</span></div>
          <div><strong>{stats.adopted}</strong><span>Happy adoptions</span></div>
          <div><strong>{stats.total}</strong><span>Animals in our care</span></div>
        </section>
      )}

      <section className="container section">
        <div className="row-between">
          <h2>Latest arrivals</h2>
          <Link to="/pets">View all →</Link>
        </div>
        {error && <p className="error">Could not load pets: {error}</p>}
        <div className="grid">
          {pets.map((p) => <PetCard key={p.id} pet={p} />)}
        </div>
      </section>

      <section className="container section how">
        <h2>How adoption works</h2>
        <div className="grid three">
          <div className="card card-body"><h3>1. Browse</h3><p className="muted">Filter by species, size, energy and who they get along with. Tap the heart to save pets for later.</p></div>
          <div className="card card-body"><h3>2. Apply</h3><p className="muted">Fill in a short application on the pet's page. You'll get a tracking code straight away.</p></div>
          <div className="card card-body"><h3>3. Meet &amp; adopt</h3><p className="muted">Our team will contact you to arrange a meeting and finalize the adoption.</p></div>
        </div>
      </section>

      <section className="container section">
        <div className="card card-body cta-band">
          <div>
            <h2>Can't adopt right now?</h2>
            <p className="muted">You can still help. Donate to cover food and vet care, or give a few hours as a volunteer.</p>
          </div>
          <Link to="/support" className="btn btn-primary">Get involved</Link>
        </div>
      </section>
    </>
  );
}

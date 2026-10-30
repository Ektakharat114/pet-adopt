import { Link, NavLink, Route, Routes } from "react-router-dom";
import { useCentre } from "./centre.js";
import { useFavorites } from "./favorites.js";
import { useSeo } from "./seo.js";
import Home from "./pages/Home.jsx";
import Pets from "./pages/Pets.jsx";
import PetDetail from "./pages/PetDetail.jsx";
import Favorites from "./pages/Favorites.jsx";
import Track from "./pages/Track.jsx";
import Support from "./pages/Support.jsx";
import Admin from "./pages/Admin.jsx";

function NotFound() {
  useSeo({ title: "Page not found" });
  return (
    <div className="container section">
      <h2>Page not found</h2>
      <p className="muted">That page doesn't exist. <Link to="/pets">Meet our pets</Link> instead.</p>
    </div>
  );
}

export default function App() {
  const centre = useCentre();
  const { ids } = useFavorites();
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link to="/" className="brand">🐾 Paws &amp; Hearts</Link>
          <nav aria-label="Main">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/pets">Adopt</NavLink>
            <NavLink to="/favorites">Saved{ids.length > 0 && <span className="count">{ids.length}</span>}</NavLink>
            <NavLink to="/track">Track</NavLink>
            <NavLink to="/support">Get involved</NavLink>
            <NavLink to="/admin">Staff</NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pets" element={<Pets />} />
          <Route path="/pets/:id" element={<PetDetail />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/track" element={<Track />} />
          <Route path="/support" element={<Support />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">
          <p>© {new Date().getFullYear()} {centre.name} · Every pet deserves a loving home</p>
          {(centre.phone || centre.email || centre.address) && (
            <p className="footer-contact">
              {[centre.address, centre.phone, centre.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </footer>
    </>
  );
}

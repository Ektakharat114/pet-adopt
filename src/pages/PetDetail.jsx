import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ENERGY_LABEL, formatAge, shareUrl } from "../api.js";
import { useSeo } from "../seo.js";
import Gallery from "../components/Gallery.jsx";
import FavoriteButton from "../components/FavoriteButton.jsx";

const EMPTY = { applicant_name: "", email: "", phone: "", address: "", has_other_pets: false, message: "", website: "" };
const yesNo = (v) => (v ? "Yes" : "No");

function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* clipboard blocked: the text is still on screen to select */
    }
  };
  return <button type="button" className="btn small" onClick={copy}>{done ? "Copied" : label}</button>;
}

export default function PetDetail() {
  const { id } = useParams();
  const [pet, setPet] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [formError, setFormError] = useState("");
  const [shareMsg, setShareMsg] = useState("");
  const openedAt = useRef(Date.now());

  useSeo({
    title: pet ? `${pet.name}, ${pet.breed || pet.species}` : "Pet",
    description: pet ? (pet.description || `${pet.name} is waiting for a loving home.`).slice(0, 160) : undefined,
    image: pet?.image_url || "",
  });

  useEffect(() => {
    setPet(null);
    setError("");
    setResult(null);
    setShareMsg("");
    api.pet(id).then(setPet).catch((e) => setError(e.status === 404 ? "We couldn't find that pet." : e.message));
  }, [id]);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    try {
      const res = await api.apply({ ...form, pet_id: pet.id, fill_time_ms: Date.now() - openedAt.current });
      setResult({ ...res, email: form.email.trim() });
      setForm(EMPTY);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const share = async () => {
    if (typeof __PREVIEW__ !== "undefined" && __PREVIEW__) {
      setShareMsg("Sharing is switched off in this preview. On the live site it makes a link that shows the photo and description in WhatsApp.");
      return;
    }
    const url = shareUrl(pet.id);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Meet ${pet.name}`, text: `${pet.name} is looking for a home.`, url });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied. Paste it into WhatsApp, Facebook or a message.");
    } catch {
      setShareMsg(url);
    }
  };

  if (error) return <div className="container section"><p className="error">{error}</p><Link to="/pets">← Back to pets</Link></div>;
  if (!pet) return <div className="container section"><p className="muted">Loading…</p></div>;

  const canApply = pet.status !== "adopted";

  return (
    <div className="container section">
      <Link to="/pets">← Back to pets</Link>
      <div className="detail">
        <Gallery pet={pet} />
        <div>
          <div className="row-between">
            <h1>{pet.name}</h1>
            <span className={`badge ${pet.status}`}>{pet.status}</span>
          </div>
          <p className="muted">{pet.breed || pet.species}</p>
          <div className="row-gap">
            <FavoriteButton pet={pet} className="inline" />
            <button type="button" className="btn small" onClick={share}>Share {pet.name}</button>
          </div>
          {shareMsg && <p className="muted small-text share-msg">{shareMsg}</p>}
          <ul className="facts">
            <li><b>Age</b> {formatAge(pet.age_years)}</li>
            <li><b>Gender</b> {pet.gender}</li>
            <li><b>Size</b> {pet.size}</li>
            <li><b>Energy</b> {ENERGY_LABEL[pet.energy_level] || ENERGY_LABEL.medium}</li>
            <li><b>Good with kids</b> {yesNo(pet.good_with_kids)}</li>
            <li><b>Good with dogs</b> {yesNo(pet.good_with_dogs)}</li>
            <li><b>Good with cats</b> {yesNo(pet.good_with_cats)}</li>
            <li><b>Vaccinated</b> {yesNo(pet.vaccinated)}</li>
          </ul>
          <p>{pet.description}</p>
          {pet.special_needs && (
            <div className="callout">
              <strong>Special care</strong>
              <p>{pet.special_needs}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card card-body form-card">
        <h2>Adopt {pet.name}</h2>
        {!canApply ? (
          <p className="muted">{pet.name} has already found a home. <Link to="/pets">Browse our other pets</Link>.</p>
        ) : result ? (
          <div className="success-box" role="status">
            <h3>Application received</h3>
            <p className="muted">Your tracking code</p>
            <div className="code-row">
              <code className="track-code">{result.tracking_code}</code>
              <CopyButton text={result.tracking_code} />
            </div>
            <p>
              {result.email_enabled
                ? `We've emailed this code to ${result.email}. `
                : "Save this code. You'll need it with your email address to check your status. "}
              <Link to={`/track?code=${result.tracking_code}`}>Check status</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            {pet.status === "pending" && (
              <p className="muted small-text">Another application for {pet.name} is being reviewed. You can still apply.</p>
            )}
            <div className="form-grid">
              <label>Full name
                <input id="apply-name" required minLength={2} autoComplete="name" value={form.applicant_name} onChange={set("applicant_name")} />
              </label>
              <label>Email
                <input id="apply-email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
              </label>
              <label>Phone
                <input id="apply-phone" required minLength={7} autoComplete="tel" value={form.phone} onChange={set("phone")} />
              </label>
              <label>Address
                <input id="apply-address" autoComplete="street-address" value={form.address} onChange={set("address")} />
              </label>
            </div>
            <label className="check">
              <input id="apply-others" type="checkbox" checked={form.has_other_pets} onChange={set("has_other_pets")} />
              I have other pets at home
            </label>
            <label>Why would you like to adopt {pet.name}?
              <textarea id="apply-message" rows={4} value={form.message} onChange={set("message")} />
            </label>
            {/* Honeypot: people never see or fill this in, spam bots often do. */}
            <div className="hp" aria-hidden="true">
              <label>Website
                <input id="apply-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
              </label>
            </div>
            {formError && <p className="error" role="alert">{formError}</p>}
            <button className="btn btn-primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

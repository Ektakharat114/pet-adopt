import { useCallback, useEffect, useState } from "react";
import { api, formatAge, formatDate, getToken, setToken, SPECIES_EMOJI } from "../api.js";
import { useSeo } from "../seo.js";
import MonthlyChart from "../components/MonthlyChart.jsx";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_MB = 5;
const MAX_PHOTOS = 10;

const BLANK = {
  name: "", species: "dog", breed: "", age_years: 1, gender: "unknown", size: "medium", energy_level: "medium",
  description: "", special_needs: "", good_with_kids: true, good_with_dogs: true, good_with_cats: true,
  vaccinated: true, status: "available",
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { token } = await api.login(password);
      setToken(token);
      onLogin();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="container section narrow">
      <div className="card card-body">
        <h2>Staff login</h2>
        <form onSubmit={submit}>
          <label>Password
            <input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary">Log in</button>
        </form>
      </div>
    </div>
  );
}

function PhotoManager({ photos, setPhotos, species }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

  const addFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // lets staff pick the same file again after an error
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return setError(`A pet can have up to ${MAX_PHOTOS} photos.`);
    const problems = [];
    if (files.length > room) problems.push(`Only ${plural(room, "more photo", "more photos")} fit.`);
    setUploading(true);
    const added = [];
    for (const file of files.slice(0, room)) {
      if (!PHOTO_TYPES.includes(file.type)) { problems.push(`${file.name}: choose a JPG, PNG or WebP image.`); continue; }
      if (file.size > PHOTO_MAX_MB * 1024 * 1024) { problems.push(`${file.name}: must be under ${PHOTO_MAX_MB} MB.`); continue; }
      try {
        const { url } = await api.uploadPhoto(file);
        added.push(url);
      } catch (err) {
        problems.push(`${file.name}: ${err.status === 401 ? "your staff session expired. Log out and log in again." : err.message}`);
        if (err.status === 401 || err.status === 503) break; // the rest would fail the same way
      }
    }
    setUploading(false);
    if (added.length) setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    setError(problems.join(" "));
  };

  const addLink = () => {
    const url = link.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) return setError("Photo links must start with http:// or https://");
    if (photos.includes(url)) return setError("That photo is already added.");
    if (photos.length >= MAX_PHOTOS) return setError(`A pet can have up to ${MAX_PHOTOS} photos.`);
    setPhotos((prev) => [...prev, url]);
    setLink("");
    setError("");
  };

  const makeCover = (i) => setPhotos((prev) => [prev[i], ...prev.filter((_, j) => j !== i)]);
  const remove = (i) => setPhotos((prev) => prev.filter((_, j) => j !== i));

  return (
    <div className="photo-field">
      <span className="field-label">Photos ({photos.length}/{MAX_PHOTOS})</span>
      {photos.length > 0 ? (
        <ul className="photo-list">
          {photos.map((url, i) => (
            <li key={url} className="photo-item">
              <img className="photo-thumb" src={url} alt={i === 0 ? "Cover photo" : `Photo ${i + 1}`} />
              {i === 0 && <span className="cover-tag">Cover</span>}
              <div className="photo-item-actions">
                {i > 0 && <button type="button" className="btn small" onClick={() => makeCover(i)}>Make cover</button>}
                <button type="button" className="btn small danger" onClick={() => remove(i)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="photo-empty"><span aria-hidden="true">{SPECIES_EMOJI[species] || SPECIES_EMOJI.other}</span> No photos yet. The species picture shows until you add one.</div>
      )}
      <div className="photo-actions">
        <label className={`btn upload-btn ${uploading || photos.length >= MAX_PHOTOS ? "busy" : ""}`}>
          {uploading ? "Uploading…" : "Add photos"}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={addFiles} disabled={uploading || photos.length >= MAX_PHOTOS} hidden />
        </label>
        <span className="muted small-text">JPG, PNG or WebP, up to {PHOTO_MAX_MB} MB each. The first photo is the cover.</span>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="url-fallback">
        <label>Or add a photo by link
          <span className="inline-field">
            <input id="photo-link" value={link} placeholder="https://…" onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
            <button type="button" className="btn" onClick={addLink}>Add</button>
          </span>
        </label>
      </div>
    </div>
  );
}

function PetForm({ pet, onSave, onCancel }) {
  const [form, setForm] = useState(pet ? { ...BLANK, ...pet } : BLANK);
  // Age is typed as a number plus a unit. It is stored in years (3 months = 0.25).
  const startYears = Number(pet ? pet.age_years : BLANK.age_years) || 0;
  const [ageUnit, setAgeUnit] = useState(startYears < 1 ? "months" : "years");
  const [ageValue, setAgeValue] = useState(String(startYears < 1 ? Math.round(startYears * 12) : startYears));
  const [photos, setPhotos] = useState(pet ? (pet.photos?.length ? pet.photos : pet.image_url ? [pet.image_url] : []) : []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => {
    const t = e.target;
    setForm((f) => ({ ...f, [k]: t.type === "checkbox" ? t.checked : t.type === "number" ? Number(t.value) : t.value }));
  };
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = {
      name: form.name, species: form.species, breed: form.breed, age_years: ageUnit === "months" ? Number(ageValue) / 12 : Number(ageValue), gender: form.gender,
      size: form.size, energy_level: form.energy_level, description: form.description, special_needs: form.special_needs,
      good_with_kids: form.good_with_kids, good_with_dogs: form.good_with_dogs, good_with_cats: form.good_with_cats,
      vaccinated: form.vaccinated, status: form.status, image_url: photos[0] || "", photos,
    };
    try {
      await (pet ? api.updatePet(pet.id, data) : api.createPet(data));
      onSave();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  const opts = (list) => list.map((s) => <option key={s}>{s}</option>);

  return (
    <form className="card card-body" onSubmit={submit}>
      <h3>{pet ? `Edit ${pet.name}` : "Add a pet"}</h3>
      <div className="form-grid">
        <label>Name<input id="pet-name" required value={form.name} onChange={set("name")} /></label>
        <label>Species<select id="pet-species" value={form.species} onChange={set("species")}>{opts(["dog", "cat", "rabbit", "bird", "other"])}</select></label>
        <label>Breed<input id="pet-breed" value={form.breed} onChange={set("breed")} /></label>
        <label>Age
          <span className="row-gap">
            <input id="pet-age" type="number" step={ageUnit === "months" ? "1" : "0.5"} min="0" value={ageValue} onChange={(e) => setAgeValue(e.target.value)} />
            <select id="pet-age-unit" aria-label="Age unit" value={ageUnit} onChange={(e) => setAgeUnit(e.target.value)}>
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </span>
        </label>
        <label>Gender<select id="pet-gender" value={form.gender} onChange={set("gender")}>{opts(["male", "female", "unknown"])}</select></label>
        <label>Size<select id="pet-size" value={form.size} onChange={set("size")}>{opts(["small", "medium", "large"])}</select></label>
        <label>Energy level<select id="pet-energy" value={form.energy_level} onChange={set("energy_level")}>{opts(["low", "medium", "high"])}</select></label>
        <label>Status<select id="pet-status" value={form.status} onChange={set("status")}>{opts(["available", "pending", "adopted"])}</select></label>
      </div>
      <PhotoManager photos={photos} setPhotos={setPhotos} species={form.species} />
      <label>Description<textarea id="pet-description" rows={3} value={form.description} onChange={set("description")} /></label>
      <label>Special care (optional)
        <input id="pet-special" maxLength={300} placeholder="Medication, diet, anything adopters should know" value={form.special_needs} onChange={set("special_needs")} />
      </label>
      <div className="row-gap">
        <label className="check"><input type="checkbox" checked={form.good_with_kids} onChange={set("good_with_kids")} /> Good with kids</label>
        <label className="check"><input type="checkbox" checked={form.good_with_dogs} onChange={set("good_with_dogs")} /> Good with dogs</label>
        <label className="check"><input type="checkbox" checked={form.good_with_cats} onChange={set("good_with_cats")} /> Good with cats</label>
        <label className="check"><input type="checkbox" checked={form.vaccinated} onChange={set("vaccinated")} /> Vaccinated</label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-gap">
        <button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Overview({ data, onReviewApplications, onOpenVolunteers }) {
  if (!data) return <p className="muted">Loading…</p>;
  const { pets, applications, adoptions_this_month: adoptions, avg_days_to_adopt: avgDays, by_species: species } = data;
  const speciesList = Object.entries(species).sort((a, b) => b[1] - a[1]);
  return (
    <div className="overview">
      <div className="tiles">
        <button type="button" className={`tile tile-action ${applications.pending ? "attention" : ""}`} onClick={onReviewApplications}>
          <span className="tile-label">Applications to review</span>
          <strong>{applications.pending}</strong>
          <span className="tile-note">{applications.this_month} new this month</span>
        </button>
        <div className="tile">
          <span className="tile-label">Adopted this month</span>
          <strong>{adoptions}</strong>
          <span className="tile-note">{pets.adopted} in total</span>
        </div>
        <div className="tile">
          <span className="tile-label">Average days to adopt</span>
          <strong>{avgDays === null ? "–" : avgDays < 1 ? "<1" : avgDays}</strong>
          <span className="tile-note">{avgDays === null ? "No adoptions yet" : "From arrival to adoption"}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Waiting for a home</span>
          <strong>{pets.available}</strong>
          <span className="tile-note">{pets.pending} with adoption pending</span>
        </div>
        <button type="button" className={`tile tile-action ${data.new_volunteers ? "attention" : ""}`} onClick={onOpenVolunteers}>
          <span className="tile-label">New volunteers</span>
          <strong>{data.new_volunteers}</strong>
          <span className="tile-note">Not yet contacted</span>
        </button>
      </div>

      <div className="overview-grid">
        <div className="card card-body"><MonthlyChart data={data.monthly_adoptions} /></div>
        <div className="card card-body">
          <h3>Waiting the longest</h3>
          {data.longest_waiting.length === 0 ? (
            <p className="muted">No pets are waiting right now.</p>
          ) : (
            <ul className="plain-list">
              {data.longest_waiting.map((p) => (
                <li key={p.id}><span>{SPECIES_EMOJI[p.species] || SPECIES_EMOJI.other} {p.name}</span><span className="muted">{plural(p.days, "day", "days")}</span></li>
              ))}
            </ul>
          )}
          <h3 className="subhead">Waiting, by species</h3>
          {speciesList.length === 0 ? (
            <p className="muted">Nothing to show yet.</p>
          ) : (
            <p className="chips">
              {speciesList.map(([s, n]) => <span key={s} className="chip">{s} {n}</span>)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  useSeo({ title: "Staff" });
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState("overview");
  const [pets, setPets] = useState([]);
  const [apps, setApps] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [dash, setDash] = useState(null);
  const [appFilter, setAppFilter] = useState("all");
  const [editing, setEditing] = useState(null); // null | "new" | pet
  const [error, setError] = useState("");

  // Staff pages should stay out of search results.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const logout = useCallback(() => { setToken(""); setAuthed(false); }, []);

  const load = useCallback(async () => {
    try {
      const [p, a, v, d] = await Promise.all([api.pets(), api.applications(), api.volunteers(), api.dashboard()]);
      setPets(p);
      setApps(a);
      setVolunteers(v);
      setDash(d);
      setError("");
    } catch (e) {
      if (e.status === 401) logout();
      else setError(e.message);
    }
  }, [logout]);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const remove = async (pet) => {
    if (!confirm(`Delete ${pet.name} and their applications?`)) return;
    try { await api.deletePet(pet.id); load(); } catch (e) { setError(e.message); }
  };
  const setStatus = async (a, status) => {
    try { await api.setApplicationStatus(a.id, status); load(); } catch (e) { setError(e.message); }
  };
  const setVolStatus = async (v, status) => {
    try { await api.setVolunteerStatus(v.id, status); load(); } catch (e) { setError(e.message); }
  };

  const pending = apps.filter((a) => a.status === "pending").length;
  const newVols = volunteers.filter((v) => v.status === "new").length;
  const shownApps = appFilter === "all" ? apps : apps.filter((a) => a.status === appFilter);
  const go = (t) => () => { setTab(t); setEditing(null); };

  return (
    <div className="container section">
      <div className="row-between">
        <h1>Staff dashboard</h1>
        <button className="btn" onClick={logout}>Log out</button>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "overview"} className={tab === "overview" ? "active" : ""} onClick={go("overview")}>Overview</button>
        <button role="tab" aria-selected={tab === "pets"} className={tab === "pets" ? "active" : ""} onClick={go("pets")}>Pets</button>
        <button role="tab" aria-selected={tab === "apps"} className={tab === "apps" ? "active" : ""} onClick={go("apps")}>Applications{pending > 0 && <><span className="tab-count">{pending}</span><span className="sr-only"> pending</span></>}</button>
        <button role="tab" aria-selected={tab === "vols"} className={tab === "vols" ? "active" : ""} onClick={go("vols")}>Volunteers{newVols > 0 && <><span className="tab-count">{newVols}</span><span className="sr-only"> new</span></>}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {tab === "overview" && (
        <Overview
          data={dash}
          onReviewApplications={() => { setAppFilter("pending"); setTab("apps"); }}
          onOpenVolunteers={go("vols")}
        />
      )}

      {tab === "pets" && (
        editing ? (
          <PetForm
            pet={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSave={() => { setEditing(null); load(); }}
          />
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => setEditing("new")}>+ Add pet</button>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Species</th><th>Breed</th><th>Age</th><th>Photos</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {pets.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td><td>{p.species}</td><td>{p.breed}</td><td>{formatAge(p.age_years)}</td>
                      <td>{p.photos?.length || (p.image_url ? 1 : 0)}</td>
                      <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                      <td className="actions">
                        <button className="btn small" onClick={() => setEditing(p)}>Edit</button>
                        <button className="btn small danger" onClick={() => remove(p)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      {tab === "apps" && (
        <>
          <div className="row-gap">
            <label className="inline-label">Show
              <select id="app-filter" value={appFilter} onChange={(e) => setAppFilter(e.target.value)}>
                <option value="all">All applications</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
          <div className="table-wrap">
            {shownApps.length === 0 ? <p className="muted pad">No applications to show.</p> : (
              <table>
                <thead><tr><th>Pet</th><th>Applicant</th><th>Contact</th><th>Message</th><th>Code</th><th>Applied</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {shownApps.map((a) => (
                    <tr key={a.id}>
                      <td>{a.pet_name}</td>
                      <td>{a.applicant_name}{a.has_other_pets && <div className="muted small-text">Has other pets</div>}</td>
                      <td>{a.email}<div className="muted small-text">{a.phone}</div></td>
                      <td className="msg">{a.message || "—"}</td>
                      <td><code>{a.tracking_code}</code></td>
                      <td className="nowrap">{formatDate(a.created_at)}</td>
                      <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                      <td className="actions">
                        {a.status !== "approved" && <button className="btn small" onClick={() => setStatus(a, "approved")}>Approve</button>}
                        {a.status !== "rejected" && <button className="btn small danger" onClick={() => setStatus(a, "rejected")}>Reject</button>}
                        {a.status !== "pending" && <button className="btn small" onClick={() => setStatus(a, "pending")}>Undo</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "vols" && (
        <div className="table-wrap">
          {volunteers.length === 0 ? <p className="muted pad">No volunteer sign-ups yet.</p> : (
            <table>
              <thead><tr><th>Name</th><th>Contact</th><th>Interests</th><th>Free</th><th>Message</th><th>Signed up</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {volunteers.map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td>{v.email}<div className="muted small-text">{v.phone}</div></td>
                    <td className="msg">{v.interests.length ? v.interests.join(", ") : "—"}</td>
                    <td>{v.availability || "—"}</td>
                    <td className="msg">{v.message || "—"}</td>
                    <td className="nowrap">{formatDate(v.created_at)}</td>
                    <td><span className={`badge ${v.status === "new" ? "pending" : "approved"}`}>{v.status}</span></td>
                    <td className="actions">
                      {v.status === "new"
                        ? <button className="btn small" onClick={() => setVolStatus(v, "contacted")}>Mark contacted</button>
                        : <button className="btn small" onClick={() => setVolStatus(v, "new")}>Mark new</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

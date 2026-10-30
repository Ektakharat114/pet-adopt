import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatDate } from "../api.js";
import { useSeo } from "../seo.js";
import { PetImage } from "../components/PetCard.jsx";

const MESSAGES = {
  pending: "We're reviewing your application. A member of our team will contact you by phone or email.",
  approved: "Good news, your application was approved. Our team will contact you to arrange a meeting and the adoption paperwork.",
  rejected: "We weren't able to move forward with this application. Thank you for applying. Many other animals are still waiting for a home.",
};

export default function Track() {
  useSeo({ title: "Track your application", description: "Check the status of your adoption application with your tracking code." });
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") || "");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await api.track(code.trim(), email.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container section narrow-wide">
      <h1>Track your application</h1>
      <p className="muted">Enter the tracking code you received when you applied, with the email address you used.</p>
      <form className="card card-body" onSubmit={submit}>
        <label>Tracking code
          <input id="track-code" required placeholder="PH-ABC234" autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label>Email address
          <input id="track-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div><button className="btn btn-primary" disabled={loading}>{loading ? "Checking…" : "Check status"}</button></div>
      </form>

      {result && (
        <div className="card track-result" role="status">
          <PetImage pet={{ name: result.pet_name, species: result.pet_species }} src={result.pet_image} />
          <div className="card-body">
            <div className="row-between">
              <h2>{result.pet_name}</h2>
              <span className={`badge ${result.status}`}>{result.status}</span>
            </div>
            <p>{MESSAGES[result.status]}</p>
            <ul className="facts">
              <li><b>Code</b> {result.tracking_code}</li>
              <li><b>Submitted</b> {formatDate(result.submitted_at)}</li>
              {result.decided_at && <li><b>Decision</b> {formatDate(result.decided_at)}</li>}
            </ul>
            {result.status === "rejected" ? (
              <Link to="/pets" className="btn">Meet other pets</Link>
            ) : (
              <Link to={`/pets/${result.pet_id}`}>View {result.pet_name}'s page</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

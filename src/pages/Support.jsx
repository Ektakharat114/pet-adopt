import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useCentre } from "../centre.js";
import { useSeo } from "../seo.js";

const INTERESTS = ["Dog walking", "Cat socialising", "Feeding and cleaning", "Events and fundraising", "Photography", "Vet transport"];
const AVAILABILITY = ["Weekdays", "Weekends", "Evenings", "Flexible"];
const EMPTY = { name: "", email: "", phone: "", interests: [], availability: "", message: "", website: "" };

function CopyField({ label, value }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* the value is on screen to select */
    }
  };
  return (
    <div className="copy-field">
      <span className="muted small-text">{label}</span>
      <div className="code-row">
        <code className="track-code">{value}</code>
        <button type="button" className="btn small" onClick={copy}>{done ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}

function VolunteerForm() {
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (name) =>
    setForm((f) => ({ ...f, interests: f.interests.includes(name) ? f.interests.filter((i) => i !== name) : [...f.interests, name] }));

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await api.volunteer(form);
      setDone(res.message);
      setForm(EMPTY);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (done) return <p className="success" role="status">{done}</p>;

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>Full name
          <input id="vol-name" required minLength={2} autoComplete="name" value={form.name} onChange={set("name")} />
        </label>
        <label>Email
          <input id="vol-email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
        </label>
        <label>Phone
          <input id="vol-phone" required minLength={7} autoComplete="tel" value={form.phone} onChange={set("phone")} />
        </label>
        <label>When are you free?
          <select id="vol-availability" value={form.availability} onChange={set("availability")}>
            <option value="">Choose one</option>
            {AVAILABILITY.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="interests">
        <legend>What would you like to help with?</legend>
        {INTERESTS.map((i) => (
          <label key={i} className="check">
            <input type="checkbox" checked={form.interests.includes(i)} onChange={() => toggle(i)} /> {i}
          </label>
        ))}
      </fieldset>
      <label>Anything else we should know?
        <textarea id="vol-message" rows={3} value={form.message} onChange={set("message")} />
      </label>
      <div className="hp" aria-hidden="true">
        <label>Website
          <input id="vol-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={sending}>{sending ? "Sending…" : "Sign up to volunteer"}</button>
    </form>
  );
}

export default function Support() {
  useSeo({ title: "Get involved", description: "Donate or volunteer to help animals waiting for a home." });
  const centre = useCentre();
  const [donationAmount, setDonationAmount] = useState(250);
  const hasDonation = centre.upi_id || centre.bank_details;
  const contact = [centre.phone, centre.email].filter(Boolean);

  return (
    <div className="container section">
      <h1>Get involved</h1>
      <p className="muted lead">Every rupee and every hour goes toward food, vet care and a safe place to stay for the animals in our care.</p>

      <div className="two-col">
        <section className="card card-body" aria-labelledby="donate-h">
          <h2 id="donate-h">Donate</h2>
          {hasDonation ? (
            <>
              <p>Your gift helps cover food, vaccinations and treatment.</p>
              {centre.upi_id && <CopyField label="UPI ID" value={centre.upi_id} />}
              <div className="donation-options">
  <p>Choose your donation amount:</p>
  {[100, 250, 500, 1000].map((value) => (
    <button
      type="button"
      key={value}
      className={donationAmount === value ? "btn btn-primary" : "btn"}
      onClick={() => setDonationAmount(value)}
    >
      ₹{value}
    </button>
  ))}
  <div style={{ marginTop: "12px" }}>
    <label>
      Or enter your own amount (₹100 or more):
      <input
        type="number"
        min="100"
        placeholder="Enter amount"
        value={donationAmount || ""}
        onChange={(e) => setDonationAmount(Number(e.target.value))}
        style={{ display: "block", marginTop: "6px", padding: "8px", width: "200px" }}
        />
    </label>
    {donationAmount < 100 && (
      <p style={{ color: "red" }}>Minimum donation is ₹100.</p>
    )}
  </div>
  {centre.upi_id && donationAmount >= 100 && (
  <a
    href={`upi://pay?pa=${centre.upi_id}&pn=Paws%20and%20Hearts&am=${donationAmount}&cu=INR`}
    className="btn btn-primary"
    style={{ display: "inline-block", marginTop: "12px" }}
  >
    Pay ₹{donationAmount} now
  </a>
)}

  <p><strong>Selected amount: ₹{donationAmount}</strong></p>
</div>
              {centre.bank_details && (
                <div className="copy-field">
                  <span className="muted small-text">Bank transfer</span>
                  <pre className="bank">{centre.bank_details}</pre>
                </div>
              )}
              <p className="muted small-text">Please keep your payment receipt. Contact us if you'd like an acknowledgement.</p>
            </>
          ) : (
            <p className="muted">Donation details haven't been added yet. Please contact us and we'll tell you how to give.</p>
          )}
          {contact.length > 0 && <p className="small-text">Questions? {contact.join(" · ")}</p>}
        </section>

        <section className="card card-body" aria-labelledby="vol-h">
          <h2 id="vol-h">Volunteer</h2>
          <p className="muted">Tell us how you'd like to help and when you're free. We'll be in touch.</p>
          <VolunteerForm />
        </section>
      </div>

      <p className="muted">Ready to adopt instead? <Link to="/pets">Meet our pets</Link>.</p>
    </div>
  );
}

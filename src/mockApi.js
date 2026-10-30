// In-browser stand-in for the FastAPI backend. Used only by the preview build.
// It mirrors the real endpoints, validation rules, spam checks and status changes in backend/main.py.
const DAY = 86400000;
const TOKEN = "preview-token";
const PASSWORD = "admin123";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTOS = 10;
const MIN_FILL_MS = 3000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Placeholder details so the Get involved page shows how it looks. The real site reads these from settings.
const CENTRE = {
  name: "Paws & Hearts Adoption Centre",
  email: "hello@example.org",
  phone: "+91 00000 00000",
  address: "",
  upi_id: "example@upi",
  bank_details: "Account name: Your Centre Name\nA/C: 0000 0000 0000\nIFSC: XXXX0000000",
};

// `days` = how long ago the pet arrived; `adoptedDays` = how long ago they were adopted.
const SEED = [
  { name: "Buddy", species: "dog", breed: "Labrador Retriever", age_years: 3, gender: "male", size: "large", energy_level: "high", days: 48,
    description: "Buddy is a friendly, energetic lab who loves fetch and long walks. Great with kids." },
  { name: "Luna", species: "cat", breed: "Siamese", age_years: 2, gender: "female", size: "small", energy_level: "low", days: 14,
    description: "Luna is a calm, affectionate lap cat who enjoys window-watching and gentle play." },
  { name: "Max", species: "dog", breed: "German Shepherd", age_years: 5, gender: "male", size: "large", energy_level: "high", days: 33,
    good_with_kids: false, good_with_dogs: false, good_with_cats: false,
    description: "Loyal and intelligent. Max needs an active home with a fenced yard." },
  { name: "Bella", species: "dog", breed: "Indie", age_years: 1, gender: "female", size: "medium", energy_level: "high", days: 21,
    description: "A playful rescue pup who is already house-trained and learning basic commands." },
  { name: "Whiskers", species: "cat", breed: "Tabby", age_years: 4, gender: "male", size: "small", energy_level: "low", days: 11,
    special_needs: "Takes a small thyroid tablet each day, easy to hide in food.",
    description: "Whiskers is a mellow guy who loves naps in sunny spots and chin scratches." },
  { name: "Thumper", species: "rabbit", breed: "Holland Lop", age_years: 1, gender: "male", size: "small", energy_level: "medium", days: 6,
    good_with_dogs: false, good_with_cats: false, description: "Gentle and curious bunny who enjoys fresh greens and exploring." },
  { name: "Kiwi", species: "bird", breed: "Budgerigar", age_years: 2, gender: "female", size: "small", energy_level: "medium", days: 3,
    good_with_dogs: false, good_with_cats: false, description: "A cheerful budgie who loves to chirp and is learning to whistle tunes." },
  { name: "Coco", species: "dog", breed: "Beagle", age_years: 2, gender: "female", size: "medium", energy_level: "medium", days: 18, status: "pending",
    description: "Sweet-natured beagle with a great nose and an even better personality." },
  // A few earlier adoptions so the staff chart and averages have something to show.
  { name: "Rani", species: "dog", breed: "Indie", age_years: 2, gender: "female", size: "medium", energy_level: "medium", days: 75, adoptedDays: 40, status: "adopted",
    description: "Rani found her family after a long wait." },
  { name: "Simba", species: "cat", breed: "Orange Tabby", age_years: 1, gender: "male", size: "small", energy_level: "medium", days: 31, adoptedDays: 9, status: "adopted",
    description: "Simba went home with a family who adore him." },
  { name: "Pepper", species: "dog", breed: "Spitz", age_years: 3, gender: "female", size: "small", energy_level: "high", days: 20, adoptedDays: 3, status: "adopted",
    description: "Pepper is settling into her new home." },
];

const randomCode = () => "PH-" + Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

export function installMockApi(root = globalThis) {
  let pets = SEED.map(({ days, adoptedDays, ...p }, i) => ({
    id: i + 1, breed: "", age_years: 1, gender: "unknown", size: "medium", energy_level: "medium", description: "",
    special_needs: "", image_url: "", photos: [], good_with_kids: true, good_with_dogs: true, good_with_cats: true,
    vaccinated: true, status: "available", adopted_at: adoptedDays ? iso(adoptedDays) : null, created_at: iso(days), ...p,
  }));
  let apps = [
    { id: 1, pet_id: 1, applicant_name: "Priya Nair", email: "priya@example.com", phone: "9800000001", address: "Pune",
      has_other_pets: false, message: "We have a garden and love long walks.", status: "pending", tracking_code: "PH-K7M2XQ", decided_at: null, created_at: iso(2) },
    { id: 2, pet_id: 4, applicant_name: "Karan Mehta", email: "karan@example.com", phone: "9800000002", address: "Mumbai",
      has_other_pets: true, message: "Bella would get along with our cat.", status: "pending", tracking_code: "PH-R4T9WZ", decided_at: null, created_at: iso(1) },
  ];
  let volunteers = [
    { id: 1, name: "Ananya Rao", email: "ananya@example.com", phone: "9800000003", interests: ["Dog walking", "Events and fundraising"],
      availability: "Weekends", message: "Happy to help on Saturdays.", status: "new", created_at: iso(1) },
  ];
  let nextPet = pets.length + 1;
  let nextApp = apps.length + 1;
  let nextVol = volunteers.length + 1;

  const json = (data, status = 200) =>
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const fail = (status, detail) => json({ detail }, status);
  const invalid = (...msgs) => json({ detail: msgs.map((msg) => ({ msg })) }, 422);

  const isWebLink = (u) => /^https?:\/\//i.test(u) && u.length <= 1000;
  // The real backend only accepts web links. The preview also takes the in-page images that its upload creates.
  const okPhoto = (u) => isWebLink(u) || /^data:image\//.test(u);

  function setStatus(pet, status) {
    if (status === "adopted" && pet.status !== "adopted") pet.adopted_at = new Date().toISOString();
    else if (status !== "adopted") pet.adopted_at = null;
    pet.status = status;
  }

  function petFields(b) {
    const problems = [];
    if (!b.name || b.name.length > 80) problems.push("String should have at least 1 character");
    if (!["dog", "cat", "rabbit", "bird", "other"].includes(b.species)) problems.push("Input should be 'dog', 'cat', 'rabbit', 'bird' or 'other'");
    if (b.energy_level && !["low", "medium", "high"].includes(b.energy_level)) problems.push("Input should be 'low', 'medium' or 'high'");
    if (b.age_years !== undefined && (b.age_years < 0 || b.age_years > 40)) problems.push("Input should be between 0 and 40");
    const cover = (b.image_url || "").trim();
    let photos = (b.photos || []).map((u) => u.trim()).filter(Boolean);
    if ((cover && !okPhoto(cover)) || photos.some((u) => !okPhoto(u))) problems.push("Photo links must start with http:// or https://");
    if (photos.length > MAX_PHOTOS) problems.push(`A pet can have up to ${MAX_PHOTOS} photos.`);
    if (problems.length) return { problems };
    if (cover) photos = [cover, ...photos.filter((u) => u !== cover)];
    photos = [...new Set(photos)].slice(0, MAX_PHOTOS);
    return {
      fields: {
        name: b.name, species: b.species, breed: b.breed ?? "", age_years: b.age_years ?? 1, gender: b.gender ?? "unknown",
        size: b.size ?? "medium", energy_level: b.energy_level ?? "medium", description: b.description ?? "",
        special_needs: b.special_needs ?? "", image_url: photos[0] || "", photos,
        good_with_kids: b.good_with_kids ?? true, good_with_dogs: b.good_with_dogs ?? true, good_with_cats: b.good_with_cats ?? true,
        vaccinated: b.vaccinated ?? true,
      },
      status: b.status ?? "available",
    };
  }

  function dashboard() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const adopted = pets.filter((p) => p.adopted_at);
    const stays = adopted.map((p) => Math.max((new Date(p.adopted_at) - new Date(p.created_at)) / DAY, 0));
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    }
    const label = (m) => new Date(Date.UTC(2000, m, 1)).toLocaleString("en", { month: "short", timeZone: "UTC" });
    const count = (y, m) => adopted.filter((p) => { const d = new Date(p.adopted_at); return d.getUTCFullYear() === y && d.getUTCMonth() === m; }).length;
    const waiting = pets.filter((p) => p.status === "available").sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 3);
    const bySpecies = {};
    pets.filter((p) => p.status !== "adopted").forEach((p) => { bySpecies[p.species] = (bySpecies[p.species] || 0) + 1; });
    return {
      pets: { available: pets.filter((p) => p.status === "available").length, pending: pets.filter((p) => p.status === "pending").length,
              adopted: pets.filter((p) => p.status === "adopted").length, total: pets.length },
      applications: {
        pending: apps.filter((a) => a.status === "pending").length, approved: apps.filter((a) => a.status === "approved").length,
        rejected: apps.filter((a) => a.status === "rejected").length, this_month: apps.filter((a) => new Date(a.created_at) >= monthStart).length,
      },
      adoptions_this_month: adopted.filter((p) => new Date(p.adopted_at) >= monthStart).length,
      avg_days_to_adopt: stays.length ? Math.round((stays.reduce((a, b) => a + b, 0) / stays.length) * 10) / 10 : null,
      by_species: bySpecies,
      monthly_adoptions: months.map(({ y, m }) => ({ month: `${y}-${String(m + 1).padStart(2, "0")}`, label: label(m), count: count(y, m) })),
      longest_waiting: waiting.map((p) => ({ id: p.id, name: p.name, species: p.species, days: Math.floor((now - new Date(p.created_at)) / DAY) })),
      new_volunteers: volunteers.filter((v) => v.status === "new").length,
    };
  }

  const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || "");

  async function handle(rawUrl, init = {}) {
    const u = new URL(rawUrl, "http://preview.local");
    const path = u.pathname.replace(/^\/api/, "");
    const method = (init.method || "GET").toUpperCase();
    const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
    const body = init.body && !isForm ? JSON.parse(init.body) : {};
    const authed = (init.headers || {}).Authorization === `Bearer ${TOKEN}`;
    const adminOnly = () => (authed ? null : fail(401, "Admin authentication required"));
    let m;

    if (path === "/health") return json({ status: "ok" });
    if (path === "/centre") return json(CENTRE);

    if (path === "/uploads" && method === "POST") {
      const denied = adminOnly(); if (denied) return denied;
      const file = isForm ? init.body.get("file") : null;
      if (!file || !IMAGE_TYPES.includes(file.type)) return fail(400, "Choose a JPG, PNG or WebP image.");
      if (file.size > MAX_UPLOAD_BYTES) return fail(413, "Photo must be under 5 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return json({ url: `data:${file.type};base64,${btoa(bin)}`, public_id: "preview/" + (file.name || "photo") });
    }

    if (path === "/pets" && method === "GET") {
      const q = u.searchParams;
      const ids = q.has("ids") ? q.get("ids").split(",").filter((x) => /^\d+$/.test(x.trim())).map(Number) : null;
      let out = pets.filter((p) =>
        (!q.get("species") || p.species === q.get("species")) &&
        (!q.get("status") || p.status === q.get("status")) &&
        (!q.get("size") || p.size === q.get("size")) &&
        (!q.get("energy") || p.energy_level === q.get("energy")) &&
        (q.get("kids") !== "true" || p.good_with_kids) &&
        (q.get("dogs") !== "true" || p.good_with_dogs) &&
        (q.get("cats") !== "true" || p.good_with_cats) &&
        (!ids || ids.includes(p.id)));
      const term = (q.get("q") || "").toLowerCase();
      if (term) out = out.filter((p) => p.name.toLowerCase().includes(term) || p.breed.toLowerCase().includes(term));
      return json([...out].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id));
    }

    if (path === "/pets" && method === "POST") {
      const denied = adminOnly(); if (denied) return denied;
      const { fields, status, problems } = petFields(body);
      if (problems) return invalid(...problems);
      const pet = { id: nextPet++, created_at: new Date().toISOString(), adopted_at: null, status: "available", ...fields };
      setStatus(pet, status);
      pets.push(pet);
      return json(pet, 201);
    }

    if ((m = path.match(/^\/pets\/(\d+)$/))) {
      const id = Number(m[1]);
      const pet = pets.find((p) => p.id === id);
      if (method === "GET") return pet ? json(pet) : fail(404, "Pet not found");
      const denied = adminOnly(); if (denied) return denied;
      if (!pet) return fail(404, "Pet not found");
      if (method === "PUT") {
        const { fields, status, problems } = petFields(body);
        if (problems) return invalid(...problems);
        Object.assign(pet, fields);
        setStatus(pet, status);
        return json(pet);
      }
      if (method === "DELETE") {
        pets = pets.filter((p) => p.id !== id);
        apps = apps.filter((a) => a.pet_id !== id);
        return json(null, 204);
      }
    }

    if (path === "/stats") {
      return json({
        total: pets.length,
        available: pets.filter((p) => p.status === "available").length,
        adopted: pets.filter((p) => p.status === "adopted").length,
      });
    }

    if (path === "/applications" && method === "POST") {
      const problems = [];
      if (!body.applicant_name || body.applicant_name.length < 2) problems.push("String should have at least 2 characters");
      if (!validEmail(body.email)) problems.push("value is not a valid email address");
      if (!body.phone || body.phone.length < 7) problems.push("String should have at least 7 characters");
      if (problems.length) return invalid(...problems);
      if ((body.website || "").trim()) return json({ id: 0, tracking_code: randomCode(), email_enabled: false, message: "Application received! We'll be in touch soon." }, 201);
      if (body.fill_time_ms != null && body.fill_time_ms < MIN_FILL_MS) return fail(429, "That was quick! Please check your details and submit again.");
      const pet = pets.find((p) => p.id === body.pet_id);
      if (!pet) return fail(404, "Pet not found");
      if (pet.status === "adopted") return fail(400, "This pet has already been adopted");
      const email = body.email.trim().toLowerCase();
      if (apps.some((a) => a.pet_id === pet.id && a.status === "pending" && a.email.toLowerCase() === email)) {
        return fail(409, `You have already applied for ${pet.name}. Use your tracking code to check its status.`);
      }
      const row = {
        id: nextApp++, pet_id: pet.id, applicant_name: body.applicant_name.trim(), email, phone: body.phone.trim(),
        address: (body.address || "").trim(), has_other_pets: !!body.has_other_pets, message: (body.message || "").trim(),
        status: "pending", tracking_code: randomCode(), decided_at: null, created_at: new Date().toISOString(),
      };
      apps.push(row);
      return json({ id: row.id, tracking_code: row.tracking_code, email_enabled: false, message: "Application received! We'll be in touch soon." }, 201);
    }

    if (path === "/applications/track" && method === "POST") {
      const row = apps.find((a) => a.tracking_code === (body.code || "").trim().toUpperCase());
      if (!row || row.email.toLowerCase() !== (body.email || "").trim().toLowerCase()) {
        return fail(404, "We couldn't find an application with those details. Check the code and email address.");
      }
      const pet = pets.find((p) => p.id === row.pet_id);
      return json({
        tracking_code: row.tracking_code, status: row.status, pet_id: row.pet_id, pet_name: pet ? pet.name : "(removed)",
        pet_image: pet ? pet.image_url : "", pet_species: pet ? pet.species : "other", submitted_at: row.created_at, decided_at: row.decided_at,
      });
    }

    if (path === "/volunteers" && method === "POST") {
      const problems = [];
      if (!body.name || body.name.length < 2) problems.push("String should have at least 2 characters");
      if (!validEmail(body.email)) problems.push("value is not a valid email address");
      if (!body.phone || body.phone.length < 7) problems.push("String should have at least 7 characters");
      if (problems.length) return invalid(...problems);
      const thanks = { message: "Thank you! We'll be in touch about volunteering soon." };
      if ((body.website || "").trim()) return json(thanks, 201);
      volunteers.push({
        id: nextVol++, name: body.name.trim(), email: body.email.trim().toLowerCase(), phone: body.phone.trim(),
        interests: (body.interests || []).map((i) => i.trim().slice(0, 60)).filter(Boolean), availability: (body.availability || "").trim(),
        message: (body.message || "").trim(), status: "new", created_at: new Date().toISOString(),
      });
      return json(thanks, 201);
    }

    if (path === "/admin/login" && method === "POST") {
      return body.password === PASSWORD ? json({ token: TOKEN }) : fail(401, "Incorrect password");
    }

    if (path === "/admin/dashboard") {
      const denied = adminOnly(); if (denied) return denied;
      return json(dashboard());
    }

    if (path === "/applications" && method === "GET") {
      const denied = adminOnly(); if (denied) return denied;
      return json([...apps].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).map((a) => {
        const pet = pets.find((p) => p.id === a.pet_id);
        return { ...a, pet_name: pet ? pet.name : "(deleted)" };
      }));
    }

    if ((m = path.match(/^\/applications\/(\d+)$/)) && method === "PATCH") {
      const denied = adminOnly(); if (denied) return denied;
      if (!["pending", "approved", "rejected"].includes(body.status)) return fail(400, "Invalid status");
      const row = apps.find((a) => a.id === Number(m[1]));
      if (!row) return fail(404, "Application not found");
      const previous = row.status;
      row.status = body.status;
      if (previous !== body.status) row.decided_at = body.status === "pending" ? null : new Date().toISOString();
      const pet = pets.find((p) => p.id === row.pet_id);
      if (pet) {
        if (body.status === "approved") setStatus(pet, "adopted");
        else if (body.status === "pending" && pet.status === "adopted") setStatus(pet, "available");
      }
      return json({ ok: true });
    }

    if (path === "/volunteers" && method === "GET") {
      const denied = adminOnly(); if (denied) return denied;
      return json([...volunteers].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id));
    }

    if ((m = path.match(/^\/volunteers\/(\d+)$/)) && method === "PATCH") {
      const denied = adminOnly(); if (denied) return denied;
      if (!["new", "contacted"].includes(body.status)) return fail(400, "Invalid status");
      const row = volunteers.find((v) => v.id === Number(m[1]));
      if (!row) return fail(404, "Volunteer not found");
      row.status = body.status;
      return json({ ok: true });
    }

    return fail(404, "Not Found");
  }

  const realFetch = root.fetch ? root.fetch.bind(root) : null;
  root.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (/\/api\//.test(url)) {
      await new Promise((r) => setTimeout(r, 60));
      return handle(url, init || {});
    }
    return realFetch ? realFetch(input, init) : Promise.reject(new Error("fetch unavailable"));
  };
}

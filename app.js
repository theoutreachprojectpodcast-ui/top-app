const SUPABASE_URL = "https://xbtfoundwmhrqrbcuqcw.supabase.co";
const SUPABASE_KEY = "sb_publishable_LdAF-RydoXbsD2Ccscnsag_dQ-rolTO";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// IMPORTANT: use the view that includes audience flags
const TABLE = "nonprofits_with_audience";
const PAGE_SIZE = 25;

const stateSelect = document.getElementById("stateSelect");
const qInput = document.getElementById("qInput");
const serviceSelect = document.getElementById("serviceSelect");
const audienceSelect = document.getElementById("audienceSelect");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const resultsEl = document.getElementById("results");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageLabel = document.getElementById("pageLabel");

// pagination state
let offset = 0;
let lastHadNext = false;

// total count state
let totalCount = null;
let totalIsEstimated = true;
let lastCountKey = "";

// ----- DATA LISTS -----
const STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
  ["DC","District of Columbia"],
];

const NTEE_GROUPS = [
  { value: "", label: "Any service area" },
  { value: "A", label: "Arts, culture & humanities" },
  { value: "B", label: "Education" },
  { value: "C", label: "Environment & animals" },
  { value: "D", label: "Animal-related" },
  { value: "E", label: "Health" },
  { value: "F", label: "Mental health & crisis" },
  { value: "G", label: "Disease/disorders" },
  { value: "H", label: "Medical research" },
  { value: "I", label: "Crime & legal" },
  { value: "J", label: "Employment" },
  { value: "K", label: "Food, agriculture & nutrition" },
  { value: "L", label: "Housing & shelter" },
  { value: "M", label: "Public safety & disaster" },
  { value: "N", label: "Recreation & sports" },
  { value: "O", label: "Youth development" },
  { value: "P", label: "Human services" },
  { value: "R", label: "Civil rights & advocacy" },
  { value: "S", label: "Community improvement" },
  { value: "T", label: "Philanthropy & foundations" },
  { value: "W", label: "Public & society benefit" },
  { value: "X", label: "Religion-related" },
  { value: "Z", label: "Other / unknown" },
];

// ----- HELPERS -----
function fillStates(){
  stateSelect.innerHTML = `<option value="">Select a state…</option>`;
  for (const [abbr, name] of STATES){
    const opt = document.createElement("option");
    opt.value = abbr;
    opt.textContent = name;
    stateSelect.appendChild(opt);
  }
}

function setServiceOptionsEnabled(enabled){
  if (!enabled){
    serviceSelect.disabled = true;
    serviceSelect.innerHTML = `<option value="">Select a state first…</option>`;
    return;
  }
  serviceSelect.disabled = false;
  serviceSelect.innerHTML = "";
  for (const g of NTEE_GROUPS){
    const opt = document.createElement("option");
    opt.value = g.value;
    opt.textContent = g.label;
    serviceSelect.appendChild(opt);
  }
}

function setStatus(msg){ statusEl.textContent = msg; }

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function serviceLabelFromNtee(ntee){
  if (!ntee) return "Service area";
  const first = String(ntee).trim().charAt(0).toUpperCase();
  const hit = NTEE_GROUPS.find(x => x.value === first);
  return hit ? hit.label : "Service area";
}

function googleContactUrl(name, city, state, ein){
  const q = `${name} ${city ? city + " " : ""}${state ? state + " " : ""}${ein ? "EIN " + ein + " " : ""}contact`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function irsRecordUrl(ein){
  const clean = String(ein || "").replace(/\D/g, "");
  return `https://projects.propublica.org/nonprofits/organizations/${clean}`;
}

function countKey(f){
  return `${f.state}||${f.q.toLowerCase()}||${f.ntee}||${f.audience}`;
}

function setMeta(start, end){
  if (typeof totalCount === "number" && totalCount >= 0){
    const approx = totalIsEstimated ? "about " : "";
    metaEl.textContent = `Showing ${start}–${end} of ${approx}${totalCount.toLocaleString()} results`;
  } else {
    metaEl.textContent = `Showing ${start}–${end}`;
  }
}

function setPager(){
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  if (typeof totalCount === "number" && totalCount >= 0){
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    pageLabel.textContent = `Page ${Math.min(page, totalPages)} of ${totalPages}`;
  } else {
    pageLabel.textContent = `Page ${page}`;
  }

  prevBtn.disabled = offset === 0;
  nextBtn.disabled = !lastHadNext;
}

function getFilters(){
  return {
    state: (stateSelect.value || "").trim().toUpperCase(),
    q: (qInput.value || "").trim(),
    ntee: serviceSelect.disabled ? "" : (serviceSelect.value || ""),
    audience: (audienceSelect?.value || "all")
  };
}

function renderResults(rows){
  resultsEl.innerHTML = "";
  if (!rows || rows.length === 0){
    resultsEl.innerHTML = `<div class="card"><p class="sub">No results found. Try adjusting filters.</p></div>`;
    return;
  }

  for (const r of rows){
    const name = r.name || "—";
    const city = r.city || "";
    const state = r.state || "";
    const ein = r.ein || "";
    const service = serviceLabelFromNtee(r.ntee_code);

    // OPTIONAL: show small audience badges if your view returns them
    const badges = [];
    if (r.is_veteran_org) badges.push("Veteran");
    if (r.is_first_responder_org) badges.push("First Responder");

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="name">${escapeHtml(name)}</div>
      <p class="sub">${escapeHtml([city, state].filter(Boolean).join(", ") || "—")}</p>
      <div class="tagRow">
        <span class="tag">${escapeHtml(service)}</span>
        ${badges.map(b => `<span class="tag">${escapeHtml(b)}</span>`).join("")}
      </div>

      <div class="actionRow">
        <a class="btnContact"
           href="${googleContactUrl(name, city, state, ein)}"
           target="_blank" rel="noopener">
          Find contact info
        </a>

        <a class="btnMore"
           href="${irsRecordUrl(ein)}"
           target="_blank" rel="noopener">
          More info
        </a>
      </div>
    `;
    resultsEl.appendChild(div);
  }
}

// ----- CORE SEARCH (paged + count) -----
async function fetchPage(reset=false){
  if (reset) offset = 0;

  const f = getFilters();
  if (!f.state){
    setStatus("Please select a state to search.");
    metaEl.textContent = "";
    totalCount = null;
    lastCountKey = "";
    lastHadNext = false;
    setPager();
    resultsEl.innerHTML = "";
    return;
  }

  setStatus("Searching…");
  resultsEl.innerHTML = "";

  // fetch PAGE_SIZE + 1 to detect next page
  const from = offset;
  const to = offset + PAGE_SIZE;

  const needCount = (countKey(f) !== lastCountKey);

  let query = sb
    .from(TABLE)
    .select("ein,name,city,state,ntee_code,is_veteran_org,is_first_responder_org", { count: needCount ? "estimated" : null })
    .eq("state", f.state)
    .range(from, to);

  // optional search on name/city
  if (f.q && f.q.length >= 2){
    const safe = f.q.replace(/,/g, " ");
    query = query.or(`name.ilike.%${safe}%,city.ilike.%${safe}%`);
  }

  // optional service filter by NTEE prefix
  if (f.ntee){
    query = query.ilike("ntee_code", `${f.ntee}%`);
  }

  // ✅ optional audience filter (the missing piece)
  if (f.audience === "veteran"){
    query = query.eq("is_veteran_org", true);
  } else if (f.audience === "first_responder"){
    query = query.eq("is_first_responder_org", true);
  }

  const { data, error, count } = await query;

  if (error){
    console.error(error);
    setStatus("Error (check console).");
    metaEl.textContent = "";
    resultsEl.innerHTML = `<div class="card"><p class="sub">${escapeHtml(error.message || "Search failed")}</p></div>`;
    totalCount = null;
    lastHadNext = false;
    setPager();
    return;
  }

  if (needCount){
    lastCountKey = countKey(f);
    totalCount = (typeof count === "number") ? count : null;
    totalIsEstimated = true;
  }

  lastHadNext = data.length > PAGE_SIZE;
  const pageRows = lastHadNext ? data.slice(0, PAGE_SIZE) : data;

  const start = offset + 1;
  const end = offset + pageRows.length;

  setMeta(start, end);
  renderResults(pageRows);
  setStatus("Done");
  setPager();
}

// ----- EVENTS -----
searchBtn.addEventListener("click", () => fetchPage(true));

prevBtn.addEventListener("click", () => {
  offset = Math.max(0, offset - PAGE_SIZE);
  fetchPage(false);
});

nextBtn.addEventListener("click", () => {
  offset = offset + PAGE_SIZE;
  fetchPage(false);
});

clearBtn.addEventListener("click", () => {
  stateSelect.value = "";
  qInput.value = "";
  setServiceOptionsEnabled(false);
  if (audienceSelect) audienceSelect.value = "all";

  resultsEl.innerHTML = "";
  metaEl.textContent = "";

  offset = 0;
  totalCount = null;
  lastCountKey = "";
  lastHadNext = false;

  setPager();
  setStatus("Please select a state to search.");
});

stateSelect.addEventListener("change", () => {
  setServiceOptionsEnabled(!!stateSelect.value);
});

// ----- INIT -----
(function init(){
  fillStates();
  setServiceOptionsEnabled(false);
  metaEl.textContent = "";
  setStatus("Please select a state to search.");
  setPager();

  // make sure audience is usable
  if (audienceSelect) {
    audienceSelect.disabled = false;
    if (!audienceSelect.value) audienceSelect.value = "all";
  }
})();

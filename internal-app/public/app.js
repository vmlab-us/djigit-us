const $ = (id) => document.getElementById(id);
let activeSearch = null;
let directory = [];
let searchController = null;
let idToken = sessionStorage.getItem("djigit_google_id_token") || "";
let modelRequestId = 0;
const API_ORIGIN = /^(?:www\.)?djigit\.us$/i.test(location.hostname)
  ? "https://djigit-dealer-inventory.djigit-us.workers.dev"
  : "";

const api = async (url, options) => {
  const response = await fetch(`${API_ORIGIN}${url}`, { ...options, headers: {
    "content-type": "application/json", ...(idToken ? {authorization:`Bearer ${idToken}`} : {}),
    ...(options?.headers ?? {}),
  } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Не удалось выполнить запрос.");
  return body;
};

async function loadDealers(force = false) {
  $("directoryStatus").textContent = "Загрузка справочника…";
  try {
    const data = await api(`/api/internal/dealers${force ? "?refresh=1" : ""}`);
    directory = data.dealers;
    populateMakes();
    $("directoryStatus").textContent = `${data.dealers.length} дилеров · обновлено ${new Date(data.loadedAtIso).toLocaleString()}`;
  } catch (error) {
    $("directoryStatus").textContent = error.message;
    throw error;
  }
}

const preference = (id, required = false) => {
  const input = $(id);
  const raw = typeof input.value === "string" ? input.value.trim() : input.value;
  if (!raw) return undefined;
  return { value: input.type === "number" ? Number(raw) : raw, required };
};

const setSelectValue = (id, value) => {
  const select = $(id);
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) { select.value = ""; return; }
  if (![...select.options].some((option) => option.value.toLowerCase() === cleanValue.toLowerCase())) {
    select.add(new Option(cleanValue, cleanValue));
  }
  const option = [...select.options].find((item) => item.value.toLowerCase() === cleanValue.toLowerCase());
  select.value = option?.value ?? cleanValue;
};

function populateMakes() {
  const current = $("make").value.trim();
  const makes = [...new Set(directory.flatMap((dealer) =>
    String(dealer.brand ?? "").split(/\s*[/,|]\s*/).map((value) => value.trim()).filter(Boolean),
  ))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  $("make").replaceChildren(new Option("Выберите марку", ""), ...makes.map((make) => new Option(make, make)));
  if (current) setSelectValue("make", current);
}

async function loadModels(make, selected = "", force = false) {
  const requestId = ++modelRequestId;
  const model = $("model");
  const normalizedMake = String(make ?? "").trim();
  model.disabled = true;
  model.replaceChildren(new Option(normalizedMake ? "Загрузка моделей…" : "Сначала выберите марку", ""));
  if (!normalizedMake) return;
  try {
    const data = await api(
      `/api/internal/models?make=${encodeURIComponent(normalizedMake)}${force ? "&refresh=1" : ""}`,
    );
    if (requestId !== modelRequestId) return;
    model.replaceChildren(new Option("Выберите модель", ""),
      ...data.models.map((name) => new Option(name, name)));
    model.disabled = false;
    if (selected) setSelectValue("model", selected);
  } catch (error) {
    if (requestId !== modelRequestId) return;
    model.replaceChildren(new Option("Не удалось загрузить модели", ""));
    model.disabled = false;
    if (selected) setSelectValue("model", selected);
  }
}

$("make").addEventListener("change", () => loadModels($("make").value));

$("searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("message").hidden = true; $("results").hidden = true;
  applyFreeText();
  const filters = {
    make: preference("make", true), model: preference("model", true),
    condition: { value:"New", required:true }, status: preference("availability", true),
    trim: preference("trim", true), drivetrain: preference("drivetrain", true),
    powertrain: preference("powertrain", true), priceMax: preference("priceMax", true),
    exteriorColor: preference("exteriorColor", true),
  };
  Object.keys(filters).forEach((key) => filters[key] === undefined && delete filters[key]);
  if (!filters.make || !filters.model) return showMessage("Укажите марку и модель в строке запроса или фильтрах.");
  const distanceValue = $("distance").value.trim();
  const maxDistance = distanceValue && Number(distanceValue) >= 1 ? Number(distanceValue) : undefined;
  const matchingDealers = directory.filter((dealer) =>
    dealer.website && dealer.brand?.toLowerCase().includes(filters.make.value.toLowerCase()) &&
    (maxDistance === undefined || (dealer.distanceMiles !== null && dealer.distanceMiles <= maxDistance)));
  const selectedByName = new Map();
  for (const dealer of matchingDealers) {
    const key = `${String(dealer.brand).trim().toLowerCase()}|${String(dealer.name).trim().toLowerCase()}`;
    const existing = selectedByName.get(key);
    if (!existing || (!existing.fleet && dealer.fleet)) selectedByName.set(key, dealer);
  }
  const selected = [...selectedByName.values()];
  $("directoryStatus").textContent =
    `Ищем: ${filters.make.value} ${filters.model.value}` +
    `${filters.powertrain?.value ? ` · ${filters.powertrain.value}` : ""}` +
    `${filters.status?.value ? ` · ${filters.status.value}` : ""}` +
    ` · подходящих дилеров: ${selected.length}`;
  try {
    searchController = new AbortController();
    activeSearch = { status:"running",selected:selected.length,checked:0,failed:[],exact:[],close:[],query:{ freeText:$("freeText").value,filters } };
    $("progress").hidden = false; $("cancel").hidden = false; renderProgress(activeSearch);
    const hardTimer = setTimeout(() => searchController.abort(), 120000);
    await runQueue(selected, { freeText:$("freeText").value,filters }, searchController.signal);
    clearTimeout(hardTimer);
    if (activeSearch.status === "running") activeSearch.status = searchController.signal.aborted ? "partial" : "completed";
    finish(activeSearch);
  } catch (error) { showMessage(error.message); }
});

function renderProgress(search) {
  $("progress").querySelector("progress").max = Math.max(search.selected, 1);
  $("progress").querySelector("progress").value = search.checked;
  $("progressText").textContent = `Выбрано: ${search.selected} · проверено: ${search.checked} · недоступно: ${search.failed.length}`;
}

async function runQueue(dealers, query, signal) {
  let cursor = 0;
  const worker = async () => {
    while (cursor < dealers.length && !signal.aborted) {
      const dealer = dealers[cursor++];
      try {
        const result = await api("/api/internal/inventory/dealer-search", {
          method:"POST", body:JSON.stringify({dealerId:dealer.id,query}), signal,
        });
        activeSearch.exact.push(...result.exact);
        activeSearch.close.push(...result.close);
      } catch (error) {
        activeSearch.failed.push({
          dealerName: dealer.name,
          website: dealer.website,
          dealer,
          query,
          reason: signal.aborted ? "Поиск остановлен" : error.message,
        });
      } finally {
        activeSearch.checked += 1; renderProgress(activeSearch);
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(5,dealers.length)}, worker));
  dedupeAndSort(activeSearch);
}

$("cancel").addEventListener("click", async () => {
  if (!activeSearch) return;
  searchController?.abort(); activeSearch.status = "cancelled";
  finish(activeSearch);
});
$("refresh").addEventListener("click", async () => {
  const make = $("make").value.trim();
  const model = $("model").value.trim();
  $("refresh").disabled = true;
  $("directoryStatus").textContent = "Обновляем дилеров и актуальные модели…";
  try {
    await loadDealers(true);
    if (make) {
      setSelectValue("make", make);
      await loadModels(make, model, true);
    }
  } finally {
    $("refresh").disabled = false;
  }
});

function finish(search) {
  $("cancel").hidden = true; $("progress").hidden = true; $("results").hidden = false;
  sortResults(search);
  $("resultCount").textContent = `Найдено: ${search.exact.length + search.close.length}`;
  renderGroup("exact", "Точные совпадения", search.exact);
  renderGroup("close", "Близкие варианты", search.close);
  $("failed").innerHTML = search.failed.length ? `<section class="manual-check panel">
    <h2>Проверить вручную (${search.failed.length})</h2>
    <p class="muted">Эти сайты не удалось проверить автоматически. Откройте их вручную и выполните тот же поиск на сайте дилера.</p>
    <div class="manual-check-list">${search.failed.map(manualCheckCard).join("")}</div>
  </section>` : "";
  if (!search.exact.length && !search.close.length) showMessage(search.selected ? "Совпадений не найдено." : "Для этой марки нет дилеров с корректным HTTPS-сайтом в справочнике.");
}

const vehiclePrice = (item) => item.vehicle.price ?? item.vehicle.msrp;
const numberOrInfinity = (value) => Number.isFinite(Number(value)) ? Number(value) : Infinity;
const numberOrNegativeInfinity = (value) => Number.isFinite(Number(value)) ? Number(value) : -Infinity;
function resultComparator(a, b) {
  const mode = $("sortOrder").value;
  const fleetTie = fleetPriority(b.vehicle.dealer) - fleetPriority(a.vehicle.dealer);
  const scoreTie = b.score - a.score;
  if (mode === "priceAsc") {
    return numberOrInfinity(vehiclePrice(a)) - numberOrInfinity(vehiclePrice(b)) || fleetTie || scoreTie;
  }
  if (mode === "priceDesc") {
    return numberOrNegativeInfinity(vehiclePrice(b)) - numberOrNegativeInfinity(vehiclePrice(a)) ||
      fleetTie || scoreTie;
  }
  if (mode === "distanceAsc") {
    return numberOrInfinity(a.vehicle.dealer.distanceMiles) - numberOrInfinity(b.vehicle.dealer.distanceMiles) ||
      fleetTie || scoreTie;
  }
  if (mode === "yearDesc") {
    return numberOrNegativeInfinity(b.vehicle.year) - numberOrNegativeInfinity(a.vehicle.year) ||
      fleetTie || scoreTie;
  }
  if (mode === "inStock") {
    return Number(/in stock/i.test(b.vehicle.status || "")) - Number(/in stock/i.test(a.vehicle.status || "")) ||
      fleetTie || scoreTie;
  }
  if (mode === "dealerName") {
    return String(a.vehicle.dealer.name || "").localeCompare(String(b.vehicle.dealer.name || ""), "en",
      { sensitivity:"base" }) || scoreTie;
  }
  return fleetTie || scoreTie ||
    numberOrInfinity(a.vehicle.dealer.distanceMiles) - numberOrInfinity(b.vehicle.dealer.distanceMiles) ||
    numberOrInfinity(vehiclePrice(a)) - numberOrInfinity(vehiclePrice(b));
}
function sortResults(search) {
  search.exact.sort(resultComparator);
  search.close.sort(resultComparator);
}
$("sortOrder").addEventListener("change", () => {
  if (!activeSearch || $("results").hidden) return;
  sortResults(activeSearch);
  renderGroup("exact", "Точные совпадения", activeSearch.exact);
  renderGroup("close", "Близкие варианты", activeSearch.close);
});

function renderGroup(id, title, items) {
  $(id).innerHTML = items.length ? `<section class="group"><h2>${title} (${items.length})</h2><div class="cards">${items.map(card).join("")}</div></section>` : "";
}

function manualCheckCard(item) {
  const website = safeUrl(item.website);
  const hasFleetContact = fleetPriority(item.dealer) > 0;
  const vehicle = unverifiedVehicle(item.dealer, item.query);
  if (hasFleetContact) {
    return `<article class="manual-check-card manual-contact-card">
      <div class="manual-contact-main">
        <span class="badge unavailable-badge">Сайт не удалось прочитать</span>
        ${fleetMobilePhone(item.dealer) ? `<span class="badge fleet-badge">Fleet mobile</span>` : `<span class="badge fleet-badge">Fleet contact</span>`}
        <h3>${escapeHtml(vehicle.name)}</h3>
        <p class="failure-reason">${escapeHtml(item.reason)}</p>
        ${dealerBlock(item.dealer)}
        ${website !== "#" ? `<a href="${website}" target="_blank" rel="noopener noreferrer">Открыть сайт вручную</a>` : ""}
        ${contactActions(vehicle)}
      </div>
    </article>`;
  }
  return `<article class="manual-check-card">
    <div><strong>${escapeHtml(item.dealerName)}</strong><span>${escapeHtml(item.reason)}</span></div>
    ${website !== "#" ? `<a class="manual-check-link" href="${website}" target="_blank" rel="noopener noreferrer">Открыть сайт вручную</a>` : `<span class="muted">Ссылка не указана</span>`}
  </article>`;
}

function unverifiedVehicle(dealer, query) {
  const filters = query?.filters ?? {};
  const value = (name) => filters[name]?.value ?? null;
  const name = [value("make"), value("model"), value("trim"), value("powertrain")]
    .filter(Boolean).join(" ");
  return {
    name: name || "Requested vehicle",
    year: null,
    make: value("make"),
    model: value("model"),
    trim: value("trim"),
    drivetrain: value("drivetrain"),
    powertrain: value("powertrain"),
    exteriorColor: value("exteriorColor"),
    requestedAvailability: value("status"),
    requestedPriceMax: value("priceMax"),
    status: "Not verified — dealer website unavailable",
    url: dealer.website,
    dealer,
    unverified: true,
  };
}

function card(item) {
  const v = item.vehicle, d = v.dealer, price = v.price ?? v.msrp;
  return `<article class="card"><span class="badge">${item.exact ? "Точное" : "Близкое"}</span>
    ${fleetMobilePhone(d) ? `<span class="badge fleet-badge">Fleet mobile</span>` : ""}
    <h3>${escapeHtml(v.name || [v.year,v.make,v.model,v.trim].filter(Boolean).join(" "))}</h3>
    ${item.explanations.length ? `<ul class="diff">${item.explanations.map((x)=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}
    <div class="meta">
      <span>Цена: ${price == null ? "Не указана" : `$${price.toLocaleString()}`}</span>
      <span>VIN: ${escapeHtml(v.vin || "Не указан")}</span>
      <span>Цвет: ${escapeHtml(v.exteriorColor || "Не указан")}</span>
      <span>Наличие: ${escapeHtml(v.status || "Не указано")}</span>
      <span>Stock #: ${escapeHtml(v.stockNumber || "Не указан")}</span>
      <span>Привод: ${escapeHtml(v.drivetrain || "Не указан")}</span>
      <span>Двигатель: ${escapeHtml(v.powertrain || "Не указан")}</span>
      <span>Trim: ${escapeHtml(v.trim || "Не указан")}</span>
    </div>
    ${dealerBlock(d)}
    ${v.url ? `<a href="${safeUrl(v.url)}" target="_blank" rel="noopener noreferrer">Открыть автомобиль у дилера</a>` : ""}
    ${contactActions(v)}
    <p class="muted">Проверено ${new Date(v.checkedAt).toLocaleString()}. Опубликованная цена требует подтверждения у дилера.</p></article>`;
}

function dealerContact(dealer) {
  const fleet = dealer.fleet?.contacts?.[0] ?? dealer.fleet ?? null;
  return {
    name: fleet?.nameAndTitle || null,
    email: fleet?.email || null,
    fleetPhone: fleet?.phone || null,
    smsPhone: fleet?.smsPhone || null,
    status: fleet?.status || null,
    officePhone: dealer.phone || null,
  };
}
function fleetMobilePhone(dealer) {
  const contact = dealerContact(dealer);
  return /^\+1\d{10}$/.test(contact.smsPhone || "") ? contact.smsPhone : "";
}
function fleetPriority(dealer) {
  const contact = dealerContact(dealer);
  if (fleetMobilePhone(dealer)) return 3;
  if (contact.email) return 2;
  if (contact.name || contact.fleetPhone) return 1;
  return 0;
}
function contact(dealer) {
  const first = dealerContact(dealer);
  if (first.name || first.email || first.fleetPhone) return `Fleet: ${escapeHtml(first.name || "контакт")} · ${escapeHtml(first.fleetPhone || first.email || "данные не указаны")}`;
  return `Публичный fleet-контакт не найден · ${escapeHtml(dealer.phone || "общий телефон не указан")}`;
}
function dealerBlock(dealer) {
  return `<div class="dealer-block">
    <div class="dealer-heading"><span>${escapeHtml(dealer.name)}</span>${dealer.distanceMiles == null ? "" : `<span class="dealer-distance">${dealer.distanceMiles} mi</span>`}</div>
    <div class="dealer-contact">${contact(dealer)}</div>
  </div>`;
}
function vehicleSummary(vehicle) {
  const amount = vehicle.price ?? vehicle.msrp;
  return [
    vehicle.unverified ? "Note: DJIGIT could not read the dealer website automatically; please check your current inventory." : null,
    vehicle.name || [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" "),
    vehicle.vin ? `VIN: ${vehicle.vin}` : null,
    vehicle.stockNumber ? `Stock #: ${vehicle.stockNumber}` : null,
    amount != null ? `Advertised price: $${Number(amount).toLocaleString("en-US")}` : null,
    vehicle.exteriorColor ? `Exterior color: ${vehicle.exteriorColor}` : null,
    vehicle.requestedAvailability ? `Requested availability: ${vehicle.requestedAvailability}` : null,
    vehicle.requestedPriceMax != null ? `Maximum requested price: $${Number(vehicle.requestedPriceMax).toLocaleString("en-US")}` : null,
    vehicle.drivetrain ? `Drivetrain: ${vehicle.drivetrain}` : null,
    vehicle.powertrain ? `Engine / powertrain: ${vehicle.powertrain}` : null,
    vehicle.trim ? `Trim: ${vehicle.trim}` : null,
    vehicle.status ? `Status shown online: ${vehicle.status}` : null,
    vehicle.url ? `Vehicle link: ${vehicle.url}` : null,
  ].filter(Boolean);
}
function inquiryMessage(vehicle, short = false) {
  const details = vehicleSummary(vehicle);
  if (short) return `Hello, this is DJIGIT US LLC, California Dealer License #81487. We have a client interested in the following vehicle:\n${details.join("\n")}\n\nCould you please confirm availability? If it is no longer available, please send any similar in-stock options. Thank you.`;
  return `Hello,\n\nThis is DJIGIT US LLC, California Dealer License #81487. We have a client interested in the following vehicle:\n\n${details.join("\n")}\n\nCould you please confirm whether it is currently available? If it is unavailable, please send any similar in-stock or incoming options, including VIN, stock number, price, color, and expected availability.\n\nThank you,\nDJIGIT US LLC\nCalifornia Dealer License #81487`;
}
function contactActions(vehicle) {
  const recipient = dealerContact(vehicle.dealer);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email || "") ? recipient.email : "";
  const phone = fleetMobilePhone(vehicle.dealer);
  const officeDigits = String(recipient.officePhone || "").replace(/\D/g, "");
  const officePhone = officeDigits.length === 10 ? `+1${officeDigits}` :
    officeDigits.length === 11 && officeDigits.startsWith("1") ? `+${officeDigits}` : "";
  const subject = `Availability request — ${[vehicle.year, vehicle.make, vehicle.model, vehicle.stockNumber && `Stock ${vehicle.stockNumber}`].filter(Boolean).join(" ")}`;
  const emailBody = inquiryMessage(vehicle);
  const mobileMail = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const emailHref = mobileMail
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`
    : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
  const emailTarget = mobileMail ? "" : ` target="_blank" rel="noopener noreferrer"`;
  const smsSeparator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "&" : "?";
  const smsHref = phone ? `sms:${phone}${smsSeparator}body=${encodeURIComponent(inquiryMessage(vehicle, true))}` : "";
  const callHref = officePhone ? `tel:${officePhone}` : "";
  const copyText = encodeURIComponent(inquiryMessage(vehicle));
  const unavailable = !email && !phone && !officePhone ?
    `<span class="contact-note">Контактные данные не указаны — используйте Copy request.</span>` : "";
  return `<div class="contact-actions">
    <button type="button" class="contact-button copy-request" data-copy="${copyText}">Copy request</button>
    ${email ? `<a class="contact-button" href="${escapeHtml(emailHref)}"${emailTarget}>Email</a>` : ""}
    ${smsHref ? `<a class="contact-button secondary-contact" href="${escapeHtml(smsHref)}">Text message</a>` : ""}
    ${callHref ? `<a class="contact-button call-contact" href="${escapeHtml(callHref)}">Call office</a>` : ""}
    ${unavailable}
  </div>`;
}
function safeUrl(value) { try { const u=new URL(value); return u.protocol==="https:" ? escapeHtml(u.href) : "#"; } catch { return "#"; } }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
document.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-request");
  if (!button) return;
  const text = decodeURIComponent(button.dataset.copy || "");
  try {
    await navigator.clipboard.writeText(text);
    const previous = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = previous; }, 1800);
  } catch {
    showMessage("Не удалось скопировать автоматически. Разрешите доступ к буферу обмена и повторите.");
  }
});
function showMessage(text) { $("message").textContent = text; $("message").hidden = false; }
function applyFreeText() {
  const text = $("freeText").value.trim();
  if (!text) {
    return;
  }
  const brands = [
    ["Chevrolet", /\b(?:chevrolet|chevy)\b/i],
    ["Mercedes-Benz", /\b(?:mercedes[- ]?benz|mercedes|benz)\b/i],
    ["Volkswagen", /\b(?:volkswagen|vw)\b/i],
    ...["Toyota","Honda","Ford","Hyundai","Kia","Lexus","BMW","Tesla","Subaru","Nissan","Mazda","Audi","Volvo","Jeep","GMC",
      "Acura","Buick","Cadillac","Chrysler","Dodge","Porsche","Ram"]
      .map((name) => [name, new RegExp(`\\b${name}\\b`, "i")]),
  ];
  const matchedBrand = brands.map(([name, pattern]) => {
    const match = text.match(pattern);
    return match ? { name, match } : null;
  }).filter(Boolean).sort((a, b) => a.match.index - b.match.index)[0];
  if (matchedBrand) setSelectValue("make", matchedBrand.name);
  if (matchedBrand) {
    const after=text.slice(matchedBrand.match.index + matchedBrand.match[0].length).trim();
    $("model").disabled=false;
    setSelectValue("model", after.match(/^([A-Za-z0-9-]{2,30})/)?.[1] || "");
  }
  const max=text.match(/(?:до|under|up to)\s*\$?\s*([\d,]+)/i)?.[1];
  if (max) $("priceMax").value=max.replaceAll(",","");
  const drive=text.match(/\b(AWD|FWD|RWD|4WD|4x4)\b/i)?.[1];
  if (drive) $("drivetrain").value=drive.toUpperCase();
  const powertrain=text.match(/\b(diesel|дизель|hybrid|гибрид|electric|электро)\b/i)?.[1]?.toLowerCase();
  if (powertrain) {
    $("powertrain").value = /diesel|дизель/.test(powertrain) ? "diesel" :
      /hybrid|гибрид/.test(powertrain) ? "hybrid" : "electric";
  }
  const availability = text.match(/\b(in[ -]?stock|in[ -]?transit|incoming|on[ -]?order)\b/i)?.[1]?.toLowerCase();
  if (availability) {
    $("availability").value = /stock/.test(availability) ? "In Stock" :
      /transit/.test(availability) ? "In Transit" : /incoming/.test(availability) ? "Incoming" : "On Order";
  }
  const color = text.match(/\b(black|white|gr[ae]y|silver|blue|red|green|brown|beige|gold|bronze|yellow|orange|purple|burgundy|turquoise)\b/i)?.[1]?.toLowerCase();
  if (color) setSelectValue("exteriorColor", color === "grey" ? "Gray" : color);
}
function dedupeAndSort(search) {
  const seen=new Set();
  const unique=(items)=>items.filter(({vehicle})=>{const key=vehicle.vin?`vin:${vehicle.vin}`:`${vehicle.dealer.id}:${vehicle.stockNumber||""}:${vehicle.url||""}`;if(seen.has(key))return false;seen.add(key);return true;});
  search.exact=unique(search.exact).sort(resultComparator);
  search.close=unique(search.close).sort(resultComparator);
  const failedSeen=new Set();
  search.failed=search.failed.filter((item)=>{
    const key=normalizedWebsite(item.website) || String(item.dealerName).trim().toLowerCase();
    if(failedSeen.has(key))return false;
    failedSeen.add(key);return true;
  });
}
function normalizedWebsite(value) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./i, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch { return ""; }
}
async function initializeLogin() {
  const config=await fetch(`${API_ORIGIN}/api/auth/config`).then((response)=>response.json());
  if (!config.clientId) { $("loginError").textContent="Google Sign-In ещё не настроен."; return; }
  while (!window.google?.accounts?.id) await new Promise((resolve)=>setTimeout(resolve,100));
  google.accounts.id.initialize({
    client_id:config.clientId,
    callback:async ({credential})=>{
      idToken=credential; sessionStorage.setItem("djigit_google_id_token",credential);
      try { await loadDealers(); $("loginGate").hidden=true; $("appShell").hidden=false; }
      catch (error) { idToken=""; sessionStorage.removeItem("djigit_google_id_token"); $("loginError").textContent=error.message; }
    },
  });
  google.accounts.id.renderButton($("googleSignIn"),{theme:"outline",size:"large",text:"signin_with",shape:"pill"});
  if (idToken) {
    try { await loadDealers(); $("loginGate").hidden=true; $("appShell").hidden=false; }
    catch { idToken=""; sessionStorage.removeItem("djigit_google_id_token"); }
  }
}
initializeLogin();

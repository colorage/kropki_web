import { calculateRibbons, validateInputs } from "./geometry.js";
import { renderSchematic } from "./visualization.js";

// #region agent log
window.addEventListener("error", (event) => {
  fetch("http://127.0.0.1:7910/ingest/667cc278-1065-4415-9874-10080ea9a1df", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f06cbf" },
    body: JSON.stringify({
      sessionId: "f06cbf",
      runId: "pre-fix",
      hypothesisId: "B",
      location: "app.js:error",
      message: "uncaught error",
      data: { message: event.message, filename: event.filename, lineno: event.lineno },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
});
fetch("http://127.0.0.1:7910/ingest/667cc278-1065-4415-9874-10080ea9a1df", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f06cbf" },
  body: JSON.stringify({
    sessionId: "f06cbf",
    runId: "pre-fix",
    hypothesisId: "A",
    location: "app.js:module-load",
    message: "app module loaded",
    data: { protocol: window.location.protocol, href: window.location.href },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

const lengthFormatter = new Intl.NumberFormat("en", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const STORAGE_KEY = "roofRibbonCalculator";

const inputs = {
  a: document.getElementById("sideA"),
  b: document.getElementById("sideB"),
  hWall: document.getElementById("wallHeight"),
  hRise: document.getElementById("roofRise"),
  ribbonCount: document.getElementById("ribbonCount"),
  sagRatio: document.getElementById("sagRatio"),
};

function loadSavedInputs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    for (const [key, input] of Object.entries(inputs)) {
      if (saved[key] != null) {
        input.value = saved[key];
      }
    }
  } catch {
    // Ignore corrupt or unavailable storage.
  }
}

function saveInputs() {
  const data = {};
  for (const [key, input] of Object.entries(inputs)) {
    data[key] = input.value;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota or privacy-mode errors.
  }
}

const sagRatioValue = document.getElementById("sagRatioValue");
const warningBanner = document.getElementById("warningBanner");
const errorBanner = document.getElementById("errorBanner");
const schematic = document.getElementById("schematic");
const tableBody = document.getElementById("ribbonTableBody");

const summaryEls = {
  perimeter: document.getElementById("summaryPerimeter"),
  spacing: document.getElementById("summarySpacing"),
  totalLength: document.getElementById("summaryTotalLength"),
  ribbonCount: document.getElementById("summaryRibbonCount"),
};

function formatMeters(value) {
  return `${lengthFormatter.format(value)} m`;
}

function readInputs() {
  return {
    a: Number(inputs.a.value),
    b: Number(inputs.b.value),
    hWall: Number(inputs.hWall.value),
    hRise: Number(inputs.hRise.value),
    ribbonCount: Number(inputs.ribbonCount.value),
    sagRatio: Number(inputs.sagRatio.value) / 100,
  };
}

function renderTable(ribbons) {
  tableBody.replaceChildren();

  for (const ribbon of ribbons) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="ribbon-index">${ribbon.index}</td>
      <td>${ribbon.sideLabel}</td>
      <td>${formatMeters(ribbon.positionAlongSide)}</td>
      <td>${formatMeters(ribbon.straight)}</td>
      <td>${formatMeters(ribbon.length)}</td>
      <td>${formatMeters(ribbon.distanceToNext)}</td>
    `;
    tableBody.appendChild(row);
  }
}

function renderSummary(result) {
  summaryEls.perimeter.textContent = formatMeters(result.perimeter);
  summaryEls.spacing.textContent = formatMeters(result.spacing);
  summaryEls.totalLength.textContent = formatMeters(result.totalLength);
  summaryEls.ribbonCount.textContent = String(result.ribbonCount);
}

function update() {
  sagRatioValue.textContent = `${inputs.sagRatio.value}%`;
  saveInputs();

  const params = readInputs();
  const errors = validateInputs(params);

  // #region agent log
  fetch("http://127.0.0.1:7910/ingest/667cc278-1065-4415-9874-10080ea9a1df", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f06cbf" },
    body: JSON.stringify({
      sessionId: "f06cbf",
      runId: "pre-fix",
      hypothesisId: "C",
      location: "app.js:update",
      message: "update called",
      data: { params, errors, schematicExists: !!schematic },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (errors.length > 0) {
    errorBanner.textContent = errors.join(" ");
    errorBanner.classList.remove("hidden");
    warningBanner.classList.add("hidden");
    tableBody.replaceChildren();
    schematic.replaceChildren();
    return;
  }

  errorBanner.classList.add("hidden");

  if (params.ribbonCount < 4) {
    warningBanner.textContent =
      "Fewer than 4 ribbons may look sparse around the tent perimeter. Results are still calculated.";
    warningBanner.classList.remove("hidden");
  } else {
    warningBanner.classList.add("hidden");
  }

  const result = calculateRibbons(params);
  renderSummary(result);
  renderTable(result.ribbons);
  try {
    renderSchematic(schematic, result);
    // #region agent log
    const slots = schematic.querySelectorAll(".view-slot");
    const svgs = schematic.querySelectorAll("svg");
    fetch("http://127.0.0.1:7910/ingest/667cc278-1065-4415-9874-10080ea9a1df", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f06cbf" },
      body: JSON.stringify({
        sessionId: "f06cbf",
        runId: "pre-fix",
        hypothesisId: "D",
        location: "app.js:post-render",
        message: "renderSchematic completed",
        data: {
          slotCount: slots.length,
          svgCount: svgs.length,
          slotHeights: Array.from(slots).map((s) => ({
            offsetHeight: s.offsetHeight,
            clientHeight: s.clientHeight,
          })),
          svgViewBoxes: Array.from(svgs).map((s) => s.getAttribute("viewBox")),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  } catch (err) {
    // #region agent log
    fetch("http://127.0.0.1:7910/ingest/667cc278-1065-4415-9874-10080ea9a1df", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f06cbf" },
      body: JSON.stringify({
        sessionId: "f06cbf",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "app.js:renderSchematic-catch",
        message: "renderSchematic threw",
        data: { error: String(err), stack: err?.stack },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw err;
  }
}

for (const input of Object.values(inputs)) {
  input.addEventListener("input", update);
}

loadSavedInputs();
update();

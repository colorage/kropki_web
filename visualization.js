const SVG_NS = "http://www.w3.org/2000/svg";

function createSvg(width, height) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("role", "img");
  return svg;
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function textEl(x, y, content, attrs = {}) {
  const node = el("text", {
    x,
    y,
    "font-size": 11,
    fill: "#5c6578",
    "text-anchor": "middle",
    ...attrs,
  });
  node.textContent = content;
  return node;
}

function sagPath(x1, y1, x2, y2, sag) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function fitBox(modelWidth, modelHeight, padding = 24) {
  return {
    padding,
    width: modelWidth + padding * 2,
    height: modelHeight + padding * 2,
    mapX: (x) => padding + x,
    mapY: (y, maxY) => padding + (maxY - y),
  };
}

function drawTopView(result) {
  const { a, b, ribbons } = result;
  const maxDim = Math.max(a, b);
  const scale = 140 / maxDim;
  const w = a * scale;
  const h = b * scale;
  const box = fitBox(w, h, 28);
  const svg = createSvg(box.width, box.height);
  const group = el("g");
  svg.appendChild(group);

  const mapX = (x) => box.mapX(x * scale);
  const mapY = (y) => box.mapY(y * scale, h);

  group.appendChild(
    el("rect", {
      x: mapX(0),
      y: mapY(b),
      width: w,
      height: h,
      fill: "#f8fafc",
      stroke: "#94a3b8",
      "stroke-width": 1.5,
    })
  );

  if (result.ridgeAlongA) {
    group.appendChild(
      el("line", {
        x1: mapX(0),
        y1: mapY(b / 2),
        x2: mapX(a),
        y2: mapY(b / 2),
        stroke: "#64748b",
        "stroke-width": 1,
        "stroke-dasharray": "5 4",
      })
    );
  } else {
    group.appendChild(
      el("line", {
        x1: mapX(a / 2),
        y1: mapY(0),
        x2: mapX(a / 2),
        y2: mapY(b),
        stroke: "#64748b",
        "stroke-width": 1,
        "stroke-dasharray": "5 4",
      })
    );
  }

  const peakX = mapX(a / 2);
  const peakY = mapY(b / 2);

  for (const ribbon of ribbons) {
    group.appendChild(
      el("line", {
        x1: peakX,
        y1: peakY,
        x2: mapX(ribbon.x),
        y2: mapY(ribbon.y),
        stroke: "#93c5fd",
        "stroke-width": 1,
      })
    );
  }

  const centerX = a / 2;
  const centerY = b / 2;

  for (const ribbon of ribbons) {
    const cx = mapX(ribbon.x);
    const cy = mapY(ribbon.y);

    group.appendChild(
      el("circle", {
        cx,
        cy,
        r: 3,
        fill: "#2563eb",
      })
    );

    const dx = ribbon.x - centerX;
    const dy = ribbon.y - centerY;
    const len = Math.hypot(dx, dy) || 1;
    const labelX = cx + (dx / len) * 10;
    const labelY = cy + (-dy / len) * 10;

    group.appendChild(
      textEl(labelX, labelY, String(ribbon.index), {
        "font-size": 7,
        "font-weight": "bold",
        fill: "#1e40af",
        stroke: "#ffffff",
        "stroke-width": 2,
        "paint-order": "stroke",
      })
    );
  }

  group.appendChild(el("circle", { cx: peakX, cy: peakY, r: 4, fill: "#dc2626" }));

  group.appendChild(textEl((mapX(0) + mapX(a)) / 2, mapY(-0.35), `a = ${result.a} m`));
  group.appendChild(
    textEl(mapX(a) + 18, (mapY(0) + mapY(b)) / 2, `b = ${result.b} m`, {
      "text-anchor": "start",
    })
  );
  group.appendChild(textEl((mapX(0) + mapX(a)) / 2, mapY(b) + 22, "Top view"));

  return svg;
}

function drawFrontElevation(result) {
  const { a, hWall, hRise, ribbons } = result;
  const maxDim = Math.max(a, hWall + hRise);
  const scale = 120 / maxDim;
  const w = a * scale;
  const h = (hWall + hRise) * scale;
  const box = fitBox(w, h, 24);
  const svg = createSvg(box.width, box.height);
  const group = el("g");
  svg.appendChild(group);

  const mapX = (x) => box.mapX(x * scale);
  const mapY = (y) => box.mapY(y * scale, h);

  group.appendChild(
    el("rect", {
      x: mapX(0),
      y: mapY(hWall),
      width: w,
      height: hWall * scale,
      fill: "#e2e8f0",
      stroke: "#94a3b8",
      "stroke-width": 1.5,
    })
  );

  group.appendChild(
    el("polygon", {
      points: [
        `${mapX(0)},${mapY(hWall)}`,
        `${mapX(a / 2)},${mapY(hWall + hRise)}`,
        `${mapX(a)},${mapY(hWall)}`,
      ].join(" "),
      fill: "#cbd5e1",
      stroke: "#94a3b8",
      "stroke-width": 1.5,
    })
  );

  const peakX = mapX(a / 2);
  const peakY = mapY(hWall + hRise);

  const frontRibbons = ribbons.filter((ribbon) => ribbon.side === "front");
  for (const ribbon of frontRibbons) {
    const endX = mapX(ribbon.x);
    const endY = mapY(hWall);
    const visualSag = Math.min(ribbon.sag * scale * 0.35, hWall * scale * 0.25);
    group.appendChild(
      el("path", {
        d: sagPath(peakX, peakY, endX, endY, visualSag),
        fill: "none",
        stroke: "#2563eb",
        "stroke-width": 1.5,
        opacity: 0.85,
      })
    );
    group.appendChild(el("circle", { cx: endX, cy: endY, r: 3, fill: "#2563eb" }));
  }

  group.appendChild(el("circle", { cx: peakX, cy: peakY, r: 4, fill: "#dc2626" }));
  group.appendChild(textEl((mapX(0) + mapX(a)) / 2, mapY(hWall + hRise) - 10, "Front gable"));

  return svg;
}

function drawSideElevation(result) {
  const { b, hWall, hRise, ribbons } = result;
  const maxDim = Math.max(b, hWall + hRise);
  const scale = 120 / maxDim;
  const w = b * scale;
  const h = (hWall + hRise) * scale;
  const box = fitBox(w, h, 24);
  const svg = createSvg(box.width, box.height);
  const group = el("g");
  svg.appendChild(group);

  const mapX = (x) => box.mapX(x * scale);
  const mapY = (y) => box.mapY(y * scale, h);

  group.appendChild(
    el("rect", {
      x: mapX(0),
      y: mapY(hWall),
      width: w,
      height: hWall * scale,
      fill: "#e2e8f0",
      stroke: "#94a3b8",
      "stroke-width": 1.5,
    })
  );

  group.appendChild(
    el("polygon", {
      points: [
        `${mapX(0)},${mapY(hWall)}`,
        `${mapX(b / 2)},${mapY(hWall + hRise)}`,
        `${mapX(b)},${mapY(hWall)}`,
      ].join(" "),
      fill: "#cbd5e1",
      stroke: "#94a3b8",
      "stroke-width": 1.5,
    })
  );

  const peakX = mapX(b / 2);
  const peakY = mapY(hWall + hRise);

  const sideRibbons = ribbons.filter((ribbon) => ribbon.side === "right" || ribbon.side === "left");
  for (const ribbon of sideRibbons) {
    const endX = mapX(ribbon.y);
    const endY = mapY(hWall);
    const visualSag = Math.min(ribbon.sag * scale * 0.35, hWall * scale * 0.25);
    group.appendChild(
      el("path", {
        d: sagPath(peakX, peakY, endX, endY, visualSag),
        fill: "none",
        stroke: "#7c3aed",
        "stroke-width": 1.5,
        opacity: 0.85,
      })
    );
    group.appendChild(el("circle", { cx: endX, cy: endY, r: 3, fill: "#7c3aed" }));
  }

  group.appendChild(el("circle", { cx: peakX, cy: peakY, r: 4, fill: "#dc2626" }));
  group.appendChild(textEl((mapX(0) + mapX(b)) / 2, mapY(hWall + hRise) - 10, "Side elevation"));

  return svg;
}

function renderSchematic(container, result) {
  container.replaceChildren();

  const topSvg = drawTopView(result);
  const frontSvg = drawFrontElevation(result);
  const sideSvg = drawSideElevation(result);

  // #region agent log
  fetch("http://127.0.0.1:7910/ingest/667cc278-1065-4415-9874-10080ea9a1df", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f06cbf" },
    body: JSON.stringify({
      sessionId: "f06cbf",
      runId: "pre-fix",
      hypothesisId: "E",
      location: "visualization.js:renderSchematic",
      message: "SVGs created",
      data: {
        ribbonCount: result.ribbons?.length,
        topViewBox: topSvg.getAttribute("viewBox"),
        frontViewBox: frontSvg.getAttribute("viewBox"),
        sideViewBox: sideSvg.getAttribute("viewBox"),
        topChildCount: topSvg.children.length,
        sampleRibbon: result.ribbons?.[0],
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const topSlot = document.createElement("div");
  topSlot.className = "view-slot";
  topSlot.appendChild(topSvg);

  const frontSlot = document.createElement("div");
  frontSlot.className = "view-slot";
  frontSlot.appendChild(frontSvg);

  const sideSlot = document.createElement("div");
  sideSlot.className = "view-slot";
  sideSlot.appendChild(sideSvg);

  container.append(topSlot, frontSlot, sideSlot);
}

export { renderSchematic };

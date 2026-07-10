const SIDE_LABELS = {
  front: "Front",
  right: "Right",
  back: "Back",
  left: "Left",
};

function perimeterLength(a, b) {
  return 2 * (a + b);
}

function pointOnPerimeter(a, b, t) {
  const P = perimeterLength(a, b);
  t = ((t % P) + P) % P;

  if (t < a) {
    return { x: t, y: 0, side: "front", positionAlongSide: t };
  }
  if (t < a + b) {
    const along = t - a;
    return { x: a, y: along, side: "right", positionAlongSide: along };
  }
  if (t < 2 * a + b) {
    const along = t - (a + b);
    return { x: a - along, y: b, side: "back", positionAlongSide: along };
  }
  const along = t - (2 * a + b);
  return { x: 0, y: b - along, side: "left", positionAlongSide: along };
}

function ridgeAlongA(a, b) {
  return a >= b;
}

function straightSpan(a, b, hRise, x, y) {
  const dx = a / 2 - x;
  const dy = b / 2 - y;
  return Math.hypot(dx, dy, hRise);
}

function ribbonLength(straight, sagRatio) {
  return straight * (1 + (8 / 3) * sagRatio * sagRatio);
}

function wallChordDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

const PERIMETER_EPS = 1e-9;

function perimeterDistanceFromPoint(a, b, x, y) {
  if (Math.abs(y) < PERIMETER_EPS) return Math.max(0, Math.min(a, x));
  if (Math.abs(x - a) < PERIMETER_EPS) return a + Math.max(0, Math.min(b, y));
  if (Math.abs(y - b) < PERIMETER_EPS) {
    return a + b + (a - Math.max(0, Math.min(a, x)));
  }
  return 2 * a + b + (b - Math.max(0, Math.min(b, y)));
}

function pointFromCenterAngle(a, b, angle) {
  const cx = a / 2;
  const cy = b / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let bestT = Infinity;

  if (cos !== 0) {
    for (const edgeX of [0, a]) {
      const t = (edgeX - cx) / cos;
      if (t > 0) {
        const hitY = cy + t * sin;
        if (hitY >= 0 && hitY <= b && t < bestT) {
          bestT = t;
        }
      }
    }
  }

  if (sin !== 0) {
    for (const edgeY of [0, b]) {
      const t = (edgeY - cy) / sin;
      if (t > 0) {
        const hitX = cx + t * cos;
        if (hitX >= 0 && hitX <= a && t < bestT) {
          bestT = t;
        }
      }
    }
  }

  const x = cx + bestT * cos;
  const y = cy + bestT * sin;
  return pointOnPerimeter(a, b, perimeterDistanceFromPoint(a, b, x, y));
}

function calculateRibbonPositions(a, b, ribbonCount, spacingMode) {
  if (spacingMode === "degree") {
    const startAngle = -Math.PI / 2;
    const step = (2 * Math.PI) / ribbonCount;
    const positions = [];

    for (let i = 0; i < ribbonCount; i++) {
      const point = pointFromCenterAngle(a, b, startAngle + i * step);
      positions.push(perimeterDistanceFromPoint(a, b, point.x, point.y));
    }

    return positions;
  }

  const P = perimeterLength(a, b);
  const spacing = P / ribbonCount;
  const start = a / 2;
  const positions = [];

  for (let i = 0; i < ribbonCount; i++) {
    positions.push(start + i * spacing);
  }

  return positions;
}

function calculateRibbons({
  a,
  b,
  hWall,
  hRise,
  ribbonCount,
  sagRatio,
  spacingMode = "distance",
}) {
  const P = perimeterLength(a, b);
  const spacing = spacingMode === "distance" ? P / ribbonCount : null;
  const angularStepDeg = spacingMode === "degree" ? 360 / ribbonCount : null;
  const positions = calculateRibbonPositions(a, b, ribbonCount, spacingMode);
  const ribbons = [];

  for (let i = 0; i < ribbonCount; i++) {
    const t = positions[i];
    const point = pointOnPerimeter(a, b, t);
    const straight = straightSpan(a, b, hRise, point.x, point.y);
    const length = ribbonLength(straight, sagRatio);

    ribbons.push({
      index: i + 1,
      t,
      x: point.x,
      y: point.y,
      side: point.side,
      sideLabel: SIDE_LABELS[point.side],
      positionAlongSide: point.positionAlongSide,
      straight,
      length,
      sag: sagRatio * straight,
    });
  }

  for (let i = 0; i < ribbons.length; i++) {
    const next = ribbons[(i + 1) % ribbons.length];
    ribbons[i].distanceToNext = wallChordDistance(ribbons[i], next);
  }

  const totalLength = ribbons.reduce((sum, ribbon) => sum + ribbon.length, 0);

  return {
    ribbons,
    perimeter: P,
    spacing,
    angularStepDeg,
    spacingMode,
    totalLength,
    ridgeAlongA: ridgeAlongA(a, b),
    peak: { x: a / 2, y: b / 2, z: hWall + hRise },
    hWall,
    hRise,
    a,
    b,
    sagRatio,
    ribbonCount,
  };
}

function validateInputs({ a, b, hWall, hRise, ribbonCount }) {
  const errors = [];

  if (!(a > 0)) errors.push("Side a must be greater than 0.");
  if (!(b > 0)) errors.push("Side b must be greater than 0.");
  if (!(hWall > 0)) errors.push("Wall height must be greater than 0.");
  if (!(hRise > 0)) errors.push("Roof rise must be greater than 0.");
  if (!Number.isInteger(ribbonCount) || ribbonCount < 1) {
    errors.push("Ribbon count must be a positive whole number.");
  }

  return errors;
}

export {
  SIDE_LABELS,
  calculateRibbonPositions,
  calculateRibbons,
  perimeterDistanceFromPoint,
  perimeterLength,
  pointFromCenterAngle,
  pointOnPerimeter,
  ridgeAlongA,
  ribbonLength,
  straightSpan,
  validateInputs,
  wallChordDistance,
};

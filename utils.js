function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

function formatNumber(n, digits = 1) {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(digits) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(digits) + "k";
  if (abs >= 10) return n.toFixed(0);
  return n.toFixed(digits);
}

function getIntersection(a, b, c, d) {
  const tTop = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const uTop = (c.y - a.y) * (a.x - b.x) - (c.x - a.x) * (a.y - b.y);
  const bottom = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y);
  if (bottom !== 0) {
    const t = tTop / bottom;
    const u = uTop / bottom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        offset: t,
      };
    }
  }
  return null;
}

function polysIntersect(poly1, poly2) {
  for (let i = 0; i < poly1.length; i++) {
    for (let j = 0; j < poly2.length; j++) {
      const touch = getIntersection(
        poly1[i],
        poly1[(i + 1) % poly1.length],
        poly2[j],
        poly2[(j + 1) % poly2.length]
      );
      if (touch) return true;
    }
  }
  return false;
}

function getRGBA(value) {
  const v = clamp(value, -1, 1);
  const alpha = Math.abs(v);
  const R = v < 0 ? 0 : 255;
  const G = R;
  const B = v > 0 ? 0 : 255;
  return `rgba(${R},${G},${B},${alpha})`;
}

function readCssVar(name, fallback = "#888") {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

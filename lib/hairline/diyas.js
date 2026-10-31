/**
 * Diyas: five clay lamps on a wooden ledge, one lit. The lamp under the pointer
 * lifts and takes the flame; its neighbours part, staggered outwards from it.
 * Every lamp is a shallow bowl tapering to a small foot, with a pinched spout
 * where the wick sits, and each spout turns its own way as hand-made lamps do.
 * Kanha's empty state for memory: the lamps are there, nothing is in them yet.
 * The slider is the parting gap, in world units.
 */
const {
  Cam, circ, clamp, facing, fillet, fit, hull, open, poly, proj, ringAt, rings, prism, run,
  tdone, tset, tval, tween, disposer, mk, place, pointer, register, rad,
} = HL;

const N = 5, G = 36, R = 11, FOOT = 5, H = 9.5, B = 1.4, LIFT = 13, LIT_REST = 1;
const SPOUT = [-8, 14, -3, 22, 4];            // each lamp's spout, degrees from +x+y (towards the viewer)
const SIZE = [0.96, 1.04, 0.92, 1, 0.98];     // made by hand: no two the same
const PX0 = -20, PX1 = (N - 1) * G + 20, PY0 = -16, PY1 = 16, PZ = -5;

/** A bowl's rim: a circle pulled out to a pinched spout at angle `a`, scaled by `k`, centred on (cx, cy). */
function rim(cx, cy, a, k, inset) {
  const dir = rad(45 + a);
  return circ(1, 64).map((s) => {
    const t = Math.atan2(s.v, s.u) - dir;
    const pull = Math.pow(Math.max(0, Math.cos(t)), 14) * 0.9;
    const r = (R * k - inset) * (1 + pull);
    return { u: cx + s.u * r, v: cy + s.v * r, nu: s.u, nv: s.v };
  });
}

/** The point of lamp i's spout, on its rim at height z. */
function spoutTip(cx, cy, a, k, z) {
  const dir = rad(45 + a), r = R * k * 1.82;
  return [cx + Math.cos(dir) * r, cy + Math.sin(dir) * r, z];
}

/** A flame standing on the wick, in screen units: a teardrop, rounded everywhere but its tip. */
function flame([x, y], h) {
  const w = h * 0.34;
  return poly(fillet([[x, y - h], [x + w, y - h * 0.34], [x, y], [x - w, y - h * 0.34]], [0.6, w * 0.9, w * 0.7, w * 0.9]));
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let gap = value;

  // Fitted to the most extreme pose: an end lamp lifted and the row parted at full gap.
  const C = Cam(45, 0.5, 2.0);
  fit(C, [[PX0 - 14, PY0, PZ], [PX1 + 14, PY1, PZ], [PX0 - 14, PY1, PZ], [PX1 + 14, PY0, 0], [0, 0, H + LIFT + 22], [(N - 1) * G, 0, H + LIFT + 22]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  // the ledge: one thin plank, a silhouette and its crease
  const [plank, plankIn] = rings(PX0, PY0, PX1, PY1, 6, 1.6);
  const ledge = prism(P, front, plank, plankIn, PZ, 0);
  mk("path", { d: ledge.sil, class: "sil" }, g);
  mk("path", { d: ledge.crease, class: "nf lo" }, g);

  const lamps = [];
  for (let i = 0; i < N; i++) {
    const grp = mk("g", {}, g);
    const body = mk("path", { class: "sil" }, grp);
    const mouth = mk("path", { class: "nf" }, grp);
    const crease = mk("path", { class: "nf lo" }, grp);
    const wick = mk("circle", { r: 1.25, class: "dot off" }, grp);
    const fire = mk("path", { class: "nf hi" }, grp);
    lamps.push({ body, mouth, crease, wick, fire, z: tween(0), dx: tween(0), f: tween(i === LIT_REST ? 1 : 0) });
  }

  function draw(i, now) {
    const L = lamps[i], z = tval(L.z, now), cx = i * G + tval(L.dx, now), f = tval(L.f, now);
    const a = SPOUT[i], k = SIZE[i];
    const top = rim(cx, 0, a, k, 0), inner = rim(cx, 0, a, k, B), foot = circ(FOOT * k, 32).map((s) => ({ ...s, u: s.u + cx }));
    L.body.setAttribute("d", poly(hull(ringAt(P, foot, z).concat(ringAt(P, top, z + H)))));
    L.mouth.setAttribute("d", poly(ringAt(P, inner, z + H)));
    L.crease.setAttribute("d", open(ringAt(P, run(top, front), z + H - 1.4)));
    const w = P(...spoutTip(cx, 0, a, k, z + H + 0.6));
    place(L.wick, w);
    L.fire.setAttribute("d", f > 0.02 ? flame(w, 4 + 15 * f) : "");
  }

  const B2 = register(stage, (_dt, now) => {
    let moving = false;
    lamps.forEach((L, i) => { draw(i, now); if (!tdone(L.z, now) || !tdone(L.dx, now) || !tdone(L.f, now)) moving = true; });
    return moving;
  });
  bag.add(B2.unregister);

  // Hit test on the RESTING lamps: the nearest rest centre on screen, within reach. Never the pose on screen.
  const restC = lamps.map((_, i) => P(i * G, 0, H / 2));
  function hit([x, y]) {
    let best = -1, bd = 34;
    restC.forEach(([sx, sy], i) => { const d = Math.hypot(x - sx, (y - sy) * 1.3); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  let act = -1;
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    const lit = a >= 0 ? a : LIT_REST;
    lamps.forEach((L, i) => {
      const delay = Math.abs(i - from) * 45;
      const push = a < 0 || i === a ? 0 : clamp(Math.sign(i - a) * gap * (1.2 - Math.abs(i - a) * 0.2), -gap * 1.2, gap * 1.2);
      tset(L.z, i === a ? LIFT : 0, now, delay);
      tset(L.dx, push, now, delay);
      tset(L.f, i === lit ? 1 : 0, now, i === lit ? delay : 0);
      L.body.classList.toggle("hi", i === lit);
      L.wick.setAttribute("class", "dot" + (i === lit ? "" : " off"));
    });
    read.textContent = a < 0 ? "rest" : `diya ${a + 1} · 0`;
    B2.wake();
  }

  setActive(-1);
  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { gap = v; },
    destroy: bag.dispose,
  };
}

hairline({
  name: "diyas",
  means: "Five clay lamps on a ledge: the one under the pointer lifts and takes the flame, and its neighbours make room.",
  rules: [1, 2, 4, 5],
  range: [0, 6, 12],
  tour: [[130, 128], [205, 168], [282, 212], null],
  mount,
});

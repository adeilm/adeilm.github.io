// LoRA in 3D, for the "### LoRA" section of the fine-tuning guide.
// Notation from Hu et al., 2021 (https://arxiv.org/abs/2106.09685): the pretrained weight W (d × k) stays
// frozen; LoRA trains B (d × r) and A (r × k), with r much smaller than d and k, and B·A is added to W.
// One tile is one cell of a matrix. The sizes are schematic, not to scale.
// three.js comes from the import map next to the figure in the post.

const D = 24; // d: rows of W and of B
const K = 30; // k: columns of W and of A
const R_MAX = 4; // largest rank on the buttons; sizes the buffers and the camera fit
const OP_GAP = 5; // room for the "+" and "×" signs, in cells
const ROW_GAP = 6; // narrow screens: room between W and the B × A row
const DEPTH = 0.8; // slab thickness
const TILE = 0.16; // how far each cell's tile stands out of the slab
const CELL = 0.84; // tile size; the rest of each cell is the gap
const LABEL_TOP = 4.5; // room for the labels above and below the matrices, in cells
const LABEL_BOTTOM = 2.5; // wide layout only: on narrow panels nothing sits below B
const SWAY = 0.3; // auto-rotation: ± radians around the vertical axis
const PERIOD = 18; // seconds per back-and-forth
const STILL_YAW = -0.28; // reduced motion: one fixed three-quarter view

const figure = document.querySelector('.post-3d');
const stage = figure && figure.querySelector('.post-3d__stage');

if (stage && 'IntersectionObserver' in window) {
  let view = null;
  let near = false;
  let starting = false;
  // build the scene only when the figure gets close, and only render while it is on screen
  new IntersectionObserver(
    (entries) => {
      near = entries[entries.length - 1].isIntersecting;
      if (view) view.setVisible(near);
      else if (near && !starting) {
        starting = true;
        start().then((v) => {
          view = v;
          if (view) view.setVisible(near);
        });
      }
    },
    { rootMargin: '200px 0px' },
  ).observe(stage);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

async function start() {
  if (!hasWebGL()) return null; // the fallback text stays
  try {
    // variables, so the dev server leaves these to the browser's import map
    const core = 'three';
    const orbit = 'three/addons/controls/OrbitControls.js';
    const [THREE, { OrbitControls }] = await Promise.all([
      import(/* @vite-ignore */ core),
      import(/* @vite-ignore */ orbit),
    ]);
    return build(THREE, OrbitControls);
  } catch (err) {
    console.warn('LoRA figure: 3D view unavailable, showing the text version.', err);
    return null;
  }
}

// small seeded random, so the cell shading is the same on every load
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(THREE, OrbitControls) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0); // transparent: the panel's var(--surface) shows through
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(18, 16 / 10, 1, 3000); // narrow lens: little keystone
  camera.position.setFromSphericalCoords(1, Math.PI / 2 - 0.26, 0); // a little above, to show the slabs' depth

  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false; // the mouse wheel keeps scrolling the page
  controls.enablePan = false;
  controls.rotateSpeed = 0.5;
  controls.minAzimuthAngle = -0.55; // enough to see the slabs' depth, not enough to lose the equation
  controls.maxAzimuthAngle = 0.55;
  controls.minPolarAngle = Math.PI / 2 - 0.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.15;
  canvas.style.touchAction = 'pan-y'; // phones: vertical swipes scroll the page, sideways drags rotate

  // Each matrix is a solid slab with one raised tile per cell on its front. Everything is unlit with a fixed
  // shade per face, so the tiles' front faces show the exact theme color and the sides read as depth.
  const shaded = (w, h, dz) => {
    const g = new THREE.BoxGeometry(w, h, dz);
    const shade = [0.8, 0.72, 1.1, 0.6, 1, 0.85]; // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const c = [];
    for (const s of shade) for (let v = 0; v < 4; v++) c.push(s, s, s);
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    return g;
  };
  const slabGeo = shaded(1, 1, DEPTH); // scaled to each matrix's size
  const tileGeo = shaded(CELL, CELL, TILE);
  const tileMat = new THREE.MeshBasicMaterial({ vertexColors: true });

  const matrix = (max, seed) => {
    const slab = new THREE.Mesh(slabGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, max);
    tiles.frustumCulled = false; // tiles move when the rank or the layout changes
    const rnd = random(seed);
    tiles.userData.jitter = Array.from({ length: max }, () => rnd());
    group.add(slab, tiles);
    return { slab, tiles };
  };
  const W = matrix(D * K, 7);
  const B = matrix(D * R_MAX, 11);
  const A = matrix(R_MAX * K, 13);

  const tint = ({ slab, tiles }, base, spread) => {
    slab.material.color.copy(base).multiplyScalar(0.5); // the gaps between tiles read as grid lines
    const c = new THREE.Color();
    tiles.userData.jitter.forEach((j, i) => tiles.setColorAt(i, c.copy(base).multiplyScalar(1 - spread + 2 * spread * j)));
    tiles.instanceColor.needsUpdate = true;
  };
  function paint() {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const accent = new THREE.Color(v('--accent', '#e0b84a'));
    const frozen = new THREE.Color(v('--line', '#263044')).lerp(new THREE.Color(v('--dim', '#9aa4b2')), 0.3);
    tint(W, frozen, 0.08);
    tint(B, accent, 0.08);
    tint(A, accent, 0.08);
  }
  paint();
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const m4 = new THREE.Matrix4();
  function place({ slab, tiles }, rows, cols, at) {
    slab.scale.set(cols, rows, 1);
    slab.position.set(at.x, at.y, 0);
    let i = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        m4.makeTranslation(at.x + col - (cols - 1) / 2, at.y + (rows - 1) / 2 - row, (DEPTH + TILE) / 2);
        tiles.setMatrixAt(i++, m4);
      }
    }
    tiles.count = rows * cols;
    tiles.instanceMatrix.needsUpdate = true;
  }

  // HTML labels pinned to points of the scene
  const labels = {};
  for (const el of stage.querySelectorAll('[data-label]')) labels[el.dataset.label] = { el, at: new THREE.Vector3() };

  const ranks = figure.querySelector('.post-3d__ranks');
  let rank = Number(ranks?.querySelector('[aria-pressed="true"]')?.dataset.rank) || 2;
  let narrow = false;

  // wide panels: W + B × A in one row; narrow panels: W on top, B × A below
  function layout() {
    let w, b, a, plus, times;
    if (!narrow) {
      let x = -(K + OP_GAP + rank + OP_GAP + K) / 2;
      w = { x: x + K / 2, y: 0 };
      x += K;
      plus = { x: x + OP_GAP / 2, y: 0 };
      x += OP_GAP;
      b = { x: x + rank / 2, y: 0 };
      x += rank;
      times = { x: x + OP_GAP / 2, y: 0 };
      x += OP_GAP;
      a = { x: x + K / 2, y: 0 };
    } else {
      const rowWidth = rank + OP_GAP + K;
      const y = ROW_GAP / 2 + D / 2;
      w = { x: 0, y };
      plus = { x: 0, y: 0 };
      b = { x: -rowWidth / 2 + rank / 2, y: -y };
      times = { x: -rowWidth / 2 + rank + OP_GAP / 2, y: -y };
      a = { x: rowWidth / 2 - K / 2, y: -y };
    }
    place(W, D, K, w);
    place(B, D, rank, b);
    place(A, rank, K, a);
    const pin = (name, x, y) => labels[name]?.at.set(x, y, DEPTH / 2); // on the front face
    pin('w', w.x, w.y + D / 2 + 0.8);
    pin('b', b.x, b.y + D / 2 + 0.8);
    pin('a', a.x, a.y + rank / 2 + 0.8);
    pin('plus', plus.x, plus.y);
    pin('times', times.x, times.y);
    pin('rank', a.x, a.y - rank / 2 - 0.8);
  }

  // camera distance that fits the matrices and their labels, keeping the reader's current angle
  function fit() {
    const width = narrow ? R_MAX + OP_GAP + K : 2 * K + 2 * OP_GAP + R_MAX;
    const below = narrow ? 1 : LABEL_BOTTOM;
    const height = (narrow ? 2 * D + ROW_GAP : D) + LABEL_TOP + below;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(height / 2 / t, width / 2 / (t * camera.aspect)) * 1.1 + DEPTH;
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.set(0, (LABEL_TOP - below) / 2, 0);
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    controls.update();
  }

  let size = { w: 1, h: 1 };
  const p = new THREE.Vector3();
  const front = new THREE.Vector3();
  const toCamera = new THREE.Vector3();
  let alpha = '';
  function placeLabels() {
    // seen from a steep angle the labels would sit on the slabs, so they fade out and come back when it turns back
    front.set(0, 0, 1).applyQuaternion(group.quaternion);
    toCamera.copy(camera.position).sub(controls.target).normalize();
    const a = THREE.MathUtils.smoothstep(front.dot(toCamera), 0.72, 0.88).toFixed(2);
    if (a !== alpha) stage.style.setProperty('--label-alpha', (alpha = a));
    for (const { el, at } of Object.values(labels)) {
      p.copy(at).applyMatrix4(group.matrixWorld).project(camera);
      const x = Math.round(((p.x + 1) / 2) * size.w);
      const y = Math.round(((1 - p.y) / 2) * size.h);
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let time = -PERIOD / 8; // start already turned a little
  let holding = false;
  let resumeAt = 0;
  controls.addEventListener('start', () => (holding = true));
  controls.addEventListener('end', () => {
    holding = false;
    resumeAt = performance.now() + 2500;
  });

  function draw() {
    group.rotation.y = reduce.matches ? STILL_YAW : SWAY * Math.sin((time / PERIOD) * Math.PI * 2);
    controls.enableDamping = !reduce.matches;
    controls.update();
    group.updateMatrixWorld();
    renderer.render(scene, camera);
    placeLabels();
  }

  let raf = 0;
  let last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (!reduce.matches && !holding && now >= resumeAt) time += dt;
    draw();
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    narrow = camera.aspect < 1;
    layout();
    fit();
    draw();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  if (ranks) {
    ranks.hidden = false;
    ranks.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-rank]');
      if (!btn) return;
      rank = Number(btn.dataset.rank);
      for (const b of ranks.querySelectorAll('button[data-rank]')) b.setAttribute('aria-pressed', String(b === btn));
      layout();
      draw();
    });
  }

  figure.classList.add('is-live');

  return {
    setVisible(on) {
      if (on && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}

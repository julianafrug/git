import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';

// ------------------------------------------------------------
// Básico
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const isTouch = matchMedia('(hover: none)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 600);
camera.rotation.order = 'YXZ';

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.18);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
const gltfLoader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(-10, -10);

const EYE = 1.7;
const WALK_SPEED = 5.5;

// ------------------------------------------------------------
// Helpers visuais
// ------------------------------------------------------------
function neon(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}

const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0c0a1c, metalness: 0.9, roughness: 0.32 });

function textCanvas(lines, { color = '#00f0ff', w = 1024, h = 256, bg = null, border = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (bg) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // scanlines
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
  }
  if (border) {
    ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.shadowColor = color; ctx.shadowBlur = 24;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    // cantos
    ctx.lineWidth = 16;
    const k = 60;
    [[12, 12, 1, 1], [w - 12, 12, -1, 1], [12, h - 12, 1, -1], [w - 12, h - 12, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x + sx * k, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * k); ctx.stroke();
    });
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  lines.forEach((l) => {
    ctx.font = `${l.weight || 700} ${l.size}px ${l.font || 'Orbitron, sans-serif'}`;
    ctx.fillStyle = l.color || color;
    ctx.shadowBlur = l.glow ?? 20;
    ctx.fillText(l.text, w / 2, l.y * h);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function labelPlane(lines, width, opts = {}) {
  const w = opts.w || 1024, h = opts.h || 256;
  const tex = textCanvas(lines, { ...opts, w, h });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, width * (h / w)), mat);
}

// Chão quadriculado neon
function gridFloor(color, size = 220, cell = 2) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uCell: { value: cell } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform float uCell;
      varying vec3 vWorld;
      void main() {
        vec2 g = vWorld.xz / uCell;
        vec2 grid = abs(fract(g - 0.5) - 0.5) / fwidth(g);
        float line = 1.0 - min(min(grid.x, grid.y), 1.0);
        float d = length(vWorld.xz);
        float fade = exp(-d * 0.035);
        float pulse = 0.55 + 0.45 * sin(d * 0.45 - uTime * 1.8);
        vec3 base = vec3(0.012, 0.004, 0.035) + uColor * 0.04 * exp(-d * 0.08);
        vec3 col = base + uColor * line * fade * pulse * 1.1;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.userData.isFloor = true;
  return m;
}

const dotTexture = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

function starField(count = 2500, radius = 220, colors = [0xffffff, 0x9fdcff, 0xffb8f0]) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const r = radius * (0.7 + Math.random() * 0.3);
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(th), Math.abs(r * u) * 0.9 + 5, r * s * Math.sin(th)], i * 3);
    c.set(colors[i % colors.length]).multiplyScalar(0.5 + Math.random() * 0.8);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, map: dotTexture, vertexColors: true, sizeAttenuation: true, toneMapped: false, transparent: true, depthWrite: false }));
}

function dustParticles(count = 400, spread = 30, color = 0x9fe9ff) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * spread, Math.random() * 10, (Math.random() - 0.5) * spread], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: dotTexture, color, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
  p.userData.update = (dt, t) => {
    const a = g.attributes.position.array;
    for (let i = 0; i < count; i++) {
      a[i * 3 + 1] += dt * (0.2 + (i % 7) * 0.05);
      a[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.1;
      if (a[i * 3 + 1] > 10) a[i * 3 + 1] = 0;
    }
    g.attributes.position.needsUpdate = true;
  };
  return p;
}

// ------------------------------------------------------------
// Porta branca (abre quando você chega perto)
// ------------------------------------------------------------
const lightVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const lightFragment = /* glsl */ `
  uniform float uTime; uniform vec3 uColor; uniform float uOpen;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5; p.y *= 1.8;
    float r = length(p);
    float glow = smoothstep(0.95, 0.0, r);
    float shimmer = sin(p.y * 26.0 - uTime * 1.6 + sin(p.x * 9.0 + uTime) * 1.5) * 0.5 + 0.5;
    vec3 col = mix(uColor, vec3(1.0), glow * glow);
    col *= 0.55 + 0.65 * glow;
    col += uColor * shimmer * 0.08;
    gl_FragColor = vec4(col * (0.75 + 0.45 * uOpen), 1.0);
  }`;

const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.25 });

function makeWhiteDoor({ label = '', color = '#f7f3ef', glow = '#ffd0e6' } = {}) {
  const group = new THREE.Group();
  const W = 1.7, H = 3.1, T = 0.12;
  const white = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.82), roughness: 0.42, metalness: 0.02 });

  // Batente / moldura
  const caseL = new THREE.Mesh(new THREE.BoxGeometry(0.2, H + 0.2, 0.26), white);
  caseL.position.set(-W / 2 - 0.1, (H + 0.2) / 2, 0);
  const caseR = caseL.clone(); caseR.position.x *= -1;
  const head = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.24, 0.3), white);
  head.position.y = H + 0.2;
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.08, 0.36), white);
  cornice.position.y = H + 0.36;
  group.add(caseL, caseR, head, cornice);

  // Luz do outro lado
  const lightMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(glow) }, uOpen: { value: 0 } },
    vertexShader: lightVertex, fragmentShader: lightFragment, side: THREE.DoubleSide,
  });
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(W, H), lightMat);
  portal.position.set(0, H / 2, -0.06);
  group.add(portal);

  // Folha da porta, presa na dobradiça da esquerda
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, 0, 0);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, H - 0.02, T), white);
  leaf.position.set(W / 2, H / 2, 0);
  hinge.add(leaf);
  // almofadas (relevo clássico) dos dois lados
  const panelSpec = [[W * 0.66, H * 0.42, H * 0.68], [W * 0.66, H * 0.3, H * 0.24]];
  [1, -1].forEach((side) => {
    panelSpec.forEach(([pw, ph, py]) => {
      const outer = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.025), white);
      outer.position.set(W / 2, py, side * (T / 2 + 0.012));
      const inner = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.14, ph - 0.14, 0.03), white);
      inner.position.set(W / 2, py, side * (T / 2 + 0.03));
      hinge.add(outer, inner);
    });
    // maçaneta
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 24), goldMat);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(W - 0.17, H * 0.47, side * (T / 2 + 0.01));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), goldMat);
    knob.position.set(W - 0.17, H * 0.47, side * (T / 2 + 0.07));
    hinge.add(rose, knob);
  });
  // plaquinha dourada com o nome
  if (label) {
    const tex = textCanvas([{ text: label, size: 64, y: 0.54, color: '#4a2a08', glow: 0, font: 'Orbitron, sans-serif' }], {
      w: 512, h: 128, bg: ['#f2d48a', '#b98d34'],
    });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.195), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.35 }));
    plaque.position.set(W / 2, H * 0.93, T / 2 + 0.006);
    hinge.add(plaque);
  }
  group.add(hinge);

  const light = new THREE.PointLight(new THREE.Color(glow), 0, 9, 1.4);
  light.position.set(0, 1.7, 1.2);
  group.add(light);

  const door = {
    group, portal, label, white: true,
    clickTargets: [leaf, portal, caseL, caseR, head],
    normal: new THREE.Vector3(), tangent: new THREE.Vector3(), worldPos: new THREE.Vector3(),
    halfWidth: W / 2, open: 0, forceOpen: false, creaked: false, hover: 0,
    canEnter() { return this.open > 0.55; },
    computeFrame() {
      group.updateMatrixWorld(true);
      group.getWorldPosition(this.worldPos);
      this.normal.set(0, 0, 1).applyQuaternion(group.quaternion).setY(0).normalize();
      this.tangent.set(1, 0, 0).applyQuaternion(group.quaternion).setY(0).normalize();
    },
    update(dt, t, hovered, playerPos) {
      this.hover += ((hovered ? 1 : 0) - this.hover) * Math.min(1, dt * 8);
      let near = false;
      if (playerPos) {
        const dx = playerPos.x - this.worldPos.x, dz = playerPos.z - this.worldPos.z;
        const along = dx * this.normal.x + dz * this.normal.z;
        const lat = Math.abs(dx * this.tangent.x + dz * this.tangent.z);
        near = along > -0.5 && along < 4.2 && lat < 2.6;
      }
      const target = near || this.forceOpen ? 1 : this.hover * 0.1;
      this.open += (target - this.open) * Math.min(1, dt * (target > this.open ? 1.8 : 1.2));
      if (this.open > 0.15 && !this.creaked) { this.creaked = true; sfx.door(); }
      if (this.open < 0.05) this.creaked = false;
      // abre para fora (em direção a quem chega), com uma curvinha suave
      hinge.rotation.y = -Math.sin(this.open * Math.PI / 2) * 1.7;
      lightMat.uniforms.uTime.value = t;
      lightMat.uniforms.uOpen.value = this.open;
      light.intensity = this.open * 4 + this.hover * 1.5;
      white.emissive.setRGB(1, 0.85, 0.92).multiplyScalar(this.hover * 0.08);
    },
  };
  return door;
}

// ------------------------------------------------------------
// Modelos do Blender (.glb / .gltf)
// ------------------------------------------------------------
function loadModels(world, list = []) {
  list.forEach((m) => {
    if (!m || !m.url) return;
    gltfLoader.load(
      m.url,
      (gltf) => {
        const obj = gltf.scene;
        const [x = 0, y = 0, z = 0] = m.position || [];
        obj.position.set(x, y, z);
        obj.scale.setScalar(m.scale ?? 1);
        obj.rotation.y = m.rotationY ?? 0;
        world.scene.add(obj);
        if (gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(obj);
          gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
          world.mixers.push(mixer);
        }
      },
      undefined,
      (err) => console.warn(`[mundo] não consegui carregar ${m.url}`, err)
    );
  });
}

// ------------------------------------------------------------
// Mundo genérico
// ------------------------------------------------------------
const NEON_RENDER = { toneMapping: THREE.NoToneMapping, exposure: 1, bloom: [0.85, 0.55, 0.18] };

function createWorld({ name, fogColor = 0x05010f, fogDensity = 0.022, bg = 0x05010f, radius = 18, lights = true, render = NEON_RENDER }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.FogExp2(fogColor, fogDensity);
  if (lights) {
    scene.add(new THREE.HemisphereLight(0x6a7dff, 0x14031e, 0.7));
    scene.add(new THREE.AmbientLight(0x404060, 0.6));
  }
  return {
    name, scene, radius, render,
    center: new THREE.Vector3(),
    doors: [],
    clickables: [], // { object, label, onClick }
    updaters: [],
    mixers: [],
    colliders: [], // { x, z, r }
    spawn: { pos: new THREE.Vector3(0, EYE, 0), yaw: 0 },
    floors: [],
    addUpdater(fn) { this.updaters.push(fn); },
    addFloor(mesh) { this.floors.push(mesh); this.scene.add(mesh); },
    addDoor(door, onEnter) {
      door.onEnter = onEnter;
      this.scene.add(door.group);
      door.computeFrame();
      this.doors.push(door);
      door.clickTargets.forEach((o) => this.clickables.push({ object: o, label: door.label ? `ENTRAR · ${door.label}` : 'ENTRAR', onClick: () => walkThroughDoor(door) }));
    },
  };
}

// ------------------------------------------------------------
// Corredor de entrada: carpete vermelho, cortinas rosa, porta branca
// ------------------------------------------------------------
function carpetTexture(hex) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 34;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n * 0.25));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.25));
  }
  ctx.putImageData(img, 0, 0);
  // fibras
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S, y = Math.random() * S, a = Math.random() * Math.PI, l = 2 + Math.random() * 4;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,90,100,0.07)' : 'rgba(30,0,4,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function curtain(width, height, color, animate = true) {
  const segX = Math.max(24, Math.round(width * (isTouch ? 10 : 16)));
  const geo = new THREE.PlaneGeometry(width, height, segX, 10);
  const base = geo.attributes.position.array.slice();
  const seed = Math.random() * 10;
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.72, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color('#ffd6ea'), side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const shape = (t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i] + seed, y = base[i + 1];
      const hang = (height / 2 - y) / height; // 0 em cima, 1 embaixo
      p[i + 2] = Math.sin(x * 7.0) * 0.085 + Math.sin(x * 2.7 + 1.3) * 0.05 + Math.sin(x * 3.3 + t * 0.6 + y * 0.35) * 0.03 * hang;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  shape(0);
  let acc = 0;
  mesh.userData.update = animate && !isTouch ? (dt, t) => { acc += dt; if (acc > 1 / 30) { acc = 0; shape(t); } } : () => {};
  return mesh;
}

function buildCorridor() {
  const cfg = CONFIG.corridor || {};
  const L = cfg.length || 30;
  const HW = 2.4; // meia largura (até a cortina)
  const H = 4.4;
  const zEnd = -L / 2, zStart = L / 2;

  const w = createWorld({
    name: 'CORREDOR', bg: 0x120307, fogColor: 0x1a0509, fogDensity: 0.028, lights: false,
    render: { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.05, bloom: [0.4, 0.5, 0.92] },
  });
  const s = w.scene;
  s.add(new THREE.AmbientLight(0xffd6e0, 0.35));
  s.add(new THREE.HemisphereLight(0xffc4dc, 0x3a0008, 0.45));

  // Carpete
  const ctex = carpetTexture(cfg.carpet || '#8a0c16');
  ctex.repeat.set((HW * 2 + 1) / 2, (L + 2) / 2);
  const carpet = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 2 + 1, L + 2),
    new THREE.MeshStandardMaterial({ map: ctex, bumpMap: ctex, bumpScale: 1.2, roughness: 0.95, metalness: 0 })
  );
  carpet.rotation.x = -Math.PI / 2;
  carpet.userData.isFloor = true;
  w.addFloor(carpet);

  // Cortinas
  const cc = cfg.curtain || '#f27aae';
  const left = curtain(L + 1.6, H + 0.1, cc); left.position.set(-HW, H / 2 - 0.05, 0); left.rotation.y = Math.PI / 2;
  const right = curtain(L + 1.6, H + 0.1, cc); right.position.set(HW, H / 2 - 0.05, 0); right.rotation.y = -Math.PI / 2;
  const end = curtain(HW * 2 + 0.6, H + 0.1, cc); end.position.set(0, H / 2 - 0.05, zEnd - 0.4);
  const back = curtain(HW * 2 + 0.6, H + 0.1, cc); back.position.set(0, H / 2 - 0.05, zStart + 0.4); back.rotation.y = Math.PI;
  [left, right, end, back].forEach((m) => { s.add(m); w.addUpdater(m.userData.update); });

  // Teto e trilho das cortinas
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 0.4, L + 1.4), new THREE.MeshStandardMaterial({ color: 0x3a0d18, roughness: 0.9 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H;
  s.add(ceiling);
  [-HW + 0.12, HW - 0.12].forEach((x) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, L + 1), goldMat);
    rail.position.set(x, H - 0.08, 0);
    s.add(rail);
  });

  // Luminárias pendentes
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1e0 });
  const lampCount = Math.max(3, Math.round(L / 7));
  for (let i = 0; i < lampCount; i++) {
    const z = zStart - 3 - (i * (L - 5)) / (lampCount - 1);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 6), goldMat);
    cord.position.set(0, H - 0.4, z);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.28, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide }));
    shade.position.set(0, H - 0.9, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), lampMat);
    bulb.position.set(0, H - 1.0, z);
    const pl = new THREE.PointLight(0xffd9b8, 9, 9, 1.6);
    pl.position.set(0, H - 1.1, z);
    s.add(cord, shade, bulb, pl);
  }

  // Poeirinha dourada no ar
  const dust = dustParticles(260, HW * 1.6, 0xffe2c4);
  dust.scale.set(1, H / 10, (L / (HW * 1.6)));
  dust.material.size = 0.04; dust.material.opacity = 0.55;
  s.add(dust);
  w.addUpdater(dust.userData.update);

  // Portas: a primeira no fim do corredor, as outras nas laterais
  CONFIG.rooms.forEach((room, i) => {
    const door = makeWhiteDoor({ label: room.door, color: cfg.door || '#f7f3ef', glow: '#ffd0e6' });
    if (i === 0) {
      door.group.position.set(0, 0, zEnd + 0.15);
    } else {
      const side = i % 2 ? -1 : 1;
      const row = Math.floor((i - 1) / 2);
      door.group.position.set(side * (HW - 0.32), 0, zStart - 7 - row * 7);
      door.group.rotation.y = side * -Math.PI / 2;
    }
    door.roomIndex = i;
    w.addDoor(door, () => goToRoom(i));
    // spot de luz em cima da porta
    const spot = new THREE.SpotLight(0xfff0f6, 6, 9, 0.5, 0.8, 1.6);
    spot.position.copy(door.worldPos).addScaledVector(door.normal, 2.4).setY(H - 0.1);
    spot.target.position.copy(door.worldPos).setY(1.4);
    s.add(spot, spot.target);
  });

  // Limites: dentro do corredor, exceto pela abertura de uma porta aberta
  const v = new THREE.Vector3();
  w.clamp = (p) => {
    for (const d of w.doors) {
      v.subVectors(p, d.worldPos).setY(0);
      const along = v.dot(d.normal), lat = Math.abs(v.dot(d.tangent));
      if (d.canEnter() && lat < d.halfWidth - 0.2 && along < 0.8 && along > -1.5) return;
    }
    p.x = THREE.MathUtils.clamp(p.x, -HW + 0.5, HW - 0.5);
    p.z = THREE.MathUtils.clamp(p.z, zEnd + 0.7, zStart - 0.5);
  };

  w.spawn = { pos: new THREE.Vector3(0, EYE, zStart - 2), yaw: 0 };
  w.intro = (t) => {
    camera.position.set(Math.sin(t * 0.25) * 0.5, 1.75 + Math.sin(t * 0.4) * 0.05, zStart - 2 - Math.sin(t * 0.12) * 1.5);
    camera.lookAt(0, 1.7, zEnd);
  };
  loadModels(w, cfg.models);
  w.addUpdater((dt) => w.mixers.forEach((m) => m.update(dt)));
  return w;
}

// ------------------------------------------------------------
// Salas
// ------------------------------------------------------------
function roomBase(room, opts = {}) {
  const w = createWorld({ name: room.door, radius: opts.radius ?? 12, fogDensity: opts.fogDensity ?? 0.03, fogColor: opts.fogColor ?? 0x05010f });
  if (opts.floor !== false) {
    const floor = gridFloor(room.color, 140, 1.5);
    w.addFloor(floor);
    w.addUpdater((dt, t) => (floor.material.uniforms.uTime.value = t));
  }
  w.scene.add(starField(1500, 160, [0xffffff, room.color]));

  // Porta de saída atrás do jogador
  const exit = makeWhiteDoor({ label: 'VOLTAR', glow: room.color });
  exit.group.position.set(0, opts.exitY ?? 0, 7);
  exit.group.rotation.y = Math.PI;
  w.addDoor(exit, () => goToHub());
  w.spawn = { pos: new THREE.Vector3(0, EYE + (opts.exitY ?? 0), 3.5), yaw: 0 };
  w.addUpdater((dt) => w.mixers.forEach((m) => m.update(dt)));
  return w;
}

function holoCard({ title, sub = '', color, w = 2.2, h = 1.4 }) {
  const g = new THREE.Group();
  const tex = textCanvas(
    [{ text: title, size: 74, y: 0.42 }, ...(sub ? [{ text: sub, size: 38, y: 0.66, weight: 500, color: '#e8f6ff', glow: 6, font: 'Space Grotesk, sans-serif' }] : [])],
    { color, w: 800, h: 512, bg: ['rgba(20,8,48,0.75)', 'rgba(5,1,15,0.55)'], border: true }
  );
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  g.add(panel);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.12, 6), neon(color, 0.9));
  base.position.y = -h / 2 - 0.9;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), neon(color, 0.5));
  beam.position.y = -h / 2 - 0.45;
  g.add(base, beam);
  g.userData.panel = panel;
  return g;
}

function makeClickableFloat(w, obj, { label, onClick, baseY, phase = 0 }) {
  w.clickables.push({ object: obj.userData.panel || obj, label, onClick, root: obj });
  obj.userData.hover = 0;
  w.addUpdater((dt, t) => {
    obj.position.y = baseY + Math.sin(t * 1.2 + phase) * 0.12;
    const target = hoveredRoot === obj ? 1 : 0;
    obj.userData.hover += (target - obj.userData.hover) * Math.min(1, dt * 8);
    obj.scale.setScalar(1 + obj.userData.hover * 0.08);
  });
}

const roomBuilders = {
  cristal(room) {
    const w = roomBase(room);
    const s = w.scene;
    const c = new THREE.Color(room.color);
    const crystalMat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.85 });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), crystalMat);
    crystal.scale.y = 1.7;
    const wire = new THREE.Mesh(new THREE.OctahedronGeometry(1.62, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, toneMapped: false }));
    crystal.add(wire);
    crystal.position.set(0, 3.4, -6);
    s.add(crystal);
    const l = new THREE.PointLight(c, 30, 20, 1.4); l.position.set(0, 3.4, -4); s.add(l);
    w.colliders.push({ x: 0, z: -6, r: 2.2 });

    const smalls = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18 + Math.random() * 0.2, 0), i % 3 ? crystalMat : neon(0xffffff));
      m.userData = { a: (i / 14) * Math.PI * 2, r: 3 + Math.random() * 1.5, y: 1.5 + Math.random() * 3.5, sp: 0.2 + Math.random() * 0.4 };
      s.add(m); smalls.push(m);
    }
    const rings = [0, 1, 2].map((i) => {
      const r = new THREE.Mesh(new THREE.TorusGeometry(3 + i * 0.6, 0.02, 6, 160), neon(i === 1 ? 0xff2bd6 : c));
      r.position.copy(crystal.position);
      r.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
      s.add(r);
      return r;
    });
    // Monolitos ao redor
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const mono = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6 + (i % 3) * 2, 0.8), darkMetal);
      mono.position.set(Math.cos(a) * 16, 3, Math.sin(a) * 16 - 3);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, mono.geometry.parameters.height * 0.9, 0.82), neon(c));
      mono.add(strip);
      mono.lookAt(0, 3, -3);
      s.add(mono);
    }
    w.clickables.push({ object: crystal, label: 'QUEM SOU EU', onClick: () => showRoomPanel(room) });
    w.addUpdater((dt, t) => {
      crystal.rotation.y += dt * 0.5;
      crystal.position.y = 3.4 + Math.sin(t) * 0.25;
      crystalMat.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.1 + (hoveredObj === crystal ? 0.4 : 0);
      smalls.forEach((m) => {
        const d = m.userData; d.a += dt * d.sp;
        m.position.set(Math.cos(d.a) * d.r, d.y + Math.sin(t + d.a) * 0.3, -6 + Math.sin(d.a) * d.r);
        m.rotation.y += dt;
      });
      rings.forEach((r, i) => (r.rotation.z += dt * (0.2 + i * 0.15) * (i % 2 ? -1 : 1)));
    });
    const dust = dustParticles(300, 24, c); s.add(dust); w.addUpdater(dust.userData.update);
    return w;
  },

  galeria(room) {
    const w = roomBase(room, { radius: 11 });
    const s = w.scene;
    const items = room.items || [];
    const n = items.length;
    const R = 7;
    const spread = Math.min(150, 34 * Math.max(1, n - 1)) * (Math.PI / 180);
    items.forEach((it, i) => {
      const th = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      const card = holoCard({ title: it.title, sub: it.sub, color: room.color });
      card.position.set(Math.sin(th) * R, 2.2, 1.5 - Math.cos(th) * R);
      card.lookAt(0, 2.2, 1.5);
      s.add(card);
      makeClickableFloat(w, card, { label: it.title, baseY: 2.2, phase: i, onClick: () => showItemPanel(room, it) });
    });
    // Anel de luz no teto
    const halo = new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 8, 200), neon(room.color));
    halo.rotation.x = Math.PI / 2; halo.position.set(0, 5.5, 1.5);
    s.add(halo);
    const l = new THREE.PointLight(room.color, 20, 20, 1.4); l.position.set(0, 5, 0); s.add(l);
    w.addUpdater((dt, t) => halo.scale.setScalar(1 + Math.sin(t) * 0.01));
    const dust = dustParticles(300, 24, new THREE.Color(room.color)); s.add(dust); w.addUpdater(dust.userData.update);
    return w;
  },

  galaxia(room) {
    const w = roomBase(room, { floor: false, radius: 4.5, fogDensity: 0.004, exitY: 0 });
    const s = w.scene;
    // Plataforma flutuante
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x0c0a1c, metalness: 0.9, roughness: 0.2, transparent: true, opacity: 0.85 }));
    plat.position.y = -0.1;
    plat.userData.isFloor = true;
    w.addFloor(plat);
    // plataforma estendida até a porta de saída
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 4), plat.material);
    bridge.position.set(0, -0.1, 6);
    w.addFloor(bridge);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(5, 0.04, 6, 6), neon(room.color));
    edge.rotation.x = Math.PI / 2; edge.rotation.z = Math.PI / 6;
    s.add(edge);
    w.clamp = (p) => {
      // círculo da plataforma + ponte
      const inBridge = Math.abs(p.x) < 1.5 && p.z > 0 && p.z < 8;
      if (inBridge) return;
      const d = Math.hypot(p.x, p.z);
      if (d > 4.4) { p.x *= 4.4 / d; p.z *= 4.4 / d; }
    };

    // Galáxia
    const COUNT = isTouch ? 14000 : 26000;
    const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
    const inner = new THREE.Color('#ffd9f5'), outer = new THREE.Color(room.color), tmp = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const r = Math.pow(Math.random(), 1.4) * 70;
      const arm = (i % 4) * (Math.PI / 2);
      const ang = arm + r * 0.09 + (Math.random() - 0.5) * 0.5;
      const rnd = () => Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 4;
      pos.set([Math.cos(ang) * r + rnd(), rnd() * 0.5, Math.sin(ang) * r + rnd()], i * 3);
      tmp.copy(inner).lerp(outer, r / 70);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const galaxy = new THREE.Points(gg, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    galaxy.position.set(0, -14, -20);
    galaxy.rotation.x = 0.35;
    s.add(galaxy);
    const coreGlow = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 32), neon(0xffe6fb));
    galaxy.add(coreGlow);
    w.addUpdater((dt) => (galaxy.rotation.y += dt * 0.03));

    // Planetas clicáveis
    (room.items || []).forEach((it, i, arr) => {
      const a = -Math.PI / 2 + (i - (arr.length - 1) / 2) * 0.55;
      const pc = new THREE.Color(it.color || room.color);
      const g = new THREE.Group();
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), new THREE.MeshStandardMaterial({ color: pc, emissive: pc, emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.2 }));
      const atm = new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 32), new THREE.MeshBasicMaterial({ color: pc, transparent: true, opacity: 0.18, toneMapped: false, side: THREE.BackSide }));
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.6, 96), neon(pc, 0.8));
      ring.material.side = THREE.DoubleSide;
      ring.rotation.x = 1.2;
      const label = labelPlane([{ text: it.title, size: 80, y: 0.5 }], 2.6, { color: it.color || room.color });
      label.position.y = 1.9;
      g.add(sphere, atm, ring, label);
      g.userData.panel = sphere;
      const dist = 11;
      g.position.set(Math.cos(a) * dist, 2 + (i % 2) * 1.5, Math.sin(a) * dist);
      s.add(g);
      w.clickables.push({ object: sphere, label: it.title, onClick: () => showItemPanel(room, it), root: g });
      g.userData.hover = 0;
      const baseY = g.position.y;
      w.addUpdater((dt, t) => {
        sphere.rotation.y += dt * 0.3;
        ring.rotation.z += dt * 0.2;
        g.position.y = baseY + Math.sin(t * 0.8 + i) * 0.3;
        label.quaternion.copy(camera.quaternion);
        g.userData.hover += ((hoveredRoot === g ? 1 : 0) - g.userData.hover) * Math.min(1, dt * 8);
        g.scale.setScalar(1 + g.userData.hover * 0.15);
        sphere.material.emissiveIntensity = 0.25 + g.userData.hover * 0.5;
      });
    });
    const sun = new THREE.PointLight(0xffffff, 40, 60, 1.2); sun.position.set(0, 8, 0); s.add(sun);
    return w;
  },

  contato(room) {
    const w = roomBase(room, { radius: 6, fogDensity: 0.035 });
    const s = w.scene;
    const c = new THREE.Color(room.color);
    // Túnel de anéis hexagonais
    const rings = [];
    for (let i = 0; i < 40; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(7, 0.06, 6, 6), neon(i % 5 === 0 ? 0xff2bd6 : c, 0.9));
      r.position.set(0, 4, -i * 3);
      r.rotation.z = Math.PI / 6;
      s.add(r); rings.push(r);
    }
    w.addUpdater((dt, t) => {
      rings.forEach((r, i) => {
        r.position.z += dt * 6;
        if (r.position.z > 6) r.position.z -= 120;
        r.rotation.z = Math.PI / 6 + Math.sin(t * 0.5 + i * 0.2) * 0.2;
      });
    });
    // Linhas de velocidade
    const N = 600, sp = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 5, z = -Math.random() * 120;
      const x = Math.cos(a) * r, y = 4 + Math.sin(a) * r;
      sp.set([x, y, z, x, y, z - 1.5], i * 6);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, toneMapped: false }));
    s.add(streaks);
    w.addUpdater((dt) => {
      const a = sg.attributes.position.array;
      for (let i = 0; i < N; i++) {
        a[i * 6 + 2] += dt * 30; a[i * 6 + 5] += dt * 30;
        if (a[i * 6 + 2] > 6) { a[i * 6 + 2] -= 126; a[i * 6 + 5] -= 126; }
      }
      sg.attributes.position.needsUpdate = true;
    });

    const items = room.items || [];
    items.forEach((it, i) => {
      const x = (i - (items.length - 1) / 2) * 2.7;
      const card = holoCard({ title: it.title, sub: it.sub, color: room.color, w: 2.4, h: 1.5 });
      card.position.set(x, 2.3, -3);
      s.add(card);
      makeClickableFloat(w, card, {
        label: `ABRIR · ${it.title}`, baseY: 2.3, phase: i * 1.3,
        onClick: () => { if (it.link) window.open(it.link, '_blank', 'noopener'); else showItemPanel(room, it); },
      });
    });
    const l = new THREE.PointLight(c, 20, 20, 1.4); l.position.set(0, 4, -2); s.add(l);
    return w;
  },
};

// ------------------------------------------------------------
// Estado do jogador
// ------------------------------------------------------------
const player = { pos: new THREE.Vector3(), yaw: 0, pitch: -0.05, bob: 0 };
const keys = new Set();
let autopilot = null; // { points: [Vector3], yaw?: number }
let hub, current = null;
const rooms = [];
let transitioning = false;
let started = false;
let hoveredObj = null, hoveredRoot = null, hoveredEntry = null;
let lastRoomIndex = -1;

function setWorld(w, spawn) {
  current = w;
  renderPass.scene = w.scene;
  renderer.toneMapping = w.render.toneMapping;
  renderer.toneMappingExposure = w.render.exposure;
  [bloom.strength, bloom.radius, bloom.threshold] = w.render.bloom;
  const sp = spawn || w.spawn;
  player.pos.copy(sp.pos);
  player.yaw = sp.yaw;
  player.pitch = -0.05;
  autopilot = null;
  $('where').textContent = w.name;
  $('btn-back').classList.toggle('hidden', w === hub);
  w.doors.forEach((d) => { d.prevAlong = null; d.forceOpen = false; d.open = 0; });
}

function transition(color, fn) {
  if (transitioning) return;
  transitioning = true;
  sfx.whoosh();
  const flash = $('flash');
  flash.style.setProperty('--flash', color);
  flash.classList.add('on');
  setTimeout(() => {
    fn();
    camera.fov = 100;
    setTimeout(() => { flash.classList.remove('on'); transitioning = false; }, 120);
  }, 600);
}

function goToRoom(i) {
  const room = CONFIG.rooms[i];
  transition(room.color, () => {
    if (!rooms[i]) {
      rooms[i] = (roomBuilders[room.type] || roomBuilders.cristal)(room);
      loadModels(rooms[i], room.models);
    }
    lastRoomIndex = i;
    setWorld(rooms[i]);
    hidePanel();
    setTimeout(() => showRoomPanel(room), 700);
  });
}

function goToHub() {
  transition('#ffd0e6', () => {
    let spawn;
    const door = hub.doors.find((d) => d.roomIndex === lastRoomIndex);
    if (door) {
      const p = door.worldPos.clone().addScaledVector(door.normal, 3.2);
      spawn = { pos: new THREE.Vector3(p.x, EYE, p.z), yaw: Math.atan2(-door.normal.x, -door.normal.z) };
    }
    setWorld(hub, spawn);
    hidePanel();
  });
}

function walkThroughDoor(door) {
  if (transitioning) return;
  const front = door.worldPos.clone().addScaledVector(door.normal, 2.2);
  const behind = door.worldPos.clone().addScaledVector(door.normal, -1.2);
  front.y = behind.y = player.pos.y;
  door.forceOpen = true;
  autopilot = { points: [front, behind], speed: WALK_SPEED * 1.1 };
}

// ------------------------------------------------------------
// Painel
// ------------------------------------------------------------
function showRoomPanel(room) {
  if (current?.name !== room.door) return;
  $('panel-kicker').textContent = room.kicker || '';
  $('panel-title').textContent = room.title || room.door;
  $('panel-body').innerHTML = room.html || '';
  $('panel').classList.remove('hidden');
}
function showItemPanel(room, it) {
  $('panel-kicker').textContent = `${room.door}${it.sub ? ' · ' + it.sub : ''}`;
  $('panel-title').textContent = it.title;
  const body = $('panel-body');
  body.innerHTML = '';
  if (it.desc) { const p = document.createElement('p'); p.textContent = it.desc; body.appendChild(p); }
  if (it.html) body.insertAdjacentHTML('beforeend', it.html);
  if (it.link) {
    const a = document.createElement('a');
    a.href = it.link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'ABRIR LINK ↗';
    body.appendChild(a);
  }
  $('panel').classList.remove('hidden');
  sfx.blip();
}
function hidePanel() { $('panel').classList.add('hidden'); }
$('panel-close').addEventListener('click', hidePanel);

// ------------------------------------------------------------
// Entrada (mouse / toque / teclado)
// ------------------------------------------------------------
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!started) return;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0 };
});
canvas.addEventListener('pointermove', (e) => {
  pointerNDC.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const tt = $('tooltip');
  tt.style.left = e.clientX + 'px'; tt.style.top = e.clientY + 'px';
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.moved > 6) {
    canvas.classList.add('dragging');
    const k = isTouch ? 0.006 : 0.0045;
    player.yaw += dx * k;
    player.pitch = THREE.MathUtils.clamp(player.pitch + dy * k, -1.1, 0.9);
    if (autopilot?.lookOnly) autopilot = null;
  }
});
canvas.addEventListener('pointerup', (e) => {
  canvas.classList.remove('dragging');
  if (drag && drag.moved <= 6) handleClick(e);
  drag = null;
});

function pick(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const objs = current.clickables.map((c) => c.object);
  const hits = raycaster.intersectObjects([...objs, ...current.floors], false);
  if (!hits.length) return null;
  const h = hits[0];
  const entry = current.clickables.find((c) => c.object === h.object);
  if (entry && h.distance < 60) return { entry, hit: h };
  if (h.object.userData.isFloor) return { floor: h.point };
  return null;
}

function handleClick(e) {
  if (transitioning) return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const r = pick(ndc);
  if (!r) return;
  if (r.entry) { r.entry.onClick(); return; }
  if (r.floor) {
    const p = new THREE.Vector3(r.floor.x, player.pos.y, r.floor.z);
    autopilot = { points: [p], speed: WALK_SPEED };
  }
}

addEventListener('keydown', (e) => {
  if (!started) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) {
    keys.add(k); autopilot = null; e.preventDefault();
  }
  if (k === 'escape') {
    if (!$('panel').classList.contains('hidden')) hidePanel();
    else if (current !== hub) goToHub();
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

$('btn-back').addEventListener('click', () => current !== hub && goToHub());

// ------------------------------------------------------------
// Movimento + colisões + atravessar portas
// ------------------------------------------------------------
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3(), tmpV = new THREE.Vector3();

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updatePlayer(dt) {
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  move.set(0, 0, 0);

  if (!transitioning) {
    if (keys.has('w') || keys.has('arrowup')) move.add(fwd);
    if (keys.has('s') || keys.has('arrowdown')) move.sub(fwd);
    if (keys.has('d')) move.add(right);
    if (keys.has('a')) move.sub(right);
    if (keys.has('arrowleft') || keys.has('q')) player.yaw += dt * 2;
    if (keys.has('arrowright') || keys.has('e')) player.yaw -= dt * 2;
  }

  let speed = WALK_SPEED * (keys.has('shift') ? 1.8 : 1);

  if (autopilot && !transitioning) {
    const target = autopilot.points[0];
    tmpV.subVectors(target, player.pos).setY(0);
    const dist = tmpV.length();
    if (dist < 0.15) {
      autopilot.points.shift();
      if (!autopilot.points.length) autopilot = null;
    } else {
      tmpV.normalize();
      move.copy(tmpV);
      speed = autopilot.speed * Math.min(1, dist / 0.6 + 0.35);
      const targetYaw = Math.atan2(-tmpV.x, -tmpV.z);
      player.yaw = angleLerp(player.yaw, targetYaw, Math.min(1, dt * 5));
      player.pitch += (-0.05 - player.pitch) * Math.min(1, dt * 3);
    }
  }

  const moving = move.lengthSq() > 0;
  if (moving) {
    move.normalize().multiplyScalar(speed * dt);
    player.pos.add(move);
    player.bob += dt * speed * 1.6;
  }

  // Limites do mundo
  if (current.clamp) current.clamp(player.pos);
  else {
    const d = Math.hypot(player.pos.x - current.center.x, player.pos.z - current.center.z);
    if (d > current.radius) {
      const k = current.radius / d;
      player.pos.x = current.center.x + (player.pos.x - current.center.x) * k;
      player.pos.z = current.center.z + (player.pos.z - current.center.z) * k;
    }
  }
  for (const c of current.colliders) {
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r + 0.35 && d > 0.0001) {
      const k = (c.r + 0.35) / d;
      player.pos.x = c.x + dx * k; player.pos.z = c.z + dz * k;
    }
  }

  // Atravessou alguma porta?
  if (!transitioning) {
    for (const door of current.doors) {
      tmpV.subVectors(player.pos, door.worldPos).setY(0);
      const along = tmpV.dot(door.normal);
      const lateral = Math.abs(tmpV.dot(door.tangent));
      if (door.prevAlong != null && door.prevAlong > 0 && along <= 0 && lateral < door.halfWidth + 0.2) {
        if (door.canEnter() && lateral < door.halfWidth) {
          door.prevAlong = null;
          door.onEnter();
          break;
        }
        // porta fechada: não dá pra atravessar
        player.pos.addScaledVector(door.normal, 0.05 - along);
        door.prevAlong = 0.05;
        continue;
      }
      door.prevAlong = along;
    }
  }

  camera.position.set(player.pos.x, player.pos.y + (moving ? Math.sin(player.bob) * 0.04 : 0), player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  camera.fov += (70 - camera.fov) * Math.min(1, dt * 2.5);
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------
// Hover
// ------------------------------------------------------------
function updateHover() {
  hoveredObj = hoveredRoot = hoveredEntry = null;
  if (isTouch || drag?.moved > 6 || transitioning) { setTooltip(null); return; }
  const r = pick(pointerNDC);
  if (r?.entry) {
    hoveredEntry = r.entry;
    hoveredObj = r.entry.object;
    hoveredRoot = r.entry.root || null;
  }
  canvas.classList.toggle('pointer', !!hoveredEntry);
  setTooltip(hoveredEntry?.label);
}
let lastTip = null;
function setTooltip(text) {
  if (text === lastTip) return;
  lastTip = text;
  const tt = $('tooltip');
  if (text) { tt.textContent = text; tt.classList.add('on'); } else tt.classList.remove('on');
}
function hoveredDoor() {
  if (!hoveredObj) return null;
  return current.doors.find((d) => d.clickTargets.includes(hoveredObj));
}

// ------------------------------------------------------------
// Som (sintetizado, sem arquivos)
// ------------------------------------------------------------
const sfx = (() => {
  let ctx, master, on = true;
  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.0; master.connect(ctx.destination);
    // drone ambiente
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 4; lp.connect(master);
    [55, 82.4, 110.3, 164.8].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 14;
      const g = ctx.createGain(); g.gain.value = 0.06 / (i + 1);
      o.connect(g).connect(lp); o.start();
    });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 350;
    lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    master.gain.linearRampToValueAtTime(on ? 0.5 : 0, ctx.currentTime + 3);
  }
  function noiseBurst(dur, from, to, vol) {
    if (!ctx || !on) return;
    const len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(from, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur);
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(ctx.destination); src.start();
  }
  return {
    init,
    toggle() { on = !on; if (ctx) master.gain.linearRampToValueAtTime(on ? 0.5 : 0, ctx.currentTime + 0.5); return on; },
    whoosh() { noiseBurst(1.1, 300, 4000, 0.5); },
    door() {
      if (!ctx || !on) return;
      // rangido suave + sopro de ar
      const o = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 8;
      o.frequency.setValueAtTime(140, ctx.currentTime); o.frequency.linearRampToValueAtTime(95, ctx.currentTime + 0.9);
      g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0);
      o.connect(f).connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 1.05);
      noiseBurst(1.4, 200, 1200, 0.18);
    },
    blip() {
      if (!ctx || !on) return;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(880, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.08, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.2);
    },
  };
})();
$('btn-sound').addEventListener('click', () => { sfx.init(); $('btn-sound').textContent = sfx.toggle() ? 'SOM: ON' : 'SOM: OFF'; });

// ------------------------------------------------------------
// Loop
// ------------------------------------------------------------
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (started) {
    updatePlayer(dt);
    updateHover();
  } else {
    // câmera passeando atrás da tela de intro
    if (current.intro) current.intro(t);
  }

  const hd = started ? hoveredDoor() : null;
  current.doors.forEach((d) => d.update(dt, t, d === hd, started ? player.pos : null));
  current.updaters.forEach((fn) => fn(dt, t));

  composer.render(dt);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------
// Início
// ------------------------------------------------------------
async function boot() {
  $('intro-title').textContent = CONFIG.title;
  $('intro-sub').textContent = CONFIG.subtitle;
  $('hud-title').textContent = CONFIG.title;
  document.title = CONFIG.title.charAt(0) + CONFIG.title.slice(1).toLowerCase();
  const prog = $('progress');
  prog.style.width = '25%';
  try {
    await Promise.race([
      Promise.all([document.fonts.load('900 80px Orbitron'), document.fonts.load('700 80px Orbitron'), document.fonts.load('500 30px "Space Grotesk"')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (_) { /* segue sem a fonte */ }
  prog.style.width = '60%';
  hub = buildCorridor();
  setWorld(hub);
  // pré-compila shaders
  renderer.compile(hub.scene, camera);
  prog.style.width = '100%';
  requestAnimationFrame(frame);

  const btn = $('enter');
  btn.disabled = false;
  btn.textContent = 'ENTRAR NO MUNDO';
  btn.addEventListener('click', () => {
    sfx.init();
    sfx.whoosh();
    $('intro').classList.add('gone');
    started = true;
    setWorld(hub);
    camera.fov = 100;
    setTimeout(() => ($('hint').style.opacity = '0.0'), 14000);
  });
}

// Atalhos úteis no console do navegador (ex.: __mundo.goToRoom(0))
window.__mundo = {
  goToRoom, goToHub, player,
  doorScreen(i) {
    const d = hub.doors[i];
    if (!d || current !== hub) return null;
    const v = d.portal.getWorldPosition(new THREE.Vector3()).project(camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  },
};

boot();

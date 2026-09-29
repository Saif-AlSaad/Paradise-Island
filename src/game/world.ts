import * as THREE from "three";

// ---------------------------------------------------------------- terrain math
function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function getTerrainHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  let h = 9 * Math.exp(-(d * d) / (2 * 85 * 85));
  const md = Math.hypot(x + 10, z + 45);
  h += 11 * Math.exp(-(md * md) / (2 * 30 * 30));
  h +=
    Math.sin(x * 0.045) * Math.cos(z * 0.05) * 1.7 +
    Math.sin(x * 0.11 + 1.7) * Math.cos(z * 0.09 + 0.6) * 0.7 +
    Math.sin(x * 0.23) * Math.sin(z * 0.21) * 0.28;
  const fall = smoothstep(120, 182, d);
  h = h * (1 - fall) + -7.5 * fall;
  return h;
}

export const WATER_LEVEL = 0.55;

export interface Collider { x: number; z: number; r: number }
export interface OutpostDef {
  name: string;
  sub: string;
  x: number; z: number;
  radius: number;
  spawns: { x: number; z: number }[];
}
export interface BarrelRef { mesh: THREE.Mesh; pos: THREE.Vector3; alive: boolean }
export interface AlarmBoxRef {
  outpostIndex: number;
  mesh: THREE.Group;
  boxMesh: THREE.Mesh;
  beaconLight: THREE.PointLight;
  beaconMesh: THREE.Mesh;
  pos: THREE.Vector3;
  disabled: boolean;
  sounding: boolean;
}
export interface WorldRefs {
  colliders: Collider[];
  solidMeshes: THREE.Object3D[];
  barrels: BarrelRef[];
  outposts: OutpostDef[];
  flagMats: THREE.MeshStandardMaterial[];
  alarms: AlarmBoxRef[];
  bushes: { x: number; z: number; r: number }[];
  update: (dt: number, t: number) => void;
  setOutpostCaptured: (i: number) => void;
  disableAlarm: (index: number) => void;
  soundAlarm: (index: number) => void;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(draw: (c: CanvasRenderingContext2D, s: number) => void, size = 128): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  draw(ctx, size);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

// -------- procedural realistic detail textures --------
function noiseTexture(base: string, spots: string[], size = 256, count = 1100): THREE.CanvasTexture {
  const tx = canvasTexture((c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < count; i++) {
      c.fillStyle = spots[Math.floor(Math.random() * spots.length)];
      c.globalAlpha = 0.1 + Math.random() * 0.3;
      const r = 1 + Math.random() * 3.5;
      c.beginPath();
      c.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }, size);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}

function barkTexture(): THREE.CanvasTexture {
  const tx = canvasTexture((c, s) => {
    c.fillStyle = "#6b4a2e";
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = Math.random() > 0.5 ? "rgba(38,22,10,.5)" : "rgba(160,118,74,.35)";
      c.lineWidth = 1 + Math.random() * 3;
      const x = Math.random() * s;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 12, s * 0.3, x - 12, s * 0.65, x + (Math.random() - 0.5) * 24, s);
      c.stroke();
    }
    for (let i = 0; i < 16; i++) {
      c.strokeStyle = "rgba(28,16,7,.5)";
      c.lineWidth = 2;
      const y = Math.random() * s;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(s, y + (Math.random() - 0.5) * 16);
      c.stroke();
    }
  }, 128);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(2, 3);
  return tx;
}

function plankTexture(c1: string, c2: string): THREE.CanvasTexture {
  const tx = canvasTexture((c, s) => {
    c.fillStyle = c1;
    c.fillRect(0, 0, s, s);
    const n = 6;
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? c1 : c2;
      c.fillRect(0, (s / n) * i, s, s / n - 2);
      c.fillStyle = "rgba(0,0,0,.4)";
      c.fillRect(0, (s / n) * (i + 1) - 2, s, 2);
      for (let j = 0; j < 20; j++) {
        c.strokeStyle = "rgba(50,32,14,.28)";
        c.lineWidth = 1;
        const y = (s / n) * i + 2 + Math.random() * (s / n - 6);
        c.beginPath();
        c.moveTo(Math.random() * s * 0.5, y);
        c.lineTo(s * 0.5 + Math.random() * s * 0.5, y + (Math.random() - 0.5) * 3);
        c.stroke();
      }
      // knots
      if (Math.random() > 0.5) {
        c.fillStyle = "rgba(45,28,12,.6)";
        c.beginPath();
        c.ellipse(Math.random() * s, (s / n) * i + (s / n) / 2, 4, 2.5, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  }, 128);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  return tx;
}

function thatchTexture(): THREE.CanvasTexture {
  const tx = canvasTexture((c, s) => {
    c.fillStyle = "#a98c4c";
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 600; i++) {
      c.strokeStyle = ["rgba(78,58,20,.45)", "rgba(196,166,94,.45)", "rgba(128,98,44,.45)"][i % 3];
      c.lineWidth = 1;
      const x = Math.random() * s, y = Math.random() * s;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (Math.random() - 0.5) * 8, y + 10 + Math.random() * 16);
      c.stroke();
    }
  }, 128);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(3, 2);
  return tx;
}

// ---------------------------------------------------------------- main builder
export function buildWorld(scene: THREE.Scene, quality: "low" | "high"): WorldRefs {
  const colliders: Collider[] = [];
  const solidMeshes: THREE.Object3D[] = [];
  const barrels: BarrelRef[] = [];
  const flagMats: THREE.MeshStandardMaterial[] = [];
  const alarms: AlarmBoxRef[] = [];
  const bushes: { x: number; z: number; r: number }[] = [];
  const rng = mulberry32(1337);
  const updaters: ((dt: number, t: number) => void)[] = [];
  const high = quality === "high";

  scene.fog = new THREE.Fog(0xcfe3ea, 130, 560);
  scene.background = new THREE.Color(0x87b8d4);

  // ---------------- lights ----------------
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a5f2a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 2.4);
  sun.position.set(90, 130, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  // ---------------- sky dome ----------------
  {
    const skyGeo = new THREE.SphereGeometry(700, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f7fc4) },
        mid: { value: new THREE.Color(0x9fd4e8) },
        bot: { value: new THREE.Color(0xf6e3bd) },
        sunDir: { value: new THREE.Vector3(90, 130, 45).normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 top, mid, bot, sunDir;
        void main(){
          float h = clamp(vDir.y, -0.1, 1.0);
          vec3 col = mix(bot, mid, smoothstep(-0.05, 0.28, h));
          col = mix(col, top, smoothstep(0.25, 0.85, h));
          float s = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 350.0);
          col += vec3(1.0, 0.9, 0.7) * s * 1.2;
          float glow = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 8.0);
          col += vec3(1.0, 0.85, 0.6) * glow * 0.18;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  // ---------------- terrain ----------------
  {
    const SIZE = 380, SEG = high ? 170 : 120;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xe3c188);
    const cSandWet = new THREE.Color(0xa98f5f);
    const cGrass1 = new THREE.Color(0x3e7a34);
    const cGrass2 = new THREE.Color(0x5d9440);
    const cDirt = new THREE.Color(0x7a5c3a);
    const cRock = new THREE.Color(0x8a8578);
    const cUnder = new THREE.Color(0x4d7a6e);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = getTerrainHeight(x, z);
      pos.setY(i, h);
      const n = Math.sin(x * 0.35) * Math.cos(z * 0.31) * 0.5 + 0.5;
      const n2 = Math.sin(x * 0.08 + 3) * Math.cos(z * 0.07) * 0.5 + 0.5;
      if (h < WATER_LEVEL - 1.6) tmp.copy(cUnder).lerp(cSandWet, 0.25);
      else if (h < WATER_LEVEL + 0.35) tmp.copy(cSandWet).lerp(cSand, smoothstep(WATER_LEVEL - 1.6, WATER_LEVEL + 0.35, h));
      else if (h < 2.2) tmp.copy(cSand).lerp(cGrass1, smoothstep(1.1, 2.4, h) * 0.85);
      else if (h < 11) {
        tmp.copy(cGrass1).lerp(cGrass2, n);
        if (n2 > 0.72) tmp.lerp(cDirt, 0.55);
      } else tmp.copy(cGrass2).lerp(cRock, smoothstep(11, 17, h));
      // slope rock
      const e = 1.2;
      const sl = Math.abs(getTerrainHeight(x + e, z) - h) + Math.abs(getTerrainHeight(x, z + e) - h);
      if (sl > 1.5 && h > 2) tmp.lerp(cRock, Math.min(0.8, (sl - 1.5) * 0.5));
      const v = 0.92 + rng() * 0.16;
      colors[i * 3] = tmp.r * v; colors[i * 3 + 1] = tmp.g * v; colors[i * 3 + 2] = tmp.b * v;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // ground detail texture multiplies vertex colors for realistic close-up grain
    const detail = noiseTexture("#b8b8b8", ["#9c9c9c", "#d0d0d0", "#a8a8a8", "#c4c4c4", "#8f8f8f"], 256, 1600);
    detail.repeat.set(70, 70);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: detail });
    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    scene.add(terrain);
    solidMeshes.push(terrain);
  }

  // ---------------- water ----------------
  {
    const geo = new THREE.PlaneGeometry(1400, 1400, high ? 48 : 24, high ? 48 : 24);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1b8fa8, transparent: true, opacity: 0.8,
      roughness: 0.25, metalness: 0.45,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WATER_LEVEL;
    scene.add(water);
    const base = geo.attributes.position.array.slice();
    updaters.push((_dt, t) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        p.setY(i, Math.sin(x * 0.05 + t * 1.1) * 0.22 + Math.cos(z * 0.06 + t * 0.9) * 0.2);
      }
      p.needsUpdate = true;
    });
  }

  // distant islands
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a7a5a, roughness: 1 });
    const matSand = new THREE.MeshStandardMaterial({ color: 0xd9bd85, roughness: 1 });
    [[-420, -260, 90], [380, -320, 70], [460, 240, 100], [-400, 300, 60]].forEach(([x, z, r]) => {
      const isl = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.35, 7), mat);
      cone.position.y = r * 0.1;
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.1, 3, 12), matSand);
      beach.position.y = 0.4;
      isl.add(cone, beach);
      isl.position.set(x, 0, z);
      scene.add(isl);
    });
  }

  // ---------------- clouds ----------------
  {
    const tex = canvasTexture((c, s) => {
      c.clearRect(0, 0, s, s);
      for (let i = 0; i < 14; i++) {
        const x = s * (0.2 + Math.random() * 0.6), y = s * (0.35 + Math.random() * 0.3), r = s * (0.08 + Math.random() * 0.12);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,.85)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, s, s);
      }
    }, 256);
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < (high ? 14 : 8); i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55 + rng() * 0.3, depthWrite: false });
      const sp = new THREE.Sprite(m);
      sp.position.set((rng() - 0.5) * 900, 120 + rng() * 90, (rng() - 0.5) * 900);
      sp.scale.set(120 + rng() * 140, 40 + rng() * 40, 1);
      scene.add(sp);
      clouds.push(sp);
    }
    updaters.push((dt) => {
      clouds.forEach((c, i) => {
        c.position.x += dt * (2 + i * 0.3);
        if (c.position.x > 500) c.position.x = -500;
      });
    });
  }

  // ---------------- vegetation & props ----------------
  const outposts: OutpostDef[] = [
    { name: "SHARK COVE", sub: "Outpost Alpha", x: -52, z: 30, radius: 22, spawns: [] },
    { name: "JUNGLE CAMP", sub: "Outpost Bravo", x: 55, z: -5, radius: 22, spawns: [] },
    { name: "EAGLE'S NEST", sub: "Outpost Charlie", x: -6, z: -78, radius: 24, spawns: [] },
  ];
  const farFromOutposts = (x: number, z: number, pad = 26) =>
    outposts.every((o) => Math.hypot(x - o.x, z - o.z) > pad);

  const trunkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a2e, roughness: 1, side: THREE.DoubleSide });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x47a03a, roughness: 1, side: THREE.DoubleSide });
  const rockMat = new THREE.MeshStandardMaterial({ map: noiseTexture("#8d887c", ["#6f6b60", "#a29c8e", "#79756a", "#95907f"], 128, 700), roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ map: plankTexture("#7a5a38", "#6b4c2d"), roughness: 0.95 });
  const woodDark = new THREE.MeshStandardMaterial({ map: plankTexture("#54390f", "#463008"), roughness: 1 });
  const thatchMat = new THREE.MeshStandardMaterial({ map: thatchTexture(), roughness: 1 });
  const crateMat = new THREE.MeshStandardMaterial({ map: plankTexture("#9a7448", "#8a6538"), roughness: 0.95 });
  const sandbagMat = new THREE.MeshStandardMaterial({ map: noiseTexture("#a39162", ["#8f7d50", "#b3a274", "#998758"], 128, 500), roughness: 1 });

  // realistic curved palm trunk (natural lean baked into geometry)
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.22, 3, 0),
    new THREE.Vector3(0.8, 6.2, 0),
    new THREE.Vector3(1.65, 8.9, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunkCurve, 10, 0.3, 7, false);
  const leafGeo = new THREE.PlaneGeometry(1.5, 6.5, 1, 4);
  {
    const p = leafGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      p.setZ(i, -Math.pow((y + 3.25) / 6.5, 2) * 2.2);
    }
    leafGeo.computeVertexNormals();
    leafGeo.translate(0, 3.4, 0);
  }
  const coconutGeo = new THREE.SphereGeometry(0.32, 6, 5);
  const coconutMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 1 });

  function makePalm(scale: number): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.castShadow = true;
    g.add(trunk);
    const crown = new THREE.Group();
    crown.position.set(1.65, 9.0, 0);
    const leaves = 7 + Math.floor(rng() * 3);
    for (let i = 0; i < leaves; i++) {
      const leaf = new THREE.Mesh(leafGeo, i % 2 ? leafMat : leafMat2);
      leaf.rotation.y = (i / leaves) * Math.PI * 2;
      leaf.rotation.x = -0.5 - rng() * 0.5;
      leaf.castShadow = true;
      crown.add(leaf);
    }
    for (let i = 0; i < 3; i++) {
      const nut = new THREE.Mesh(coconutGeo, coconutMat);
      nut.position.set((rng() - 0.5) * 1.2, -0.4, (rng() - 0.5) * 1.2);
      crown.add(nut);
    }
    g.add(crown);
    g.scale.setScalar(scale);
    g.rotation.y = rng() * Math.PI * 2;
    return g;
  }

  // scatter palms
  const palmCount = high ? 150 : 85;
  let placed = 0, guard = 0;
  while (placed < palmCount && guard++ < 3000) {
    const x = (rng() - 0.5) * 260, z = (rng() - 0.5) * 260;
    const h = getTerrainHeight(x, z);
    if (h < 1.2 || h > 11 || !farFromOutposts(x, z)) continue;
    if (Math.hypot(x, z - 128) < 12) continue;
    const palm = makePalm(0.8 + rng() * 0.7);
    palm.position.set(x, h - 0.2, z);
    scene.add(palm);
    colliders.push({ x, z, r: 0.7 });
    solidMeshes.push(palm.children[0]);
    placed++;
  }

  // broadleaf jungle trees on hills
  {
    const folMat = new THREE.MeshStandardMaterial({ color: 0x2c6a2a, roughness: 1 });
    const folGeo = new THREE.IcosahedronGeometry(2.6, 1);
    for (let i = 0; i < (high ? 40 : 22); i++) {
      const x = (rng() - 0.5) * 220, z = (rng() - 0.5) * 220;
      const h = getTerrainHeight(x, z);
      if (h < 4 || h > 14 || !farFromOutposts(x, z)) continue;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 5, 6), trunkMat);
      trunk.position.y = 2.5;
      trunk.castShadow = true;
      g.add(trunk);
      for (let j = 0; j < 3; j++) {
        const f = new THREE.Mesh(folGeo, j ? leafMat2 : folMat);
        f.position.set((rng() - 0.5) * 3, 5.5 + rng() * 2, (rng() - 0.5) * 3);
        f.scale.setScalar(0.8 + rng() * 0.7);
        f.castShadow = true;
        g.add(f);
      }
      g.position.set(x, h - 0.2, z);
      scene.add(g);
      colliders.push({ x, z, r: 0.9 });
      solidMeshes.push(trunk);
    }
  }

  // rocks
  {
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < (high ? 70 : 40); i++) {
      const x = (rng() - 0.5) * 280, z = (rng() - 0.5) * 280;
      const h = getTerrainHeight(x, z);
      if (h < 0.4) continue;
      const s = 0.5 + rng() * (h > 9 ? 3.2 : 1.4);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(x, h + s * 0.25, z);
      rock.scale.set(s * (0.7 + rng() * 0.6), s * (0.6 + rng() * 0.5), s * (0.7 + rng() * 0.6));
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      rock.castShadow = rock.receiveShadow = true;
      scene.add(rock);
      if (s > 0.8) {
        colliders.push({ x, z, r: s * 0.9 });
      }
      solidMeshes.push(rock);
    }
  }

  // grass tufts
  {
    const gGeo = new THREE.ConeGeometry(0.55, 1.1, 5);
    const gMat = new THREE.MeshStandardMaterial({ color: 0x5f9a44, roughness: 1 });
    const gMat2 = new THREE.MeshStandardMaterial({ color: 0x7aa844, roughness: 1 });
    for (let i = 0; i < (high ? 320 : 150); i++) {
      const x = (rng() - 0.5) * 260, z = (rng() - 0.5) * 260;
      const h = getTerrainHeight(x, z);
      if (h < 1.4 || h > 10) continue;
      const tuft = new THREE.Mesh(gGeo, rng() > 0.5 ? gMat : gMat2);
      tuft.position.set(x, h + 0.4, z);
      tuft.scale.setScalar(0.6 + rng() * 1.1);
      tuft.rotation.y = rng() * 3;
      scene.add(tuft);
    }
  }

  // ---------------- structures ----------------
  function addCrate(x: number, z: number, s = 1.2, ry = 0) {
    const h = getTerrainHeight(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
    m.position.set(x, h + s / 2, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    colliders.push({ x, z, r: s * 0.75 });
    solidMeshes.push(m);
    return m;
  }
  function addBarrel(x: number, z: number) {
    const h = getTerrainHeight(x, z);
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb3311f, roughness: 0.7, metalness: 0.25 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h + 0.7, z);
    m.castShadow = true;
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.57, 0.57, 0.25, 12),
      new THREE.MeshStandardMaterial({ color: 0xf3e2c2, roughness: 0.8 })
    );
    stripe.position.y = 0.2;
    m.add(stripe);
    scene.add(m);
    colliders.push({ x, z, r: 0.7 });
    solidMeshes.push(m);
    barrels.push({ mesh: m, pos: m.position.clone(), alive: true });
  }
  function addSandbags(x: number, z: number, ry: number, n = 4) {
    const h = getTerrainHeight(x, z);
    for (let i = 0; i < n; i++) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 3, 6), sandbagMat);
      const off = (i - (n - 1) / 2) * 0.95;
      bag.position.set(x + Math.cos(ry) * off, h + 0.35 + (i % 2) * 0.5, z - Math.sin(ry) * off);
      bag.rotation.z = Math.PI / 2;
      bag.rotation.y = ry;
      bag.castShadow = true;
      scene.add(bag);
      solidMeshes.push(bag);
    }
    colliders.push({ x, z, r: 1.6 });
  }
  function addHut(x: number, z: number, ry = 0, big = false) {
    const h = getTerrainHeight(x, z);
    const g = new THREE.Group();
    const w = big ? 6 : 4.4, d = big ? 5 : 4, wallH = big ? 3 : 2.6;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), woodMat);
    walls.position.y = wallH / 2 + 0.4;
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.85, 2.4, 4), thatchMat);
    roof.position.y = wallH + 1.6;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    // stilts + door
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 1 })
    );
    door.position.set(0, 1.4, d / 2 + 0.05);
    g.add(door);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1, 6), woodDark);
      stilt.position.set((sx * w) / 2.4, 0.2, (sz * d) / 2.4);
      g.add(stilt);
    }
    g.position.set(x, h, z);
    g.rotation.y = ry;
    scene.add(g);
    colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
    solidMeshes.push(walls, roof, door);
    return g;
  }
  function addTower(x: number, z: number) {
    const h = getTerrainHeight(x, z);
    const g = new THREE.Group();
    for (const [sx, sz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 8, 6), woodDark);
      leg.position.set(sx, 4, sz);
      leg.castShadow = true;
      g.add(leg);
      solidMeshes.push(leg);
    }
    const plat = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 4.2), woodMat);
    plat.position.y = 8;
    plat.castShadow = true;
    g.add(plat);
    solidMeshes.push(plat);
    for (let i = 0; i < 4; i++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.15, 0.15), woodDark);
      const a = (i / 4) * Math.PI * 2;
      rail.position.set(Math.sin(a) * 2, 9, Math.cos(a) * 2);
      rail.rotation.y = a;
      g.add(rail);
      solidMeshes.push(rail);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.8, 4), thatchMat);
    roof.position.y = 10.4;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    solidMeshes.push(roof);
    g.position.set(x, h, z);
    scene.add(g);
    colliders.push({ x, z, r: 2.4 });
  }
  const fireLights: THREE.PointLight[] = [];
  function addCampfire(x: number, z: number) {
    const h = getTerrainHeight(x, z);
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 5), woodDark);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 5) * Math.PI;
      log.position.y = 0.15;
      g.add(log);
    }
    for (let i = 0; i < 7; i++) {
      const st = new THREE.Mesh(new THREE.SphereGeometry(0.22, 5, 4), rockMat);
      const a = (i / 7) * Math.PI * 2;
      st.position.set(Math.cos(a) * 1.1, 0.1, Math.sin(a) * 1.1);
      g.add(st);
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.95 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 7), flameMat);
    flame.position.y = 0.9;
    g.add(flame);
    const flame2 = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe082 })
    );
    flame2.position.y = 0.85;
    g.add(flame2);
    const light = new THREE.PointLight(0xff8c3a, 12, 22, 1.8);
    light.position.y = 1.5;
    g.add(light);
    fireLights.push(light);
    g.position.set(x, h, z);
    scene.add(g);
    const seed = rng() * 10;
    updaters.push((_dt, t) => {
      const f = 1 + Math.sin(t * 11 + seed) * 0.18 + Math.sin(t * 23 + seed * 2) * 0.1;
      flame.scale.set(f, 1 + (f - 1) * 1.6, f);
      flame2.scale.set(2 - f * 0.5, f, 2 - f * 0.5);
      light.intensity = 12 * f;
    });
    colliders.push({ x, z, r: 1.2 });
  }
  function addFlag(x: number, z: number): void {
    const h = getTerrainHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7, 6), woodDark);
    pole.position.set(x, h + 3.5, z);
    pole.castShadow = true;
    scene.add(pole);
    solidMeshes.push(pole);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc22a1c, side: THREE.DoubleSide, roughness: 1 });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4, 6, 1), mat);
    flag.position.set(x + 1.25, h + 5.9, z);
    scene.add(flag);
    flagMats.push(mat);
    const base = flag.geometry.attributes.position.array.slice();
    const seed = Math.random() * 10;
    updaters.push((_dt, t) => {
      const p = flag.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3];
        p.setZ(i, Math.sin(t * 5 + bx * 2 + seed) * 0.18 * (bx + 1.2));
      }
      p.needsUpdate = true;
    });
  }

  // metal & bush materials
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.8 });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x245524, roughness: 0.95 });

  function addBush(x: number, z: number, s = 1.2) {
    const h = getTerrainHeight(x, z);
    if (h < 0.8) return;
    const g = new THREE.Group();
    const folGeo = new THREE.DodecahedronGeometry(0.9 * s, 1);
    const m = new THREE.Mesh(folGeo, bushMat);
    m.position.y = 0.5 * s;
    m.scale.set(1.4, 0.9, 1.4);
    m.castShadow = true;
    g.add(m);
    g.position.set(x, h, z);
    scene.add(g);
    bushes.push({ x, z, r: 1.8 * s });
  }

  function addAlarmBox(outpostIdx: number, x: number, z: number): AlarmBoxRef {
    const h = getTerrainHeight(x, z);
    const g = new THREE.Group();
    // pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6), metalMat);
    pole.position.y = 2.25;
    pole.castShadow = true;
    g.add(pole);
    // control box
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.4), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.6 }));
    boxMesh.position.set(0, 1.5, 0.22);
    boxMesh.castShadow = true;
    boxMesh.userData = { alarmIndex: outpostIdx, part: "alarm" };
    g.add(boxMesh);
    // horn
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 8), metalMat);
    horn.rotation.x = Math.PI / 2;
    horn.position.set(0, 4.2, 0.3);
    g.add(horn);
    // beacon
    const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    beaconMesh.position.set(0, 4.6, 0);
    g.add(beaconMesh);
    const beaconLight = new THREE.PointLight(0xef4444, 0, 18, 2);
    beaconLight.position.set(0, 4.7, 0);
    g.add(beaconLight);

    g.position.set(x, h, z);
    scene.add(g);
    colliders.push({ x, z, r: 0.6 });
    solidMeshes.push(boxMesh, pole);

    const ref: AlarmBoxRef = {
      outpostIndex: outpostIdx,
      mesh: g,
      boxMesh,
      beaconLight,
      beaconMesh,
      pos: new THREE.Vector3(x, h + 1.5, z),
      disabled: false,
      sounding: false,
    };
    alarms.push(ref);
    return ref;
  }

  // build outposts
  outposts.forEach((o, oidx) => {
    const oy = getTerrainHeight(o.x, o.z);
    addHut(o.x + 6, o.z + 4, rng() * 3, true);
    addHut(o.x - 7, o.z - 3, rng() * 3);
    addTower(o.x - 2, o.z + 10);
    addCampfire(o.x + 1, o.z - 6);
    addFlag(o.x, o.z);
    addCrate(o.x + 4, o.z - 2, 1.3, 0.4);
    addCrate(o.x + 5.2, o.z - 1, 1.0, 1.1);
    addCrate(o.x - 4, o.z + 6, 1.2, 0.2);
    addSandbags(o.x + 9, o.z + 8, 0.6);
    addSandbags(o.x - 9, o.z - 7, 2.2);
    addSandbags(o.x + 2, o.z + 12, 1.4, 3);
    addBarrel(o.x + 7.5, o.z + 1);
    addBarrel(o.x + 8.6, o.z + 2.2);
    addBarrel(o.x - 5.5, o.z + 1.5);
    // outpost alarm tower
    addAlarmBox(oidx, o.x - 4.2, o.z + 3.2);
    // perimeter stealth bushes
    for (let i = 0; i < 7; i++) {
      const ba = (i / 7) * Math.PI * 2 + 0.3;
      const br = 14 + rng() * 8;
      addBush(o.x + Math.cos(ba) * br, o.z + Math.sin(ba) * br, 1.1 + rng() * 0.4);
    }
    // enemy spawn ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng();
      const r = 6 + rng() * 12;
      const sx = o.x + Math.cos(a) * r, sz = o.z + Math.sin(a) * r;
      if (getTerrainHeight(sx, sz) > WATER_LEVEL) o.spawns.push({ x: sx, z: sz });
    }
    if (o.spawns.length === 0) o.spawns.push({ x: o.x + 3, z: o.z + 3 });
    void oy;
  });

  // scattered bushes in wild for stealth traversal
  for (let i = 0; i < (high ? 90 : 50); i++) {
    const x = (rng() - 0.5) * 260, z = (rng() - 0.5) * 260;
    const h = getTerrainHeight(x, z);
    if (h < 1.0 || h > 13) continue;
    addBush(x, z, 0.9 + rng() * 0.6);
  }

  // scattered barrels & crates in wild
  for (let i = 0; i < 10; i++) {
    const x = (rng() - 0.5) * 200, z = (rng() - 0.5) * 200;
    if (getTerrainHeight(x, z) < 1.5 || !farFromOutposts(x, z, 20)) continue;
    addBarrel(x, z);
  }
  // village huts near spawn (friendly, no enemies)
  addHut(14, 108, 0.5);
  addHut(-12, 112, -0.4);
  addCampfire(0, 112);

  // dock at south beach
  {
    const g = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 1.6), woodMat);
      plank.position.set(0, 1.15, i * 1.8);
      plank.castShadow = plank.receiveShadow = true;
      g.add(plank);
      solidMeshes.push(plank);
    }
    for (let i = 0; i < 5; i++) {
      for (const sx of [-1.5, 1.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 6), woodDark);
        post.position.set(sx, 0.4, i * 3.6);
        g.add(post);
        solidMeshes.push(post);
      }
    }
    // boat
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x7a2e22, roughness: 0.8 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 5), hullMat);
    hull.position.set(5, 0.5, 16);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.3, 5.3), woodDark);
    rim.position.set(5, 1.05, 16);
    g.add(hull, rim);
    solidMeshes.push(hull, rim);
    g.position.set(-18, 0, 128);
    scene.add(g);
  }

  // radio mast (landmark, blinking)
  let mastLight: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null = null;
  {
    const x = 24, z = -52;
    const h = getTerrainHeight(x, z);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 26, 6), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.6 }));
    mast.position.set(x, h + 13, z);
    mast.castShadow = true;
    scene.add(mast);
    solidMeshes.push(mast);
    mastLight = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    mastLight.position.set(x, h + 26.4, z);
    scene.add(mastLight);
    colliders.push({ x, z, r: 1.2 });
    updaters.push((_dt, t) => {
      if (mastLight) mastLight.visible = Math.sin(t * 3) > 0;
    });
  }

  // ---------------- birds ----------------
  {
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x1c2126, side: THREE.DoubleSide });
    const birds: { g: THREE.Group; w1: THREE.Mesh; w2: THREE.Mesh; r: number; h: number; sp: number; ph: number }[] = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const wgeo = new THREE.PlaneGeometry(1.6, 0.5);
      wgeo.translate(0.8, 0, 0);
      const w1 = new THREE.Mesh(wgeo, birdMat);
      const w2 = new THREE.Mesh(wgeo, birdMat);
      w2.rotation.y = Math.PI;
      g.add(w1, w2);
      scene.add(g);
      birds.push({ g, w1, w2, r: 40 + rng() * 90, h: 26 + rng() * 22, sp: 0.08 + rng() * 0.12, ph: rng() * 10 });
    }
    updaters.push((_dt, t) => {
      birds.forEach((b) => {
        const a = t * b.sp + b.ph;
        b.g.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + b.ph) * 2, Math.sin(a) * b.r);
        b.g.rotation.y = -a;
        const flap = Math.sin(t * 9 + b.ph * 5) * 0.6;
        b.w1.rotation.x = flap;
        b.w2.rotation.x = -flap;
      });
    });
  }

  // alarm sirens updater
  updaters.push((_dt, t) => {
    alarms.forEach((a) => {
      if (a.sounding && !a.disabled) {
        const flash = Math.sin(t * 12) > 0;
        a.beaconLight.intensity = flash ? 16 : 0;
        (a.beaconMesh.material as THREE.MeshBasicMaterial).color.set(flash ? 0xff2222 : 0x440505);
      }
    });
  });

  const update = (dt: number, t: number) => {
    for (const u of updaters) u(dt, t);
  };
  const setOutpostCaptured = (i: number) => {
    if (flagMats[i]) flagMats[i].color.set(0x2fa84f);
    if (alarms[i]) disableAlarm(i);
  };
  const disableAlarm = (i: number) => {
    const a = alarms[i];
    if (!a) return;
    a.disabled = true;
    a.sounding = false;
    a.beaconLight.intensity = 0;
    (a.beaconMesh.material as THREE.MeshBasicMaterial).color.set(0x22c55e);
  };
  const soundAlarm = (i: number) => {
    const a = alarms[i];
    if (!a || a.disabled) return;
    a.sounding = true;
  };

  scene.updateMatrixWorld(true);
  return { colliders, solidMeshes, barrels, outposts, flagMats, alarms, bushes, update, setOutpostCaptured, disableAlarm, soundAlarm };
}

import * as THREE from "three";
import { buildWorld, getTerrainHeight, WATER_LEVEL, type WorldRefs } from "./world";
import { GameAudio } from "./audio";
import { WeaponModelFactory, CasingManager, type WeaponRigParts } from "./weaponModels";
import { EnemyModelFactory, type EnemyCharacterRig } from "./enemyModels";

const weaponFactory = new WeaponModelFactory();
const enemyFactory = new EnemyModelFactory();

// ================================================================ types
export interface Settings {
  sensitivity: number;
  volume: number;
  quality: "low" | "high";
  invertY: boolean;
  fov: number;
}
export interface WeaponHUD { name: string; short: string; mag: number; reserve: number; magSize: number; reloading: boolean }
export interface HUDState {
  hp: number; maxHp: number; stamina: number;
  weapons: WeaponHUD[]; weaponIndex: number; switching: boolean;
  grenades: number; medkits: number; molotovs: number; rocks: number;
  kills: number; score: number; accuracy: number;
  objectiveIndex: number; objectiveText: string; objectiveSub: string; enemiesLeft: number; objectiveDist: number;
  outposts: { name: string; captured: boolean }[];
  yaw: number; time: number; bossHp: number; ads: number;
  canHeal: boolean; reloading: boolean; lowAmmo: boolean;
  crouched: boolean; concealed: boolean;
  isSniperScope: boolean;
  steadyBreath: boolean;
  takedownTarget: boolean;
  nearAlarm: boolean;
  detection: { angle: number; level: number } | null;
}
export type GameEvent =
  | { type: "hitmarker"; kill: boolean; headshot: boolean }
  | { type: "damage"; amount: number; angle: number }
  | { type: "killfeed"; text: string; headshot: boolean }
  | { type: "toast"; title: string; sub?: string; color?: string }
  | { type: "pickup"; text: string }
  | { type: "heal" }
  | { type: "gameover"; victory: boolean; stats: Stats }
  | { type: "boss" }
  | { type: "ammo-warning" };
export interface Stats { kills: number; headshots: number; shots: number; hits: number; accuracy: number; time: number; score: number }
export interface EngineCallbacks {
  onHUD: (h: HUDState) => void;
  onEvent: (e: GameEvent) => void;
  onLockChange: (locked: boolean) => void;
}

interface WeaponDef {
  id: string; name: string; short: string;
  damage: number; headMult: number; rpm: number;
  magSize: number; startReserve: number; maxReserve: number;
  spread: number; adsSpread: number; reloadTime: number;
  auto: boolean; range: number; kick: number; color: number;
}
const WEAPONS: WeaponDef[] = [
  { id: "rifle", name: 'AK-47 "LIBERATOR"', short: "AK-47", damage: 34, headMult: 2.2, rpm: 600, magSize: 30, startReserve: 180, maxReserve: 300, spread: 0.013, adsSpread: 0.004, reloadTime: 2.1, auto: true, range: 160, kick: 0.0105, color: 0x3a2e20 },
  { id: "shotgun", name: 'SPAS-12 "PUNISHER"', short: "SPAS-12", damage: 18, headMult: 1.8, rpm: 110, magSize: 8, startReserve: 40, maxReserve: 72, spread: 0.052, adsSpread: 0.034, reloadTime: 2.4, auto: false, range: 60, kick: 0.042, color: 0x2b2b32 },
  { id: "sniper", name: 'SVD "PREDATOR"', short: "SVD SCOPE", damage: 145, headMult: 3.5, rpm: 65, magSize: 5, startReserve: 25, maxReserve: 50, spread: 0.0025, adsSpread: 0.0003, reloadTime: 2.7, auto: false, range: 350, kick: 0.038, color: 0x222226 },
  { id: "bow", name: 'RECURVE BOW "HUNTER"', short: "BOW", damage: 110, headMult: 3.0, rpm: 55, magSize: 1, startReserve: 28, maxReserve: 45, spread: 0.004, adsSpread: 0.001, reloadTime: 1.2, auto: false, range: 140, kick: 0.005, color: 0x4a321a },
  { id: "pistol", name: 'DEAGLE "JUDGE"', short: "DEAGLE", damage: 68, headMult: 2.6, rpm: 260, magSize: 8, startReserve: 64, maxReserve: 120, spread: 0.007, adsSpread: 0.002, reloadTime: 1.5, auto: false, range: 130, kick: 0.032, color: 0x4a4a52 },
  { id: "scar", name: 'SCAR-H "GHOST"', short: "SCAR-H", damage: 44, headMult: 2.4, rpm: 550, magSize: 20, startReserve: 120, maxReserve: 240, spread: 0.009, adsSpread: 0.002, reloadTime: 2.2, auto: true, range: 220, kick: 0.0125, color: 0x4a4436 },
  { id: "pistol10mm", name: '10MM "ENFORCER"', short: "10MM", damage: 52, headMult: 2.5, rpm: 380, magSize: 15, startReserve: 90, maxReserve: 180, spread: 0.008, adsSpread: 0.0018, reloadTime: 1.6, auto: false, range: 110, kick: 0.022, color: 0x222224 },
];

type EnemyKind = "grunt" | "rusher" | "heavy" | "boss";
const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; damage: number; score: number; range: [number, number]; name: string }> = {
  grunt: { hp: 100, speed: 4.4, damage: 8, score: 100, range: [16, 36], name: "Pirate Gunner" },
  rusher: { hp: 70, speed: 7.2, damage: 16, score: 150, range: [0, 2.4], name: "Machete Rusher" },
  heavy: { hp: 280, speed: 2.9, damage: 6, score: 300, range: [12, 26], name: "Heavy Gunner" },
  boss: { hp: 1700, speed: 3.6, damage: 10, score: 2000, range: [9, 30], name: "COMMANDER KRUGER" },
};

// ================================================================ helpers
function softCircleTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// ================================================================ enemy
class Enemy {
  rig: EnemyCharacterRig;
  group: THREE.Group;
  kind: EnemyKind;
  hp: number; maxHp: number;
  speed: number;
  state: "idle" | "combat" | "dead" = "idle";
  walkPhase = Math.random() * 10;
  strafeDir = 1;
  strafeTimer = 0;
  burstTimer = 1 + Math.random() * 2;
  burstLeft = 0;
  shotTimer = 0;
  meleeTimer = 0;
  wanderTarget: THREE.Vector3 | null = null;
  wanderTimer = 0;
  deadTimer = 0;
  deathProgress = 0;
  flinchTimer = 0;
  hitFlash = 0;
  home: THREE.Vector3;
  hpBar: THREE.Sprite | null = null;
  hpBg: THREE.Sprite | null = null;
  muzzle: THREE.Object3D;
  gunTip: THREE.Object3D;
  y: number;
  alerted = false;
  outpost = -1; // which outpost wave this enemy belongs to (-1 = roaming/adds)
  summonTimer = 14;
  slamTimer = 3;
  awareness = 0; // 0..1 detection progress
  investigateTarget: THREE.Vector3 | null = null;
  investigateTimer = 0;
  runningToAlarm = -1; // outpost index if running to trigger alarm tower
  mats: THREE.MeshStandardMaterial[] = [];

  constructor(kind: EnemyKind, x: number, z: number) {
    this.kind = kind;
    const st = ENEMY_STATS[kind];
    this.maxHp = this.hp = st.hp;
    this.speed = st.speed * (0.9 + Math.random() * 0.2);
    this.y = getTerrainHeight(x, z);
    this.home = new THREE.Vector3(x, this.y, z);

    this.rig = enemyFactory.buildEnemy(kind);
    this.group = this.rig.root;
    this.group.position.set(x, this.y, z);
    this.muzzle = this.rig.muzzle;
    this.gunTip = this.rig.muzzle;

    // enemy gun tip muzzle flash sprite
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffcc55, transparent: true, opacity: 0, depthWrite: false }));
    flash.scale.setScalar(0.9);
    this.muzzle.add(flash);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o.material && (o.material as THREE.Material).visible === false) {
          o.castShadow = false;
        } else {
          o.castShadow = true;
        }
        o.userData.enemy = this;
        if (!o.userData.part) o.userData.part = "body";
        if (o.material instanceof THREE.MeshStandardMaterial) {
          o.material = o.material.clone();
          this.mats.push(o.material);
        }
      }
    });
  }

  get alive() { return this.state !== "dead"; }
}

// ================================================================ engine
export class FPEngine {
  private canvas: HTMLCanvasElement;
  private cb: EngineCallbacks;
  private settings: Settings;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: WorldRefs | null = null;
  private audio = new GameAudio();
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private softTex = softCircleTexture();

  private mode: "menu" | "playing" | "paused" | "over" = "menu";
  private locked = false;
  private disposed = false;

  // player
  private pos = new THREE.Vector3(0, 8, 124);
  private vel = new THREE.Vector3();
  private yaw = 0; // 0 faces -Z (toward island center from south beach)
  private pitch = 0;
  private hp = 100; private maxHp = 100;
  private stamina = 100;
  private staminaDelay = 0;
  private lastDamage = -99;
  private grounded = true;
  private bobPhase = 0;
  private trauma = 0;
  private ads = 0; // 0..1
  private adsHeld = false;
  private firing = false;
  private semiLatch = false;

  // weapons state
  private wstate = WEAPONS.map((w) => ({ mag: w.magSize, reserve: w.startReserve, reloading: 0 }));
  private windex = 0;
  private switchTimer = 0;
  private fireTimer = 0;
  private grenades = 3;
  private medkits = 2;
  private molotovs = 2;
  private rocks = 5;
  private grenadeCD = 0;
  private molotovCD = 0;
  private rockCD = 0;
  private meleeCD = 0;
  private healTimer = 0;

  // stealth state
  private crouched = false;
  private concealed = false;
  private takedownTarget: Enemy | null = null;
  private closestSpotter: { angle: number; level: number } | null = null;
  private spotterAudioTimer = 0;

  // guns viewmodel
  private gunRig = new THREE.Group();
  private gunModels: THREE.Group[] = [];
  private weaponRigs: WeaponRigParts[] = [];
  private casingMgr: CasingManager;
  private weaponSway = new THREE.Vector2();
  private muzzleFlash: THREE.Sprite;
  private muzzleLight: THREE.PointLight;
  private gunKick = 0;
  private wasInScope = false;
  private steadyBreath = false;

  // entities
  private enemies: Enemy[] = [];
  private hitMeshes: THREE.Object3D[] = [];
  private particles: { sp: THREE.Sprite; vel: THREE.Vector3; life: number; maxLife: number; grav: number; grow: number }[] = [];
  private tracers: { m: THREE.Mesh; life: number }[] = [];
  private lights: { l: THREE.PointLight; life: number; maxLife: number; peak: number }[] = [];
  private pickups: { kind: "medkit" | "ammo" | "grenade"; mesh: THREE.Group; taken: boolean; bob: number }[] = [];
  private decals: THREE.Mesh[] = [];
  private nades: { mesh: THREE.Mesh; vel: THREE.Vector3; fuse: number }[] = [];
  private arrows: { mesh: THREE.Group; vel: THREE.Vector3; stuck: boolean; target?: Enemy; life: number }[] = [];
  private firePatches: { mesh: THREE.Group; light: THREE.PointLight; pos: THREE.Vector3; life: number; dpsTimer: number }[] = [];
  private thrownRocks: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; bounced: boolean }[] = [];
  private molotovFlasks: { mesh: THREE.Group; vel: THREE.Vector3; life: number }[] = [];
  private beacon: THREE.Mesh | null = null;

  // objectives
  private outpostQuota: number[] = [6, 8, 10];
  private outpostKills: number[] = [0, 0, 0];
  private outpostActive: boolean[] = [false, false, false];
  private outpostCaptured: boolean[] = [false, false, false];
  private bossSpawned = false;
  private boss: Enemy | null = null;
  private gameTime = 0;

  // stats
  private kills = 0; private headshots = 0; private shots = 0; private hits = 0; private score = 0;
  private killStreak = 0; private streakTimer = 0;

  // input
  private keys = new Set<string>();
  private touchMove = { x: 0, z: 0 };
  private touchFire = false;
  private hudTimer = 0;
  private menuTime = 0;
  private endTimer = -1;
  private victoryFlag = false;
  private muted = false;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks, settings: Settings) {
    this.canvas = canvas;
    this.cb = cb;
    this.settings = { ...settings };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(settings.quality === "high" ? Math.min(1.6, window.devicePixelRatio) : 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.08, 1500);
    this.scene.add(this.camera);

    this.casingMgr = new CasingManager(this.scene);

    // gun rig
    this.camera.add(this.gunRig);
    this.gunRig.position.set(0.24, -0.22, -0.42);
    this.weaponRigs = [
      weaponFactory.buildAK47(),
      weaponFactory.buildSPAS12(),
      weaponFactory.buildSVD(),
      weaponFactory.buildBow(),
      weaponFactory.buildDeagle(),
      weaponFactory.buildScar(),
      weaponFactory.buildPistol10mm(),
    ];
    this.weaponRigs.forEach((wr, i) => {
      wr.group.visible = i === 0;
      this.gunModels.push(wr.group);
      this.gunRig.add(wr.group);
    });
    this.muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.muzzleFlash.scale.setScalar(0.5);
    this.muzzleLight = new THREE.PointLight(0xffb14e, 0, 18, 1.8);
    this.gunRig.add(this.muzzleFlash, this.muzzleLight);

    this.bindListeners();
    this.resetWorld();
    this.loop();
  }

  // ---------------------------------------------------------- setup
  private resetWorld() {
    // clear scene (keep camera)
    for (let i = this.scene.children.length - 1; i >= 0; i--) {
      const o = this.scene.children[i];
      if (o !== this.camera) this.scene.remove(o);
    }
    this.world = buildWorld(this.scene, this.settings.quality);
    this.casingMgr?.clear();
    this.enemies = [];
    this.hitMeshes = [];
    this.particles = [];
    this.tracers = [];
    this.lights = [];
    this.pickups = [];
    this.nades = [];
    this.decals = [];
    this.beacon = null;
    // beacon pillar
    const bmat = new THREE.MeshBasicMaterial({ color: 0xff9d2e, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 60, 12, 1, true), bmat);
    this.beacon.position.y = 30;
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    // static pickups at spawn + outposts
    this.spawnPickup("medkit", 3, 110);
    this.spawnPickup("ammo", -3, 110);
    this.world.outposts.forEach((o) => {
      this.spawnPickup("ammo", o.x + 3, o.z + 3);
      this.spawnPickup(Math.random() > 0.5 ? "medkit" : "grenade", o.x - 3, o.z - 3);
    });
    for (let i = 0; i < 6; i++) {
      const x = (Math.random() - 0.5) * 180, z = (Math.random() - 0.5) * 180;
      if (getTerrainHeight(x, z) > 1.5) this.spawnPickup(Math.random() > 0.6 ? "ammo" : "medkit", x, z);
    }
  }


  // ---------------------------------------------------------- listeners
  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Tab") e.preventDefault();
    this.keys.add(e.code);
    if (this.mode !== "playing") return;
    if (e.code === "Digit1") this.switchWeapon(0);
    if (e.code === "Digit2") this.switchWeapon(1);
    if (e.code === "Digit3") this.switchWeapon(2);
    if (e.code === "Digit4") this.switchWeapon(3);
    if (e.code === "Digit5") this.switchWeapon(4);
    if (e.code === "Digit6") this.switchWeapon(5);
    if (e.code === "Digit7") this.switchWeapon(6);
    if (e.code === "KeyR") this.startReload();
    if (e.code === "KeyG") this.throwGrenade();
    if (e.code === "KeyX") this.throwMolotov();
    if (e.code === "KeyT") this.throwRock();
    if (e.code === "KeyC" || e.code === "ControlLeft" || e.code === "ControlRight") this.toggleCrouch();
    if (e.code === "KeyE") this.tryInteract();
    if (e.code === "KeyV" || e.code === "KeyF") {
      if (this.takedownTarget) this.performTakedown(this.takedownTarget);
      else this.melee();
    }
    if (e.code === "KeyH" || e.code === "KeyQ") this.heal();
    if (e.code === "KeyM") this.toggleMute();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.mode !== "playing") return;
    const isSniper = this.windex === 2;
    const inScope = isSniper && this.ads > 0.35;
    const fovScale = inScope
      ? (this.camera.fov / this.settings.fov) * 0.72
      : this.ads > 0.5
      ? 0.7
      : 1;
    const s = this.settings.sensitivity * fovScale * 0.0022;
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s * (this.settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    const swayAmpX = inScope ? 0.0001 : 0.0006;
    const swayAmpY = inScope ? 0.0001 : 0.0005;
    this.weaponSway.x = Math.max(-0.06, Math.min(0.06, this.weaponSway.x - e.movementX * swayAmpX));
    this.weaponSway.y = Math.max(-0.05, Math.min(0.05, this.weaponSway.y + e.movementY * swayAmpY));
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked || this.mode !== "playing") return;
    if (e.button === 0) { this.firing = true; this.semiLatch = false; }
    if (e.button === 2) this.adsHeld = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
    if (e.button === 2) this.adsHeld = false;
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.locked || this.mode !== "playing") return;
    const n = WEAPONS.length;
    const d = e.deltaY > 0 ? 1 : n - 1;
    this.switchWeapon((this.windex + d) % n);
  };
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    this.cb.onLockChange(this.locked);
    if (!this.locked && this.mode === "playing") {
      this.mode = "paused";
      this.firing = false;
      this.adsHeld = false;
    }
  };
  private onContext = (e: Event) => e.preventDefault();

  private bindListeners() {
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.canvas.addEventListener("contextmenu", this.onContext);
  }

  // ---------------------------------------------------------- public API
  setSettings(s: Settings) {
    const qChanged = s.quality !== this.settings.quality;
    this.settings = { ...s };
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(s.quality === "high" ? Math.min(1.6, window.devicePixelRatio) : 1);
    this.audio.setVolume(this.muted ? 0 : s.volume);
    if (qChanged && this.mode === "menu") this.resetWorld();
  }
  toggleMute() {
    this.muted = !this.muted;
    this.audio.setVolume(this.muted ? 0 : this.settings.volume);
    this.cb.onEvent({ type: "toast", title: this.muted ? "AUDIO MUTED" : "AUDIO ON", sub: "Press M to toggle" });
  }
  requestLock() { this.audio.resume(); this.canvas.requestPointerLock(); }
  startMenu() { this.mode = "menu"; }
  startGame() {
    this.audio.resume();
    this.audio.startAmbient();
    this.resetWorld();
    this.enemies.forEach((e) => this.scene.remove(e.group));
    this.enemies = []; this.hitMeshes = [];
    this.pos.set(0, getTerrainHeight(0, 124) + 1, 124);
    this.vel.set(0, 0, 0);
    this.yaw = 0; this.pitch = 0;
    this.hp = this.maxHp; this.stamina = 100;
    this.wstate = WEAPONS.map((w) => ({ mag: w.magSize, reserve: w.startReserve, reloading: 0 }));
    this.windex = 0; this.grenades = 3; this.medkits = 2; this.molotovs = 2; this.rocks = 5;
    this.crouched = false; this.concealed = false; this.takedownTarget = null; this.closestSpotter = null;
    this.arrows.forEach((a) => this.scene.remove(a.mesh)); this.arrows = [];
    this.firePatches.forEach((f) => { this.scene.remove(f.mesh); this.scene.remove(f.light); }); this.firePatches = [];
    this.thrownRocks.forEach((r) => this.scene.remove(r.mesh)); this.thrownRocks = [];
    this.molotovFlasks.forEach((m) => this.scene.remove(m.mesh)); this.molotovFlasks = [];
    this.outpostQuota = [6, 8, 10]; this.outpostKills = [0, 0, 0];
    this.outpostActive = [false, false, false]; this.outpostCaptured = [false, false, false];
    this.bossSpawned = false; this.boss = null;
    this.kills = 0; this.headshots = 0; this.shots = 0; this.hits = 0; this.score = 0;
    this.gameTime = 0; this.endTimer = -1; this.killStreak = 0;
    this.updateGunVisibility();
    this.mode = "playing";
    this.requestLock();
    this.audio.objective();
    this.cb.onEvent({ type: "toast", title: "LIBERATE SHARK COVE", sub: "Follow the orange beacon — eliminate all hostiles", color: "orange" });
    this.pushHUD();
  }
  resume() {
    if (this.mode === "paused") { this.mode = "playing"; this.requestLock(); }
  }
  pauseGame() {
    if (this.mode === "playing") {
      this.mode = "paused";
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  quitToMenu() {
    this.mode = "menu";
    if (document.pointerLockElement) document.exitPointerLock();
  }
  getMode() { return this.mode; }
  // touch
  setTouchMove(x: number, z: number) { this.touchMove.x = x; this.touchMove.z = z; }
  addTouchLook(dx: number, dy: number) {
    if (this.mode !== "playing") return;
    const s = this.settings.sensitivity * 0.0042;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }
  setTouchFire(f: boolean) { this.touchFire = f; if (f) this.semiLatch = false; }
  setTouchAds(f: boolean) { this.adsHeld = f; }
  touchJump() { this.tryJump(); }
  touchReload() { this.startReload(); }
  touchWeapon(i: number) { this.switchWeapon(i); }
  touchGrenade() { this.throwGrenade(); }
  touchMolotov() { this.throwMolotov(); }
  touchRock() { this.throwRock(); }
  touchCrouch() { this.toggleCrouch(); }
  touchMelee() {
    if (this.takedownTarget) this.performTakedown(this.takedownTarget);
    else this.melee();
  }
  touchHeal() { this.heal(); }

  dispose() {
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    this.audio.stopAmbient();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------- loop
  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.mode === "menu") {
      this.menuTime += dt;
      const a = this.menuTime * 0.045;
      this.camera.position.set(Math.cos(a) * 175, 42 + Math.sin(this.menuTime * 0.1) * 6, Math.sin(a) * 175);
      this.camera.lookAt(0, 10, -10);
      this.camera.fov += ((this.settings.fov - 12) - this.camera.fov) * dt * 2;
      this.camera.updateProjectionMatrix();
      this.gunRig.visible = false;
      this.world?.update(dt, t);
      this.updateParticles(dt);
      this.updateTracers(dt);
      this.updateLights(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.mode === "paused" || this.mode === "over") {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // playing
    this.gunRig.visible = true;
    this.gameTime += dt;
    this.updatePlayer(dt, t);
    this.updateWeapons(dt, t);
    this.updateEnemies(dt, t);
    this.updateObjectives(dt);
    this.updateParticles(dt);
    this.updateTracers(dt);
    this.updateLights(dt);
    this.updatePickups(dt, t);
    this.updateGrenades(dt);
    this.updateArrows(dt);
    this.updateMolotovs(dt);
    this.updateFirePatches(dt);
    this.updateThrownRocks(dt);
    if (this.closestSpotter && this.closestSpotter.level > 0.35) {
      this.spotterAudioTimer -= dt;
      if (this.spotterAudioTimer <= 0) {
        this.spotterAudioTimer = Math.max(0.2, 0.9 - this.closestSpotter.level * 0.6);
        this.audio.detectionTension(this.closestSpotter.level);
      }
    }
    this.world?.update(dt, t);
    if (this.beacon && this.beacon.visible) {
      this.beacon.rotation.y += dt * 0.8;
      (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(t * 3) * 0.1;
    }
    // streak decay
    this.streakTimer -= dt;
    if (this.streakTimer <= 0) this.killStreak = 0;
    // regen
    if (this.gameTime - this.lastDamage > 4 && this.hp < this.maxHp && this.hp > 0) {
      this.hp = Math.min(this.maxHp, this.hp + 15 * dt);
    }
    // heal over time
    if (this.healTimer > 0) {
      this.healTimer -= dt;
      this.hp = Math.min(this.maxHp, this.hp + 40 * dt);
    }
    // trauma decay
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    // end of game
    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer < 0) {
        this.mode = "over";
        if (document.pointerLockElement) document.exitPointerLock();
        const stats: Stats = {
          kills: this.kills, headshots: this.headshots, shots: this.shots, hits: this.hits,
          accuracy: this.shots ? this.hits / this.shots : 0, time: this.gameTime, score: this.score,
        };
        if (this.victoryFlag) this.audio.victory(); else this.audio.defeat();
        this.cb.onEvent({ type: "gameover", victory: this.victoryFlag, stats });
      }
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.1; this.pushHUD(); }
    this.renderer.render(this.scene, this.camera);
  };

  // ---------------------------------------------------------- player
  private tryJump() {
    if (this.grounded && this.stamina > 8 && this.mode === "playing") {
      if (this.crouched) { this.crouched = false; this.pushHUD(); }
      this.vel.y = 7.6;
      this.grounded = false;
      this.audio.jump();
    }
  }

  toggleCrouch() {
    this.crouched = !this.crouched;
    this.pushHUD();
  }

  private updatePlayer(dt: number, _t: number) {
    const sprintKey = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    let ix = 0, iz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iz -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iz += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
    ix += this.touchMove.x; iz += this.touchMove.z;
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }
    if (this.keys.has("Space")) this.tryJump();
    this.keys.delete("Space"); // edge-trigger jump via keydown repeat guard

    const inSniperScope = this.windex === 2 && this.ads > 0.35;
    if (inSniperScope && sprintKey && this.stamina > 4) {
      this.stamina = Math.max(0, this.stamina - 14 * dt);
      this.staminaDelay = 1.5;
      this.steadyBreath = true;
    } else {
      this.steadyBreath = false;
    }

    const wantSprint = !this.crouched && !inSniperScope && sprintKey && iz < -0.1 && this.stamina > 1 && this.ads < 0.3;
    const sprinting = wantSprint;
    if (sprinting) { this.stamina = Math.max(0, this.stamina - 17 * dt); this.staminaDelay = 1; }
    else if (!this.steadyBreath) {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + 15 * dt);
    }
    const groundH = getTerrainHeight(this.pos.x, this.pos.z);
    const inWater = groundH < WATER_LEVEL + 0.1;
    let speed = sprinting ? 11 : this.crouched ? 3.6 : 7;
    if (this.ads > 0.5) speed = this.windex === 2 ? 2.5 : 4;
    if (inWater) speed *= 0.55;
    if (this.hp <= 30) speed *= 0.9;

    // Check foliage concealment
    let inBush = false;
    if (this.world) {
      for (const b of this.world.bushes) {
        if (Math.hypot(this.pos.x - b.x, this.pos.z - b.z) < b.r) {
          inBush = true;
          break;
        }
      }
    }
    this.concealed = inBush && this.crouched;

    // forward/right vectors for yaw (camera looks -Z rotated)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const vx = (rx * ix + fx * -iz);
    const vz = (rz * ix + fz * -iz);
    const accel = this.grounded ? 14 : 4;
    this.vel.x += (vx * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (vz * speed - this.vel.z) * Math.min(1, accel * dt);
    this.vel.y -= 22 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // colliders
    const world = this.world!;
    for (const c of world.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.5;
      if (d < min && d > 0.001) {
        const push = (min - d);
        this.pos.x += (dx / d) * push;
        this.pos.z += (dz / d) * push;
      }
    }
    // world bounds
    const dc = Math.hypot(this.pos.x, this.pos.z);
    if (dc > 156) {
      this.pos.x *= 156 / dc;
      this.pos.z *= 156 / dc;
    }
    const gh = getTerrainHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) {
      if (!this.grounded && this.vel.y < -12) {
        this.audio.land();
        const fd = (-this.vel.y - 12) * 4;
        if (fd > 5) this.damagePlayer(fd, null);
        this.trauma = Math.min(1, this.trauma + 0.25);
      } else if (!this.grounded) this.audio.land();
      this.pos.y = gh;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y > gh + 0.05) this.grounded = false;

    // footsteps + bob (silent when crouched!)
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (!this.crouched && this.grounded && hSpeed > 1.5) {
      this.audio.footstep(sprinting);
      this.bobPhase += dt * (sprinting ? 13 : 9);
    } else if (this.crouched && this.grounded && hSpeed > 0.5) {
      this.bobPhase += dt * 5;
    }
    const bob = Math.sin(this.bobPhase) * (hSpeed > 1.5 ? (sprinting ? 0.05 : 0.032) : 0.008);
    const bobX = Math.cos(this.bobPhase * 0.5) * (hSpeed > 1.5 ? 0.02 : 0.005);
    // camera
    const shake = this.trauma * this.trauma;
    const shx = (Math.random() - 0.5) * shake * 0.12;
    const shy = (Math.random() - 0.5) * shake * 0.12;
    const eyeH = this.crouched ? 1.05 : 1.66;
    this.camera.position.set(
      this.pos.x + bobX * Math.cos(this.yaw),
      this.pos.y + eyeH + bob + shy,
      this.pos.z + bobX * -Math.sin(this.yaw)
    );
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw + shx;
    this.camera.rotation.x = this.pitch + shy * 0.5;
    this.camera.rotation.z = Math.sin(this.bobPhase * 0.5) * 0.003 + (Math.random() - 0.5) * shake * 0.02;

    // fov: ads / sniper zoom / sprint
    const isSniper = this.windex === 2;
    const inScope = isSniper && this.ads > 0.35;
    const baseFov = sprinting && hSpeed > 8 ? this.settings.fov + 6 : this.settings.fov;
    const zoomedFov = isSniper ? 14 : this.settings.fov - 24;
    const targetFov = THREE.MathUtils.lerp(baseFov, zoomedFov, this.ads);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    // Scope breathing sway (suppressed if holding breath)
    if (inScope && !this.steadyBreath) {
      this.camera.rotation.y += Math.sin(this.gameTime * 1.5) * 0.0014;
      this.camera.rotation.x += Math.cos(this.gameTime * 3.0) * 0.0009;
    }
  }

  // ---------------------------------------------------------- weapons
  private updateGunVisibility() {
    const isSniper = this.windex === 2;
    const inScope = isSniper && this.ads > 0.35;
    this.gunModels.forEach((g, i) => { g.visible = i === this.windex && !inScope; });
  }
  private switchWeapon(i: number) {
    if (i === this.windex || this.switchTimer > 0 || this.mode !== "playing") return;
    this.windex = i;
    this.switchTimer = 0.38;
    this.firing = false;
    this.audio.weaponSwitch();
    this.updateGunVisibility();
    this.pushHUD();
  }
  private startReload() {
    const st = this.wstate[this.windex];
    const def = WEAPONS[this.windex];
    if (st.reloading > 0 || st.mag >= def.magSize || st.reserve <= 0) return;
    st.reloading = def.reloadTime;
    this.audio.reload();
  }
  private muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const wr = this.weaponRigs[this.windex];
    if (wr && wr.muzzle) wr.muzzle.getWorldPosition(out);
    else out.copy(this.camera.position);
    return out;
  }

  private updateWeapons(dt: number, t: number) {
    const def = WEAPONS[this.windex];
    const st = this.wstate[this.windex];
    this.fireTimer -= dt;
    this.switchTimer -= dt;
    this.grenadeCD -= dt;
    this.meleeCD -= dt;
    // ads
    const adsTarget = this.adsHeld && st.reloading <= 0 && this.switchTimer <= 0 ? 1 : 0;
    this.ads += (adsTarget - this.ads) * Math.min(1, dt * 12);
    // reload
    if (st.reloading > 0) {
      st.reloading -= dt;
      if (st.reloading <= 0) {
        const need = def.magSize - st.mag;
        const take = Math.min(need, st.reserve);
        st.mag += take;
        st.reserve -= take;
        this.pushHUD();
      }
    }
    // fire
    const wantFire = (this.firing || this.touchFire) && this.switchTimer <= 0 && st.reloading <= 0 && this.meleeCD < 0.35;
    if (wantFire) {
      if (!def.auto && this.semiLatch) { /* wait for re-click */ }
      else if (this.fireTimer <= 0) {
        if (st.mag <= 0) {
          this.audio.dryFire();
          this.fireTimer = 0.25;
          this.semiLatch = true;
          this.cb.onEvent({ type: "ammo-warning" });
          this.startReload();
        } else {
          this.fireBullet();
          this.fireTimer = 60 / def.rpm;
          this.semiLatch = true;
        }
      }
    }
    if (!this.firing && !this.touchFire) this.semiLatch = false;

    // ---- realistic weapon kinematics, bobbing & sway ----
    const isSniper = this.windex === 2;
    const inScope = isSniper && this.ads > 0.35;

    // Immediately push HUD when scope state toggles so overlay never lags
    if (this.wasInScope !== inScope) {
      this.wasInScope = inScope;
      this.pushHUD();
    }

    // Hide weapon model when looking through telescopic sniper scope
    this.gunRig.visible = !inScope;

    const adsK = this.ads * this.ads;
    const hipPos = new THREE.Vector3(0.24, -0.22, -0.42);
    const ADS_POSITIONS: THREE.Vector3[] = [
      new THREE.Vector3(0, -0.082, -0.28),     // 0: AK-47 (iron sights notch)
      new THREE.Vector3(0, -0.076, -0.28),     // 1: SPAS-12 (ghost ring & bead)
      new THREE.Vector3(0.02, -0.11, -0.25),   // 2: SVD (PSO-1 optic eye alignment)
      new THREE.Vector3(-0.035, -0.09, -0.26), // 3: Recurve Bow (fiber optic pin)
      new THREE.Vector3(0, -0.076, -0.25),     // 4: Deagle (combat 3-dot sights)
      new THREE.Vector3(0, -0.083, -0.24),     // 5: SCAR-H (optical scope aperture)
      new THREE.Vector3(0, -0.076, -0.24),     // 6: 10MM (combat sights)
    ];
    const targetAdsPos = ADS_POSITIONS[this.windex] || new THREE.Vector3(0, -0.08, -0.28);
    this.gunRig.position.lerpVectors(hipPos, targetAdsPos, adsK);
    this.gunKick = Math.max(0, this.gunKick - dt * 6);
    this.gunRig.position.z += this.gunKick * 0.09;
    this.gunRig.rotation.x = this.gunKick * 0.12;

    // switch dip
    if (this.switchTimer > 0) {
      const k = Math.sin(Math.min(1, this.switchTimer / 0.38) * Math.PI);
      this.gunRig.position.y -= k * 0.25;
      this.gunRig.rotation.x -= k * 0.5;
    }
    // reload dip
    if (st.reloading > 0) {
      const k = Math.sin((1 - st.reloading / def.reloadTime) * Math.PI);
      this.gunRig.rotation.x -= k * 0.7;
      this.gunRig.position.y -= k * 0.12;
    }

    // Lissajous walking / sprinting weapon bob
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    const sprint = hSpeed > 8.0;
    const bobFreq = sprint ? 13 : 8;
    const bobWeight = Math.min(1, hSpeed / 5);
    const bobX = Math.cos(t * bobFreq * 0.5) * (sprint ? 0.016 : 0.007) * bobWeight;
    const bobY = Math.abs(Math.sin(t * bobFreq)) * (sprint ? 0.02 : 0.009) * bobWeight;

    // Inertia sway recovery
    this.weaponSway.lerp(new THREE.Vector2(0, 0), dt * 10);
    const swayFactor = 1 - this.ads * 0.85;
    this.gunRig.position.x += this.weaponSway.x * swayFactor + bobX;
    this.gunRig.position.y += this.weaponSway.y * swayFactor - bobY;
    this.gunRig.rotation.y = this.weaponSway.x * 0.8;
    this.gunRig.rotation.z = -this.weaponSway.x * 0.6;

    // Return mechanical parts (slide / pump / bolt) smoothly to battery
    this.weaponRigs.forEach((wr) => {
      if (wr.movingPart) {
        wr.movingPart.position.z = THREE.MathUtils.lerp(wr.movingPart.position.z, 0, dt * 18);
      }
    });

    // Update ejecting brass shell physics
    this.casingMgr.update(dt, (x: number, z: number) => getTerrainHeight(x, z));

    // melee lunge
    if (this.meleeCD > 0.45) {
      const k = (this.meleeCD - 0.45) / 0.25;
      this.gunRig.position.z -= Math.sin(k * Math.PI) * 0.3;
    }
    // muzzle flash decay
    const mf = this.muzzleFlash.material as THREE.SpriteMaterial;
    mf.opacity = Math.max(0, mf.opacity - dt * 14);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 320);
    const tip = new THREE.Vector3();
    this.muzzleWorld(tip);
    this.gunRig.worldToLocal(tip);
    this.muzzleFlash.position.copy(tip);
    this.muzzleLight.position.copy(tip);
  }

  private fireBullet() {
    const def = WEAPONS[this.windex];
    const st = this.wstate[this.windex];

    // Bow has dedicated projectile physics
    if (this.windex === 3) {
      this.fireArrow();
      return;
    }

    st.mag--;
    const isShotgun = def.id === "shotgun";
    const isSniper = def.id === "sniper";
    const isPistol = def.id === "pistol" || def.id === "pistol10mm";
    const pellets = isShotgun ? 8 : 1;
    this.shots += pellets;

    const sndKind: "rifle" | "shotgun" | "sniper" | "bow" | "pistol" =
      isShotgun ? "shotgun" : isSniper ? "sniper" : def.id === "bow" ? "bow" : isPistol ? "pistol" : "rifle";
    this.audio.shoot(sndKind);

    // Eject realistic brass casing & cycle mechanical weapon parts
    const wr = this.weaponRigs[this.windex];
    if (wr) {
      const ejectPos = new THREE.Vector3();
      wr.ejector.getWorldPosition(ejectPos);
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const cType = isShotgun ? "shotgun" : isPistol ? "pistol" : "rifle";
      this.casingMgr.spawnCasing(ejectPos, camRight, cType);

      if (wr.movingPart) {
        if (isShotgun) wr.movingPart.position.z += 0.09;
        else if (isPistol) wr.movingPart.position.z += 0.052;
        else wr.movingPart.position.z += 0.058;
      }
    }

    const from = this.muzzleWorld(new THREE.Vector3());

    for (let p = 0; p < pellets; p++) {
      const spread = def.spread + (def.adsSpread - def.spread) * this.ads;
      const moveSpread = Math.hypot(this.vel.x, this.vel.z) > 8 ? 0.012 : 0;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      dir.x += (Math.random() - 0.5) * 2 * (spread + moveSpread);
      dir.y += (Math.random() - 0.5) * 2 * (spread + moveSpread);
      dir.z += (Math.random() - 0.5) * 2 * (spread + moveSpread) * 0.3;
      dir.normalize();
      this.raycaster.set(this.camera.position, dir);
      this.raycaster.far = def.range;

      const targets: THREE.Object3D[] = [...this.hitMeshes, ...this.world!.solidMeshes];
      const hits = this.raycaster.intersectObjects(targets, true);
      let end: THREE.Vector3;

      if (hits.length > 0) {
        const h = hits[0];
        end = h.point.clone();
        const ud = h.object.userData as { enemy?: Enemy; part?: string; alarmIndex?: number };
        const enemy = ud.enemy ?? (h.object.parent?.userData.enemy as Enemy | undefined);
        const part = (ud.part ?? h.object.parent?.userData.part ?? "body") as string;
        const isAlarm = ud.part === "alarm" || h.object.parent?.userData.part === "alarm";

        if (enemy && enemy.alive) {
          this.hits++;
          const mult = part === "head" ? def.headMult : 1;
          const falloff = isShotgun ? Math.max(0.2, 1 - h.distance / 50) : Math.max(0.45, 1 - h.distance / (def.range * 1.4));
          const dmg = def.damage * mult * falloff;
          if (part === "head") this.headshots++;
          this.damageEnemy(enemy, dmg, part === "head", h.point);
        } else if (isAlarm && this.world) {
          const alIdx = (ud.alarmIndex ?? h.object.parent?.userData.alarmIndex) as number | undefined;
          if (alIdx !== undefined) {
            this.hits++;
            this.world.disableAlarm(alIdx);
            this.audio.sabotageAlarm();
            this.impactEffect(h.point, h.face?.normal ?? new THREE.Vector3(0, 1, 0));
            this.cb.onEvent({ type: "toast", title: "✓ OUTPOST ALARM DESTROYED", sub: "Reinforcements disabled", color: "green" });
          }
        } else {
          const barrel = this.world!.barrels.find((b) => b.alive && (b.mesh === h.object || b.mesh === h.object.parent));
          if (barrel) {
            this.hits++;
            this.explodeBarrel(barrel);
          } else {
            this.impactEffect(h.point, h.face?.normal ?? new THREE.Vector3(0, 1, 0));
          }
        }
      } else {
        end = this.camera.position.clone().add(dir.clone().multiplyScalar(def.range));
      }
      this.spawnTracer(from, end, isShotgun ? 0xffcc77 : 0xffe082);
    }

    // ejected shell casing
    const shellDir = new THREE.Vector3(1, 0.7 + Math.random() * 0.3, 0.1).applyQuaternion(this.camera.quaternion);
    this.spawnParticle(from.clone(), shellDir.multiplyScalar(2.4 + Math.random() * 0.8), 0xd7aa46, 0.7, 0.14, 10, 0);
    // muzzle smoke wisp
    this.spawnParticle(from.clone(), new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.7, (Math.random() - 0.5) * 0.4), 0x9a9a96, 0.55, 0.28, -0.6, 1.4);

    // muzzle flash & light
    const mf = this.muzzleFlash.material as THREE.SpriteMaterial;
    mf.opacity = 1;
    mf.rotation = Math.random() * Math.PI;
    this.muzzleFlash.scale.setScalar(isShotgun ? 0.6 : isSniper ? 0.55 : 0.35 + Math.random() * 0.25);
    this.muzzleLight.intensity = isShotgun ? 48 : isSniper ? 50 : 26;
    this.gunKick = Math.min(1, this.gunKick + (isShotgun ? 0.95 : isSniper ? 0.9 : 0.42));

    // recoil
    this.pitch = Math.min(1.45, this.pitch + def.kick * (this.ads > 0.5 ? 0.7 : 1));
    this.yaw += (Math.random() - 0.5) * def.kick * 0.5;
    this.trauma = Math.min(1, this.trauma + (isShotgun || isSniper ? 0.18 : 0.06));

    // alert nearby enemies (bow is silent, sniper is loud)
    const alertDist = isSniper ? 110 : isShotgun ? 75 : (def.id === "rifle" || def.id === "scar") ? 65 : 45;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.group.position.distanceTo(this.pos);
      if (d < alertDist) this.alertEnemy(e);
    }

    if (st.mag === 0) this.cb.onEvent({ type: "ammo-warning" });
    this.pushHUD();
  }

  // ---------------------------------------------------------- arrows & tacticals
  private fireArrow() {
    const st = this.wstate[3];
    st.mag--;
    this.shots++;
    this.audio.shoot("bow");

    // Bowstring snap recoil
    const wr = this.weaponRigs[3];
    if (wr && wr.movingPart) {
      wr.movingPart.position.z = 0.06;
    }

    const from = this.muzzleWorld(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const spread = this.ads > 0.5 ? 0.001 : 0.008;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.normalize();

    const arrowGrp = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 4), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 }));
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.42;
    const fletchMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const fletch = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.12), fletchMat);
    fletch.position.z = 0.35;
    arrowGrp.add(shaft, tip, fletch);
    arrowGrp.position.copy(from);
    arrowGrp.lookAt(from.clone().add(dir));
    this.scene.add(arrowGrp);

    this.arrows.push({
      mesh: arrowGrp,
      vel: dir.multiplyScalar(68),
      stuck: false,
      life: 18,
    });
    this.pushHUD();
  }

  private updateArrows(dt: number) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      if (a.stuck) {
        if (a.mesh.position.distanceTo(this.pos) < 2.0) {
          const st = this.wstate[3];
          if (st.reserve < WEAPONS[3].maxReserve) {
            st.reserve++;
            this.audio.pickup();
            this.cb.onEvent({ type: "pickup", text: "RETRIEVED ARROW (+1)" });
            this.pushHUD();
          }
          this.scene.remove(a.mesh);
          this.arrows.splice(i, 1);
          continue;
        }
        if (a.life <= 0) {
          this.scene.remove(a.mesh);
          this.arrows.splice(i, 1);
        }
        continue;
      }
      a.vel.y -= 14 * dt;
      const step = a.vel.clone().multiplyScalar(dt);
      const nextPos = a.mesh.position.clone().add(step);

      const dir = step.clone().normalize();
      const len = step.length();
      this.raycaster.set(a.mesh.position, dir);
      this.raycaster.far = len + 0.1;
      const targets: THREE.Object3D[] = [...this.hitMeshes, ...this.world!.solidMeshes];
      const hits = this.raycaster.intersectObjects(targets, true);

      if (hits.length > 0) {
        const h = hits[0];
        a.stuck = true;
        a.mesh.position.copy(h.point);
        const ud = h.object.userData as { enemy?: Enemy; part?: string; alarmIndex?: number };
        const enemy = ud.enemy ?? (h.object.parent?.userData.enemy as Enemy | undefined);
        const part = (ud.part ?? h.object.parent?.userData.part ?? "body") as string;
        const isAlarm = ud.part === "alarm" || h.object.parent?.userData.part === "alarm";

        if (enemy && enemy.alive) {
          this.hits++;
          this.audio.arrowHit();
          const headshot = part === "head";
          const dmg = 110 * (headshot ? 3.0 : 1.0);
          if (headshot) this.headshots++;
          this.damageEnemy(enemy, dmg, headshot, h.point);
          this.scene.remove(a.mesh);
          enemy.group.add(a.mesh);
          enemy.group.worldToLocal(a.mesh.position);
          a.target = enemy;
        } else if (isAlarm && this.world) {
          const alIdx = (ud.alarmIndex ?? h.object.parent?.userData.alarmIndex) as number | undefined;
          if (alIdx !== undefined) {
            this.world.disableAlarm(alIdx);
            this.audio.sabotageAlarm();
            this.cb.onEvent({ type: "toast", title: "✓ OUTPOST ALARM DISABLED", sub: "Silent arrow sabotage", color: "green" });
          }
        } else {
          this.audio.arrowHit();
        }
      } else {
        a.mesh.position.copy(nextPos);
        a.mesh.lookAt(nextPos.clone().add(a.vel));
      }
      if (a.life <= 0) {
        this.scene.remove(a.mesh);
        this.arrows.splice(i, 1);
      }
    }
  }

  throwMolotov() {
    if (this.mode !== "playing" || this.molotovCD > 0 || this.molotovs <= 0) return;
    this.molotovs--;
    this.molotovCD = 1.2;
    this.audio.grenadeThrow();

    const g = new THREE.Group();
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x3b2e1e, transparent: true, opacity: 0.85, roughness: 0.3 }));
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08), new THREE.MeshBasicMaterial({ color: 0xff6622 }));
    wick.position.y = 0.14;
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff9933, transparent: true, opacity: 0.9 }));
    flame.scale.setScalar(0.4);
    flame.position.y = 0.18;
    g.add(bottle, wick, flame);
    g.position.copy(this.camera.position);
    this.scene.add(g);

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const vel = dir.multiplyScalar(19).add(new THREE.Vector3(0, 4.2, 0));
    this.molotovFlasks.push({ mesh: g, vel, life: 3.5 });
    this.cb.onEvent({ type: "toast", title: "MOLOTOV OUT!", color: "orange" });
    this.pushHUD();
  }

  private updateMolotovs(dt: number) {
    for (let i = this.molotovFlasks.length - 1; i >= 0; i--) {
      const m = this.molotovFlasks[i];
      m.life -= dt;
      m.vel.y -= 20 * dt;
      m.mesh.position.addScaledVector(m.vel, dt);
      m.mesh.rotation.x += dt * 8;
      m.mesh.rotation.z += dt * 6;
      const gh = getTerrainHeight(m.mesh.position.x, m.mesh.position.z);
      if (m.mesh.position.y <= gh + 0.1 || m.life <= 0) {
        const shatterPos = m.mesh.position.clone();
        shatterPos.y = gh;
        this.scene.remove(m.mesh);
        this.molotovFlasks.splice(i, 1);
        this.audio.molotovShatter();
        this.spawnFirePatch(shatterPos);
      }
    }
  }

  private spawnFirePatch(pos: THREE.Vector3) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: i % 2 ? 0xff4500 : 0xffa500, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending }));
      sp.scale.setScalar(0.8 + Math.random() * 0.7);
      sp.position.set((Math.random() - 0.5) * 3.5, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 3.5);
      g.add(sp);
    }
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.5, 12), new THREE.MeshBasicMaterial({ color: 0x110804, transparent: true, opacity: 0.8 }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.04;
    g.add(scorch);
    g.position.copy(pos);
    this.scene.add(g);

    const light = new THREE.PointLight(0xff6a00, 16, 12, 1.8);
    light.position.set(pos.x, pos.y + 1.2, pos.z);
    this.scene.add(light);

    this.firePatches.push({ mesh: g, light, pos: pos.clone(), life: 6.5, dpsTimer: 0 });
    this.trauma = Math.min(1, this.trauma + 0.18);
  }

  private updateFirePatches(dt: number) {
    for (let i = this.firePatches.length - 1; i >= 0; i--) {
      const f = this.firePatches[i];
      f.life -= dt;
      f.dpsTimer -= dt;
      f.light.intensity = 14 + Math.sin(f.life * 18) * 5;
      f.mesh.children.forEach((c) => {
        if (c instanceof THREE.Sprite) {
          c.scale.y = 0.8 + Math.sin(f.life * 14 + c.position.x * 3) * 0.3;
        }
      });
      if (f.dpsTimer <= 0) {
        f.dpsTimer = 0.35;
        this.audio.fireBurn();
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (e.group.position.distanceTo(f.pos) < 3.8) {
            this.damageEnemy(e, 26, false, f.pos);
          }
        }
        if (this.pos.distanceTo(f.pos) < 3.2) {
          this.damagePlayer(8, f.pos);
        }
      }
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.scene.remove(f.light);
        this.firePatches.splice(i, 1);
      }
    }
  }

  throwRock() {
    if (this.mode !== "playing" || this.rockCD > 0 || this.rocks <= 0) return;
    this.rocks--;
    this.rockCD = 1.0;
    this.audio.rockThrow();
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9 }));
    mesh.position.copy(this.camera.position);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const vel = dir.multiplyScalar(22).add(new THREE.Vector3(0, 3.8, 0));
    this.scene.add(mesh);
    this.thrownRocks.push({ mesh, vel, life: 4, bounced: false });
    this.cb.onEvent({ type: "toast", title: "ROCK THROWN", sub: "Luring guards...", color: "cyan" });
    this.pushHUD();
  }

  private updateThrownRocks(dt: number) {
    for (let i = this.thrownRocks.length - 1; i >= 0; i--) {
      const r = this.thrownRocks[i];
      r.life -= dt;
      r.vel.y -= 22 * dt;
      r.mesh.position.addScaledVector(r.vel, dt);
      const gh = getTerrainHeight(r.mesh.position.x, r.mesh.position.z);
      if (!r.bounced && r.mesh.position.y <= gh + 0.15) {
        r.bounced = true;
        r.mesh.position.y = gh + 0.1;
        r.vel.set(0, 0, 0);
        this.audio.rockClatter();
        const rockPos = r.mesh.position.clone();
        for (const e of this.enemies) {
          if (!e.alive || e.state === "combat") continue;
          if (e.group.position.distanceTo(rockPos) < 24) {
            e.investigateTarget = rockPos.clone();
            e.investigateTimer = 5.5;
            this.cb.onEvent({ type: "toast", title: "GUARD DISTRACTED", sub: `${ENEMY_STATS[e.kind].name} investigating noise` });
          }
        }
      }
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        this.thrownRocks.splice(i, 1);
      }
    }
  }

  tryInteract() {
    if (!this.world || this.mode !== "playing") return;
    for (const a of this.world.alarms) {
      if (!a.disabled && a.pos.distanceTo(this.pos) < 3.2) {
        this.world.disableAlarm(a.outpostIndex);
        this.audio.sabotageAlarm();
        this.score += 150;
        this.cb.onEvent({ type: "toast", title: "✓ ALARM BOX SABOTAGED +150", sub: "Silent sabotage successful", color: "green" });
        return;
      }
    }
  }

  performTakedown(e: Enemy) {
    if (!e.alive || this.mode !== "playing") return;
    this.audio.macheteTakedown();
    this.killEnemy(e, false);
    this.score += 250;
    this.cb.onEvent({ type: "toast", title: "☠ STEALTH TAKEDOWN +250", sub: "Silent knife execution", color: "gold" });
    this.takedownTarget = null;
    this.trauma = Math.min(1, this.trauma + 0.15);
  }

  // ---------------------------------------------------------- melee / grenade / heal
  private melee() {
    if (this.mode !== "playing" || this.meleeCD > 0) return;
    this.meleeCD = 0.7;
    this.audio.melee();
    let best: Enemy | null = null;
    let bestD = 3.0;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const to = e.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(this.camera.position);
      const d = to.length();
      if (d < bestD && to.normalize().dot(fwd) > 0.55) { best = e; bestD = d; }
    }
    if (best) {
      this.audio.meleeHit();
      this.hits++; this.shots++;
      const b: Enemy = best;
      setTimeout(() => {}, 0);
      this.damageEnemy(b, 130, false, b.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      this.trauma = Math.min(1, this.trauma + 0.2);
    }
  }

  private throwGrenade() {
    if (this.mode !== "playing" || this.grenadeCD > 0 || this.grenades <= 0) return;
    this.grenades--;
    this.grenadeCD = 1.0;
    this.audio.grenadeThrow();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2f3a2a, roughness: 0.6 }));
    mesh.position.copy(this.camera.position);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const vel = dir.multiplyScalar(17).add(new THREE.Vector3(0, 4.5, 0));
    this.scene.add(mesh);
    this.nades.push({ mesh, vel, fuse: 2.1 });
    this.pushHUD();
  }

  heal() {
    if (this.mode !== "playing" || this.medkits <= 0 || this.hp >= this.maxHp || this.healTimer > 0) return;
    this.medkits--;
    this.healTimer = 1.4;
    this.audio.heal();
    this.cb.onEvent({ type: "heal" });
    this.cb.onEvent({ type: "pickup", text: "FIELD SYRINGE USED" });
    this.pushHUD();
  }

  // ---------------------------------------------------------- damage & death
  damagePlayer(amount: number, fromPos: THREE.Vector3 | null) {
    if (this.mode !== "playing" || this.hp <= 0) return;
    this.hp -= amount;
    this.lastDamage = this.gameTime;
    this.trauma = Math.min(1, this.trauma + 0.3);
    this.audio.hurt();
    let angle = 0;
    if (fromPos) {
      const to = fromPos.clone().sub(this.pos);
      const worldAng = Math.atan2(-to.x, -to.z);
      angle = worldAng - this.yaw;
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
    }
    this.cb.onEvent({ type: "damage", amount, angle });
    if (this.hp <= 0) {
      this.hp = 0;
      this.endTimer = 1.4;
      this.victoryFlag = false;
    }
    this.pushHUD();
  }

  private damageEnemy(e: Enemy, dmg: number, headshot: boolean, point: THREE.Vector3) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.hitFlash = 1;
    e.flinchTimer = 0.28;
    this.alertEnemy(e);
    // alert pack
    for (const o of this.enemies) {
      if (o.alive && o.group.position.distanceTo(e.group.position) < 25) this.alertEnemy(o);
    }
    this.bloodEffect(point);
    if (e.hp <= 0) {
      this.killEnemy(e, headshot);
    } else {
      this.audio.hit(headshot);
      this.cb.onEvent({ type: "hitmarker", kill: false, headshot });
    }
  }

  private killEnemy(e: Enemy, headshot: boolean) {
    e.state = "dead";
    e.deadTimer = 3.2;
    e.deathProgress = 0;
    e.hitFlash = 0;
    e.mats.forEach((m) => m.emissive.setRGB(0, 0, 0));
    this.kills++;
    this.killStreak++;
    this.streakTimer = 4;
    const base = ENEMY_STATS[e.kind].score;
    const bonus = headshot ? 50 : 0;
    const streakBonus = this.killStreak >= 3 ? this.killStreak * 25 : 0;
    this.score += base + bonus + streakBonus;
    if (headshot) this.audio.headshotKill();
    else this.audio.kill();
    this.cb.onEvent({ type: "hitmarker", kill: true, headshot });
    const label = headshot ? `${ENEMY_STATS[e.kind].name} — HEADSHOT` : ENEMY_STATS[e.kind].name;
    this.cb.onEvent({ type: "killfeed", text: `☠ ${label}  +${base + bonus}`, headshot });
    if (this.killStreak === 3) this.cb.onEvent({ type: "toast", title: "TRIPLE KILL", sub: "Keep the pressure on", color: "red" });
    if (this.killStreak === 5) this.cb.onEvent({ type: "toast", title: "RAMPAGE ×5", sub: "The jungle fears you", color: "red" });
    if (this.killStreak === 8) this.cb.onEvent({ type: "toast", title: "UNSTOPPABLE ×8", sub: "Legend of the Rook Islands", color: "gold" });
    // remove from hit list
    this.hitMeshes = this.hitMeshes.filter((m) => (m.userData.enemy as Enemy) !== e);
    if (e.hpBar) e.hpBar.visible = false;
    if (e.hpBg) e.hpBg.visible = false;
    const dflash = e.muzzle.children[0] as THREE.Sprite | undefined;
    if (dflash) (dflash.material as THREE.SpriteMaterial).opacity = 0;
    // blood pool decal
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(0.65 + Math.random() * 0.45, 12),
      new THREE.MeshBasicMaterial({ color: 0x4d0b0b, transparent: true, opacity: 0.75, depthWrite: false })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(
      e.group.position.x + (Math.random() - 0.5) * 0.4,
      getTerrainHeight(e.group.position.x, e.group.position.z) + 0.03,
      e.group.position.z + (Math.random() - 0.5) * 0.4
    );
    this.scene.add(pool);
    this.decals.push(pool);
    if (this.decals.length > 22) {
      const old = this.decals.shift()!;
      this.scene.remove(old);
      (old.material as THREE.Material).dispose();
      old.geometry.dispose();
    }
    // drops
    if (Math.random() < 0.24 && e.kind !== "boss") {
      const r = Math.random();
      this.spawnPickup(r < 0.4 ? "ammo" : r < 0.75 ? "medkit" : "grenade", e.group.position.x, e.group.position.z);
    }
    // objective progress
    if (e.kind === "boss") {
      this.score += 1000;
      this.cb.onEvent({ type: "toast", title: "KRUGER ELIMINATED", sub: "The islands are free", color: "green" });
      this.endTimer = 2.4;
      this.victoryFlag = true;
      this.explode(e.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 8, 0, false);
    } else if (e.outpost >= 0 && !this.outpostCaptured[e.outpost]) {
      this.outpostKills[e.outpost]++;
    }
    this.checkCaptures();
    this.pushHUD();
  }

  private alertEnemy(e: Enemy) {
    if (!e.alive) return;
    if (e.state === "idle") {
      e.state = "combat";
      e.alerted = true;
      e.awareness = 1;
      if (e.group.position.distanceTo(this.pos) < 50) this.audio.enemyAlert();
      // Check if outpost alarm should be sounded
      if (e.outpost >= 0 && this.world && !this.outpostCaptured[e.outpost]) {
        const al = this.world.alarms[e.outpost];
        if (al && !al.disabled && !al.sounding) {
          const runner = this.enemies.find((x) => x.alive && x.runningToAlarm === e.outpost);
          if (!runner) {
            e.runningToAlarm = e.outpost;
            this.cb.onEvent({ type: "toast", title: "ALARM SPRINT!", sub: "Pirate rushing to sound outpost siren!", color: "red" });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------- enemies update
  private spawnEnemy(kind: EnemyKind, x: number, z: number): Enemy {
    const e = new Enemy(kind, x, z);
    this.scene.add(e.group);
    this.enemies.push(e);
    e.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.enemy) this.hitMeshes.push(o);
    });
    // hp bar sprites
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1a0505, depthTest: false, transparent: true, opacity: 0.85 }));
    bg.scale.set(1.1, 0.12, 1);
    bg.position.y = kind === "boss" ? 3.6 : 2.6;
    const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xef2e2e, depthTest: false, transparent: true, opacity: 0.95 }));
    fg.scale.set(1.06, 0.07, 1);
    fg.position.y = kind === "boss" ? 3.6 : 2.6;
    e.group.add(bg, fg);
    e.hpBg = bg; e.hpBar = fg;
    bg.visible = fg.visible = false;
    return e;
  }

  private updateEnemies(dt: number, t: number) {
    const playerEye = this.camera.position;
    this.takedownTarget = null;
    let bestSpotter: { angle: number; level: number } | null = null;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        e.deadTimer -= dt;
        e.deathProgress = Math.min(1, e.deathProgress + dt * 2.2);
        this.animateEnemy(e, false, dt, t);
        if (e.deadTimer < 1) e.group.position.y -= dt * 0.8;
        if (e.deadTimer <= 0) {
          this.scene.remove(e.group);
          this.enemies.splice(i, 1);
        }
        continue;
      }
      e.group.position.y = getTerrainHeight(e.group.position.x, e.group.position.z);
      const toPlayer = this.pos.clone().sub(e.group.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      const dirToPlayer = dist > 0.01 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);
      const st = ENEMY_STATS[e.kind];

      // Facing direction vector
      const facing = new THREE.Vector3(Math.sin(e.group.rotation.y), 0, Math.cos(e.group.rotation.y));
      const dot = dirToPlayer.dot(facing);

      // Machete Takedown prompt check (close behind unaware enemy)
      if (dist < 2.7 && dot < -0.25 && !this.takedownTarget && e.state !== "combat" && e.kind !== "boss") {
        this.takedownTarget = e;
      }

      // Check Running to Alarm Box in combat
      if (e.runningToAlarm >= 0 && this.world) {
        const al = this.world.alarms[e.runningToAlarm];
        if (al && !al.disabled && !al.sounding) {
          const toAl = al.pos.clone().sub(e.group.position);
          toAl.y = 0;
          const dAl = toAl.length();
          if (dAl < 2.2) {
            this.world.soundAlarm(e.runningToAlarm);
            this.audio.alarm();
            this.cb.onEvent({ type: "toast", title: "⚠ OUTPOST ALARM TRIGGERED!", sub: "Pirates called reinforcements!", color: "red" });
            for (let k = 0; k < 4; k++) {
              const a = Math.random() * Math.PI * 2;
              const re = this.spawnEnemy(k % 2 === 0 ? "grunt" : "rusher", al.pos.x + Math.cos(a) * 12, al.pos.z + Math.sin(a) * 12);
              re.state = "combat";
              re.alerted = true;
            }
            e.runningToAlarm = -1;
          } else {
            toAl.normalize();
            this.moveEnemy(e, toAl, st.speed * 1.25, dt);
            e.group.rotation.y = Math.atan2(toAl.x, toAl.z);
            e.walkPhase += dt * 13;
            this.animateEnemy(e, true, dt, t);
            continue;
          }
        } else {
          e.runningToAlarm = -1;
        }
      }

      // Stealth & Aggro check
      if (e.state === "idle") {
        // Distracted by thrown rock?
        if (e.investigateTarget) {
          const toInv = e.investigateTarget.clone().sub(e.group.position);
          toInv.y = 0;
          const dInv = toInv.length();
          if (dInv > 1.2) {
            toInv.normalize();
            this.moveEnemy(e, toInv, st.speed * 0.65, dt);
            e.group.rotation.y = Math.atan2(toInv.x, toInv.z);
            e.walkPhase += dt * 7;
          } else {
            e.investigateTimer -= dt;
            e.group.rotation.y += Math.sin(t * 3) * 0.02;
            if (e.investigateTimer <= 0) e.investigateTarget = null;
          }
        }

        // Stealth Vision cone and Line of Sight check
        let canSee = false;
        const maxRange = this.concealed ? 11 : this.crouched ? 28 : 55;
        if (dist < maxRange && (dot > 0.15 || dist < 2.5)) {
          const eyePos = e.group.position.clone().add(new THREE.Vector3(0, 1.6, 0));
          const toP = playerEye.clone().sub(eyePos);
          this.raycaster.set(eyePos, toP.clone().normalize());
          this.raycaster.far = toP.length();
          const blocked = this.raycaster.intersectObjects(this.world!.solidMeshes, true);
          if (blocked.length === 0) canSee = true;
        }

        if (canSee) {
          const distK = Math.max(0.15, 1 - dist / maxRange);
          const mult = this.concealed ? 0.35 : this.crouched ? 0.9 : 2.2;
          e.awareness = Math.min(1, e.awareness + dt * distK * mult);

          const toE = e.group.position.clone().sub(this.pos);
          let angle = Math.atan2(-toE.x, -toE.z) - this.yaw;
          while (angle > Math.PI) angle -= Math.PI * 2;
          while (angle < -Math.PI) angle += Math.PI * 2;
          if (!bestSpotter || e.awareness > bestSpotter.level) {
            bestSpotter = { angle, level: e.awareness };
          }
          if (e.awareness >= 1) {
            this.alertEnemy(e);
          }
        } else {
          e.awareness = Math.max(0, e.awareness - dt * 0.5);
        }

        if (e.state === "idle") {
          // wander around home if not distracted
          let isMovingWander = false;
          if (!e.investigateTarget) {
            e.wanderTimer -= dt;
            if (e.wanderTimer <= 0) {
              e.wanderTimer = 3 + Math.random() * 3;
              const a = Math.random() * Math.PI * 2;
              e.wanderTarget = e.home.clone().add(new THREE.Vector3(Math.cos(a) * 8, 0, Math.sin(a) * 8));
            }
            if (e.wanderTarget) {
              const to = e.wanderTarget.clone().sub(e.group.position); to.y = 0;
              if (to.length() > 1) {
                to.normalize();
                this.moveEnemy(e, to, st.speed * 0.3, dt);
                e.group.rotation.y = Math.atan2(to.x, to.z);
                e.walkPhase += dt * 5;
                isMovingWander = true;
              }
            }
          }
          this.animateEnemy(e, isMovingWander, dt, t);
          continue;
        }
      }
      // combat behavior
      e.burstTimer -= dt;
      e.strafeTimer -= dt;
      if (e.strafeTimer <= 0) {
        e.strafeTimer = 1.6 + Math.random() * 2;
        e.strafeDir = Math.random() > 0.5 ? 1 : -1;
      }
      let moveDir = new THREE.Vector3();
      const [minR, maxR] = st.range;
      if (e.kind === "rusher" || e.kind === "boss") {
        // charge with zigzag
        const perp = new THREE.Vector3(-dirToPlayer.z, 0, dirToPlayer.x);
        const zig = Math.sin(t * 3 + e.walkPhase) * (e.kind === "rusher" ? 0.7 : 0.25);
        moveDir = dirToPlayer.clone().add(perp.multiplyScalar(zig * e.strafeDir)).normalize();
        if (e.kind === "boss" && dist < 7) moveDir.set(0, 0, 0);
        if (e.kind === "rusher" && dist < 2.1) moveDir.set(0, 0, 0);
      } else {
        if (dist > maxR) moveDir = dirToPlayer.clone();
        else if (dist < minR) moveDir = dirToPlayer.clone().negate();
        else {
          const perp = new THREE.Vector3(-dirToPlayer.z, 0, dirToPlayer.x);
          moveDir = perp.multiplyScalar(e.strafeDir * 0.7);
        }
      }
      const isMoving = moveDir.lengthSq() > 0.01;
      if (isMoving) {
        this.moveEnemy(e, moveDir.normalize(), st.speed, dt);
        e.walkPhase += dt * (e.kind === "rusher" ? 13 : 8);
      }
      // face player (spine)
      const targetRot = Math.atan2(dirToPlayer.x, dirToPlayer.z);
      let dr = targetRot - e.group.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      e.group.rotation.y += dr * Math.min(1, dt * 8);

      // attacks
      if (e.kind === "rusher") {
        e.meleeTimer -= dt;
        if (dist < 2.6 && e.meleeTimer <= 0) {
          e.meleeTimer = 1.3;
          this.audio.melee();
          // lunge visual
          e.walkPhase += 3;
          if (dist < 3.1) {
            this.damagePlayer(st.damage * (0.9 + Math.random() * 0.3), e.group.position);
          }
        }
      } else if (e.kind === "boss") {
        this.updateBossAttacks(e, dist, dirToPlayer, dt, playerEye);
      } else {
        // ranged bursts
        if (e.burstLeft > 0) {
          e.shotTimer -= dt;
          if (e.shotTimer <= 0) {
            e.shotTimer = e.kind === "heavy" ? 0.13 : 0.16;
            e.burstLeft--;
            this.enemyShoot(e, dist, playerEye);
          }
        } else if (e.burstTimer <= 0 && dist < 60) {
          e.burstTimer = (e.kind === "heavy" ? 1.4 : 2.0) + Math.random() * 1.4;
          e.burstLeft = e.kind === "heavy" ? 6 : 3 + Math.floor(Math.random() * 3);
          e.shotTimer = 0.3;
        }
      }
      // flinch decay
      if (e.flinchTimer > 0) {
        e.flinchTimer = Math.max(0, e.flinchTimer - dt * 2.5);
      }
      // hit flash decay
      if (e.hitFlash > 0) {
        e.hitFlash -= dt * 5;
        const k = Math.max(0, e.hitFlash);
        e.mats.forEach((m) => m.emissive.setRGB(k * 0.7, k * 0.1, k * 0.1));
      }
      // hp bar
      if (e.hpBar && e.hpBg) {
        const show = e.hp < e.maxHp && dist < 55;
        e.hpBar.visible = e.hpBg.visible = show;
        if (show) {
          const f = Math.max(0, e.hp / e.maxHp);
          e.hpBar.scale.x = 1.06 * f;
          e.hpBar.position.x = -(1.06 * (1 - f)) / 2;
          (e.hpBar.material as THREE.SpriteMaterial).color.set(f > 0.5 ? 0xef2e2e : f > 0.25 ? 0xf59e0b : 0x831616);
        }
      }
      // muzzle flash decay
      const flash = e.muzzle.children[0] as THREE.Sprite | undefined;
      if (flash) (flash.material as THREE.SpriteMaterial).opacity = Math.max(0, (flash.material as THREE.SpriteMaterial).opacity - dt * 12);
      this.animateEnemy(e, isMoving, dt, t);
    }
    this.closestSpotter = bestSpotter;
  }

  private moveEnemy(e: Enemy, dir: THREE.Vector3, speed: number, dt: number) {
    e.group.position.x += dir.x * speed * dt;
    e.group.position.z += dir.z * speed * dt;
    // colliders
    for (const c of this.world!.colliders) {
      const dx = e.group.position.x - c.x, dz = e.group.position.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.45;
      if (d < min && d > 0.001) {
        e.group.position.x += (dx / d) * (min - d);
        e.group.position.z += (dz / d) * (min - d);
      }
    }
    const dc = Math.hypot(e.group.position.x, e.group.position.z);
    if (dc > 155) { e.group.position.x *= 155 / dc; e.group.position.z *= 155 / dc; }
    e.group.position.y = getTerrainHeight(e.group.position.x, e.group.position.z);
  }

  private animateEnemy(e: Enemy, isMoving: boolean, dt: number, t: number) {
    const isFiring = e.burstLeft > 0 && e.shotTimer <= 0.05;
    const lookTarget = e.state === "combat" || e.alerted ? this.pos : null;
    enemyFactory.animate(
      e.rig,
      dt,
      t + e.walkPhase,
      e.state,
      isMoving,
      e.speed,
      isFiring,
      e.flinchTimer,
      e.deathProgress,
      lookTarget
    );
  }

  private enemyShoot(e: Enemy, dist: number, playerEye: THREE.Vector3) {
    const st = ENEMY_STATS[e.kind];
    this.audio.shoot("enemy");
    const flash = e.muzzle.children[0] as THREE.Sprite | undefined;
    if (flash) {
      (flash.material as THREE.SpriteMaterial).opacity = 1;
      flash.scale.setScalar(0.7 + Math.random() * 0.4);
    }
    const from = new THREE.Vector3();
    e.gunTip.getWorldPosition(from);
    // line of sight
    const toEye = playerEye.clone().sub(from);
    const d = toEye.length();
    toEye.normalize();
    this.raycaster.set(from, toEye);
    this.raycaster.far = d;
    const blocked = this.raycaster.intersectObjects(this.world!.solidMeshes, true);
    const sprinting = Math.hypot(this.vel.x, this.vel.z) > 8.5;
    const hitChance = blocked.length > 0 ? 0 : Math.max(0.12, Math.min(0.72, 0.68 - dist * 0.011 - (sprinting ? 0.14 : 0) - (this.ads > 0.5 && this.grounded ? 0.02 : 0)));
    if (Math.random() < hitChance && this.hp > 0) {
      const fall = Math.max(0.4, 1 - dist / 90);
      this.damagePlayer(st.damage * fall, e.group.position);
      this.spawnTracer(from, playerEye.clone(), 0xff6a3d);
    } else {
      // near miss
      const miss = playerEye.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3));
      this.spawnTracer(from, miss, 0xff6a3d);
    }
  }

  private updateBossAttacks(e: Enemy, dist: number, _dir: THREE.Vector3, dt: number, playerEye: THREE.Vector3) {
    // minigun
    if (e.burstLeft > 0) {
      e.shotTimer -= dt;
      if (e.shotTimer <= 0) {
        e.shotTimer = 0.11;
        e.burstLeft--;
        this.audio.shoot("boss");
        const flash = e.muzzle.children[0] as THREE.Sprite | undefined;
        if (flash) { (flash.material as THREE.SpriteMaterial).opacity = 1; flash.scale.setScalar(1.2); }
        const from = new THREE.Vector3();
        e.gunTip.getWorldPosition(from);
        const hitChance = Math.max(0.1, 0.5 - dist * 0.008);
        if (Math.random() < hitChance) {
          this.damagePlayer(ENEMY_STATS.boss.damage * Math.max(0.4, 1 - dist / 80), e.group.position);
          this.spawnTracer(from, playerEye.clone(), 0xff3d3d);
        } else {
          this.spawnTracer(from, playerEye.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 4)), 0xff3d3d);
        }
      }
    } else if (e.burstTimer <= 0 && dist < 55) {
      e.burstTimer = 2.2 + Math.random();
      e.burstLeft = 10;
      e.shotTimer = 0.5;
      this.audio.enemyAlert();
    }
    // slam
    e.slamTimer -= dt;
    if (dist < 8 && e.slamTimer <= 0) {
      e.slamTimer = 4;
      this.audio.explosion(false);
      this.trauma = Math.min(1, this.trauma + 0.55);
      this.shockwave(e.group.position.clone(), 0xff5030);
      if (dist < 7) this.damagePlayer(30, e.group.position);
      this.cb.onEvent({ type: "toast", title: "GROUND SLAM", sub: "Keep your distance!", color: "red" });
    }
    // summon
    e.summonTimer -= dt;
    const adds = this.enemies.filter((x) => x.alive && x.kind !== "boss").length;
    if (e.summonTimer <= 0 && adds < 5) {
      e.summonTimer = 18;
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        const m = this.spawnEnemy("rusher", e.group.position.x + Math.cos(a) * 6, e.group.position.z + Math.sin(a) * 6);
        m.state = "combat";
      }
      this.audio.waveHorn();
      this.cb.onEvent({ type: "toast", title: "KRUGER CALLS REINFORCEMENTS", color: "red" });
    }
  }

  // ---------------------------------------------------------- objectives
  private activeOutpost(): number {
    for (let i = 0; i < 3; i++) if (!this.outpostCaptured[i]) return i;
    return -1;
  }

  private updateObjectives(_dt: number) {
    const world = this.world!;
    // activate outposts by proximity (sequential)
    const ai = this.activeOutpost();
    if (ai >= 0 && !this.outpostActive[ai]) {
      const o = world.outposts[ai];
      const d = Math.hypot(this.pos.x - o.x, this.pos.z - o.z);
      if (d < 85 || ai === 0) {
        this.outpostActive[ai] = true;
        this.spawnOutpostWave(ai);
        this.audio.alarm();
        this.cb.onEvent({ type: "toast", title: `HOSTILES AT ${o.name}`, sub: `Eliminate ${this.outpostQuota[ai]} pirates`, color: "orange" });
      }
    }
    // beacon placement
    if (this.beacon) {
      if (ai >= 0) {
        const o = world.outposts[ai];
        this.beacon.visible = true;
        this.beacon.position.set(o.x, getTerrainHeight(o.x, o.z) + 28, o.z);
        (this.beacon.material as THREE.MeshBasicMaterial).color.set(0xff9d2e);
      } else if (this.bossSpawned && this.boss?.alive) {
        this.beacon.visible = true;
        this.beacon.position.set(this.boss.group.position.x, this.boss.group.position.y + 28, this.boss.group.position.z);
        (this.beacon.material as THREE.MeshBasicMaterial).color.set(0xff2222);
      } else this.beacon.visible = false;
    }
    // revenge squads & boss trigger handled in checkCaptures
  }

  private spawnOutpostWave(i: number) {
    const o = this.world!.outposts[i];
    const quota = this.outpostQuota[i];
    const comp: EnemyKind[] = [];
    for (let k = 0; k < quota; k++) {
      const r = Math.random();
      if (i === 0) comp.push(r < 0.7 ? "grunt" : "rusher");
      else if (i === 1) comp.push(r < 0.55 ? "grunt" : r < 0.8 ? "rusher" : "heavy");
      else comp.push(r < 0.45 ? "grunt" : r < 0.7 ? "rusher" : "heavy");
    }
    comp.forEach((kind, k) => {
      const s = o.spawns[k % o.spawns.length];
      const e = this.spawnEnemy(kind, s.x + (Math.random() - 0.5) * 4, s.z + (Math.random() - 0.5) * 4);
      e.outpost = i;
    });
  }

  private checkCaptures() {
    const ai = this.activeOutpost();
    if (ai >= 0 && this.outpostActive[ai] && this.outpostKills[ai] >= this.outpostQuota[ai]) {
      this.outpostCaptured[ai] = true;
      this.world!.setOutpostCaptured(ai);
      this.score += 500;
      this.audio.outpostCaptured();
      // rewards
      this.wstate.forEach((s, idx) => {
        s.reserve = Math.min(WEAPONS[idx].maxReserve, s.reserve + Math.floor(WEAPONS[idx].magSize * 2));
      });
      this.grenades = Math.min(4, this.grenades + 1);
      this.medkits = Math.min(3, this.medkits + 1);
      const name = this.world!.outposts[ai].name;
      // green smoke celebration
      const o = this.world!.outposts[ai];
      for (let k = 0; k < 10; k++) {
        this.spawnParticle(
          new THREE.Vector3(o.x + (Math.random() - 0.5) * 6, getTerrainHeight(o.x, o.z) + 2 + Math.random() * 3, o.z + (Math.random() - 0.5) * 6),
          new THREE.Vector3(0, 3 + Math.random() * 2, 0), 0x3ae05a, 2.5, 2, 0, 1
        );
      }
      if (ai < 2) {
        const next = this.world!.outposts[ai + 1].name;
        this.cb.onEvent({ type: "toast", title: `${name} LIBERATED  +500`, sub: `Next target: ${next} — ammo & supplies restored`, color: "green" });
        // revenge squad hunts player
        setTimeout(() => {}, 0);
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2;
          const px = this.pos.x + Math.cos(a) * 45, pz = this.pos.z + Math.sin(a) * 45;
          if (getTerrainHeight(px, pz) > WATER_LEVEL) {
            const m = this.spawnEnemy(k === 0 ? "grunt" : "rusher", px, pz);
            m.state = "combat";
          }
        }
        this.audio.waveHorn();
      } else {
        this.cb.onEvent({ type: "toast", title: `${name} LIBERATED  +500`, sub: "All outposts free — KRUGER is coming for you", color: "green" });
        this.spawnBoss();
      }
      this.pushHUD();
    }
  }

  private spawnBoss() {
    this.bossSpawned = true;
    // arena near center ruins
    const bx = 0, bz = -30;
    const boss = this.spawnEnemy("boss", bx, bz);
    boss.state = "combat";
    this.boss = boss;
    for (let k = 0; k < 2; k++) {
      const m = this.spawnEnemy("grunt", bx + 8 + k * 4, bz + 6);
      m.state = "combat";
    }
    this.audio.bossRoar();
    this.cb.onEvent({ type: "boss" });
    this.cb.onEvent({ type: "toast", title: "⚠ COMMANDER KRUGER ⚠", sub: "Kill the butcher of the islands — follow the red beacon", color: "red" });
  }

  // ---------------------------------------------------------- pickups
  private spawnPickup(kind: "medkit" | "ammo" | "grenade", x: number, z: number) {
    const y = Math.max(getTerrainHeight(x, z), WATER_LEVEL) + 0.7;
    const g = new THREE.Group();
    if (kind === "medkit") {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.55), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }));
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xd42222 }));
      c1.position.y = 0.19;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0xd42222 }));
      c2.position.y = 0.19;
      g.add(box, c1, c2);
    } else if (kind === "ammo") {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), new THREE.MeshStandardMaterial({ color: 0x3a5a2e, roughness: 0.7 }));
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.42), new THREE.MeshStandardMaterial({ color: 0x2c4423, roughness: 0.7 }));
      lid.position.y = 0.2;
      g.add(box, lid);
    } else {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x37423a, roughness: 0.5, metalness: 0.4 }));
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0xb9c0c7, metalness: 0.8, roughness: 0.3 }));
      pin.position.y = 0.24;
      g.add(ball, pin);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color: kind === "medkit" ? 0x51ff7a : kind === "ammo" ? 0xffc44d : 0x7adcff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.4);
    g.add(glow);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.pickups.push({ kind, mesh: g, taken: false, bob: Math.random() * 10 });
  }

  private updatePickups(dt: number, t: number) {
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 1.8;
      p.mesh.position.y += Math.sin(t * 2.5 + p.bob) * dt * 0.25;
      const d = Math.hypot(p.mesh.position.x - this.pos.x, p.mesh.position.z - this.pos.z);
      if (d < 2.3 && Math.abs(p.mesh.position.y - (this.pos.y + 1)) < 2.5) {
        p.taken = true;
        this.scene.remove(p.mesh);
        this.audio.pickup();
        if (p.kind === "medkit") {
          if (this.medkits < 3) { this.medkits++; this.cb.onEvent({ type: "pickup", text: "+1 FIELD SYRINGE (H to heal)" }); }
          else { this.hp = Math.min(this.maxHp, this.hp + 30); this.cb.onEvent({ type: "pickup", text: "+30 HEALTH" }); }
        } else if (p.kind === "ammo") {
          this.wstate.forEach((s, idx) => { s.reserve = Math.min(WEAPONS[idx].maxReserve, s.reserve + WEAPONS[idx].magSize * 2); });
          this.cb.onEvent({ type: "pickup", text: "AMMO RESTOCKED" });
        } else {
          if (this.grenades < 4) { this.grenades++; this.cb.onEvent({ type: "pickup", text: "+1 FRAG GRENADE (G)" }); }
          else { this.score += 50; this.cb.onEvent({ type: "pickup", text: "+50 PTS (grenades full)" }); }
        }
        this.pushHUD();
      }
    }
    this.pickups = this.pickups.filter((p) => !p.taken);
  }

  // ---------------------------------------------------------- grenades
  private updateGrenades(dt: number) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.fuse -= dt;
      n.vel.y -= 20 * dt;
      n.mesh.position.addScaledVector(n.vel, dt);
      const gh = getTerrainHeight(n.mesh.position.x, n.mesh.position.z);
      if (n.mesh.position.y < gh + 0.12) {
        n.mesh.position.y = gh + 0.12;
        if (Math.abs(n.vel.y) > 3) this.audio.grenadeBounce();
        n.vel.y *= -0.42;
        n.vel.x *= 0.7; n.vel.z *= 0.7;
      }
      // blink faster as fuse burns
      if (Math.sin(n.fuse * 20) > 0.6) {
        this.spawnParticle(n.mesh.position.clone(), new THREE.Vector3(0, 1, 0), 0xff3020, 0.25, 0.5, 0, 0);
      }
      if (n.fuse <= 0) {
        this.scene.remove(n.mesh);
        this.nades.splice(i, 1);
        this.explode(n.mesh.position.clone(), 10, 170, true);
      }
    }
  }

  // ---------------------------------------------------------- explosions & fx
  private explodeBarrel(b: { mesh: THREE.Mesh; pos: THREE.Vector3; alive: boolean }) {
    if (!b.alive) return;
    b.alive = false;
    b.mesh.visible = false;
    // remove collider
    if (this.world) {
      const idx = this.world.colliders.findIndex((c) => Math.hypot(c.x - b.pos.x, c.z - b.pos.z) < 0.5);
      if (idx >= 0) this.world.colliders.splice(idx, 1);
    }
    this.explode(b.pos.clone().add(new THREE.Vector3(0, 1, 0)), 9, 150, true);
  }

  explode(center: THREE.Vector3, radius: number, damage: number, hurtPlayer: boolean) {
    this.audio.explosion(radius > 9);
    // flash
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color: 0xffdca0, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.position.copy(center);
    flash.scale.setScalar(radius * 1.2);
    this.scene.add(flash);
    this.particles.push({ sp: flash, vel: new THREE.Vector3(), life: 0.25, maxLife: 0.25, grav: 0, grow: 3 });
    const light = new THREE.PointLight(0xff8c3a, 120, radius * 5, 1.7);
    light.position.copy(center).add(new THREE.Vector3(0, 1.5, 0));
    this.scene.add(light);
    this.lights.push({ l: light, life: 0.5, maxLife: 0.5, peak: 120 });
    // fire + smoke + sparks
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9, (Math.random() - 0.5)).multiplyScalar(9);
      const c = [0xffd23e, 0xff8c2e, 0xff4d2e][i % 3];
      this.spawnParticle(center.clone(), v, c, 0.7 + Math.random() * 0.5, 1.6 + Math.random(), 7, 0.5);
    }
    for (let i = 0; i < 9; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4);
      this.spawnParticle(center.clone().add(new THREE.Vector3(0, 1, 0)), v, 0x2e2a26, 1.6 + Math.random(), 2.4, -1.5, 1.2);
    }
    for (let i = 0; i < 10; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random(), (Math.random() - 0.5)).multiplyScalar(16);
      this.spawnParticle(center.clone(), v, 0xfff2c0, 0.5, 0.7, 14, 0);
    }
    this.shockwave(center, 0xffb14e);
    // damage enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.group.position.clone().add(new THREE.Vector3(0, 1, 0)).distanceTo(center);
      if (d < radius) {
        const dmg = damage * (1 - (d / radius) * 0.7);
        this.damageEnemy(e, dmg, false, e.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      }
    }
    // chain barrels
    if (this.world) {
      for (const b of this.world.barrels) {
        if (!b.alive) continue;
        if (b.pos.distanceTo(center) < radius + 1 && b.pos.distanceTo(center) > 0.5) {
          setTimeout(() => this.explodeBarrel(b), 120 + Math.random() * 250);
        }
      }
    }
    // player
    if (hurtPlayer) {
      const pd = this.camera.position.distanceTo(center);
      if (pd < radius) {
        this.damagePlayer(damage * 0.6 * (1 - (pd / radius) * 0.6), center);
        this.trauma = Math.min(1, this.trauma + 0.5);
      } else if (pd < radius * 2.5) {
        this.trauma = Math.min(1, this.trauma + 0.3 * (1 - pd / (radius * 2.5)));
      }
    }
  }

  private shockwave(center: THREE.Vector3, color: number) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.18, 8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.position.copy(center);
    m.rotation.x = Math.PI / 2;
    this.scene.add(m);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.copy(center);
    sp.scale.setScalar(2);
    this.scene.add(sp);
    this.particles.push({ sp, vel: new THREE.Vector3(), life: 0.4, maxLife: 0.4, grav: 0, grow: 14 });
    // torus expand via particles-like manual
    let life = 0.45;
    const iv = window.setInterval(() => {
      life -= 0.03;
      m.scale.addScalar(1.6);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, life * 2);
      if (life <= 0) { this.scene.remove(m); window.clearInterval(iv); }
    }, 30);
  }

  private impactEffect(point: THREE.Vector3, _normal: THREE.Vector3) {
    for (let i = 0; i < 4; i++) {
      this.spawnParticle(point.clone(), new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5), 0xcbb98f, 0.5, 0.8, 8, 0.4);
    }
    for (let i = 0; i < 3; i++) {
      this.spawnParticle(point.clone(), new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 6, (Math.random() - 0.5) * 10), 0xffe9a0, 0.3, 0.5, 12, 0);
    }
  }

  private bloodEffect(point: THREE.Vector3) {
    for (let i = 0; i < 6; i++) {
      this.spawnParticle(point.clone(), new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6), 0x8f1616, 0.5 + Math.random() * 0.3, 0.7, 10, 0.2);
    }
  }

  private spawnParticle(pos: THREE.Vector3, vel: THREE.Vector3, color: number, life: number, size: number, grav: number, grow: number) {
    if (this.particles.length > 220) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color, transparent: true, opacity: 1, depthWrite: false }));
    sp.position.copy(pos);
    sp.scale.setScalar(size * 0.5);
    this.scene.add(sp);
    this.particles.push({ sp, vel, life, maxLife: life, grav, grow });
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.sp);
        (p.sp.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.sp.position.addScaledVector(p.vel, dt);
      const f = p.life / p.maxLife;
      (p.sp.material as THREE.SpriteMaterial).opacity = f;
      const s = p.sp.scale.x + p.grow * dt;
      p.sp.scale.setScalar(Math.max(0.05, s));
    }
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const geo = new THREE.BoxGeometry(0.035, 0.035, 1);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    m.scale.z = len;
    this.scene.add(m);
    this.tracers.push({ m, life: 0.08 });
    if (this.tracers.length > 40) {
      const old = this.tracers.shift()!;
      this.scene.remove(old.m);
    }
  }

  private updateTracers(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.m);
        (tr.m.material as THREE.Material).dispose();
        (tr.m.geometry as THREE.BufferGeometry).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  private updateLights(dt: number) {
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const L = this.lights[i];
      L.life -= dt;
      if (L.life <= 0) { this.scene.remove(L.l); this.lights.splice(i, 1); continue; }
      L.l.intensity = L.peak * (L.life / L.maxLife);
    }
  }

  // ---------------------------------------------------------- HUD
  private pushHUD() {
    const ai = this.activeOutpost();
    let objectiveText = "ELIMINATE COMMANDER KRUGER";
    let objectiveSub = "Follow the red beacon";
    let enemiesLeft = this.boss?.alive ? 1 : 0;
    let objectiveDist = 0;
    if (ai >= 0) {
      const o = this.world!.outposts[ai];
      objectiveText = `LIBERATE ${o.name}`;
      const left = Math.max(0, this.outpostQuota[ai] - this.outpostKills[ai]);
      enemiesLeft = left;
      objectiveSub = this.outpostActive[ai] ? `Hostiles remaining: ${left}` : "Reach the outpost";
      objectiveDist = Math.hypot(this.pos.x - o.x, this.pos.z - o.z);
    } else if (this.boss?.alive) {
      objectiveDist = this.pos.distanceTo(this.boss.group.position);
      enemiesLeft = 1 + this.enemies.filter((e) => e.alive && e.kind !== "boss").length;
    }
    const isSniperScope = this.windex === 2 && this.ads > 0.35;
    let nearAlarm = false;
    if (this.world) {
      for (const a of this.world.alarms) {
        if (!a.disabled && a.pos.distanceTo(this.pos) < 3.5) { nearAlarm = true; break; }
      }
    }
    const st: HUDState = {
      hp: Math.max(0, Math.round(this.hp)), maxHp: this.maxHp, stamina: Math.round(this.stamina),
      weapons: WEAPONS.map((w, i) => ({ name: w.name, short: w.short, mag: this.wstate[i].mag, reserve: this.wstate[i].reserve, magSize: w.magSize, reloading: this.wstate[i].reloading > 0 })),
      weaponIndex: this.windex, switching: this.switchTimer > 0,
      grenades: this.grenades, medkits: this.medkits, molotovs: this.molotovs, rocks: this.rocks,
      kills: this.kills, score: this.score, accuracy: this.shots ? this.hits / this.shots : 0,
      objectiveIndex: ai, objectiveText, objectiveSub, enemiesLeft, objectiveDist: Math.round(objectiveDist),
      outposts: this.world!.outposts.map((o, i) => ({ name: o.name, captured: this.outpostCaptured[i] })),
      yaw: this.yaw, time: this.gameTime,
      bossHp: this.bossSpawned && this.boss?.alive ? Math.max(0, this.boss.hp / this.boss.maxHp) : -1,
      ads: this.ads, canHeal: this.medkits > 0 && this.hp < this.maxHp,
      reloading: this.wstate[this.windex].reloading > 0,
      lowAmmo: this.wstate[this.windex].mag <= Math.ceil(WEAPONS[this.windex].magSize * 0.25),
      crouched: this.crouched, concealed: this.concealed,
      isSniperScope,
      steadyBreath: this.steadyBreath,
      takedownTarget: !!this.takedownTarget,
      nearAlarm,
      detection: this.closestSpotter,
    };
    this.cb.onHUD(st);
  }

  // ---------------------------------------------------------- minimap
  drawMinimap(ctx: CanvasRenderingContext2D, size: number) {
    const S = size;
    const toMap = (x: number, z: number): [number, number] => [
      ((x + 170) / 340) * S,
      ((z + 170) / 340) * S,
    ];
    ctx.clearRect(0, 0, S, S);
    // bg
    ctx.fillStyle = "rgba(6,18,10,.85)";
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.fill();
    // island blob approx
    ctx.fillStyle = "rgba(46,110,52,.5)";
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(210,190,130,.35)";
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(210,190,130,.5)";
    ctx.stroke();
    // grid
    ctx.strokeStyle = "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo((S / 4) * i, 0); ctx.lineTo((S / 4) * i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (S / 4) * i); ctx.lineTo(S, (S / 4) * i); ctx.stroke();
    }
    if (!this.world) return;
    // outposts
    this.world.outposts.forEach((o, i) => {
      const [x, y] = toMap(o.x, o.z);
      const captured = this.outpostCaptured[i];
      const active = this.activeOutpost() === i;
      ctx.fillStyle = captured ? "#22c55e" : active ? "#f59e0b" : "#ef4444";
      if (active && !captured) {
        ctx.beginPath();
        ctx.arc(x, y, 9 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(o.name[0], x, y - 10);
    });
    // pickups
    ctx.fillStyle = "#7adcff";
    for (const p of this.pickups) {
      const [x, y] = toMap(p.mesh.position.x, p.mesh.position.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // enemies (only combat / near)
    for (const e of this.enemies) {
      if (!e.alive || e.state === "idle") continue;
      const [x, y] = toMap(e.group.position.x, e.group.position.z);
      ctx.fillStyle = e.kind === "boss" ? "#ff2222" : e.kind === "heavy" ? "#ff7a3d" : "#ff3b3b";
      const r = e.kind === "boss" ? 6 : 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (e.kind === "boss") {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // player arrow
    const [px, py] = toMap(this.pos.x, this.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.yaw);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // ring
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(245,158,11,.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

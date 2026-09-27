import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
  createGunmetalTexture,
  createWoodgrainTexture,
  createPolymerTexture,
  createCarbonFiberTexture,
  createCamoTexture,
  createBrassTexture,
} from "./proceduralTextures";

const ASSET_BASE = (import.meta.env.BASE_URL ?? "./").replace(/\/$/, "") + "/";
const getAssetUrl = (relPath: string) => `${ASSET_BASE}${relPath.replace(/^\//, "")}`;

export interface WeaponRigParts {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  ejector: THREE.Object3D;
  movingPart?: THREE.Object3D; // slide / pump / bolt / bowstring
  arrowMesh?: THREE.Object3D;
  leftArm?: THREE.Group;
  rightArm?: THREE.Group;
}

export interface CasingInstance {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  bounced: boolean;
}

// ---------------------------------------------------------------- First Person Tactical Hand
function buildTacticalArm(side: "left" | "right", sleeveMat: THREE.Material, gloveMat: THREE.Material, palmMat: THREE.Material): THREE.Group {
  const arm = new THREE.Group();
  const sign = side === "right" ? 1 : -1;

  // Forearm sleeve (rolled up combat uniform)
  const sleeveGeo = new THREE.CylinderGeometry(0.048, 0.054, 0.28, 10);
  const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeve.rotation.x = Math.PI / 2.2;
  sleeve.position.set(0, -0.05, 0.16);
  arm.add(sleeve);

  // Rolled cuff ring
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 16), sleeveMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.04, 0.035);
  arm.add(cuff);

  // Wrist strap & watch/compass
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.038, 10), gloveMat);
  strap.rotation.x = Math.PI / 2;
  strap.position.set(0, -0.035, 0.01);
  arm.add(strap);

  if (side === "left") {
    // Tactical field compass / watch on left wrist
    const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 8), new THREE.MeshStandardMaterial({ color: 0x1e221c, metalness: 0.8, roughness: 0.3 }));
    watch.rotation.x = Math.PI / 2;
    watch.position.set(0, 0.008, 0.01);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.012, 8), new THREE.MeshBasicMaterial({ color: 0x55ff77 }));
    dial.position.set(0, 0.014, 0.01);
    dial.rotation.x = -Math.PI / 2;
    arm.add(watch, dial);
  }

  // Hand palm
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.038, 0.088), palmMat);
  palm.position.set(0, -0.02, -0.04);
  arm.add(palm);

  // Carbon fiber knuckle guard plate on back of hand
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.018, 0.046), gloveMat);
  knuckle.position.set(0, 0.006, -0.038);
  arm.add(knuckle);

  // Articulated fingers curling naturally
  const fingerMat = palmMat;
  const fingerOffsets = [-0.027, -0.009, 0.009, 0.027];
  for (let i = 0; i < 4; i++) {
    const fx = fingerOffsets[i];
    const fingerBase = new THREE.Group();
    fingerBase.position.set(fx, -0.02, -0.08);

    // Phalanx 1
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.032), fingerMat);
    p1.position.set(0, 0, -0.014);
    p1.rotation.x = 0.55 + i * 0.08;
    fingerBase.add(p1);

    // Phalanx 2 (curled around grip)
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.028), fingerMat);
    p2.position.set(0, -0.018, -0.032);
    p2.rotation.x = 1.35;
    fingerBase.add(p2);

    arm.add(fingerBase);
  }

  // Thumb wrapping counter-opposed
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.042), fingerMat);
  thumb.position.set(sign * 0.042, -0.008, -0.032);
  thumb.rotation.set(0.3, -sign * 0.7, sign * 0.4);
  arm.add(thumb);

  return arm;
}

// ---------------------------------------------------------------- 3D Weapons Builder
export class WeaponModelFactory {
  private bluedSteel: THREE.MeshStandardMaterial;
  private machinedSteel: THREE.MeshStandardMaterial;
  private darkMetal: THREE.MeshStandardMaterial;
  private walnutWood: THREE.MeshStandardMaterial;
  private darkWood: THREE.MeshStandardMaterial;
  private polymer: THREE.MeshStandardMaterial;
  private carbonGlove: THREE.MeshStandardMaterial;
  private leatherPalm: THREE.MeshStandardMaterial;
  private camoSleeve: THREE.MeshStandardMaterial;
  private brassMat: THREE.MeshStandardMaterial;

  constructor() {
    this.bluedSteel = new THREE.MeshStandardMaterial({
      map: createGunmetalTexture("blued"),
      roughness: 0.35,
      metalness: 0.88,
    });
    this.machinedSteel = new THREE.MeshStandardMaterial({
      map: createGunmetalTexture("steel"),
      roughness: 0.26,
      metalness: 0.94,
    });
    this.darkMetal = new THREE.MeshStandardMaterial({
      map: createGunmetalTexture("dark"),
      roughness: 0.48,
      metalness: 0.82,
    });
    this.walnutWood = new THREE.MeshStandardMaterial({
      map: createWoodgrainTexture(false),
      roughness: 0.46,
      metalness: 0.04,
    });
    this.darkWood = new THREE.MeshStandardMaterial({
      map: createWoodgrainTexture(true),
      roughness: 0.44,
      metalness: 0.04,
    });
    this.polymer = new THREE.MeshStandardMaterial({
      map: createPolymerTexture(),
      roughness: 0.85,
      metalness: 0.12,
    });
    this.carbonGlove = new THREE.MeshStandardMaterial({
      map: createCarbonFiberTexture(),
      roughness: 0.42,
      metalness: 0.5,
    });
    this.leatherPalm = new THREE.MeshStandardMaterial({
      color: 0x1f1d19,
      roughness: 0.92,
      metalness: 0.05,
    });
    this.camoSleeve = new THREE.MeshStandardMaterial({
      map: createCamoTexture("tiger"),
      roughness: 0.95,
      metalness: 0.02,
    });
    this.brassMat = new THREE.MeshStandardMaterial({
      map: createBrassTexture(),
      roughness: 0.28,
      metalness: 0.96,
    });
  }

  // 1. AK-47 "LIBERATOR" (High-detail 3D imported FBX model with authentic walnut wood & blued steel PBR)
  buildAK47(): WeaponRigParts {
    const root = new THREE.Group();
    const modelContainer = new THREE.Group();
    root.add(modelContainer);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.027, -0.82);
    const ejector = new THREE.Object3D();
    ejector.position.set(0.045, 0.042, -0.32);
    root.add(muzzle, ejector);

    // Tactical first-person combat arms
    const rightArm = buildTacticalArm("right", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    rightArm.position.set(0.04, -0.16, -0.17);
    rightArm.rotation.set(-0.18, -0.06, 0.1);

    const leftArm = buildTacticalArm("left", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    leftArm.position.set(-0.02, -0.08, -0.47);
    leftArm.rotation.set(0.32, 0.35, -0.2);

    root.add(rightArm, leftArm);

    // Initial fallback mesh while loading
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.7), this.darkMetal);
    fallback.position.set(0, 0, -0.35);
    modelContainer.add(fallback);

    let boltMesh: THREE.Object3D | undefined;
    let origBoltX = 0;

    const movingPartProxy = new THREE.Object3D();
    root.add(movingPartProxy);
    let boltRecoil = 0;
    Object.defineProperty(movingPartProxy.position, "z", {
      get: () => boltRecoil,
      set: (val: number) => {
        boltRecoil = val;
        if (boltMesh) {
          boltMesh.position.x = origBoltX + val * 100;
        }
      },
    });

    const fbxLoader = new FBXLoader();
    fbxLoader.load(
      getAssetUrl("models/ak47/AK47.fbx"),
      (fbx) => {
        modelContainer.remove(fallback);
        fallback.geometry.dispose();

        fbx.scale.setScalar(0.01);
        fbx.rotation.y = -Math.PI / 2;
        fbx.position.set(0, -0.04, -0.18);

        fbx.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            const name = child.name.toLowerCase();
            if (name.includes("wood") || name.includes("stock_low") || name.includes("foregrip") || name.includes("grip_low")) {
              child.material = this.walnutWood;
            } else if (name.includes("magazine") || name.includes("mag") || name.includes("gastube")) {
              child.material = this.darkMetal;
            } else if (name.includes("slider")) {
              child.material = this.machinedSteel;
              boltMesh = child;
              origBoltX = child.position.x;
            } else if (name.includes("trigger") || name.includes("rod") || name.includes("butt") || name.includes("lever")) {
              child.material = this.machinedSteel;
            } else {
              child.material = this.bluedSteel;
            }
          }
        });
        modelContainer.add(fbx);
      },
      undefined,
      (err) => console.warn("AK47 model load notice:", err)
    );

    return {
      group: root,
      muzzle,
      ejector,
      movingPart: movingPartProxy,
      rightArm,
      leftArm,
    };
  }

  // 2. SPAS-12 "PUNISHER"
  buildSPAS12(): WeaponRigParts {
    const root = new THREE.Group();
    const muzzle = new THREE.Object3D();
    const ejector = new THREE.Object3D();

    // Heavy shotgun receiver
    const recv = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.125, 0.42), this.darkMetal);
    recv.position.set(0, 0, -0.34);

    // Barrel & Extended magazine tube underneath
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.68, 12), this.machinedSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.036, -0.84);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.62, 12), this.darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.024, -0.81);

    // Knurled magazine tube front cap
    const magCap = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.025, 0.05, 12), this.machinedSteel);
    magCap.rotation.x = Math.PI / 2;
    magCap.position.set(0, -0.024, -1.13);

    // Perforated heat shield over barrel with dual vent rows
    const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.44, 12, 1, true), this.darkMetal);
    heatShield.rotation.x = Math.PI / 2;
    heatShield.position.set(0, 0.036, -0.74);

    // Sliding tactical ribbed pump forearm
    const pumpGroup = new THREE.Group();
    const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.092, 0.24), this.polymer);
    pumpBody.position.set(0, -0.02, 0);
    // Ribbed grips on pump
    for (let r = -0.09; r <= 0.09; r += 0.03) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.096, 0.012), this.darkMetal);
      rib.position.set(0, -0.02, r);
      pumpGroup.add(rib);
    }
    pumpGroup.add(pumpBody);
    pumpGroup.position.set(0, 0, -0.68);

    // Pistol grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.165, 0.078), this.polymer);
    grip.position.set(0, -0.13, -0.14);
    grip.rotation.x = 0.32;

    // Stamped folding skeleton stock resting along the top
    const stockArm = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.038, 0.44), this.machinedSteel);
    stockArm.position.set(0, 0.082, -0.17);
    const stockHook = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.095, 0.044), this.machinedSteel);
    stockHook.position.set(0, 0.115, 0.04);

    // Ghost ring rear sight + front bead
    const rearRing = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 6, 12), this.darkMetal);
    rearRing.position.set(0, 0.085, -0.22);
    const frontBead = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), this.machinedSteel);
    frontBead.position.set(0, 0.068, -1.14);

    muzzle.position.set(0, 0.036, -1.19);
    ejector.position.set(0.065, 0.03, -0.32);

    root.add(
      recv, barrel, magTube, magCap, heatShield, pumpGroup,
      grip, stockArm, stockHook, rearRing, frontBead, muzzle, ejector
    );

    // Arms
    const rightArm = buildTacticalArm("right", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    rightArm.position.set(0.02, -0.14, -0.12);
    rightArm.rotation.set(-0.15, -0.08, 0.08);

    const leftArm = buildTacticalArm("left", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    leftArm.position.set(-0.04, -0.06, -0.66);
    leftArm.rotation.set(0.35, 0.35, -0.28);

    pumpGroup.add(leftArm);

    return { group: root, muzzle, ejector, movingPart: pumpGroup, rightArm, leftArm };
  }

  // 3. SVD "PREDATOR" SNIPER RIFLE
  buildSVD(): WeaponRigParts {
    const root = new THREE.Group();
    const muzzle = new THREE.Object3D();
    const ejector = new THREE.Object3D();

    // Milled steel receiver
    const recv = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.098, 0.48), this.bluedSteel);
    recv.position.set(0, 0, -0.34);

    // Elongated match barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.94, 12), this.machinedSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.022, -0.98);

    // Slotted long flash hider
    const hider = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.019, 0.14, 10), this.bluedSteel);
    hider.rotation.x = Math.PI / 2;
    hider.position.set(0, 0.022, -1.48);
    muzzle.position.set(0, 0.022, -1.56);

    // Ribbed wooden handguard with cooling ventilation slots
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.078, 0.42), this.walnutWood);
    handguard.position.set(0, 0.006, -0.68);

    // Skeletonized wooden thumbhole sniper stock
    const stockBase = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.14, 0.42), this.walnutWood);
    stockBase.position.set(0, -0.045, 0.14);
    stockBase.rotation.x = -0.12;

    // Ergonomic raised cheek rest pad
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.045, 0.16), this.leatherPalm);
    cheekRest.position.set(0, 0.042, 0.12);

    // 10-round stamped steel magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.14, 0.12), this.darkMetal);
    mag.position.set(0, -0.11, -0.33);
    mag.rotation.x = 0.12;

    // Full PSO-1 Optical Sniper Scope assembly
    const scopeGroup = new THREE.Group();
    // Scope tube
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.42, 14), this.darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(-0.02, 0.11, -0.36);

    // Objective lens bell with sunshade
    const objBell = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.025, 0.09, 14), this.darkMetal);
    objBell.rotation.x = Math.PI / 2;
    objBell.position.set(-0.02, 0.11, -0.58);
    const objLens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 14), new THREE.MeshBasicMaterial({ color: 0x113355 }));
    objLens.position.set(-0.02, 0.11, -0.626);

    // Rubber eye accordion cup
    const eyeCup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.07, 12), this.polymer);
    eyeCup.rotation.x = Math.PI / 2;
    eyeCup.position.set(-0.02, 0.11, -0.14);

    // Windage & elevation adjustment turrets
    const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 10), this.machinedSteel);
    turretTop.position.set(-0.02, 0.142, -0.36);
    const turretSide = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 10), this.machinedSteel);
    turretSide.rotation.z = Math.PI / 2;
    turretSide.position.set(0.012, 0.11, -0.36);

    // Side dovetail scope mounting bracket
    const mountBracket = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.085, 0.14), this.machinedSteel);
    mountBracket.position.set(-0.018, 0.065, -0.35);

    scopeGroup.add(scopeTube, objBell, objLens, eyeCup, turretTop, turretSide, mountBracket);

    // Bolt carrier
    const boltCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.025, 0.12), this.machinedSteel);
    boltCarrier.position.set(0.042, 0.028, -0.34);
    ejector.position.set(0.055, 0.03, -0.34);

    root.add(recv, barrel, hider, handguard, stockBase, cheekRest, mag, scopeGroup, boltCarrier, muzzle, ejector);

    // Arms
    const rightArm = buildTacticalArm("right", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    rightArm.position.set(0.02, -0.15, -0.13);
    rightArm.rotation.set(-0.16, -0.08, 0.09);

    const leftArm = buildTacticalArm("left", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    leftArm.position.set(-0.05, -0.05, -0.65);
    leftArm.rotation.set(0.32, 0.38, -0.28);

    root.add(rightArm, leftArm);

    return { group: root, muzzle, ejector, movingPart: boltCarrier, rightArm, leftArm };
  }

  // 4. RECURVE BOW "HUNTER"
  buildBow(): WeaponRigParts {
    const root = new THREE.Group();
    const muzzle = new THREE.Object3D();
    const ejector = new THREE.Object3D();

    // Sculpted wooden riser / center section
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.36, 0.075), this.darkWood);
    riser.position.set(0, 0, -0.34);

    // Ergonomic leather grip wrap
    const gripWrap = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.15, 0.078), this.leatherPalm);
    gripWrap.position.set(0, -0.02, -0.34);

    // Arrow shelf & sight pin ring
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.05), this.darkMetal);
    shelf.position.set(0.03, 0.04, -0.34);

    const sightRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 14), this.bluedSteel);
    sightRing.position.set(0.035, 0.09, -0.38);
    const sightFiber = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
    sightFiber.position.set(0.035, 0.09, -0.38);

    // Flexible composite recurve limbs (upper & lower)
    const upperLimb = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.42, 0.032), this.walnutWood);
    upperLimb.position.set(0, 0.32, -0.36);
    upperLimb.rotation.x = -0.24;

    const upperRecurve = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.16, 0.026), this.darkWood);
    upperRecurve.position.set(0, 0.54, -0.42);
    upperRecurve.rotation.x = 0.42;

    const lowerLimb = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.42, 0.032), this.walnutWood);
    lowerLimb.position.set(0, -0.32, -0.36);
    lowerLimb.rotation.x = 0.24;

    const lowerRecurve = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.16, 0.026), this.darkWood);
    lowerRecurve.position.set(0, -0.54, -0.42);
    lowerRecurve.rotation.x = -0.42;

    // Bowstring assembly (flexing string structure)
    const stringGroup = new THREE.Group();
    const strMat = new THREE.MeshBasicMaterial({ color: 0xf0efe8 });
    const strUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.62, 6), strMat);
    strUpper.position.set(0, 0.3, -0.28);
    strUpper.rotation.x = 0.38;

    const strLower = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.62, 6), strMat);
    strLower.position.set(0, -0.3, -0.28);
    strLower.rotation.x = -0.38;

    const nockPoint = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.025, 8), this.brassMat);
    nockPoint.position.set(0, 0, -0.16);

    stringGroup.add(strUpper, strLower, nockPoint);

    // Nocked carbon fiber hunting arrow
    const arrowMesh = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.72, 8), this.darkMetal);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0.015, 0.04, -0.48);

    // Steel bodkin broadhead tip
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 4), this.machinedSteel);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0.015, 0.04, -0.87);

    // 3-vane fletching feathers (red & white)
    const fletchMat = new THREE.MeshStandardMaterial({ color: 0xc92424, roughness: 0.8 });
    for (let a = 0; a < 3; a++) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.028, 0.11), fletchMat);
      vane.position.set(0.015, 0.04, -0.18);
      vane.rotation.z = (a * Math.PI * 2) / 3;
      arrowMesh.add(vane);
    }
    arrowMesh.add(shaft, tip);

    muzzle.position.set(0.015, 0.04, -0.92);

    root.add(
      riser, gripWrap, shelf, sightRing, sightFiber,
      upperLimb, upperRecurve, lowerLimb, lowerRecurve,
      stringGroup, arrowMesh, muzzle, ejector
    );

    // Left hand gripping bow riser firmly
    const leftArm = buildTacticalArm("left", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    leftArm.position.set(-0.01, -0.04, -0.34);
    leftArm.rotation.set(0, 0.15, -0.2);

    // Right hand pulling bowstring nock
    const rightArm = buildTacticalArm("right", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    rightArm.position.set(0.02, 0.02, -0.14);
    rightArm.rotation.set(-0.15, -0.25, 0.35);

    root.add(leftArm, rightArm);

    return { group: root, muzzle, ejector, movingPart: stringGroup, arrowMesh, leftArm, rightArm };
  }

  // 5. DESERT EAGLE "JUDGE"
  buildDeagle(): WeaponRigParts {
    const root = new THREE.Group();
    const muzzle = new THREE.Object3D();
    const ejector = new THREE.Object3D();

    // Frame & trigger guard
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.075, 0.28), this.darkMetal);
    frame.position.set(0, -0.02, -0.24);

    const trigGuard = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12, Math.PI), this.darkMetal);
    trigGuard.rotation.y = Math.PI / 2;
    trigGuard.position.set(0, -0.07, -0.24);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.014), this.machinedSteel);
    trigger.position.set(0, -0.065, -0.235);
    trigger.rotation.x = -0.25;

    // Reciprocating polygonal slide with cocking serrations
    const slideGroup = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.078, 0.32), this.machinedSteel);
    slide.position.set(0, 0.032, -0.24);

    // Top Weaver optic rail
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.014, 0.22), this.darkMetal);
    rail.position.set(0, 0.076, -0.25);

    // Triangular barrel profile with gas port vents
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.068, 0.16), this.bluedSteel);
    barrel.position.set(0, 0.028, -0.46);

    const boreHole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 12), this.darkMetal);
    boreHole.rotation.x = Math.PI / 2;
    boreHole.position.set(0, 0.028, -0.54);

    // Combat high-contrast sights (green dots)
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.018), this.darkMetal);
    rearSight.position.set(0, 0.08, -0.1);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.024, 0.018), this.darkMetal);
    frontSight.position.set(0, 0.072, -0.52);

    slideGroup.add(slide, rail, barrel, boreHole, rearSight, frontSight);

    // Heavy wrap-around combat grip with medallion inlay
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.16, 0.088), this.polymer);
    grip.position.set(0, -0.115, -0.15);
    grip.rotation.x = 0.28;

    const medallion = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), this.brassMat);
    medallion.position.set(0.035, -0.115, -0.15);
    medallion.rotation.y = Math.PI / 2;

    // Hammer
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.025), this.machinedSteel);
    hammer.position.set(0, 0.04, -0.085);
    hammer.rotation.x = 0.45;

    muzzle.position.set(0, 0.028, -0.55);
    ejector.position.set(0.045, 0.04, -0.22);

    root.add(frame, trigGuard, trigger, slideGroup, grip, medallion, hammer, muzzle, ejector);

    // Both hands supporting heavy pistol
    const rightArm = buildTacticalArm("right", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    rightArm.position.set(0.01, -0.14, -0.12);
    rightArm.rotation.set(-0.12, -0.05, 0.05);

    const leftArm = buildTacticalArm("left", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    leftArm.position.set(-0.02, -0.16, -0.14);
    leftArm.rotation.set(-0.08, 0.12, -0.1);

    root.add(rightArm, leftArm);

    return { group: root, muzzle, ejector, movingPart: slideGroup, rightArm, leftArm };
  }

  // 6. FN SCAR-H "GHOST" (High-detail 3D imported OBJ model with scope & foregrip)
  buildScar(): WeaponRigParts {
    const root = new THREE.Group();
    const modelContainer = new THREE.Group();
    root.add(modelContainer);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.68);
    const ejector = new THREE.Object3D();
    ejector.position.set(0.045, 0.03, -0.22);
    root.add(muzzle, ejector);

    // Tactical combat arms
    const rightArm = buildTacticalArm("right", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    rightArm.position.set(0.04, -0.15, -0.10);
    rightArm.rotation.set(-0.18, -0.06, 0.1);

    const leftArm = buildTacticalArm("left", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    leftArm.position.set(0.02, -0.14, -0.42);
    leftArm.rotation.set(0.35, 0.22, -0.15);
    root.add(rightArm, leftArm);

    // Initial fallback mesh while loading
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.65), this.darkMetal);
    fallback.position.set(0, 0, -0.32);
    modelContainer.add(fallback);

    // PBR Textures
    const texLoader = new THREE.TextureLoader();
    const scopeMat = new THREE.MeshStandardMaterial({
      map: texLoader.load(getAssetUrl("models/scar/textures/Scope_Tex_A.tga.png"), (t) => { t.colorSpace = THREE.SRGBColorSpace; }),
      metalnessMap: texLoader.load(getAssetUrl("models/scar/textures/Scope_Tex_M.tga.png")),
      roughnessMap: texLoader.load(getAssetUrl("models/scar/textures/Scope_Tex_R.tga.png")),
      normalMap: texLoader.load(getAssetUrl("models/scar/textures/Map__8_Normal_Bump.jpg")),
      roughness: 0.65,
      metalness: 0.8,
    });
    const bodyMat = new THREE.MeshStandardMaterial({
      map: texLoader.load(getAssetUrl("models/scar/textures/GAP_Examen_Gun_albedo_DriesDeryckere.tga.png"), (t) => { t.colorSpace = THREE.SRGBColorSpace; }),
      metalnessMap: texLoader.load(getAssetUrl("models/scar/textures/GAP_Examen_Gun_metalness_DriesDeryckere.tg.png")),
      roughnessMap: texLoader.load(getAssetUrl("models/scar/textures/GAP_Examen_Gun_roughness_DriesDeryckere.tg.png")),
      normalMap: texLoader.load(getAssetUrl("models/scar/textures/Map__9_Normal_Bump.jpg")),
      roughness: 0.6,
      metalness: 0.85,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      map: texLoader.load(getAssetUrl("models/scar/textures/Grip_Tex_A.tga.png"), (t) => { t.colorSpace = THREE.SRGBColorSpace; }),
      metalnessMap: texLoader.load(getAssetUrl("models/scar/textures/Grip_Tex_M.tga.png")),
      roughnessMap: texLoader.load(getAssetUrl("models/scar/textures/Grip_Tex_R.tga.png")),
      normalMap: texLoader.load(getAssetUrl("models/scar/textures/Map__10_Normal_Bump.jpg")),
      roughness: 0.8,
      metalness: 0.2,
    });

    const objLoader = new OBJLoader();
    objLoader.load(
      getAssetUrl("models/scar/source/Gun.obj"),
      (obj) => {
        modelContainer.remove(fallback);
        fallback.geometry.dispose();

        obj.scale.setScalar(0.01);
        obj.rotation.y = Math.PI;
        obj.position.set(0, -0.04, -0.1);

        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.name === "LO030") child.material = scopeMat;
            else if (child.name === "LO032") child.material = gripMat;
            else child.material = bodyMat;
          }
        });
        modelContainer.add(obj);
      },
      undefined,
      (err) => console.warn("SCAR model load notice:", err)
    );

    return { group: root, muzzle, ejector, rightArm, leftArm };
  }

  // 7. 10MM "ENFORCER" (High-detail 3D imported FBX model with blowback slide)
  buildPistol10mm(): WeaponRigParts {
    const root = new THREE.Group();
    const modelContainer = new THREE.Group();
    root.add(modelContainer);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.018, -0.38);
    const ejector = new THREE.Object3D();
    ejector.position.set(0.028, 0.025, -0.24);
    root.add(muzzle, ejector);

    // Tactical combat arms (two-handed pistol stance)
    const rightArm = buildTacticalArm("right", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    rightArm.position.set(0.04, -0.16, -0.08);
    rightArm.rotation.set(-0.15, -0.05, 0.12);

    const leftArm = buildTacticalArm("left", this.camoSleeve, this.carbonGlove, this.leatherPalm);
    leftArm.position.set(-0.03, -0.18, -0.10);
    leftArm.rotation.set(0.2, 0.35, -0.12);
    root.add(rightArm, leftArm);

    // Fallback mesh while loading
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.22), this.darkMetal);
    fallback.position.set(0, -0.04, -0.24);
    modelContainer.add(fallback);

    let slideMesh: THREE.Object3D | undefined;
    let origSlideY = 0;

    const movingPartProxy = new THREE.Object3D();
    root.add(movingPartProxy);
    let slideRecoil = 0;
    Object.defineProperty(movingPartProxy.position, "z", {
      get: () => slideRecoil,
      set: (val: number) => {
        slideRecoil = val;
        if (slideMesh) {
          slideMesh.position.y = origSlideY + val * 100;
        }
      },
    });

    // Load PBR Textures
    const texLoader = new THREE.TextureLoader();
    const pistolMat = new THREE.MeshStandardMaterial({
      map: texLoader.load(getAssetUrl("models/pistol/Gun_BaseColor.png"), (t) => { t.colorSpace = THREE.SRGBColorSpace; }),
      metalnessMap: texLoader.load(getAssetUrl("models/pistol/Gun_Metallic.png")),
      roughnessMap: texLoader.load(getAssetUrl("models/pistol/Gun_Roughness.png")),
      normalMap: texLoader.load(getAssetUrl("models/pistol/Gun_Normal.png")),
      roughness: 0.65,
      metalness: 0.85,
    });

    const fbxLoader = new FBXLoader();
    fbxLoader.load(
      getAssetUrl("models/pistol/Gun 10mm.fbx"),
      (fbx) => {
        modelContainer.remove(fallback);
        fallback.geometry.dispose();

        fbx.scale.setScalar(0.01);
        fbx.rotation.y = Math.PI;
        fbx.position.set(0, -0.05, -0.22);

        fbx.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material = pistolMat;
            if (child.name === "Slide") {
              slideMesh = child;
              origSlideY = child.position.y;
            }
          }
        });
        modelContainer.add(fbx);
      },
      undefined,
      (err) => console.warn("Pistol model load notice:", err)
    );

    return {
      group: root,
      muzzle,
      ejector,
      movingPart: movingPartProxy,
      rightArm,
      leftArm,
    };
  }
}

// ---------------------------------------------------------------- Ejecting Shell Casings Engine
export class CasingManager {
  private casings: CasingInstance[] = [];
  private scene: THREE.Scene;
  private rifleGeo: THREE.CylinderGeometry;
  private shotgunGeo: THREE.CylinderGeometry;
  private pistolGeo: THREE.CylinderGeometry;
  private brassMat: THREE.MeshStandardMaterial;
  private shotgunHullMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rifleGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.038, 8);
    this.shotgunGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.055, 8);
    this.pistolGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.026, 8);
    this.brassMat = new THREE.MeshStandardMaterial({
      map: createBrassTexture(),
      roughness: 0.3,
      metalness: 0.95,
    });
    this.shotgunHullMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.6,
      metalness: 0.1,
    });
  }

  spawnCasing(pos: THREE.Vector3, rightDir: THREE.Vector3, type: "rifle" | "shotgun" | "pistol") {
    if (this.casings.length > 25) {
      const old = this.casings.shift()!;
      this.scene.remove(old.mesh);
    }
    const geo = type === "shotgun" ? this.shotgunGeo : type === "rifle" ? this.rifleGeo : this.pistolGeo;
    const mat = type === "shotgun" ? this.shotgunHullMat : this.brassMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    this.scene.add(mesh);

    // Ejection velocity vector (up and right with forward carry)
    const vel = rightDir.clone().multiplyScalar(3.2 + Math.random() * 1.5)
      .add(new THREE.Vector3(0, 2.4 + Math.random() * 1.2, 0))
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));

    const rotVel = new THREE.Vector3(
      15 + Math.random() * 25,
      20 + Math.random() * 30,
      10 + Math.random() * 20
    );

    this.casings.push({ mesh, vel, rotVel, life: 3.5, bounced: false });
  }

  update(dt: number, groundHeightFn: (x: number, z: number) => number) {
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.casings.splice(i, 1);
        continue;
      }

      c.vel.y -= 18 * dt; // gravity
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.rotVel.x * dt;
      c.mesh.rotation.y += c.rotVel.y * dt;
      c.mesh.rotation.z += c.rotVel.z * dt;

      const gh = groundHeightFn(c.mesh.position.x, c.mesh.position.z);
      if (c.mesh.position.y <= gh + 0.03) {
        c.mesh.position.y = gh + 0.03;
        if (!c.bounced) {
          c.bounced = true;
          c.vel.y = Math.abs(c.vel.y) * 0.35;
          c.vel.x *= 0.5;
          c.vel.z *= 0.5;
          c.rotVel.multiplyScalar(0.4);
        } else {
          c.vel.set(0, 0, 0);
          c.rotVel.set(0, 0, 0);
        }
      }
    }
  }

  clear() {
    for (const c of this.casings) {
      this.scene.remove(c.mesh);
    }
    this.casings = [];
  }
}

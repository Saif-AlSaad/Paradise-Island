import * as THREE from "three";
import {
  createCamoTexture,
  createBallisticNylonTexture,
  createFaceTexture,
  createGunmetalTexture,
  createBrassTexture,
  createPolymerTexture,
} from "./proceduralTextures";

export type EnemyKind = "grunt" | "rusher" | "heavy" | "boss";

export interface EnemyCharacterRig {
  root: THREE.Group;
  upperBody: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  forearmL: THREE.Group;
  forearmR: THREE.Group;
  thighL: THREE.Group;
  thighR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  weaponGroup: THREE.Group;
  muzzle: THREE.Object3D;
  spinningBarrel?: THREE.Object3D;
  hitboxHead: THREE.Mesh;
  hitboxTorso: THREE.Mesh;
}

export class EnemyModelFactory {
  private camoWoodland: THREE.MeshStandardMaterial;
  private camoTiger: THREE.MeshStandardMaterial;
  private camoUrban: THREE.MeshStandardMaterial;
  private camoRusher: THREE.MeshStandardMaterial;
  private nylonVest: THREE.MeshStandardMaterial;
  private heavyArmor: THREE.MeshStandardMaterial;
  private bootsMat: THREE.MeshStandardMaterial;
  private gearBlack: THREE.MeshStandardMaterial;
  private bluedSteel: THREE.MeshStandardMaterial;
  private machinedSteel: THREE.MeshStandardMaterial;
  private brassMat: THREE.MeshStandardMaterial;
  private polymerMat: THREE.MeshStandardMaterial;

  constructor() {
    this.camoWoodland = new THREE.MeshStandardMaterial({ map: createCamoTexture("woodland"), roughness: 0.9 });
    this.camoTiger = new THREE.MeshStandardMaterial({ map: createCamoTexture("tiger"), roughness: 0.9 });
    this.camoUrban = new THREE.MeshStandardMaterial({ map: createCamoTexture("urban"), roughness: 0.9 });
    this.camoRusher = new THREE.MeshStandardMaterial({ map: createCamoTexture("rusher"), roughness: 0.9 });
    this.nylonVest = new THREE.MeshStandardMaterial({ map: createBallisticNylonTexture("#262923"), roughness: 0.85 });
    this.heavyArmor = new THREE.MeshStandardMaterial({ map: createBallisticNylonTexture("#191a1d"), roughness: 0.65, metalness: 0.4 });
    this.bootsMat = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.85 });
    this.gearBlack = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.8 });
    this.bluedSteel = new THREE.MeshStandardMaterial({ map: createGunmetalTexture("blued"), roughness: 0.35, metalness: 0.85 });
    this.machinedSteel = new THREE.MeshStandardMaterial({ map: createGunmetalTexture("steel"), roughness: 0.28, metalness: 0.92 });
    this.brassMat = new THREE.MeshStandardMaterial({ map: createBrassTexture(), roughness: 0.3, metalness: 0.95 });
    this.polymerMat = new THREE.MeshStandardMaterial({ map: createPolymerTexture(), roughness: 0.85, metalness: 0.1 });
  }

  buildEnemy(kind: EnemyKind): EnemyCharacterRig {
    const root = new THREE.Group();
    const isBoss = kind === "boss";
    const isHeavy = kind === "heavy";
    const isRusher = kind === "rusher";
    const scale = isBoss ? 1.38 : isHeavy ? 1.15 : 1.0;

    const pantsMat = isRusher ? this.camoRusher : isHeavy ? this.camoUrban : this.camoTiger;
    const shirtMat = isRusher ? this.camoRusher : isHeavy ? this.camoUrban : this.camoWoodland;
    const skinTone = isBoss ? "#8a583a" : isRusher ? "#a8714b" : "#99633e";
    const faceMat = new THREE.MeshStandardMaterial({
      map: createFaceTexture(skinTone, true, true),
      roughness: 0.85,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: skinTone,
      roughness: 0.85,
    });

    // ---------------- Pelvis / Hips
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.26), pantsMat);
    pelvis.position.y = 0.92;
    root.add(pelvis);

    const dutyBelt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.28), this.gearBlack);
    dutyBelt.position.y = 0.97;
    const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), this.machinedSteel);
    beltBuckle.position.set(0, 0.97, 0.145);
    root.add(dutyBelt, beltBuckle);

    // ---------------- Upper Body (pivots for aim tracking & flinch)
    const upperBody = new THREE.Group();
    upperBody.position.set(0, 0.96, 0);

    // Muscular Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.26), shirtMat);
    torso.position.y = 0.23;

    // Tactical Ballistic Plate Carrier Vest
    const vestMat = isHeavy ? this.heavyArmor : this.nylonVest;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.32), vestMat);
    vest.position.y = 0.24;

    // MOLLE mag pouches on chest
    for (let px of [-0.12, 0, 0.12]) {
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.06), this.gearBlack);
      pouch.position.set(px, 0.18, 0.18);
      vest.add(pouch);
    }

    // Radio transceiver with flexible antenna on left shoulder
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.05), this.gearBlack);
    radio.position.set(-0.2, 0.36, 0.08);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.24, 6), this.gearBlack);
    antenna.position.set(-0.2, 0.5, 0.08);
    vest.add(radio, antenna);

    // Canteen on right side
    const canteen = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8), this.gearBlack);
    canteen.position.set(0.23, 0.02, 0.04);
    vest.add(canteen);

    // Heavy & Boss Extra Armor
    if (isHeavy || isBoss) {
      // Ballistic Pauldrons (shoulder protectors)
      for (let sx of [-0.28, 0.28]) {
        const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.24), this.heavyArmor);
        pauldron.position.set(sx, 0.38, 0);
        upperBody.add(pauldron);
      }
      // Throat collar protector
      const throatCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 10, 1, true), this.heavyArmor);
      throatCollar.position.set(0, 0.44, 0);
      upperBody.add(throatCollar);
    }

    if (isBoss) {
      // Commander's Gold braided epaulets & trenchcoat collar
      for (let sx of [-0.25, 0.25]) {
        const epaulet = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.18), this.brassMat);
        epaulet.position.set(sx, 0.45, 0);
        upperBody.add(epaulet);
      }
    }

    upperBody.add(torso, vest);

    // ---------------- Head & Neck
    const head = new THREE.Group();
    head.position.set(0, 0.48, 0);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.095, 0.1, 8), skinMat);
    neck.position.y = 0.04;
    head.add(neck);

    // Anatomical Head
    const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), faceMat);
    cranium.position.y = 0.22;
    head.add(cranium);

    // Headwear by Enemy Kind
    if (isBoss) {
      // Peaked Officer Cap with Gold Crest
      const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.08, 14), this.gearBlack);
      capBand.position.y = 0.35;
      const capCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.1, 14), this.camoUrban);
      capCrown.position.y = 0.42;
      const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.14), this.gearBlack);
      capVisor.position.set(0, 0.34, 0.14);
      capVisor.rotation.x = 0.25;
      const goldEagle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), this.brassMat);
      goldEagle.position.set(0, 0.4, 0.17);
      head.add(capBand, capCrown, capVisor, goldEagle);
    } else if (isHeavy) {
      // PASGT Ballistic Helmet with Riot Visor
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), this.heavyArmor);
      helmet.position.set(0, 0.26, -0.01);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12, 1, true, -Math.PI / 3, (Math.PI * 2) / 3), new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.1, metalness: 0.9 }));
      visor.position.set(0, 0.22, 0.02);
      head.add(helmet, visor);
    } else if (isRusher) {
      // Combat Red Bandana with Tied Knot at Back
      const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.1, 12), this.camoRusher);
      bandana.position.y = 0.32;
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.04), this.camoRusher);
      knot.position.set(0, 0.26, -0.15);
      head.add(bandana, knot);
    } else {
      // Tactical Green/Tiger Bandana & Comms Headset
      const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.09, 12), this.camoTiger);
      bandana.position.y = 0.32;
      const headsetBand = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 12, Math.PI), this.gearBlack);
      headsetBand.rotation.x = Math.PI / 2;
      headsetBand.position.y = 0.35;
      head.add(bandana, headsetBand);
    }

    upperBody.add(head);

    // ---------------- Arms (Kinematic Joint Chains)
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.28, 0.4, 0);
    armR.position.set(0.28, 0.4, 0);

    // Left Arm Chain
    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.26, 8), shirtMat);
    upperArmL.position.set(0, -0.12, 0);
    armL.add(upperArmL);

    const forearmL = new THREE.Group();
    forearmL.position.set(0, -0.25, 0);
    const lowerArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.24, 8), skinMat);
    lowerArmL.position.set(0, -0.11, 0);
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.09), this.gearBlack);
    handL.position.set(0, -0.25, 0);
    forearmL.add(lowerArmL, handL);
    armL.add(forearmL);

    // Right Arm Chain
    const upperArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.26, 8), shirtMat);
    upperArmR.position.set(0, -0.12, 0);
    armR.add(upperArmR);

    const forearmR = new THREE.Group();
    forearmR.position.set(0, -0.25, 0);
    const lowerArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.24, 8), skinMat);
    lowerArmR.position.set(0, -0.11, 0);
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.09), this.gearBlack);
    handR.position.set(0, -0.25, 0);
    forearmR.add(lowerArmR, handR);
    armR.add(forearmR);

    upperBody.add(armL, armR);
    root.add(upperBody);

    // ---------------- Legs (Kinematic Thigh & Shin Chains)
    const thighL = new THREE.Group(), thighR = new THREE.Group();
    thighL.position.set(-0.13, 0.88, 0);
    thighR.position.set(0.13, 0.88, 0);

    // Left Leg
    const upperLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.42, 8), pantsMat);
    upperLegL.position.set(0, -0.2, 0);
    thighL.add(upperLegL);

    const shinL = new THREE.Group();
    shinL.position.set(0, -0.41, 0);
    const lowerLegL = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.065, 0.42, 8), pantsMat);
    lowerLegL.position.set(0, -0.2, 0);
    const kneePadL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.08), this.gearBlack);
    kneePadL.position.set(0, 0, 0.065);
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.24), this.bootsMat);
    bootL.position.set(0, -0.4, 0.04);
    shinL.add(lowerLegL, kneePadL, bootL);
    thighL.add(shinL);

    // Right Leg
    const upperLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.42, 8), pantsMat);
    upperLegR.position.set(0, -0.2, 0);
    thighR.add(upperLegR);

    const shinR = new THREE.Group();
    shinR.position.set(0, -0.41, 0);
    const lowerLegR = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.065, 0.42, 8), pantsMat);
    lowerLegR.position.set(0, -0.2, 0);
    const kneePadR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.08), this.gearBlack);
    kneePadR.position.set(0, 0, 0.065);
    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.24), this.bootsMat);
    bootR.position.set(0, -0.4, 0.04);
    shinR.add(lowerLegR, kneePadR, bootR);
    thighR.add(shinR);

    root.add(thighL, thighR);

    // ---------------- Enemy Held Weapons
    const weaponGroup = new THREE.Group();
    const muzzle = new THREE.Object3D();
    let spinningBarrel: THREE.Object3D | undefined;

    if (isRusher) {
      // Dual Serrated Machetes
      for (let s of [-1, 1]) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.58, 0.11), this.machinedSteel);
        blade.position.set(s * 0.28, -0.12, 0.28);
        blade.rotation.set(0.9, 0, s * 0.3);
        const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), this.gearBlack);
        hilt.position.set(s * 0.28, -0.24, 0.14);
        weaponGroup.add(blade, hilt);
      }
      muzzle.position.set(0, 0, 0.6);
      forearmR.add(weaponGroup);
    } else if (isBoss) {
      // Kruger's 6-Barrel Micro-Minigun with ammo feed chute
      const minigunBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.42, 10), this.gearBlack);
      minigunBody.rotation.x = Math.PI / 2;
      minigunBody.position.set(0, -0.1, 0.24);

      // Rotating Barrel Cluster
      const barrelCluster = new THREE.Group();
      barrelCluster.position.set(0, -0.1, 0.46);
      for (let b = 0; b < 6; b++) {
        const ang = (b * Math.PI * 2) / 6;
        const bMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.58, 8), this.bluedSteel);
        bMesh.rotation.x = Math.PI / 2;
        bMesh.position.set(Math.cos(ang) * 0.065, Math.sin(ang) * 0.065, 0.28);
        barrelCluster.add(bMesh);
      }
      const barrelClamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), this.machinedSteel);
      barrelClamp.rotation.x = Math.PI / 2;
      barrelClamp.position.set(0, 0, 0.5);
      barrelCluster.add(barrelClamp);

      spinningBarrel = barrelCluster;
      muzzle.position.set(0, 0, 0.65);
      barrelCluster.add(muzzle);

      // Brass bullet feed chute
      const chute = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.38), this.brassMat);
      chute.position.set(-0.14, -0.06, 0.12);
      chute.rotation.y = 0.45;

      weaponGroup.add(minigunBody, barrelCluster, chute);
      weaponGroup.position.set(0.12, -0.18, 0.16);
      upperBody.add(weaponGroup);
    } else if (isHeavy) {
      // Squad Automatic Machine Gun with drum mag and ammo belt
      const lmgBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.64), this.polymerMat);
      lmgBody.position.set(0.18, -0.18, 0.26);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 8), this.machinedSteel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.18, -0.16, 0.65);

      const drumMag = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.11, 12), this.gearBlack);
      drumMag.rotation.z = Math.PI / 2;
      drumMag.position.set(0.18, -0.28, 0.26);

      muzzle.position.set(0.18, -0.16, 0.88);
      weaponGroup.add(lmgBody, barrel, drumMag, muzzle);
      upperBody.add(weaponGroup);
    } else {
      // Grunt Assault Rifle
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.54), this.bluedSteel);
      rifle.position.set(0.12, -0.15, 0.24);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.08), this.gearBlack);
      mag.position.set(0.12, -0.24, 0.22);
      mag.rotation.x = 0.2;

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.35, 8), this.machinedSteel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0.12, -0.13, 0.56);

      muzzle.position.set(0.12, -0.13, 0.74);
      weaponGroup.add(rifle, mag, barrel, muzzle);
      upperBody.add(weaponGroup);
    }

    // ---------------- Invisible Hitboxes (Head and Torso)
    const hitboxHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.48 * scale, 0.48 * scale, 0.48 * scale),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitboxHead.position.set(0, 1.95 * scale, 0);
    hitboxHead.userData.part = "head";

    const hitboxTorso = new THREE.Mesh(
      new THREE.BoxGeometry(0.72 * scale, 1.1 * scale, 0.5 * scale),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitboxTorso.position.set(0, 1.2 * scale, 0);
    hitboxTorso.userData.part = "body";

    root.add(hitboxHead, hitboxTorso);
    root.scale.setScalar(scale);

    return {
      root,
      upperBody,
      head,
      armL,
      armR,
      forearmL,
      forearmR,
      thighL,
      thighR,
      shinL,
      shinR,
      weaponGroup,
      muzzle,
      spinningBarrel,
      hitboxHead,
      hitboxTorso,
    };
  }

  // ---------------- Update Procedural Animation Kinematics
  animate(
    rig: EnemyCharacterRig,
    dt: number,
    animTime: number,
    state: "idle" | "combat" | "dead",
    isMoving: boolean,
    moveSpeed: number,
    isFiring: boolean,
    flinchAmount: number,
    deathProgress: number,
    lookTarget: THREE.Vector3 | null
  ) {
    if (state === "dead") {
      // Realistic falling death collapse
      const t = Math.min(1, deathProgress);
      // Legs buckle
      rig.thighL.rotation.x = THREE.MathUtils.lerp(rig.thighL.rotation.x, -1.2, t);
      rig.thighR.rotation.x = THREE.MathUtils.lerp(rig.thighR.rotation.x, -1.0, t);
      rig.shinL.rotation.x = THREE.MathUtils.lerp(rig.shinL.rotation.x, 1.6, t);
      rig.shinR.rotation.x = THREE.MathUtils.lerp(rig.shinR.rotation.x, 1.5, t);
      // Upper torso drops backward/down
      rig.upperBody.rotation.x = THREE.MathUtils.lerp(rig.upperBody.rotation.x, -1.35, t);
      rig.upperBody.position.y = THREE.MathUtils.lerp(0.96, 0.22, t);
      rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, 0.6, t);
      // Arms go limp
      rig.armL.rotation.x = THREE.MathUtils.lerp(rig.armL.rotation.x, 0.4, t);
      rig.armR.rotation.x = THREE.MathUtils.lerp(rig.armR.rotation.x, 0.4, t);
      rig.armL.rotation.z = THREE.MathUtils.lerp(rig.armL.rotation.z, -0.8, t);
      rig.armR.rotation.z = THREE.MathUtils.lerp(rig.armR.rotation.z, 0.8, t);
      return;
    }

    // Walking / Running Gait Cycle
    if (isMoving) {
      const freq = moveSpeed * 1.8;
      const legSwing = Math.sin(animTime * freq) * 0.75;
      const kneeFlex = Math.max(0, Math.sin(animTime * freq + Math.PI / 2)) * 0.85;
      const kneeFlexR = Math.max(0, Math.sin(animTime * freq - Math.PI / 2)) * 0.85;

      rig.thighL.rotation.x = legSwing;
      rig.thighR.rotation.x = -legSwing;
      rig.shinL.rotation.x = legSwing < 0 ? -kneeFlex : 0.05;
      rig.shinR.rotation.x = -legSwing < 0 ? -kneeFlexR : 0.05;

      // Hip sway & slight vertical step bounce
      rig.root.position.y = Math.abs(Math.sin(animTime * freq)) * 0.04;
      rig.upperBody.rotation.z = Math.sin(animTime * freq) * 0.035;

      // Arm counter swing (more pronounced if idle/patrolling)
      if (state !== "combat") {
        rig.armL.rotation.x = -legSwing * 0.6;
        rig.armR.rotation.x = legSwing * 0.6;
      }
    } else {
      // Natural idle breathing & weight shifting
      rig.thighL.rotation.x = 0.05;
      rig.thighR.rotation.x = -0.05;
      rig.shinL.rotation.x = 0;
      rig.shinR.rotation.x = 0;
      rig.upperBody.position.y = 0.96 + Math.sin(animTime * 1.8) * 0.015;
      rig.head.rotation.y = Math.sin(animTime * 0.6) * 0.2;
    }

    // 3D Upper Body Aim Tracking
    if (state === "combat" && lookTarget) {
      const worldPos = new THREE.Vector3();
      rig.root.getWorldPosition(worldPos);
      const toTarget = lookTarget.clone().sub(worldPos);
      const dist = Math.hypot(toTarget.x, toTarget.z);
      const pitch = Math.atan2(toTarget.y - 1.6, Math.max(1, dist));

      // Tilt upper body to aim at player's vertical elevation
      rig.upperBody.rotation.x = -pitch * 0.75;

      // Raise arms into ready firing posture
      rig.armL.rotation.set(-1.1 + pitch * 0.3, 0.45, -0.2);
      rig.armR.rotation.set(-1.25 + pitch * 0.3, -0.35, 0.15);
      rig.forearmL.rotation.set(-0.6, 0, 0);
      rig.forearmR.rotation.set(-0.5, 0, 0);

      // Weapon firing recoil kick
      if (isFiring) {
        rig.upperBody.rotation.x -= 0.08;
        rig.weaponGroup.position.z -= 0.03;
        if (rig.spinningBarrel) {
          rig.spinningBarrel.rotation.z += dt * 35; // Minigun high-speed rotation
        }
      } else {
        rig.weaponGroup.position.z = THREE.MathUtils.lerp(rig.weaponGroup.position.z, 0, dt * 10);
      }
    } else {
      // Relaxed patrolling posture
      rig.upperBody.rotation.x = 0;
      rig.armL.rotation.set(-0.35, 0.2, -0.15);
      rig.armR.rotation.set(-0.45, -0.2, 0.15);
      rig.forearmL.rotation.set(-0.4, 0, 0);
      rig.forearmR.rotation.set(-0.3, 0, 0);
    }

    // Hit Flinch Stagger (directional jolt)
    if (flinchAmount > 0.01) {
      rig.upperBody.rotation.x += flinchAmount * 0.45;
      rig.upperBody.rotation.z += (Math.random() - 0.5) * flinchAmount * 0.4;
      rig.head.rotation.x += flinchAmount * 0.35;
    }
  }
}

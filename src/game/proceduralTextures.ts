import * as THREE from "three";

// Cache generated textures so we don't duplicate canvas work
const textureCache = new Map<string, THREE.CanvasTexture>();

function getOrCreate(key: string, draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256): THREE.CanvasTexture {
  if (textureCache.has(key)) return textureCache.get(key)!;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  textureCache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------- Gunmetal & Steels
export function createGunmetalTexture(type: "blued" | "steel" | "dark" = "blued"): THREE.CanvasTexture {
  return getOrCreate(`gunmetal-${type}`, (ctx, s) => {
    // Base gradient
    const grad = ctx.createLinearGradient(0, 0, s, s);
    if (type === "blued") {
      grad.addColorStop(0, "#1c1f24");
      grad.addColorStop(0.5, "#252b33");
      grad.addColorStop(1, "#181b20");
    } else if (type === "steel") {
      grad.addColorStop(0, "#4a4e57");
      grad.addColorStop(0.5, "#616875");
      grad.addColorStop(1, "#3e4249");
    } else {
      grad.addColorStop(0, "#121316");
      grad.addColorStop(0.5, "#1c1e22");
      grad.addColorStop(1, "#0d0e10");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // Directional brushed metal horizontal streaks
    ctx.lineWidth = 1;
    for (let i = 0; i < 350; i++) {
      const y = Math.random() * s;
      const alpha = 0.04 + Math.random() * 0.09;
      const bright = Math.random() > 0.4;
      ctx.strokeStyle = bright ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.5})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }

    // Micro-scratches & edge wear
    ctx.strokeStyle = "rgba(230,240,255,0.08)";
    for (let i = 0; i < 35; i++) {
      ctx.beginPath();
      const x1 = Math.random() * s, y1 = Math.random() * s;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + (Math.random() - 0.5) * 20, y1 + (Math.random() - 0.5) * 15);
      ctx.stroke();
    }

    // Subtle gun oil iridescence sheen
    if (type === "blued") {
      const oilGrad = ctx.createLinearGradient(0, 0, s, 0);
      oilGrad.addColorStop(0.2, "rgba(40, 70, 95, 0.04)");
      oilGrad.addColorStop(0.5, "rgba(80, 60, 95, 0.03)");
      oilGrad.addColorStop(0.8, "rgba(45, 85, 75, 0.04)");
      ctx.fillStyle = oilGrad;
      ctx.fillRect(0, 0, s, s);
    }
  }, 256);
}

// ---------------------------------------------------------------- Walnut Woodgrain
export function createWoodgrainTexture(dark = false): THREE.CanvasTexture {
  return getOrCreate(`woodgrain-${dark}`, (ctx, s) => {
    // Rich mahogany / walnut base
    const baseGrad = ctx.createLinearGradient(0, 0, 0, s);
    if (dark) {
      baseGrad.addColorStop(0, "#3e2413");
      baseGrad.addColorStop(0.5, "#4d2c18");
      baseGrad.addColorStop(1, "#331c0e");
    } else {
      baseGrad.addColorStop(0, "#6a3b1d");
      baseGrad.addColorStop(0.5, "#7d4724");
      baseGrad.addColorStop(1, "#593016");
    }
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, s, s);

    // Natural growth ring lines
    for (let i = 0; i < 120; i++) {
      const y = Math.random() * s;
      const alpha = 0.08 + Math.random() * 0.16;
      ctx.strokeStyle = Math.random() > 0.5 ? `rgba(35, 15, 5, ${alpha})` : `rgba(180, 110, 60, ${alpha * 0.7})`;
      ctx.lineWidth = 1 + Math.random() * 2.5;
      ctx.beginPath();
      let cx = 0, cy = y;
      ctx.moveTo(cx, cy);
      while (cx < s) {
        cx += 18;
        cy += Math.sin(cx * 0.04 + i) * 3 + (Math.random() - 0.5) * 1.5;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // Wood pores / fiber specks
    ctx.fillStyle = "rgba(25, 10, 4, 0.15)";
    for (let i = 0; i < 400; i++) {
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 3);
    }

    // Satin lacquer gloss highlight band
    const gloss = ctx.createLinearGradient(0, 0, s, s);
    gloss.addColorStop(0.4, "rgba(255,230,200,0.0)");
    gloss.addColorStop(0.5, "rgba(255,230,200,0.08)");
    gloss.addColorStop(0.6, "rgba(255,230,200,0.0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, s, s);
  }, 256);
}

// ---------------------------------------------------------------- Tactical Polymer
export function createPolymerTexture(): THREE.CanvasTexture {
  return getOrCreate("polymer-stipple", (ctx, s) => {
    ctx.fillStyle = "#1e2023";
    ctx.fillRect(0, 0, s, s);

    // Micro diamond / stipple knurling pattern
    const step = 4;
    for (let x = 0; x < s; x += step) {
      for (let y = 0; y < s; y += step) {
        const alt = ((x / step) % 2 === (y / step) % 2);
        ctx.fillStyle = alt ? "rgba(45, 48, 54, 0.8)" : "rgba(16, 17, 19, 0.9)";
        ctx.fillRect(x, y, step - 1, step - 1);
        ctx.fillStyle = alt ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }, 128);
}

// ---------------------------------------------------------------- Military Camouflage
export function createCamoTexture(variant: "woodland" | "tiger" | "urban" | "rusher"): THREE.CanvasTexture {
  return getOrCreate(`camo-${variant}`, (ctx, s) => {
    let colors: string[] = [];
    if (variant === "woodland") {
      colors = ["#394833", "#283424", "#52442d", "#1e1e1a", "#4a593e"];
    } else if (variant === "tiger") {
      colors = ["#2f3c2a", "#1d2319", "#3b3325", "#121410", "#45543c"];
    } else if (variant === "urban") {
      colors = ["#363b42", "#22262a", "#4a515a", "#181a1c", "#58626d"];
    } else {
      colors = ["#4e2424", "#2d1616", "#3d322d", "#181010", "#632d2d"];
    }

    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, s, s);

    for (let c = 1; c < colors.length; c++) {
      ctx.fillStyle = colors[c];
      for (let i = 0; i < 18; i++) {
        const bx = Math.random() * s, by = Math.random() * s;
        ctx.beginPath();
        ctx.arc(bx, by, 16 + Math.random() * 28, 0, Math.PI * 2);
        for (let j = 0; j < 4; j++) {
          const ox = bx + (Math.random() - 0.5) * 45;
          const oy = by + (Math.random() - 0.5) * 45;
          ctx.arc(ox, oy, 12 + Math.random() * 22, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }

    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let y = 0; y < s; y += 3) {
      ctx.fillRect(0, y, s, 1);
    }
  }, 256);
}

// ---------------------------------------------------------------- Ballistic Nylon / MOLLE
export function createBallisticNylonTexture(color = "#2a2d28"): THREE.CanvasTexture {
  return getOrCreate(`nylon-${color}`, (ctx, s) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    for (let x = 0; x < s; x += 4) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    for (let y = 0; y < s; y += 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    }
  }, 128);
}

// ---------------------------------------------------------------- Carbon Fiber Knuckles
export function createCarbonFiberTexture(): THREE.CanvasTexture {
  return getOrCreate("carbon-knuckle", (ctx, s) => {
    ctx.fillStyle = "#121417";
    ctx.fillRect(0, 0, s, s);

    const step = 8;
    for (let x = 0; x < s; x += step) {
      for (let y = 0; y < s; y += step) {
        const grad = ctx.createLinearGradient(x, y, x + step, y + step);
        grad.addColorStop(0, "rgba(45,50,58,0.9)");
        grad.addColorStop(0.5, "rgba(20,22,26,0.95)");
        grad.addColorStop(1, "rgba(35,38,44,0.9)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, step - 1, step - 1);
      }
    }
  }, 128);
}

// ---------------------------------------------------------------- Brass Cartridge Metal
export function createBrassTexture(): THREE.CanvasTexture {
  return getOrCreate("brass-cartridge", (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, "#d9a84e");
    grad.addColorStop(0.3, "#f4cf79");
    grad.addColorStop(0.6, "#c6923b");
    grad.addColorStop(1, "#8e6423");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, s * 0.25, s, s * 0.15);
  }, 64);
}

// ---------------------------------------------------------------- Character Face Texture
export function createFaceTexture(tone: string, hasBeard: boolean, sunglasses = true): THREE.CanvasTexture {
  const key = `face-${tone}-${hasBeard}-${sunglasses}`;
  return getOrCreate(key, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, tone);
    grad.addColorStop(0.6, tone);
    grad.addColorStop(1, "#26170d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    if (hasBeard) {
      ctx.fillStyle = "rgba(25, 18, 12, 0.55)";
      ctx.fillRect(s * 0.1, s * 0.58, s * 0.8, s * 0.38);
      ctx.fillStyle = "rgba(15, 10, 5, 0.7)";
      for (let i = 0; i < 400; i++) {
        ctx.fillRect(s * 0.15 + Math.random() * (s * 0.7), s * 0.55 + Math.random() * (s * 0.4), 1.5, 1.5);
      }
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(s * 0.44, s * 0.35, s * 0.12, s * 0.25);

    ctx.fillStyle = "rgba(160, 80, 70, 0.4)";
    ctx.fillRect(s * 0.36, s * 0.76, s * 0.28, s * 0.06);

    if (sunglasses) {
      ctx.strokeStyle = "#cbb269";
      ctx.lineWidth = 3;
      ctx.fillStyle = "#0c0f12";
      ctx.beginPath();
      ctx.roundRect(s * 0.12, s * 0.32, s * 0.34, s * 0.22, 6);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(s * 0.54, s * 0.32, s * 0.34, s * 0.22, 6);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.42, s * 0.36);
      ctx.lineTo(s * 0.58, s * 0.36);
      ctx.stroke();

      const lensGrad = ctx.createLinearGradient(0, s * 0.32, s, s * 0.54);
      lensGrad.addColorStop(0.3, "rgba(255,255,255,0.0)");
      lensGrad.addColorStop(0.45, "rgba(200,230,255,0.35)");
      lensGrad.addColorStop(0.55, "rgba(255,255,255,0.0)");
      ctx.fillStyle = lensGrad;
      ctx.fillRect(s * 0.12, s * 0.32, s * 0.76, s * 0.22);
    }
  }, 256);
}

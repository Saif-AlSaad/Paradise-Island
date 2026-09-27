import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Settings as SettingsIcon, BookOpen, Crosshair, Heart, Trophy, Skull, Target,
  Flag, Timer, Home, RotateCcw, Volume2, VolumeX, Bomb, ChevronRight, Zap, Award,
  MapPin, Syringe, Pause as PauseIcon, Mouse, Keyboard, Wind, Flame, AlertTriangle,
  CheckCircle2, Circle, Radar, Skull as SkullIcon, Radio,
} from "lucide-react";
import { FPEngine, type HUDState, type Settings, type Stats, type GameEvent } from "./game/engine";

// ---------------------------------------------------------------- helpers
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem("pf-settings");
    if (raw) return { sensitivity: 1, volume: 0.8, quality: "high", invertY: false, fov: 78, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { sensitivity: 1, volume: 0.8, quality: "high", invertY: false, fov: 78 };
};
const loadBest = (): { score: number; time: number; kills: number } => {
  try {
    const raw = localStorage.getItem("pf-best");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { score: 0, time: 0, kills: 0 };
};

type Screen = "menu" | "playing" | "paused" | "dead" | "victory";
interface FeedItem { id: number; text: string; headshot?: boolean }
interface ToastItem { id: number; title: string; sub?: string; color?: string }

let uid = 1;

// ---------------------------------------------------------------- main
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FPEngine | null>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<Screen>("menu");

  const [screen, setScreenState] = useState<Screen>("menu");
  const [subMenu, setSubMenu] = useState<null | "howto" | "settings">(null);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [hud, setHud] = useState<HUDState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [best, setBest] = useState(loadBest);
  const [locked, setLocked] = useState(false);
  const [killfeed, setKillfeed] = useState<FeedItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pickups, setPickups] = useState<FeedItem[]>([]);
  const [hitmarker, setHitmarker] = useState<{ id: number; kill: boolean; headshot: boolean } | null>(null);
  const [dmgFlash, setDmgFlash] = useState<{ id: number; angle: number } | null>(null);
  const [healFlash, setHealFlash] = useState(0);
  const [bossWarn, setBossWarn] = useState(false);
  const [ammoWarn, setAmmoWarn] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const isTouch = useRef(typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)).current;

  const setScreen = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);

  // ---- engine lifecycle ----
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new FPEngine(
      canvasRef.current,
      {
        onHUD: (h) => setHud(h),
        onEvent: (e: GameEvent) => {
          if (e.type === "hitmarker") {
            setHitmarker({ id: uid++, kill: e.kill, headshot: e.headshot });
          } else if (e.type === "damage") {
            setDmgFlash({ id: uid++, angle: e.angle });
          } else if (e.type === "killfeed") {
            const id = uid++;
            setKillfeed((k) => [...k.slice(-4), { id, text: e.text, headshot: e.headshot }]);
            setTimeout(() => setKillfeed((k) => k.filter((x) => x.id !== id)), 4200);
          } else if (e.type === "toast") {
            const id = uid++;
            setToasts((t) => [...t.slice(-1), { id, title: e.title, sub: e.sub, color: e.color }]);
            setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
          } else if (e.type === "pickup") {
            const id = uid++;
            setPickups((p) => [...p.slice(-2), { id, text: e.text }]);
            setTimeout(() => setPickups((p) => p.filter((x) => x.id !== id)), 2600);
          } else if (e.type === "heal") {
            setHealFlash(uid++);
          } else if (e.type === "boss") {
            setBossWarn(true);
            setTimeout(() => setBossWarn(false), 3600);
          } else if (e.type === "ammo-warning") {
            setAmmoWarn(uid++);
          } else if (e.type === "gameover") {
            setStats(e.stats);
            setBest((b) => {
              const nb = {
                score: Math.max(b.score, e.stats.score),
                time: b.time,
                kills: Math.max(b.kills, e.stats.kills),
              };
              if (e.victory && (e.stats.score > b.score || b.score === 0)) {
                nb.time = e.stats.time;
                setNewBest(true);
              } else setNewBest(false);
              localStorage.setItem("pf-best", JSON.stringify(nb));
              return nb;
            });
            setScreen(e.victory ? "victory" : "dead");
          }
        },
        onLockChange: (l) => {
          setLocked(l);
          if (!l && screenRef.current === "playing") setScreen("paused");
        },
      },
      loadSettings()
    );
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [setScreen]);

  // hitmarker / dmg auto clear
  useEffect(() => {
    if (!hitmarker) return;
    const t = setTimeout(() => setHitmarker(null), 300);
    return () => clearTimeout(t);
  }, [hitmarker]);
  useEffect(() => {
    if (!dmgFlash) return;
    const t = setTimeout(() => setDmgFlash(null), 700);
    return () => clearTimeout(t);
  }, [dmgFlash]);

  // minimap loop
  useEffect(() => {
    if (screen !== "playing" && screen !== "paused") return;
    const iv = setInterval(() => {
      const cv = minimapRef.current;
      const eng = engineRef.current;
      if (cv && eng) {
        const ctx = cv.getContext("2d");
        if (ctx) eng.drawMinimap(ctx, cv.width);
      }
    }, 120);
    return () => clearInterval(iv);
  }, [screen]);

  // ---- actions ----
  const updateSettings = (s: Settings) => {
    setSettingsState(s);
    localStorage.setItem("pf-settings", JSON.stringify(s));
    engineRef.current?.setSettings(s);
  };
  const startGame = () => {
    setKillfeed([]); setToasts([]); setPickups([]); setStats(null);
    setScreen("playing");
    engineRef.current?.startGame();
  };
  const resumeGame = () => {
    setScreen("playing");
    engineRef.current?.resume();
  };
  const quitToMenu = () => {
    engineRef.current?.quitToMenu();
    setScreen("menu");
  };

  const heading = hud ? ((-hud.yaw * 180) / Math.PI % 360 + 360) % 360 : 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="game-canvas absolute inset-0" />

      {/* film grain + vignette */}
      <div className="grain pointer-events-none absolute inset-0 z-10" />
      <div className="vignette-heavy pointer-events-none absolute inset-0 z-10" />

      {/* ============================ HUD ============================ */}
      {(screen === "playing" || screen === "paused") && hud && (
        <HUD
          hud={hud}
          heading={heading}
          killfeed={killfeed}
          toasts={toasts}
          pickups={pickups}
          hitmarker={hitmarker}
          dmgFlash={dmgFlash}
          healFlash={healFlash}
          bossWarn={bossWarn}
          ammoWarn={ammoWarn}
          minimapRef={minimapRef}
          locked={locked}
          onCapture={() => engineRef.current?.requestLock()}
          showCapture={screen === "playing" && !locked && !isTouch}
        />
      )}

      {/* touch controls */}
      {screen === "playing" && isTouch && (
        <TouchControls engineRef={engineRef} />
      )}

      {/* ============================ MENUS ============================ */}
      {screen === "menu" && (
        <MainMenu
          best={best}
          subMenu={subMenu}
          setSubMenu={setSubMenu}
          settings={settings}
          updateSettings={updateSettings}
          onDeploy={startGame}
          isTouch={isTouch}
        />
      )}

      {screen === "paused" && (
        <PauseMenu
          hud={hud}
          subMenu={subMenu}
          setSubMenu={setSubMenu}
          settings={settings}
          updateSettings={updateSettings}
          onResume={resumeGame}
          onRestart={startGame}
          onQuit={quitToMenu}
        />
      )}

      {(screen === "dead" || screen === "victory") && stats && (
        <EndScreen
          victory={screen === "victory"}
          stats={stats}
          newBest={newBest}
          onRetry={startGame}
          onQuit={quitToMenu}
        />
      )}
    </div>
  );
}

// ================================================================= HUD
function HUD(props: {
  hud: HUDState; heading: number;
  killfeed: FeedItem[]; toasts: ToastItem[]; pickups: FeedItem[];
  hitmarker: { id: number; kill: boolean; headshot: boolean } | null;
  dmgFlash: { id: number; angle: number } | null;
  healFlash: number; bossWarn: boolean; ammoWarn: number;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  locked: boolean; onCapture: () => void; showCapture: boolean;
}) {
  const { hud, heading } = props;
  const w = hud.weapons[hud.weaponIndex];
  const hpPct = (hud.hp / hud.maxHp) * 100;
  const lowHp = hud.hp <= 30;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 font-hud">
      {/* damage flash */}
      {props.dmgFlash && (
        <div key={props.dmgFlash.id} className="damage-vignette absolute inset-0 animate-[warning-blink_.5s_ease-out]" />
      )}
      {props.healFlash > 0 && (
        <div key={props.healFlash} className="heal-vignette absolute inset-0" />
      )}
      {lowHp && <div className="damage-vignette absolute inset-0 opacity-60" style={{ animation: "warning-blink 1.2s infinite" }} />}

      {/* directional damage */}
      {props.dmgFlash && (
        <div className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `rotate(${props.dmgFlash.angle}rad)` }}>
          <div className="absolute -top-24 left-1/2 h-14 w-28 -translate-x-1/2 rounded-t-full border-t-8 border-red-500/90 blur-[1px]" />
        </div>
      )}

      {/* ---------- directional detection awareness arc ---------- */}
      {hud.detection && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
          style={{ transform: `rotate(${hud.detection.angle}rad)` }}
        >
          <div className="relative -top-28 flex flex-col items-center">
            <div
              className={`flex flex-col items-center justify-center rounded-t-full border-t-[5px] px-3 pt-1 transition-all duration-150 ${
                hud.detection.level > 0.85
                  ? "border-red-500 bg-red-500/30 shadow-[0_0_24px_rgba(239,68,68,0.9)] animate-pulse"
                  : hud.detection.level > 0.5
                  ? "border-amber-400 bg-amber-400/20 shadow-[0_0_14px_rgba(245,158,11,0.7)]"
                  : "border-white/80 bg-white/10 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
              }`}
              style={{
                width: `${52 + hud.detection.level * 36}px`,
                height: `${22 + hud.detection.level * 14}px`,
              }}
            >
              <span
                className={`font-terminal text-[9px] font-bold tracking-widest ${
                  hud.detection.level > 0.85 ? "text-red-300" : hud.detection.level > 0.5 ? "text-amber-200" : "text-white"
                }`}
              >
                {hud.detection.level > 0.85 ? "ALERT" : `${Math.round(hud.detection.level * 100)}%`}
              </span>
            </div>
            <div
              className={`h-0 w-0 border-x-[5px] border-x-transparent border-t-[6px] ${
                hud.detection.level > 0.85 ? "border-t-red-500" : hud.detection.level > 0.5 ? "border-t-amber-400" : "border-t-white/80"
              }`}
            />
          </div>
        </div>
      )}

      {/* ---------- telescopic sniper scope overlay ---------- */}
      {hud.isSniperScope && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
          {/* Scope circular lens housing with full-screen edge mask */}
          <div className="relative flex h-[min(86vmin,760px)] w-[min(86vmin,760px)] items-center justify-center rounded-full border-2 border-zinc-950 shadow-[0_0_0_9999px_#000,inset_0_0_80px_rgba(0,0,0,0.95),inset_0_0_24px_rgba(14,165,233,0.18)]">
            {/* Subtle anti-reflective glass glare and chromatic ring */}
            <div className="absolute inset-1 rounded-full border border-black/60" />
            <div className="absolute inset-3 rounded-full border border-sky-400/10 shadow-[inset_0_0_30px_rgba(0,0,0,0.85)]" />

            {/* Precision Vector Reticle SVG */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 500 500">
              {/* Horizontal Crosshairs with Center Gap */}
              <line x1="35" y1="250" x2="238" y2="250" stroke="#111" strokeWidth="1.6" />
              <line x1="262" y1="250" x2="465" y2="250" stroke="#111" strokeWidth="1.6" />
              <line x1="35" y1="250" x2="160" y2="250" stroke="#000" strokeWidth="3.2" />
              <line x1="340" y1="250" x2="465" y2="250" stroke="#000" strokeWidth="3.2" />

              {/* Vertical Crosshairs with Center Gap */}
              <line x1="250" y1="45" x2="250" y2="238" stroke="#111" strokeWidth="1.6" />
              <line x1="250" y1="262" x2="250" y2="455" stroke="#111" strokeWidth="1.6" />
              <line x1="250" y1="45" x2="250" y2="150" stroke="#000" strokeWidth="3.2" />
              <line x1="250" y1="350" x2="250" y2="455" stroke="#000" strokeWidth="3.2" />

              {/* Windage / Mil Tick Marks along Horizontal Axis */}
              {[-120, -90, -60, -30, 30, 60, 90, 120].map((dx) => (
                <line
                  key={dx}
                  x1={250 + dx}
                  y1={250 - (Math.abs(dx) % 60 === 0 ? 8 : 4)}
                  x2={250 + dx}
                  y2={250 + (Math.abs(dx) % 60 === 0 ? 8 : 4)}
                  stroke="#111"
                  strokeWidth="1.4"
                />
              ))}

              {/* Bullet Drop Chevrons */}
              {[
                { y: 250, main: true },
                { y: 285, d: "200m" },
                { y: 325, d: "400m" },
                { y: 375, d: "600m" },
              ].map(({ y, main, d }) => (
                <g key={y}>
                  <polyline
                    points={`${244},${y + 8} 250,${y} ${256},${y + 8}`}
                    fill="none"
                    stroke={main ? "#f59e0b" : "#111"}
                    strokeWidth={main ? "2" : "1.5"}
                    strokeLinejoin="miter"
                  />
                  {d && (
                    <text x="264" y={y + 5} fill="#f59e0b" opacity="0.85" fontSize="9" fontFamily="monospace">
                      {d}
                    </text>
                  )}
                </g>
              ))}

              {/* Central Illuminated Aiming Dot */}
              <circle cx="250" cy="250" r="1.5" fill="#f59e0b" filter="drop-shadow(0 0 4px #f59e0b)" />

              {/* 1.7m Human Height Stadia Rangefinder Curve (Bottom Left) */}
              <path
                d="M 100 370 Q 145 365 190 310"
                fill="none"
                stroke="#111"
                strokeWidth="1.4"
              />
              <line x1="100" y1="370" x2="190" y2="370" stroke="#111" strokeWidth="1.4" />
              <line x1="100" y1="365" x2="100" y2="375" stroke="#111" strokeWidth="1.4" />
              <line x1="130" y1="362" x2="130" y2="375" stroke="#111" strokeWidth="1.4" />
              <line x1="160" y1="355" x2="160" y2="375" stroke="#111" strokeWidth="1.4" />
              <line x1="190" y1="305" x2="190" y2="375" stroke="#111" strokeWidth="1.4" />
              <text x="100" y="386" fill="#f59e0b" opacity="0.75" fontSize="8" fontFamily="monospace">10</text>
              <text x="130" y="386" fill="#f59e0b" opacity="0.75" fontSize="8" fontFamily="monospace">6</text>
              <text x="160" y="386" fill="#f59e0b" opacity="0.75" fontSize="8" fontFamily="monospace">4</text>
              <text x="187" y="386" fill="#f59e0b" opacity="0.75" fontSize="8" fontFamily="monospace">2</text>
              <text x="95" y="354" fill="#f59e0b" opacity="0.9" fontSize="8" fontFamily="monospace">1.7m STADIA</text>
            </svg>

            {/* Scope Azimuth Heading */}
            <div className="absolute top-8 font-terminal text-xs tracking-widest text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]">
              AZIMUTH {heading.toFixed(0)}°
            </div>

            {/* Scope Information & Hold Breath Status */}
            <div className="absolute bottom-9 flex flex-col items-center gap-1 font-terminal text-[10px]">
              <span className="tracking-[0.25em] text-amber-300/90 drop-shadow-[0_0_3px_rgba(245,158,11,0.4)]">
                12.0× ZOOM · 7.62×54mmR · SVD "PREDATOR"
              </span>
              {hud.steadyBreath ? (
                <span className="font-bold tracking-widest text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]">
                  ● BREATH HELD · STEADY
                </span>
              ) : (
                <span className="tracking-wider text-white/50">
                  [SHIFT] HOLD BREATH TO STEADY
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- action prompts (takedown & sabotage) ---------- */}
      {hud.takedownTarget && (
        <div className="anim-toast-in pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 flex items-center gap-2 border border-red-500/90 bg-red-950/85 px-4 py-1.5 shadow-[0_0_25px_rgba(239,68,68,0.8)] backdrop-blur-sm">
          <Skull className="h-4 w-4 animate-pulse text-red-400" />
          <span className="font-display text-base tracking-widest text-white">[F] STEALTH TAKEDOWN</span>
          <span className="font-terminal text-[10px] text-amber-300">+250 XP</span>
        </div>
      )}
      {hud.nearAlarm && (
        <div className="anim-toast-in pointer-events-none absolute left-1/2 top-[64%] -translate-x-1/2 flex items-center gap-2 border border-amber-500/80 bg-black/85 px-4 py-1.5 shadow-[0_0_20px_rgba(245,158,11,0.6)] backdrop-blur-sm">
          <Radio className="h-4 w-4 animate-pulse text-amber-400" />
          <span className="font-display text-sm tracking-widest text-amber-300">[E] SABOTAGE ALARM</span>
          <span className="font-terminal text-[10px] text-white/60">PREVENT REINFORCEMENTS +150</span>
        </div>
      )}

      {/* ---------- crosshair / hitmarker ---------- */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {props.hitmarker ? (
          <div key={props.hitmarker.id} className="anim-hitmarker relative h-10 w-10">
            {[45, 135, 225, 315].map((a) => (
              <div
                key={a}
                className={`absolute left-1/2 top-1/2 h-[3px] w-4 ${props.hitmarker!.kill ? "bg-red-500" : props.hitmarker!.headshot ? "bg-amber-300" : "bg-white"}`}
                style={{ transform: `translate(-50%,-50%) rotate(${a}deg) translateX(11px)`, boxShadow: "0 0 4px #000" }}
              />
            ))}
          </div>
        ) : !hud.isSniperScope ? (
          <div className="relative h-10 w-10">
            <div className="crosshair-dot absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
            {(() => {
              const gap = 7 + (1 - hud.ads) * 9;
              const len = hud.ads > 0.6 ? 7 : 10;
              return (
                <>
                  <div className="absolute left-1/2 bg-white/90" style={{ width: 2, height: len, transform: "translateX(-50%)", top: 20 - gap - len, boxShadow: "0 0 3px #000" }} />
                  <div className="absolute left-1/2 bg-white/90" style={{ width: 2, height: len, transform: "translateX(-50%)", top: 20 + gap, boxShadow: "0 0 3px #000" }} />
                  <div className="absolute top-1/2 bg-white/90" style={{ height: 2, width: len, transform: "translateY(-50%)", left: 20 - gap - len, boxShadow: "0 0 3px #000" }} />
                  <div className="absolute top-1/2 bg-white/90" style={{ height: 2, width: len, transform: "translateY(-50%)", left: 20 + gap, boxShadow: "0 0 3px #000" }} />
                </>
              );
            })()}
          </div>
        ) : null}
        {/* reload / switch text */}
        {(hud.reloading || hud.switching) && (
          <div className="absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap font-terminal text-[11px] tracking-[0.25em] text-amber-300">
            {hud.reloading ? "⟳ RELOADING" : "⇄ SWITCHING"}
          </div>
        )}
        {props.ammoWarn > 0 && w.mag === 0 && !hud.reloading && (
          <div key={props.ammoWarn} className="anim-toast-in absolute left-1/2 top-12 -translate-x-1/2 whitespace-nowrap font-terminal text-xs tracking-[0.2em] text-red-400" style={{ animation: "warning-blink .8s 3" }}>
            PRESS R — RELOAD
          </div>
        )}
      </div>

      {/* ---------- compass ---------- */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2">
        <div className="clip-corner-sm relative h-9 w-72 overflow-hidden border border-white/10 bg-black/55 backdrop-blur-sm md:w-96">
          <div className="absolute inset-0">
            {Array.from({ length: 25 }, (_, i) => {
              const deg = Math.round(heading / 15) * 15 + (i - 12) * 15;
              const norm = ((deg % 360) + 360) % 360;
              const off = (deg - heading) * 2.6;
              const card = norm === 0 ? "N" : norm === 90 ? "E" : norm === 180 ? "S" : norm === 270 ? "W" : norm === 45 ? "NE" : norm === 135 ? "SE" : norm === 225 ? "SW" : norm === 315 ? "NW" : null;
              return (
                <div key={i} className="absolute top-0 flex h-full w-10 -translate-x-1/2 flex-col items-center justify-center" style={{ left: `calc(50% + ${off}px)` }}>
                  {card ? (
                    <span className={`font-display text-sm ${norm === 0 ? "text-red-400" : "text-white/90"}`}>{card}</span>
                  ) : (
                    <span className="text-[10px] text-white/40">|</span>
                  )}
                  <span className="font-terminal text-[9px] text-white/35">{norm}°</span>
                </div>
              );
            })}
          </div>
          <div className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,.9)]" />
        </div>
      </div>

      {/* ---------- boss bar ---------- */}
      {hud.bossHp >= 0 && (
        <div className="anim-slide-up absolute left-1/2 top-14 w-[min(560px,80vw)] -translate-x-1/2">
          <div className="mb-1 flex items-center justify-center gap-2">
            <Skull className="h-4 w-4 text-red-500" />
            <span className="font-display text-sm tracking-widest text-red-400" style={{ textShadow: "0 0 12px rgba(255,0,0,.6)" }}>COMMANDER KRUGER</span>
            <Skull className="h-4 w-4 text-red-500" />
          </div>
          <div className="clip-corner-sm h-3 border border-red-500/50 bg-black/70">
            <div className="h-full bg-gradient-to-r from-red-700 via-red-500 to-orange-400 transition-all duration-300" style={{ width: `${hud.bossHp * 100}%` }} />
          </div>
        </div>
      )}
      {props.bossWarn && (
        <div className="absolute inset-x-0 top-1/3 text-center">
          <div className="anim-toast-in font-display text-4xl text-red-500 md:text-6xl" style={{ textShadow: "0 0 30px rgba(255,0,0,.8), 0 4px 0 #000" }}>⚠ KRUGER HAS ARRIVED ⚠</div>
        </div>
      )}

      {/* ---------- objectives (top-left) ---------- */}
      <div className="absolute left-3 top-3 w-60 md:left-5 md:top-5 md:w-72">
        <div className="clip-corner border border-white/10 bg-black/55 p-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2 text-amber-400">
            <Target className="h-4 w-4" />
            <span className="font-terminal text-[10px] tracking-[0.3em]">CURRENT OBJECTIVE</span>
          </div>
          <div className="font-display text-base leading-tight text-white md:text-lg">{hud.objectiveText}</div>
          <div className="mt-0.5 flex items-center justify-between font-terminal text-[11px] text-white/60">
            <span>{hud.objectiveSub}</span>
            {hud.objectiveDist > 0 && <span className="flex items-center gap-1 text-amber-300"><MapPin className="h-3 w-3" />{hud.objectiveDist}m</span>}
          </div>
          <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
            {hud.outposts.map((o, i) => (
              <div key={o.name} className="flex items-center gap-2 text-sm">
                {o.captured ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : hud.objectiveIndex === i ? <Circle className="h-4 w-4 animate-pulse text-amber-400" /> : <Circle className="h-4 w-4 text-white/25" />}
                <span className={o.captured ? "text-green-300/80 line-through" : hud.objectiveIndex === i ? "font-semibold text-white" : "text-white/40"}>{o.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm">
              {hud.bossHp >= 0 ? <SkullIcon className="h-4 w-4 animate-pulse text-red-400" /> : <SkullIcon className="h-4 w-4 text-white/25" />}
              <span className={hud.objectiveIndex === -1 ? "font-display text-xs tracking-wider text-red-300" : "text-white/40"}>ELIMINATE KRUGER</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- minimap + score (top-right) ---------- */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2 md:right-5 md:top-5">
        <div className="relative">
          <canvas ref={props.minimapRef} width={168} height={168} className="h-32 w-32 rounded-full border-2 border-amber-500/50 bg-black/60 shadow-[0_0_20px_rgba(0,0,0,.6)] md:h-40 md:w-40" />
          <Radar className="absolute -bottom-1 -left-1 h-5 w-5 rounded-full bg-black/70 p-0.5 text-amber-400" />
        </div>
        <div className="clip-corner-sm flex items-center gap-3 border border-white/10 bg-black/55 px-3 py-1.5 backdrop-blur-sm">
          <span className="flex items-center gap-1 font-terminal text-xs text-white/80"><Skull className="h-3.5 w-3.5 text-red-400" />{hud.kills}</span>
          <span className="flex items-center gap-1 font-terminal text-xs text-amber-300"><Award className="h-3.5 w-3.5" />{hud.score}</span>
          <span className="flex items-center gap-1 font-terminal text-xs text-white/80"><Timer className="h-3.5 w-3.5" />{fmtTime(hud.time)}</span>
        </div>
        {/* killfeed */}
        <div className="flex flex-col items-end gap-1">
          {props.killfeed.map((k) => (
            <div key={k.id} className={`anim-slide-right clip-corner-sm border px-2 py-1 font-terminal text-[11px] ${k.headshot ? "border-amber-400/60 bg-amber-950/70 text-amber-200" : "border-white/15 bg-black/60 text-white/85"}`}>
              {k.text}
            </div>
          ))}
        </div>
      </div>

      {/* ---------- toasts ---------- */}
      <div className="absolute left-1/2 top-[22%] flex -translate-x-1/2 flex-col items-center gap-2">
        {props.toasts.map((t) => (
          <div key={t.id} className="anim-toast-in clip-corner border bg-black/70 px-6 py-2 text-center backdrop-blur-md"
            style={{ borderColor: t.color === "green" ? "rgba(34,197,94,.6)" : t.color === "red" ? "rgba(239,68,68,.6)" : t.color === "gold" ? "rgba(250,204,21,.7)" : "rgba(245,158,11,.6)" }}>
            <div className={`font-display text-lg tracking-wide md:text-xl ${t.color === "green" ? "text-green-300" : t.color === "red" ? "text-red-400" : t.color === "gold" ? "text-yellow-300" : "text-amber-300"}`}>{t.title}</div>
            {t.sub && <div className="font-terminal text-[11px] text-white/70">{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* ---------- pickups feed ---------- */}
      <div className="absolute bottom-40 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
        {props.pickups.map((p) => (
          <div key={p.id} className="anim-slide-up clip-corner-sm border border-cyan-400/40 bg-black/60 px-3 py-1 font-terminal text-[11px] tracking-widest text-cyan-200">
            ✚ {p.text}
          </div>
        ))}
      </div>

      {/* ---------- health & stealth status (bottom-left) ---------- */}
      <div className="absolute bottom-4 left-3 w-64 md:bottom-6 md:left-6 md:w-80">
        {/* stance & foliage concealment badges */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className={`flex items-center gap-1 clip-corner-sm border px-2 py-0.5 font-terminal text-[10px] tracking-wider transition-colors ${hud.crouched ? "border-cyan-400/80 bg-cyan-950/70 text-cyan-200" : "border-white/10 bg-black/40 text-white/40"}`}>
            <kbd className="rounded bg-white/10 px-1 text-[8px]">C</kbd> {hud.crouched ? "CROUCHED (SILENT)" : "STANDING"}
          </span>
          {hud.concealed && (
            <span className="anim-slide-right flex items-center gap-1 clip-corner-sm border border-emerald-400/80 bg-emerald-950/80 px-2 py-0.5 font-terminal text-[10px] tracking-wider text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)]">
              🌿 CONCEALED IN BUSH (-65% VIS)
            </span>
          )}
        </div>

        <div className="clip-corner border border-white/10 bg-black/55 p-3 backdrop-blur-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-terminal text-[10px] tracking-[0.3em] text-white/60"><Heart className="h-3.5 w-3.5 text-red-400" />HEALTH</span>
            <span className={`font-display text-xl leading-none ${lowHp ? "animate-pulse text-red-400" : "text-white"}`}>{hud.hp}</span>
          </div>
          <div className="clip-corner-sm h-2.5 bg-white/10">
            <div className={`h-full transition-all duration-200 ${lowHp ? "bg-gradient-to-r from-red-700 to-red-500" : hpPct > 60 ? "bg-gradient-to-r from-green-600 to-lime-400" : "bg-gradient-to-r from-amber-600 to-amber-400"}`} style={{ width: `${hpPct}%` }} />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <Zap className="h-3 w-3 text-cyan-300" />
            <div className="h-1 flex-1 bg-white/10">
              <div className="h-full bg-cyan-300/80 transition-all duration-200" style={{ width: `${hud.stamina}%` }} />
            </div>
            <span className="font-terminal text-[9px] text-white/40">SPRINT</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
            <span className={`flex items-center gap-1 border px-1.5 py-0.5 font-terminal text-[10px] ${hud.canHeal ? "border-green-500/60 bg-green-950/50 text-green-200" : "border-white/10 text-white/35"}`}>
              <Syringe className="h-3 w-3 text-green-400" />×{hud.medkits}
              <kbd className="rounded bg-white/10 px-0.5 text-[8px]">H</kbd>
            </span>
            <span className="flex items-center gap-1 border border-white/10 px-1.5 py-0.5 font-terminal text-[10px] text-white/70">
              <Bomb className="h-3 w-3 text-amber-400" />×{hud.grenades}
              <kbd className="rounded bg-white/10 px-0.5 text-[8px]">G</kbd>
            </span>
            <span className="flex items-center gap-1 border border-orange-500/40 bg-orange-950/30 px-1.5 py-0.5 font-terminal text-[10px] text-orange-200">
              <Flame className="h-3 w-3 text-orange-400" />×{hud.molotovs}
              <kbd className="rounded bg-white/10 px-0.5 text-[8px]">X</kbd>
            </span>
            <span className="flex items-center gap-1 border border-cyan-500/40 bg-cyan-950/30 px-1.5 py-0.5 font-terminal text-[10px] text-cyan-200">
              <Wind className="h-3 w-3 text-cyan-400" />×{hud.rocks}
              <kbd className="rounded bg-white/10 px-0.5 text-[8px]">T</kbd>
            </span>
            {lowHp && <span className="ml-auto font-terminal text-[9px] tracking-widest text-red-400" style={{ animation: "warning-blink 1s infinite" }}>⚠ CRITICAL</span>}
          </div>
        </div>
      </div>

      {/* ---------- weapon (bottom-right) ---------- */}
      <div className="absolute bottom-4 right-3 w-72 md:bottom-6 md:right-6 md:w-96">
        <div className="clip-corner border border-white/10 bg-black/55 p-3 backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-terminal text-[10px] tracking-[0.25em] text-white/60"><Crosshair className="h-3.5 w-3.5 text-amber-400" />{w.name}</span>
            {hud.ads > 0.5 && <span className="font-terminal text-[9px] tracking-widest text-amber-300">◉ ADS</span>}
          </div>
          <div className="flex items-end justify-end gap-2">
            <span className={`font-display text-5xl leading-none ${hud.lowAmmo ? "text-red-400" : "text-white"}`}>{w.mag}</span>
            <span className="pb-1 font-terminal text-lg text-white/50">/ {w.reserve}</span>
          </div>
          {hud.reloading && (
            <div className="mt-1 h-1 animate-pulse bg-amber-400/70" />
          )}
          <div className="mt-2 grid grid-cols-7 gap-1 border-t border-white/10 pt-2">
            {hud.weapons.map((wp, i) => (
              <div key={wp.short} className={`clip-corner-sm border px-1 py-1 text-center transition-colors ${i === hud.weaponIndex ? "border-amber-400/80 bg-amber-950/60 shadow-[0_0_8px_rgba(245,158,11,0.4)]" : "border-white/10 bg-white/5"}`}>
                <div className={`font-terminal text-[8px] font-bold ${i === hud.weaponIndex ? "text-amber-300" : "text-white/40"}`}>[{i + 1}] {wp.short}</div>
                <div className={`font-terminal text-[9px] ${i === hud.weaponIndex ? "text-white font-semibold" : "text-white/50"}`}>{wp.mag}/{wp.reserve}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* capture overlay */}
      {props.showCapture && (
        <button onClick={props.onCapture} className="pointer-events-auto absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
          <Mouse className="h-10 w-10 animate-bounce text-amber-400" />
          <span className="font-display text-2xl tracking-wider">CLICK TO CAPTURE MOUSE</span>
          <span className="font-terminal text-xs text-white/50">The game is running — click to re-engage</span>
        </button>
      )}
    </div>
  );
}

// ================================================================= main menu
function MainMenu(props: {
  best: { score: number; time: number; kills: number };
  subMenu: null | "howto" | "settings";
  setSubMenu: (s: null | "howto" | "settings") => void;
  settings: Settings;
  updateSettings: (s: Settings) => void;
  onDeploy: () => void;
  isTouch: boolean;
}) {
  return (
    <div className="absolute inset-0 z-30 flex font-hud">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="relative flex w-full max-w-2xl flex-col justify-center gap-6 p-8 md:p-14">
        <div className="anim-slide-up flex items-center gap-2 font-terminal text-[11px] tracking-[0.4em] text-amber-400/90">
          <Flame className="h-4 w-4" /> ROOK ISLANDS // PIRATE UPRISING
        </div>
        <h1 className="anim-slide-up font-display leading-[0.95]" style={{ animationDelay: ".05s" }}>
          <span className="block text-5xl text-white md:text-7xl" style={{ textShadow: "0 4px 0 rgba(0,0,0,.6), 0 0 40px rgba(245,158,11,.25)" }}>PARADISE</span>
          <span className="block text-5xl text-amber-400 md:text-7xl" style={{ textShadow: "0 4px 0 rgba(0,0,0,.7), 0 0 50px rgba(245,158,11,.45)" }}>FALLEN</span>
        </h1>
        <p className="anim-slide-up max-w-md text-base leading-relaxed text-white/70 md:text-lg" style={{ animationDelay: ".1s" }}>
          The islands were paradise — until <span className="font-semibold text-red-300">Commander Kruger</span> and his
          pirate army turned them into a fortress. Liberate <span className="text-white">3 outposts</span>,
          survive the jungle, and put the butcher down.
        </p>
        <div className="anim-slide-up flex flex-col gap-2.5 sm:flex-row" style={{ animationDelay: ".15s" }}>
          <button onClick={props.onDeploy} className="clip-corner group pointer-events-auto flex items-center justify-center gap-2 bg-amber-500 px-8 py-3.5 font-display text-lg tracking-wider text-black transition-all hover:bg-amber-400 hover:shadow-[0_0_30px_rgba(245,158,11,.5)]">
            <Play className="h-5 w-5 fill-black transition-transform group-hover:scale-125" /> DEPLOY
          </button>
          <button onClick={() => props.setSubMenu("howto")} className="clip-corner pointer-events-auto flex items-center justify-center gap-2 border border-white/25 bg-black/40 px-6 py-3.5 font-display text-sm tracking-wider text-white/90 backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/10">
            <BookOpen className="h-4 w-4" /> FIELD MANUAL
          </button>
          <button onClick={() => props.setSubMenu("settings")} className="clip-corner pointer-events-auto flex items-center justify-center gap-2 border border-white/25 bg-black/40 px-6 py-3.5 font-display text-sm tracking-wider text-white/90 backdrop-blur-sm transition-all hover:border-white/60 hover:bg-white/10">
            <SettingsIcon className="h-4 w-4" /> SETTINGS
          </button>
        </div>
        {(props.best.score > 0) && (
          <div className="anim-slide-up flex items-center gap-4 font-terminal text-xs text-white/50" style={{ animationDelay: ".2s" }}>
            <Trophy className="h-4 w-4 text-amber-400" />
            <span>BEST SCORE <span className="text-amber-300">{props.best.score}</span></span>
            <span>KILLS <span className="text-white/80">{props.best.kills}</span></span>
            {props.best.time > 0 && <span>CLEAR <span className="text-white/80">{fmtTime(props.best.time)}</span></span>}
          </div>
        )}
        <div className="anim-slide-up flex items-center gap-2 font-terminal text-[11px] text-white/40" style={{ animationDelay: ".25s" }}>
          {props.isTouch ? <><Wind className="h-3.5 w-3.5" /> Touch controls enabled — left stick moves, drag right side to aim</> : <><Keyboard className="h-3.5 w-3.5" /> WASD move · Mouse aim · LMB fire · RMB aim-down-sights · R reload</>}
        </div>
      </div>
      {/* right side intel card */}
      <div className="anim-slide-right relative m-auto mr-8 hidden w-72 flex-col gap-3 lg:flex" style={{ animationDelay: ".3s" }}>
        <div className="clip-corner border border-red-500/30 bg-black/60 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center gap-2 font-terminal text-[10px] tracking-[0.3em] text-red-400"><AlertTriangle className="h-3.5 w-3.5" />MOST WANTED</div>
          <div className="font-display text-xl text-white">COMMANDER KRUGER</div>
          <div className="mt-1 font-terminal text-[11px] leading-relaxed text-white/60">
            Ex-military. Controls the island's guns, drugs and docks. Travels with a minigun and zero mercy.
          </div>
          <div className="mt-2 flex items-center gap-1 font-terminal text-[10px] text-red-300/80"><Skull className="h-3 w-3" />THREAT LEVEL: EXTREME</div>
        </div>
        <div className="clip-corner border border-white/10 bg-black/60 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center gap-2 font-terminal text-[10px] tracking-[0.3em] text-amber-400"><Flag className="h-3.5 w-3.5" />CAMPAIGN</div>
          {["SHARK COVE — coastal guns", "JUNGLE CAMP — deep cover", "EAGLE'S NEST — mountain post", "THE PIT — Kruger's last stand"].map((t, i) => (
            <div key={t} className="flex items-center gap-2 py-0.5 font-terminal text-[11px] text-white/60">
              <span className="text-amber-500">0{i + 1}</span> {t}
            </div>
          ))}
        </div>
      </div>
      {props.subMenu && (
        <Modal onClose={() => props.setSubMenu(null)}>
          {props.subMenu === "settings"
            ? <SettingsPanel settings={props.settings} updateSettings={props.updateSettings} />
            : <HowToPanel />}
        </Modal>
      )}
    </div>
  );
}

// ================================================================= pause
function PauseMenu(props: {
  hud: HUDState | null;
  subMenu: null | "howto" | "settings";
  setSubMenu: (s: null | "howto" | "settings") => void;
  settings: Settings;
  updateSettings: (s: Settings) => void;
  onResume: () => void; onRestart: () => void; onQuit: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 font-hud backdrop-blur-md">
      <div className="anim-toast-in clip-corner w-[min(440px,92vw)] border border-white/15 bg-zinc-950/90 p-6 md:p-8">
        <div className="mb-1 flex items-center gap-2 font-terminal text-[10px] tracking-[0.4em] text-amber-400"><PauseIcon className="h-3.5 w-3.5" />OPERATION PAUSED</div>
        <h2 className="font-display text-3xl text-white md:text-4xl">TAKE A BREATHER</h2>
        {props.hud && (
          <div className="mt-3 flex items-center gap-4 border-y border-white/10 py-2 font-terminal text-xs text-white/60">
            <span className="flex items-center gap-1"><Skull className="h-3.5 w-3.5 text-red-400" />{props.hud.kills} kills</span>
            <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5 text-amber-400" />{props.hud.score} pts</span>
            <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{fmtTime(props.hud.time)}</span>
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button onClick={props.onResume} className="clip-corner flex items-center justify-between bg-amber-500 px-5 py-3 font-display text-base tracking-wider text-black transition-all hover:bg-amber-400">
            <span className="flex items-center gap-2"><Play className="h-4 w-4 fill-black" />RESUME MISSION</span><ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={props.onRestart} className="clip-corner flex items-center justify-between border border-white/20 bg-white/5 px-5 py-3 font-display text-sm tracking-wider text-white/90 transition-all hover:bg-white/10">
            <span className="flex items-center gap-2"><RotateCcw className="h-4 w-4" />RESTART</span><ChevronRight className="h-4 w-4 opacity-50" />
          </button>
          <button onClick={() => props.setSubMenu("settings")} className="clip-corner flex items-center justify-between border border-white/20 bg-white/5 px-5 py-3 font-display text-sm tracking-wider text-white/90 transition-all hover:bg-white/10">
            <span className="flex items-center gap-2"><SettingsIcon className="h-4 w-4" />SETTINGS</span><ChevronRight className="h-4 w-4 opacity-50" />
          </button>
          <button onClick={props.onQuit} className="clip-corner flex items-center justify-between border border-white/20 bg-white/5 px-5 py-3 font-display text-sm tracking-wider text-white/90 transition-all hover:bg-white/10">
            <span className="flex items-center gap-2"><Home className="h-4 w-4" />ABANDON TO MENU</span><ChevronRight className="h-4 w-4 opacity-50" />
          </button>
        </div>
      </div>
      {props.subMenu === "settings" && (
        <Modal onClose={() => props.setSubMenu(null)}>
          <SettingsPanel settings={props.settings} updateSettings={props.updateSettings} />
        </Modal>
      )}
    </div>
  );
}

// ================================================================= end screens
function EndScreen(props: { victory: boolean; stats: Stats; newBest: boolean; onRetry: () => void; onQuit: () => void }) {
  const { stats } = props;
  return (
    <div className={`absolute inset-0 z-30 flex items-center justify-center font-hud backdrop-blur-md ${props.victory ? "bg-green-950/60" : "bg-red-950/60"}`}>
      <div className="anim-toast-in clip-corner w-[min(520px,92vw)] border bg-zinc-950/90 p-6 text-center md:p-10" style={{ borderColor: props.victory ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)" }}>
        {props.victory ? (
          <>
            <Trophy className="mx-auto h-12 w-12 text-amber-400" />
            <div className="mt-2 font-terminal text-[11px] tracking-[0.4em] text-green-400">MISSION COMPLETE</div>
            <h2 className="mt-1 font-display text-4xl text-white md:text-5xl">ISLANDS<br />LIBERATED</h2>
            <p className="mt-2 text-white/60">Kruger is dead. The Rook Islands breathe free again.</p>
          </>
        ) : (
          <>
            <Skull className="mx-auto h-12 w-12 text-red-500" />
            <div className="mt-2 font-terminal text-[11px] tracking-[0.4em] text-red-400">KIA — OPERATION FAILED</div>
            <h2 className="mt-1 font-display text-4xl text-white md:text-5xl">YOU DIED IN<br />PARADISE</h2>
            <p className="mt-2 text-white/60">The jungle takes another one. The pirates celebrate tonight.</p>
          </>
        )}
        {props.newBest && (
          <div className="anim-flicker mx-auto mt-3 inline-block border border-amber-400/60 bg-amber-950/50 px-4 py-1 font-display text-sm tracking-widest text-amber-300">★ NEW BEST SCORE ★</div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { icon: <Skull className="h-4 w-4 text-red-400" />, v: stats.kills, l: "KILLS" },
            { icon: <Crosshair className="h-4 w-4 text-amber-400" />, v: stats.headshots, l: "HEADSHOTS" },
            { icon: <Target className="h-4 w-4 text-cyan-300" />, v: `${Math.round(stats.accuracy * 100)}%`, l: "ACCURACY" },
            { icon: <Timer className="h-4 w-4 text-white/70" />, v: fmtTime(stats.time), l: "TIME" },
          ].map((s) => (
            <div key={s.l} className="clip-corner-sm border border-white/10 bg-white/5 p-3">
              <div className="mx-auto mb-1 w-fit">{s.icon}</div>
              <div className="font-display text-xl text-white">{s.v}</div>
              <div className="font-terminal text-[9px] tracking-[0.25em] text-white/45">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 border border-amber-500/30 bg-amber-950/30 p-2 font-terminal text-sm text-amber-200">
          FINAL SCORE: <span className="font-display text-xl">{stats.score}</span>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button onClick={props.onRetry} className="clip-corner flex flex-1 items-center justify-center gap-2 bg-amber-500 px-6 py-3 font-display text-base tracking-wider text-black transition-all hover:bg-amber-400">
            <RotateCcw className="h-4 w-4" />{props.victory ? "PLAY AGAIN" : "RETRY MISSION"}
          </button>
          <button onClick={props.onQuit} className="clip-corner flex flex-1 items-center justify-center gap-2 border border-white/25 bg-white/5 px-6 py-3 font-display text-sm tracking-wider text-white/90 transition-all hover:bg-white/10">
            <Home className="h-4 w-4" /> MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================= modal / settings / howto
function Modal(props: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={props.onClose}>
      <div className="anim-toast-in clip-corner max-h-[85vh] w-[min(560px,94vw)] overflow-y-auto border border-white/15 bg-zinc-950 p-6" onClick={(e) => e.stopPropagation()}>
        {props.children}
      </div>
    </div>
  );
}

function SettingsPanel(props: { settings: Settings; updateSettings: (s: Settings) => void }) {
  const s = props.settings;
  const row = (label: string, val: string, ctrl: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 border-b border-white/8 py-3">
      <div>
        <div className="font-semibold tracking-wide text-white/90">{label}</div>
        <div className="font-terminal text-[11px] text-amber-300/80">{val}</div>
      </div>
      <div className="w-44 shrink-0">{ctrl}</div>
    </div>
  );
  const slider = (v: number, min: number, max: number, step: number, on: (n: number) => void) => (
    <input
      type="range" min={min} max={max} step={step} value={v}
      onChange={(e) => on(parseFloat(e.target.value))}
      className="hud-range w-full"
      style={{ ["--fill" as string]: `${((v - min) / (max - min)) * 100}%` }}
    />
  );
  return (
    <div className="font-hud">
      <h3 className="font-display text-2xl text-white">SETTINGS</h3>
      <div className="mt-2">
        {row("MOUSE SENSITIVITY", `${s.sensitivity.toFixed(2)}×`, slider(s.sensitivity, 0.2, 2.5, 0.05, (n) => props.updateSettings({ ...s, sensitivity: n })))}
        {row("MASTER VOLUME", `${Math.round(s.volume * 100)}%`, slider(s.volume, 0, 1, 0.05, (n) => props.updateSettings({ ...s, volume: n })))}
        {row("FIELD OF VIEW", `${s.fov}°`, slider(s.fov, 65, 95, 1, (n) => props.updateSettings({ ...s, fov: n })))}
        <div className="flex items-center justify-between gap-4 border-b border-white/8 py-3">
          <div className="font-semibold tracking-wide text-white/90">INVERT Y AXIS</div>
          <button onClick={() => props.updateSettings({ ...s, invertY: !s.invertY })} className={`clip-corner-sm px-4 py-1.5 font-terminal text-xs tracking-widest ${s.invertY ? "bg-amber-500 text-black" : "bg-white/10 text-white/60"}`}>
            {s.invertY ? "INVERTED" : "NORMAL"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-4 py-3">
          <div>
            <div className="font-semibold tracking-wide text-white/90">GRAPHICS QUALITY</div>
            <div className="font-terminal text-[11px] text-white/40">Applies fully on restart</div>
          </div>
          <div className="flex gap-1.5">
            {(["low", "high"] as const).map((q) => (
              <button key={q} onClick={() => props.updateSettings({ ...s, quality: q })} className={`clip-corner-sm px-4 py-1.5 font-terminal text-xs tracking-widest ${s.quality === q ? "bg-amber-500 text-black" : "bg-white/10 text-white/60"}`}>
                {q.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 font-terminal text-[11px] text-white/40">
        {s.volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} Press M in-game to mute · All audio is procedurally synthesized
      </div>
    </div>
  );
}

function HowToPanel() {
  const controls: [string, string][] = [
    ["W A S D", "Move"], ["MOUSE", "Look / Aim"], ["LMB", "Fire / Shoot arrow"], ["RMB", "Aim down sights / Sniper scope"],
    ["1 - 7 · Wheel", "Switch weapon (AK, SPAS, SVD, Bow, Deagle, SCAR, 10MM)"], ["R", "Reload / Retrieve arrows"],
    ["C / CTRL", "Toggle Crouch (Silent movement)"], ["SHIFT", "Sprint / Steady sniper breath"],
    ["F / V", "Machete Takedown (Behind unaware guards)"], ["T", "Throw Rock (Distract guards)"],
    ["X", "Molotov Cocktail (Fire patch)"], ["G", "Frag Grenade"],
    ["E", "Sabotage Alarm Box"], ["H / Q", "Field Syringe (Heal)"],
    ["SPACE", "Jump"], ["M", "Mute audio"], ["ESC", "Pause"],
  ];
  return (
    <div className="font-hud">
      <h3 className="font-display text-2xl text-white">FIELD MANUAL</h3>
      <div className="mt-1 font-terminal text-[11px] tracking-[0.25em] text-amber-400">FAR CRY SIGNATURE ARSENAL & STEALTH PROTOCOLS</div>
      <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {controls.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-white/8 py-1.5">
            <span className="font-terminal text-[11px] text-white/60">{v}</span>
            <kbd className="clip-corner-sm border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 font-terminal text-[10px] text-amber-200">{k}</kbd>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <div className="clip-corner-sm border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-white/80">
          <span className="font-display text-xs tracking-wider text-emerald-300">🌿 STEALTH & CONCEALMENT.</span> Crouch with <kbd className="rounded bg-white/10 px-1 text-[10px]">C</kbd> to muffle footstep sounds. Hide in jungle bushes to reduce enemy detection by 65%. Watch the awareness arc!
        </div>
        <div className="clip-corner-sm border border-red-500/30 bg-red-950/30 p-3 text-sm text-white/80">
          <span className="font-display text-xs tracking-wider text-red-300">☠ MACHETE TAKEDOWNS.</span> Flank behind unaware pirates and press <kbd className="rounded bg-white/10 px-1 text-[10px]">F</kbd> for an instant silent kill (+250 XP bonus).
        </div>
        <div className="clip-corner-sm border border-cyan-500/30 bg-cyan-950/30 p-3 text-sm text-white/80">
          <span className="font-display text-xs tracking-wider text-cyan-300">🪨 ROCK DISTRACTIONS.</span> Press <kbd className="rounded bg-white/10 px-1 text-[10px]">T</kbd> to throw rocks. Nearby guards will break patrol to investigate the sound.
        </div>
        <div className="clip-corner-sm border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-white/80">
          <span className="font-display text-xs tracking-wider text-amber-300">🚨 OUTPOST ALARM TOWERS.</span> Alerted guards sprint to sound sirens and summon heavy reinforcements. Press <kbd className="rounded bg-white/10 px-1 text-[10px]">E</kbd> near the panel or snipe the box from afar to disable it.
        </div>
        <div className="clip-corner-sm border border-orange-500/30 bg-orange-950/30 p-3 text-sm text-white/80">
          <span className="font-display text-xs tracking-wider text-orange-300">🔥 MOLOTOV COCKTAILS & BARRELS.</span> Press <kbd className="rounded bg-white/10 px-1 text-[10px]">X</kbd> to drop fire patches that burn pirates over time. Red barrels trigger massive chain explosions.
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 font-terminal text-[10px] tracking-[0.3em] text-white/50">SIGNATURE ARSENAL</div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-7">
          {[
            { n: "AK-47", d: "Assault Rifle", c: "text-amber-300" },
            { n: "SPAS-12", d: "8-Pellet Shotgun", c: "text-red-300" },
            { n: "SVD", d: "12× Sniper Scope", c: "text-cyan-300" },
            { n: "BOW", d: "Silent & Retrievable", c: "text-lime-300" },
            { n: "DEAGLE", d: "Heavy Hand Cannon", c: "text-yellow-300" },
            { n: "SCAR-H", d: "Tactical Combat Rifle", c: "text-orange-300" },
            { n: "10MM", d: "Blowback Pistol", c: "text-blue-300" },
          ].map((e) => (
            <div key={e.n} className="clip-corner-sm border border-white/10 bg-white/5 p-2">
              <div className={`font-display text-xs ${e.c}`}>{e.n}</div>
              <div className="font-terminal text-[9px] text-white/50">{e.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ================================================================= touch controls
function TouchControls(props: { engineRef: React.RefObject<FPEngine | null> }) {
  const stickRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const stickTouch = useRef<number | null>(null);
  const lookTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const [adsOn, setAdsOn] = useState(false);

  const eng = () => props.engineRef.current;

  const onStickStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    stickTouch.current = t.identifier;
  };
  const onStickMove = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickTouch.current && stickRef.current) {
        const r = stickRef.current.getBoundingClientRect();
        let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        setStick({ x: dx, y: dy });
        eng()?.setTouchMove(dx, dy);
      }
    }
  };
  const onStickEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickTouch.current) {
        stickTouch.current = null;
        setStick({ x: 0, y: 0 });
        eng()?.setTouchMove(0, 0);
      }
    }
  };

  const onLookStart = (e: React.TouchEvent) => {
    if (lookTouch.current) return;
    const t = e.changedTouches[0];
    lookTouch.current = { id: t.identifier, x: t.clientX, y: t.clientY };
  };
  const onLookMove = (e: React.TouchEvent) => {
    if (!lookTouch.current) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === lookTouch.current.id) {
        eng()?.addTouchLook(t.clientX - lookTouch.current.x, t.clientY - lookTouch.current.y);
        lookTouch.current = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }
  };
  const onLookEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (lookTouch.current?.id === t.identifier) lookTouch.current = null;
    }
  };

  const btn = "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/50 font-terminal text-[9px] text-white/90 backdrop-blur-sm active:bg-amber-500/60";

  return (
    <div className="absolute inset-0 z-20">
      {/* look layer */}
      <div
        className="absolute inset-y-0 right-0 w-[55%]"
        onTouchStart={onLookStart} onTouchMove={onLookMove} onTouchEnd={onLookEnd} onTouchCancel={onLookEnd}
      />
      {/* joystick */}
      <div
        ref={stickRef}
        className="pointer-events-auto absolute bottom-24 left-4 h-32 w-32 rounded-full border border-white/25 bg-black/40 backdrop-blur-sm"
        onTouchStart={onStickStart} onTouchMove={onStickMove} onTouchEnd={onStickEnd} onTouchCancel={onStickEnd}
      >
        <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-amber-500/70" style={{ transform: `translate(calc(-50% + ${stick.x * 38}px), calc(-50% + ${stick.y * 38}px))` }} />
      </div>
      {/* buttons */}
      <div className="absolute bottom-24 right-3 flex flex-col items-end gap-1.5">
        {/* weapon selector */}
        <div className="flex gap-1">
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchWeapon(0); }}>AK</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchWeapon(1); }}>SPAS</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchWeapon(2); }}>SVD</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchWeapon(3); }}>BOW</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchWeapon(4); }}>DGL</button>
        </div>
        {/* stealth & utility */}
        <div className="flex gap-1.5">
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchCrouch(); }}>CRCH</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchRock(); }}>ROCK</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchMolotov(); }}>MOL</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.tryInteract(); }}>ACT</button>
        </div>
        {/* movement & shooting */}
        <div className="flex gap-1.5">
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchReload(); }}>RLD</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchJump(); }}>JMP</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); const v = !adsOn; setAdsOn(v); eng()?.setTouchAds(v); }}>{adsOn ? "ADS✓" : "ADS"}</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchHeal(); }}>HEAL</button>
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchMelee(); }}>KNIFE</button>
          <button className={btn} onTouchStart={(e) => { e.preventDefault(); eng()?.touchGrenade(); }}>GRN</button>
          <button
            className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-400/70 bg-red-600/40 font-display text-xs backdrop-blur-sm active:bg-red-500/70"
            onTouchStart={(e) => { e.preventDefault(); eng()?.setTouchFire(true); }}
            onTouchEnd={() => eng()?.setTouchFire(false)}
            onTouchCancel={() => eng()?.setTouchFire(false)}
          >
            FIRE
          </button>
        </div>
      </div>
    </div>
  );
}

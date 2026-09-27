# PARADISE FALLEN — Tropical FPS

An intense tropical open-island first-person shooter inspired by Far Cry. Liberate enemy outposts, utilize stealth mechanics, disable alarm systems, and survive hostile militia patrols.

> 🎮 **Live Demo:** `https://<your-username>.github.io/<your-repo-name>/`

---

## 🌴 Features

- **Open Island Sandbox:** Procedural tropical terrain with jungles, outposts, beaches, and water.
- **Stealth & Distraction:** Throw rocks to distract guards, sneak through tall bushes, and execute silent machete takedowns.
- **Outpost Warfare:** Sabotage alarm boxes to prevent militia reinforcements, detonate explosive barrels, and liberate bases.
- **Signature Arsenal:** 7 lethal weapons including AK-47, SCAR, Combat Pistol, SVD Sniper Rifle, SPAS Shotgun, Recurve Bow, and Machete.
- **Procedural Audio:** Fully synthesized real-time Web Audio engine with spatial environmental sounds, gunshot transients, and alerts without external audio file overhead.
- **Responsive Controls:** Complete support for Mouse/Keyboard as well as on-screen Touch Controls for mobile devices.

---

## 🕹️ Controls

| Action | Key / Input |
|---|---|
| **Move** | `W` `A` `S` `D` |
| **Look / Aim** | `Mouse` |
| **Fire / Release Arrow** | `Left Mouse Button (LMB)` |
| **Aim Down Sights (ADS)** | `Right Mouse Button (RMB)` |
| **Switch Weapons** | `1` - `7` or `Mouse Wheel` |
| **Reload / Collect Arrows** | `R` |
| **Sprint / Steady Sniper Breath** | `Shift` |
| **Crouch (Silent Stealth)** | `C` or `Ctrl` |
| **Machete Takedown** | `F` or `V` (when behind unaware enemies) |
| **Throw Rock (Distract)** | `T` |
| **Frag Grenade** | `G` |
| **Molotov Cocktail** | `X` |
| **Sabotage Alarm Box** | `E` |
| **Heal Syringe** | `H` or `Q` |
| **Jump** | `Space` |
| **Pause Menu** | `Esc` |

---

## 🛠️ Local Development

### Requirements
- [Node.js](https://nodejs.org/) (version 18+ recommended)
- `npm`

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🚀 GitHub Pages Deployment

This repository includes a pre-configured GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys the game whenever you push to `main` or `master`.

### Setup Steps:
1. Push this repository to GitHub.
2. Go to your repository on GitHub and open **Settings** > **Pages** (under Code and automation).
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. The deployment workflow will run automatically. In about 1–2 minutes, your game will be live at:
   `https://<your-username>.github.io/<your-repo-name>/`

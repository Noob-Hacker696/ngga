# HELLBREAK

HELLBREAK is a small retro first-person shooter built for a first-year Diploma C
Programming mini project. The gameplay state and rules are written in C and
compiled to WebAssembly with Emscripten. HTML and CSS provide the page and HUD;
JavaScript draws the raycast view and connects browser input to the C functions.

## Features

- The game uses a centered framed layout in a normal browser window and expands
  edge-to-edge when browser fullscreen is entered with F11.
- WASD movement with wall collision and wall sliding.
- Pointer-lock mouse look, plus click or Space to shoot.
- Three progressive levels with distinct arena color treatments, five enemies
  per level, health/ammo rewards between waves, and a level kill counter.
- The levels are named **Chindi**, **Monsters Ain't tuff**, and **Nightmare
  Horde**. The requested third name contains an offensive slur, so this project
  uses a safe replacement. Each level changes its enemy lineup and arena colors.
- Four demon roles: a balanced imp, a hard-hitting armored heavy, a fast runner,
  and a ranged caster that launches visible projectiles. Each has a distinct
  procedural skin texture, palette, and silhouette.
- Enemies must close to melee range before dealing damage; successful attacks
  trigger a short forward lunge and claw-swipe animation.
- Hand-drawn first-person shotgun with a brief, simple reload dip and recovery,
  muzzle flash, hit-confirm marker, and animated enemy deaths with particles.
  Firing is paused during the reload animation.
- Enemies take progressively more shots to defeat on later levels; hits flash
  the target and reveal its remaining health. Empty magazines show a reload prompt.
- Every defeated monster drops a visible medkit at its death location. Collect
  it while below full health to restore up to 25 health; uncollected medkits
  remain available for later.
- Screen shake and red damage feedback play when enemies hit the player.
- Browser audio uses the supplied `docs\assets\gun-shot-350315.mp3` for shotgun
  fire and `docs\assets\universfield-gun-reload-123781.mp3` for reloads, with
  synthesized fallbacks if either file cannot load. The supplied
  `docs\assets\footsteps-dirt-gravel-6823.mp3` loops while the player moves, with
  a synthesized fallback if it cannot load. The supplied
  `docs\assets\romanceeeeeeeeeeeeee.mp3` plays when all levels are cleared, with
  an original synthesized victory tune as a fallback. The supplied
  `docs\assets\kill.mp3` plays when the player is eliminated, with a synthesized
  fail cue as a fallback. Procedural sound effects provide ambient arena rumble,
  enemy attacks, damage, healing pickups, hits, kills, level transitions, and
  menu feedback. Clearing a level plays a short fanfare. Audio starts after the
  player begins the game, in keeping with browser autoplay restrictions.
- Original procedural pixel textures for brick walls, stone flooring, and a
  dark cracked ceiling; demon and hand surfaces use procedural grain and
  layered shading, while enemies use perspective-projected size and ground position.
- Wall lighting darkens the textured surface without blending it with the floor
  or ceiling behind it, keeping close wall faces visually solid.
- Escape pauses the game. Enemies can damage the player; a new run resets state.
- The game uses a small fixed map and a low-resolution canvas for a textured
  retro raycast look.

## Windows setup

Install the prerequisites:

1. Install [Git for Windows](https://git-scm.com/download/win) and
   [Python 3.8 or newer](https://www.python.org/downloads/windows/) if needed.
   In the Python installer, enable **Add python.exe to PATH**. Open a new
   Command Prompt and verify with `git --version` and `python --version`.
2. Open **Command Prompt** and clone and activate the official Emscripten SDK
   in `C:\emsdk`:

   ```bat
   git clone https://github.com/emscripten-core/emsdk.git C:\emsdk
   cd /d C:\emsdk
   .\emsdk.bat install latest
   .\emsdk.bat activate latest
   .\emsdk_env.bat
   emcc --version
   ```

3. Keep that Command Prompt open and build from it. In another Command Prompt,
   run `C:\emsdk\emsdk_env.bat` before building. Run the batch file in
   Command Prompt (not PowerShell) so its environment changes apply to the
   current shell.

The Emscripten SDK supplies the compiler and WebAssembly tools. A modern browser
is also needed to play the game.

## Build

From the project root, in the Emscripten-enabled Command Prompt:

```bat
emcc src\game.c -O2 -std=c11 -Wall -Wextra -Werror -pedantic -lm -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=createHellbreakModule -s ENVIRONMENT=web -s ALLOW_MEMORY_GROWTH=1 -s "EXPORTED_FUNCTIONS=['_game_init','_game_get_map_width','_game_get_map_height','_game_get_map_cell','_game_move','_game_rotate','_game_shoot','_game_reload','_game_update','_game_get_player_x','_game_get_player_y','_game_get_player_angle','_game_get_health','_game_get_health_pickup_count','_game_get_health_pickup_alive','_game_get_health_pickup_x','_game_get_health_pickup_y','_game_get_health_pickup_heal','_game_get_health_pickups_collected','_game_get_ammo','_game_get_reserve_ammo','_game_get_kills','_game_get_enemy_count','_game_get_level','_game_get_level_count','_game_get_level_kills','_game_advance_level','_game_get_enemy_alive','_game_get_enemy_x','_game_get_enemy_y','_game_get_enemy_attack_time','_game_get_enemy_type','_game_get_enemy_projectile_active','_game_get_enemy_projectile_x','_game_get_enemy_projectile_y','_game_get_enemy_health','_game_get_enemy_max_health','_game_get_enemy_hit_time']" -o docs\game.js
```

This creates `docs\game.js` and `docs\game.wasm`. Keep these generated outputs
in the repository so GitHub Pages can serve the complete game. The exported C
function list is explicit because `docs\main.js` calls each
function by its Emscripten `_game_*` JavaScript binding.

## Run locally

Do not open `docs\index.html` directly as a `file://` URL: browsers restrict
loading the ES module and WebAssembly that way. Open PowerShell in the project
root and start a local static server:

```powershell
python -m http.server 8000 --directory docs
```

Open <http://localhost:8000/> in a current desktop browser. Click **START
GAME**, allow pointer lock, move with WASD, aim with the mouse, and fire with
the left mouse button or Space. Press R to reload; when the magazine is empty,
the game displays a reload prompt. Escape releases pointer lock and pauses the
run. Press Ctrl+C in the server terminal to stop the server.

## Native C compile check (optional)

If MinGW GCC is installed, this command checks the gameplay source without
requiring Emscripten:

```powershell
gcc -std=c11 -Wall -Wextra -Werror -pedantic -c src\game.c -o game-check.o
```

It creates `game-check.o` in the project root. Remove that one generated file
after the check if you do not need it. This compile check does not produce a
playable browser build; use the Emscripten build above for that.

## Viva notes

- `src\game.c` owns the map, player/enemy positions, movement and collision,
  shooting, line-of-sight checks, health, ammunition, reloading, enemy AI, and
  scoring. Keeping rules here makes C the source of truth for gameplay.
- `GAME_EXPORT` marks C functions for Emscripten, and the build command also
  names the exported symbols. The JavaScript `_game_*` calls must match these C
  exports exactly.
- `docs\main.js` imports the generated ES module, passes keyboard/mouse actions
  into the C API, raycasts each screen column against the C-owned map, and
  projects textured walls, floor, ceiling, and enemies into the canvas. Enemy
  sprites are depth-tested against the ray distances so walls hide them.
- `docs\index.html` contains the accessible game canvas and HUD; `docs\style.css`
  styles the presentation and adapts it to narrower screens.

## Troubleshooting

- **`emcc` is not recognized:** install and activate Emscripten as above, then
  run `C:\emsdk\emsdk_env.bat` in a Command Prompt used for the build.
- **The page reports `WASM NOT FOUND`:** build first and check that both
  `docs\game.js` and `docs\game.wasm` exist, then serve the `docs` folder over
  localhost and reload.
- **The game does not start from a local file:** use the local HTTP server
  command above rather than a `file://` URL.
- **No mouse look:** click Start and allow pointer lock. If pointer lock is
  unavailable, the page displays a notice; click the game to fire.

## GitHub Pages

In the repository's **Settings > Pages**, set the source to branch `main` and
folder `/docs`, then save. The `docs` folder contains the site entry point,
generated WebAssembly build, and assets; `.nojekyll` disables Jekyll processing.

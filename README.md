# Collapse Factor

**Build it. Test it. Learn why it falls.**
*コラプス・ファクター — つくって、ためして、こわれた理由を学ぼう。*

Collapse Factor is a physics-based building puzzle game. Players design bridges over
rivers, lakes and mountain canyons, and towers that must carry heavy water tanks. When
the design is finished, or the 300-second (5-minute) build timer runs out, the game tests it with
real vehicle weights and gusty wind. If the structure fails, the game explains the weak
points in a friendly, encouraging way so the player knows how to improve.

- **Version:** v0.1.1 (released 2026-11-07)
- **Creator:** Shawn Rapaz, developed with Claude Code
- **Website:** https://shoukugames.org/
- **Contact:** info@shoukugames.org
- **License:** GNU General Public License v3.0 (see [LICENSE](LICENSE))
- **Recommended ages:** 10+

---

## Features

- **Real structural physics.** Structures are simulated as pin-jointed trusses with
  small-step XPBD (eXtended Position Based Dynamics). Every member has real axial
  stiffness (k = EA/L), tension and crushing limits, and **Euler buckling**
  (P = π²EI/L²), so long members that are squeezed buckle well before short ones.
- **Three materials, seven parts:** wood road and beam, steel road, beam and cable
  (the cable only resists pulling), and concrete road and pillar. Concrete is very strong
  when squeezed, weak when pulled, and heavy.
- **Real vehicle weights:** car 1,500 kg, SUV 2,200 kg, pickup 2,600 kg, van 3,500 kg,
  box truck 8,000 kg, bus 13,000 kg, dump truck 25,000 kg and semi truck 36,000 kg.
  Vehicles drive across the deforming deck and load it through their axles.
- **Wind** uses the drag formula ½ρv²·C<sub>d</sub>·A with deterministic gusts. Decks
  also feel an oscillating aerodynamic lift, so structures sway before they fail.
- **20 procedurally generated levels.** Every play creates new terrain, anchors, loads
  and scenery: river crossings, lake crossings with islands, mountain canyons with rock
  spires, and tower builds. The levels get harder as you go.
- **Guaranteed solvable.** For each level, the generator designs its own reference
  structure and runs it through the physics engine. If that design fails, the loads are
  eased until it passes. The player's material allowance is based on the verified design.
- **5 minutes per level.** Each level gives you 300 seconds to build before the test starts
  (or press **Test!** any time you're ready).
- **Resource management.** Each part type comes in a limited number of metres. Stars are
  awarded for efficient designs.
- **Choose the location and angle.** Each bank has several yellow road anchors at
  different positions and heights, so the anchors you pick decide where the bridge sits
  and how steep it is (vehicles can't climb roads steeper than about 27°).
- **Animated testing and collapse.** Vehicles cross the bridge and wind streaks blow
  past. When something breaks, beams snap into debris with wood splinters, steel sparks,
  concrete chunks and dust. Water splashes, the camera shakes, and sound effects match
  each material.
- **Friendly failure analysis.** After a failed test you get a weak-point map, an
  explanation of what failed and why (tension, compression or buckling, which vehicle
  was crossing, how strong the wind gust was), and practical tips for the next try.
- **Bilingual:** English and Japanese, switchable on the title screen.
- **Title-screen options:** difficulty (Easy / Medium / Hard), music on/off, sound
  effects on/off, the tutorial, the For Parents section and credits.
- **Tutorial: How Structures Work.** Seven animated lessons covering weight, tension and
  compression, why triangles are strong, buckling, wind, choosing materials, and how to play.
- **For Parents.** Shows total and daily play time, sessions, tests run, success rate,
  the highest level reached, details for each level (attempts, failures, best stars,
  most common challenge) and a log of recent failures with their causes. All of it is
  stored locally on the computer.
- **Procedural audio.** Calm ambient generative music plus synthesised effects, made live
  with the Web Audio API. There are no audio files.

## Controls

| Action | Input |
| --- | --- |
| Place a part | Drag from an anchor (bolt plate) or an existing joint |
| Remove a part / joint | Right-click it, or use **Erase** (`E`) |
| Choose a part | Click it in the bottom bar, or press `1`–`7` |
| Undo | `Ctrl+Z` |
| Start the test early | **Test!** button or `Space` |
| Pause | `Esc` |
| Full screen | `F11` |

## Installing

Prebuilt packages for v0.1.1 are produced in `dist/`:

| Platform | File |
| --- | --- |
| Debian / Ubuntu (x64) | `collapse-factor_0.1.1_amd64.deb` |
| Windows installer (x64) | `CollapseFactor-Setup-0.1.1.exe` |
| Windows portable (x64) | `CollapseFactor-Portable-0.1.1.exe` |

```bash
# Debian / Ubuntu
sudo apt install ./dist/collapse-factor_0.1.1_amd64.deb
collapse-factor
```

## Running from source

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

## Building packages

```bash
npm run dist:linux   # .deb
npm run dist:win     # Windows NSIS installer + portable .exe (on Linux this needs Wine)
npm run dist         # both
```

Build output is written to `dist/`. The `build/` and `dist/` folders are git-ignored.

The README, CHANGELOG, BUGREPORT and LICENSE are installed alongside the game:

- **Linux (.deb):** `/opt/Collapse Factor/resources/`
- **Windows installer:** `<install folder>\resources\` (the license is also shown during setup)
- **Windows portable:** inside the portable package's `resources` folder

## Developer tools

```bash
npm run test:sim     # headless physics + level-generation checks for all 20 levels x 3 difficulties
npm run fonts        # re-copy the bundled font from node_modules into src/fonts
```

`scripts/sim-test.js` generates every level on every difficulty, checks that each one was
verified by its reference design, and checks that a naive road-only bridge fails as it
should. `scripts/shot.js` drives the game in a window and captures screenshots, which is
useful for visual checks under `xvfb-run`.

## Project layout

```
main.js, preload.js     Electron shell (window, safe native bridge)
src/index.html          Screens, HUD and modals
src/css/style.css       Styles
src/js/physics.js       XPBD truss solver, materials, vehicles, wind
src/js/levelgen.js      Procedural levels + reference-design verification
src/js/render.js        Canvas renderer, particles, weak-point map
src/js/game.js          Building, testing and results
src/js/analysis.js      Friendly failure explanations
src/js/tutorial.js      Animated tutorial lessons
src/js/audio.js         Generative music and sound effects
src/js/i18n.js          English / Japanese text
src/js/storage.js       Settings, progress and parent statistics
src/js/ui.js            Menus, title attract mode, main loop
src/fonts/              M PLUS Rounded 1c (SIL OFL 1.1)
resources/              App icons used for packaging
```

## Reporting bugs

See [BUGREPORT.md](BUGREPORT.md).

## License

Copyright (C) 2026 Shawn Rapaz

This program is free software: you can redistribute it and/or modify it under the terms
of the GNU General Public License version 3 as published by the Free Software Foundation.
It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See
[LICENSE](LICENSE) for details.

The bundled font, M PLUS Rounded 1c, is licensed under the SIL Open Font License 1.1
(see `src/fonts/OFL-LICENSE.txt`).

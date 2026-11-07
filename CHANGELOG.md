# Changelog

All notable changes to Collapse Factor are documented here.
This project uses [Semantic Versioning](https://semver.org/).

## [0.1.2] - 2026-11-07

### Changed
- Recommended age changed from 10+ to 8+ (title screen, credits, README).
- Version bumped to 0.1.2.

## [0.1.1] - 2026-11-07

### Changed
- Build time per level increased from 120 to 300 seconds (5 minutes) to make levels less stressful.
- README updated; README, CHANGELOG, BUGREPORT and LICENSE are now installed with the .deb and .exe packages.
- Version bumped to 0.1.1.

## [0.1.0] - 2026-11-07

First public release.

### Added
- XPBD truss physics with real axial stiffness, tension/crush limits and Euler buckling.
- Wood, steel and concrete materials in seven parts (roads, beams, steel cable, concrete pillar).
- Real-world vehicle masses from a 1,500 kg car up to a 36,000 kg semi truck.
- Gusty wind loads (drag ½ρv²CdA) with aerodynamic deck flutter.
- 20 procedurally generated levels (river, lake, mountain canyon, tower) that get harder as you go,
  each verified as solvable by a reference design run through the physics engine.
- Limited material allowances, a 120-second build timer and star ratings.
- Animated vehicles, wind, collapse debris, splashes, dust and camera shake.
- Friendly failure analysis with a weak-point map and improvement tips.
- English / Japanese language toggle.
- Difficulty selector (Easy / Medium / Hard), music and sound-effect toggles.
- Animated "How Structures Work" tutorial (7 lessons).
- For Parents section: play time, progress, per-level results and failure log.
- Credits screen with GPL-3.0 license information.
- Generative ambient soundtrack and synthesised sound effects.
- Linux `.deb` package and Windows installer / portable `.exe`.

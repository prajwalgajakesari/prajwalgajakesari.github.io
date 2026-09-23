# Special Stage: Beyond

Personal site of **Prajwal P**: a rally stage that ends at a crest and never comes back down.

Scroll is the throttle. The navigation is a real rally roadbook, drawn with symbols from
[all-things-rally](https://github.com/prajwalgajakesari). Seven boxes, one camera, one canvas:

| Box | Scene | Content |
|---|---|---|
| 01 Start control | Procedural KTM 890 Adventure under a start gantry, blueprint → solid, hold to rev (synthesised twin) | Hero |
| 02 Liaison | India drawn from 14,738 MotoGenie places and 3,246 routes | About |
| 03 SS Himalaya | Contour terrain from the real Manali → Khardung La elevation profile | Riding and rally projects |
| 04 The machine | The bike's surface sampled into 9,000 particles that re-form as a neural net | AI tooling |
| 05 Crest | Golden-hour jump that never lands | Racing |
| 06 Additive | A rocket 3D-printed layer by layer with a clipping plane, then launched past the Kármán line | Aerospace, 3D printing |
| 07 Finish | Orbit; India lit on the globe from the same dataset | Contact |

Easter eggs: `W` wheelie, `R` full printable roadbook, type `launch` anywhere.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run data       # re-pack public/data from ~/repos/data_scrap_motogenie (coordinates only)
```

Three.js + Vite, no framework. Honors `prefers-reduced-motion`; falls back to an
instrument-only page without WebGL. Deployed to GitHub Pages by `.github/workflows/deploy.yml`.

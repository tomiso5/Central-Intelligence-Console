// Rebuild data/world.json (pre-projected Natural Earth SVG paths). Needs: npm i d3-geo topojson-client world-atlas
import { geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import { feature, mesh } from "topojson-client";
import { readFile, writeFile } from "node:fs/promises";
const topo = JSON.parse(await readFile(new URL("../node_modules/world-atlas/countries-50m.json", import.meta.url)));
const path = geoPath(geoNaturalEarth1().scale(175).translate([480, 250]).precision(0.3));
const r = d => path(d).replace(/(\d+\.\d)\d+/g, "$1");
await writeFile(new URL("../data/world.json", import.meta.url), JSON.stringify({
  land: r(feature(topo, topo.objects.land)), borders: r(mesh(topo, topo.objects.countries, (a, b) => a !== b)), grat: r(geoGraticule10()), sphere: r({ type: "Sphere" })
}));

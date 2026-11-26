import { copyFileSync, cpSync, mkdirSync } from "node:fs";

mkdirSync("dist/portal", { recursive: true });
for (const file of ["index.html", "features.html", "life-areas.html", "mission.html", "styles.css", "artwork.js"]) {
  copyFileSync(file, `dist/${file}`);
}
cpSync("assets", "dist/assets", { recursive: true });
copyFileSync("portal/portal.html", "dist/portal/index.html");
for (const file of ["portal.css", "portal-client.js"]) copyFileSync(`portal/${file}`, `dist/portal/${file}`);

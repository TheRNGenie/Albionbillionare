// Copies the static web app into www/, which Capacitor packages into the Android app,
// and adds Capacitor's runtime so the page can reach native plugins (files, share).
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
rmSync("www", { recursive: true, force: true });
mkdirSync("www");
cpSync("assets", "www/assets", { recursive: true });
cpSync("node_modules/@capacitor/core/dist/capacitor.js", "www/assets/js/capacitor.js");
const FIRST = '<script src="assets/js/core/util.js">';
const html = readFileSync("index.html", "utf8").replace(FIRST, `<script src="assets/js/capacitor.js"></script>\n${FIRST}`);
if (!html.includes("capacitor.js")) throw new Error("Could not add capacitor.js to index.html");
writeFileSync("www/index.html", html);
console.log("Web app copied to www/");

const fs=require("fs");const path=require("path");
const roots=["src"];const allowed=new Set([
"src/styles/overlay-layout-system.css","src/styles/tokens.css","src/styles/cart-menu-safe-layer.css",
"src/styles/persistent-cart.css","src/styles/mobile-navigation-v2.css","src/styles/mobile-footer-regression-fixes.css",
"src/pages/event/EventUpdatePageV2.css"
]);
const files=[];function walk(d){for(const n of fs.readdirSync(d)){const p=path.join(d,n);const s=fs.statSync(p);if(s.isDirectory())walk(p);else if(/\.css$/.test(p))files.push(p.replace(/\\/g,"/"));}}
roots.forEach(walk);const violations=[];
for(const f of files){if(allowed.has(f))continue;const c=fs.readFileSync(f,"utf8");const lines=c.split(/\r?\n/);lines.forEach((line,i)=>{if(/z-index\s*:\s*(?:[1-9]\d{2,}|999)/i.test(line)||/bottom\s*:\s*(?:6[0-9]|7[0-9]|1[0-9]{2})px/i.test(line))violations.push(`${f}:${i+1}: ${line.trim()}`);});}
if(violations.length){console.error("Overlay policy: new/legacy magic positioning outside approved coordination files:\n"+violations.slice(0,80).join("\n"));process.exit(1);}console.log(`Overlay policy OK (${files.length} CSS files audited).`);

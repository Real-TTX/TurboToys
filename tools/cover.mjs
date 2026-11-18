#!/usr/bin/env node
// Renders candidates for the portal card (img/cover.png) from dev/cover.html (a bots-only race with the logo); pick one and copy it.
//   node scripts/serve.mjs 2779 &   then   node tools/cover.mjs [layout] [count]
import { execFileSync } from 'node:child_process';

const layout = process.argv[2] ?? 'kidsroom';
const count = Number(process.argv[3] ?? 3);
for (let k = 0; k < count; k++) {
    execFileSync('node', ['tools/shot.mjs', `http://localhost:2779/turbotoys/dev/cover.html?layout=${layout}&wait=${9000 + k * 2500}`, `tmp/cover-${layout}-${k}.png`, '1200', '675', '300'], { stdio: 'inherit' });
}

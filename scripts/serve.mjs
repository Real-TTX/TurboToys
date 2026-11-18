#!/usr/bin/env node
// A tiny static server for the browser part without MatGame: http://localhost:2779/turbotoys/dev/world.html?layout=kidsroom
//   node scripts/serve.mjs [port]
// Serves src/TurboToys.Module/wwwroot at /turbotoys/ (no API, no hub: for the developer previews only).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'TurboToys.Module', 'wwwroot');
const port = Number(process.argv[2] ?? 2779);
const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let path = decodeURIComponent(url.pathname);
    if (!path.startsWith('/turbotoys/')) {
        res.writeHead(302, { Location: '/turbotoys/' });
        return res.end();
    }
    path = path.slice('/turbotoys/'.length) || 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) {
        res.writeHead(403);
        return res.end();
    }
    try {
        const info = await stat(file);
        const target = info.isDirectory() ? join(file, 'index.html') : file;
        const body = await readFile(target);
        res.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(body);
    } catch {
        res.writeHead(404);
        res.end('not found');
    }
}).listen(port, () => console.log(`TurboToys preview: http://localhost:${port}/turbotoys/dev/world.html?layout=kidsroom`));

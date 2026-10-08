#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (['new-tile', 'install-skill'].includes(process.argv[2])) process.exitCode = (await import('../tiles/cli.js')).main(process.argv.slice(2));
else process.exitCode = await (await import('../node/cli.js')).main(process.argv.slice(2), { version });

import fs from 'node:fs';
import path from 'node:path';

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));

for (const f of walk('src').filter((f) => f.endsWith('.js'))) {
  const before = fs.readFileSync(f, 'utf8');
  const after = before.replaceAll('new: true', "returnDocument: 'after'");
  if (before !== after) {
    fs.writeFileSync(f, after);
    console.log('updated', f);
  }
}
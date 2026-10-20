// Mini base de données : un fichier JSON dans data/. Suffisant pour un usage perso.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './config.js';

const FILE = path.join(ROOT, 'data', 'db.json');
const EMPTY = { projects: [], audits: [], aeo: [] };

let db = null;

function load() {
  if (db) return db;
  try {
    db = { ...EMPTY, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    db = structuredClone(EMPTY);
  }
  return db;
}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1));
    fs.renameSync(FILE + '.tmp', FILE);
  }, 200);
}

export const id = () => crypto.randomBytes(6).toString('hex');

export const store = {
  get: (coll) => load()[coll],
  find: (coll, pred) => load()[coll].find(pred),
  insert(coll, doc) {
    load()[coll].unshift(doc);
    save();
    return doc;
  },
  update(coll, docId, patch) {
    const doc = load()[coll].find((d) => d.id === docId);
    if (!doc) return null;
    Object.assign(doc, typeof patch === 'function' ? patch(doc) : patch);
    save();
    return doc;
  },
  remove(coll, docId) {
    const list = load()[coll];
    const i = list.findIndex((d) => d.id === docId);
    if (i >= 0) list.splice(i, 1);
    save();
  },
  trim(coll, max) {
    const list = load()[coll];
    if (list.length > max) list.length = max;
    save();
  },
};

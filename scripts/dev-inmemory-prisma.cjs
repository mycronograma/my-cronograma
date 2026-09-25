#!/usr/bin/env node
/**
 * ⚠️ SOMENTE DESENVOLVIMENTO / TESTES — nunca usar em produção.
 *
 * O sandbox não consegue baixar os binários do Prisma (`prisma generate` falha
 * por TLS), então `@prisma/client` é um stub que lança erro ao ser construído.
 * Isso impede rodar o app e testar as rotas de API.
 *
 * Este script lê `prisma/schema.prisma` e escreve em `node_modules/.prisma/client`
 * um client Prisma **em memória** (mesma API: findUnique/findMany/create/update/
 * upsert/delete/deleteMany/updateMany/count/aggregate/$transaction) mais typings
 * permissivos. node_modules não vai para o git, então nada disso é distribuído.
 *
 * Uso:
 *   node scripts/dev-inmemory-prisma.cjs          # instala o client fake
 *   node scripts/dev-inmemory-prisma.cjs --reset  # apaga o banco em memória
 *
 * Limitações (importante ao interpretar os testes):
 *   - não é SQL: não valida tipos/índices/constraints reais do CockroachDB;
 *   - `groupBy`, `$queryRaw` e filtros relacionais complexos não são suportados;
 *   - o estado vive em node_modules/.prisma/inmemory-db.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
const OUT_DIR = path.join(ROOT, 'node_modules', '.prisma', 'client');
const DB_FILE = path.join(ROOT, 'node_modules', '.prisma', 'inmemory-db.json');

// ---------------------------------------------------------------------------
// 1. Parser do schema.prisma
// ---------------------------------------------------------------------------

function parseSchema(source) {
  const models = {};
  const modelBlocks = [...source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];

  for (const [, name, body] of modelBlocks) {
    const fields = {};
    const relations = {};
    const uniques = [];
    let idField = null;

    for (const rawLine of body.split('\n')) {
      const line = rawLine.replace(/\/\/.*$/, '').trim();
      if (!line) continue;

      if (line.startsWith('@@unique(')) {
        const cols = line.match(/\[([^\]]+)\]/);
        if (cols) {
          uniques.push(
            cols[1].split(',').map((c) => c.trim().replace(/^map\(.*/, '').replace(/"/g, ''))
          );
        }
        continue;
      }
      if (line.startsWith('@@')) continue; // @@index, @@map...

      const match = line.match(/^(\w+)\s+([\w.]+)(\[\])?\??(.*)$/);
      if (!match) continue;

      const [, fieldName, rawType, isList, rest] = match;
      const attrs = rest || '';
      const isId = /@id\b/.test(attrs);
      const isUnique = /@unique\b/.test(attrs);
      const defaultMatch = attrs.match(/@default\(((?:[^()]|\([^()]*\))*)\)/);
      const relationMatch = attrs.match(/@relation\(([^)]*)\)/);

      const scalarType = rawType.replace(/^Json$/, 'Json');
      const isScalar = ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal'].includes(
        scalarType
      );

      if (isScalar) {
        fields[fieldName] = {
          name: fieldName,
          type: scalarType,
          list: Boolean(isList),
          optional: line.includes('?'),
          isId,
          isUnique,
          defaultValue: defaultMatch ? parseDefault(defaultMatch[1], scalarType) : undefined,
          hasDefault: Boolean(defaultMatch),
        };
        if (isId) idField = fieldName;
        if (isUnique) uniques.push([fieldName]);
      } else if (relationMatch) {
        const fieldsMatch = relationMatch[1].match(/fields:\s*\[([^\]]+)\]/);
        const referencesMatch = relationMatch[1].match(/references:\s*\[([^\]]+)\]/);
        relations[fieldName] = {
          name: fieldName,
          target: scalarType,
          list: Boolean(isList),
          fk: fieldsMatch ? fieldsMatch[1].split(',').map((s) => s.trim())[0] : null,
          references: referencesMatch ? referencesMatch[1].split(',').map((s) => s.trim())[0] : 'id',
          // "inverse" = a FK mora no modelo alvo (ex.: user.subjects, user.preferences)
          inverse: !fieldsMatch,
        };
      } else {
        // relação lista sem @relation no lado "um" (ex.: `subjects Subject[]`)
        relations[fieldName] = {
          name: fieldName,
          target: scalarType,
          list: Boolean(isList),
          fk: null,
          references: 'id',
          inverse: true,
        };
      }
    }

    models[name] = { name, fields, relations, uniques, idField: idField || 'id' };
  }

  // Resolve o lado "lista" das relações procurando a FK no modelo alvo.
  for (const modelName of Object.keys(models)) {
    for (const relName of Object.keys(models[modelName].relations)) {
      const rel = models[modelName].relations[relName];
      if (rel.fk) continue;
      const target = models[rel.target];
      if (!target) continue;
      const backRef = Object.values(target.relations).find(
        (candidate) => candidate.target === modelName && candidate.fk
      );
      if (backRef) rel.fk = backRef.fk;
    }
  }

  return models;
}

function parseDefault(expression, type) {
  const value = expression.trim();
  if (value === 'cuid()') return { kind: 'cuid' };
  if (value === 'uuid()') return { kind: 'uuid' };
  if (value === 'now()') return { kind: 'now' };
  if (value === 'autoincrement()') return { kind: 'autoincrement' };
  if (value === 'dbgenerated()') return { kind: 'undefined' };
  if (value.startsWith('"') && value.endsWith('"')) return { kind: 'value', value: value.slice(1, -1) };
  if (value === 'true' || value === 'false') return { kind: 'value', value: value === 'true' };
  if (value.startsWith('[') && value.endsWith(']')) return { kind: 'value', value: [] };
  if (!Number.isNaN(Number(value))) return { kind: 'value', value: Number(value) };
  if (type === 'Json') return { kind: 'undefined' };
  return { kind: 'value', value }; // enums etc.
}

// ---------------------------------------------------------------------------
// 2. Geração do client em memória
// ---------------------------------------------------------------------------

function buildRuntime(models) {
  return `"use strict";
/* Gerado por scripts/dev-inmemory-prisma.cjs — client Prisma EM MEMÓRIA (dev/testes). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = ${JSON.stringify(DB_FILE)};
const MODELS = ${JSON.stringify(models, null, 2)};

const MODEL_BY_KEY = {};
for (const modelName of Object.keys(MODELS)) {
  MODEL_BY_KEY[modelName.toLowerCase()] = modelName;
  MODEL_BY_KEY[modelName.charAt(0).toLowerCase() + modelName.slice(1)] = modelName;
}

let counters = {};
let store = {};

function loadStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      store = parsed.store || {};
      counters = parsed.counters || {};
      return;
    }
  } catch (error) {
    console.warn('[inmemory-prisma] falha ao carregar estado:', error.message);
  }
  store = {};
  counters = {};
}

let saveTimer = null;
let dirty = false;

function writeStoreNow() {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify({ store, counters }, null, 0));
    dirty = false;
  } catch (error) {
    console.warn('[inmemory-prisma] falha ao persistir estado:', error.message);
  }
}

function persist() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) writeStoreNow();
  }, 25);
  if (saveTimer.unref) saveTimer.unref();
}

// Scripts curtos (ex.: prisma/seed.ts via tsx) terminam antes do debounce:
// garantir o flush síncrono na saída do processo.
process.on('exit', () => {
  if (dirty) writeStoreNow();
});
process.on('beforeExit', () => {
  if (dirty) writeStoreNow();
});

loadStore();

const cuid = () => 'cm' + crypto.randomBytes(10).toString('hex');
const uuid = () => crypto.randomUUID();

class PrismaClientKnownRequestError extends Error {
  constructor(message, { code, meta } = {}) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    this.meta = meta;
  }
}
class PrismaClientInitializationError extends Error {}
class PrismaClientValidationError extends Error {}
class PrismaClientRustPanicError extends Error {}

const JSON_NULL = { __prismaNullKind: 'JsonNull' };
const DB_NULL = { __prismaNullKind: 'DbNull' };
const ANY_NULL = { __prismaNullKind: 'AnyNull' };

function table(modelName) {
  if (!store[modelName]) store[modelName] = [];
  return store[modelName];
}

function resolveModel(input) {
  if (typeof input !== 'string') return null;
  return MODEL_BY_KEY[input] || MODEL_BY_KEY[input.toLowerCase()] || null;
}

function equals(a, b) {
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const bt = b instanceof Date ? b.getTime() : new Date(b).getTime();
    if (!Number.isNaN(at) && !Number.isNaN(bt)) return at === bt;
  }
  if (a === null || b === null) return a === b;
  if (typeof a === 'object' && typeof b === 'object') {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return a === b;
}

function coerceStored(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (value && value.__prismaNullKind) return null;
  return value;
}

function matchField(rowValue, condition, field) {
  if (condition === null) return rowValue === null || rowValue === undefined;
  if (condition === undefined) return true;

  if (condition instanceof Date || typeof condition !== 'object') {
    return equals(rowValue, condition);
  }
  if (Array.isArray(condition)) return equals(rowValue, condition);

  const ops = condition;
  let ok = true;

  const asNumber = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());
  const numeric = typeof ops.gt !== 'undefined' || typeof ops.gte !== 'undefined' ||
    typeof ops.lt !== 'undefined' || typeof ops.lte !== 'undefined';

  if (numeric) {
    const rv = rowValue instanceof Date || (typeof rowValue === 'string' && field && field.type === 'DateTime')
      ? asNumber(rowValue)
      : rowValue;
    const cv = (v) => (v instanceof Date || (typeof v === 'string' && field && field.type === 'DateTime') ? asNumber(v) : v);
    if (ops.gt !== undefined) ok = ok && rv > cv(ops.gt);
    if (ops.gte !== undefined) ok = ok && rv >= cv(ops.gte);
    if (ops.lt !== undefined) ok = ok && rv < cv(ops.lt);
    if (ops.lte !== undefined) ok = ok && rv <= cv(ops.lte);
  }

  if (ops.equals !== undefined) ok = ok && equals(rowValue, ops.equals);
  if (ops.not !== undefined) ok = ok && !matchField(rowValue, ops.not, field);
  if (ops.in !== undefined) ok = ok && ops.in.some((candidate) => equals(rowValue, candidate));
  if (ops.notIn !== undefined) ok = ok && !ops.notIn.some((candidate) => equals(rowValue, candidate));

  const text = typeof rowValue === 'string' ? rowValue : rowValue == null ? '' : String(rowValue);
  const target = typeof ops.contains === 'string' && ops.mode === 'insensitive'
    ? { contains: ops.contains.toLowerCase() }
    : { contains: ops.contains };
  if (ops.contains !== undefined) {
    ok = ok && (ops.mode === 'insensitive' ? text.toLowerCase().includes(target.contains) : text.includes(target.contains));
  }
  if (ops.startsWith !== undefined) {
    ok = ok && (ops.mode === 'insensitive'
      ? text.toLowerCase().startsWith(String(ops.startsWith).toLowerCase())
      : text.startsWith(ops.startsWith));
  }
  if (ops.endsWith !== undefined) {
    ok = ok && (ops.mode === 'insensitive'
      ? text.toLowerCase().endsWith(String(ops.endsWith).toLowerCase())
      : text.endsWith(ops.endsWith));
  }

  return ok;
}

function relationRows(modelName, rel, row) {
  const targetModel = resolveModel(rel.target);
  if (!targetModel) return [];
  const rows = table(targetModel);
  if (rel.list) {
    if (!rel.fk) return [];
    return rows.filter((candidate) => equals(candidate[rel.fk], row[rel.references || 'id']));
  }
  if (!rel.fk) return [];
  const found = rows.find((candidate) => equals(candidate[rel.references || 'id'], row[rel.fk]));
  return found ? [found] : [];
}

function matchWhere(modelName, row, where) {
  if (!where) return true;
  const model = MODELS[modelName];

  for (const [key, condition] of Object.entries(where)) {
    if (condition === undefined) continue;

    if (key === 'AND') {
      const list = Array.isArray(condition) ? condition : [condition];
      if (!list.every((sub) => matchWhere(modelName, row, sub))) return false;
      continue;
    }
    if (key === 'OR') {
      const list = Array.isArray(condition) ? condition : [condition];
      if (list.length > 0 && !list.some((sub) => matchWhere(modelName, row, sub))) return false;
      continue;
    }
    if (key === 'NOT') {
      const list = Array.isArray(condition) ? condition : [condition];
      if (list.some((sub) => matchWhere(modelName, row, sub))) return false;
      continue;
    }

    // chave única composta: { userId_dedupeKey: { userId, dedupeKey } }
    if (key.includes('_') && condition && typeof condition === 'object' && !Array.isArray(condition)
        && !(condition instanceof Date) && !model.fields[key] && !model.relations[key]) {
      if (!matchWhere(modelName, row, condition)) return false;
      continue;
    }

    const rel = model.relations[key];
    if (rel) {
      const related = relationRows(modelName, rel, row);
      if (condition === null) {
        if (related.length !== 0) return false;
        continue;
      }
      const targetModel = resolveModel(rel.target);
      if (!targetModel) return false;
      if (condition.some) {
        if (!related.some((candidate) => matchWhere(targetModel, candidate, condition.some))) return false;
      } else if (condition.every) {
        if (!related.every((candidate) => matchWhere(targetModel, candidate, condition.every))) return false;
      } else if (condition.none) {
        if (related.some((candidate) => matchWhere(targetModel, candidate, condition.none))) return false;
      } else if (condition.is) {
        if (!related.some((candidate) => matchWhere(targetModel, candidate, condition.is))) return false;
      } else if (condition.isNot) {
        if (related.some((candidate) => matchWhere(targetModel, candidate, condition.isNot))) return false;
      } else if (!related.some((candidate) => matchWhere(targetModel, candidate, condition))) {
        return false;
      }
      continue;
    }

    const field = model.fields[key];
    if (!matchField(row[key], condition, field)) return false;
  }
  return true;
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const bt = b instanceof Date ? b.getTime() : new Date(b).getTime();
    return at < bt ? -1 : at > bt ? 1 : 0;
  }
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1;
  return String(a) < String(b) ? -1 : 1;
}

function readPath(row, pathParts) {
  let current = row;
  for (const part of pathParts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function sortRows(rows, orderBy) {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  const flat = [];
  for (const clause of clauses) {
    for (const [key, direction] of Object.entries(clause || {})) {
      if (direction && typeof direction === 'object') {
        for (const [subKey, subDir] of Object.entries(direction)) flat.push({ path: [key, subKey], dir: subDir });
      } else {
        flat.push({ path: [key], dir: direction });
      }
    }
  }
  if (flat.length === 0) return rows;
  return rows.slice().sort((a, b) => {
    for (const { path: pathParts, dir } of flat) {
      const result = compareValues(readPath(a, pathParts), readPath(b, pathParts));
      if (result !== 0) return dir === 'desc' ? -result : result;
    }
    return 0;
  });
}

function projectRelation(modelName, rel, row, spec) {
  const targetModel = resolveModel(rel.target);
  if (!targetModel) return rel.list ? [] : null;
  let related = relationRows(modelName, rel, row);
  if (spec && typeof spec === 'object' && spec.where) {
    related = related.filter((candidate) => matchWhere(targetModel, candidate, spec.where));
  }
  if (spec && typeof spec === 'object' && spec.orderBy) related = sortRows(related, spec.orderBy);
  if (spec && typeof spec === 'object' && typeof spec.skip === 'number') related = related.slice(spec.skip);
  if (spec && typeof spec === 'object' && typeof spec.take === 'number') {
    related = spec.take < 0 ? related.slice(spec.take) : related.slice(0, spec.take);
  }
  related = related.map((candidate) => project(targetModel, candidate, spec));
  if (rel.list) return related;
  return related[0] ?? null;
}

function project(modelName, row, spec) {
  if (!row) return row;
  const model = MODELS[modelName];
  const select = spec && typeof spec === 'object' ? spec.select : null;
  const include = spec && typeof spec === 'object' ? spec.include : null;

  const output = {};
  const scalarFields = Object.keys(model.fields);

  if (select) {
    for (const [key, value] of Object.entries(select)) {
      if (value === false || value === undefined) continue;
      if (model.relations[key]) {
        output[key] = projectRelation(modelName, model.relations[key], row, value === true ? null : value);
      } else if (key === '_count') {
        output._count = countRelations(modelName, row, value);
      } else {
        output[key] = clone(row[key]);
      }
    }
    return output;
  }

  for (const key of scalarFields) output[key] = clone(row[key]);

  if (include) {
    for (const [key, value] of Object.entries(include)) {
      if (value === false || value === undefined) continue;
      if (model.relations[key]) {
        output[key] = projectRelation(modelName, model.relations[key], row, value === true ? null : value);
      } else if (key === '_count') {
        output._count = countRelations(modelName, row, value);
      }
    }
  }
  return output;
}

function countRelations(modelName, row, spec) {
  const model = MODELS[modelName];
  const result = {};
  const keys = spec && typeof spec === 'object' && spec.select ? Object.keys(spec.select) : Object.keys(model.relations);
  for (const key of keys) {
    const rel = model.relations[key];
    if (!rel) continue;
    let related = relationRows(modelName, rel, row);
    if (spec && spec.select && spec.select[key] && typeof spec.select[key] === 'object' && spec.select[key].where) {
      const targetModel = resolveModel(rel.target);
      related = related.filter((candidate) => matchWhere(targetModel, candidate, spec.select[key].where));
    }
    result[key] = related.length;
  }
  if (spec && typeof spec === 'object' && '_all' in spec) result._all = Object.keys(model.relations).length;
  return result;
}

function clone(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = clone(item);
    return output;
  }
  return value;
}

function applyDefaults(modelName, data) {
  const model = MODELS[modelName];
  const row = {};
  for (const [fieldName, field] of Object.entries(model.fields)) {
    if (data && Object.prototype.hasOwnProperty.call(data, fieldName)) {
      row[fieldName] = coerceStored(data[fieldName]);
      continue;
    }
    if (field.hasDefault) {
      const def = field.defaultValue;
      if (def.kind === 'cuid') row[fieldName] = cuid();
      else if (def.kind === 'uuid') row[fieldName] = uuid();
      else if (def.kind === 'now') row[fieldName] = new Date();
      else if (def.kind === 'autoincrement') {
        counters[fieldName] = (counters[fieldName] || 0) + 1;
        row[fieldName] = counters[fieldName];
      } else if (def.kind !== 'undefined') row[fieldName] = clone(def.value);
    } else if (field.isId) {
      row[fieldName] = cuid();
    } else if (!field.optional) {
      row[fieldName] = field.type === 'DateTime' ? new Date() : null;
    } else {
      row[fieldName] = null;
    }
  }
  return row;
}

function assertUnique(modelName, row, ignoreRow) {
  const model = MODELS[modelName];
  for (const unique of model.uniques) {
    // Semântica SQL: NULL não é igual a NULL, então linhas com qualquer campo
    // da chave única nulo nunca conflitam (ex.: StudySession.blockId opcional).
    if (unique.some((field) => row[field] === null || row[field] === undefined)) continue;
    const candidate = table(modelName).find(
      (other) => other !== ignoreRow && unique.every((field) => equals(other[field], row[field]))
    );
    if (candidate) {
      throw new PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (' + unique.join(', ') + ')',
        { code: 'P2002', meta: { target: unique } }
      );
    }
  }
}

function notFound(modelName, where) {
  throw new PrismaClientKnownRequestError(
    'No ' + modelName + ' found',
    { code: 'P2025', meta: { modelName, cause: 'Record to update not found.', where } }
  );
}

function findRows(modelName, args) {
  const options = args || {};
  let rows = table(modelName).filter((row) => matchWhere(modelName, row, options.where));
  if (options.orderBy) rows = sortRows(rows, options.orderBy);
  if (typeof options.skip === 'number') rows = rows.slice(options.skip);
  if (typeof options.take === 'number') {
    rows = options.take < 0 ? rows.slice(options.take) : rows.slice(0, options.take);
  }
  if (options.distinct) {
    const keys = Array.isArray(options.distinct) ? options.distinct : [options.distinct];
    const seen = new Set();
    rows = rows.filter((row) => {
      const signature = JSON.stringify(keys.map((key) => row[key] ?? null));
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }
  return rows;
}

function normalizeData(modelName, data) {
  if (!data || typeof data !== 'object') return {};
  const model = MODELS[modelName];
  const output = {};
  for (const [key, value] of Object.entries(data)) {
    if (model.relations[key] && value && typeof value === 'object') {
      // connect / create aninhado: resolve para a FK quando der
      const rel = model.relations[key];
      if (rel.fk) {
        if (value.connect) {
          const connectValue = value.connect;
          output[rel.fk] = connectValue.id ?? connectValue[rel.references] ?? null;
        } else if (typeof value.set === 'object' && value.set) {
          output[rel.fk] = value.set.id ?? null;
        } else if (value.disconnect) {
          output[rel.fk] = null;
        }
      }
      continue;
    }
    output[key] = value;
  }
  return output;
}

const ATOMIC_OPS = new Set(['set', 'increment', 'decrement', 'multiply', 'divide']);

function isAtomicOp(value) {
  if (!value || typeof value !== 'object' || value instanceof Date || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => ATOMIC_OPS.has(key));
}

function resolveAtomic(current, op) {
  let result = current;
  const has = (key) => Object.prototype.hasOwnProperty.call(op, key);
  const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
  if (has('set')) result = op.set;
  if (has('increment')) result = num(result) + num(op.increment);
  if (has('decrement')) result = num(result) - num(op.decrement);
  if (has('multiply')) result = num(result) * num(op.multiply);
  if (has('divide')) result = num(result) / (num(op.divide) || 1);
  return result;
}

/** Aplica data de update/updatesupportando operadores atômicos ({ increment } etc.). */
function applyUpdate(modelName, row, data) {
  const normalized = normalizeData(modelName, data);
  const raw = data && typeof data === 'object' ? data : {};
  for (const [key, value] of Object.entries(raw)) {
    if (isAtomicOp(value)) normalized[key] = resolveAtomic(row[key], value);
  }
  Object.assign(row, normalized);
  if (MODELS[modelName].fields.updatedAt) row.updatedAt = new Date();
}

/**
 * Escritas aninhadas de relação (create, createMany, connect) usadas por
 * seeds e rotas. A FK do filho é preenchida a partir da linha pai.
 */
function handleNestedWrites(modelName, row, data) {
  const model = MODELS[modelName];
  if (!data || typeof data !== 'object') return;

  for (const [key, value] of Object.entries(data)) {
    const rel = model.relations[key];
    if (!rel || !value || typeof value !== 'object' || !rel.fk || !rel.target) continue;
    if (!MODELS[rel.target]) continue;

    const items = [];
    if (value.create) items.push(...(Array.isArray(value.create) ? value.create : [value.create]));
    if (value.createMany) {
      const many = value.createMany.data !== undefined ? value.createMany.data : value.createMany;
      items.push(...(Array.isArray(many) ? many : [many]));
    }

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const childData = normalizeData(rel.target, item);
      childData[rel.fk] = row[rel.references || 'id'];
      const childRow = applyDefaults(rel.target, childData);
      if (MODELS[rel.target].fields.updatedAt) childRow.updatedAt = new Date();
      assertUnique(rel.target, childRow, null);
      table(rel.target).push(childRow);
      handleNestedWrites(rel.target, childRow, item);
    }
  }
}

function makeDelegate(modelName) {
  const wrap = (executor) => {
    let started = null;
    const run = () => {
      if (!started) {
        started = Promise.resolve().then(() => {
          const result = executor();
          persist();
          return result;
        });
      }
      return started;
    };
    return {
      then: (onFulfilled, onRejected) => run().then(onFulfilled, onRejected),
      catch: (onRejected) => run().catch(onRejected),
      finally: (onFinally) => run().finally(onFinally),
      [Symbol.toStringTag]: 'PrismaPromise',
    };
  };

  return {
    findUnique: (args) => wrap(() => {
      const rows = findRows(modelName, args);
      return rows.length > 0 ? project(modelName, rows[0], args) : null;
    }),
    findUniqueOrThrow: (args) => wrap(() => {
      const rows = findRows(modelName, args);
      if (rows.length === 0) notFound(modelName, args && args.where);
      return project(modelName, rows[0], args);
    }),
    findFirst: (args) => wrap(() => {
      const rows = findRows(modelName, args);
      return rows.length > 0 ? project(modelName, rows[0], args) : null;
    }),
    findFirstOrThrow: (args) => wrap(() => {
      const rows = findRows(modelName, args);
      if (rows.length === 0) notFound(modelName, args && args.where);
      return project(modelName, rows[0], args);
    }),
    findMany: (args) => wrap(() => findRows(modelName, args).map((row) => project(modelName, row, args))),
    count: (args) => wrap(() => {
      const rows = findRows(modelName, args);
      if (args && args.select && typeof args.select === 'object') {
        const result = {};
        for (const [key, enabled] of Object.entries(args.select)) if (enabled) result[key] = rows.length;
        return result;
      }
      return rows.length;
    }),
    aggregate: (args) => wrap(() => {
      const rows = findRows(modelName, args);
      const result = {};
      const spec = args || {};
      if (spec._count) {
        result._count = typeof spec._count === 'object'
          ? Object.keys(spec._count).reduce((acc, key) => ({ ...acc, [key]: key === '_all' ? rows.length : rows.length }), {})
          : rows.length;
      }
      for (const kind of ['_sum', '_avg', '_min', '_max']) {
        if (!spec[kind]) continue;
        const fields = typeof spec[kind] === 'object' ? Object.keys(spec[kind]) : [];
        result[kind] = {};
        for (const field of fields) {
          const values = rows.map((row) => row[field]).filter((value) => typeof value === 'number');
          if (kind === '_sum') result[kind][field] = values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
          if (kind === '_avg') result[kind][field] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
          if (kind === '_min') result[kind][field] = values.length > 0 ? Math.min(...values) : null;
          if (kind === '_max') result[kind][field] = values.length > 0 ? Math.max(...values) : null;
        }
      }
      return result;
    }),
    create: (args) => wrap(() => {
      const data = normalizeData(modelName, args && args.data);
      const row = applyDefaults(modelName, data);
      if (row.updatedAt === undefined || MODELS[modelName].fields.updatedAt) row.updatedAt = new Date();
      assertUnique(modelName, row, null);
      table(modelName).push(row);
      handleNestedWrites(modelName, row, args && args.data);
      return project(modelName, row, args);
    }),
    createMany: (args) => wrap(() => {
      const list = (args && args.data) || [];
      let count = 0;
      for (const item of list) {
        const row = applyDefaults(modelName, normalizeData(modelName, item));
        try {
          assertUnique(modelName, row, null);
        } catch (error) {
          if (args && args.skipDuplicates) continue;
          throw error;
        }
        table(modelName).push(row);
        count += 1;
      }
      return { count };
    }),
    update: (args) => wrap(() => {
      const rows = findRows(modelName, { where: args && args.where });
      if (rows.length === 0) notFound(modelName, args && args.where);
      const row = rows[0];
      applyUpdate(modelName, row, args && args.data);
      assertUnique(modelName, row, row);
      return project(modelName, row, args);
    }),
    updateMany: (args) => wrap(() => {
      const rows = findRows(modelName, args);
      for (const row of rows) {
        applyUpdate(modelName, row, args && args.data);
      }
      return { count: rows.length };
    }),
    upsert: (args) => wrap(() => {
      const rows = findRows(modelName, { where: args && args.where });
      if (rows.length > 0) {
        const row = rows[0];
        applyUpdate(modelName, row, args && args.update);
        assertUnique(modelName, row, row);
        return project(modelName, row, args);
      }
      const where = (args && args.where) || {};
      const flatWhere = {};
      for (const [key, value] of Object.entries(where)) {
        if (value && typeof value === 'object' && !(value instanceof Date) && MODELS[modelName].fields[key] === undefined) {
          Object.assign(flatWhere, value);
        } else {
          flatWhere[key] = value;
        }
      }
      const row = applyDefaults(modelName, {
        ...flatWhere,
        ...normalizeData(modelName, args && args.create),
      });
      assertUnique(modelName, row, null);
      table(modelName).push(row);
      handleNestedWrites(modelName, row, args && args.create);
      return project(modelName, row, args);
    }),
    delete: (args) => wrap(() => {
      const rows = findRows(modelName, { where: args && args.where });
      if (rows.length === 0) notFound(modelName, args && args.where);
      const row = rows[0];
      store[modelName] = table(modelName).filter((candidate) => candidate !== row);
      cascadeDelete(modelName, row);
      return project(modelName, row, args);
    }),
    deleteMany: (args) => wrap(() => {
      const rows = findRows(modelName, args);
      store[modelName] = table(modelName).filter((candidate) => !rows.includes(candidate));
      for (const row of rows) cascadeDelete(modelName, row);
      return { count: rows.length };
    }),
  };
}

function cascadeDelete(modelName, row) {
  const model = MODELS[modelName];
  for (const rel of Object.values(model.relations)) {
    // Só cascateia quando a FK mora no modelo alvo (listas e 1:1 inversas).
    if (!rel.inverse) continue;
    const targetModel = resolveModel(rel.target);
    if (!targetModel || !rel.fk) continue;
    const children = table(targetModel).filter((candidate) => equals(candidate[rel.fk], row[model.idField]));
    if (children.length === 0) continue;
    store[targetModel] = table(targetModel).filter((candidate) => !children.includes(candidate));
    for (const child of children) cascadeDelete(targetModel, child);
  }
}

const delegateCache = {};
function delegateFor(key) {
  const modelName = resolveModel(key);
  if (!modelName) return undefined;
  if (!delegateCache[modelName]) delegateCache[modelName] = makeDelegate(modelName);
  return delegateCache[modelName];
}

class PrismaClient {
  constructor(options) {
    this._options = options || {};
    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop !== 'string') return undefined;
        const delegate = delegateFor(prop);
        if (delegate) {
          target[prop] = delegate;
          return delegate;
        }
        return undefined;
      },
      has(target, prop) {
        return prop in target || Boolean(resolveModel(String(prop)));
      },
    });
  }

  async $connect() { return undefined; }
  async $disconnect() { return undefined; }
  $on() { return this; }
  $use() { return this; }
  $extends(extension) { return this; }

  async $transaction(input) {
    if (typeof input === 'function') return input(this);
    if (!Array.isArray(input)) return input;
    const results = [];
    for (const operation of input) results.push(await operation);
    return results;
  }

  async $queryRaw() { return []; }
  async $queryRawUnsafe() { return []; }
  async $executeRaw() { return 0; }
  async $executeRawUnsafe() { return 0; }
}

const Prisma = {
  PrismaClientKnownRequestError,
  PrismaClientInitializationError,
  PrismaClientValidationError,
  PrismaClientRustPanicError,
  JsonNull: JSON_NULL,
  DbNull: DB_NULL,
  AnyNull: ANY_NULL,
  sql: (strings) => String(strings && strings.raw ? strings.raw.join('?') : ''),
  raw: (value) => String(value),
  join: (values) => values,
  empty: '',
  Decimal: Number,
  defineExtension: (extension) => extension,
  getExtensionContext: (that) => that,
  prismaVersion: { client: '5.22.0-inmemory', engine: 'inmemory' },
  ModelName: Object.keys(MODELS).reduce((acc, name) => ({ ...acc, [name]: name }), {}),
  TransactionIsolationLevel: { ReadUncommitted: 'ReadUncommitted', ReadCommitted: 'ReadCommitted', RepeatableRead: 'RepeatableRead', Serializable: 'Serializable' },
};

// Enums do schema viram objetos de acesso (Prisma.StudyBlockType.AULA etc.).
const ENUMS = ${JSON.stringify((() => {
  const src = fs.readFileSync(SCHEMA, 'utf8');
  const out = {};
  for (const [, name, body] of src.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    out[name] = body.split('\n').map((line) => line.replace(/\/\/.*$/, '').trim()).filter(Boolean);
  }
  return out;
})())};
for (const [enumName, values] of Object.entries(ENUMS)) {
  Prisma[enumName] = values.reduce((acc, value) => ({ ...acc, [value]: value }), {});
  const scalarEnum = enumName + 'ScalarFieldEnum';
  Prisma[scalarEnum] = Object.keys(MODELS).reduce((acc, modelName) => {
    const model = MODELS[modelName];
    for (const field of Object.values(model.fields)) {
      if (field.type === enumName) acc[modelName.charAt(0).toLowerCase() + modelName.slice(1) + '.' + field.name] = field.name;
    }
    return acc;
  }, {});
}
for (const modelName of Object.keys(MODELS)) {
  const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  Prisma[modelName + 'ScalarFieldEnum'] = Object.keys(MODELS[modelName].fields).reduce(
    (acc, field) => ({ ...acc, [field]: field }), {}
  );
  Prisma[modelName + 'ScalarFieldEnum'][delegateName] = Prisma[modelName + 'ScalarFieldEnum'];
}

// utilitário de teste: inspecionar/limpar o estado em memória
Prisma.__inmemory = {
  store: () => store,
  table: (name) => table(resolveModel(name) || name),
  reset: () => { store = {}; counters = {}; persist(); },
  dump: () => JSON.parse(JSON.stringify({ store, counters })),
};

module.exports = { Prisma, PrismaClient, default: { Prisma } };
`;
}

function buildTypes(modelNames) {
  const delegates = modelNames
    .map((name) => `  ${name.charAt(0).toLowerCase() + name.slice(1)}: AnyDelegate;`)
    .join('\n');

  return `/* Gerado por scripts/dev-inmemory-prisma.cjs — typings permissivos (dev/testes). */
export declare namespace Prisma {
  type JsonValue = any;
  type InputJsonValue = any;
  type JsonObject = any;
  type JsonArray = any;
  type JsonNullValueInput = any;
  type InputJsonArray = any;
  type PrismaPromise<T> = Promise<T>;
  type PrismaClientOptions = any;
  type TransactionClient = any;
  const JsonNull: any;
  const DbNull: any;
  const AnyNull: any;
  const sql: any;
  const raw: any;
  const join: any;
  const empty: any;
  const Decimal: any;
  const ModelName: any;
  const TransactionIsolationLevel: any;
  const __inmemory: any;
}

/**
 * Delegate genérico: os retornos são "any" (o client real só existe após
 * prisma generate), mas findMany devolve any[] para dar tipo contextual aos
 * callbacks (.map/.filter) e evitar TS7006 espalhado pelo app.
 */
export declare type AnyDelegate = {
  findMany(args?: any): Promise<any[]>;
  findFirst(args?: any): Promise<any>;
  findFirstOrThrow(args?: any): Promise<any>;
  findUnique(args?: any): Promise<any>;
  findUniqueOrThrow(args?: any): Promise<any>;
  create(args?: any): Promise<any>;
  createMany(args?: any): Promise<{ count: number }>;
  update(args?: any): Promise<any>;
  updateMany(args?: any): Promise<{ count: number }>;
  upsert(args?: any): Promise<any>;
  delete(args?: any): Promise<any>;
  deleteMany(args?: any): Promise<{ count: number }>;
  count(args?: any): Promise<any>;
  aggregate(args?: any): Promise<any>;
  groupBy(args?: any): Promise<any[]>;
  [key: string]: any;
};

export declare class PrismaClient {
  constructor(options?: any);
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(operations: Array<Promise<T> | { then: any }>): Promise<T[]>;
  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>, options?: any): Promise<T>;
  $queryRaw(...args: any[]): Promise<any>;
  $queryRawUnsafe(...args: any[]): Promise<any>;
  $executeRaw(...args: any[]): Promise<any>;
  $executeRawUnsafe(...args: any[]): Promise<any>;
  $on(...args: any[]): any;
  $use(...args: any[]): any;
  $extends(extension: any): any;
${delegates}
  [model: string]: AnyDelegate | ((...args: any[]) => any);
}

export default PrismaClient;
`;
}

function main() {
  const models = parseSchema(fs.readFileSync(SCHEMA, 'utf8'));
  const modelNames = Object.keys(models);
  if (modelNames.length === 0) {
    throw new Error('Nenhum model encontrado em prisma/schema.prisma');
  }

  if (process.argv.includes('--reset')) {
    try { fs.rmSync(DB_FILE, { force: true }); } catch {}
    console.log('[inmemory-prisma] banco em memória zerado.');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const runtime = buildRuntime(models);
  fs.writeFileSync(path.join(OUT_DIR, 'default.js'), runtime);
  fs.writeFileSync(path.join(OUT_DIR, 'index.js'), runtime);
  fs.writeFileSync(path.join(OUT_DIR, 'default.d.ts'), buildTypes(modelNames));
  fs.writeFileSync(path.join(OUT_DIR, 'index.d.ts'), buildTypes(modelNames));

  console.log(`[inmemory-prisma] client em memória instalado (${modelNames.length} models): ${modelNames.join(', ')}`);
  console.log(`[inmemory-prisma] estado em ${path.relative(ROOT, DB_FILE)}`);
}

main();

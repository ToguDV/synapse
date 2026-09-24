#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const PROFILES = {
  'flat-fixed': { topology: 'flat', blocks: 'fixed' },
  'flat-per-page': { topology: 'flat', blocks: 'per-page' },
  'tree-per-page': { topology: 'tree', blocks: 'per-page' }
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const part = args[index]
    if (part === '--help' || part === '-h') {
      options.help = true
      continue
    }
    if (!part.startsWith('--')) throw new Error(`Unexpected argument: ${part}`)
    const equals = part.indexOf('=')
    if (equals !== -1) options[part.slice(2, equals)] = part.slice(equals + 1)
    else options[part.slice(2)] = args[++index]
  }
  return options
}

function pageId(index) {
  return `bench-page-${String(index).padStart(6, '0')}`
}

function blockId(index) {
  return `bench-block-${String(index).padStart(6, '0')}`
}

function seed({ dbPath, pageCount, profileName }) {
  const Database = require('better-sqlite3')
  const profile = PROFILES[profileName]
  if (!profile) throw new Error(`Unknown profile: ${profileName}`)
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 50_000) {
    throw new Error('Page count must be an integer between 1 and 50000')
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`
    if (fs.existsSync(file)) fs.rmSync(file)
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Keep this seed schema aligned with src/main/db/schema.ts.
  db.exec(`
    CREATE TABLE pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      parent_id TEXT REFERENCES pages(id) ON DELETE CASCADE,
      icon TEXT,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_pages_parent ON pages(parent_id);

    CREATE TABLE blocks (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '{"text":""}',
      position INTEGER NOT NULL,
      indent INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_blocks_page ON blocks(page_id);

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const insertPage = db.prepare(`
    INSERT INTO pages (id, title, parent_id, icon, position, created_at, updated_at)
    VALUES (@id, @title, @parentId, NULL, @position, @createdAt, @updatedAt)
  `)
  const insertBlock = db.prepare(`
    INSERT INTO blocks (id, page_id, type, content, position, indent, created_at, updated_at)
    VALUES (@id, @pageId, 'paragraph', @content, 0, 0, @createdAt, @updatedAt)
  `)
  const nextPosition = new Map()
  const baseTimestamp = 1_700_000_000_000
  let blockCount = 0

  const insertRows = db.transaction(() => {
    for (let index = 0; index < pageCount; index += 1) {
      const id = pageId(index)
      const parentId =
        profile.topology === 'tree' && index > 0 ? pageId(Math.floor((index - 1) / 10)) : null
      const position =
        parentId === null
          ? profile.topology === 'flat'
            ? index
            : 0
          : (nextPosition.get(parentId) ?? 0)
      if (parentId !== null) nextPosition.set(parentId, position + 1)

      const titleTokens = [
        `Project ${String(index).padStart(6, '0')}`,
        index % 10 === 0 ? 'group-hit' : '',
        index === pageCount - 1 ? 'page-needle' : ''
      ]
      const timestamp = baseTimestamp + index
      insertPage.run({
        id,
        title: titleTokens.filter(Boolean).join(' '),
        parentId,
        position,
        createdAt: timestamp,
        updatedAt: timestamp
      })

      const shouldInsertBlock = profile.blocks === 'per-page' || index === 0 || index === pageCount - 1
      if (!shouldInsertBlock) continue

      const bodyTokens = [
        `Content for project ${String(index).padStart(6, '0')}`,
        profile.blocks === 'per-page' && index % 10 === 0 ? 'body-hit' : '',
        index === pageCount - 1 ? 'block-needle' : ''
      ]
      insertBlock.run({
        id: blockId(index),
        pageId: id,
        content: JSON.stringify({ text: bodyTokens.filter(Boolean).join(' ') }),
        createdAt: timestamp,
        updatedAt: timestamp
      })
      blockCount += 1
    }
  })

  insertRows()
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()

  return {
    dbPath,
    pages: pageCount,
    blocks: blockCount,
    profile: profileName,
    topology: profile.topology,
    dbSizeBytes: fs.statSync(dbPath).size
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(
      'Usage: node benchmarks/seed-pages.cjs --db PATH --pages COUNT --profile flat-fixed|flat-per-page|tree-per-page\n'
    )
    return
  }
  if (!options.db || !options.pages || !options.profile) {
    throw new Error('Required arguments: --db, --pages, --profile')
  }
  const result = seed({
    dbPath: path.resolve(options.db),
    pageCount: Number(options.pages),
    profileName: options.profile
  })
  process.stdout.write(`SYNAPSE_BENCH_SEED ${JSON.stringify(result)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
}

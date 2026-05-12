#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads');
const LEGACY_THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeCovers = args.has('--include-covers');
const allowUnsafeCopy = args.has('--allow-unsafe-copy');

if (!allowUnsafeCopy) {
  console.error('This script is deprecated because it can copy legacy derivatives with wrong dimensions into canonical folders.');
  console.error('Use `node scripts/normalize-image-variants.js --apply` to regenerate canonical variants safely.');
  process.exit(1);
}

function readJsonArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFilename(value) {
  const safe = path.basename(String(value || '').trim());
  if (!safe || safe === '.' || safe === '..') return null;
  return safe;
}

function toMiniLegacyName(filename) {
  return filename.replace(/\.\w+$/, '.jpg').replace(/^/, 'mini_');
}

function maybePlanCopy(plan, fromAbs, toAbs, note) {
  if (!fromAbs || !toAbs) return;
  if (!fs.existsSync(fromAbs)) {
    plan.missing.push({ from: fromAbs, to: toAbs, note });
    return;
  }
  if (fs.existsSync(toAbs)) {
    plan.skippedExists.push({ from: fromAbs, to: toAbs, note });
    return;
  }
  plan.copy.push({ from: fromAbs, to: toAbs, note });
}

function buildPhotoPlan(photos) {
  const plan = { copy: [], skippedExists: [], missing: [], warnings: [] };

  for (const photo of photos) {
    const filename = sanitizeFilename(photo?.filename);
    if (!filename) continue;

    const ext = path.extname(filename).toLowerCase();
    const canMiniMap = ext === '.jpg' || ext === '.jpeg';

    maybePlanCopy(
      plan,
      path.join(UPLOADS_DIR, `wm_${filename}`),
      path.join(UPLOADS_DIR, 'grid', 'wm', filename),
      'grid/wm from legacy wm_',
    );

    maybePlanCopy(
      plan,
      path.join(LEGACY_THUMBS_DIR, `thumb_${filename}`),
      path.join(UPLOADS_DIR, 'thumbs', 'wm', filename),
      'thumbs/wm from legacy thumb_',
    );

    if (canMiniMap) {
      maybePlanCopy(
        plan,
        path.join(LEGACY_THUMBS_DIR, toMiniLegacyName(filename)),
        path.join(UPLOADS_DIR, 'mini', 'clean', filename),
        'mini/clean from legacy mini_',
      );
    } else {
      plan.warnings.push(
        `Mini skipped for ${filename}: extension ${ext || '(none)'} does not map safely to mini/clean filename.`,
      );
    }
  }

  return plan;
}

function buildCoverPlan(events) {
  const plan = { copy: [], skippedExists: [], missing: [], warnings: [] };

  for (const event of events) {
    const coverBase = sanitizeFilename(event?.coverImage);
    const coverFile = sanitizeFilename(event?.coverImageFile || (coverBase ? `cover_${coverBase}` : null));
    if (!coverFile) continue;

    const legacyPath = path.join(LEGACY_THUMBS_DIR, coverFile);
    maybePlanCopy(
      plan,
      legacyPath,
      path.join(UPLOADS_DIR, 'covers', 'clean', coverFile),
      'covers/clean from legacy cover thumb',
    );
    maybePlanCopy(
      plan,
      legacyPath,
      path.join(UPLOADS_DIR, 'covers', 'wm', coverFile),
      'covers/wm from legacy cover thumb (review watermark state)',
    );
  }

  plan.warnings.push(
    'Cover migration from legacy thumbs is ambiguous (file may be wm or clean depending on previous settings). Prefer /api/events/[id]/regenerate for authoritative cover outputs.',
  );

  return plan;
}

function printPlan(title, plan) {
  console.log(`\n=== ${title} ===`);
  console.log(`to copy: ${plan.copy.length}`);
  console.log(`already exists: ${plan.skippedExists.length}`);
  console.log(`missing source: ${plan.missing.length}`);
  if (plan.warnings.length) {
    console.log('warnings:');
    for (const warning of plan.warnings) console.log(`- ${warning}`);
  }
}

function executePlan(plan) {
  let copied = 0;
  for (const item of plan.copy) {
    ensureDirSync(path.dirname(item.to));
    fs.copyFileSync(item.from, item.to);
    copied += 1;
  }
  return copied;
}

function main() {
  ensureDirSync(path.join(UPLOADS_DIR, 'grid', 'wm'));
  ensureDirSync(path.join(UPLOADS_DIR, 'thumbs', 'wm'));
  ensureDirSync(path.join(UPLOADS_DIR, 'mini', 'clean'));
  if (includeCovers) {
    ensureDirSync(path.join(UPLOADS_DIR, 'covers', 'wm'));
    ensureDirSync(path.join(UPLOADS_DIR, 'covers', 'clean'));
  }

  const photos = readJsonArray(path.join(DATA_DIR, 'photos.json'));
  const events = readJsonArray(path.join(DATA_DIR, 'events.json'));

  const photoPlan = buildPhotoPlan(photos);
  printPlan('photos', photoPlan);

  let coverPlan = null;
  if (includeCovers) {
    coverPlan = buildCoverPlan(events);
    printPlan('covers', coverPlan);
  } else {
    console.log('\n=== covers ===');
    console.log('skipped (use --include-covers to include legacy cover copies)');
  }

  if (!apply) {
    console.log('\nDry-run only. No files changed.');
    console.log('Run again with --apply to copy planned files.');
    return;
  }

  const copiedPhotos = executePlan(photoPlan);
  const copiedCovers = coverPlan ? executePlan(coverPlan) : 0;
  console.log(`\nDone. Copied ${copiedPhotos + copiedCovers} files (${copiedPhotos} photos, ${copiedCovers} covers).`);
  console.log('No deletions were performed.');
}

main();

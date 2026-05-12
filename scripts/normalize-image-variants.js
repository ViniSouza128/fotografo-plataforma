#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const { pathToFileURL } = require('url')
const { registerHooks } = require('module')

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
      if (isRelative && !path.extname(specifier) && error?.code === 'ERR_MODULE_NOT_FOUND') {
        return nextResolve(`${specifier}.js`, context)
      }
      throw error
    }
  },
})

async function main() {
  const args = new Set(process.argv.slice(2))
  const apply = args.has('--apply')
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src', 'lib', 'derivedImagesMaintenance.js')).href
  const { sanitizeDerivedImages } = await import(moduleUrl)
  const result = await sanitizeDerivedImages({
    apply,
    forceRegenerate: apply,
  })
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    ...result,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

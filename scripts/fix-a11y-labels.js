/**
 * fix-a11y-labels.js
 *
 * Para cada `<label className="form-label">TEXTO</label>` seguido (sem outro
 * <label> no meio) por um `<input>`, `<textarea>` ou `<select>` que ainda nao
 * tem `aria-label`, injeta `aria-label="TEXTO"` na abertura do elemento.
 *
 * Implementacao em scanner — respeita {} balanceados nos atributos JSX para
 * nao quebrar `style={{...}}` etc.
 *
 * Uso:
 *   node scripts/fix-a11y-labels.js arquivo1.js [arquivo2.js ...]
 */

const fs = require('fs')
const path = require('path')

function findOpeningTagEnd(text, start) {
  // start aponta para o '<' da tag. Retorna o indice do '>' que fecha a abertura.
  let i = start + 1
  let depthBraces = 0
  let inString = null // " ou ' quando dentro de string
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') { i += 2; continue }
      if (ch === inString) inString = null
      i++
      continue
    }
    if (ch === '"' || ch === "'") { inString = ch; i++; continue }
    if (ch === '{') { depthBraces++; i++; continue }
    if (ch === '}') { depthBraces--; i++; continue }
    if (ch === '>' && depthBraces === 0) return i
    i++
  }
  return -1
}

function processText(text) {
  let changes = 0
  let out = ''
  let i = 0
  const labelOpenRe = /<label\b[^>]*?className="form-label"[^>]*>/

  while (i < text.length) {
    const remainder = text.slice(i)
    const m = labelOpenRe.exec(remainder)
    if (!m) {
      out += remainder
      break
    }
    const labelStart = i + m.index
    out += text.slice(i, labelStart)
    // Localiza fechamento '>' da tag <label ...>
    const labelOpenEnd = findOpeningTagEnd(text, labelStart)
    if (labelOpenEnd === -1) { out += text.slice(labelStart); break }
    // Localiza </label>
    const labelCloseStart = text.indexOf('</label>', labelOpenEnd)
    if (labelCloseStart === -1) { out += text.slice(labelStart); break }
    const labelInner = text.slice(labelOpenEnd + 1, labelCloseStart)
    const labelOpenTag = text.slice(labelStart, labelOpenEnd + 1)
    out += labelOpenTag + labelInner + '</label>'
    let j = labelCloseStart + '</label>'.length

    // Procura proxima tag de form (input/textarea/select) ou outra <label className="form-label">.
    const tail = text.slice(j)
    const nextLabelRe = /<label\b[^>]*?className="form-label"/
    const nextFormRe = /<(input|textarea|select)\b/
    const nl = nextLabelRe.exec(tail)
    const nf = nextFormRe.exec(tail)
    if (!nf) {
      out += tail
      break
    }
    if (nl && nl.index < nf.index) {
      // Outra label do tipo form-label aparece antes do proximo form-element —
      // o input atual nao esta vinculado a esta label, pula sem injetar e continua.
      out += text.slice(j, j + nl.index)
      i = j + nl.index
      continue
    }
    // tail[nf.index] aponta para '<' da tag.
    const formStart = j + nf.index
    out += text.slice(j, formStart)

    // Texto da label com tags removidas e whitespace colapsado.
    const cleanLabel = labelInner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    const formOpenEnd = findOpeningTagEnd(text, formStart)
    if (formOpenEnd === -1) { out += text.slice(formStart); break }
    const formOpenTag = text.slice(formStart, formOpenEnd + 1)

    const hasAriaLabel = /\baria-label\s*=/.test(formOpenTag)
    const hasAriaLabelledBy = /\baria-labelledby\s*=/.test(formOpenTag)
    if (!hasAriaLabel && !hasAriaLabelledBy && cleanLabel.length > 0) {
      const safe = cleanLabel.replace(/"/g, '&quot;')
      // Injeta aria-label imediatamente apos o nome da tag.
      const tagNameMatch = /^<(input|textarea|select)\b/.exec(formOpenTag)
      if (tagNameMatch) {
        const insertAt = tagNameMatch[0].length // ex: '<input' = 6
        const newTag = formOpenTag.slice(0, insertAt) + ` aria-label="${safe}"` + formOpenTag.slice(insertAt)
        out += newTag
        changes++
      } else {
        out += formOpenTag
      }
    } else {
      out += formOpenTag
    }
    i = formOpenEnd + 1
  }

  return { text: out, changes }
}

function processFile(filePath) {
  const abs = path.resolve(filePath)
  if (!fs.existsSync(abs)) {
    console.log(`SKIP nao existe: ${filePath}`)
    return
  }
  const before = fs.readFileSync(abs, 'utf-8')
  const { text: after, changes } = processText(before)
  if (changes === 0) {
    console.log(`OK 0 mudancas: ${filePath}`)
    return
  }
  fs.writeFileSync(abs, after, 'utf-8')
  console.log(`OK ${changes} aria-label(s) injetada(s) em ${filePath}`)
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('Uso: node scripts/fix-a11y-labels.js arquivo1.js [arquivo2.js ...]')
  process.exit(0)
}
for (const a of args) processFile(a)

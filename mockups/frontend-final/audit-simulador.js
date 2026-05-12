// audit-simulador.js — checagens estáticas no simulador.html gerado
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'simulador.html'), 'utf8');

let problems = 0;
function ok(msg) { console.log('  ✓ ' + msg); }
function warn(msg) { console.log('  ⚠ ' + msg); problems++; }
function fail(msg) { console.log('  ✗ ' + msg); problems++; }

// ─── 1. mojibakes ───────────────────────────────────────────
console.log('\n[1] mojibake check');
const mojiPatterns = [
  /ðŸ/g,             // emoji quebrado
  /â€[œ™˜¦]/g,       // aspas/dashes quebrados
  /Ã[©¡£ªºç]/g,     // letras acentuadas duplo-encoded — mas Ã + vogal é OK em pt-BR
  /Â[¬®¯´µ¶·¸¹»¼½¾¿]/g, // controles
];
const labels = ['ðŸ (emojis quebrados)', 'â€ (aspas/dashes)', 'Ã[©¡£...] (latim)', 'Â[¬®...] (controle)'];
for (let i = 0; i < mojiPatterns.length; i++) {
  const matches = html.match(mojiPatterns[i]) || [];
  if (matches.length > 0) {
    fail('encontrou ' + matches.length + ' x ' + labels[i] + ': ' + JSON.stringify(matches.slice(0, 3)));
  } else {
    ok('sem ' + labels[i]);
  }
}

// ─── 2. sections vazias ─────────────────────────────────────
console.log('\n[2] sections sem conteúdo');
const sectionRe = /<section class="sim-screen" data-route="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g;
let m, count = 0, empty = 0;
const sections = [];
while ((m = sectionRe.exec(html)) !== null) {
  count++;
  const route = m[1];
  const body = m[2];
  if (route === '__404') continue;
  const hasDesktop = /<div class="view-desktop[^"]*">/.test(body);
  const hasMobile = /<div class="view-mobile[^"]*">/.test(body);
  const innerLen = body.replace(/\s+/g, '').length;
  sections.push({ route, hasDesktop, hasMobile, innerLen });
  if (!hasDesktop && !hasMobile) {
    fail('section sem view-desktop nem view-mobile: ' + route);
    empty++;
  } else if (innerLen < 500) {
    warn('section pequena (' + innerLen + ' chars): ' + route);
  }
}
ok(count + ' sections totais (incluindo __404); ' + (count - 1) + ' rotas + fallback');
if (empty === 0) ok('nenhuma section vazia');

// ─── 3. data-screen-label coerentes ─────────────────────────
console.log('\n[3] data-screen-label');
const labelMatches = html.match(/data-screen-label="([^"]+)"/g) || [];
ok(labelMatches.length + ' data-screen-label presentes no simulador');
// labels duplicados não são problema — cada section pode ter um desktop e um mobile com labels distintos

// ─── 4. links órfãos (#/algum-hash que não existe) ──────────
console.log('\n[4] links internos (href="#/...") apontam pra rotas existentes');
const sectionRoutes = new Set(sections.map(s => s.route));
sectionRoutes.add('/');
sectionRoutes.add('__404');
const hashLinks = [...html.matchAll(/href="#(\/[^"]*)"/g)].map(m => m[1]);
const uniqueHashLinks = [...new Set(hashLinks)];
const broken = uniqueHashLinks.filter(h => !sectionRoutes.has(h));
if (broken.length === 0) ok('todos href="#/..." apontam pra rotas existentes (' + uniqueHashLinks.length + ' únicos)');
else warn('links href="#..." sem rota: ' + broken.slice(0, 10).join(', '));

// ─── 5. estilos internos preservados ────────────────────────
console.log('\n[5] estilos internos');
const styleBlocks = (html.match(/<style>[\s\S]*?<\/style>/g) || []).length;
ok(styleBlocks + ' blocos <style> (esperado 4: público + cliente + admin + simulador)');
if (styleBlocks !== 4) warn('esperava 4 blocos <style>, achei ' + styleBlocks);

// ─── 6. JS lib carregado ────────────────────────────────────
console.log('\n[6] dependências externas');
if (html.includes('href="tokens.css"')) ok('tokens.css linked');
else fail('tokens.css NÃO linked');
if (html.includes('href="shared.css"')) ok('shared.css linked');
else fail('shared.css NÃO linked');
if (html.includes('src="app.js"')) ok('app.js linked');
else fail('app.js NÃO linked');

// ─── 7. SVG logo defs presentes ─────────────────────────────
console.log('\n[7] SVG logo defs');
const symbolIds = ['vs-symbol', 'nav-logo-h', 'nav-logo-h-edt', 'nav-logo-h-esp', 'nav-logo-h-nat', 'vs-logo-square'];
for (const id of symbolIds) {
  if (html.includes('id="' + id + '"')) ok('symbol #' + id);
  else warn('symbol #' + id + ' AUSENTE');
}

// ─── 8. viewport switcher presente ──────────────────────────
console.log('\n[8] viewport switcher');
if (html.includes('id="vpAuto"') && html.includes('id="vpDesktop"') && html.includes('id="vpMobile"')) {
  ok('3 botões do viewport switcher presentes');
} else fail('viewport switcher incompleto');
if (html.includes('sim-force-mobile') && html.includes('sim-force-desktop')) ok('CSS de force-mobile/force-desktop presente');
else fail('CSS de force viewport AUSENTE');

// ─── 9. cobertura: cada rota tem pelo menos 1 view ──────────
console.log('\n[9] cobertura desktop/mobile');
const bothCount = sections.filter(s => s.hasDesktop && s.hasMobile).length;
const dOnly = sections.filter(s => s.hasDesktop && !s.hasMobile).length;
const mOnly = sections.filter(s => !s.hasDesktop && s.hasMobile).length;
ok(bothCount + ' rotas com par desktop+mobile · ' + dOnly + ' só desktop · ' + mOnly + ' só mobile');

// ─── 10. tamanho ────────────────────────────────────────────
console.log('\n[10] tamanho do arquivo');
const kb = (html.length / 1024).toFixed(1);
ok('simulador.html: ' + kb + ' KB');

// ─── final ──────────────────────────────────────────────────
console.log('\n— resultado: ' + (problems === 0 ? 'OK · 0 problemas' : problems + ' problema(s) encontrados'));
process.exit(problems > 0 ? 1 : 0);

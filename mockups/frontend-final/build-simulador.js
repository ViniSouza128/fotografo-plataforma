// build-simulador.js
// Lê os 3 mockups, extrai cada .frame/.phone com data-screen-label
// via parsing balanceado de tags, gera simulador.html final.
// Uso: node build-simulador.js
//
// Manter este script no projeto — re-rodar quando os mockups mudarem.
// (Não vai pro repo GH Pages.)

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'simulador.html');

// ─── mapeamento label → rota ───
// Cada entrada vale tanto pra desktop (frame) quanto pra mobile (phone).
// O kind (desktop/mobile) é decidido pelo tipo do bloco extraído (frame vs phone).
// Labels com sufixo " Mobile" são strip-ados pra match a entrada base.
const routeMap = {
  // PÚBLICO
  'Public · Home Desktop':                                { route: '/',                     mode: 'public' },
  'Public · Event Gallery':                               { route: '/evento/safra-2026',    mode: 'public' },
  'Public · Lightbox Foto':                               { route: '/foto/safra-2026/0421', mode: 'public' },
  'Public · Lightbox Vídeo':                              { route: '/video/safra-2026/v07', mode: 'public' },
  'Public · Cart Review':                                 { route: '/carrinho',             mode: 'public' },
  'Public · Checkout Desktop':                            { route: '/checkout',             mode: 'public' },
  'Public · Confirmation':                                { route: '/checkout/confirmado',  mode: 'public' },
  'Public · Compras Guest':                               { route: '/compras-guest',        mode: 'public' },
  'Public · Login':                                       { route: '/login',                mode: 'public' },
  'Public · Cadastro':                                    { route: '/cadastro',             mode: 'public' },
  'Public · Trocar Senha':                                { route: '/recuperar-senha',      mode: 'public' },
  'Public · Contato':                                     { route: '/contato',              mode: 'public' },
  'Public · Autenticidade':                               { route: '/autenticidade',        mode: 'public' },
  'Public · Termos':                                      { route: '/termos',               mode: 'public' },
  'Public · Privacidade':                                 { route: '/privacidade',          mode: 'public' },
  'Public · Cookies':                                     { route: '/cookies',              mode: 'public' },
  'Public · 404':                                         { route: '/404',                  mode: 'public' },
  'Public · Carrinho Vazio':                              { route: '/carrinho-vazio',       mode: 'public' },
  'Public · Checkout PIX Aguardando':                     { route: '/checkout/pix',         mode: 'public' },
  'Public · Checkout Boleto Gerado':                      { route: '/checkout/boleto',      mode: 'public' },
  'Public · Checkout Pagamento Recusado':                 { route: '/checkout/recusado',    mode: 'public' },
  'Public · Evento Sem Fotos':                            { route: '/evento-sem-fotos',     mode: 'public' },
  'Public · Evento Privado':                              { route: '/evento-privado',       mode: 'public' },
  'Public · 500 Erro Servidor':                           { route: '/500',                  mode: 'public' },
  'Public · Manutenção':                                  { route: '/manutencao',           mode: 'public' },
  'Public · Galeria Busca Sem Resultado':                 { route: '/busca-sem-resultado',  mode: 'public' },
  'Public · Conta Bloqueada':                             { route: '/conta-bloqueada',      mode: 'public' },
  'Public · Cadastro Sucesso':                            { route: '/cadastro-sucesso',     mode: 'public' },

  // CLIENTE
  'Cliente · Dashboard Desktop':                          { route: '/cliente',                          mode: 'cliente' },
  'Cliente · Compras':                                    { route: '/cliente/compras',                  mode: 'cliente' },
  'Cliente · Detalhe Compra':                             { route: '/cliente/compras/123',              mode: 'cliente' },
  'Cliente · Carrinho':                                   { route: '/cliente/carrinho',                 mode: 'cliente' },
  'Cliente · Favoritos':                                  { route: '/cliente/favoritos',                mode: 'cliente' },
  'Cliente · Comentários':                                { route: '/cliente/comentarios',              mode: 'cliente' },
  'Cliente · Remoções LGPD':                              { route: '/cliente/remocoes',                 mode: 'cliente' },
  'Cliente · Notificações':                               { route: '/cliente/notificacoes',             mode: 'cliente' },
  'Cliente · Chat':                                       { route: '/cliente/chat',                     mode: 'cliente' },
  'Cliente · Reconhecimento':                             { route: '/cliente/reconhecimento',           mode: 'cliente' },
  'Cliente · Configurações':                              { route: '/cliente/configuracoes',            mode: 'cliente' },
  'Cliente · Recompensas':                                { route: '/cliente/recompensas',              mode: 'cliente' },
  'Cliente · Compras Vazio':                              { route: '/cliente/compras-vazio',            mode: 'cliente' },
  'Cliente · Favoritos Vazio':                            { route: '/cliente/favoritos-vazio',          mode: 'cliente' },
  'Cliente · Notificações Vazio':                         { route: '/cliente/notificacoes-vazio',       mode: 'cliente' },
  'Cliente · Detalhe Compra · Reembolso':                 { route: '/cliente/compras/124-reembolso',    mode: 'cliente' },
  'Cliente · Reconhecimento Pre-Consent':                 { route: '/cliente/reconhecimento-consent',   mode: 'cliente' },
  'Cliente · Comentários Vazio':                          { route: '/cliente/comentarios-vazio',        mode: 'cliente' },
  'Cliente · Downloads Expirando':                        { route: '/cliente/downloads-expirando',      mode: 'cliente' },
  'Cliente · Reconhecimento Sem Referências':             { route: '/cliente/reconhecimento-vazio',     mode: 'cliente' },
  'Cliente · Sessão Expirada':                            { route: '/cliente/sessao-expirada',          mode: 'cliente' },

  // ADMIN
  'Admin · Dashboard':                                    { route: '/admin',                            mode: 'admin' },
  'Admin · Estatísticas':                                 { route: '/admin/estatisticas',               mode: 'admin' },
  'Admin · Eventos':                                      { route: '/admin/eventos',                    mode: 'admin' },
  'Admin · Detalhe Evento':                               { route: '/admin/eventos/123',                mode: 'admin' },
  'Admin · Detalhe Evento (Vídeos)':                      { route: '/admin/eventos/123-videos',         mode: 'admin' },
  'Admin · Detalhe Evento (Patrocinadores)':              { route: '/admin/eventos/123-patrocinadores', mode: 'admin' },
  'Admin · Criar Evento':                                 { route: '/admin/eventos/novo',               mode: 'admin' },
  'Admin · Upload Fotos':                                 { route: '/admin/eventos/123-upload',         mode: 'admin' },
  'Admin · Pedidos':                                      { route: '/admin/pedidos',                    mode: 'admin' },
  'Admin · Carrinhos':                                    { route: '/admin/carrinhos',                  mode: 'admin' },
  'Admin · Cupons':                                       { route: '/admin/cupons',                     mode: 'admin' },
  'Admin · Propostas':                                    { route: '/admin/propostas',                  mode: 'admin' },
  'Admin · Repasses':                                     { route: '/admin/repasses',                   mode: 'admin' },
  'Admin · Clientes':                                     { route: '/admin/clientes',                   mode: 'admin' },
  'Admin · Colaboradores':                                { route: '/admin/colaboradores',              mode: 'admin' },
  'Admin · Chat':                                         { route: '/admin/chat',                       mode: 'admin' },
  'Admin · Comentários':                                  { route: '/admin/comentarios',                mode: 'admin' },
  'Admin · Contatos':                                     { route: '/admin/contatos',                   mode: 'admin' },
  'Admin · Remoções':                                     { route: '/admin/remocoes',                   mode: 'admin' },
  "Admin · Marca d'água":                                 { route: '/admin/marca-dagua',                mode: 'admin' },
  'Admin · Personalizar':                                 { route: '/admin/personalizar',               mode: 'admin' },
  'Admin · Configurações':                                { route: '/admin/configuracoes',              mode: 'admin' },
  'Admin · Notificações':                                 { route: '/admin/notificacoes',               mode: 'admin' },
  'Admin · Reconhecimento':                               { route: '/admin/reconhecimento',             mode: 'admin' },
  'Admin · Reset':                                        { route: '/admin/reset',                      mode: 'admin' },
  'Admin · Recompensas':                                  { route: '/admin/recompensas',                mode: 'admin' },
  'Admin · Storage':                                      { route: '/admin/storage',                    mode: 'admin' },
  'Admin · Logs & auditoria':                             { route: '/admin/logs',                       mode: 'admin' },
  'Admin · Fila de Jobs':                                 { route: '/admin/jobs',                       mode: 'admin' },
  'Admin · Evento Sem Fotos':                             { route: '/admin/eventos-sem-fotos',          mode: 'admin' },
  'Admin · Dashboard Vazio':                              { route: '/admin/dashboard-vazio',            mode: 'admin' },
  'Admin · 403 Sem Permissão':                            { route: '/admin/403',                        mode: 'admin' },
  'Admin · Pedido com Reembolso':                         { route: '/admin/pedidos/reembolso',          mode: 'admin' },
  'Admin · Comentário em Moderação':                      { route: '/admin/comentarios/moderacao',      mode: 'admin' },

  // descartado: 'Admin · Toasts (referência)' — referência de design, sem rota
};

function lookupRoute(label) {
  if (routeMap[label]) return routeMap[label];
  // remove sufixo " Mobile" se houver
  if (label.endsWith(' Mobile')) {
    const base = label.replace(/ Mobile$/, '');
    if (routeMap[base]) return routeMap[base];
  }
  return null;
}

// ─── extrai conteúdo de uma <div> com tag balance ───
function extractBalanced(html, startIdx, openLength) {
  const afterOpen = startIdx + openLength;
  let depth = 1;
  let i = afterOpen;
  while (i < html.length && depth > 0) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      if (end < 0) { i = html.length; break; }
      i = end + 3;
      continue;
    }
    if (html.startsWith('<div', i) && /[\s>]/.test(html[i + 4] || '')) {
      depth++;
      i += 4;
      continue;
    }
    if (html.startsWith('</div>', i)) {
      depth--;
      i += 6;
      if (depth === 0) break;
      continue;
    }
    i++;
  }
  if (depth !== 0) return null;
  return { innerStart: afterOpen, innerEnd: i - 6, inner: html.slice(afterOpen, i - 6) };
}

// ─── extrai blocos frame/phone (labeled e phones unlabel-ados associados) ───
function extractScreens(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const blocks = [];

  // 1. blocos com data-screen-label (frame OU phone com label)
  const labeledRe = /<div\s+([^>]*?)data-screen-label="([^"]+)"([^>]*?)>/g;
  let m;
  while ((m = labeledRe.exec(html)) !== null) {
    const attrs = (m[1] || '') + ' ' + (m[3] || '');
    const label = decodeHtml(m[2]);
    const isFrame = /\bclass="[^"]*\bframe\b[^"]*"/.test(attrs);
    const isPhone = /\bclass="[^"]*\bphone\b[^"]*"/.test(attrs);
    if (!isFrame && !isPhone) continue;
    const block = extractBalanced(html, m.index, m[0].length);
    if (!block) { console.error('  ⚠ unmatched <div> for label:', label); continue; }
    const className = (attrs.match(/class="([^"]*)"/) || [, isFrame ? 'frame' : 'phone'])[1];
    blocks.push({
      offset: m.index,
      label,
      kind: isFrame ? 'frame' : 'phone',
      class: className,
      inner: block.inner,
      labeled: true,
    });
  }

  // 2. <div class="phone"> SEM data-screen-label
  const phoneRe = /<div\s+class="phone"\s*>/g;
  while ((m = phoneRe.exec(html)) !== null) {
    // garante que essa abertura não tem data-screen-label
    const block = extractBalanced(html, m.index, m[0].length);
    if (!block) continue;
    blocks.push({
      offset: m.index,
      label: null,
      kind: 'phone',
      class: 'phone',
      inner: block.inner,
      labeled: false,
    });
  }

  // ordena por offset
  blocks.sort((a, b) => a.offset - b.offset);

  // associa phones sem label ao último frame com label antes dele
  let lastFrameLabel = null;
  for (const b of blocks) {
    if (b.kind === 'frame' && b.labeled) {
      lastFrameLabel = b.label;
    } else if (b.kind === 'phone' && !b.labeled) {
      if (lastFrameLabel) {
        b.label = lastFrameLabel;
        b.inferred = true;
      }
    }
  }

  return blocks.filter(b => b.label); // descarta phones que não acharam frame antes
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractInlineStyle(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const m = html.match(/<head[\s\S]*?<style>([\s\S]*?)<\/style>/);
  return m ? m[1].trim() : '';
}

function readLogoDefs() {
  return fs.readFileSync(path.join(DIR, 'logo-defs.html'), 'utf8');
}

// Extrai o primeiro <svg width="0" height="0" ...> (SVG defs) do mockup.
// Cada mockup tem seu próprio com symbols únicos (i-cart, qr-pix-svg, etc.).
function extractSvgDefs(filePath, prefix) {
  const html = fs.readFileSync(filePath, 'utf8');
  const m = html.match(/<svg\s+width="0"\s+height="0"[^>]*>([\s\S]*?)<\/svg>/);
  if (!m) return '';
  return `<!-- defs from ${prefix} -->\n<svg width="0" height="0" style="position:absolute" aria-hidden="true">${m[1]}</svg>`;
}

// Biblioteca de ícones — paths Lucide (https://lucide.dev, MIT). Cada ícone fica
// como <symbol id="sim-i-NAME"> no DOM, usável via <svg><use href="#sim-i-NAME"/></svg>.
// O JS do simulador faz match por texto e substitui SVG inline existente nas sidebars/nav.
function buildIconSprite() {
  const ICONS = {
    'home':            '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'shopping-bag':    '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    'shopping-cart':   '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    'bookmark':        '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    'message-square':  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    'shield-off':      '<path d="M19.69 14a6.9 6.9 0 0 0 .31-2V5l-8-3-3.16 1.18"/><path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 0 0 5.62-4.38"/><line x1="1" y1="1" x2="23" y2="23"/>',
    'bell':            '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    'message-circle':  '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    'scan-face':       '<path d="M4 7V5a2 2 0 0 1 2-2h2"/><path d="M16 3h2a2 2 0 0 1 2 2v2"/><path d="M4 17v2a2 2 0 0 0 2 2h2"/><path d="M16 21h2a2 2 0 0 0 2-2v-2"/><path d="M9 10v.01"/><path d="M15 10v.01"/><path d="M9.5 15a3.5 3.5 0 0 0 5 0"/>',
    'settings':        '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    'log-out':         '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    'log-in':          '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
    'gift':            '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    'download':        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    'clock':           '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'layout-dashboard':'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    'bar-chart-2':     '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    'folder':          '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    'plus':            '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    'upload':          '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    'package':         '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    'users':           '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'user-cog':        '<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m19.1 12.2.3-.9"/><path d="m19.6 18.7-.4-1"/><path d="m16.8 12.3-.4-1"/><path d="m14.3 16.6 1-.4"/><path d="m20.7 13.8 1-.4"/>',
    'ticket':          '<path d="M3 7v2a3 3 0 1 1 0 6v2c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    'file-text':       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
    'scale':           '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    'image':           '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    'palette':         '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    'sliders':         '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    'rotate-ccw':      '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    'database':        '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    'list':            '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    'briefcase':       '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    'mail':            '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    'star':            '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    'video':           '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    'phone':           '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    'instagram':       '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.5" y2="6.5"/>',
    'search':          '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    'menu':            '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    'x':               '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    'check':           '<polyline points="20 6 9 17 4 12"/>',
    'eye':             '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off':         '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    'chevron-right':   '<polyline points="9 18 15 12 9 6"/>',
    'chevron-left':    '<polyline points="15 18 9 12 15 6"/>',
    'arrow-right':     '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    'arrow-left':      '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    'help-circle':     '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'lock':            '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    'alert-triangle':  '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    'trending-up':     '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  };
  let out = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">';
  out += '<!-- icon library (Lucide MIT) — used via <use href="#sim-i-NAME"/> -->';
  for (const [name, paths] of Object.entries(ICONS)) {
    out += `<symbol id="sim-i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</symbol>`;
  }
  out += '</svg>';
  return out;
}

// ============================================================
// SIDEBAR CANÔNICA + EVENT DETAIL ENRICH — defs NODE-SIDE
// ============================================================
// ─── SIDEBAR CANÔNICA: garante consistência total entre páginas ──
// Cada item tem { text, route, badge?, lblGroup }. Renderizada por buildSidebarHTML().
const CLIENT_SIDEBAR = [
  { group: 'Minha conta' },
  { text: 'Início', route: '/cliente' },
  { text: 'Compras', route: '/cliente/compras', badge: { type: 'paid', count: 12 } },
  { text: 'Carrinho', route: '/cliente/carrinho', badge: { type: 'info', count: 2 } },
  { text: 'Salvos & curtidas', route: '/cliente/favoritos' },
  { text: 'Comentários', route: '/cliente/comentarios' },
  { text: 'Remoções LGPD', route: '/cliente/remocoes' },
  { group: 'Atalhos' },
  { text: 'Notificações', route: '/cliente/notificacoes', badge: { type: 'info', count: 3 } },
  { text: 'Chat', route: '/cliente/chat' },
  { text: 'Reconhecimento', route: '/cliente/reconhecimento', badge: { type: 'info', text: 'beta' } },
  { group: 'Conta' },
  { text: 'Configurações', route: '/cliente/configuracoes' },
];

const ADMIN_SIDEBAR = [
  { group: 'Visão' },
  { text: 'Dashboard', route: '/admin' },
  { text: 'Estatísticas', route: '/admin/estatisticas' },
  { group: 'Conteúdo' },
  { text: 'Eventos / Álbuns', route: '/admin/eventos', badge: { type: 'info', count: 142 } },
  { text: 'Criar evento', route: '/admin/eventos/novo' },
  { text: 'Upload de fotos', route: '/admin/eventos/123-upload' },
  { group: 'Vendas' },
  { text: 'Pedidos', route: '/admin/pedidos', badge: { type: 'pend', count: 3 } },
  { text: 'Carrinhos abertos', route: '/admin/carrinhos', badge: { type: 'info', count: 9 } },
  { text: 'Cupons', route: '/admin/cupons' },
  { text: 'Propostas', route: '/admin/propostas', badge: { type: 'info', count: 2 } },
  { text: 'Repasses', route: '/admin/repasses' },
  { group: 'Pessoas' },
  { text: 'Clientes', route: '/admin/clientes' },
  { text: 'Colaboradores', route: '/admin/colaboradores' },
  { text: 'Chat', route: '/admin/chat', badge: { type: 'info', count: 2 } },
  { group: 'Moderação' },
  { text: 'Comentários', route: '/admin/comentarios', badge: { type: 'pend', count: 5 } },
  { text: 'Contatos', route: '/admin/contatos', badge: { type: 'pend', count: 3 } },
  { text: 'Remoções LGPD', route: '/admin/remocoes', badge: { type: 'pend', count: 1 } },
  { group: 'Sistema' },
  { text: "Marca d'água", route: '/admin/marca-dagua' },
  { text: 'Personalizar', route: '/admin/personalizar' },
  { text: 'Configurações', route: '/admin/configuracoes' },
  { text: 'Storage', route: '/admin/storage' },
  { text: 'Recompensas', route: '/admin/recompensas' },
  { text: 'Logs & auditoria', route: '/admin/logs' },
  { text: 'Notificações', route: '/admin/notificacoes' },
  { text: 'Reconhecimento', route: '/admin/reconhecimento' },
  { text: 'Reset', route: '/admin/reset' },
];

function renderSidebarItems(items) {
  let html = '';
  for (const it of items) {
    if (it.group) {
      html += '<div class="lbl">' + escapeHtml(it.group) + '</div>';
      continue;
    }
    let badge = '';
    if (it.badge) {
      const cls = it.badge.type === 'paid' ? 'b-paid'
                : it.badge.type === 'pend' ? 'b-pend'
                : 'b-info';
      const label = it.badge.text || String(it.badge.count);
      badge = '<span class="badge ' + cls + '">' + escapeHtml(label) + '</span>';
    }
    html += '<a data-sim-route="' + escAttr(it.route) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>'
         + escapeHtml(it.text) + badge + '</a>';
  }
  return html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ============================================================
// MOBILE TEMPLATES — versão mobile dedicada pras 27 rotas só-desktop
// ============================================================

// Topbar mobile padrão (publico): logo + menu hamburger + cart
function mobPubTopbar(title) {
  return `<div class="m-status"><span>9:41</span><span class="right">●●●●●  100%</span></div>
  <div class="m-topbar">
    <a class="m-logo"><svg class="nav-logo compact"><use href="#nav-logo-h"/></svg></a>
    <button class="m-burger" type="button" data-drawer-open="mDrawerSim" aria-label="Menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-menu"/></svg></button>
  </div>
  ${title ? '<div class="m-crumb">' + escapeHtml(title) + '</div>' : ''}`;
}

// Topbar mobile padrão (admin): brand-pill + drawer trigger
function mobAdmTopbar(crumbHere) {
  return `<div class="m-status"><span>9:41</span><span class="right">●●●●●  100%</span></div>
  <div class="m-adm-topbar">
    <div class="brand-pill"><svg class="nav-logo"><use href="#nav-logo-h"/></svg><span class="role">Painel</span></div>
    <div class="right">
      <div class="bell"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-bell"/></svg><span class="pip"></span></div>
      <button class="burger" type="button" data-drawer-open="mDrawerSim" aria-label="Menu"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-menu"/></svg></button>
    </div>
  </div>
  <div class="m-adm-crumbs"><span>Painel</span><span class="sep">/</span><span class="here">${escapeHtml(crumbHere)}</span></div>`;
}

// Topbar mobile padrão (cliente)
function mobAccTopbar(title) {
  return `<div class="m-status"><span>9:41</span><span class="right">●●●●●  100%</span></div>
  <div class="m-acc-topbar">
    <button class="burger" type="button" data-drawer-open="mDrawerSim" aria-label="Menu"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-menu"/></svg></button>
    <div class="title">${escapeHtml(title)}</div>
    <div class="avatar"><img src="https://i.pravatar.cc/60?img=12" alt="" loading="lazy"></div>
  </div>`;
}

// Empty/error state mobile
function mobEmptyState(icon, title, msg, btnText, btnRoute, color) {
  const c = color || 'var(--ink-700)';
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px 24px;min-height:60vh;gap:12px;">
    <div style="width:72px;height:72px;border-radius:50%;background:${color === 'signal' ? 'rgba(34,197,94,.15)' : color === 'warn' ? 'rgba(232,163,58,.15)' : color === 'danger' ? 'rgba(232,68,68,.15)' : 'var(--ink-300)'};display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="${color === 'signal' ? 'var(--signal-500)' : color === 'warn' ? 'var(--warning-500)' : color === 'danger' ? 'var(--danger-500, #e84444)' : 'var(--ink-800)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#sim-i-${icon}"/></svg>
    </div>
    <h2 style="font-family:var(--font-heading);font-size:22px;font-weight:500;margin:8px 0 0;color:var(--ink-1000);">${escapeHtml(title)}</h2>
    <p style="font-size:14px;color:var(--ink-800);line-height:1.5;margin:0;max-width:300px;">${msg}</p>
    ${btnText ? '<button class="btn primary" data-sim-route="' + escAttr(btnRoute) + '" style="margin-top:8px;">' + escapeHtml(btnText) + '</button>' : ''}
  </div>`;
}

// Form field mobile
function mobField(label, type, value, opts) {
  if (type === 'select') {
    return `<div class="field"><label>${escapeHtml(label)}</label><select>${(opts || []).map(o => '<option>' + escapeHtml(o) + '</option>').join('')}</select></div>`;
  }
  if (type === 'textarea') {
    return `<div class="field"><label>${escapeHtml(label)}</label><textarea rows="3">${escapeHtml(value || '')}</textarea></div>`;
  }
  return `<div class="field"><label>${escapeHtml(label)}</label><input type="${type}" ${value ? 'value="' + escAttr(value) + '"' : ''}/></div>`;
}

// HTML mobile específico pra cada rota só-desktop.
function buildMobileTemplates() {
  const T = {};

  // ─── PÚBLICAS — AUTH ────────────────────────────────────────
  T['/login'] = mobPubTopbar('Entrar') + `
    <div style="padding: 28px 22px;">
      <h2 style="font-family:var(--font-display);font-style:italic;font-size:28px;margin:0 0 8px;">Entrar</h2>
      <p style="color:var(--ink-800);font-size:13px;margin:0 0 24px;">Acesse com seu e-mail e senha.</p>
      <form>
        ${mobField('E-mail', 'email', 'lucas@gmail.com')}
        ${mobField('Senha', 'password', '••••••••••')}
        <button class="btn primary full-btn" style="width:100%;margin-top:12px;">Entrar</button>
        <a class="lnk" style="display:block;text-align:center;margin-top:12px;font-size:13px;">Esqueceu a senha?</a>
        <div style="text-align:center;font-size:13px;color:var(--ink-800);margin-top:18px;">Novo aqui? <a class="lnk" data-sim-route="/cadastro">Criar conta</a></div>
      </form>
    </div>`;

  T['/cadastro'] = mobPubTopbar('Criar conta') + `
    <div style="padding: 28px 22px;">
      <h2 style="font-family:var(--font-display);font-style:italic;font-size:28px;margin:0 0 8px;">Criar conta</h2>
      <p style="color:var(--ink-800);font-size:13px;margin:0 0 24px;">Use o mesmo e-mail do evento.</p>
      <form>
        ${mobField('Nome completo', 'text')}
        ${mobField('E-mail', 'email')}
        ${mobField('WhatsApp', 'tel', '(64) 9____-____')}
        ${mobField('Senha', 'password')}
        ${mobField('Confirmar senha', 'password')}
        <button class="btn primary full-btn" style="width:100%;margin-top:12px;">Criar conta</button>
        <div style="text-align:center;font-size:13px;color:var(--ink-800);margin-top:18px;">Já tem conta? <a class="lnk" data-sim-route="/login">Entrar</a></div>
      </form>
    </div>`;

  T['/recuperar-senha'] = mobPubTopbar('Recuperar senha') + `
    <div style="padding: 28px 22px;">
      <h2 style="font-family:var(--font-display);font-style:italic;font-size:28px;margin:0 0 8px;">Esqueceu a senha?</h2>
      <p style="color:var(--ink-800);font-size:13px;margin:0 0 24px;">Te enviamos um link de recuperação pelo e-mail.</p>
      <form>
        ${mobField('E-mail cadastrado', 'email')}
        <button class="btn primary full-btn" style="width:100%;margin-top:12px;">Enviar link</button>
        <div style="text-align:center;font-size:13px;color:var(--ink-800);margin-top:18px;"><a class="lnk" data-sim-route="/login">← Voltar pro login</a></div>
      </form>
    </div>`;

  T['/cadastro-sucesso'] = mobPubTopbar('') + mobEmptyState('check', 'Conta criada!',
    'Te enviamos um e-mail de boas-vindas. Já pode entrar e ver suas fotos.',
    'Ir pra área do cliente', '/cliente', 'signal');

  T['/conta-bloqueada'] = mobPubTopbar('') + mobEmptyState('lock', 'Conta bloqueada',
    'Sua conta foi bloqueada por suspeita de uso indevido. Entre em contato com o suporte pra revisar.',
    'Falar com suporte', '/contato', 'danger');

  // ─── PÚBLICAS — LEGAIS ──────────────────────────────────────
  const legalBody = (title, sections) => `<div style="padding: 24px 22px 40px;">
    <h2 style="font-family:var(--font-display);font-style:italic;font-size:26px;margin:0 0 16px;">${escapeHtml(title)}</h2>
    ${sections.map(s => `<h3 style="font-size:13px;color:var(--ink-1000);margin:18px 0 6px;font-weight:500;">${escapeHtml(s.h)}</h3><p style="font-size:13px;line-height:1.6;color:var(--ink-900);margin:0 0 10px;">${escapeHtml(s.p)}</p>`).join('')}
    <div style="margin-top:24px;font-family:var(--font-mono);font-size:10.5px;color:var(--ink-700);">Versão de 17/04/2026 · vinicius@vss.fot</div>
  </div>`;

  T['/termos'] = mobPubTopbar('Termos de uso') + legalBody('Termos de uso', [
    { h: '1. Aceite', p: 'Ao usar este site você concorda com estes termos. Caso discorde, não utilize o serviço.' },
    { h: '2. Conteúdo', p: 'As fotos publicadas pertencem ao fotógrafo Vinícius Souza, autor da obra. A compra concede licença pessoal de uso digital.' },
    { h: '3. Pagamentos', p: 'PIX (Asaas), cartão (Stripe) e boleto (MercadoPago). Reembolso até 7 dias se a foto ainda não foi baixada.' },
    { h: '4. Privacidade', p: 'Veja nossa Política de Privacidade. Não compartilhamos seu e-mail.' },
    { h: '5. Foro', p: 'Itajá-GO, Comarca de Quirinópolis.' },
  ]);

  T['/privacidade'] = mobPubTopbar('Privacidade') + legalBody('Política de Privacidade', [
    { h: 'Dados coletados', p: 'Nome, e-mail, WhatsApp e foto de perfil (para reconhecimento facial, opt-in).' },
    { h: 'Uso dos dados', p: 'Identificar você como cliente e ligar sua compra à sua conta. Não vendemos dados.' },
    { h: 'Reconhecimento facial (LGPD)', p: 'Opt-in. Você pode pedir remoção a qualquer momento em /cliente/remocoes.' },
    { h: 'Backup', p: 'SQLite + R2 (Cloudflare). Cifrado em trânsito e em repouso.' },
    { h: 'Contato DPO', p: 'dpo@vinicius-souza.foto · resposta em até 7 dias.' },
  ]);

  T['/cookies'] = mobPubTopbar('Cookies') + legalBody('Política de Cookies', [
    { h: 'O que usamos', p: 'Apenas cookies funcionais: sessão de login, carrinho aberto, preferência de tema.' },
    { h: 'O que NÃO usamos', p: 'Sem cookies de rastreamento de terceiros. Sem Google Analytics. Sem Facebook Pixel.' },
    { h: 'Como desativar', p: 'Pelo próprio navegador você pode bloquear cookies, mas isso pode quebrar o login e carrinho.' },
  ]);

  T['/autenticidade'] = mobPubTopbar('Autenticidade') + `<div style="padding: 24px 22px 40px;">
    <h2 style="font-family:var(--font-display);font-style:italic;font-size:26px;margin:0 0 12px;">Autenticidade da foto</h2>
    <p style="font-size:13px;line-height:1.6;color:var(--ink-900);margin:0 0 14px;">Cada foto vendida tem certificado de autoria com hash SHA-256 do arquivo, data de captura (EXIF) e selo de aquisição vinculado ao seu CPF.</p>
    ${mobField('Verificar pelo hash', 'text', 'a3f1c92d8e...')}
    <button class="btn primary full-btn" style="width:100%;margin-top:12px;">Verificar autenticidade</button>
    <div style="margin-top:20px;padding:14px;background:var(--ink-200);border:1px solid var(--ink-500);border-radius:6px;font-size:12.5px;color:var(--ink-900);line-height:1.5;">
      <strong style="color:var(--brand-400);">✓ Aceito como prova jurídica</strong><br>O selo gera um JSON assinado que pode ser apresentado em juízo pra comprovar autoria da foto.
    </div>
  </div>`;

  // ─── CLIENTE — sessão expirada ──────────────────────────────
  T['/cliente/sessao-expirada'] = mobPubTopbar('') + mobEmptyState('clock',
    'Sua sessão expirou', 'Por segurança, você foi desconectado após 30 dias inativo. Entre de novo.',
    'Entrar de novo', '/login', 'warn');

  // ─── ADMIN — empty/error ────────────────────────────────────
  T['/admin/403'] = mobAdmTopbar('Acesso negado') + mobEmptyState('lock',
    '403 · Acesso restrito', 'Esta área é só pra administradores plenos. Como colaborador você não tem permissão. Fale com o fotógrafo.',
    'Voltar pro painel', '/admin', 'danger');

  T['/admin/dashboard-vazio'] = mobAdmTopbar('Dashboard') + mobEmptyState('image',
    'Sem dados ainda', 'Você ainda não criou nenhum evento. Comece por aí — cada evento vira uma galeria pra clientes comprarem fotos.',
    '+ Criar primeiro evento', '/admin/eventos/novo');

  T['/admin/eventos-sem-fotos'] = mobAdmTopbar('Evento') + mobEmptyState('upload',
    'Sem fotos ainda', 'O evento foi criado mas você ainda não fez upload das fotos. Faça upload pra liberar pra venda.',
    'Fazer upload agora', '/admin/eventos/123-upload');

  // ─── ADMIN — tabelas / listas (transformadas em cards mobile) ─
  const admListCard = (rows) => rows.map(r => `<div class="m-adm-card" style="padding: 14px 16px; border-bottom: 1px solid var(--ink-500); display:flex;justify-content:space-between;align-items:center;gap:12px;">
    <div style="flex:1;min-width:0;">
      <div style="font-size: 13.5px; color: var(--ink-1000); font-weight: 500;">${escapeHtml(r.title)}</div>
      <div style="font-size: 11px; color: var(--ink-700); font-family: var(--font-mono); letter-spacing:.04em; margin-top:4px;">${escapeHtml(r.meta)}</div>
    </div>
    <div style="text-align: right;flex-shrink:0;">${r.right || ''}</div>
  </div>`).join('');

  T['/admin/clientes'] = mobAdmTopbar('Clientes') + `<div style="padding: 14px 16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:8px;">
      <div><h2 style="margin:0;font-size:18px;font-weight:500;">87 clientes</h2><div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);">+9 ESTE MÊS</div></div>
      <button class="btn primary sm">+ Novo</button>
    </div>
    ${mobField('', 'search', '', null)}
  </div>
  ${admListCard([
    { title: 'Maria F. Silva', meta: '5 eventos · LTV R$ 642', right: '<span class="badge b-paid">VIP</span>' },
    { title: 'João M. Santos', meta: '3 eventos · LTV R$ 488', right: '' },
    { title: 'Ana L. Pereira', meta: '4 eventos · NOVA', right: '<span class="badge b-info">NOVA</span>' },
    { title: 'Patrícia S. Oliveira', meta: '6 eventos · LTV R$ 412', right: '' },
    { title: 'Roberto S. Lima', meta: '2 eventos · LTV R$ 184', right: '' },
    { title: 'Carolina F.', meta: '1 evento · LTV R$ 87', right: '' },
  ])}`;

  T['/admin/colaboradores'] = mobAdmTopbar('Colaboradores') + `<div style="padding: 14px 16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:8px;">
      <div><h2 style="margin:0;font-size:18px;font-weight:500;">3 colaboradores</h2><div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);">REPASSE TOTAL · 32%</div></div>
      <button class="btn primary sm">+ Convidar</button>
    </div>
  </div>
  ${admListCard([
    { title: 'Maria L. Souza', meta: 'Editor · 15% · 12 eventos', right: '<span class="badge b-paid">ATIVO</span>' },
    { title: 'Pedro A. Reis', meta: 'Assistente · 10% · 5 eventos', right: '<span class="badge b-paid">ATIVO</span>' },
    { title: 'Carla R. Mota', meta: 'Editor · 7% · 2 eventos', right: '<span class="badge">PAUSADO</span>' },
  ])}`;

  T['/admin/contatos'] = mobAdmTopbar('Contatos') + `<div style="padding: 14px 16px;">
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:500;">Contatos · 3 a responder</h2>
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);margin-bottom:14px;">28 RESPONDIDAS · ÚLT. 30 DIAS</div>
    <div style="display:flex;gap:6px;margin-bottom:12px;"><span class="chip active">Pendentes · 3</span><span class="chip">Respondidas · 28</span></div>
  </div>
  ${admListCard([
    { title: 'Caroline F.', meta: 'caroline@gmail.com · 14/04 · 18:32', right: '<span class="badge b-pend">URGENTE</span>' },
    { title: 'Bruno H.', meta: 'bruno@hotmail.com · 13/04 · 09:14', right: '<span class="badge b-pend">PENDENTE</span>' },
    { title: 'Ana M.', meta: 'ana@uol.com.br · 12/04 · 15:48', right: '<span class="badge b-pend">PENDENTE</span>' },
  ])}
  <div style="padding:14px 16px;font-size:13px;color:var(--ink-900);line-height:1.5;background:var(--ink-200);border-top:1px solid var(--ink-500);">
    <strong>"Preciso de orçamento para casamento em Belo Horizonte..."</strong><br>
    <span style="font-size:11.5px;color:var(--ink-700);">— Caroline F. · 14/04 · 18:32</span>
  </div>
  <div style="padding:14px 16px;display:flex;gap:8px;">
    <button class="btn primary sm" style="flex:1;">Responder</button>
    <button class="btn sm" style="flex:1;">→ Proposta</button>
  </div>`;

  T['/admin/comentarios'] = mobAdmTopbar('Comentários') + `<div style="padding: 14px 16px;">
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:500;">Comentários · 5 a moderar</h2>
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);margin-bottom:14px;">142 APROVADOS · 3 REJEITADOS</div>
    <div style="display:flex;gap:6px;margin-bottom:12px;"><span class="chip active">Pendentes · 5</span><span class="chip">Aprovados · 142</span><span class="chip">Rejeitados · 3</span></div>
  </div>
  ${admListCard([
    { title: '"Maravilhosa!! 😍😍😍"', meta: 'Maria F. · #142 · Safra 2026', right: '<button class="btn sm">Aprovar</button>' },
    { title: '"Tem como liberar o RAW?"', meta: 'João M. · #087 · Festival Pop', right: '<button class="btn sm">Aprovar</button>' },
    { title: '"Quanto seria pra impressão A3?"', meta: 'Ana L. · #221 · Meia Anápolis', right: '<button class="btn sm">Aprovar</button>' },
    { title: '"Foto 156 está com a cor verde"', meta: 'Patrícia S. · #156 · Safra 2026', right: '<button class="btn sm">Aprovar</button>' },
    { title: '"Quando libera o evento de jun?"', meta: 'Roberto S. · geral · 12/04', right: '<button class="btn sm">Aprovar</button>' },
  ])}`;

  T['/admin/comentarios/moderacao'] = mobAdmTopbar('Moderação') + `<div style="padding: 18px 16px;">
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);margin-bottom:10px;">COMENTÁRIO #142 · #001 SAFRA 2026 · 12/04 · 09:32</div>
    <div style="background:var(--ink-200);border:1px solid var(--ink-500);border-radius:6px;padding:14px;margin-bottom:14px;">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;">
        <div class="avatar" style="width:32px;height:32px;"><img src="https://i.pravatar.cc/60?img=5" alt="" loading="lazy"></div>
        <div><div style="font-weight:500;">Maria F. Silva</div><div style="font-size:11px;color:var(--ink-700);font-family:var(--font-mono);">VERIFICADA · 5 EVENTOS</div></div>
      </div>
      <p style="margin:0;font-size:14px;color:var(--ink-1000);line-height:1.5;">"Maravilhosa!! 😍😍😍 a melhor da galeria, com certeza vou imprimir essa em A2"</p>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn primary" style="flex:1;min-width:140px;">✓ Aprovar &amp; publicar</button>
      <button class="btn" style="flex:1;min-width:140px;">Rejeitar</button>
    </div>
    <button class="btn sm" style="width:100%;margin-top:8px;">Marcar como SPAM &amp; bloquear autor</button>
    <h3 style="margin: 24px 0 8px;font-size:13px;font-weight:500;">Timeline</h3>
    <div style="font-size:12px;color:var(--ink-800);line-height:1.7;">
      <div>12/04 09:32 · Comentário enviado</div>
      <div>12/04 09:33 · Detectado por filtro automático: OK (sem palavrão)</div>
      <div>12/04 09:35 · Adicionado à fila de moderação</div>
    </div>
  </div>`;

  T['/admin/carrinhos'] = mobAdmTopbar('Carrinhos abertos') + `<div style="padding: 14px 16px;">
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:500;">Carrinhos abertos · 9</h2>
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);margin-bottom:14px;">POTENCIAL R$ 1.142,00</div>
    <button class="btn primary" style="width:100%;margin-bottom:14px;">Enviar lembrete em massa</button>
  </div>
  ${admListCard([
    { title: 'Vinícius R.', meta: '4 fotos · há 26h · R$ 86,40', right: '<button class="btn sm" style="background: var(--tp-whatsapp); color: var(--ink-1000); border-color: transparent;">WA</button>' },
    { title: 'João M.', meta: '3 fotos + 1 vídeo · 2 dias · R$ 156,30', right: '<button class="btn sm" style="background: var(--tp-whatsapp); color: var(--ink-1000); border-color: transparent;">WA</button>' },
    { title: 'Ana L.', meta: '2 fotos · há 5h · R$ 57,60', right: '<button class="btn sm">⌛</button>' },
    { title: 'Patrícia S.', meta: '6 fotos · há 30 min · R$ 172,80', right: '<button class="btn sm">⌛</button>' },
    { title: 'Roberto S.', meta: '1 foto · 3 dias · R$ 28,80', right: '<button class="btn sm">Recuperar</button>' },
  ])}`;

  T['/admin/propostas'] = mobAdmTopbar('Propostas') + `<div style="padding: 14px 16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:8px;">
      <div><h2 style="margin:0;font-size:18px;font-weight:500;">Propostas · 2</h2><div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);">AGUARDANDO RESPOSTA</div></div>
      <button class="btn primary sm">+ Nova</button>
    </div>
  </div>
  ${admListCard([
    { title: 'Casamento Caroline F.', meta: 'BH · 15/09/26 · R$ 4.800', right: '<span class="badge b-info">ENVIADA</span>' },
    { title: 'Aniversário 50 anos · José', meta: 'GO · 22/06/26 · R$ 2.200', right: '<span class="badge b-pend">AGUARD.</span>' },
  ])}`;

  T['/admin/notificacoes'] = mobAdmTopbar('Notificações') + `<div style="padding: 14px 16px;">
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:500;">Notificações admin</h2>
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);margin-bottom:14px;">14 NÃO LIDAS · ALL</div>
    <div style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;"><span class="chip active">All · 14</span><span class="chip">Vendas · 5</span><span class="chip">Sistema · 3</span><span class="chip">Coment · 4</span><span class="chip">LGPD · 1</span></div>
  </div>
  ${admListCard([
    { title: 'Pagamento confirmado #200000039', meta: 'há 12 min · R$ 107,20 · PIX', right: '<span class="badge b-paid">VENDA</span>' },
    { title: 'Novo comentário em foto 142', meta: 'há 38 min · Safra 2026', right: '<span class="badge">MOD</span>' },
    { title: 'Solicitação LGPD · foto 087', meta: 'há 1h · prazo 5 dias úteis', right: '<span class="badge b-pend">LGPD</span>' },
    { title: 'Backup R2 completo', meta: 'há 2h · 412 GB · OK', right: '<span class="badge b-soft">SIS</span>' },
    { title: 'Cliente recuperou senha', meta: 'há 3h · ana@uol.com.br', right: '<span class="badge b-soft">SIS</span>' },
  ])}`;

  // ─── ADMIN — forms ──────────────────────────────────────────
  T['/admin/eventos/novo'] = mobAdmTopbar('Criar evento') + `<div style="padding: 20px 16px;">
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:500;">Criar evento</h2>
    <p style="font-size:12.5px;color:var(--ink-700);margin:0 0 18px;">Cada evento vira uma galeria pública (ou privada por link).</p>
    <form>
      ${mobField('Nome do evento', 'text', 'Abertura da Safra 2026')}
      ${mobField('Data', 'date', '2026-04-17')}
      ${mobField('Local', 'text', 'Itajá · GO')}
      ${mobField('Categoria', 'select', '', ['Rodeio', 'Corrida', 'Festival', 'Equestre', 'Futebol'])}
      ${mobField('Visibilidade', 'select', '', ['Público', 'Não listado (link)', 'Privado (senha)'])}
      ${mobField('Colaborador (% repasse)', 'text', 'Maria L. · 15%')}
      ${mobField('Descrição', 'textarea', 'Abertura da temporada 2026 do rodeio em Itajá-GO.')}
      <button class="btn primary full-btn" style="width:100%;margin-top:12px;">Criar e ir para upload →</button>
    </form>
  </div>`;

  T['/admin/eventos/123-videos'] = mobAdmTopbar('Vídeos · Safra 2026') + `<div style="padding: 14px 16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:8px;">
      <div><h2 style="margin:0;font-size:18px;font-weight:500;">Vídeos · 18</h2><div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);">12 VENDIDOS · R$ 1.342</div></div>
      <button class="btn primary sm">+ Upload</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr;gap:10px;">
      ${[1,2,3,4,5,6].map(i => `<div style="position:relative;aspect-ratio:16/9;border-radius:6px;overflow:hidden;background:var(--ink-300);">
        <img src="https://picsum.photos/seed/video-${i}/600/340" loading="lazy" style="width:100%;height:100%;object-fit:cover;">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.3);"><svg width="38" height="38" viewBox="0 0 24 24" fill="rgba(255,255,255,.9)"><polygon points="6,4 20,12 6,20"/></svg></div>
        <div style="position:absolute;bottom:6px;left:8px;background:rgba(0,0,0,.7);color:white;padding:3px 8px;border-radius:3px;font-family:var(--font-mono);font-size:10px;">VID-00${i} · 1:${20+i*7}</div>
        <div style="position:absolute;bottom:6px;right:8px;background:var(--brand-500);color:var(--ink-1000);padding:3px 8px;border-radius:3px;font-family:var(--font-mono);font-size:10px;font-weight:500;">R$ 49,90</div>
      </div>`).join('')}
    </div>
  </div>`;

  T['/admin/marca-dagua'] = mobAdmTopbar("Marca d'água") + `<div style="padding: 20px 16px;">
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:500;">Marca d'água global</h2>
    <p style="font-size:12.5px;color:var(--ink-700);margin:0 0 18px;">Aplicada nas fotos antes do download do cliente.</p>
    <div class="field"><label>Imagem da marca</label><div style="aspect-ratio:3/2;background:var(--ink-300);border:1px dashed var(--ink-500);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--ink-700);font-size:12px;">vss-logo.png · 240×160px</div></div>
    ${mobField('Posição', 'select', '', ['Canto inf. direito', 'Canto inf. esquerdo', 'Centro', 'Diagonal repetida'])}
    <div class="field"><label>Opacidade · 65%</label><input type="range" min="0" max="100" value="65"/></div>
    <div class="field"><label>Escala · 18% da imagem</label><input type="range" min="5" max="40" value="18"/></div>
    <div style="background:var(--ink-200);border:1px solid var(--ink-500);border-radius:6px;padding:12px;margin-top:14px;">
      <h4 style="margin:0 0 8px;font-size:11px;color:var(--ink-700);letter-spacing:.08em;text-transform:uppercase;">Preview</h4>
      <div style="position:relative;aspect-ratio:3/2;border-radius:4px;overflow:hidden;"><img src="https://picsum.photos/seed/wm-mob/600/400" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;bottom:10px;right:10px;background:rgba(237,232,224,.65);color:#0d0d0d;padding:4px 10px;border-radius:4px;font-family:Arial;font-weight:700;font-size:11px;">VS · FOTO</div></div>
    </div>
    <button class="btn primary full-btn" style="width:100%;margin-top:14px;">Salvar &amp; aplicar nas 38.217 fotos</button>
  </div>`;

  T['/admin/personalizar'] = mobAdmTopbar('Personalizar') + `<div style="padding: 20px 16px;">
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:500;">Personalizar site</h2>
    <p style="font-size:12.5px;color:var(--ink-700);margin:0 0 18px;">Tema padrão: escuro · brand âncora azul</p>
    <form>
      ${mobField('Título do site', 'text', 'Vinícius Souza · Fotografia')}
      ${mobField('Frase de capa (hero)', 'text', 'Compre as suas fotos.')}
      ${mobField('Subtítulo (lede)', 'textarea', 'Escolha seu evento, encontre suas fotos, pague via Pix ou cartão e baixe os arquivos originais.')}
      <div class="field"><label>Tema padrão</label>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn sm" style="flex:1;">☀ Claro</button>
          <button type="button" class="btn sm primary" style="flex:1;">🌙 Escuro</button>
          <button type="button" class="btn sm" style="flex:1;">Auto</button>
        </div>
      </div>
      <div class="field"><label>Cor brand principal</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <div style="width:36px;height:36px;border-radius:8px;background:#1F7AE0;border:2px solid var(--ink-1000);"></div>
          <div style="width:36px;height:36px;border-radius:8px;background:#C83333;border:1px solid var(--ink-500);"></div>
          <div style="width:36px;height:36px;border-radius:8px;background:#1F7A4A;border:1px solid var(--ink-500);"></div>
          <div style="width:36px;height:36px;border-radius:8px;background:#C8A84B;border:1px solid var(--ink-500);"></div>
        </div>
      </div>
      <button class="btn primary full-btn" style="width:100%;margin-top:14px;">Salvar alterações</button>
    </form>
  </div>`;

  T['/admin/reconhecimento'] = mobAdmTopbar('Reconhecimento facial') + `<div style="padding: 20px 16px;">
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:500;">Reconhecimento facial</h2>
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);margin-bottom:16px;letter-spacing:.06em;">FACE-API · EMBEDDINGS · TENSORFLOW.JS</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <div class="m-adm-stat"><div class="lbl">EMBEDDINGS</div><div class="v signal">3.142</div><div class="delta">87 clientes</div></div>
      <div class="m-adm-stat"><div class="lbl">CACHE DISCO</div><div class="v brand">142 MB</div><div class="delta">/storage/embeddings</div></div>
    </div>
    <div style="background:var(--ink-200);border:1px solid var(--ink-500);border-radius:6px;padding:14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-size:13.5px;color:var(--ink-1000);">Reconhecimento ativo</div><div style="font-size:11.5px;color:var(--ink-700);">Permite o opt-in dos clientes</div></div>
      <button class="switch on" data-toggle></button>
    </div>
    ${mobField('Confiança mínima exibida', 'select', '', ['50%', '70%', '85%'])}
    ${mobField('Backend de detecção', 'select', '', ['Auto', 'face-api', 'tensorflow.js', 'manual fallback'])}
    <button class="btn danger" style="width:100%;margin-top:14px;border-color:rgba(232,68,68,.4);color:var(--danger-500, #e84444);">Limpar cache de embeddings</button>
  </div>`;

  T['/admin/reset'] = mobAdmTopbar('Reset') + `<div style="padding: 20px 16px;">
    <div style="background:rgba(232,68,68,.12);border:1px solid rgba(232,68,68,.4);border-radius:6px;padding:14px;margin-bottom:16px;">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger-500, #e84444)" stroke-width="2"><use href="#sim-i-alert-triangle"/></svg>
        <div><strong style="color:var(--danger-500, #e84444);">Zona perigosa</strong><p style="margin:4px 0 0;font-size:12.5px;color:var(--ink-900);line-height:1.4;">Estas ações são irreversíveis. Use só em desenvolvimento ou pra resetar dados de teste.</p></div>
      </div>
    </div>
    <h2 style="margin:0 0 14px;font-size:18px;font-weight:500;">Reset do sistema</h2>
    <button class="btn" style="width:100%;margin-bottom:8px;text-align:left;justify-content:flex-start;border-color:rgba(232,163,58,.4);color:var(--warning-500);">⚠ Limpar carrinhos abandonados (> 30d)</button>
    <button class="btn" style="width:100%;margin-bottom:8px;text-align:left;justify-content:flex-start;border-color:rgba(232,163,58,.4);color:var(--warning-500);">⚠ Limpar logs antigos (> 90d)</button>
    <button class="btn" style="width:100%;margin-bottom:8px;text-align:left;justify-content:flex-start;border-color:rgba(232,68,68,.4);color:var(--danger-500, #e84444);">✕ Resetar embeddings de reconhecimento</button>
    <button class="btn" style="width:100%;margin-bottom:8px;text-align:left;justify-content:flex-start;border-color:rgba(232,68,68,.4);color:var(--danger-500, #e84444);">✕ Apagar TODAS as fotos de teste</button>
    <button class="btn" style="width:100%;text-align:left;justify-content:flex-start;background:var(--danger-500, #e84444);color:var(--ink-1000);border-color:var(--danger-500, #e84444);">✕✕ FACTORY RESET (apaga tudo)</button>
  </div>`;

  T['/admin/eventos/123'] = mobAdmTopbar('Safra 2026') + `<div style="padding: 14px 16px;">
    <h2 style="margin:0 0 2px;font-size:18px;font-weight:500;">Abertura da Safra 2026</h2>
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-700);margin-bottom:14px;letter-spacing:.04em;">RODEIO · 17 ABR · ITAJÁ · COLAB 15%</div>
    <button class="btn primary" style="width:100%;margin-bottom:14px;">Editar evento</button>
  </div>
  <!-- tabs -->
  <div style="display:flex;gap:0;border-bottom:1px solid var(--ink-500);overflow-x:auto;scrollbar-width:none;padding:0 8px;">
    <button class="ev-tab active" data-ev-tab="vendas" type="button" style="padding:10px 12px;font-size:12px;white-space:nowrap;background:transparent;border:0;border-bottom:2px solid var(--brand-500);color:var(--brand-400);">Vendas</button>
    <button class="ev-tab" data-ev-tab="fotos" type="button" style="padding:10px 12px;font-size:12px;white-space:nowrap;background:transparent;border:0;color:var(--ink-800);">Mídia</button>
    <button class="ev-tab" data-ev-tab="patrocinadores" type="button" style="padding:10px 12px;font-size:12px;white-space:nowrap;background:transparent;border:0;color:var(--ink-800);">Patroc.</button>
    <button class="ev-tab" data-ev-tab="watermark" type="button" style="padding:10px 12px;font-size:12px;white-space:nowrap;background:transparent;border:0;color:var(--ink-800);">Marca d'água</button>
    <button class="ev-tab" data-ev-tab="info" type="button" style="padding:10px 12px;font-size:12px;white-space:nowrap;background:transparent;border:0;color:var(--ink-800);">Info</button>
  </div>
  <!-- panes -->
  <div class="ev-pane active" data-ev-pane="vendas" style="padding:14px 16px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div class="m-adm-stat"><div class="lbl">FATURAMENTO</div><div class="v signal">R$ 14.882</div></div>
      <div class="m-adm-stat"><div class="lbl">PEDIDOS</div><div class="v">112</div></div>
      <div class="m-adm-stat"><div class="lbl">CONVERSÃO</div><div class="v brand">7.6%</div></div>
      <div class="m-adm-stat"><div class="lbl">CLIENTES</div><div class="v">87</div></div>
    </div>
    ${admListCard([
      { title: '#200000041 · Maria F.', meta: '3 fotos · PIX · 14/04', right: '<span class="badge b-paid">PAGO</span>' },
      { title: '#200000040 · João M.', meta: '5 fotos + 1 vídeo · Cartão', right: '<span class="badge b-paid">PAGO</span>' },
      { title: '#200000039 · Ana L.', meta: '2 fotos · PIX · 13/04', right: '<span class="badge b-pend">AGUARDA</span>' },
    ])}
  </div>
  <div class="ev-pane" data-ev-pane="fotos" style="padding:14px 16px;display:none;">
    <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
      <div><strong>Mídia · 1.581</strong><div style="font-size:11px;color:var(--ink-700);">607 vendidas · 38.4% conv.</div></div>
      <button class="btn primary sm">+ Upload</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
      ${Array.from({length: 12}, (_, i) => `<div style="position:relative;aspect-ratio:1;border-radius:4px;overflow:hidden;"><img src="https://picsum.photos/seed/evm-${i}/200/200" loading="lazy" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,.7);color:white;padding:1px 5px;border-radius:2px;font-family:var(--font-mono);font-size:9px;">#${String(i+1).padStart(3,'0')}</div></div>`).join('')}
    </div>
  </div>
  <div class="ev-pane" data-ev-pane="patrocinadores" style="padding:14px 16px;display:none;">
    <div style="margin-bottom:10px;"><strong>7 patrocinadores</strong><div style="font-size:11px;color:var(--ink-700);">R$ 22.300 captado</div></div>
    ${admListCard([
      { title: 'Sela Torque', meta: 'R$ 8.000 · seladostorque.com.br', right: '<span class="badge b-paid">OURO</span>' },
      { title: 'Vet. Boi Forte', meta: 'R$ 6.000 · boiforte.com.br', right: '<span class="badge b-paid">OURO</span>' },
      { title: 'Rações Goyaz', meta: 'R$ 3.500 · goyaz.com.br', right: '<span class="badge">PRATA</span>' },
      { title: 'Cervejaria Caju', meta: 'R$ 2.800', right: '<span class="badge">PRATA</span>' },
      { title: 'Mercado Boa Safra', meta: 'R$ 1.200', right: '<span class="badge" style="background:var(--warning-dim);color:var(--warning-500);">BRONZE</span>' },
    ])}
  </div>
  <div class="ev-pane" data-ev-pane="watermark" style="padding:14px 16px;display:none;">
    <div style="background:var(--ink-200);border:1px solid var(--ink-500);border-radius:6px;padding:12px;margin-bottom:12px;"><h4 style="margin:0 0 8px;font-size:11px;color:var(--ink-700);letter-spacing:.08em;text-transform:uppercase;">Preview</h4>
      <div style="position:relative;aspect-ratio:3/2;border-radius:4px;overflow:hidden;"><img src="https://picsum.photos/seed/wm-ev/600/400" style="width:100%;height:100%;object-fit:cover;"><div style="position:absolute;bottom:8px;right:8px;background:rgba(237,232,224,.65);color:#0d0d0d;padding:3px 8px;border-radius:3px;font-family:Arial;font-weight:700;font-size:10px;">VS · FOTO</div></div>
    </div>
    ${mobField('Posição', 'select', '', ['Canto inf. direito', 'Centro'])}
    <div class="field"><label>Opacidade · 65%</label><input type="range" min="0" max="100" value="65"/></div>
    <button class="btn primary" style="width:100%;margin-top:10px;">Aplicar em todas</button>
  </div>
  <div class="ev-pane" data-ev-pane="info" style="padding:14px 16px;display:none;">
    ${mobField('Nome', 'text', 'Abertura da Safra 2026')}
    ${mobField('Data', 'date', '2026-04-17')}
    ${mobField('Local', 'text', 'Itajá · GO')}
    ${mobField('Categoria', 'select', '', ['Rodeio', 'Corrida'])}
    ${mobField('Visibilidade', 'select', '', ['Público', 'Não listado', 'Privado'])}
    ${mobField('Descrição', 'textarea', 'Abertura da temporada 2026.')}
    <button class="btn primary" style="width:100%;margin-top:10px;">Salvar</button>
  </div>`;

  T['/admin/pedidos/reembolso'] = mobAdmTopbar('Pedido #200000019') + `<div style="padding: 16px 16px;">
    <div style="background:rgba(232,68,68,.10);border:1px solid rgba(232,68,68,.3);border-radius:6px;padding:12px;margin-bottom:14px;">
      <strong style="color:var(--danger-500, #e84444);font-size:13px;">⊘ Pedido com reembolso solicitado</strong>
      <p style="margin:6px 0 0;font-size:12.5px;color:var(--ink-900);line-height:1.4;">Cliente Patrícia S. pediu reembolso de 2 fotos (de 8 compradas). Motivo: "Cor da pele dela ficou esverdeada".</p>
    </div>
    <h2 style="margin:0 0 4px;font-size:18px;font-weight:500;">Pedido #200000019</h2>
    <div style="font-family:var(--font-mono);font-size:10.5px;color:var(--ink-700);margin-bottom:14px;">PATRÍCIA S. · 09/04 · R$ 230,40 · 8 fotos · ABERTURA SAFRA 2026</div>
    <h3 style="margin:14px 0 8px;font-size:13px;font-weight:500;">Fotos do pedido</h3>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
      ${Array.from({length: 8}, (_, i) => `<div style="position:relative;aspect-ratio:1;border-radius:4px;overflow:hidden;${i < 2 ? 'box-shadow: 0 0 0 2px var(--danger-500, #e84444);' : ''}">
        <img src="https://picsum.photos/seed/refund-${i}/200/200" loading="lazy" style="width:100%;height:100%;object-fit:cover;">
        ${i < 2 ? '<div style="position:absolute;inset:0;background:rgba(232,68,68,.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">✕</div>' : ''}
      </div>`).join('')}
    </div>
    <div style="margin-top:14px;background:var(--ink-200);border:1px solid var(--ink-500);border-radius:6px;padding:12px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Total original</span><span class="num">R$ 230,40</span></div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;color:var(--danger-500, #e84444);"><span>Reembolso (2 fotos)</span><span class="num">- R$ 57,60</span></div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--ink-500);padding-top:6px;font-weight:500;"><span>Líquido final</span><span class="num" style="color:var(--signal-500);">R$ 172,80</span></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn primary" style="flex:1;">✓ Aprovar reembolso</button>
      <button class="btn" style="flex:1;">Recusar</button>
    </div>
  </div>`;

  return T;
}

// Injeta os templates mobile nas rotas só-desktop.
function injectMobileTemplates(routes) {
  const T = buildMobileTemplates();
  let injected = 0;
  for (const [route, html] of Object.entries(T)) {
    const r = routes.get(route);
    if (!r) continue;
    if (r.mobile) continue; // já tem mobile dedicado
    r.mobile = {
      label: r.desktop ? r.desktop.label + ' Mobile' : route + ' Mobile',
      kind: 'phone',
      class: 'phone',
      inner: '<div class="phone-screen">' + html + '</div>',
    };
    injected++;
  }
  console.log('— mobile templates injetados:', injected);
  return injected;
}

// Enriquece a rota /admin/eventos/123 com 8 abas reais (do src/app/admin/eventos/[id]/page.js).
function enrichEventDetailRoute(routes) {
  const r = routes.get('/admin/eventos/123');
  if (!r || !r.desktop) return;
  const tabs = [
    { id: 'vendas',          label: 'Vendas & Contas',     icon: 'shopping-bag' },
    { id: 'carrinhos',       label: 'Carrinhos Ativos',    icon: 'shopping-cart' },
    { id: 'fotos',           label: 'Mídia',                icon: 'image' },
    { id: 'patrocinadores',  label: 'Patrocinadores',      icon: 'star' },
    { id: 'watermark',       label: "Marca d'água",        icon: 'image' },
    { id: 'relatorios',      label: 'Relatórios',          icon: 'bar-chart-2' },
    { id: 'precos',          label: 'Preços & Descontos',  icon: 'ticket' },
    { id: 'info',            label: 'Informações',         icon: 'file-text' },
  ];
  const tabsBar = tabs.map((t, i) =>
    '<button class="ev-tab' + (i === 0 ? ' active' : '') + '" data-ev-tab="' + t.id + '" type="button">'
    + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#sim-i-' + t.icon + '"/></svg>'
    + '<span>' + t.label + '</span></button>'
  ).join('');

  const grid18 = Array.from({length: 18}, (_, i) =>
    '<div style="aspect-ratio:1;background:var(--ink-300);border-radius:6px;overflow:hidden;position:relative;">'
    + '<img src="https://picsum.photos/seed/event-photo-' + i + '/300/300" loading="lazy" style="width:100%;height:100%;object-fit:cover;">'
    + '<div style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,.65);padding:2px 6px;border-radius:3px;font-family:var(--font-mono);font-size:9px;color:var(--ink-1000);">#' + String(i+1).padStart(3,'0') + '</div></div>'
  ).join('');

  const wmPreviewSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" rx="6" fill="#ede8e0" opacity="0.65"/><text x="40" y="25" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#0d0d0d">VS · FOTO</text></svg>');

  const panes = `
<div class="ev-pane active" data-ev-pane="vendas">
  <div class="ev-pane-head"><h3>Vendas & Contas</h3><span class="meta">112 pedidos · R$ 14.882 · 87 clientes</span></div>
  <div class="adm-stats">
    <div class="adm-stat"><div class="lbl">Faturamento</div><div class="v signal">R$ 14.882</div><div class="delta">↗ +28% vs evento anterior</div></div>
    <div class="adm-stat"><div class="lbl">Pedidos pagos</div><div class="v">112</div><div class="delta">↗ +12 hoje</div></div>
    <div class="adm-stat"><div class="lbl">Taxa conversão</div><div class="v brand">7.6%</div><div class="delta">↗ +1.2pp vs média</div></div>
    <div class="adm-stat"><div class="lbl">Contas únicas</div><div class="v">87</div><div class="delta">↗ +9 esta semana</div></div>
  </div>
  <table class="tbl" style="margin-top: 14px;">
    <thead><tr><th>#</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Status</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>
      <tr><td class="mono">#200000041</td><td>Maria F. Silva</td><td>3 fotos</td><td>PIX</td><td><span class="badge b-paid">PAGO</span></td><td class="num" style="text-align:right;color:var(--signal-500);">R$ 86,40</td></tr>
      <tr><td class="mono">#200000040</td><td>João M. Santos</td><td>5 fotos + 1 vídeo</td><td>Cartão</td><td><span class="badge b-paid">PAGO</span></td><td class="num" style="text-align:right;color:var(--signal-500);">R$ 207,30</td></tr>
      <tr><td class="mono">#200000039</td><td>Ana L. Pereira</td><td>2 fotos</td><td>PIX</td><td><span class="badge b-pend">AGUARDANDO</span></td><td class="num" style="text-align:right;color:var(--warning-500);">R$ 57,60</td></tr>
      <tr><td class="mono">#200000038</td><td>Patrícia S.</td><td>8 fotos</td><td>Boleto</td><td><span class="badge b-paid">PAGO</span></td><td class="num" style="text-align:right;color:var(--signal-500);">R$ 230,40</td></tr>
      <tr><td class="mono">#200000037</td><td>Roberto S.</td><td>1 foto</td><td>PIX</td><td><span class="badge b-pend">EXPIRADO</span></td><td class="num" style="text-align:right;color:var(--danger-500, #e84444);">R$ 28,80</td></tr>
    </tbody>
  </table>
</div>

<div class="ev-pane" data-ev-pane="carrinhos">
  <div class="ev-pane-head"><h3>Carrinhos Ativos</h3><span class="meta">9 abertos · R$ 1.142 potencial</span></div>
  <table class="tbl">
    <thead><tr><th>Cliente</th><th>Itens</th><th>Última atividade</th><th>Potencial</th><th>Ação</th></tr></thead>
    <tbody>
      <tr><td>Vinícius R.</td><td>4 fotos</td><td class="mono">há 26h</td><td class="num">R$ 86,40</td><td><button class="btn sm">Enviar lembrete</button></td></tr>
      <tr><td>João M.</td><td>3 fotos · 1 vídeo</td><td class="mono">há 2 dias</td><td class="num">R$ 156,30</td><td><button class="btn sm">Enviar lembrete</button></td></tr>
      <tr><td>Ana L.</td><td>2 fotos</td><td class="mono">há 5h</td><td class="num">R$ 57,60</td><td><button class="btn sm">Aguardar</button></td></tr>
      <tr><td>Roberto S.</td><td>1 foto</td><td class="mono">há 3 dias</td><td class="num">R$ 28,80</td><td><button class="btn sm">Recuperar</button></td></tr>
    </tbody>
  </table>
</div>

<div class="ev-pane" data-ev-pane="fotos">
  <div class="ev-pane-head">
    <div><h3>Mídia</h3><span class="meta">1.581 fotos · 18 vídeos · 1.402 publicadas</span></div>
    <div class="actions">
      <button class="btn">Selecionar todas</button>
      <button class="btn primary"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-upload"/></svg> Upload</button>
    </div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px;">${grid18}</div>
</div>

<div class="ev-pane" data-ev-pane="patrocinadores">
  <div class="ev-pane-head"><h3>Patrocinadores</h3><span class="meta">7 ativos · R$ 22.300 captado</span></div>
  <table class="tbl">
    <thead><tr><th>Patrocinador</th><th>Cota</th><th>Status</th><th>Visibilidade</th></tr></thead>
    <tbody>
      <tr><td><strong>Sela Torque</strong> · seladostorque.com.br</td><td class="num">R$ 8.000</td><td><span class="badge b-paid">★ OURO</span></td><td>Visível</td></tr>
      <tr><td><strong>Veterinária Boi Forte</strong> · boiforte.com.br</td><td class="num">R$ 6.000</td><td><span class="badge b-paid">★ OURO</span></td><td>Visível</td></tr>
      <tr><td><strong>Rações Goyaz</strong> · goyaz.com.br</td><td class="num">R$ 3.500</td><td><span class="badge">PRATA</span></td><td>Visível</td></tr>
      <tr><td><strong>Cervejaria Caju</strong></td><td class="num">R$ 2.800</td><td><span class="badge">PRATA</span></td><td>Visível</td></tr>
      <tr><td><strong>Mercado Boa Safra</strong></td><td class="num">R$ 1.200</td><td><span class="badge" style="background:var(--warning-dim);color:var(--warning-500);">BRONZE</span></td><td>Visível</td></tr>
      <tr><td><strong>Lava-Jato Itajá</strong></td><td class="num">R$ 600</td><td><span class="badge" style="background:var(--warning-dim);color:var(--warning-500);">BRONZE</span></td><td>Visível</td></tr>
      <tr><td><strong>FM 102.5 Rural</strong></td><td class="num">Permuta</td><td><span class="badge b-soft">APOIO</span></td><td>Visível</td></tr>
    </tbody>
  </table>
  <button class="btn primary" style="margin-top:14px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-plus"/></svg> Adicionar patrocinador</button>
</div>

<div class="ev-pane" data-ev-pane="watermark">
  <div class="ev-pane-head"><h3>Marca d'água personalizada</h3><span class="meta">aplicada em fotos &amp; vídeos do evento</span></div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    <div>
      <div class="field"><label>Imagem da marca</label><div style="aspect-ratio:1;background:var(--ink-300);border:1px dashed var(--ink-500);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--ink-700);font-size:12px;">vss-logo.png · 240×240px</div></div>
      <div class="field"><label>Posição</label><select><option>Canto inferior direito</option><option>Canto inferior esquerdo</option><option>Centro</option></select></div>
      <div class="field"><label>Opacidade (65%)</label><input type="range" min="0" max="100" value="65"/></div>
      <div class="field"><label>Escala (18%)</label><input type="range" min="5" max="40" value="18"/></div>
      <button class="btn primary" style="margin-top:8px;">Aplicar nas 1.581 fotos</button>
    </div>
    <div>
      <div style="background:var(--ink-200);border:1px solid var(--ink-500);border-radius:6px;padding:12px;">
        <h4 style="margin:0 0 8px;font-size:12px;color:var(--ink-700);letter-spacing:.08em;text-transform:uppercase;">Preview</h4>
        <div style="position:relative;aspect-ratio:3/2;border-radius:4px;overflow:hidden;"><img src="https://picsum.photos/seed/wm-preview/600/400" style="width:100%;height:100%;object-fit:cover;"><img src="data:image/svg+xml;utf8,${wmPreviewSvg}" style="position:absolute;bottom:8px;right:8px;width:80px;opacity:.65;"></div>
      </div>
    </div>
  </div>
</div>

<div class="ev-pane" data-ev-pane="relatorios">
  <div class="ev-pane-head"><h3>Relatórios</h3><span class="meta">exportar dados do evento</span></div>
  <div class="adm-stats" style="grid-template-columns: repeat(4, 1fr);">
    <div class="adm-stat"><div class="lbl">Fotos enviadas</div><div class="v">1.581</div></div>
    <div class="adm-stat"><div class="lbl">Fotos vendidas</div><div class="v signal">607</div></div>
    <div class="adm-stat"><div class="lbl">Taxa conversão</div><div class="v brand">38.4%</div></div>
    <div class="adm-stat"><div class="lbl">Faturamento</div><div class="v signal">R$ 14.882</div></div>
  </div>
  <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap;">
    <button class="btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-file-text"/></svg> CSV de pedidos</button>
    <button class="btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-file-text"/></svg> CSV de mídias vendidas</button>
    <button class="btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-file-text"/></svg> Relatório fiscal (PDF)</button>
    <button class="btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-file-text"/></svg> Repasses por colaborador</button>
  </div>
</div>

<div class="ev-pane" data-ev-pane="precos">
  <div class="ev-pane-head"><h3>Preços & Descontos progressivos</h3><span class="meta">R$ 28,80 por foto · escalonado</span></div>
  <div class="field"><label>Preço unitário (1 foto)</label><input type="text" value="R$ 28,80"/></div>
  <h4 style="margin: 18px 0 8px; font-size: 12px; color: var(--ink-700); letter-spacing: .08em; text-transform: uppercase;">Tiers de desconto</h4>
  <table class="tbl">
    <thead><tr><th>De</th><th>Até</th><th>Desconto</th><th>Preço unitário</th></tr></thead>
    <tbody>
      <tr><td>3 fotos</td><td>5</td><td class="num">−10%</td><td class="num">R$ 25,92</td></tr>
      <tr><td>6 fotos</td><td>9</td><td class="num">−15%</td><td class="num">R$ 24,48</td></tr>
      <tr><td>10 fotos</td><td>19</td><td class="num">−20%</td><td class="num">R$ 23,04</td></tr>
      <tr><td>20+ fotos</td><td>—</td><td class="num">−25%</td><td class="num">R$ 21,60</td></tr>
    </tbody>
  </table>
  <button class="btn primary" style="margin-top:12px;">Salvar preços do evento</button>
</div>

<div class="ev-pane" data-ev-pane="info">
  <div class="ev-pane-head"><h3>Informações</h3><span class="meta">dados básicos do evento</span></div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
    <div class="field"><label>Nome</label><input type="text" value="Abertura da Safra 2026"/></div>
    <div class="field"><label>Data</label><input type="date" value="2026-04-17"/></div>
    <div class="field"><label>Local</label><input type="text" value="Itajá · GO"/></div>
    <div class="field"><label>Categoria</label><select><option>Rodeio</option><option>Corrida</option><option>Festival</option><option>Equestre</option></select></div>
    <div class="field"><label>Visibilidade</label><select><option>Público</option><option>Não listado</option><option>Privado (link)</option></select></div>
    <div class="field"><label>Colaborador (% repasse)</label><input type="text" value="Maria L. · 15%"/></div>
    <div class="field" style="grid-column: 1 / -1;"><label>Descrição</label><textarea rows="3">Abertura da temporada 2026 do rodeio em Itajá-GO. Provas de touros, sela e tambor. Mais de 300 participantes.</textarea></div>
    <button class="btn primary" style="grid-column: 1 / -1; justify-self: start;">Salvar alterações</button>
  </div>
</div>`;

  r.desktop.inner = `
    <div class="adm-topbar">
      <div class="adm-brand-pill"><svg class="nav-logo"><use href="#nav-logo-h"/></svg><span class="role">Painel</span></div>
      <nav class="adm-crumbs"><span>Painel</span><span class="sep">/</span><span>Conteúdo</span><span class="sep">/</span><span>Eventos</span><span class="sep">/</span><span class="here">Abertura da Safra 2026</span></nav>
      <div class="adm-search-mini" style="margin-left:auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-search"/></svg><input placeholder="Buscar foto por ID, pasta…"/><span class="kbd">⌘K</span></div>
      <div class="adm-icon-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><use href="#sim-i-bell"/></svg></div>
      <div class="adm-avatar-pill"><div class="avatar" style="width:26px;height:26px;font-size:10px;"><img src="https://i.pravatar.cc/100?img=12" alt="VS" loading="lazy"></div><div><div class="name sim-user-name">Vinícius</div><div class="role">FOTÓGRAFO</div></div></div>
    </div>
    <div class="adm">
      <aside class="adm-side"></aside>
      <main class="adm-main">
        <div class="adm-page-head">
          <div>
            <h2>Abertura da Safra 2026</h2>
            <div class="sub">— RODEIO · 17 ABR 2026 · ITAJÁ/GO · PÚBLICO · COLAB MARIA L. (15%) —</div>
          </div>
          <div class="actions">
            <button class="btn">Compartilhar</button>
            <button class="btn">Despublicar</button>
            <button class="btn primary">Editar evento</button>
          </div>
        </div>
        <div class="ev-tabs" role="tablist">${tabsBar}</div>
        <div class="ev-panes">${panes}</div>
      </main>
    </div>`;
}

const CANONICAL_CLIENT_SIDEBAR = `
<div class="who">
  <div class="avatar brand"><img src="https://i.pravatar.cc/100?img=12" alt="VS" loading="lazy"></div>
  <div class="info">
    <h4 class="sim-user-name">Vinícius Souza</h4>
    <p>cliente desde mar/26</p>
  </div>
</div>
${renderSidebarItems(CLIENT_SIDEBAR)}
<div class="logout">
  <a data-sim-route="__logout__"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>Sair</a>
</div>`;

const CANONICAL_ADMIN_SIDEBAR = `
${renderSidebarItems(ADMIN_SIDEBAR)}
<div class="role-switcher">
  <div class="avatar" style="width: 26px; height: 26px; font-size: 10px;"><img src="https://i.pravatar.cc/100?img=12" alt="VS" loading="lazy"></div>
  <div class="info">
    <h5 class="sim-user-name">Vinícius Souza</h5>
    <p>Fotógrafo · Admin</p>
  </div>
  <a class="switch-btn" data-sim-route="__logout__" title="Sair">↻</a>
</div>`;


function build() {
  console.log('— extraindo telas');
  const publico = extractScreens(path.join(DIR, 'publico.html'));
  const cliente = extractScreens(path.join(DIR, 'cliente.html'));
  const admin = extractScreens(path.join(DIR, 'admin.html'));
  console.log(`   ${publico.length} público + ${cliente.length} cliente + ${admin.length} admin = ${publico.length + cliente.length + admin.length}`);

  const allScreens = [...publico, ...cliente, ...admin];

  const routes = new Map();
  const unmapped = [];
  const dropped = [];

  for (const s of allScreens) {
    const m = lookupRoute(s.label);
    if (!m) {
      if (s.label.includes('Toasts')) dropped.push(s.label);
      else unmapped.push(s.label);
      continue;
    }
    if (!routes.has(m.route)) {
      routes.set(m.route, { route: m.route, mode: m.mode, label: s.label, desktop: null, mobile: null });
    }
    const r = routes.get(m.route);
    // kind decidido pelo bloco extraído: frame=desktop, phone=mobile
    const slot = s.kind === 'frame' ? 'desktop' : 'mobile';
    // se já temos um, mantém o primeiro (não sobrescreve)
    if (!r[slot]) r[slot] = s;
  }

  console.log(`— ${routes.size} rotas · ${unmapped.length} não mapeadas · ${dropped.length} descartadas`);
  if (unmapped.length) console.log('  ⚠', unmapped);

  const stylePublico = extractInlineStyle(path.join(DIR, 'publico.html'));
  const styleCliente = extractInlineStyle(path.join(DIR, 'cliente.html'));
  const styleAdmin   = extractInlineStyle(path.join(DIR, 'admin.html'));
  const logoDefs = readLogoDefs();
  // SVG defs extras de cada mockup (i-cart, qr-pix-svg, etc.)
  const defsPublico = extractSvgDefs(path.join(DIR, 'publico.html'), 'publico');
  const defsCliente = extractSvgDefs(path.join(DIR, 'cliente.html'), 'cliente');
  const defsAdmin   = extractSvgDefs(path.join(DIR, 'admin.html'), 'admin');
  // Biblioteca de ícones (Lucide MIT) — auto-substituídos via JS por texto
  const iconSprite = buildIconSprite();

  // Enriquece admin/eventos/123 com 8 abas reais (do src/app/admin/eventos/[id]/page.js)
  enrichEventDetailRoute(routes);
  injectMobileTemplates(routes);

  const sectionsHtml = [];
  const order = ['public', 'cliente', 'admin'];
  const byMode = { public: [], cliente: [], admin: [] };
  for (const r of routes.values()) byMode[r.mode].push(r);

  // Ordem manual de prioridade dentro de cada modo: home → fluxos principais → especiais
  const PRIO = {
    public: [
      '/', '/evento/safra-2026', '/foto/safra-2026/0421', '/video/safra-2026/v07',
      '/carrinho', '/checkout', '/checkout/pix', '/checkout/boleto', '/checkout/confirmado',
      '/compras-guest', '/login', '/cadastro', '/recuperar-senha',
      '/contato', '/autenticidade', '/termos', '/privacidade', '/cookies',
      // especiais (estados de erro / empty / pagamento) — no fim
      '/cadastro-sucesso', '/carrinho-vazio', '/evento-sem-fotos', '/evento-privado',
      '/busca-sem-resultado', '/checkout/recusado',
      '/conta-bloqueada', '/404', '/500', '/manutencao',
    ],
    cliente: [
      '/cliente', '/cliente/compras', '/cliente/compras/123',
      '/cliente/carrinho', '/cliente/favoritos', '/cliente/comentarios',
      '/cliente/notificacoes', '/cliente/chat', '/cliente/reconhecimento',
      '/cliente/recompensas', '/cliente/configuracoes',
      '/cliente/remocoes', '/cliente/downloads-expirando',
      // especiais
      '/cliente/compras/124-reembolso',
      '/cliente/reconhecimento-consent', '/cliente/reconhecimento-vazio',
      '/cliente/compras-vazio', '/cliente/favoritos-vazio',
      '/cliente/comentarios-vazio', '/cliente/notificacoes-vazio',
      '/cliente/sessao-expirada',
    ],
    admin: [
      '/admin', '/admin/estatisticas',
      '/admin/eventos', '/admin/eventos/123',
      '/admin/eventos/123-videos', '/admin/eventos/123-patrocinadores',
      '/admin/eventos/novo', '/admin/eventos/123-upload',
      '/admin/pedidos', '/admin/carrinhos', '/admin/cupons',
      '/admin/propostas', '/admin/repasses',
      '/admin/clientes', '/admin/colaboradores', '/admin/chat',
      '/admin/comentarios', '/admin/contatos', '/admin/remocoes',
      '/admin/marca-dagua', '/admin/personalizar', '/admin/configuracoes',
      '/admin/notificacoes', '/admin/reconhecimento', '/admin/recompensas',
      '/admin/storage', '/admin/logs', '/admin/jobs',
      // especiais
      '/admin/eventos-sem-fotos', '/admin/dashboard-vazio',
      '/admin/pedidos/reembolso', '/admin/comentarios/moderacao',
      '/admin/reset', '/admin/403',
    ],
  };
  for (const mode of order) {
    const prioList = PRIO[mode] || [];
    const indexOf = (r) => {
      const i = prioList.indexOf(r);
      return i < 0 ? 9999 : i;
    };
    byMode[mode].sort((a, b) => {
      const da = indexOf(a.route);
      const db = indexOf(b.route);
      if (da !== db) return da - db;
      return a.route.localeCompare(b.route);
    });
  }

  for (const mode of order) {
    for (const r of byMode[mode]) {
      let html = `\n<!-- ${r.route} · ${r.mode} -->\n`;
      html += `<section class="sim-screen" data-route="${escAttr(r.route)}" data-mode="${r.mode}" hidden>\n`;
      if (r.desktop) {
        const cls = 'view-desktop' + (!r.mobile ? ' view-desktop-fallback' : '');
        html += `  <div class="${cls}">\n`;
        html += `    <div class="${r.desktop.class}" data-screen-label="${escAttr(r.desktop.label)}">${r.desktop.inner}</div>\n`;
        html += `  </div>\n`;
      }
      if (r.mobile) {
        const cls = 'view-mobile' + (!r.desktop ? ' view-mobile-fallback' : '');
        html += `  <div class="${cls}">\n`;
        html += `    <div class="${r.mobile.class}" data-screen-label="${escAttr(r.mobile.label)}">${r.mobile.inner}</div>\n`;
        html += `  </div>\n`;
      }
      html += `</section>\n`;
      sectionsHtml.push(html);
    }
  }

  const tocItems = [];
  for (const mode of order) {
    for (const r of byMode[mode]) {
      tocItems.push({
        route: r.route,
        mode: r.mode,
        label: r.label,
        hasDesktop: !!r.desktop,
        hasMobile: !!r.mobile,
      });
    }
  }
  const tocJson = JSON.stringify(tocItems);

  const out = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0c0c0d">
<title>Simulador · Vinícius Souza Fotografia</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="shared.css">

<!-- styles do PÚBLICO -->
<style>
${stylePublico}
</style>

<!-- styles do CLIENTE -->
<style>
${styleCliente}
</style>

<!-- styles do ADMIN -->
<style>
${styleAdmin}
</style>

<!-- styles do SIMULADOR -->
<style>
  html, body {
    margin: 0; padding: 0;
    background: var(--ink-100);
    color: var(--ink-1000);
    font-family: var(--font-body);
    min-height: 100%;
  }
  body { padding-top: 48px; min-height: 100vh; }

  .sim-screen { display: none; }
  .sim-screen[data-route].active { display: block; }
  .sim-screen[hidden] { display: none !important; }
  .sim-screen.active[hidden] { display: block !important; }

  /* frame/phone overrides */
  .sim-screen .frame {
    background: var(--ink-100);
    border: 0;
    border-radius: 0;
    box-shadow: none;
    min-height: calc(100vh - 48px);
    width: 100%;
    max-width: 100%;
  }
  .sim-screen .phone {
    width: 100%;
    max-width: 410px;
    margin: 12px auto;
    box-shadow: var(--shadow);
    position: static;
  }
  .sim-screen .phone-screen {
    height: auto;
    min-height: 660px;
  }

  /* ============================================================
     RESPONSIVE SWITCH (3 modos)
     - auto (default): segue viewport real
     - .sim-force-desktop: força visão desktop independente do viewport
     - .sim-force-mobile : força visão mobile com chrome do phone shell
     ============================================================ */
  .view-desktop, .view-mobile { display: none; }

  /* AUTO mode — segue media query */
  html:not(.sim-force-desktop):not(.sim-force-mobile) .view-desktop,
  html:not(.sim-force-desktop):not(.sim-force-mobile) .view-desktop.view-desktop-fallback {
    display: block;
  }
  @media (max-width: 767px) {
    html:not(.sim-force-desktop):not(.sim-force-mobile) .view-desktop { display: none; }
    html:not(.sim-force-desktop):not(.sim-force-mobile) .view-desktop.view-desktop-fallback { display: block; }
    html:not(.sim-force-desktop):not(.sim-force-mobile) .view-mobile { display: block; }
    html:not(.sim-force-desktop):not(.sim-force-mobile) .view-mobile.view-mobile-fallback { display: block; }
    /* phone vira fullscreen em mobile real */
    .sim-screen .phone {
      max-width: 100%; margin: 0; padding: 0;
      border: 0; border-radius: 0; box-shadow: none;
    }
    .sim-screen .phone-screen {
      border-radius: 0; min-height: calc(100vh - 48px);
    }
  }
  @media (min-width: 768px) {
    html:not(.sim-force-desktop):not(.sim-force-mobile) .view-desktop { display: block; }
    html:not(.sim-force-desktop):not(.sim-force-mobile) .view-mobile { display: none; }
    html:not(.sim-force-desktop):not(.sim-force-mobile) .view-desktop.view-desktop-fallback { display: block; }
    html:not(.sim-force-desktop):not(.sim-force-mobile) .view-mobile.view-mobile-fallback { display: none; }
  }

  /* FORCE DESKTOP */
  html.sim-force-desktop .view-desktop { display: block !important; }
  html.sim-force-desktop .view-mobile { display: none !important; }
  html.sim-force-desktop .view-mobile.view-mobile-fallback { display: none !important; }
  html.sim-force-desktop .view-desktop.view-desktop-fallback { display: block !important; }

  /* FORCE MOBILE — frame center + max-width = simula viewport mobile no desktop */
  html.sim-force-mobile .view-mobile { display: block !important; }
  html.sim-force-mobile .view-desktop { display: none !important; }
  html.sim-force-mobile .view-mobile.view-mobile-fallback { display: block !important; }
  html.sim-force-mobile .view-desktop.view-desktop-fallback { display: block !important; }
  /* quando não há mobile, mostra desktop com max-width pra parecer mobile */
  html.sim-force-mobile body { background: #2a2a30; }
  html.sim-force-mobile .sim-screen {
    max-width: 410px;
    margin: 16px auto 32px;
    box-shadow: 0 0 0 1px var(--ink-500), 0 22px 60px -20px rgba(0,0,0,.6);
    border-radius: 24px;
    overflow: hidden;
    background: var(--ink-100);
    min-height: 0;
    height: auto;
  }
  html.sim-force-mobile .sim-screen .frame {
    min-height: 0;
    height: auto;
    border-radius: 24px;
  }
  html.sim-force-mobile .sim-screen .phone {
    max-width: 100%;
    margin: 0;
    border: 0; border-radius: 0;
    padding: 0;
    box-shadow: none;
  }
  html.sim-force-mobile .sim-screen .phone-screen {
    border-radius: 0;
    min-height: 720px;
  }
  /* aviso quando força mobile mas rota só tem desktop */
  html.sim-force-mobile .sim-screen .view-desktop-fallback::before {
    content: "🛈 Layout desktop adaptado — esta tela ainda não tem versão mobile dedicada nos mockups";
    display: block;
    padding: 10px 14px;
    background: rgba(232,163,58,.18);
    color: var(--warning-500, #e8a33a);
    font-family: var(--font-mono);
    font-size: 10.5px;
    letter-spacing: .03em;
    text-align: center;
    border-bottom: 1px solid var(--ink-500);
    line-height: 1.45;
  }
  /* PHONE SHELL SINTÉTICO: quando força mobile em rota só-desktop, o conteúdo desktop
     é reduzido proporcionalmente pra caber no shell. Usa container wrapper pra calcular
     altura final (zoom * altura natural) e evitar espaço vazio. */
  html.sim-force-mobile .sim-screen .view-desktop-fallback {
    position: relative;
    background: var(--ink-100);
    overflow: hidden;
    height: auto;
  }
  html.sim-force-mobile .sim-screen .view-desktop-fallback > .frame {
    zoom: 0.32;
    width: calc(100% / 0.32);
    transform-origin: top left;
    pointer-events: auto;
    min-height: 0 !important;
    height: auto !important;
  }
  /* Firefox: zoom não suportado — fallback transform-scale com height calculada via JS */
  @supports (-moz-appearance: none) {
    html.sim-force-mobile .sim-screen .view-desktop-fallback {
      height: var(--fallback-h, auto);
    }
    html.sim-force-mobile .sim-screen .view-desktop-fallback > .frame {
      zoom: 1;
      transform: scale(0.32);
      transform-origin: top left;
      width: 312.5%;
      position: absolute;
      top: 0; left: 0;
    }
  }

  /* ─── topbar testador ─── */
  .sim-topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    background: rgba(7,7,8,.94); backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--ink-500);
    padding: 8px 14px;
    display: flex; align-items: center; gap: 10px;
    font-family: var(--font-body); font-size: 12px;
    height: 48px; box-sizing: border-box;
    transition: transform .2s var(--ease-out);
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sim-topbar::-webkit-scrollbar { display: none; }
  .sim-topbar.hidden { transform: translateY(-100%); }

  /* ZONE PILL — destaca a zona da ROTA atual (independente de quem está logado) */
  .zone-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px;
    border: 1px solid; border-radius: 999px;
    font-family: var(--font-mono); font-size: 10.5px;
    letter-spacing: .12em; white-space: nowrap;
    text-transform: uppercase; font-weight: 500;
    flex-shrink: 0;
  }
  .zone-pill .zone-dot {
    width: 7px; height: 7px; border-radius: 50%;
  }
  .zone-pill[data-zone="public"] {
    background: rgba(237,232,224,.10); color: var(--ink-1000);
    border-color: rgba(237,232,224,.25);
  }
  .zone-pill[data-zone="public"] .zone-dot { background: var(--ink-1000); }
  .zone-pill[data-zone="cliente"] {
    background: var(--brand-dim); color: var(--brand-400);
    border-color: rgba(31,122,224,.35);
  }
  .zone-pill[data-zone="cliente"] .zone-dot {
    background: var(--brand-500);
    box-shadow: 0 0 0 3px rgba(31,122,224,.18);
  }
  .zone-pill[data-zone="admin"] {
    background: rgba(232,163,58,.18); color: var(--warning-500, #e8a33a);
    border-color: rgba(232,163,58,.4);
  }
  .zone-pill[data-zone="admin"] .zone-dot {
    background: var(--warning-500, #e8a33a);
    box-shadow: 0 0 0 3px rgba(232,163,58,.18);
  }

  /* BRAND PILL — quem está logado (visitante, Lucas, Vinícius) */
  .sim-topbar .brand-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px;
    background: var(--ink-200); color: var(--ink-900);
    border: 1px solid var(--ink-500);
    border-radius: 999px; font-family: var(--font-mono);
    font-size: 10.5px; letter-spacing: .04em;
    white-space: nowrap; flex-shrink: 0;
  }
  .sim-topbar .brand-pill.live-public { color: var(--ink-700); }
  .sim-topbar .brand-pill.live-cliente { color: var(--brand-400); border-color: rgba(31,122,224,.35); background: rgba(31,122,224,.06); }
  .sim-topbar .brand-pill.live-admin { color: var(--warning-500, #e8a33a); border-color: rgba(232,163,58,.4); background: rgba(232,163,58,.08); }

  .sim-topbar .sep {
    width: 1px; height: 22px; background: var(--ink-500);
    flex-shrink: 0;
  }
  .sim-topbar button, .sim-topbar a.btnish {
    background: transparent; color: var(--ink-900);
    border: 1px solid var(--ink-500); border-radius: var(--radius);
    padding: 5px 10px; font: inherit; cursor: pointer;
    display: inline-flex; align-items: center; gap: 5px;
    text-decoration: none;
    white-space: nowrap; flex-shrink: 0;
  }
  .sim-topbar button:hover, .sim-topbar a.btnish:hover {
    border-color: var(--ink-700); color: var(--ink-1000);
  }
  .sim-topbar button.primary {
    background: var(--brand-500); color: var(--ink-1000);
    border-color: var(--brand-500);
  }
  .sim-topbar button.primary:hover { background: var(--brand-600); border-color: var(--brand-600); }
  .sim-topbar button.active {
    background: var(--brand-dim); color: var(--brand-400);
    border-color: var(--brand-500);
  }
  /* zone-active: marca o botão (Público/Cliente/Admin) que casa com a ZONA da rota atual */
  .sim-topbar #btnPublic.zone-active {
    background: rgba(237,232,224,.12);
    color: var(--ink-1000);
    border-color: rgba(237,232,224,.4);
    box-shadow: inset 0 -2px 0 var(--ink-1000);
  }
  .sim-topbar #btnCliente.zone-active {
    background: var(--brand-dim);
    color: var(--brand-400);
    border-color: var(--brand-500);
    box-shadow: inset 0 -2px 0 var(--brand-500);
  }
  .sim-topbar #btnAdmin.zone-active {
    background: rgba(232,163,58,.18);
    color: var(--warning-500, #e8a33a);
    border-color: rgba(232,163,58,.5);
    box-shadow: inset 0 -2px 0 var(--warning-500, #e8a33a);
  }
  .sim-topbar .spacer { flex: 1; }
  .sim-topbar .route-info {
    font-family: var(--font-mono); font-size: 10.5px;
    color: var(--ink-800); letter-spacing: .04em;
    max-width: 220px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; flex-shrink: 0;
  }
  .sim-topbar .route-info b { color: var(--brand-400); font-weight: 500; }

  /* pager X / Y entre ← → */
  .sim-pager {
    display: inline-flex; gap: 0; flex-shrink: 0;
    border: 1px solid var(--ink-500); border-radius: var(--radius); overflow: hidden;
    align-items: stretch;
  }
  .sim-pager button {
    border: 0 !important; border-radius: 0 !important;
    padding: 5px 10px !important;
    background: transparent !important;
    color: var(--ink-900) !important;
    font-size: 13px !important;
  }
  .sim-pager button:hover { background: var(--ink-300) !important; color: var(--ink-1000) !important; }
  .sim-pager-count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 56px; padding: 0 10px;
    font-family: var(--font-mono); font-size: 10.5px;
    color: var(--ink-900); letter-spacing: .04em;
    background: var(--ink-200);
    border-left: 1px solid var(--ink-500);
    border-right: 1px solid var(--ink-500);
    white-space: nowrap;
  }
  .sim-pager-count b { color: var(--brand-400); font-weight: 500; margin-right: 1px; }

  /* viewport switcher (3 botões grudados) */
  .sim-viewport {
    display: inline-flex; gap: 0; flex-shrink: 0;
    border: 1px solid var(--ink-500); border-radius: var(--radius); overflow: hidden;
  }
  .sim-viewport button {
    border: 0 !important; border-radius: 0 !important;
    padding: 5px 8px !important;
    border-right: 1px solid var(--ink-500) !important;
    background: transparent !important;
    color: var(--ink-800) !important;
    font-size: 11px !important;
  }
  .sim-viewport button:last-child { border-right: 0 !important; }
  .sim-viewport button.active {
    background: var(--brand-dim) !important;
    color: var(--brand-400) !important;
  }
  .sim-viewport button:hover { background: var(--ink-300) !important; color: var(--ink-1000) !important; }

  .sim-toc { position: relative; flex-shrink: 0; }
  .sim-toc-menu {
    display: none; position: absolute; top: calc(100% + 6px); right: 0;
    width: 340px; max-height: 480px; overflow-y: auto;
    background: var(--ink-200); border: 1px solid var(--ink-500);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 6px;
    z-index: 10000;
  }
  .sim-toc.open .sim-toc-menu { display: block; }
  .sim-toc-section {
    font-family: var(--font-mono); font-size: 10px;
    letter-spacing: .14em; text-transform: uppercase;
    color: var(--ink-700);
    padding: 10px 10px 6px;
    border-top: 1px solid var(--ink-500);
    margin-top: 4px;
  }
  .sim-toc-section:first-child { border-top: 0; margin-top: 0; }
  .sim-toc-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px; border-radius: var(--radius);
    cursor: pointer; color: var(--ink-900);
    font-size: 12px;
  }
  .sim-toc-item:hover { background: var(--ink-300); color: var(--ink-1000); }
  .sim-toc-item.active { background: var(--brand-dim); color: var(--brand-400); }
  .sim-toc-item .r {
    font-family: var(--font-mono); font-size: 10px;
    color: var(--ink-700); margin-left: auto;
    letter-spacing: .04em;
  }
  .sim-toc-item .vp {
    font-family: var(--font-mono); font-size: 9px;
    color: var(--ink-700); padding: 1px 5px;
    border: 1px solid var(--ink-500); border-radius: 3px;
    letter-spacing: .04em;
  }
  .sim-toc-item .vp.both { color: var(--signal-500); border-color: rgba(34,197,94,.4); }

  /* ─── toasts ─── */
  #sim-toasts {
    position: fixed; bottom: 18px; right: 18px; z-index: 10001;
    display: flex; flex-direction: column; gap: 8px;
    max-width: 360px;
  }
  .sim-toast {
    background: var(--ink-200); border: 1px solid var(--ink-500);
    border-left: 3px solid var(--brand-500);
    border-radius: var(--radius);
    padding: 12px 14px;
    font-size: 12.5px; color: var(--ink-1000);
    box-shadow: var(--shadow);
    animation: simToastIn .25s var(--ease-out);
  }
  .sim-toast.danger { border-left-color: var(--danger-500, #e84444); }
  .sim-toast.success { border-left-color: var(--signal-500); }
  .sim-toast .t {
    font-family: var(--font-mono); font-size: 10.5px;
    letter-spacing: .12em; text-transform: uppercase;
    color: var(--ink-700); margin-bottom: 4px;
  }
  @keyframes simToastIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: none; }
  }

  /* ─── lightbox ─── */
  .sim-lightbox-overlay {
    position: fixed; inset: 0; z-index: 10500;
    background: rgba(0,0,0,.94);
    display: none;
    flex-direction: column;
    padding: 60px 20px 80px;
    box-sizing: border-box;
  }
  .sim-lightbox-overlay.open { display: flex; }
  .sim-lightbox-overlay img.lb-photo {
    max-width: 92%; max-height: 100%;
    margin: auto;
    object-fit: contain;
  }
  .sim-lightbox-overlay .lb-close {
    position: absolute; top: 60px; right: 20px;
    background: transparent; border: 0; color: var(--ink-1000);
    font-size: 28px; cursor: pointer; line-height: 1;
    padding: 0; width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
  }
  .sim-lightbox-overlay .lb-close:hover { background: rgba(255,255,255,.08); }
  .sim-lightbox-overlay .lb-meta {
    position: absolute; top: 60px; left: 20px;
    font-family: var(--font-mono); font-size: 11px;
    color: var(--ink-800); letter-spacing: .08em;
  }
  .sim-lightbox-overlay .lb-nav {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;
    padding: 0 12px;
  }
  .sim-lightbox-overlay .lb-nav button {
    background: var(--ink-200); border: 1px solid var(--ink-500);
    color: var(--ink-1000);
    border-radius: var(--radius);
    padding: 8px 16px; cursor: pointer;
    font-family: var(--font-body); font-size: 13px;
  }
  .sim-lightbox-overlay .lb-nav button:hover { border-color: var(--brand-500); }

  /* ─── help overlay ─── */
  .sim-help-overlay {
    position: fixed; inset: 0; z-index: 10600;
    background: rgba(0,0,0,.84); display: none;
    align-items: center; justify-content: center;
    padding: 20px;
  }
  .sim-help-overlay.open { display: flex; }
  .sim-help-overlay .panel {
    background: var(--ink-200); border: 1px solid var(--ink-500);
    border-radius: var(--radius-lg);
    padding: 28px 32px;
    max-width: 560px; width: 100%;
    max-height: 80vh; overflow-y: auto;
  }
  .sim-help-overlay h3 {
    font-family: var(--font-heading); font-size: 20px; font-weight: 500;
    margin: 0 0 14px; color: var(--ink-1000);
  }
  .sim-help-overlay kbd {
    display: inline-block;
    padding: 2px 8px; min-width: 24px;
    background: var(--ink-300); border: 1px solid var(--ink-500);
    border-radius: 4px;
    font-family: var(--font-mono); font-size: 11px;
    color: var(--ink-1000); text-align: center;
  }
  .sim-help-overlay table { width: 100%; border-collapse: collapse; }
  .sim-help-overlay td {
    padding: 8px 6px; font-size: 13px;
    border-bottom: 1px solid var(--ink-300);
    color: var(--ink-900);
  }
  .sim-help-overlay td:first-child { width: 110px; }
  .sim-help-overlay .close-x {
    background: transparent; border: 1px solid var(--ink-500);
    color: var(--ink-1000); border-radius: 50%;
    width: 30px; height: 30px; cursor: pointer;
    float: right; margin-top: -8px; margin-right: -10px;
  }

  .sim-empty {
    min-height: calc(100vh - 48px);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 60px 20px;
    color: var(--ink-800);
  }
  .sim-empty h2 {
    font-family: var(--font-display); font-style: italic;
    font-size: 32px; color: var(--ink-1000); margin: 0 0 12px;
  }
  .sim-empty p { max-width: 460px; font-size: 14px; line-height: 1.6; }
  .sim-empty .actions { margin-top: 20px; display: flex; gap: 10px; }

  /* mobile: simplifica topbar */
  @media (max-width: 720px) {
    .sim-topbar .route-info { display: none; }
    .sim-topbar .label-text { display: none; }
    .sim-topbar .desktop-only { display: none !important; }
    .sim-toc-menu { width: calc(100vw - 28px); right: -8px; }
    /* Share/Reset labels in mobile: só ícones */
    #btnReset, #btnShare { font-size: 11px !important; padding: 4px 8px !important; }
  }
  @media (max-width: 580px) {
    #btnReset, #btnShare { display: none; }
    .sim-pager-count { min-width: 44px; font-size: 10px; padding: 0 6px; }
  }
  @media (max-width: 480px) {
    .nav-logo { height: 42px; width: 168px; }
    .nav { padding: 12px 14px; gap: 12px; }
  }

  .sim-screen .topbar { position: relative !important; }

  /* Event Detail tabs (admin/eventos/123 enriquecido) */
  .ev-tabs {
    display: flex; gap: 0; padding: 0 22px;
    border-bottom: 1px solid var(--ink-500);
    margin-bottom: 18px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .ev-tabs::-webkit-scrollbar { display: none; }
  .ev-tabs .ev-tab {
    background: transparent; border: 0;
    color: var(--ink-800); cursor: pointer;
    padding: 12px 16px; font: inherit;
    font-size: 13px; display: inline-flex; align-items: center; gap: 8px;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px; white-space: nowrap;
    transition: color .15s, border-color .15s;
  }
  .ev-tabs .ev-tab:hover { color: var(--ink-1000); }
  .ev-tabs .ev-tab.active {
    color: var(--brand-400);
    border-bottom-color: var(--brand-500);
  }
  .ev-panes { padding: 0 22px 22px; }
  .ev-pane { display: none; }
  .ev-pane.active { display: block; animation: simFadeIn .2s ease-out; }
  @keyframes simFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .ev-pane-head {
    display: flex; align-items: end; justify-content: space-between;
    padding-bottom: 12px; margin-bottom: 14px;
    border-bottom: 1px solid var(--ink-500);
    flex-wrap: wrap; gap: 10px;
  }
  .ev-pane-head h3 { margin: 0; font-size: 16px; font-weight: 500; color: var(--ink-1000); }
  .ev-pane-head .meta { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-700); letter-spacing: .04em; }
  .ev-pane-head .actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
</head>
<body>

${logoDefs}

${defsPublico}
${defsCliente}
${defsAdmin}

${iconSprite}

<div class="sim-topbar" id="simTopbar">
  <!-- ZONA da rota atual (público / cliente / admin) -->
  <span class="zone-pill" id="zonePill" data-zone="public">
    <span class="zone-dot"></span>
    <span class="zone-label" id="zoneLabel">SITE PÚBLICO</span>
  </span>
  <span class="brand-pill" id="modePill" title="Quem está logado">visitante</span>

  <div class="sep"></div>
  <button id="btnHome" title="Início" type="button">⌂</button>

  <!-- NAV PAGINATION: ← X / Y → -->
  <div class="sim-pager" role="group" aria-label="Navegação entre telas">
    <button id="btnBack" title="Tela anterior (Alt+←)" type="button">←</button>
    <span class="sim-pager-count" id="pagerCount" title="Tela atual / total">— / —</span>
    <button id="btnFwd" title="Próxima tela (Alt+→)" type="button">→</button>
  </div>

  <div class="sep"></div>
  <button id="btnPublic" type="button" title="Modo público (deslogar)"><span class="label-text">👁 Público</span></button>
  <button id="btnCliente" type="button" title="Entrar como cliente (lucas@gmail.com)"><span class="label-text">👤 Cliente</span></button>
  <button id="btnAdmin" type="button" title="Entrar como admin"><span class="label-text">⚙ Admin</span></button>

  <div class="sep"></div>

  <!-- VIEWPORT SWITCHER -->
  <div class="sim-viewport" id="vpSwitcher" role="group" aria-label="Forçar viewport">
    <button id="vpAuto" type="button" title="Auto (segue tamanho da janela)">Auto</button>
    <button id="vpDesktop" type="button" title="Forçar layout desktop">🖥</button>
    <button id="vpMobile" type="button" title="Forçar layout mobile (simula celular no PC)">📱</button>
  </div>

  <div class="spacer"></div>

  <div class="route-info desktop-only">
    rota <b id="routeNow">/</b>
  </div>

  <button id="btnShare" type="button" title="Copiar link da tela atual">🔗</button>
  <button id="btnReset" type="button" title="Limpar carrinho/login/state e voltar pro início">↺</button>

  <div class="sim-toc" id="simToc">
    <button id="btnToc" type="button">☰</button>
    <div class="sim-toc-menu" id="tocMenu"></div>
  </div>

  <button id="btnHelp" type="button" title="Ajuda (?)">?</button>
</div>

${sectionsHtml.join('')}

<section class="sim-screen" data-route="__404" hidden>
  <div class="sim-empty">
    <h2>Rota não encontrada</h2>
    <p>O hash <code id="route404Hash"></code> não tem tela mapeada nesse simulador. Use o menu ☰ pra ver tudo.</p>
    <div class="actions">
      <button class="home-cta" onclick="location.hash='/'">Voltar pro início</button>
    </div>
  </div>
</section>

<div id="sim-toasts" aria-live="polite"></div>

<div class="sim-lightbox-overlay" id="simLightbox" role="dialog" aria-label="Visualizar foto">
  <button class="lb-close" id="lbClose" type="button" aria-label="Fechar">×</button>
  <div class="lb-meta" id="lbMeta">REF #0001</div>
  <img class="lb-photo" id="lbPhoto" src="" alt="">
  <div class="lb-nav">
    <button id="lbPrev" type="button">← Anterior</button>
    <button id="lbAdd" type="button">+ Adicionar ao carrinho</button>
    <button id="lbNext" type="button">Próxima →</button>
  </div>
</div>

<div class="sim-help-overlay" id="simHelp" role="dialog" aria-label="Atalhos">
  <div class="panel">
    <button class="close-x" id="helpClose" aria-label="Fechar">×</button>
    <h3>Atalhos do simulador</h3>
    <table>
      <tr><td><kbd>?</kbd></td><td>Mostra/esconde esta ajuda</td></tr>
      <tr><td><kbd>h</kbd></td><td>Esconde a barra superior (para screenshots)</td></tr>
      <tr><td><kbd>m</kbd></td><td>Alterna viewport mobile / auto</td></tr>
      <tr><td><kbd>d</kbd></td><td>Alterna viewport desktop / auto</td></tr>
      <tr><td><kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd></td><td>Navegar entre telas</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Fecha modais e overlays</td></tr>
      <tr><td>Voltar do browser</td><td>Funciona normalmente</td></tr>
    </table>
    <h3 style="margin-top:22px">Como testar</h3>
    <p style="font-size:13px;color:var(--ink-900);line-height:1.55;margin:0 0 10px">
      Clique normalmente nos botões e links. As ações que alteram dados (deletar, banir, aprovar) mostram toast de aviso e não fazem nada. Carrinho, login e navegação funcionam.
    </p>
    <p style="font-size:13px;color:var(--ink-900);line-height:1.55;margin:0 0 10px">
      Use o switcher de viewport (Auto · 🖥 · 📱) na barra superior pra ver como cada tela fica em desktop ou em celular, mesmo abrindo no PC.
    </p>
    <p style="font-size:12px;color:var(--ink-700);font-family:var(--font-mono);letter-spacing:.04em;margin:0">
      🧪 Simulador · dados de teste · sem backend
    </p>
  </div>
</div>

<script src="app.js"></script>
<script>
const TOC = ${tocJson};
const CANONICAL_CLIENT_SIDEBAR_HTML = ${JSON.stringify(CANONICAL_CLIENT_SIDEBAR)};
const CANONICAL_ADMIN_SIDEBAR_HTML = ${JSON.stringify(CANONICAL_ADMIN_SIDEBAR)};

const STORAGE_KEY = 'sim_v1';
const defaultState = { cart: [], role: 'public', user: null, lastRoute: '/', viewport: 'auto' };
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    return { ...defaultState, ...JSON.parse(raw) };
  } catch { return { ...defaultState }; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
let state = loadState();

function toast(msg, kind, title) {
  const wrap = document.createElement('div');
  wrap.className = 'sim-toast' + (kind ? ' ' + kind : '');
  if (title) {
    const t = document.createElement('div');
    t.className = 't'; t.textContent = title;
    wrap.appendChild(t);
  }
  const body = document.createElement('div');
  body.textContent = msg;
  wrap.appendChild(body);
  document.getElementById('sim-toasts').appendChild(wrap);
  setTimeout(() => { wrap.style.transition = 'opacity .3s'; wrap.style.opacity = '0'; }, 3500);
  setTimeout(() => wrap.remove(), 3900);
}

function currentRoute() {
  const h = location.hash || '#/';
  return h.replace(/^#/, '');
}
function setRoute(route, push) {
  if (push !== false) location.hash = route;
  renderRoute();
}
function renderRoute() {
  const route = currentRoute();
  state.lastRoute = route;
  saveState();
  let matched = null;
  document.querySelectorAll('.sim-screen').forEach(el => {
    const r = el.getAttribute('data-route');
    if (r === route) { el.classList.add('active'); el.removeAttribute('hidden'); matched = el; }
    else { el.classList.remove('active'); el.setAttribute('hidden', ''); }
  });
  if (!matched) {
    const fallback = document.querySelector('[data-route="__404"]');
    if (fallback) {
      fallback.classList.add('active'); fallback.removeAttribute('hidden');
      const h = document.getElementById('route404Hash');
      if (h) h.textContent = '#' + route;
    }
  }
  const routeNow = document.getElementById('routeNow');
  if (routeNow) routeNow.textContent = route;
  updatePagerCount();
  updateTocActive();
  if (route.startsWith('/admin') && state.role !== 'admin') state.role = 'admin';
  else if (route.startsWith('/cliente') && state.role === 'public') state.role = 'cliente';
  applyMode();
  window.scrollTo(0, 0);
  refreshCartCounts();
  normalizeSidebars();
  applyIcons();
  markActiveZoneButtons();
  injectMissingPhotos();
  fixMobileFallbackHeight();
}

// Após zoom no mobile shell, calcula altura final pra eliminar espaço vazio.
// Injeta imagens picsum em tiles de foto que estão sem <img> (tiles cinza vazios).
// Detecta divs com texto tipo "#001" + preço/check.
function injectMissingPhotos() {
  const scope = document.querySelector('.sim-screen.active');
  if (!scope) return;
  const candidates = scope.querySelectorAll('div');
  let injected = 0;
  candidates.forEach(d => {
    if (d.dataset.simPhoto) return;
    // já tem img filho direto?
    if (d.querySelector(':scope > img')) return;
    // texto começa com #NNN (ref de foto)
    const t = d.firstChild && d.firstChild.textContent ? d.firstChild.textContent.trim() : '';
    const m = (d.textContent || '').trim().match(/^#(\\d{3})/);
    if (!m) return;
    // descarta divs muito grandes (cards, não tiles)
    const r = d.getBoundingClientRect();
    if (r.width > 320) return;
    const id = m[1];
    const img = document.createElement('img');
    img.src = 'https://picsum.photos/seed/event-tile-' + id + '/200/200';
    img.loading = 'lazy';
    img.alt = '#' + id;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;';
    // garante que d é position:relative pra image inset:0 funcionar
    if (getComputedStyle(d).position === 'static') d.style.position = 'relative';
    // garante que filhos atuais ficam acima
    Array.from(d.children).forEach(c => { if (!c.style.position) c.style.position = 'relative'; if (!c.style.zIndex) c.style.zIndex = '1'; });
    d.insertBefore(img, d.firstChild);
    d.dataset.simPhoto = '1';
    injected++;
  });
  return injected;
}

function fixMobileFallbackHeight() {
  if (!document.documentElement.classList.contains('sim-force-mobile')) return;
  document.querySelectorAll('.sim-screen.active .view-desktop-fallback').forEach(fb => {
    const frame = fb.querySelector('.frame');
    if (!frame) return;
    // browsers que suportam zoom: a altura do .frame já está reduzida pelo zoom
    const fh = frame.getBoundingClientRect().height;
    if (fh > 0) fb.style.height = fh + 'px';
  });
}

function applyMode() {
  // pill da pessoa logada (visitante / Lucas / Vinícius)
  const pill = document.getElementById('modePill');
  if (pill) {
    pill.classList.remove('live-public', 'live-cliente', 'live-admin');
    if (state.role === 'cliente') {
      pill.classList.add('live-cliente');
      pill.textContent = '👤 ' + (state.user?.name?.split(' ')[0] || 'Lucas');
    } else if (state.role === 'admin') {
      pill.classList.add('live-admin');
      pill.textContent = '⚙ ' + (state.user?.name?.split(' ')[0] || 'Vinícius');
    } else {
      pill.classList.add('live-public');
      pill.textContent = 'visitante';
    }
  }
  // pill da zona da rota atual (público / cliente / admin)
  updateZonePill();
}

function routeZone(route) {
  if (route.startsWith('/admin')) return 'admin';
  if (route.startsWith('/cliente')) return 'cliente';
  return 'public';
}

function updateZonePill() {
  const zp = document.getElementById('zonePill');
  const zl = document.getElementById('zoneLabel');
  if (!zp || !zl) return;
  const z = routeZone(currentRoute());
  zp.setAttribute('data-zone', z);
  zl.textContent = z === 'admin' ? 'PAINEL ADMIN'
                 : z === 'cliente' ? 'ÁREA DO CLIENTE'
                 : 'SITE PÚBLICO';
}

// ─── Viewport switcher ──────────────────────────────────────
function applyViewport() {
  const v = state.viewport || 'auto';
  document.documentElement.classList.remove('sim-force-desktop', 'sim-force-mobile');
  if (v === 'desktop') document.documentElement.classList.add('sim-force-desktop');
  else if (v === 'mobile') document.documentElement.classList.add('sim-force-mobile');
  // update buttons
  ['vpAuto', 'vpDesktop', 'vpMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('active',
      (id === 'vpAuto' && v === 'auto') ||
      (id === 'vpDesktop' && v === 'desktop') ||
      (id === 'vpMobile' && v === 'mobile')
    );
  });
}
function setViewport(v) {
  state.viewport = v;
  saveState();
  applyViewport();
  const msg = v === 'auto' ? 'Auto · segue o tamanho da janela'
            : v === 'desktop' ? 'Layout desktop forçado'
            : 'Layout mobile forçado (simula celular)';
  toast(msg, null, 'viewport');
}

function buildToc() {
  const menu = document.getElementById('tocMenu');
  if (!menu) return;
  menu.innerHTML = '';
  const groups = { public: [], cliente: [], admin: [] };
  for (const t of TOC) groups[t.mode].push(t);
  const headers = { public: '— Público —', cliente: '— Cliente —', admin: '— Admin —' };
  for (const m of ['public', 'cliente', 'admin']) {
    if (!groups[m].length) continue;
    const head = document.createElement('div');
    head.className = 'sim-toc-section';
    head.textContent = headers[m];
    menu.appendChild(head);
    for (const t of groups[m]) {
      const item = document.createElement('div');
      item.className = 'sim-toc-item';
      item.dataset.route = t.route;
      const vp = t.hasDesktop && t.hasMobile ? '<span class="vp both">D+M</span>'
              : t.hasMobile ? '<span class="vp">📱</span>'
              : '<span class="vp">🖥</span>';
      item.innerHTML = '<span class="lbl">' + escapeHtml(t.label.replace(/^(Public|Cliente|Admin)\\s·\\s/, '')) + '</span>' + vp + '<span class="r">' + escapeHtml(t.route) + '</span>';
      item.addEventListener('click', () => {
        setRoute(t.route);
        document.getElementById('simToc').classList.remove('open');
      });
      menu.appendChild(item);
    }
  }
}
function updateTocActive() {
  const route = currentRoute();
  document.querySelectorAll('.sim-toc-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function initTopbar() {
  document.getElementById('btnHome').addEventListener('click', () => setRoute('/'));
  document.getElementById('btnBack').addEventListener('click', () => navStep(-1));
  document.getElementById('btnFwd').addEventListener('click', () => navStep(1));
  document.getElementById('btnPublic').addEventListener('click', () => { state.role = 'public'; state.user = null; saveState(); setRoute('/'); toast('Modo público', null, 'simulador'); });
  document.getElementById('btnCliente').addEventListener('click', () => {
    state.role = 'cliente';
    state.user = { name: 'Lucas Oliveira', email: 'lucas@gmail.com' };
    saveState();
    setRoute('/cliente');
    toast('Entrou como Lucas Oliveira', 'success', 'login');
  });
  document.getElementById('btnAdmin').addEventListener('click', () => {
    state.role = 'admin';
    state.user = { name: 'Vinícius Souza', email: 'vinicius@vss.fot' };
    saveState();
    setRoute('/admin');
    toast('Entrou como admin (Vinícius)', 'success', 'login');
  });
  document.getElementById('vpAuto').addEventListener('click', () => setViewport('auto'));
  document.getElementById('vpDesktop').addEventListener('click', () => setViewport('desktop'));
  document.getElementById('vpMobile').addEventListener('click', () => setViewport('mobile'));
  document.getElementById('btnToc').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('simToc').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#simToc')) document.getElementById('simToc').classList.remove('open');
  });
  document.getElementById('btnHelp').addEventListener('click', () => document.getElementById('simHelp').classList.add('open'));
  document.getElementById('helpClose').addEventListener('click', () => document.getElementById('simHelp').classList.remove('open'));
  const shareBtn = document.getElementById('btnShare');
  if (shareBtn) shareBtn.addEventListener('click', shareLink);
  const resetBtn = document.getElementById('btnReset');
  if (resetBtn) resetBtn.addEventListener('click', resetState);
}
function navStep(delta) {
  const idx = TOC.findIndex(t => t.route === currentRoute());
  const next = (idx + delta + TOC.length) % TOC.length;
  setRoute(TOC[next].route);
}

function updatePagerCount() {
  const el = document.getElementById('pagerCount');
  if (!el) return;
  const idx = TOC.findIndex(t => t.route === currentRoute());
  if (idx < 0) {
    el.innerHTML = '<b>—</b> / ' + TOC.length;
  } else {
    el.innerHTML = '<b>' + (idx + 1) + '</b> / ' + TOC.length;
  }
}

// ─── Share (copy link) ───────────────────────────────────────
function shareLink() {
  const url = location.href;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      toast('Link copiado: ' + url.replace(location.origin, ''), 'success', 'compartilhar');
    }).catch(() => {
      toast('Não foi possível copiar', 'danger', 'compartilhar');
    });
  } else {
    toast('Clipboard indisponível', 'danger', 'compartilhar');
  }
}

// ─── Reset state ─────────────────────────────────────────────
function resetState() {
  if (!confirm('Limpar tudo (carrinho, login, viewport) e voltar pro início?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  state.cart = [
    { id: 'REF #0421', price: 35 },
    { id: 'REF #1782', price: 35 },
    { id: 'REF #2945', price: 35 },
  ];
  saveState();
  applyMode();
  applyViewport();
  refreshCartCounts();
  setRoute('/');
  toast('Estado resetado · de volta ao início', 'success', 'reset');
}

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select, [contenteditable]')) return;
  if (e.key === 'h' || e.key === 'H') {
    document.getElementById('simTopbar').classList.toggle('hidden');
    document.body.style.paddingTop = document.getElementById('simTopbar').classList.contains('hidden') ? '0' : '48px';
  } else if (e.key === '?') {
    document.getElementById('simHelp').classList.toggle('open');
  } else if (e.key === 'm' || e.key === 'M') {
    setViewport(state.viewport === 'mobile' ? 'auto' : 'mobile');
  } else if (e.key === 'd' || e.key === 'D') {
    setViewport(state.viewport === 'desktop' ? 'auto' : 'desktop');
  } else if (e.key === 'ArrowLeft' && e.altKey) {
    navStep(-1);
  } else if (e.key === 'ArrowRight' && e.altKey) {
    navStep(1);
  } else if (e.key === 'Escape') {
    document.getElementById('simLightbox').classList.remove('open');
    document.getElementById('simHelp').classList.remove('open');
    document.getElementById('simToc').classList.remove('open');
  }
});

function addToCart(id, price) {
  if (!state.cart.find(i => i.id === id)) {
    state.cart.push({ id, price: price || 35 });
    saveState();
    toast('Foto ' + id + ' adicionada ao carrinho', 'success', 'carrinho');
  } else {
    toast('Já está no carrinho', null, 'carrinho');
  }
  refreshCartCounts();
}
function refreshCartCounts() {
  const n = state.cart.length;
  document.querySelectorAll('.nav-cart .count, [data-cart-count]').forEach(el => {
    el.textContent = n;
  });
}

function initLightbox() {
  document.getElementById('lbClose').addEventListener('click', closeLightbox);
  document.getElementById('lbPrev').addEventListener('click', () => stepLightbox(-1));
  document.getElementById('lbNext').addEventListener('click', () => stepLightbox(1));
  document.getElementById('lbAdd').addEventListener('click', () => {
    const id = document.getElementById('lbMeta').textContent;
    addToCart(id, 35);
  });
  document.getElementById('simLightbox').addEventListener('click', (e) => {
    if (e.target.id === 'simLightbox') closeLightbox();
  });
}
let _lbList = []; let _lbIdx = 0;
function openLightbox(list, idx) {
  _lbList = list; _lbIdx = idx;
  renderLightbox();
  document.getElementById('simLightbox').classList.add('open');
}
function renderLightbox() {
  const item = _lbList[_lbIdx];
  if (!item) return;
  document.getElementById('lbPhoto').src = item.src;
  document.getElementById('lbMeta').textContent = item.id || ('REF #' + String(_lbIdx + 1).padStart(4, '0'));
}
function stepLightbox(d) {
  _lbIdx = (_lbIdx + d + _lbList.length) % _lbList.length;
  renderLightbox();
}
function closeLightbox() {
  document.getElementById('simLightbox').classList.remove('open');
}

// ─── Biblioteca de ícones: substitui SVG inline em <a> de sidebars/navs ──
// Mapeamento texto-base (normalizado) → id de símbolo Lucide.
const ICON_BY_TEXT = {
  'inicio': 'home', 'home': 'home', 'dashboard': 'layout-dashboard',
  'compras': 'shopping-bag', 'pedidos': 'shopping-bag',
  'carrinho': 'shopping-cart', 'carrinhos': 'shopping-cart',
  'salvos': 'bookmark', 'salvos & curtidas': 'bookmark', 'favoritos': 'bookmark',
  'comentarios': 'message-square', 'comentários': 'message-square',
  'remocoes': 'shield-off', 'remoções': 'shield-off', 'remoções lgpd': 'shield-off',
  'notificacoes': 'bell', 'notificações': 'bell',
  'chat': 'message-circle',
  'reconhecimento': 'scan-face',
  'configuracoes': 'settings', 'configurações': 'settings', 'config': 'settings',
  'sair': 'log-out', 'logout': 'log-out', 'entrar': 'log-in', 'login': 'log-in',
  'recompensas': 'gift',
  'downloads': 'download',
  'historico': 'clock', 'histórico': 'clock',
  'estatisticas': 'bar-chart-2', 'estatísticas': 'bar-chart-2',
  'eventos': 'folder', 'eventos / albuns': 'folder', 'eventos / álbuns': 'folder', 'albuns': 'folder', 'álbuns': 'folder',
  'criar evento': 'plus', 'novo evento': 'plus', '+ cadastrar': 'plus',
  'upload': 'upload', 'upload de fotos': 'upload', 'upload fotos': 'upload',
  'fotos': 'image',
  'videos': 'video', 'vídeos': 'video',
  'clientes': 'users', 'colaboradores': 'users',
  'cupons': 'ticket',
  'propostas': 'file-text', 'contratos': 'file-text', 'termos': 'file-text', 'privacidade': 'file-text', 'cookies': 'file-text',
  'contatos': 'mail', 'fale conosco': 'mail', 'contato': 'mail',
  'repasses': 'scale', 'financeiro': 'scale',
  "marca d'agua": 'image', "marca d'água": 'image',
  'personalizar': 'palette',
  'storage': 'database',
  'logs': 'list', 'logs & auditoria': 'list', 'auditoria': 'list',
  'jobs': 'briefcase', 'fila de jobs': 'briefcase',
  'reset': 'rotate-ccw',
  'autenticidade': 'lock', 'acesso negado': 'lock', '403': 'lock',
  'buscar': 'search', 'busca': 'search',
};

function normalizeIconKey(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/\\s+/g, ' ')
    .replace(/[·•—–]/g, ' ')
    .replace(/[0-9]+$/g, '').trim()
    .replace(/\\s+(beta|novo)$/i, '').trim();
}

function findIconForText(text) {
  if (!text) return null;
  const key = normalizeIconKey(text);
  if (ICON_BY_TEXT[key]) return ICON_BY_TEXT[key];
  // tenta primeira palavra
  const first = key.split(' ')[0];
  if (ICON_BY_TEXT[first]) return ICON_BY_TEXT[first];
  // tenta sem acentos (fallback)
  const flat = key.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (ICON_BY_TEXT[flat]) return ICON_BY_TEXT[flat];
  return null;
}

// Injeta o shell (sidebar + main) em rotas admin/cliente que NÃO foram desenhadas
// com sidebar nos mockups originais (acontece em ~18 rotas admin).
function injectMissingSidebar(scope) {
  if (!scope) return;
  const route = currentRoute();
  const isAdmin = route.startsWith('/admin');
  const isCliente = route.startsWith('/cliente');
  if (!isAdmin && !isCliente) return;
  // Procura o frame do desktop (e do mobile NÃO tocamos)
  scope.querySelectorAll(':scope > .view-desktop > .frame, :scope > .view-desktop-fallback > .frame').forEach(frame => {
    const sideSel = isAdmin ? 'aside.adm-side' : 'aside.acc-side';
    if (frame.querySelector(sideSel)) return; // já tem sidebar — nada a fazer
    if (frame.dataset.simShelled) return;
    // Move TODO o conteúdo do frame pra dentro de um novo main.
    // Mantém adm-topbar fora do main (se existir): ele fica acima do shell.
    const topbar = frame.querySelector(':scope > .adm-topbar');
    const childrenSnapshot = Array.from(frame.children);
    const shell = document.createElement('div');
    shell.className = isAdmin ? 'adm' : 'acc';
    const aside = document.createElement('aside');
    aside.className = isAdmin ? 'adm-side' : 'acc-side';
    const main = document.createElement('main');
    main.className = isAdmin ? 'adm-main' : 'acc-main';
    // tudo exceto adm-topbar vira filho do main
    childrenSnapshot.forEach(c => {
      if (c === topbar) return;
      main.appendChild(c);
    });
    shell.appendChild(aside);
    shell.appendChild(main);
    // monta de volta: topbar (se houver) + shell
    if (topbar && topbar.parentNode !== frame) frame.appendChild(topbar);
    frame.appendChild(shell);
    frame.dataset.simShelled = '1';
  });
}

// Substitui o conteúdo das sidebars por versões canônicas (consistência total).
function normalizeSidebars() {
  const scope = document.querySelector('.sim-screen.active');
  if (!scope) return;
  injectMissingSidebar(scope);
  // cliente
  scope.querySelectorAll('aside.acc-side').forEach(aside => {
    aside.removeAttribute('style');
    aside.innerHTML = CANONICAL_CLIENT_SIDEBAR_HTML;
  });
  // admin
  scope.querySelectorAll('aside.adm-side').forEach(aside => {
    aside.removeAttribute('style');
    aside.innerHTML = CANONICAL_ADMIN_SIDEBAR_HTML;
  });
  // atualiza nome do user na sidebar
  const userName = state.user?.name || (state.role === 'admin' ? 'Vinícius Souza' : (state.role === 'cliente' ? 'Lucas Oliveira' : 'visitante'));
  scope.querySelectorAll('.sim-user-name').forEach(el => { el.textContent = userName; });
  // marca link ativo baseado na rota
  const route = currentRoute();
  scope.querySelectorAll('[data-sim-route]').forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-sim-route') === route);
  });
}

// Marca o botão Público/Cliente/Admin acordo com a ZONA da rota atual
function markActiveZoneButtons() {
  const z = routeZone(currentRoute());
  ['btnPublic', 'btnCliente', 'btnAdmin'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('zone-active');
  });
  const btn = z === 'public' ? document.getElementById('btnPublic')
            : z === 'cliente' ? document.getElementById('btnCliente')
            : document.getElementById('btnAdmin');
  if (btn) btn.classList.add('zone-active');
}

function applyIcons() {
  // Substitui <svg> inline em links de sidebars/navs por símbolo Lucide
  // (mantém atributos visuais; só troca conteúdo).
  const scope = document.querySelector('.sim-screen.active');
  if (!scope) return;
  const candidates = scope.querySelectorAll(
    '.acc-side a, .adm-side a, .m-drawer a, .m-acc-side a, ' +
    '.sidebar a, nav.adm-nav a, .adm-section-nav a'
  );
  candidates.forEach(a => {
    if (a.dataset.simIcon) return; // já processado
    const svg = a.querySelector(':scope > svg');
    if (!svg) return;
    // pega o texto literal do link (sem badges/contadores)
    const clone = a.cloneNode(true);
    // remove badges e svg do clone pra pegar só texto
    clone.querySelectorAll('svg, .badge, .count, .num, [class*=badge]').forEach(el => el.remove());
    const text = clone.textContent.trim();
    const icon = findIconForText(text);
    if (!icon) { a.dataset.simIcon = 'none'; return; }
    // preserva largura/altura/viewBox do svg
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const useEl = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    useEl.setAttribute('href', '#sim-i-' + icon);
    svg.appendChild(useEl);
    a.dataset.simIcon = icon;
  });
}

function bindEventTabs() {
  document.querySelectorAll('.sim-screen.active .ev-tab').forEach(btn => {
    if (btn.dataset.simBound) return;
    btn.dataset.simBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-ev-tab');
      const scope = btn.closest('.sim-screen');
      if (!scope) return;
      scope.querySelectorAll('.ev-tab').forEach(b => b.classList.toggle('active', b === btn));
      scope.querySelectorAll('.ev-pane').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-ev-pane') === id);
      });
    });
  });
}

function bindGalleryPhotos() {
  document.querySelectorAll('.sim-screen.active .photo-tile').forEach((tile, i) => {
    if (tile.dataset.simBound) return;
    tile.dataset.simBound = '1';
    const id = tile.querySelector('.photo-tile__id')?.textContent || ('REF #' + String(i + 1).padStart(4, '0'));
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.cart-btn, [data-cart-bump]')) return;
      const list = [];
      document.querySelectorAll('.sim-screen.active .photo-tile').forEach((t, j) => {
        const src = t.querySelector('img')?.src || ('https://picsum.photos/seed/sim-' + j + '/1200/1200');
        const refid = t.querySelector('.photo-tile__id')?.textContent || ('REF #' + String(j + 1).padStart(4, '0'));
        list.push({ src, id: refid });
      });
      const idx = Array.from(document.querySelectorAll('.sim-screen.active .photo-tile')).indexOf(tile);
      openLightbox(list, idx >= 0 ? idx : 0);
    });
    const cartBtn = tile.querySelector('.cart-btn, [data-cart-bump]');
    if (cartBtn) {
      cartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(id, 35);
      });
    }
  });
}

function bindNavLinks() {
  if (document._simNavBound) return;
  document._simNavBound = true;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a, button');
    if (!a) return;
    if (a.closest('.sim-topbar, .sim-help-overlay, .sim-lightbox-overlay')) return;
    if (a.hasAttribute('data-modal-open') || a.hasAttribute('data-modal-close')) return;
    if (a.hasAttribute('data-drawer-open') || a.hasAttribute('data-drawer-close')) return;
    if (a.hasAttribute('data-tab-target')) return;
    if (a.hasAttribute('data-toggle')) return;
    if (a.hasAttribute('data-cart-toggle')) return;
    if (a.classList.contains('cart-btn') || a.hasAttribute('data-cart-bump')) return;
    if (a.hasAttribute('data-ev-tab') || a.classList.contains('ev-tab')) return;

    // data-sim-route (sidebar canônica) — prioridade absoluta
    const simRoute = a.getAttribute('data-sim-route');
    if (simRoute) {
      e.preventDefault();
      if (simRoute === '__logout__') {
        state.role = 'public'; state.user = null; saveState();
        toast('Sessão encerrada', null, 'logout');
        setRoute('/');
      } else {
        setRoute(simRoute);
      }
      return;
    }

    const txt = (a.textContent || '').trim().toLowerCase();
    const href = (a.getAttribute('href') || '').trim();

    if (href.startsWith('#/')) { return; }
    if (href && href !== '#' && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      if (href.startsWith('/')) { e.preventDefault(); setRoute(href); return; }
    }

    const cls = a.className || '';

    // login submit (form/.auth-card) — ANTES de "entrar→/login"
    if (/^(entrar|fazer login|login)$/.test(txt) && a.closest('form, .auth-card, .login-card, .login-box, .login-page, [class*=login]')) {
      e.preventDefault();
      const formEl = a.closest('form, .frame, .auth-card');
      const email = (formEl && formEl.querySelector('input[type=email], input[name=email]'))
        ? formEl.querySelector('input[type=email], input[name=email]').value.trim()
        : '';
      if (email && email.toLowerCase().includes('admin')) {
        state.role = 'admin'; state.user = { name: 'Admin', email };
        saveState(); setRoute('/admin');
        toast('Entrou como admin', 'success', 'login');
      } else {
        state.role = 'cliente'; state.user = { name: 'Lucas Oliveira', email: email || 'lucas@gmail.com' };
        saveState(); setRoute('/cliente');
        toast('Login efetuado', 'success', 'login');
      }
      return;
    }
    if (/^(criar conta|cadastrar|criar minha conta|criar uma conta)$/.test(txt) && a.closest('form, .auth-card, [class*=cadastro], [class*=signup]')) {
      e.preventDefault();
      state.role = 'cliente';
      const formEl = a.closest('form, .frame, .auth-card');
      const email = (formEl && formEl.querySelector('input[type=email], input[name=email]'))
        ? formEl.querySelector('input[type=email], input[name=email]').value.trim()
        : '';
      state.user = { name: 'Lucas Oliveira', email: email || 'lucas@gmail.com' };
      saveState(); setRoute('/cadastro-sucesso');
      toast('Conta criada', 'success', 'cadastro');
      return;
    }

    if (/^(entrar|fazer login)$/.test(txt) || cls.includes('nav-login') || cls.includes('home-login')) {
      e.preventDefault(); setRoute('/login'); return;
    }
    if (/^(sair|logout|encerrar sessão)$/.test(txt) || cls.includes('nav-logout')) {
      e.preventDefault();
      state.role = 'public'; state.user = null; saveState();
      toast('Sessão encerrada', null, 'logout');
      setRoute('/');
      return;
    }
    if ((cls.includes('nav-cart') && a.matches('button, a')) || /^carrinho$/.test(txt)) {
      e.preventDefault();
      const target = state.role === 'cliente' ? '/cliente/carrinho' : '/carrinho';
      setRoute(target); return;
    }
    if (cls.includes('nav-logo-link')) {
      e.preventDefault();
      setRoute(state.role === 'admin' ? '/admin' : (state.role === 'cliente' ? '/cliente' : '/'));
      return;
    }
    if (/^ver álbuns$/.test(txt) || /^ver fotos$/.test(txt)) {
      e.preventDefault(); setRoute('/evento/safra-2026'); return;
    }
    if (/^(criar conta|cadastrar|criar uma conta)$/.test(txt) && !a.closest('form, .auth-card')) {
      e.preventDefault(); setRoute('/cadastro'); return;
    }
    if (/^esqueci a senha$/.test(txt) || /esqueceu/i.test(txt)) {
      e.preventDefault(); setRoute('/recuperar-senha'); return;
    }

    if (/^(finalizar compra|ir para checkout|checkout)$/.test(txt)) {
      e.preventDefault(); setRoute('/checkout'); return;
    }
    if (/^(pagar com pix|gerar pix)$/.test(txt)) { e.preventDefault(); setRoute('/checkout/pix'); return; }
    if (/^(pagar com cart[ãa]o|finalizar pagamento)$/.test(txt)) { e.preventDefault(); setRoute('/checkout/confirmado'); return; }
    if (/^gerar boleto$/.test(txt)) { e.preventDefault(); setRoute('/checkout/boleto'); return; }
    if (/^baixar fotos$/.test(txt)) { e.preventDefault(); toast('Download simulado (em produção, baixaria zip)', 'success', 'downloads'); return; }

    const destructivePat = /^(excluir|deletar|apagar|remover|banir|bloquear|aprovar|rejeitar|reembolsar|cancelar|recusar|encerrar|resetar|expulsar|silenciar|desativar)/;
    if (destructivePat.test(txt)) {
      e.preventDefault();
      toast('Ação simulada · em produção, "' + a.textContent.trim() + '" seria aplicada de verdade', null, 'ação');
      return;
    }

    // Sidebar / nav links: mapeia texto-base → rota.
    // Tira badges, contadores, ícones; usa só o texto literal do link.
    const linkText = (() => {
      const clone = a.cloneNode(true);
      clone.querySelectorAll('svg, .badge, .count, [class*="badge"], [class*="kbd"]').forEach(el => el.remove());
      let t = clone.textContent.trim().toLowerCase();
      t = t.replace(/\\s+/g, ' ');
      t = t.replace(/\\s+(beta|novo|new)$/i, '');
      t = t.replace(/\\s*\\d+\\s*$/, '');
      return t.trim();
    })();

    const isAdminScope = !!a.closest('.adm-side, .adm-topbar, .m-drawer#admDrawer1, [class*=adm-]');
    const sidebarMap = {
      'início': isAdminScope ? '/admin' : '/cliente',
      'inicio': isAdminScope ? '/admin' : '/cliente',
      'home': '/',
      'dashboard': isAdminScope ? '/admin' : '/cliente',
      'compras': '/cliente/compras',
      'carrinho': state.role === 'cliente' ? '/cliente/carrinho' : '/carrinho',
      'salvos': '/cliente/favoritos',
      'salvos & curtidas': '/cliente/favoritos',
      'favoritos': '/cliente/favoritos',
      'comentários': isAdminScope ? '/admin/comentarios' : '/cliente/comentarios',
      'remoções': isAdminScope ? '/admin/remocoes' : '/cliente/remocoes',
      'remoções lgpd': '/cliente/remocoes',
      'notificações': isAdminScope ? '/admin/notificacoes' : '/cliente/notificacoes',
      'chat': isAdminScope ? '/admin/chat' : '/cliente/chat',
      'reconhecimento': isAdminScope ? '/admin/reconhecimento' : '/cliente/reconhecimento',
      'configurações': isAdminScope ? '/admin/configuracoes' : '/cliente/configuracoes',
      'recompensas': isAdminScope ? '/admin/recompensas' : '/cliente/recompensas',
      'downloads': '/cliente/downloads-expirando',
      'minha conta': '/cliente',
      // admin
      'estatísticas': '/admin/estatisticas',
      'eventos': '/admin/eventos',
      'eventos / álbuns': '/admin/eventos',
      'álbuns': '/admin/eventos',
      'criar evento': '/admin/eventos/novo',
      '+ novo evento': '/admin/eventos/novo',
      'novo evento': '/admin/eventos/novo',
      'upload': '/admin/eventos/123-upload',
      'upload de fotos': '/admin/eventos/123-upload',
      'pedidos': '/admin/pedidos',
      'carrinhos': '/admin/carrinhos',
      'cupons': '/admin/cupons',
      'propostas': '/admin/propostas',
      'repasses': '/admin/repasses',
      'clientes': '/admin/clientes',
      'colaboradores': '/admin/colaboradores',
      'contatos': '/admin/contatos',
      'storage': '/admin/storage',
      'logs': '/admin/logs',
      'logs & auditoria': '/admin/logs',
      'jobs': '/admin/jobs',
      'fila de jobs': '/admin/jobs',
      "marca d'água": '/admin/marca-dagua',
      'personalizar': '/admin/personalizar',
      'reset': '/admin/reset',
      // público
      'fale conosco': '/contato',
      'contato': '/contato',
      'termos': '/termos',
      'privacidade': '/privacidade',
      'cookies': '/cookies',
      'autenticidade': '/autenticidade',
      'ver álbuns': '/evento/safra-2026',
      'ver fotos': '/evento/safra-2026',
    };
    if (sidebarMap[linkText]) { e.preventDefault(); setRoute(sidebarMap[linkText]); return; }
    if (sidebarMap[txt]) { e.preventDefault(); setRoute(sidebarMap[txt]); return; }

    const card = a.closest('.event-card, [data-event-id]');
    if (card && a.classList.contains('event-card')) {
      e.preventDefault();
      setRoute('/evento/safra-2026');
      return;
    }
  }, true);
}

function init() {
  buildToc();
  initTopbar();
  initLightbox();
  bindNavLinks();
  applyMode();
  applyViewport();
  if (!localStorage.getItem(STORAGE_KEY)) {
    state.cart = [
      { id: 'REF #0421', price: 35 },
      { id: 'REF #1782', price: 35 },
      { id: 'REF #2945', price: 35 },
    ];
    saveState();
  }
  if (!location.hash || location.hash === '#') {
    location.replace('#/');
  }
  renderRoute();
  window.addEventListener('hashchange', () => {
    renderRoute();
    setTimeout(() => { bindGalleryPhotos(); bindEventTabs(); }, 60);
  });
  setTimeout(() => { bindGalleryPhotos(); bindEventTabs(); }, 100);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
</script>
</body>
</html>
`;

  fs.writeFileSync(OUT, out, 'utf8');
  console.log('— escrito:', path.basename(OUT), '(' + (out.length / 1024).toFixed(1) + ' KB · ' + out.split('\n').length + ' linhas)');

  return {
    total: allScreens.length,
    routes: routes.size,
    unmapped: unmapped.length,
    dropped: dropped.length,
    publicoCount: publico.length,
    clienteCount: cliente.length,
    adminCount: admin.length,
    routesWithBoth: [...routes.values()].filter(r => r.desktop && r.mobile).length,
    routesDesktopOnly: [...routes.values()].filter(r => r.desktop && !r.mobile).length,
    routesMobileOnly: [...routes.values()].filter(r => !r.desktop && r.mobile).length,
  };
}

function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

const stats = build();
console.log('— stats', stats);

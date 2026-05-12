# PATCH v1.0.23 — Mojibake · Imagens · Inputs
**Data:** 2026-05-12  
**Escopo:** admin.html (principal), cliente.html (cross-check), publico.html (cross-check)

---

## admin.html — Mojibake (TAREFA 1)

### Diagnóstico
O arquivo sofreu dupla-codificação: bytes UTF-8 foram interpretados como
Windows-1252 (CP1252) e re-codificados como UTF-8. Isso gerou três camadas
de mojibake que precisaram ser resolvidas sequencialmente:

1. **Camada Ã (C3 83 + sufixo)** — letras PT-BR maiúsculas duplo-codificadas  
2. **Aspas tipográficas como delimitadores HTML** — U+201C/U+201D substituídas  
   por `"` ASCII; U+2019 por `'` ASCII  
3. **Camada â (C3 A2 + sufixo)** — símbolos Unicode (setas, ⌘, ●, ★ etc.)

### Totais por passagem

| Passagem | Padrões encontrados | Replacements |
|---------|---------------------|-------------|
| Fix_moji2 (parcial, não funcionou) | — | 5 (errados) |
| Byte-level pass 1: C3 83 sequences | 10 padrões distintos | 70x |
| Byte-level pass 2: smart quotes E2 80 9x → ASCII | 3 padrões | 248x |
| **Total pass 1+2** | | **318** |
| Byte-level pass 3: C3 A2 sequences (setas, ⌘, ●…) | 8 padrões | 119x |
| Byte-level pass 4: ★, ◆, ∞, ≈, –, ✓, ‹, › | 8 padrões | 41x |
| **TOTAL GERAL** | | **478 replacements** |

### Top 5 mojibakes corrigidos

| Mojibake (bytes) | Correto | Ocorrências | Onde aparecia |
|-----------------|---------|-------------|--------------|
| `C3 83 E2 80 9C` | `Ó` | 10x | FOTÓGRAFO (role label) |
| `C3 83 C5 A1` | `Ú` | 17x | PÚBLICO, PÚBLICA |
| `E2 80 9D` → `"` | `"` (ASCII) | 220x | Aspas HTML em adm-avatar-pill |
| `C3 A2 E2 80 94 C2 8F` | `●` | 80x | Barra de sinal mobile (●●●●● 100%) |
| `C3 A2 CB 9C E2 80 A6` | `★` | 14x | Badges ★ OURO, ★ PRATA, ★ BRONZE |

### Outros exemplos corrigidos

- `âŒ˜K` → `⌘K` (8x — atalho de busca)
- `â†»` → `↻` (1x — botão switch role na sidebar)
- `â†—` → `↗` (6x — delta/variação nos KPIs)
- `PÃšBLICO` → `PÚBLICO` (9x — badge de eventos públicos)
- `FOTÃ"GRAFO` → `FOTÓGRAFO` (9x — role na topbar/avatar)
- `FOTÃ"GRAFA` → `FOTÓGRAFA` (1x — badge colaboradora)
- `05â€"06` → `05–06` (9x — spans de tela numéricos)
- `MÃŠ` → `Ê` (6x — MÊSATIVOS etc.)
- `MODERAÃ‡ÃƒO` → `MODERAÇÃO` (via Ç+ÃO chain)
- `âŒ›` → `⌛` (1x — ícone sem mexer há 24h)
- `â‹¯` → `⋯` (7x — botões de menu kebab)

### adm-avatar-pill HTML corrigido
As instâncias nas telas 02, 03, 07, 15-17 tinham aspas tipográficas `"` (U+201D)
usadas como delimitadores de atributos HTML em vez de `"` ASCII. Após a
substituição em massa de U+201D → ASCII `"`, a estrutura HTML voltou a ser válida:

```html
<!-- ANTES (quebrado): -->
<div class="adm-avatar-pill"><div class="avatar" style="width:26px…">

<!-- DEPOIS (correto): -->
<div class="adm-avatar-pill"><div class="avatar" style="width:26px…">
```

Resultado: foto (pravatar.cc/100?img=12) renderiza corretamente, role mostra
FOTÓGRAFO sem mojibake.

### Confirmação zero-mojibake
- `C3 83` sem sequência ÃO: 0 linhas restantes
- Smart quotes U+201C/201D/2019: 0 ocorrências
- FOTÔGRAFO (errado): 0 — FOTÓGRAFO (correto): 9
- PÃšBLICO (errado): 0 — PÚBLICO (correto): 9
- ⌘ (correto): 8 — âŒ˜ (errado): 0
- Os 8 Ã restantes são todos legítimos: NÃO (7x), ÂNCORA (1x)

---

## admin.html — Imagens (TAREFA 2)

### adm-avatar-pill
- Todas as instâncias já tinham `<img src="https://i.pravatar.cc/100?img=12">`.
- Problema era as **aspas HTML** (U+201D) que impediam o browser de parsear
  `class="avatar"` e `src="…"` — corrigido pela passagem de mojibake.
- Resultado: foto de Vinícius renderiza em todos os 8 `adm-avatar-pill`.

### Outras imagens
- Photo grid (telas 03/04): `picsum.photos/seed/sport01-18/` — OK, sem alteração.
- Capas de eventos: `picsum.photos/seed/rodeo01/`, `run01/`, `race01/` etc. — OK.
- Logos de patrocinadores: `via.placeholder.com/128x80/…` — OK.
- Avatares em logs: `pravatar.cc/100?img=12` — OK.
- **Nenhum `<img>` com `src` vazio ou quebrado encontrado.**

---

## admin.html — Inputs dark theme (TAREFA 3)

`shared.css` já cobre `input[type=*]`, `textarea` e `select` com dark theme
(background: var(--ink-300), border: 1px solid var(--ink-500), focus ring etc.).

Adicionado bloco CSS local em `<style>` do admin.html com seletores `.adm-main`
para garantir dark theme em **inputs standalone** (fora de `.field`, como o
`<input placeholder="Buscar cliente…">` em tela 12) e em `<select>` inline:

- `background: var(--ink-200)` + `border: 1px solid var(--ink-500)`
- `:focus` com `border-color: var(--brand-500)` + `box-shadow: var(--focus-ring)`
- `::placeholder { color: var(--ink-700) }`
- Select com seta customizada via background-image SVG
- Cobertura mobile (`.phone .m-adm-card input/select/textarea`)

---

## cliente.html — Cross-check Mojibake

**Resultado: CLEAN** — 0 mojibakes a corrigir.

Os únicos Ã encontrados são parte de palavras portuguesas legítimas:
- `MODERAÇÃO` (linha 1627 e 1692) — padrão UTF-8 correto: `C3 87 C3 83 4F` (ÇÃO)

Bump versão: v1.0.22 → v1.0.23

---

## publico.html — Cross-check Mojibake

**Resultado: CLEAN** — 0 mojibakes a corrigir.

Os únicos Ã encontrados são parte de palavras portuguesas legítimas:
- `REMOÇÃO` (linha 1968) — ÇÃO legítimo
- `CONFIRMAÇÃO` (linhas 2687, 2811, 2862, 2961) — ÇÃO legítimo
- `elegância`, `Goiânia`, `retângulo`, `dinâmico` — â legítimo

Bump versão: v1.0.22 → v1.0.23

---

## Arquivos modificados

| Arquivo | Versão | Mojibake fixados | Imagens | Inputs |
|---------|--------|-----------------|---------|--------|
| admin.html | v1.0.22 → v1.0.23 | 478 replacements | adm-avatar-pill HTML quotes fixed | CSS block adicionado |
| cliente.html | v1.0.22 → v1.0.23 | 0 (já OK) | — | — |
| publico.html | v1.0.22 → v1.0.23 | 0 (já OK) | — | — |

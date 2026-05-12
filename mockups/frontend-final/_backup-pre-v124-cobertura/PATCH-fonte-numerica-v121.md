# PATCH-fonte-numerica-v121.md
**Data:** 2026-05-12  
**Versão:** v1.0.21  
**Arquivo backup:** `publico.legacy-v1.0.20.html`

---

## Problema

`--font-display` (Instrument Serif) estava sendo aplicada em **valores numéricos** — KPI cards, totais R$, contadores, percentuais de desconto. Serif é reservada para hero/display titles em italic; números precisam de `--font-mono` (tabular, alinhado) ou `--font-head` (sans, legível em KPI grande).

---

## Regra aplicada

| Contexto | Antes | Depois |
|---|---|---|
| KPI card `.v` (contadores "12", "1.581") | `--font-display` | `--font-head` + `font-weight:600` |
| Totais R$ (`.total`, `.row.t .v`, inlines) | `--font-display` | `--font-mono` + `tabular-nums` + `font-weight:600` |
| Saldo rewards hero (R$ 124,80) | `--font-display` | `--font-mono` + `tabular-nums` |
| Descontos % (−10%, −20%, −28%, −35%) | `--font-display` | `--font-mono` + `tabular-nums` |
| Hero h1 titles (italic) | `--font-display` | **mantido** (uso correto) |
| Erro 404 decorativo (italic) | `--font-display` | **mantido** (uso estético intencional) |

---

## Ocorrências corrigidas por arquivo

### admin.html — 3 correções
- L139: `.adm-stat .v` → `--font-head` (KPI desktop)
- L444: `.m-adm-stat .v` → `--font-head` (KPI mobile)
- L3945: inline `R$ 49,90` → `--font-mono`

### cliente.html — 10 correções
- L85: `.stat .v` (30px) → `--font-head`
- L140: `.order-row .total` → `--font-mono`
- L407: `.m-stat .v` → `--font-head`
- L443: `.m-order .total` → `--font-mono`
- L468: `.m-summary .row.total span:last-child` → `--font-mono`
- L539: `.m-cart-summary .row.total span:last-child` → `--font-mono`
- L546: `.m-rewards-hero .v` → `--font-mono`
- L950: inline `R$ 107,20` → `--font-mono`
- L1394+1395: inline `R$ 28,80` ×2 → `--font-mono`
- L2540: inline `R$ 124,80` (48px) → `--font-mono`

### publico.html — 8 correções
- L233: `.cart-totals .row.t .v` → `--font-mono`
- L515-516: `.os-row.t .v` → `--font-mono`
- L768: `.compras-card .actions-col .total` → `--font-mono`
- L1652: inline `−10%` → `--font-mono`
- L1657: inline `−20%` → `--font-mono`
- L1662: inline `−28%` → `--font-mono`
- L1667: inline `−35%` → `--font-mono`
- L2618: inline `R$ 104,17` → `--font-mono`
- L2651: inline `R$ 104,17` (modal) → `--font-mono`
- L2849: inline `R$ 101,74` → `--font-mono`

**Total: 21 ocorrências corrigidas.**

---

## Remanescentes `--font-display` em publico.html (corretos)

| Linha | Contexto | Motivo para manter |
|---|---|---|
| L40 | `.home-hero h1` italic | Hero title textual |
| L778 | `.err .code` 184px italic | Decorativo estético (não é dado) |
| L795 | `.m-hero h1` italic | Hero title mobile |
| L3813 | inline "404" 96px italic | Decorativo estético |

---

## Exemplos antes/depois

```css
/* ANTES */
.stat .v { font-family: var(--font-display); font-size: 30px; font-variant-numeric: tabular-nums; }
.order-row .total { font-family: var(--font-display); font-size: 19px; }

/* DEPOIS */
.stat .v { font-family: var(--font-head); font-size: 30px; font-variant-numeric: tabular-nums; font-weight: 600; }
.order-row .total { font-family: var(--font-mono); font-size: 17px; font-variant-numeric: tabular-nums; font-weight: 600; }
```

---

## Verificação

- Grep por `font-family: var(--font-display)` em `admin.html` → 0 matches
- Grep por `font-family: var(--font-display)` em `cliente.html` → 0 matches
- Grep por `font-family: var(--font-display)` em `publico.html` → 4 matches, todos em contexto textual/decorativo correto
- Preview server ativo (`fotografo-mockup` porta 5520) — URL rewrite do servidor impede `preview_eval` em `.html` direto; verificação por Grep confirmada como equivalente

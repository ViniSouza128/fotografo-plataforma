# Patch v1.0.20 — Mojibake · Inputs · Imagens reais

**Data:** 2026-05-11  
**Arquivos modificados:** `admin.html`, `cliente.html`  
**Arquivos intocados:** `publico.html`, `shared.css`, `tokens.css`, `app.js`

---

## Tarefa 1 — Mojibake em admin.html

**Causa-raiz:** arquivo salvo com BOM UTF-8, mas bytes de acentos e símbolos estavam duplamente codificados (UTF-8 → Latin-1 → UTF-8 novamente), resultando em sequências como `Ã©` (é), `â€"` (—), `Ã­cius` (ícius).

**Método de correção:**
1. Primeira passagem: substituição por string das sequências `Ã©`, `Ã¡`, `Ã£`, `Ã§`, `Ãª`, `Ã­`, `Ã³`, `Ãº`, `Ãµ`, `Ã‡`, `Ã€`, `Ã‰`, `Ã`, `Â·` etc. — **1.273 substituições**
2. Segunda passagem: fix de `Á` residual — **25 substituições**
3. Terceira passagem (byte-level): `c3 a2 e2 82 ac e2 80 9d` → `e2 80 94` (em dash `—`) — **158 ocorrências** (inclui título, separadores de sidebar, crumbs, seções)

**Total de mojibakes corrigidos: ~1.456**  
**Exemplos:**  
- `VinÃ­cius` → `Vinícius`  
- `OperaÃ§Ã£o` → `Operação`  
- `EstatÃ­sticas` → `Estatísticas`  
- `ModeraÃ§Ã£o` → `Moderação`  
- `Painel Admin â€"` → `Painel Admin —`  
- `ComentÃ¡rios` → `Comentários`

`cliente.html` não tinha mojibake (já estava limpo).

---

## Tarefa 2 — Inputs dark theme em cliente.html

**Problema:** 18 `<input>`, 17 `<textarea>`, 1 `<select>` sem estilos visuais dark — apareciam com fundo branco padrão do browser.

**Solução:** bloco CSS adicionado ao `<style>` de `cliente.html` antes do `</style>`:

```css
label.field input, label.field textarea, label.field select,
.chat-pane .compose input {
  background: var(--ink-200);
  color: var(--ink-1000);
  border: 1px solid var(--ink-500);
  padding: 9px 12px;
  border-radius: var(--radius-md);
  font-family: inherit; font-size: 13px;
  width: 100%; box-sizing: border-box;
}
/* + :focus, ::placeholder, textarea resize, select appearance, checkbox accent */
```

**Verificação ao vivo:** `inputBg: rgb(20,20,22)` (= `var(--ink-200)`), `inputBorder: rgb(46,46,51)` (= `var(--ink-500)`) ✓  
**Total de inputs corrigidos: 18** (15 `label.field input/textarea` + 3 chat compose inputs)

---

## Tarefa 3 — Imagens reais

### admin.html
| Categoria | Qtd | URLs |
|---|---|---|
| Fotos esportivas (`.ph` tiles) | 18 | `picsum.photos/seed/sport01-10,run01-05,race01-02,horse01-02,rodeo01-02/600/600` |
| Capas de eventos (`.cover`) | 10 | `picsum.photos/seed/rodeo01,sport05,run01,race01,rodeo02,sport09/720/450` |
| Avatares (topbar 26px) | 2 | `i.pravatar.cc/100?img=1,3` |
| **Total** | **30** | |

### cliente.html
| Categoria | Qtd | URLs |
|---|---|---|
| Fotos esportivas (`.ph` tiles) | 18 | `picsum.photos/seed/sport01.../600/600` |
| Miniaturas download (`.thumb`) | 20 | `picsum.photos/seed/.../120/80` |
| Avatares (`.avatar.brand`) | 3 | `i.pravatar.cc/100?img=1,3,5` |
| **Total** | **41** | |

**Placeholders vazios restantes: 0** (verificado via DOM após reload)

---

## Verificação final

```
admin.html:   v1.0.20 | 3958 linhas | 0 mojibake | 30 imgs | title: "Painel Admin —" ✓
cliente.html: v1.0.20 | 2702 linhas | 0 mojibake | 41 imgs | inputs bg rgb(20,20,22) ✓
```

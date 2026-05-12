# PATCH — Avatar Canonical Normalização — v1.0.22

Data: 2026-05-12

## Avatar canonical escolhido

`https://i.pravatar.cc/100?img=12` — homem jovem, foto frontal, coerente com Vinícius Souza (fotógrafo / cliente logado).

---

## cliente.html

Versão bump: v1.0.21 → v1.0.22

### Avatares de Vinícius normalizados

| Local | img anterior | img novo |
|-------|-------------|---------|
| Mobile header "Olá, Vinícius!" | ?img=1 | ?img=12 |
| Desktop nav pill (Recompensas) | ?img=3 | ?img=12 |
| Sidebar "Vinícius Souza" (Recompensas) | ?img=5 (FEMININO!) | ?img=12 |
| All other `VS` text avatars (nav, sidebar, chat) | (texto) | ?img=12 |

**Total ocorrências normalizadas: 29** (3 com img errado + 26 avatares text-only convertidos para img canonical)

### Imagens adicionais enriquecidas (Tarefa 3)

- 5 order-thumbnail `.t` divs em "Compras recentes" (dashboard desktop): adicionadas imgs picsum seeds rodeo, cattle, arena, festival, event
- Estilo `overflow:hidden` adicionado nos `.t` para conter a imagem

---

## admin.html

Versão bump: v1.0.21 → v1.0.22

### Avatares de Vinícius normalizados

| Local | img anterior | img novo |
|-------|-------------|---------|
| Header topbar pill (Dashboard) | ?img=1 | ?img=12 |
| Sidebar role-switcher (Dashboard) | ?img=3 | ?img=12 |
| Header topbar pill (Estatísticas) | texto VS | ?img=12 |
| Header topbar pill (Eventos) | texto VS | ?img=12 |
| Header topbar pill (Detalhe Evento ×2) | texto VS | ?img=12 |
| Header topbar pill (Patrocinadores) | texto VS | ?img=12 |
| Header topbar pill (extras) | texto VS | ?img=12 |
| Configurações "você · superadmin" | texto VS | ?img=12 |
| Colaboradores mobile row | texto VS | ?img=12 |
| Audit log rows (×6) | texto VS | ?img=12 |
| Mobile drawer who-block | texto VS | ?img=12 |

**Total ocorrências normalizadas: 15**

### Imagens adicionais enriquecidas (Tarefa 3)

**Patrocinadores desktop (7 logos):** substituídos textos "marca-N" por `via.placeholder.com` com nome do patrocinador
  - Sela Torque · Boi Forte (ouro: fundo #1a1a1a, texto #c8a84b)
  - Rações Goyaz · Cervejaria Caju (prata: fundo #222, texto #aaa)
  - Mercado Boa Safra · Lava-Jato Itajá (bronze: fundo #222, texto #888)
  - FM 102.5 Rural (apoio: fundo #1a1a1a, texto #666)

**Patrocinadores mobile (4 logos):** mesmos seeds simplificados

**Mobile event covers (4 cards):** seeds trocados de generic (sport07-10) para temáticos:
  - Safra 2026: rodeo01
  - Festival Pop Rural: festival
  - Meia de Anápolis: run
  - GP de Brasília: equestrian

**Total imagens adicionadas: 15 (11 sponsor logos + 4 event covers)**

---

## publico.html

Versão bump: v1.0.21 → v1.0.22

### Decisão sobre avatar do usuário logado

**Não adicionado avatar de cliente logado** — todas as telas do publico.html são pré-login (todos os navbars têm `nav-login / "Entrar"`, nunca estado autenticado). Não há contexto de "Vinícius Souza cliente logado" neste arquivo.

### O que foi feito

2 ocorrências de `<div class="avatar brand">VS</div>` nos comentários das galerias (Vinícius respondendo como fotógrafo/autor) foram convertidas para o avatar canonical `?img=12`. Isso enriquece UX: o visitante vê quem é o autor respondendo, consistente com a identidade visual.

O avatar no mobile drawer "Olá, visitante" (who-block) foi mantido como texto genérico — é um estado visitante anônimo, sem identidade.

---

## Resumo executivo

| Arquivo | Pravatars normalizados | Imgs enriquecidas |
|---------|----------------------|-------------------|
| cliente.html | 29 (inclui text-only → img) | 5 (order thumbs) |
| admin.html | 15 (inclui text-only → img) | 15 (sponsor logos + event covers) |
| publico.html | 2 (fotógrafo em comentários) | 0 |
| **Total** | **46** | **20** |

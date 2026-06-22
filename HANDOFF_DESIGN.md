# Handoff — Design Dashboard Oraya

> Document à coller au démarrage d'une nouvelle session Claude Code pour continuer le travail de design.

---

## Contexte projet

**Oraya** = SaaS B2B de gestion de créances/relances. Stack :
- TanStack Start (React 19 + TanStack Router + server functions)
- Tailwind CSS v4 + shadcn/ui (Radix) + tw-animate-css
- Recharts 2.x pour les graphiques
- Supabase (DB + Auth) + Resend
- Bun / Vite 7 — commande dev : `bun dev`

---

## Ce qui a été fait dans la session précédente

### 1. Police Apple (styles.css)
- Remplacé Montserrat par **Inter + Inter Tight** depuis Google Fonts
- Stack CSS : `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter Tight", "Inter"`
- Variables : `--font-display` (Inter Tight pour titres), `--ease-apple: cubic-bezier(0.16, 1, 0.3, 1)`
- Letter-spacing négatif Apple : `.tracking-apple` (-0.022em), `.tracking-apple-tight` (-0.035em)

### 2. Tokens design (styles.css)
```css
--cream-1/2/3     : #F6ECD4 / #F1E4BD / #E9D9A6  (fond crème bento)
--water-1/2/3     : #BFE0F5 / #4FA8E0 / #1E73B8   (sphère eau)
--arc-1..5        : #DCE9F7 → #1E4A7E              (jauge arc)
--ease-apple      : cubic-bezier(0.16, 1, 0.3, 1)
--shadow-card     : double couche iOS-style
```

### 3. Classes utilitaires maison (styles.css)
- `.card-apple` — carte blanche, radius 1.25rem, shadow soft, hover lift -2px
- `.stagger-in` — fade+lift CSS, `animationDelay` en style inline
- `.dashboard-cream` — fond crème avec radial bleu haut-droite + beige bas-gauche
- `.statement` — typo géante lowercase vibe Apple
- `.water-wave` / `.water-wave-2` — keyframes vagues SVG
- `.blob-bg` — halo animé pour cartes navy

### 4. Dashboard rewritten (src/routes/_authenticated/dashboard.tsx)

**Layout bento 12 colonnes**, 4 rangées :

| Rangée | Composant | Cols |
|---|---|---|
| 1 | `EncoursTotalCard` | 4 |
| 1 | `FacturesRestantesCard` (sphère eau SVG) | 3 |
| 1 | `RelancesProgrammeesCard` (liste calendrier) | 5 |
| 2 | `StatementCard` "debiteur actif" | 3 |
| 2 | `ChartCard` AreaChart encours 30j | 6 |
| 2 | `StatementCard` "relance a valider" | 3 |
| 3 | `RepartitionRisqueCard` (jauge arc SVG 7 seg) | 3 |
| 3 | `ChartCard` BalanceAgee (bars empilées) | 5 |
| 3 | `ChartCard` RelancesBar (mini 7j) | 2 |
| 3 | `PrevisionnelStack` (3 mini-cards J+30/60/90) | 2 |
| 4 | `ProceduresCollectivesCard` | 3 |
| 4 | `ImportCard` | 9 |

**Animations implémentées :**
- `useCountUp(value, duration)` hook maison — rAF, ease-out cubic, respecte `prefers-reduced-motion`
- Stagger 70ms × index sur chaque carte (`.stagger-in` + `animationDelay` inline)
- Recharts : `isAnimationActive + animationDuration + animationEasing="ease-out"` sur toutes les séries
- `WaterSphere` SVG : clipPath circulaire + translateY animé + 2 vagues
- `ArcGauge` SVG : 7 segments path annulaires, stagger 80ms d'apparition

---

## Ce qui reste à faire / améliorer

L'utilisateur n'a pas encore vu le résultat final (test local en cours).

**Pistes probables d'ajustement après test visuel :**
1. Ajuster la taille des cartes statement (le texte "debiteur actif" peut déborder sur petits écrans)
2. Améliorer la liste "Relances programmées" — côté API, `getDashboardData` ne retourne qu'une seule relance (`prochaine_relance`). Pour afficher une vraie liste comme le mockup, il faut étendre `src/lib/queries/dashboard.ts`.
3. Responsive mobile — le bento 12-col passe en pleine largeur sur mobile, à vérifier sur 375px.
4. Éventuellement affiner les couleurs du fond crème si trop chargé.

---

## Skill ui-ux-pro-max (disponible localement)

Script Python installé ici :
```
C:\Users\fclac\.claude\plugins\marketplaces\ui-ux-pro-max-skill\src\ui-ux-pro-max\scripts\search.py
```

**IMPORTANT sur Windows :** utiliser `py` et non `python` / `python3`.

```bash
# Design system complet
cd "C:/Users/fclac/.claude/plugins/marketplaces/ui-ux-pro-max-skill/src/ui-ux-pro-max"
py scripts/search.py "B2B SaaS fintech dashboard apple" --design-system -p "Oraya"

# Recherche par domaine
py scripts/search.py "apple card animation spring" --domain style -n 4
py scripts/search.py "stagger entrance count-up" --domain ux -n 6
```

Domaines : `product` `style` `typography` `color` `chart` `ux` `google-fonts` `react` `landing`

---

## Workflow demandé par l'utilisateur

1. Faire les changements design dans le dossier local (`C:\projet_perso\oraya-dashboard`)
2. Lancer `bun dev` pour tester visuellement
3. **Ne pas push** tant que l'utilisateur n'a pas validé
4. Une fois validé : `git add` des fichiers ciblés + `git commit` + éventuellement `git push`

---

## Fichiers modifiés dans cette session

- `src/styles.css` — tokens, police, animations CSS
- `src/routes/_authenticated/dashboard.tsx` — dashboard entier réécrit

**Fichiers NON touchés** (ne pas modifier sans raison) :
- `src/routes/_authenticated.tsx` (layout sidebar)
- `src/lib/queries/dashboard.ts` (queries Supabase)
- Toutes les autres routes

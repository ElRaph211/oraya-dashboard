# Oraya — Plan de test

## 1. Prérequis avant tout test

### Variables d'environnement (`.env`)

```
ANTHROPIC_API_KEY=sk-ant-...        # Vraie clé Anthropic
ADMIN_EMAIL=raphael@orayasystem.fr
ADMIN_PASSWORD=R123
SUPABASE_SERVICE_ROLE_KEY=...       # ⚠️ À récupérer depuis Supabase Studio
SUPABASE_PUBLISHABLE_KEY=eyJ...     # Anon key (déjà présente)
SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

**La `SUPABASE_SERVICE_ROLE_KEY` est OBLIGATOIRE** pour que :
- Le bootstrap admin fonctionne (création de raphael@orayasystem.fr en base)
- L'import CSV persiste dans Supabase
- L'admin puisse lire les données de tous les clients

À récupérer dans : Supabase Dashboard → Project Settings → API → `service_role` (secret).

### Installation (1× fois)

```bash
bun install
bunx playwright install chromium    # télécharge le browser pour les tests
```

---

## 2. Test manuel (à valider avant les tests auto)

### 2.1 — Bootstrap admin

1. Lancer `bun run dev`
2. Ouvrir `http://localhost:5173/login`
3. **Effet attendu côté serveur** : à la première visite de `/login`, la fn `bootstrapAdmin` s'exécute → crée l'utilisateur `raphael@orayasystem.fr` dans `auth.users` avec `user_metadata.role='admin'`
4. Vérifier dans Supabase Studio : `auth.users` doit contenir raphael, `user_roles` doit avoir une ligne `(raphael.id, admin)`, `clients` ne doit PAS avoir de ligne active pour cet user

✅ **Critère de réussite** : raphael existe en base avec le rôle admin

### 2.2 — Connexion admin

1. `/login` → email `raphael@orayasystem.fr`, mdp `R123`
2. Submit → redirection vers `/dashboard`
3. La sidebar doit afficher en bas un lien **"Admin"** (bleu, séparé par une ligne)

✅ **Critère** : le lien Admin apparaît parce que `checkIsAdmin` renvoie true

### 2.3 — Page admin clients

1. Cliquer sur **Admin** dans la sidebar → `/admin/clients`
2. La page doit afficher :
   - Bandeau "Mode admin · lecture seule"
   - Sidebar dédiée (Clients / Logs)
   - Tableau vide ou avec les clients existants

✅ **Critère** : pas d'erreur 401, le tableau s'affiche

### 2.4 — Page admin logs

1. Cliquer sur **Logs** dans la sidebar admin → `/admin/logs`
2. Filtres : Tout, Imports, Relances envoyées, Approbations, Overrides, Connexions, Erreurs critiques
3. Tableau affiche les événements récents (imports CSV passés, relances, etc.)

✅ **Critère** : la page charge, les filtres réagissent

### 2.5 — Signup avec SIREN lookup

1. Se déconnecter
2. `/signup`
3. Email : `test+$(date)@example.com`, mdp : `test1234`
4. SIREN : `552100554` (Carrefour) → cliquer **Vérifier**
5. Bandeau vert : "Carrefour Hypermarchés — ... 75008" (ou similaire selon l'API)
6. CA annuel : `1000000`
7. Cocher CGU + DPA
8. Submit → redirect `/dashboard`

✅ **Critère** : compte créé, ligne dans `clients` avec siren=552100554, ca_annuel=1000000, company_name="Carrefour..."

### 2.6 — Isolation client (sécurité)

1. Reste connecté avec le compte test créé en 2.5
2. Tenter d'accéder à `/admin/clients` → doit rediriger vers `/dashboard` (pas admin)
3. Lien "Admin" doit être absent de la sidebar

✅ **Critère** : un non-admin ne peut pas voir les pages admin

### 2.7 — Route protégée

1. Se déconnecter
2. Aller directement à `/dashboard` → redirect `/login`
3. Aller directement à `/admin/logs` → redirect `/login`

✅ **Critère** : aucune fuite de données pour un utilisateur non connecté

---

## 3. Tests automatiques Playwright

Une fois le test manuel ci-dessus validé en local :

```bash
# dans un terminal : lancer le dev server
bun run dev

# dans un second terminal : lancer les tests
bun run test:e2e
```

Couverture actuelle (`tests/e2e/auth.spec.ts`) :

- [x] Login page renders
- [x] Signup page renders avec SIREN
- [x] /dashboard sans session → /login
- [x] /admin/clients sans session → /login
- [x] SIREN < 9 chiffres = bouton désactivé
- [x] SIREN valide → lookup API
- [x] Admin login → /admin/clients accessible
- [x] Admin → /admin/logs accessible

Tests à ajouter ensuite (TODO) :
- [ ] Signup complet end-to-end avec création réelle (à isoler dans un projet Supabase de test)
- [ ] Non-admin tente /admin/* → redirect
- [ ] Import CSV → ligne en base
- [ ] Logout efface la session

---

## 4. En cas de problème

| Symptôme | Cause probable | Fix |
|---|---|---|
| `401 Unauthorized` sur server fns | `attachSupabaseAuth` pas dans le middleware | Voir `src/lib/queries/*.ts` |
| `bootstrap admin failed: ADMIN_EMAIL missing` | `.env` pas chargé ou var absente | Vérifier `.env`, redémarrer le dev server |
| `SUPABASE_SERVICE_ROLE_KEY missing` | Service role pas configurée | Récupérer depuis Supabase Studio → API |
| Page admin redirige vers /dashboard | User pas dans `user_roles` avec rôle admin | Vérifier en DB : `SELECT * FROM user_roles WHERE role='admin'` |
| SIREN lookup échoue toujours | API gouv.fr down ou CORS | Vérifier `https://recherche-entreprises.api.gouv.fr/search?q=552100554` dans un browser |

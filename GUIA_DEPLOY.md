# Guía rápida de deploy

## Tres caminos para subir esta app a Vercel

### Camino A — Drag & drop en Vercel (más rápido, sin Git)

1. Ve a https://vercel.com/new
2. Click en "Browse" y selecciona la carpeta `inventarios-app` completa (descomprimida)
3. Vercel detectará Next.js automáticamente
4. En "Environment Variables" agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://yuvygleacrdcllcbfryx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_YHcMgUEdVrqpRlYZFf0GaQ_95x1vmjs`
5. Click "Deploy"
6. Espera 2-3 minutos. Te dará una URL tipo `inventarios-app-xxx.vercel.app`

### Camino B — GitHub + Vercel (recomendado para futuros cambios)

1. Crea un repo nuevo en GitHub (privado): `inventarios-app`
2. Desde tu terminal, dentro de la carpeta:
   ```bash
   git init
   git add .
   git commit -m "Fase 1"
   git remote add origin https://github.com/TU_USUARIO/inventarios-app.git
   git push -u origin main
   ```
3. En https://vercel.com/new "Import Git Repository", selecciona el repo
4. Agrega las mismas env vars del Camino A
5. Deploy

### Camino C — Vercel CLI desde tu terminal

1. `npm install -g vercel`
2. Dentro de la carpeta: `vercel login`
3. `vercel` (te hace preguntas: confirma todo con Enter)
4. `vercel env add NEXT_PUBLIC_SUPABASE_URL` (pega el valor)
5. `vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY` (pega el valor)
6. `vercel --prod`

---

## Después del deploy (CRÍTICO)

1. Anota la URL que te dio Vercel (ej. `https://inventarios-app-abc123.vercel.app`)

2. Ve a https://supabase.com/dashboard/project/yuvygleacrdcllcbfryx/auth/url-configuration y configura:
   - **Site URL**: `https://TU-URL-DE-VERCEL.vercel.app`
   - **Redirect URLs**: agrega `https://TU-URL-DE-VERCEL.vercel.app/auth/callback`

3. En Google Cloud Console (donde configuraste OAuth), agrega también:
   - `https://yuvygleacrdcllcbfryx.supabase.co/auth/v1/callback` como redirect URI autorizado (si aún no estaba)

4. Abre tu URL de Vercel, da click en "Continuar con Google"
   - El primer usuario que entre queda como **admin** automáticamente
   - Los siguientes entran como ejecutivo y tú les cambias el rol desde la pantalla "Usuarios"

---

## Probar la Fase 1

1. Como admin, ve a "Cargar archivo"
2. Sube tu Excel de inventario (los 500 registros)
3. Selecciona la pestaña, mapea las columnas (al menos "Grupo de vendedor" si lo tiene)
4. Click "Confirmar y publicar"
5. Vuelve a "Hojas" y abre la hoja recién publicada
6. Prueba los filtros multi-columna (igual que tu fórmula LET): texto en cualquier campo, `>100` en numéricos, `"frase exacta"` con comillas

---

## Pendientes (Fase 4 + opcionales)

- [ ] Generar links públicos de cliente `/c/[token]`
- [ ] Marcar selecciones como "no_disponible" automáticamente al reemplazar inventario
- [ ] Notificación por email a admin cuando hay nuevas selecciones
- [ ] Carga directa desde Google Sheets (ya soportado en backend, falta UI)

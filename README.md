# Inventarios App — Fase 1

App web para publicar inventarios y sugerencias de pedido, con filtros multi-columna,
roles, RLS y selección de filas por usuario.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** para estilos
- **Supabase** (Postgres + Auth + RLS) — proyecto ya creado
- **xlsx** para parsear archivos Excel
- **TanStack** ya disponible para futuras mejoras de tabla

## Variables de entorno

Ya quedaron en `.env.local` apuntando al proyecto Supabase `inventarios-app`.

## Roles

| Rol | Permisos |
|---|---|
| admin | Todo: cargar, gestionar usuarios, ver y mover selecciones |
| analista | Como admin pero sin cargar archivos ni gestionar usuarios |
| crs | Filtrar y seleccionar filas de su grupo + zonas asignadas |
| ejecutivo | Filtrar y seleccionar filas de solo su grupo |

El **primer usuario** que inicie sesión queda como admin automáticamente.
Los demás entran como ejecutivo y el admin les cambia el rol manualmente.

## Cómo configurar Google OAuth

Antes de usar el login en producción, hay que habilitar el provider Google
en el dashboard de Supabase (esto no se puede hacer por API):

1. Ir a https://supabase.com/dashboard/project/yuvygleacrdcllcbfryx/auth/providers
2. Activar Google y pegar el Client ID y Client Secret de Google Cloud
3. Agregar la URL de callback que muestra Supabase en Google Cloud Console
4. En la app, asegurarse que `Site URL` y `Redirect URLs` incluyan el dominio de Vercel

## Cómo desplegar

```bash
npm install
npm run build
npx vercel --prod
```

## Pendientes (Fase 4)

- Generación de links públicos `/c/[token]` para clientes externos
- Webhook para actualizar estado "no_disponible" automáticamente al reemplazar inventario
- Detalle de selecciones por cliente / razón social

## Estructura

```
src/
  app/
    layout.tsx                  Layout raíz
    page.tsx                    Redirige a /app o /login
    globals.css                 Design system
    login/                      Login con Google
    auth/                       Callbacks OAuth
    app/                        Rutas autenticadas
      layout.tsx                Header con navegación
      page.tsx                  Listado de hojas
      hojas/[id]/               Detalle de hoja con tabla y filtros
      cargar/                   Subir archivo (admin)
      selecciones/              Bandeja (admin/analista)
      usuarios/                 Gestión de usuarios (admin)
  lib/
    supabase/                   Clientes browser y server
    types.ts                    Tipos del dominio
    utils.ts                    cn, hashDedupe, normalizarCelda
    filtros.ts                  Lógica de filtros multi-columna
  middleware.ts                 Proteger rutas privadas
```

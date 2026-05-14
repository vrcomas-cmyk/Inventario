import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // segundos en Vercel

type FiltroCol = { col: string; val: string };
type Body = {
  desde: number;
  tamano: number;
  filtros: FiltroCol[];
  filtroGlobal?: string;
  ordenCol?: string | null;
  ordenDir?: "asc" | "desc";
};

const MAX_TAMANO = 5000;

function normalizar(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúüñ/.-]+/g, " ")
    .trim();
}

function esVacio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || s === "null" || s === "undefined";
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return isNaN(v) ? null : v;
  const limpio = String(v ?? "").replace(/[^0-9,.\-]/g, "").replace(",", ".");
  const n = parseFloat(limpio);
  return isNaN(n) ? null : n;
}

function evalTermino(t: string, valor: unknown): boolean {
  t = t.trim();
  if (!t) return true;
  const tl = t.toLowerCase();
  if (tl === "(vacio)" || tl === "(empty)" || tl === "(vacío)") return esVacio(valor);
  if (tl === "(novacio)" || tl === "(notempty)" || tl === "(novacío)") return !esVacio(valor);
  const numMatch = t.match(/^(>=|<=|<>|>|<|=)\s*(-?[0-9]+(?:[.,][0-9]+)?)$/);
  if (numMatch) {
    const op = numMatch[1];
    const limite = parseFloat(numMatch[2].replace(",", "."));
    const v = toNum(valor);
    if (v === null) return false;
    switch (op) {
      case ">": return v > limite;
      case ">=": return v >= limite;
      case "<": return v < limite;
      case "<=": return v <= limite;
      case "=": return v === limite;
      case "<>": return v !== limite;
    }
  }
  const rango = t.match(/^(-?[0-9]+(?:[.,][0-9]+)?)\s*(?:-|\.\.|a)\s*(-?[0-9]+(?:[.,][0-9]+)?)$/i);
  if (rango) {
    const a = parseFloat(rango[1].replace(",", "."));
    const b = parseFloat(rango[2].replace(",", "."));
    const min = Math.min(a, b), max = Math.max(a, b);
    const v = toNum(valor);
    if (v === null) return false;
    return v >= min && v <= max;
  }
  const fraseMatch = t.match(/^"([^"]+)"$/);
  if (fraseMatch) return normalizar(valor).includes(normalizar(fraseMatch[1]));
  return normalizar(valor).includes(normalizar(t));
}

function pasaFiltroCol(filtro: string, valor: unknown): boolean {
  if (!filtro || !filtro.trim()) return true;
  const terminos: string[] = [];
  const regex = /"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(filtro)) !== null) terminos.push(m[0]);
  if (terminos.length === 0) return true;
  for (const t of terminos) if (evalTermino(t, valor)) return true;
  return false;
}

function pasaFiltroGlobal(filtro: string, datos: Record<string, unknown>): boolean {
  if (!filtro || !filtro.trim()) return true;
  const todo = Object.values(datos).map((v) => normalizar(v)).join(" ");
  const frases = [...filtro.matchAll(/"([^"]+)"/g)].map((x) => normalizar(x[1]));
  const sinFrases = filtro.replace(/"[^"]+"/g, "").trim();
  const palabras = normalizar(sinFrases).split(/\s+/).filter(Boolean);
  for (const fr of frases) if (!todo.includes(fr)) return false;
  for (const p of palabras) if (!todo.includes(p)) return false;
  return true;
}

function filtrarColumnasPorRol(
  columnas: string[],
  columnasPorRol: Record<string, string[]> | null | undefined,
  miRol: string | null
): string[] {
  if (!miRol || !columnasPorRol) return columnas;
  return columnas.filter((c) => {
    const rolesPermitidos = columnasPorRol[c];
    if (!rolesPermitidos || rolesPermitidos.length === 0) return true;
    return rolesPermitidos.includes(miRol);
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = (await request.json()) as Body;
    const desde = Math.max(0, body.desde ?? 0);
    const tamano = Math.min(body.tamano ?? 2000, MAX_TAMANO);
    const filtros = body.filtros ?? [];
    const filtroGlobal = body.filtroGlobal ?? "";

    const supabase = await createClient();

    // 1. Metadata de la hoja
    const { data: hoja, error: errHoja } = await supabase
      .from("hojas")
      .select("columnas,columnas_por_rol,modo_visualizacion,roles_visibles")
      .eq("id", id)
      .single();

    if (errHoja) {
      console.error("[filas] Error al leer hoja:", errHoja);
      return NextResponse.json(
        { error: `Error al leer hoja: ${errHoja.message}` },
        { status: 500 }
      );
    }

    if (!hoja) {
      return NextResponse.json({ error: "Hoja no encontrada" }, { status: 404 });
    }

    const columnas: string[] = hoja.columnas ?? [];
    const columnasPorRol: Record<string, string[]> = hoja.columnas_por_rol ?? {};
    const modoVisualizacion: string = hoja.modo_visualizacion ?? "ver_todo";

    // 2. Usuario y rol
    const { data: { user }, error: errUser } = await supabase.auth.getUser();
    if (errUser || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const { data: perfil } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", user.id)
      .single();
    const miRol = perfil?.rol ?? null;

    const columnasVisibles = filtrarColumnasPorRol(columnas, columnasPorRol, miRol);

    // 3. Verificar modo "buscar para ver"
    const tieneFiltros =
      filtroGlobal.trim() !== "" ||
      filtros.some((f) => f.val && f.val.trim() !== "");

    if (modoVisualizacion === "buscar_para_ver" && !tieneFiltros) {
      return NextResponse.json({
        filas: [],
        total: 0,
        desde: 0,
        tamano: 0,
        requireFiltro: true,
        columnasVisibles,
      });
    }

    // 4. Traer filas paginando (Supabase max 1000 por request)
    const LOTE = 1000;
    let cursor = 0;
    const todasFiltradas: any[] = [];
    let iteraciones = 0;
    const MAX_ITER = 200; // tope de seguridad (200,000 filas)

    while (iteraciones < MAX_ITER) {
      iteraciones++;
      const { data, error: errFilas } = await supabase
        .from("filas")
        .select("id,hoja_id,datos,hash_dedupe,grupo_vendedor,razon_social,zona,snapshot_version")
        .eq("hoja_id", id)
        .range(cursor, cursor + LOTE - 1);

      if (errFilas) {
        console.error("[filas] Error en lote:", errFilas);
        return NextResponse.json(
          { error: `Error al leer filas: ${errFilas.message}` },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) break;

      // Si no hay filtros, no procesa nada, solo acumula
      if (!tieneFiltros) {
        todasFiltradas.push(...data);
      } else {
        for (const f of data) {
          const datos = (f.datos as Record<string, unknown>) ?? {};
          if (filtroGlobal && !pasaFiltroGlobal(filtroGlobal, datos)) continue;
          let pasa = true;
          for (const fc of filtros) {
            if (!fc.val || !fc.val.trim()) continue;
            if (!pasaFiltroCol(fc.val, datos[fc.col])) {
              pasa = false;
              break;
            }
          }
          if (pasa) todasFiltradas.push(f);
        }
      }

      if (data.length < LOTE) break;
      cursor += LOTE;
    }

    // 5. Aplicar orden
    if (body.ordenCol) {
      const dir = body.ordenDir === "desc" ? -1 : 1;
      const col = body.ordenCol;
      todasFiltradas.sort((a, b) => {
        const va = (a.datos as any)?.[col];
        const vb = (b.datos as any)?.[col];
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
        return String(va ?? "").localeCompare(String(vb ?? ""), "es", { numeric: true }) * dir;
      });
    }

    // 6. Paginación final
    const total = todasFiltradas.length;
    const pagina = todasFiltradas.slice(desde, desde + tamano);

    // 7. Filtrar columnas ocultas en cada fila
    const omitir = columnas.filter((c) => !columnasVisibles.includes(c));
    let filasResult = pagina;
    if (omitir.length > 0) {
      filasResult = pagina.map((f) => {
        const nuevoDatos: Record<string, unknown> = {};
        for (const k of columnasVisibles) {
          if (f.datos && k in (f.datos as object)) nuevoDatos[k] = (f.datos as any)[k];
        }
        return { ...f, datos: nuevoDatos };
      });
    }

    return NextResponse.json({
      filas: filasResult,
      total,
      desde,
      tamano: filasResult.length,
      completo: desde + filasResult.length >= total,
      columnasVisibles,
    });
  } catch (e: any) {
    console.error("[filas] Error inesperado:", e);
    return NextResponse.json(
      { error: e?.message || "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

/**
 * Lógica de filtros multi-valor estilo Excel.
 *
 * En el filtro por columna:
 * - Vacío → no filtra
 * - "(vacio)" o "(empty)" → solo filas vacías en esa columna
 * - "(noVacio)" o "(notEmpty)" → solo filas con valor
 * - Múltiples valores separados por espacios → OR ("104000 105000" trae ambos)
 * - "frase exacta" entre comillas → busca esa frase completa
 * - Operadores numéricos: > >= < <= = <> seguidos de número
 * - Rango numérico: "100-500" o "100..500"
 *
 * En el filtro global:
 * - Todas las palabras (AND) deben aparecer en alguna columna
 * - "frase exacta" busca la frase completa
 */

export function normalizarTexto(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúüñ/.-]+/g, " ")
    .trim();
}

function esVacio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  const s = String(valor).trim();
  return s === "" || s === "null" || s === "undefined";
}

function esFiltroNumericoSimple(q: string): boolean {
  return /^(>=|<=|<>|>|<|=)\s*-?[0-9]+([.,][0-9]+)?$/.test(q.trim());
}

function esFiltroRango(q: string): RegExpMatchArray | null {
  return q.trim().match(/^(-?[0-9]+(?:[.,][0-9]+)?)\s*(?:-|\.\.|a)\s*(-?[0-9]+(?:[.,][0-9]+)?)$/i);
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return isNaN(v) ? null : v;
  const limpio = String(v ?? "").replace(/[^0-9,.\-]/g, "").replace(",", ".");
  const n = parseFloat(limpio);
  return isNaN(n) ? null : n;
}

function evalNumericoSimple(filtro: string, valor: unknown): boolean {
  const m = filtro.trim().match(/^(>=|<=|<>|>|<|=)\s*(-?[0-9]+(?:[.,][0-9]+)?)$/);
  if (!m) return false;
  const op = m[1];
  const limite = parseFloat(m[2].replace(",", "."));
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
  return false;
}

/** Evalúa un solo término (una de las opciones separadas por espacio) */
function evalTermino(termino: string, valor: unknown): boolean {
  const t = termino.trim();
  if (!t) return true;

  const tLower = t.toLowerCase();
  if (tLower === "(vacio)" || tLower === "(empty)" || tLower === "(vacío)") return esVacio(valor);
  if (tLower === "(novacio)" || tLower === "(notempty)" || tLower === "(novacío)") return !esVacio(valor);

  if (esFiltroNumericoSimple(t)) return evalNumericoSimple(t, valor);

  const rango = esFiltroRango(t);
  if (rango) {
    const a = parseFloat(rango[1].replace(",", "."));
    const b = parseFloat(rango[2].replace(",", "."));
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    const v = toNum(valor);
    if (v === null) return false;
    return v >= min && v <= max;
  }

  const fraseMatch = t.match(/^"([^"]+)"$/);
  if (fraseMatch) {
    return normalizarTexto(valor).includes(normalizarTexto(fraseMatch[1]));
  }

  return normalizarTexto(valor).includes(normalizarTexto(t));
}

/**
 * Filtro por columna:
 * - Separa por espacios respetando comillas
 * - Cualquiera de los términos cumple → pasa (OR)
 */
export function aplicaFiltroColumna(filtro: string, valor: unknown): boolean {
  if (!filtro || !filtro.trim()) return true;

  const terminos: string[] = [];
  const regex = /"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(filtro)) !== null) terminos.push(m[0]);

  if (terminos.length === 0) return true;

  for (const t of terminos) {
    if (evalTermino(t, valor)) return true;
  }
  return false;
}

/**
 * Filtro global: todas las palabras (AND) deben aparecer en algún valor
 */
export function aplicaFiltroGlobal(filtro: string, datos: Record<string, unknown>): boolean {
  if (!filtro || !filtro.trim()) return true;
  const todoTexto = Object.values(datos)
    .map((v) => normalizarTexto(v))
    .join(" ");
  const frases = [...filtro.matchAll(/"([^"]+)"/g)].map((x) => normalizarTexto(x[1]));
  const sinFrases = filtro.replace(/"[^"]+"/g, "").trim();
  const palabras = normalizarTexto(sinFrases).split(/\s+/).filter(Boolean);
  for (const fr of frases) if (!todoTexto.includes(fr)) return false;
  for (const p of palabras) if (!todoTexto.includes(p)) return false;
  return true;
}

/**
 * Devuelve los valores únicos de una columna con conteo, para el dropdown estilo Excel.
 */
export function valoresUnicosColumna(
  filas: Array<{ datos: Record<string, unknown> }>,
  columna: string,
  limite = 500
): { valor: string; etiqueta: string; conteo: number; esVacio: boolean }[] {
  const conteos = new Map<string, number>();
  let vacios = 0;
  for (const f of filas) {
    const v = f.datos[columna];
    if (esVacio(v)) {
      vacios++;
      continue;
    }
    const k = String(v);
    conteos.set(k, (conteos.get(k) ?? 0) + 1);
  }
  const arr: { valor: string; etiqueta: string; conteo: number; esVacio: boolean }[] = [];
  if (vacios > 0) arr.push({ valor: "(vacio)", etiqueta: "(vacíos)", conteo: vacios, esVacio: true });
  for (const [k, c] of conteos) arr.push({ valor: k, etiqueta: k, conteo: c, esVacio: false });
  arr.sort((a, b) => {
    if (a.esVacio && !b.esVacio) return -1;
    if (!a.esVacio && b.esVacio) return 1;
    return a.valor.localeCompare(b.valor, "es", { numeric: true });
  });
  return arr.slice(0, limite);
}

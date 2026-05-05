/**
 * Lógica de filtros equivalente a la fórmula LET de Sheets:
 * - Texto sin operador → busca todas las palabras (AND) en cualquier columna
 * - Comilla "frase exacta" → busca exactamente esa frase
 * - Operadores numéricos: > >= < <= = <> seguidos de número
 * - Vacío → no filtra
 */

function normalizarTexto(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9áéíóúüñ/]+/g, " ")
    .trim();
}

function esFiltroNumerico(q: string): boolean {
  return /^(>=|<=|<>|>|<|=)\s*-?[0-9]+([.,][0-9]+)?$/.test(q.trim());
}

function evalNumerico(filtro: string, valor: unknown): boolean {
  const m = filtro.trim().match(/^(>=|<=|<>|>|<|=)\s*(-?[0-9]+(?:[.,][0-9]+)?)$/);
  if (!m) return false;
  const op = m[1];
  const limite = parseFloat(m[2].replace(",", "."));
  let v: number;
  if (typeof valor === "number") v = valor;
  else {
    const limpio = String(valor ?? "").replace(/[^0-9,.\-]/g, "").replace(",", ".");
    v = parseFloat(limpio);
  }
  if (isNaN(v)) return false;
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

/** Match con palabras AND en una sola celda */
function matchPalabrasAnd(filtro: string, valor: unknown): boolean {
  const f = normalizarTexto(filtro);
  if (!f) return true;
  const texto = normalizarTexto(valor);
  // Soporte de "frase exacta"
  const frases = [...filtro.matchAll(/"([^"]+)"/g)].map((x) => normalizarTexto(x[1]));
  const sinFrases = filtro.replace(/"[^"]+"/g, "").trim();
  const palabras = normalizarTexto(sinFrases).split(/\s+/).filter(Boolean);
  for (const fr of frases) if (!texto.includes(fr)) return false;
  for (const p of palabras) if (!texto.includes(p)) return false;
  return true;
}

/** Filtro por columna: numérico si aplica, sino texto AND */
export function aplicaFiltroColumna(filtro: string, valor: unknown): boolean {
  if (!filtro || !filtro.trim()) return true;
  if (esFiltroNumerico(filtro)) return evalNumerico(filtro, valor);
  return matchPalabrasAnd(filtro, valor);
}

/** Filtro global: busca todas las palabras en cualquier columna */
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

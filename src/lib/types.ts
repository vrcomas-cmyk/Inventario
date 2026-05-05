export type RolUsuario = "admin" | "analista" | "crs" | "ejecutivo";

export type EstadoSeleccion =
  | "pendiente"
  | "en_gestion"
  | "gestionada"
  | "cancelada"
  | "no_disponible";

export type Usuario = {
  id: string;
  email: string;
  nombre: string | null;
  rol: RolUsuario;
  activo: boolean;
};

export type MapeoConfig = {
  grupo_vendedor?: string | null;
  razon_social?: string | null;
  zona?: string | null;
  material?: string | null;
  numericas?: string[];
  fechas?: string[];
  claves_dedupe?: string[];
};

export type Hoja = {
  id: string;
  nombre: string;
  descripcion: string | null;
  mapeo: MapeoConfig;
  columnas: string[];
  permite_seleccion: boolean;
  activa: boolean;
  subida_en: string;
  snapshot_version: number;
};

export type Fila = {
  id: string;
  hoja_id: string;
  datos: Record<string, unknown>;
  hash_dedupe: string;
  grupo_vendedor: string | null;
  razon_social: string | null;
  zona: string | null;
  snapshot_version: number;
};

export type Seleccion = {
  id: string;
  fila_id: string | null;
  hoja_id: string;
  usuario_id: string;
  datos_snapshot: Record<string, unknown>;
  hash_dedupe: string;
  estado: EstadoSeleccion;
  comentario: string | null;
  confirmada_en: string;
};

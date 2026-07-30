/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Tipos compartidos
 * Descripcion: Contratos de datos para la reconciliacion de planillas y el catalogo canonico.
 */

export type SourceSheet = "julio" | "junio";

export type RawSourceRow = {
  sheet: SourceSheet;
  rowNumber: number;
  perfume: string;
  marca: string;
  contenido: string;
  precioCompra?: number;
  costoUnitario?: number;
  precioVenta?: number;
};

export type RowClassification =
  | "MATCH_EXACTO"
  | "MATCH_NORMALIZADO"
  | "SOLO_JULIO"
  | "SOLO_JUNIO"
  | "AMBIGUO"
  | "DUPLICADO"
  | "FILA_INVALIDA";

export type MatchCandidate = {
  sheet: SourceSheet;
  rowNumber: number;
  perfume: string;
  marca: string;
  contenido: string;
  reason: string;
};

export type ReconciledEntry = {
  classification: RowClassification;
  key: string;
  julioRow?: RawSourceRow;
  junioRow?: RawSourceRow;
  candidates?: MatchCandidate[];
  invalidReason?: string;
};

export type EstadoDatos =
  | "COMPLETO"
  | "FALTA_PRECIO"
  | "FALTA_STOCK"
  | "FALTA_PRECIO|FALTA_STOCK";

export type CanonicalProduct = {
  sku: string;
  nombre: string;
  marca: string;
  contenido: string;
  costoUnitario: number | null;
  precioVenta: number | null;
  stock: number | null;
  activo: boolean;
  esTop: boolean;
  ordenDestacado: number | null;
  esOfertaSemana: boolean;
  precioAnterior: number | null;
  imageUrl: string | null;
  origenCosto: SourceSheet | null;
  origenPrecio: SourceSheet | null;
  estadoDatos: EstadoDatos;
  observacionesImportacion: string;
  classification: RowClassification;
};

export type Top12RankingItem = {
  rank: number;
  marca: string;
  nombre: string;
};

export type Top12MatchStatus =
  | "MATCH_CONFIRMADO"
  | "CANDIDATO_UNICO_NO_CONFIRMADO"
  | "AMBIGUO"
  | "SIN_MATCH_EN_PLANILLAS";

export type Top12ImageEntry = {
  rank: number;
  sourceFile: string;
  sourceSha256: string;
  canonicalSku: string | null;
  canonicalName: string | null;
  canonicalBrand: string | null;
  imageUrl: string;
  matchStatus: Top12MatchStatus;
  candidates?: string[];
  notes?: string;
};

export type EncodingName = "utf-8" | "utf-8-bom" | "windows-1252";

export type DelimiterChar = ";" | "," | "\t";

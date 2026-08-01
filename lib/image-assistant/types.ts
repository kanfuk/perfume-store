import type { ProductoProps } from "@/domain/Producto";

export type ImageAssistantStatus =
  | "AUTO_SEGURO"
  | "REQUIERE_REVISION"
  | "YA_TIENE_IMAGEN"
  | "SIN_FUENTE_SEGURA"
  | "PROVEEDOR_NO_CONFIGURADO"
  | "EXCLUIDO_QA"
  | "ERROR";

export type SafeImageSourceAuthority =
  | "MANUFACTURER"
  | "OFFICIAL_BRAND"
  | "AUTHORIZED_DISTRIBUTOR"
  | "APPROVED_RETAILER";

export type SafeImageCandidate = {
  sourceUrl: string;
  sourcePageUrl?: string;
  sourceDomain: string;
  authority: SafeImageSourceAuthority;
  brand: string;
  name: string;
  concentration: string;
  content: string;
  imageRole: "PRODUCT";
  score?: number;
  reasons?: string[];
  token?: string;
};

export type ImageAssistantItem = {
  productId: string;
  sku: string;
  brand: string;
  name: string;
  content: string;
  status: ImageAssistantStatus;
  reasons: string[];
  supplierRowNumber?: number;
  score?: number;
  candidate?: SafeImageCandidate;
};

export type ImageAssistantSummary = Record<ImageAssistantStatus, number> & {
  total: number;
  withoutImage: number;
};

export type ImageAssistantAnalysis = {
  items: ImageAssistantItem[];
  summary: ImageAssistantSummary;
  reviewReferenceDifference: number;
  batchAllowedByAuditReconciliation: boolean;
  reconciliationApproved: boolean;
};

export type ImageAssistantHealth = {
  providerConfigured: boolean;
  signingSecretConfigured: boolean;
  allowedDomainsConfigured: boolean;
  searchEnabled: boolean;
  batchEnabled: boolean;
};

export type NormalizedImageSearchResult = {
  sourcePageUrl: string;
  imageUrl: string;
  thumbnailUrl?: string;
  title: string;
  sourceDomain: string;
  width?: number;
  height?: number;
};

export type ImageAssistantDryRunEntry = {
  productId: string;
  status: ImageAssistantStatus;
  score?: number;
  domain?: string;
  reasons: string[];
  contradictions: boolean;
  candidateCount: number;
  recommendedCandidate?: Pick<SafeImageCandidate, "sourcePageUrl" | "sourceUrl" | "sourceDomain" | "score">;
};

export type CatalogProductForImageAssistant = Pick<
  ProductoProps,
  | "id"
  | "sku"
  | "nombre"
  | "marca"
  | "contenido"
  | "activo"
  | "imageUrl"
  | "imageStoragePath"
  | "esTop"
>;

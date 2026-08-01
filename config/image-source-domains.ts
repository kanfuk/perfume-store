import type { SafeImageSourceAuthority } from "@/lib/image-assistant/types";

export type ImageSourceDomainConfig = {
  domain: string;
  type: SafeImageSourceAuthority;
  enabled: boolean;
  notes: string;
};

// No domain is trusted by default. Entries may be added only after legal and
// commercial review; unconfirmed entries must remain disabled.
export const IMAGE_SOURCE_DOMAINS: readonly ImageSourceDomainConfig[] = [];

export const IMAGE_SOURCE_DOMAINS_BY_TYPE = {
  manufacturers: IMAGE_SOURCE_DOMAINS.filter((entry) => entry.type === "MANUFACTURER"),
  officialBrands: IMAGE_SOURCE_DOMAINS.filter((entry) => entry.type === "OFFICIAL_BRAND"),
  authorizedDistributors: IMAGE_SOURCE_DOMAINS.filter((entry) => entry.type === "AUTHORIZED_DISTRIBUTOR"),
  approvedRetailers: IMAGE_SOURCE_DOMAINS.filter((entry) => entry.type === "APPROVED_RETAILER")
} as const;

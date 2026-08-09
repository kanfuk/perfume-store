import Image from "next/image";

type SmellmeBrandProps = {
  className?: string;
  priority?: boolean;
};

/** Monograma raster oficial recortado sin redibujar el SML del cliente. */
export function SmellmeMonogram({ className = "h-12 w-12", priority = false }: SmellmeBrandProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-xl border border-[#e8c79e]/25 bg-[#0b0b0b] ${className}`}
    >
      <Image
        src="/brand/smellme-monogram.webp"
        alt=""
        fill
        sizes="64px"
        className="object-cover"
        priority={priority}
      />
    </span>
  );
}

/** Logo completo oficial SML + Smellme.cl sobre su fondo oscuro original. */
export function SmellmeLogo({ className = "h-28 w-36", priority = false }: SmellmeBrandProps) {
  return (
    <span className={`relative inline-flex shrink-0 overflow-hidden rounded-2xl bg-[#0b0b0b] ${className}`}>
      <Image
        src="/brand/smellme-logo.webp"
        alt="SML Smellme.cl"
        fill
        sizes="240px"
        className="object-cover"
        priority={priority}
      />
    </span>
  );
}

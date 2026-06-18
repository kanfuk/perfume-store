type ProductVisualMeta = {
  imageUrl: string;
  badgeLabel: string;
};

const PRODUCT_VISUALS: Record<string, ProductVisualMeta> = {
  "dobladita-solo-queso": {
    imageUrl: "/images/products/dobladita-solo-queso.jpeg",
    badgeLabel: "DOBLADITA QUESO"
  },
  "dobladita-jamon-pavo-queso": {
    imageUrl: "/images/products/dobladita-jamon-pavo-queso.jpeg",
    badgeLabel: "JAMON PAVO / QUESO"
  },
  "dobladita-jamon-de-pavo-acaramelado-queso": {
    imageUrl: "/images/products/dobladita-jamon-pavo-queso.jpeg",
    badgeLabel: "JAMON PAVO / QUESO"
  },
  "dobladita-huevo": {
    imageUrl: "/images/products/dobladita-huevo.jpeg",
    badgeLabel: "DOBLADITA HUEVO"
  },
  "dobladita-ave-mayo": {
    imageUrl: "/images/products/dobladita-ave-mayo.png",
    badgeLabel: "AVE MAYO"
  },
  "dobladita-ave-pimenton": {
    imageUrl: "/images/products/dobladita-ave-pimenton.jpeg",
    badgeLabel: "PRECIO PENDIENTE"
  },
  "quequito-marmoleado": {
    imageUrl: "/images/products/quequito-marmoleado.png",
    badgeLabel: "QUEQUITO CASERO"
  },
  "quequito-banana-bread": {
    imageUrl: "/images/products/quequito-banana-bread.png",
    badgeLabel: "QUEQUITO CASERO"
  },
  "quequito-choco-chip-sugar-free": {
    imageUrl: "/images/products/quequito-choco-chip-sugar-free.png",
    badgeLabel: "SUGAR FREE"
  },
  "carrot-cake-nueces": {
    imageUrl: "/images/products/carrot-cake-nueces.png",
    badgeLabel: "QUEQUITO CASERO"
  },
  "queque-platano": {
    imageUrl: "/images/products/queque-platano.png",
    badgeLabel: "PRECIO PENDIENTE"
  },
  "queque-marmoleado": {
    imageUrl: "/images/products/queque-marmoleado.png",
    badgeLabel: "PRECIO PENDIENTE"
  },
  "pedido-personalizado": {
    imageUrl: "/images/products/pedido-personalizado.png",
    badgeLabel: "A PEDIDO"
  },
  "dobladita-reserva-ave-pimenton": {
    imageUrl: "/images/products/dobladita-reserva-ave-pimenton.jpeg",
    badgeLabel: "PRODUCTO CASERO"
  }
};

function normalizeProductKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getProductVisualMeta(product: { id?: string; nombre?: string }) {
  const keys = [product.id, product.nombre]
    .filter((value): value is string => Boolean(value))
    .map(normalizeProductKey);

  for (const key of keys) {
    const meta = PRODUCT_VISUALS[key];

    if (meta) {
      return meta;
    }
  }

  return {
    imageUrl: "/images/products/pedido-personalizado.png",
    badgeLabel: "PRODUCTO CASERO"
  };
}

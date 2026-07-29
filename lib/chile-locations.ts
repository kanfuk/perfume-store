export type ChileRegion = {
  name: string;
  communes: string[];
};

export const CHILE_REGIONS: ChileRegion[] = [
  {
    name: "Región de Arica y Parinacota",
    communes: ["Arica", "Camarones", "Putre", "General Lagos"]
  },
  {
    name: "Región de Tarapacá",
    communes: ["Iquique", "Alto Hospicio", "Pozo Almonte", "Camiña", "Colchane", "Huara", "Pica"]
  },
  {
    name: "Región de Antofagasta",
    communes: [
      "Antofagasta", "Mejillones", "Sierra Gorda", "Taltal", "Calama", "Ollagüe",
      "San Pedro de Atacama", "Tocopilla", "María Elena"
    ]
  },
  {
    name: "Región de Atacama",
    communes: [
      "Copiapó", "Caldera", "Tierra Amarilla", "Chañaral", "Diego de Almagro",
      "Vallenar", "Alto del Carmen", "Freirina", "Huasco"
    ]
  },
  {
    name: "Región de Coquimbo",
    communes: [
      "La Serena", "Coquimbo", "Andacollo", "La Higuera", "Paihuano", "Vicuña",
      "Illapel", "Canela", "Los Vilos", "Salamanca", "Ovalle", "Combarbalá",
      "Monte Patria", "Punitaqui", "Río Hurtado"
    ]
  },
  {
    name: "Región de Valparaíso",
    communes: [
      "Valparaíso", "Casablanca", "Concón", "Juan Fernández", "Puchuncaví", "Quintero",
      "Viña del Mar", "Isla de Pascua", "Los Andes", "Calle Larga", "Rinconada",
      "San Esteban", "La Ligua", "Cabildo", "Papudo", "Petorca", "Zapallar", "Quillota",
      "La Calera", "Hijuelas", "La Cruz", "Nogales", "San Antonio", "Algarrobo",
      "Cartagena", "El Quisco", "El Tabo", "Santo Domingo", "San Felipe", "Catemu",
      "Llay-Llay", "Panquehue", "Putaendo", "Santa María", "Limache", "Quilpué",
      "Villa Alemana", "Olmué"
    ]
  },
  {
    name: "Región Metropolitana de Santiago",
    communes: [
      "Santiago", "Cerrillos", "Cerro Navia", "Conchalí", "El Bosque", "Estación Central",
      "Huechuraba", "Independencia", "La Cisterna", "La Florida", "La Granja", "La Pintana",
      "La Reina", "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú",
      "Ñuñoa", "Pedro Aguirre Cerda", "Peñalolén", "Providencia", "Pudahuel", "Quilicura",
      "Quinta Normal", "Recoleta", "Renca", "San Joaquín", "San Miguel", "San Ramón",
      "Vitacura", "Puente Alto", "Pirque", "San José de Maipú", "Colina", "Lampa", "Tiltil",
      "San Bernardo", "Buin", "Calera de Tango", "Paine", "Melipilla", "Alhué", "Curacaví",
      "María Pinto", "San Pedro", "Talagante", "El Monte", "Isla de Maipo", "Padre Hurtado",
      "Peñaflor"
    ]
  },
  {
    name: "Región del Libertador General Bernardo O'Higgins",
    communes: [
      "Rancagua", "Codegua", "Coinco", "Coltauco", "Doñihue", "Graneros", "Las Cabras",
      "Machalí", "Malloa", "Mostazal", "Olivar", "Peumo", "Pichidegua", "Quinta de Tilcoco",
      "Rengo", "Requínoa", "San Vicente", "Pichilemu", "La Estrella", "Litueche", "Marchigüe",
      "Navidad", "Paredones", "San Fernando", "Chépica", "Chimbarongo", "Lolol", "Nancagua",
      "Palmilla", "Peralillo", "Placilla", "Pumanque", "Santa Cruz"
    ]
  },
  {
    name: "Región del Maule",
    communes: [
      "Talca", "Constitución", "Curepto", "Empedrado", "Maule", "Pelarco", "Pencahue",
      "Río Claro", "San Clemente", "San Rafael", "Cauquenes", "Chanco", "Pelluhue", "Curicó",
      "Hualañé", "Licantén", "Molina", "Rauco", "Romeral", "Sagrada Familia", "Teno",
      "Vichuquén", "Linares", "Colbún", "Longaví", "Parral", "Retiro", "San Javier",
      "Villa Alegre", "Yerbas Buenas"
    ]
  },
  {
    name: "Región de Ñuble",
    communes: [
      "Chillán", "Bulnes", "Cobquecura", "Coelemu", "Coihueco", "Chillán Viejo", "El Carmen",
      "Ninhue", "Ñiquén", "Pemuco", "Pinto", "Portezuelo", "Quillón", "Quirihue", "Ránquil",
      "San Carlos", "San Fabián", "San Ignacio", "San Nicolás", "Treguaco", "Yungay"
    ]
  },
  {
    name: "Región del Biobío",
    communes: [
      "Concepción", "Coronel", "Chiguayante", "Florida", "Hualqui", "Lota", "Penco",
      "San Pedro de la Paz", "Santa Juana", "Talcahuano", "Tomé", "Hualpén", "Lebu",
      "Arauco", "Cañete", "Contulmo", "Curanilahue", "Los Álamos", "Tirúa", "Los Ángeles",
      "Antuco", "Cabrero", "Laja", "Mulchén", "Nacimiento", "Negrete", "Quilaco", "Quilleco",
      "San Rosendo", "Santa Bárbara", "Tucapel", "Yumbel", "Alto Biobío"
    ]
  },
  {
    name: "Región de La Araucanía",
    communes: [
      "Temuco", "Carahue", "Cunco", "Curarrehue", "Freire", "Galvarino", "Gorbea", "Lautaro",
      "Loncoche", "Melipeuco", "Nueva Imperial", "Padre Las Casas", "Perquenco", "Pitrufquén",
      "Pucón", "Saavedra", "Teodoro Schmidt", "Toltén", "Vilcún", "Villarrica", "Cholchol",
      "Angol", "Collipulli", "Curacautín", "Ercilla", "Lonquimay", "Los Sauces", "Lumaco",
      "Purén", "Renaico", "Traiguén", "Victoria"
    ]
  },
  {
    name: "Región de Los Ríos",
    communes: [
      "Valdivia", "Corral", "Lanco", "Los Lagos", "Máfil", "Mariquina", "Paillaco",
      "Panguipulli", "La Unión", "Futrono", "Lago Ranco", "Río Bueno"
    ]
  },
  {
    name: "Región de Los Lagos",
    communes: [
      "Puerto Montt", "Calbuco", "Cochamó", "Fresia", "Frutillar", "Los Muermos", "Llanquihue",
      "Maullín", "Puerto Varas", "Castro", "Ancud", "Chonchi", "Curaco de Vélez", "Dalcahue",
      "Puqueldón", "Queilén", "Quellón", "Quemchi", "Quinchao", "Osorno", "Puerto Octay",
      "Purranque", "Puyehue", "Río Negro", "San Juan de la Costa", "San Pablo", "Chaitén",
      "Futaleufú", "Hualaihué", "Palena"
    ]
  },
  {
    name: "Región de Aysén del General Carlos Ibáñez del Campo",
    communes: [
      "Coyhaique", "Lago Verde", "Aysén", "Cisnes", "Guaitecas", "Cochrane", "O'Higgins",
      "Tortel", "Chile Chico", "Río Ibáñez"
    ]
  },
  {
    name: "Región de Magallanes y de la Antártica Chilena",
    communes: [
      "Punta Arenas", "Laguna Blanca", "Río Verde", "San Gregorio", "Cabo de Hornos",
      "Antártica", "Porvenir", "Primavera", "Timaukel", "Natales", "Torres del Paine"
    ]
  }
];

export function getChileRegion(regionName: string) {
  return CHILE_REGIONS.find((region) => region.name === regionName);
}

export function getCommunesForRegion(regionName: string) {
  return getChileRegion(regionName)?.communes ?? [];
}

export function isValidChileRegion(regionName: string) {
  return Boolean(getChileRegion(regionName));
}

export function isValidChileCommuneForRegion(regionName: string, communeName: string) {
  return getCommunesForRegion(regionName).includes(communeName);
}

export function updateChileRegionSelection<T extends { region: string; comuna: string }>(
  current: T,
  region: string
): T {
  return { ...current, region, comuna: "" };
}

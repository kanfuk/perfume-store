# Reconciliación de revisión del Asistente de imágenes

Fecha de corte: 2026-07-31. Fuente: análisis de sólo lectura de 106 productos contra el CSV de proveedor usado en la auditoría. Este documento contiene únicamente metadata de catálogo; no contiene costos, stock, clientes, bancos ni secretos.

## Resultado

- Casos `REQUIERE_REVISION`: **39**.
- Referencia administrativa anterior: **aproximadamente 28**, no una lista histórica congelada.
- Diferencia explicada: **11** casos de categoría G, disparados sólo por `NAME_INCONSISTENCY` entre variantes comerciales distintas de una misma familia.
- Reconciliación operativa: **28 casos de núcleo comercial + 11 falsos positivos técnicos = 39 observados**. Esto explica la diferencia sin alterar ni forzar el catálogo a 28.
- Productos modificados: **0**.

Los 11 adicionales son `0bfa1cf5`, `142e9003`, `234cf882`, `05703a0d`, `1e7b8a13`, `1948de9f`, `ef9fb837`, `6279af14`, `ee20a35e`, `79d9390e` y `58461398`. En todos, la regla comparó nombres parecidos con igual marca/contenido, pero los calificadores (`MEN`, `NYC`, `Sexy`, `VIP`, `Rose`, `Parfum`, `IN RED`, `Intensely`) representan variantes reconocibles. Pueden salir de revisión sin editar productos, afinando la regla para respetar esos calificadores.

No existe evidencia suficiente para afirmar que una lista histórica exacta de 28 contenía cada uno de los otros casos. La separación anterior es reproducible a partir de la causa técnica actual y conserva el carácter aproximado de la referencia.

## Categorías

- A: duplicado exacto real.
- B: variante válida por contenido.
- C: nombre inconsistente.
- D: marca inconsistente.
- E: producto incompleto.
- F: identidad ambigua.
- G: clasificación demasiado estricta.
- H: otro.

Conteo: A=0, B=1, C=8, D=7, E=1, F=11, G=11, H=0.

“Posibles” cuenta otras filas relacionadas por las reglas de similitud/duplicidad; no es una confirmación de que sean el mismo producto.

| ID | Nombre | Marca | Contenido | SKU | Cat. | Reglas | Grupo/familia | Posibles | Conclusión |
|---|---|---|---|:---:|:---:|---|---|---:|---|
| 97c26976 | "y" EDT | Sin marca | Sin contenido | No | E | SKU_AUSENTE; MARCA_AUSENTE; CONTENIDO_AUSENTE; MARCA_INCONSISTENTE_CATALOGO; SIN_MATCH_EXACTO_CSV | Y | 0 | Requiere completar identidad comercial. |
| 1c7ae317 | "y" EDT | Yves Saint Lauren | 100ML | Sí | D | MARCA_INCONSISTENTE_CATALOGO; POSSIBLE_DUPLICATE; BRAND_INCONSISTENCY | Y | 1 | Validar marca y concentración frente a Eau De Parfum Y. |
| 98d92f36 | 212 Forever Young Hombre | Carolina Herrera | 150ML | Sí | D | MARCA_INCONSISTENTE_CATALOGO | 212 Forever Young | 0 | Hay homónimo incompleto en catálogo; requiere decisión comercial. |
| 0bfa1cf5 | 212 MEN | Carolina Herrera | 100ML | Sí | G | NAME_INCONSISTENCY | 212 | 2 | Variante distinguible; ajustar regla, sin editar producto. |
| 142e9003 | 212 NYC | Carolina Herrera | 100ML | Sí | G | NAME_INCONSISTENCY | 212 | 2 | Variante distinguible; ajustar regla, sin editar producto. |
| 234cf882 | 212 Sexy | Carolina Herrera | 100ML | Sí | G | NAME_INCONSISTENCY | 212 | 2 | Variante distinguible; ajustar regla, sin editar producto. |
| 05703a0d | 212 VIP | Carolina Herrera | 80ML | Sí | G | NAME_INCONSISTENCY | 212 VIP | 2 | Variante base distinguible de Rose/Elixir. |
| abf03a3b | 212 VIP Black | Carolina Herrera | 100ML | Sí | F | POSSIBLE_DUPLICATE | 212 VIP Black | 1 | Validar si MTV es flanker o presentación equivalente. |
| 15c34d5d | 212 VIP Black MTV | Carolina Herrera | 100ML | Sí | F | POSSIBLE_DUPLICATE | 212 VIP Black | 1 | Identidad MTV necesita confirmación comercial. |
| 1e7b8a13 | 212 VIP Mujer | Carolina Herrera | 50ML | Sí | G | NAME_INCONSISTENCY | 212 VIP | 1 | Variante distinguible; ajustar regla, sin editar producto. |
| 1948de9f | 212 VIP Rose | Carolina Herrera | 50ML | Sí | G | NAME_INCONSISTENCY | 212 VIP Rose | 1 | Variante/contenido distinguible; ajustar regla. |
| 4af82982 | 212 VIP Rose | Carolina Herrera | 80ML | Sí | B | POSSIBLE_DUPLICATE; NAME_INCONSISTENCY | 212 VIP Rose | 2 | Contenido distingue 50ML/80ML; revisar sólo conflicto con Elixir. |
| 9344690e | 212 VIP Rose Elixir | Carolina Herrera | 80ML | Sí | F | POSSIBLE_DUPLICATE; NAME_INCONSISTENCY | 212 VIP Rose | 2 | Elixir debe confirmarse como flanker separado. |
| ef9fb837 | Aqua Di Gio Parfum | Giorgio Armani | 125ML | Sí | G | NAME_INCONSISTENCY | Acqua/Aqua Di Gio | 3 | Parfum es calificador; ajustar regla, sin editar producto. |
| e7c0ce46 | Aqua Di Gio Profondo | Giorgio Armani | 125ML | Sí | F | POSSIBLE_DUPLICATE; NAME_INCONSISTENCY | Acqua/Aqua Di Gio Profondo | 3 | Falta concentración inequívoca; validar comercialmente. |
| 1a48936f | Aqua Di Gio Profondo Eau De Parfum | Giorgio Armani | 125ML | Sí | F | POSSIBLE_DUPLICATE; NAME_INCONSISTENCY | Acqua/Aqua Di Gio Profondo | 3 | Confirmar si corresponde a Profondo EDP. |
| 67e486e2 | Aqua Di Gio Profondo Parfum | Giorgio Armani | 125ML | Sí | F | POSSIBLE_DUPLICATE; NAME_INCONSISTENCY | Acqua/Aqua Di Gio Profondo | 3 | Confirmar concentración Parfum frente a EDP/base. |
| af5fbe25 | Black Opium EDP | Yves Saint Lauren | 50ML | Sí | D | BRAND_INCONSISTENCY | Black Opium | 0 | Unificar ortografía comercial de la marca. |
| a708314a | Born In Roma EDT | Valentino | 100ML | Sí | F | POSSIBLE_DUPLICATE | Born In Roma | 1 | Validar concentración frente a “Borni In Roma Intense”. |
| 2270cfa3 | Borni In Roma Intense | Valentino | 100ML | Sí | C | POSSIBLE_DUPLICATE | Born In Roma | 1 | Corregir “Borni” y confirmar concentración. |
| 23f0fa1f | Bright Crystal EDT | Versace | 50ML | Sí | C | POSSIBLE_DUPLICATE | Bright Crystal | 1 | La contraparte tiene errores; validar nombre canónico. |
| 2532a111 | Eau De Parfum "Y" | Yves Saint Lauren | 100ML | Sí | D | POSSIBLE_DUPLICATE; BRAND_INCONSISTENCY | Y | 1 | Unificar marca y confirmar equivalencia con “Y” EDT. |
| 4dc09e5b | Hugo Boss Bottled EDT | Hugo Boss | 100ML | Sí | C | NAME_INCONSISTENCY | Boss Bottled | 1 | Revisar junto a Bottled Night; no autocorregir. |
| 4c5b71df | Hugo Boss Bottled Nigth | Hugo Boss | 100ML | Sí | C | NAME_INCONSISTENCY | Boss Bottled | 1 | Corregir “Nigth” a nombre comercial confirmado. |
| 6279af14 | Lady Million | Paco Rabanne | 50ML | Sí | G | NAME_INCONSISTENCY | Million | 2 | Producto distinguible de One Million; ajustar regla. |
| 9593a17e | Léau Dissey Pour Homme | Issey Miyake | 125ML | Sí | C | POSSIBLE_DUPLICATE | L'Eau d'Issey Pour Homme | 1 | Normalizar nombre/acentos tras confirmar forma comercial. |
| be4de4be | Léau Dissey Pour Homme Intense | Issey Miyake | 125ML | Sí | C | POSSIBLE_DUPLICATE | L'Eau d'Issey Pour Homme | 1 | Confirmar Intense y normalizar nombre/acentos. |
| 62665c13 | Libre | Yves Saint Lauren | 90ML | Sí | D | MARCA_INCONSISTENTE_CATALOGO; SIN_MATCH_EXACTO_CSV | Libre | 0 | No coincide exactamente con CSV; unificar marca. |
| e08a32d0 | Libre | Ives Saint Lauren | 90ML | Sí | D | MARCA_INCONSISTENTE_CATALOGO; BRAND_INCONSISTENCY | Libre | 0 | Duplicidad de identidad por ortografía de marca. |
| 22ce03a7 | MYSLF Eau De Parfm | Yves Saint Lauren | 100ML | Sí | D | BRAND_INCONSISTENCY; NAME_INCONSISTENCY | MYSLF | 0 | Corregir marca/nombre sólo con decisión comercial. |
| 72fc7b78 | One Million EDT | Paco Rabanne | 50ML | Sí | F | POSSIBLE_DUPLICATE; NAME_INCONSISTENCY | Million | 2 | Confirmar EDT frente a Royal y Lady Million. |
| 2d43d179 | One Million Royal | Paco Rabanne | 50ML | Sí | F | POSSIBLE_DUPLICATE; NAME_INCONSISTENCY | Million | 2 | Royal parece flanker, pero requiere confirmación. |
| ee20a35e | Phantom IN RED | Paco Rabanne | 100ML | Sí | G | NAME_INCONSISTENCY | Phantom | 1 | Calificador IN RED distingue la variante; ajustar regla. |
| 964e6358 | Phantom Parfum (negro) | Paco Rabanne | 100ML | Sí | C | NAME_INCONSISTENCY | Phantom | 1 | “negro” es descriptor informal; confirmar nombre oficial. |
| 7ae84dd5 | Sauvage EDT | Christian Dior | 100ML | Sí | F | POSSIBLE_DUPLICATE | Sauvage | 1 | Confirmar EDT frente a Elixir antes de buscar imagen. |
| ebc1038d | Sauvage Elixir | Christian Dior | 100ML | Sí | F | POSSIBLE_DUPLICATE | Sauvage | 1 | Elixir parece flanker; mantener revisión manual. |
| 79d9390e | Stronger With You Intensely | Emporio Armani | 100ML | Sí | G | NAME_INCONSISTENCY | Stronger With You | 1 | Intensely distingue la variante; ajustar regla. |
| 58461398 | Stronger With You Parfum | Emporio Armani | 100ML | Sí | G | NAME_INCONSISTENCY | Stronger With You | 1 | Parfum distingue la variante; ajustar regla. |
| 1223ebc1 | Versace Brigth Crystal | Versace | 50ML | Sí | C | POSSIBLE_DUPLICATE | Bright Crystal | 1 | Corregir “Brigth” y revisar redundancia de marca. |

## Acción recomendada

- Sin editar datos: los 11 G pueden salir al introducir una comparación consciente de calificadores; el B puede resolverse haciendo que el contenido forme parte obligatoria de la identidad.
- Corrección comercial necesaria: C, D y E (16 casos) necesitan nombre, marca o campos faltantes confirmados por administración.
- Decisión manual: F (11 casos) debe conservarse en revisión hasta validar si cada par es duplicado o flanker.
- No se detectaron duplicados exactos reales dentro de estos 39 (A=0); por eso no se elimina ni modifica ningún producto en esta fase.

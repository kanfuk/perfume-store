"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ImagePlus, Package2 } from "lucide-react";
import { isAcceptedProductImageMimeType } from "@/lib/product-image-config";
import { preloadImage } from "@/lib/preload-image";
import { findProductById, productHasExpectedImage } from "@/lib/product-image-verify";
import { getProductImageRenderConfig } from "@/lib/product-image-render";
import { buildSkuBase } from "@/lib/catalog-import/sku.ts";
import {
  buildBrandOptions,
  normalizeBrandForSave,
  findEquivalentBrand
} from "@/lib/product-brand";
import {
  DEFAULT_MARKUP_PERCENTAGE,
  calculateSuggestedPrice,
  calculateMarkupPercentageFromPrice,
  calculateEstimatedProfit
} from "@/lib/product-pricing";
import { normalizeStockValue } from "@/lib/stock";
import { formatCurrency } from "@/lib/format";

type AddPerfumeModalProps = {
  existingBrands: string[];
  existingTypes: string[];
  onClose: () => void;
  /** Se llama cuando el producto (con o sin imagen) quedo guardado; el llamador refresca el catalogo. */
  onSaved: () => void;
};

type FieldErrors = Partial<
  Record<"sku" | "nombre" | "marca" | "contenido" | "costoUnitario" | "precioVenta" | "stock" | "stockMinimo", string>
>;

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

/**
 * Formulario manual "Agregar perfume" (Fase B). Reutiliza EXACTAMENTE el
 * pipeline de imagenes ya corregido (POST /api/admin/products/[id]/image) y
 * la unica formula de recargo del dominio (lib/product-pricing.ts, que
 * envuelve calculateSalePrice del importador CSV) -- no implementa un
 * segundo procesador de imagenes ni una formula de precio distinta.
 *
 * Como el producto necesita un id real para subir la imagen, el flujo es:
 * 1) crear producto (sin imagen) -> 2) subir imagen con ese id -> 3) avisar
 * al padre para refrescar el catalogo. Si la creacion falla, no se crea
 * nada. Si la imagen falla DESPUES de crear el producto, el producto NO se
 * borra: se informa "creado sin imagen" y se ofrece reintentar solo la
 * imagen, sin duplicar el producto.
 */
export function AddPerfumeModal({ existingBrands, existingTypes, onClose, onSaved }: AddPerfumeModalProps) {
  const brandOptions = useMemo(() => buildBrandOptions(existingBrands), [existingBrands]);

  const [sku, setSku] = useState("");
  const [skuTouched, setSkuTouched] = useState(false);
  const [marcaMode, setMarcaMode] = useState<"select" | "new">(brandOptions.length === 0 ? "new" : "select");
  const [marca, setMarca] = useState("");
  const [marcaNueva, setMarcaNueva] = useState("");
  const [nombre, setNombre] = useState("");
  const [contenido, setContenido] = useState("");
  const [tipoProducto, setTipoProducto] = useState(existingTypes[0] ?? "simple");
  const [descripcion, setDescripcion] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [markupPercentage, setMarkupPercentage] = useState(String(DEFAULT_MARKUP_PERCENTAGE));
  const [precioVenta, setPrecioVenta] = useState("");
  const [precioEditedManually, setPrecioEditedManually] = useState(false);
  const [stock, setStock] = useState("1");
  const [stockMinimo, setStockMinimo] = useState("0");
  const [activo, setActivo] = useState(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [createdWithoutImage, setCreatedWithoutImage] = useState(false);
  const [done, setDone] = useState(false);

  const effectiveMarca = marcaMode === "select" ? marca : marcaNueva;

  const costoNumber = Number(costoUnitario) || 0;
  const markupNumber = Number(markupPercentage) || 0;

  function handleCostoChange(value: string) {
    setCostoUnitario(value);
    if (!precioEditedManually) {
      const nextPrecio = calculateSuggestedPrice(Number(value) || 0, markupNumber);
      setPrecioVenta(nextPrecio > 0 ? String(nextPrecio) : "");
    }
  }

  function handleMarkupChange(value: string) {
    setMarkupPercentage(value);
    setPrecioEditedManually(false);
    const nextPrecio = calculateSuggestedPrice(costoNumber, Number(value) || 0);
    setPrecioVenta(nextPrecio > 0 ? String(nextPrecio) : "");
  }

  function handlePrecioChange(value: string) {
    setPrecioVenta(value);
    setPrecioEditedManually(true);
    const nextMarkup = calculateMarkupPercentageFromPrice(costoNumber, Number(value) || 0);
    setMarkupPercentage(String(nextMarkup));
  }

  const estimatedProfit = calculateEstimatedProfit(costoNumber, Number(precioVenta) || 0);

  function suggestSku() {
    if (skuTouched) return;
    if (!effectiveMarca.trim() || !nombre.trim()) return;
    setSku(buildSkuBase(effectiveMarca, nombre, contenido));
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptedProductImageMimeType(file.type)) {
      setImageError("Selecciona una imagen JPG, PNG, WebP o AVIF.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setImageError("");
  }

  function removeSelectedFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl("");
    setImageError("");
  }

  function validate(): boolean {
    const nextErrors: FieldErrors = {};
    if (!sku.trim()) nextErrors.sku = "El SKU es obligatorio.";
    if (!nombre.trim()) nextErrors.nombre = "El nombre es obligatorio.";
    if (!effectiveMarca.trim()) nextErrors.marca = "La marca es obligatoria.";
    if (!contenido.trim()) nextErrors.contenido = "El contenido es obligatorio (ej. 100ML).";
    if (!Number.isFinite(costoNumber) || costoNumber < 0) nextErrors.costoUnitario = "El costo debe ser 0 o mayor.";
    const precioNumber = Number(precioVenta);
    if (!Number.isFinite(precioNumber) || precioNumber <= 0) nextErrors.precioVenta = "El precio de venta debe ser mayor a 0.";
    const stockNumber = Number(stock);
    if (!Number.isInteger(stockNumber) || stockNumber < 0) nextErrors.stock = "El stock debe ser un entero no negativo.";
    const stockMinNumber = Number(stockMinimo);
    if (!Number.isInteger(stockMinNumber) || stockMinNumber < 0) nextErrors.stockMinimo = "El stock mínimo debe ser un entero no negativo.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  /**
   * Mismo pipeline de verificacion que CatalogControlCenter.verifyAndFinish:
   * el POST puede confirmar persistencia en DB/Storage mientras el navegador
   * todavia no puede visualizar la URL, asi que no se anuncia exito solo
   * porque el POST no lanzo una excepcion. 1) relectura GET fresca
   * (cache: no-store) de /api/admin/products para confirmar que el servidor
   * YA ve imageStoragePath/imageUrl nuevos; 2) precarga real con
   * preloadImage, usando el MISMO src que renderizara ProductImage
   * (getProductImageRenderConfig) -- nunca se verifica una URL y se
   * renderiza otra distinta. Solo si ambos pasan se informa exito.
   */
  async function uploadSelectedImage(productId: string): Promise<boolean> {
    if (!selectedFile) return true;
    setUploadingImage(true);
    setImageError("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const data = await fetchJson(`/api/admin/products/${productId}/image`, { method: "POST", body: formData });
      if (!data.imageStoragePath || !data.imageUrl) {
        throw new Error("La imagen se subió pero no se pudo confirmar el resultado. Recarga la página.");
      }

      const listData = await fetchJson("/api/admin/products", { cache: "no-store" });
      const latest = findProductById<{ id: string; imageStoragePath?: string | null; imageUrl?: string | null }>(
        listData.products ?? [],
        productId
      );
      if (!productHasExpectedImage(latest, { imageStoragePath: data.imageStoragePath, imageUrl: data.imageUrl })) {
        throw new Error("La imagen se guardó, pero todavía no puede visualizarse.");
      }

      const loaded = await preloadImage(getProductImageRenderConfig(data.imageUrl).src);
      if (!loaded) {
        throw new Error("La imagen se guardó, pero todavía no puede visualizarse.");
      }

      return true;
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "No fue posible subir la imagen.");
      return false;
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit() {
    if (submitting || uploadingImage) return; // impide doble envio
    setServerError("");
    if (!validate()) return;

    const finalBrand = normalizeBrandForSave(effectiveMarca);
    const equivalent = marcaMode === "new" ? findEquivalentBrand(finalBrand, brandOptions) : null;
    const brandToSave = equivalent ? equivalent.label : finalBrand;

    setSubmitting(true);
    try {
      const created = await fetchJson("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: sku.trim(),
          nombre: nombre.trim(),
          marca: brandToSave,
          contenido: contenido.trim(),
          descripcion: descripcion.trim(),
          tipoProducto,
          costoUnitario: costoNumber,
          precioVenta: Number(precioVenta),
          stock: normalizeStockValue(stock),
          stockMinimo: Number(stockMinimo),
          activo
        })
      });
      const productId: string = created.product.id;
      setCreatedProductId(productId);

      if (selectedFile) {
        const imageOk = await uploadSelectedImage(productId);
        if (!imageOk) {
          setCreatedWithoutImage(true);
          return; // el producto SI quedo creado; no se afirma exito total
        }
      }

      setDone(true);
      onSaved();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "No fue posible crear el producto.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retryImageOnly() {
    if (!createdProductId) return;
    const imageOk = await uploadSelectedImage(createdProductId);
    if (imageOk) {
      setCreatedWithoutImage(false);
      setDone(true);
      onSaved();
    }
  }

  function finishWithoutImage() {
    onSaved();
    onClose();
  }

  const busy = submitting || uploadingImage;

  return (
    <div className="fixed inset-0 z-50 bg-brand-950/20 px-3 py-3 sm:px-4 sm:py-5">
      <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-center">
        <div className="flex max-h-[calc(100dvh-24px)] min-h-0 w-full flex-col overflow-hidden rounded-[24px] border border-brand-100 bg-white shadow-soft sm:max-h-[calc(100dvh-40px)]">
          <div className="shrink-0 border-b border-brand-100 bg-white/95 px-5 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex rounded-2xl bg-brand-100 p-3 text-brand-700">
                  <Package2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-brand-950">Agregar perfume</h3>
                  <p className="text-sm text-brand-900/70">Crea el producto y sube su foto en un solo paso.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-900"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="min-h-0 overflow-x-hidden overflow-y-auto px-5 py-5 pb-[calc(128px+env(safe-area-inset-bottom))]">
            {done ? (
              <div className="flex items-start gap-3 rounded-2xl border border-[#bfe6c6] bg-[#eefbf1] px-4 py-4 text-sm text-[#1f6d33]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Producto creado correctamente.</p>
                  <p className="mt-1">
                    {selectedFile ? "La imagen se subió y quedó guardada." : "Puedes agregarle una imagen más tarde desde el catálogo."}
                  </p>
                </div>
              </div>
            ) : createdWithoutImage ? (
              <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Producto creado sin imagen.</p>
                    <p className="mt-1">
                      El perfume ya está guardado en el catálogo, pero la imagen no se pudo subir
                      {imageError ? `: ${imageError}` : "."} No se creó un producto duplicado.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void retryImageOnly()}
                    disabled={uploadingImage || !selectedFile}
                    className="min-h-11 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingImage ? "Reintentando..." : "Reintentar imagen"}
                  </button>
                  <button
                    type="button"
                    onClick={finishWithoutImage}
                    className="min-h-11 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
                  >
                    Continuar sin imagen
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {serverError ? (
                  <div className="flex items-start gap-2 rounded-xl border border-[#f3c6c0] bg-[#fdf1ef] px-4 py-3 text-sm text-[#8a2c22]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{serverError}</span>
                  </div>
                ) : null}

                {/* Imagen: archivo, nunca ruta manual */}
                <section className="space-y-2">
                  <span className="text-sm font-semibold text-brand-900">Imagen</span>
                  {previewUrl ? (
                    <div className="flex items-center gap-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-brand-100 bg-white">
                        {/* Preview local con <img>: aun no existe productId ni URL final (es un blob: local), next/image no aplica todavia. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Vista previa" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex flex-1 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="min-h-11 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-900"
                        >
                          Reemplazar archivo
                        </button>
                        <button
                          type="button"
                          onClick={removeSelectedFile}
                          className="min-h-11 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-900"
                        >
                          Quitar selección
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 text-sm font-semibold text-brand-700"
                    >
                      <ImagePlus className="h-6 w-6" />
                      Subir imagen
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  <p className="text-xs text-brand-900/55">JPG, PNG, WebP o AVIF. Se optimiza automáticamente. Opcional.</p>
                  {imageError ? <p className="text-xs font-semibold text-[#8a2c22]">{imageError}</p> : null}
                </section>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-semibold text-brand-900">Nombre</span>
                    <input
                      value={nombre}
                      onChange={(event) => setNombre(event.target.value)}
                      onBlur={suggestSku}
                      className="block w-full min-w-0 max-w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                    />
                    {errors.nombre ? <p className="text-xs font-semibold text-[#8a2c22]">{errors.nombre}</p> : null}
                  </label>

                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-semibold text-brand-900">Marca</span>
                    {marcaMode === "select" ? (
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={marca}
                          onChange={(event) => setMarca(event.target.value)}
                          onBlur={suggestSku}
                          className="min-h-11 flex-1 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                        >
                          <option value="">Selecciona una marca</option>
                          {brandOptions.map((option) => (
                            <option key={option.key} value={option.label}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setMarcaMode("new");
                            setMarca("");
                          }}
                          className="min-h-11 rounded-lg border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-900"
                        >
                          + Agregar nueva marca
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={marcaNueva}
                          onChange={(event) => setMarcaNueva(event.target.value)}
                          onBlur={suggestSku}
                          placeholder="Nombre de la marca nueva"
                          className="min-h-11 flex-1 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                        />
                        {brandOptions.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMarcaMode("select");
                              setMarcaNueva("");
                            }}
                            className="min-h-11 rounded-lg border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-900"
                          >
                            Elegir marca existente
                          </button>
                        ) : null}
                        {marcaNueva.trim() && findEquivalentBrand(marcaNueva, brandOptions) ? (
                          <p className="w-full text-xs font-semibold text-amber-700">
                            Ya existe la marca &ldquo;{findEquivalentBrand(marcaNueva, brandOptions)?.label}&rdquo;; se usará esa.
                          </p>
                        ) : null}
                      </div>
                    )}
                    {errors.marca ? <p className="text-xs font-semibold text-[#8a2c22]">{errors.marca}</p> : null}
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-brand-900">Contenido</span>
                    <input
                      value={contenido}
                      onChange={(event) => setContenido(event.target.value)}
                      onBlur={suggestSku}
                      placeholder="100ML"
                      className="block w-full min-w-0 max-w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                    />
                    {errors.contenido ? <p className="text-xs font-semibold text-[#8a2c22]">{errors.contenido}</p> : null}
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-brand-900">Categoría / tipo</span>
                    <input
                      list="add-perfume-type-options"
                      value={tipoProducto}
                      onChange={(event) => setTipoProducto(event.target.value)}
                      className="block w-full min-w-0 max-w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                    />
                    <datalist id="add-perfume-type-options">
                      {existingTypes.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </label>

                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-semibold text-brand-900">SKU</span>
                    <input
                      value={sku}
                      onChange={(event) => {
                        setSku(event.target.value);
                        setSkuTouched(true);
                      }}
                      placeholder="Se sugiere automáticamente desde marca + nombre + contenido"
                      className="block w-full min-w-0 max-w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                    />
                    {errors.sku ? <p className="text-xs font-semibold text-[#8a2c22]">{errors.sku}</p> : null}
                  </label>

                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-semibold text-brand-900">Descripción</span>
                    <textarea
                      value={descripcion}
                      onChange={(event) => setDescripcion(event.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                    />
                  </label>
                </div>

                <section className="space-y-3 rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
                  <h4 className="text-sm font-bold text-brand-950">Costo, recargo y precio</h4>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-brand-900">Costo</span>
                      <input
                        type="number"
                        min={0}
                        value={costoUnitario}
                        onChange={(event) => handleCostoChange(event.target.value)}
                        className="w-full rounded-lg border border-brand-100 bg-white px-4 py-3 text-sm text-brand-950"
                      />
                      {errors.costoUnitario ? <p className="text-xs font-semibold text-[#8a2c22]">{errors.costoUnitario}</p> : null}
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-brand-900">Recargo sobre costo</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={markupPercentage}
                          onChange={(event) => handleMarkupChange(event.target.value)}
                          className="w-full rounded-lg border border-brand-100 bg-white px-4 py-3 text-sm text-brand-950"
                        />
                        <span className="text-sm font-semibold text-brand-900">%</span>
                      </div>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-brand-900">Precio de venta</span>
                      <input
                        type="number"
                        min={0}
                        value={precioVenta}
                        onChange={(event) => handlePrecioChange(event.target.value)}
                        className="w-full rounded-lg border border-brand-100 bg-white px-4 py-3 text-sm text-brand-950"
                      />
                      {errors.precioVenta ? <p className="text-xs font-semibold text-[#8a2c22]">{errors.precioVenta}</p> : null}
                    </label>
                  </div>
                  <p className="text-xs text-brand-900/70">
                    precio de venta = costo × (1 + recargo/100). Predeterminado 35%; se puede ajustar el
                    recargo o escribir el precio final directamente (recalcula el recargo automáticamente).
                    La utilidad es la diferencia entre el precio de venta y el costo.
                  </p>
                  <p className="text-sm font-semibold text-brand-950">
                    Utilidad estimada: {formatCurrency(estimatedProfit)}
                  </p>
                </section>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-brand-900">Stock inicial</span>
                    <input
                      type="number"
                      min={0}
                      value={stock}
                      onChange={(event) => setStock(event.target.value)}
                      className="block w-full min-w-0 max-w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                    />
                    {errors.stock ? <p className="text-xs font-semibold text-[#8a2c22]">{errors.stock}</p> : null}
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-brand-900">Stock mínimo</span>
                    <input
                      type="number"
                      min={0}
                      value={stockMinimo}
                      onChange={(event) => setStockMinimo(event.target.value)}
                      className="block w-full min-w-0 max-w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                    />
                    {errors.stockMinimo ? <p className="text-xs font-semibold text-[#8a2c22]">{errors.stockMinimo}</p> : null}
                  </label>
                </div>

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-4 text-sm text-brand-900">
                  <span className="font-semibold text-brand-950">Disponible para clientes</span>
                  <select
                    value={activo ? "Activo" : "Pausado"}
                    onChange={(event) => setActivo(event.target.value === "Activo")}
                    className="min-h-11 rounded-full border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-900"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Pausado">Pausado</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {!done && !createdWithoutImage ? (
            <div className="shrink-0 border-t border-brand-100 bg-white/95 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="min-h-11 rounded-lg border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSubmit()}
                  className="min-h-11 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Creando..." : uploadingImage ? "Subiendo imagen..." : "Guardar producto"}
                </button>
              </div>
            </div>
          ) : done ? (
            <div className="shrink-0 border-t border-brand-100 bg-white/95 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Listo
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

type BulkImageDropzoneProps = {
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
};

/**
 * Solo selecciona archivos (drag-and-drop + selector tradicional) y los
 * entrega en bruto al panel -- toda validacion/matching/limite de lote vive
 * en lib/product-image-bulk-matching.ts (motor puro), nunca aqui.
 */
export function BulkImageDropzone({ disabled = false, onFilesSelected }: BulkImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (disabled) return;
        handleFiles(event.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
        disabled
          ? "cursor-not-allowed border-[#DDD0C1] bg-[#F7F1E8] opacity-60"
          : dragOver
            ? "cursor-pointer border-[#B88B58] bg-[#F4E8DB]"
            : "cursor-pointer border-[#DDD0C1] bg-white hover:border-[#D8BEA2]"
      }`}
    >
      <UploadCloud className="h-8 w-8 text-[#B88B58]" strokeWidth={1.5} />
      <p className="text-sm font-semibold text-[#191714]">Arrastra tus imágenes aquí</p>
      <p className="text-xs text-[#6B6258]">o haz clic para elegirlas · JPG, PNG, WebP o AVIF</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
        className="sr-only"
        aria-label="Seleccionar imágenes de productos"
      />
    </div>
  );
}

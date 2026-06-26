"use client";

import { useEffect } from "react";
import { registerAdminServiceWorker } from "@/lib/pwa/registerServiceWorker";

export function AdminPwaInitializer() {
  useEffect(() => {
    void registerAdminServiceWorker().catch(() => {
      // La app sigue funcionando aunque el service worker no se registre.
    });
  }, []);

  return null;
}

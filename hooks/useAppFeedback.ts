"use client";

import { useContext } from "react";
import { AppFeedbackContext } from "@/components/ui/AppFeedbackProvider";

export function useAppFeedback() {
  const context = useContext(AppFeedbackContext);

  if (!context) {
    throw new Error("useAppFeedback debe usarse dentro de AppFeedbackProvider.");
  }

  return context;
}

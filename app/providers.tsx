"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        closeButton
        richColors
        position="top-right"
        toastOptions={{
          classNames: {
            toast: "font-sans",
          },
        }}
      />
    </>
  );
}

"use client";

import { useEffect } from "react";
import { useAnon } from "@/lib/store";

export function AnonshareThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAnon((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (theme === "light") {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }
  }, [theme]);

  return <>{children}</>;
}

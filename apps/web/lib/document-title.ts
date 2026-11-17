"use client";

import { useEffect } from "react";

/**
 * Names the browser tab after what the page shows once it has loaded, with the unique part first,
 * so that two elections open in two tabs can be told apart.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (title) document.title = `${title} · DVote`;
  }, [title]);
}

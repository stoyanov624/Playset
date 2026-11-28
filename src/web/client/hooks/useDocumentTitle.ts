import { useEffect } from "react";

/** Each screen names the browser tab after what it shows. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

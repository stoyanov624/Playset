import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { LinkButton } from "./LinkButton.js";

/** The way back to the start, to search for an Artist again. */
export function SearchLink({ children = "Search for an Artist" }: { children?: ReactNode }) {
  return (
    <LinkButton to="/" variant="secondary" icon={<Search size={20} aria-hidden="true" />}>
      {children}
    </LinkButton>
  );
}

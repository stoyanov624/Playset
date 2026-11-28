// The end of the page header, where a screen may put its own words and actions (the admin page's
// "Admin" and "Log out"); Visitor screens leave it empty.
import { createContext, useContext } from "react";

export const HeaderSlotContext = createContext<HTMLElement | null>(null);

export function useHeaderSlot(): HTMLElement | null {
  return useContext(HeaderSlotContext);
}

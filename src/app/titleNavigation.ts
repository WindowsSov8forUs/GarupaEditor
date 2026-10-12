import { createContext, useContext } from "react";

export interface TitleNavigation {
  visible: boolean;
  returnToTitle(): void;
}
export const TitleNavigationContext = createContext<TitleNavigation | null>(null);
export const useApplicationPresentation = () => useContext(TitleNavigationContext);
export const useReturnToTitle = () => useApplicationPresentation()?.returnToTitle;

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StickyPage } from "./sticky/StickyPage";
import { PreferencesPage } from "./preferences/PreferencesPage";
import { SearchPage } from "./search/SearchPage";

type Route =
  | { kind: "sticky"; stickyId: string }
  | { kind: "preferences" }
  | { kind: "search" }
  | { kind: "unknown" };

export default function App() {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    const label = getCurrentWindow().label;
    if (label.startsWith("sticky-")) {
      setRoute({ kind: "sticky", stickyId: label.slice("sticky-".length) });
    } else if (label === "preferences") {
      setRoute({ kind: "preferences" });
    } else if (label === "search") {
      setRoute({ kind: "search" });
    } else {
      setRoute({ kind: "unknown" });
    }
  }, []);

  if (!route) {
    return <div className="h-screen bg-yellow-100 p-3 text-xs opacity-60">Loading...</div>;
  }
  if (route.kind === "preferences") {
    return <PreferencesPage />;
  }
  if (route.kind === "search") {
    return <SearchPage />;
  }
  if (route.kind === "sticky") {
    return <StickyPage stickyId={route.stickyId} />;
  }
  return (
    <div className="h-screen bg-red-100 p-3 text-xs">
      Unknown window label.
    </div>
  );
}

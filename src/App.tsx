import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StickyPage } from "./sticky/StickyPage";

export default function App() {
  const [stickyId, setStickyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const label = getCurrentWindow().label;
    if (label.startsWith("sticky-")) {
      setStickyId(label.slice("sticky-".length));
    }
    setReady(true);
  }, []);

  if (!ready) {
    return <div className="h-screen bg-yellow-100 p-3 text-xs opacity-60">Loading...</div>;
  }
  if (!stickyId) {
    return (
      <div className="h-screen bg-red-100 p-3 text-xs">
        Unknown window label. Expected "sticky-&lt;id&gt;".
      </div>
    );
  }
  return <StickyPage stickyId={stickyId} />;
}

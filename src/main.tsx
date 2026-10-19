import ReactDOM from "react-dom/client";
import App from "./App";
import { AboutWindow } from "./components/AboutWindow";
import { ShortcutsWindow } from "./components/ShortcutsWindow";
import { currentWindowKind } from "./lib/platform";
import "./styles.css";

const windowKind = currentWindowKind();
const isMac = navigator.userAgent.includes("Mac");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  windowKind === "about" ? <AboutWindow /> : windowKind === "shortcuts" ? <ShortcutsWindow isMac={isMac} /> : <App />,
);

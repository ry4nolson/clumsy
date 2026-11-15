import ReactDOM from "react-dom/client";
import App from "./App";
import { installTouchShell } from "./lib/backButton";
import { isMac, isMobile, showContextMenu } from "./lib/platform";
import { blockWebviewMenu } from "./lib/shellMenu";
import "./styles.css";
import "./touch.css";

if (!isMac) {
  blockWebviewMenu((copy) => void showContextMenu([{ label: "Copy", run: copy }]));
}

if (isMobile) {
  document.documentElement.classList.add("touch");
  installTouchShell();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

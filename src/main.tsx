import ReactDOM from "react-dom/client";
import App from "./App";
import { installTouchShell } from "./lib/backButton";
import { isMac, isMobile, showContextMenu, showDocumentMenu } from "./lib/platform";
import { blockWebviewMenu } from "./lib/shellMenu";
import "./styles.css";
import "./touch.css";

if (!isMobile) {
  blockWebviewMenu((copy, point) =>
    void (isMac ? showDocumentMenu({ palette: null, sections: [{ items: [{ kind: "copy", label: "Copy" }] }] }, point, () => undefined) : showContextMenu([{ label: "Copy", run: copy }])),
  );
}

if (isMobile) {
  document.documentElement.classList.add("touch");
  installTouchShell();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

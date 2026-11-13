import ReactDOM from "react-dom/client";
import App from "./App";
import { isMac, showContextMenu } from "./lib/platform";
import { blockWebviewMenu } from "./lib/shellMenu";
import "./styles.css";

if (!isMac) {
  blockWebviewMenu((copy) => void showContextMenu([{ label: "Copy", run: copy }]));
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);

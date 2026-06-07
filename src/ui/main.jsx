import { createRoot } from "react-dom/client";

import "./tailwind.css";
import { ViewerApp } from "./ViewerApp.jsx";

const root = document.querySelector("#root");

if (root) {
  const surface = root.dataset.surface || "viewer";
  createRoot(root).render(<ViewerApp surface={surface} />);
}

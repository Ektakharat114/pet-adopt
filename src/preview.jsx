import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import App from "./App.jsx";
import { installMockApi } from "./mockApi.js";
import "./styles.css";
import "./preview.css";

// Preview build only: the API runs in the browser and nothing leaves the page.
installMockApi();
// The viewer's frame returns false for confirm(), so confirm deletes in the preview.
window.confirm = () => true;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MemoryRouter>
      <div className="preview-note">
        <b>Preview.</b> Sample data in your browser, resets on reload. Staff password: <code>admin123</code>.
        To try <b>Track</b>, use code <code>PH-K7M2XQ</code> with <code>priya@example.com</code>.
        Photos stay in this tab (the real site uses Cloudinary). Contact and donation details are placeholders.
      </div>
      <App />
    </MemoryRouter>
  </React.StrictMode>
);

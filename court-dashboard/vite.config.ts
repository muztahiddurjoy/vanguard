import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import tailwindcss from "@tailwindcss/vite"

// start.sh serves the dashboard through its ngrok tunnel and names the tunnel's host
// here: Vite refuses requests for a host it does not know.
const tunnelHost = process.env.TUNNEL_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Next to the DLAO (5173) and panel lawyer (5174) dashboards, so all can run at once.
  server: { port: 5175, allowedHosts: tunnelHost ? [tunnelHost] : [] },
  preview: { port: 4175 },
})

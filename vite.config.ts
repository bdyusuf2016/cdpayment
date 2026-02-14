import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/cdpayment/", // IMPORTANT: This must match your GitHub repository name exactly. If your repo is 'customs-duty-payment-pro', change this to '/customs-duty-payment-pro/'
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});

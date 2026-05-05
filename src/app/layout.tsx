import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventarios",
  description: "Gestión de inventarios y selecciones",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

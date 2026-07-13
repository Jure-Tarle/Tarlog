import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tarlog Flow",
    template: "%s · Tarlog Flow",
  },
  description: "Local-first Zeiterfassung, Abrechnung und Compliance.",
  applicationName: "Tarlog Flow",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#090b11" },
  ],
};

const themeBootstrap = `
(() => {
  try {
    const key = "tarlog-theme";
    const stored = localStorage.getItem(key);
    const theme = stored === "light" || stored === "dark"
      ? stored
      : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.dataset.tarlogThemeColor = "true";
    meta.content = theme === "dark" ? "#090b11" : "#f5f7fb";
    document.head.append(meta);
  } catch (_) {}
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Mr. Doge SDK — client example",
  description: "Browser client using @mrdoge/client with a Next.js token route",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

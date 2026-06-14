import "./globals.css"
import "@fontsource/poppins/400.css"
import "@fontsource/poppins/500.css"
import "@fontsource/poppins/600.css"
import "@fontsource/poppins/700.css"

import Sidebar from "@/components/Sidebar"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[#050505] text-white">

        <div className="flex min-h-screen">

          <Sidebar />

          <main className="ml-[210px] flex-1 min-w-0 px-14 py-10">
            {children}
          </main>

        </div>

      </body>
    </html>
  )
}
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const links = [
  { name: "CRM", href: "/crm" },
  { name: "Streamers", href: "/streamers" },
  { name: "Orders", href: "/orders" },
  { name: "Production", href: "/production" },
  { name: "Shipping", href: "/shipping" },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-[210px] border-r border-[#141419] bg-[#050505]">

      <div className="border-b border-[#141419] px-7 py-8">

        <h1 className="text-[34px] font-bold tracking-tight">
          Phynite
        </h1>

        <p className="mt-2 text-[10px] uppercase tracking-[0.35em] text-cyan-400">
          Admin
        </p>

      </div>

      <div className="flex flex-col gap-2 p-4">

        {links.map((link) => {
          const active = pathname === link.href

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`
                rounded-2xl
                px-5
                py-3
                text-[14px]
                font-medium
                transition-all
                duration-200
                ${
                  active
                    ? "bg-[#0D0D12] text-cyan-400 border border-[#1B1B22]"
                    : "text-[#6A6A74] hover:bg-[#0D0D12] hover:text-white"
                }
              `}
            >
              {link.name}
            </Link>
          )
        })}

      </div>

    </aside>
  )
}
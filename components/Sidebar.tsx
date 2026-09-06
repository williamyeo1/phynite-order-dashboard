"use client"

import Link from "next/link"
import { useMemo } from "react"
import { usePathname } from "next/navigation"
import {
  normalizeTicketsStore,
  totalOpenTicketCount,
  type TicketsStore,
} from "@/lib/tickets"
import { useSharedStorage } from "@/lib/useSharedStorage"

const links = [
  { name: "CRM", href: "/crm" },
  { name: "Streamers", href: "/streamers" },
  { name: "Orders", href: "/orders" },
  { name: "KPI", href: "/kpi" },
  { name: "Tickets", href: "/tickets" },
  { name: "Settings", href: "/settings" },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [ticketsRaw] = useSharedStorage<TicketsStore>("tickets", {
    support: [],
    health: [],
  })

  const openCount = useMemo(
    () => totalOpenTicketCount(normalizeTicketsStore(ticketsRaw)),
    [ticketsRaw]
  )

  return (
    <aside className="fixed left-0 top-0 h-screen w-[210px] border-r border-[#141419] bg-[#050505]">
      <div className="border-b border-[#141419] px-7 py-8">
        <h1 className="text-[34px] font-bold tracking-tight">Phynite</h1>
        <p className="mt-2 text-[10px] uppercase tracking-[0.35em] text-cyan-400">
          Admin
        </p>
      </div>

      <div className="flex flex-col gap-2 p-4">
        {links.map((link) => {
          const active = pathname === link.href
          const showBadge = link.href === "/tickets" && openCount > 0

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
                flex items-center justify-between gap-2
                ${
                  active
                    ? "bg-[#0D0D12] text-cyan-400 border border-[#1B1B22]"
                    : "text-[#6A6A74] hover:bg-[#0D0D12] hover:text-white"
                }
              `}
            >
              <span>{link.name}</span>
              {showBadge && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-orange-500/90 text-black text-[11px] font-bold tabular-nums flex items-center justify-center">
                  {openCount > 99 ? "99+" : openCount}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </aside>
  )
}

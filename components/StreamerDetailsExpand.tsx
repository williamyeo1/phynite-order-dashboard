import type { Streamer } from "@/lib/orderUtils"

export function StreamerDetailsExpand({ streamer }: { streamer: Streamer }) {
  return (
    <div className="border-t border-white/10 px-6 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
            EMAIL
          </div>
          <div className="text-zinc-300 text-sm break-all">
            {streamer.email || "—"}
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
            PHONE
          </div>
          <div className="text-zinc-300 text-sm">{streamer.phone || "—"}</div>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
            PLATFORM
          </div>
          <div className="text-zinc-300 text-sm">{streamer.platform || "—"}</div>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
            SHIPPING
          </div>
          <div className="text-cyan-400 text-sm font-semibold">
            {streamer.shippingType || "—"}
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
            PARTNERED
          </div>
          <div className="text-zinc-300 text-sm">
            {streamer.partnered ? "Yes" : "Test streamer"}
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
            ONBOARDED
          </div>
          <div className="text-zinc-300 text-sm">
            {streamer.onboardedAt || "—"}
          </div>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
            FULL ADDRESS
          </div>
          <div className="text-zinc-300 text-sm">
            {streamer.country === "UK" ? (
              <>
                {streamer.address1}
                {streamer.address2 && `, ${streamer.address2}`}
                {streamer.address1 && ", "}
                {streamer.city}
                {streamer.ukCounty && `, ${streamer.ukCounty}`}{" "}
                {streamer.ukPostal}
              </>
            ) : (
              <>
                {streamer.address1}
                {streamer.address2 && `, ${streamer.address2}`}
                {streamer.address1 && ", "}
                {streamer.city}
                {streamer.state && `, ${streamer.state}`} {streamer.zip}
              </>
            )}
            {!streamer.address1 && !streamer.city && "—"}
          </div>
        </div>

        {streamer.socials?.filter(Boolean).length > 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-3">
              SOCIAL LINKS
            </div>
            <div className="flex flex-wrap gap-2">
              {streamer.socials.filter(Boolean).map((social, index) => (
                <div
                  key={index}
                  className="bg-[#111] px-4 py-2 rounded-xl text-cyan-400 text-sm"
                >
                  {social}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

export type StreamerFormData = {
  firstName: string
  lastName: string
  brandName: string
  email: string
  phone: string
  shippingType: string
  partnered: boolean
  platform: string
  country: string
  address1: string
  address2: string
  city: string
  state: string
  zip: string
  ukCounty: string
  ukPostal: string
  socials: string[]
}

export const EMPTY_STREAMER_FORM: StreamerFormData = {
  firstName: "",
  lastName: "",
  brandName: "",
  email: "",
  phone: "",
  shippingType: "2 Day",
  partnered: false,
  platform: "TikTok",
  country: "US",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  ukCounty: "",
  ukPostal: "",
  socials: [""],
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none"
    />
  )
}

type StreamerFormProps = {
  form: StreamerFormData
  setForm: (form: StreamerFormData) => void
}

export function StreamerForm({ form, setForm }: StreamerFormProps) {
  function updateSocial(index: number, value: string) {
    const updated = [...form.socials]
    updated[index] = value
    setForm({ ...form, socials: updated })
  }

  function addSocialField() {
    setForm({ ...form, socials: [...form.socials, ""] })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Input
          value={form.firstName}
          onChange={(v) => setForm({ ...form, firstName: v })}
          placeholder="First Name"
        />
        <Input
          value={form.lastName}
          onChange={(v) => setForm({ ...form, lastName: v })}
          placeholder="Last Name"
        />
      </div>

      <Input
        value={form.brandName}
        onChange={(v) => setForm({ ...form, brandName: v })}
        placeholder="Brand Name"
      />

      <Input
        value={form.email}
        onChange={(v) => setForm({ ...form, email: v })}
        placeholder="Email"
      />

      <Input
        value={form.phone}
        onChange={(v) => setForm({ ...form, phone: v })}
        placeholder="Phone Number"
      />

      <select
        value={form.shippingType}
        onChange={(e) =>
          setForm({ ...form, shippingType: e.target.value })
        }
        className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-5 text-white outline-none"
      >
        <option value="1 Day">1 Day Shipping</option>
        <option value="2 Day">2 Day Shipping</option>
        <option value="3 Day">3 Day Shipping</option>
      </select>

      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setForm({ ...form, partnered: true })}
          className={`py-5 rounded-2xl font-bold transition ${
            form.partnered
              ? "bg-cyan-400 text-black"
              : "bg-[#070707] border border-white/10 text-white"
          }`}
        >
          Partnered Streamer
        </button>

        <button
          type="button"
          onClick={() => setForm({ ...form, partnered: false })}
          className={`py-5 rounded-2xl font-bold transition ${
            !form.partnered
              ? "bg-yellow-400 text-black"
              : "bg-[#070707] border border-white/10 text-white"
          }`}
        >
          Test Streamer
        </button>
      </div>

      <select
        value={form.country}
        onChange={(e) => setForm({ ...form, country: e.target.value })}
        className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-5 text-white outline-none"
      >
        <option value="US">United States</option>
        <option value="UK">United Kingdom</option>
      </select>

      <Input
        value={form.address1}
        onChange={(v) => setForm({ ...form, address1: v })}
        placeholder="Address Line 1"
      />

      <Input
        value={form.address2}
        onChange={(v) => setForm({ ...form, address2: v })}
        placeholder="Address Line 2"
      />

      {form.country === "US" ? (
        <div className="grid grid-cols-3 gap-4">
          <Input
            value={form.city}
            onChange={(v) => setForm({ ...form, city: v })}
            placeholder="City"
          />
          <Input
            value={form.state}
            onChange={(v) => setForm({ ...form, state: v })}
            placeholder="State"
          />
          <Input
            value={form.zip}
            onChange={(v) => setForm({ ...form, zip: v })}
            placeholder="Zip Code"
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <Input
            value={form.city}
            onChange={(v) => setForm({ ...form, city: v })}
            placeholder="City"
          />
          <Input
            value={form.ukCounty}
            onChange={(v) => setForm({ ...form, ukCounty: v })}
            placeholder="County"
          />
          <Input
            value={form.ukPostal}
            onChange={(v) => setForm({ ...form, ukPostal: v })}
            placeholder="Postal Code"
          />
        </div>
      )}

      <div className="space-y-3">
        <div className="text-[10px] tracking-[0.3em] text-zinc-600">
          SOCIAL LINKS
        </div>

        {form.socials.map((social, index) => (
          <Input
            key={index}
            value={social}
            onChange={(v) => updateSocial(index, v)}
            placeholder="https://..."
          />
        ))}

        <button
          type="button"
          onClick={addSocialField}
          className="text-cyan-400"
        >
          + Add Social Link
        </button>
      </div>
    </div>
  )
}

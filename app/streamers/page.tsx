"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardInput,
  EmptyState,
  ListCard,
  MetricCard,
  MetricsGrid,
  PageHeader,
  PrimaryButton,
} from "@/components/dashboard";
import { useSharedStorage } from "@/lib/useSharedStorage";

type Streamer = {
  id: number;

  firstName: string;
  lastName: string;
  brandName: string;

  email: string;
  phone: string;

  shippingType: string;
  partnered: boolean;
  platform: string;

  country: string;

  address1: string;
  address2: string;

  city: string;
  state: string;
  zip: string;

  ukCounty: string;
  ukPostal: string;

  socials: string[];

  onboardedAt: string;
};

const EMPTY_STREAMER = {
  firstName: "",
  lastName: "",
  brandName: "",

  email: "",
  phone: "",

  shippingType: "2 Day",
  partnered: true,
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
};

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="
        w-full
        bg-[#070707]
        border
        border-white/10
        rounded-2xl
        px-5
        py-4
        text-white
        outline-none
      "
    />
  );
}

export default function StreamersPage() {
  const [streamers, setStreamers] = useSharedStorage<Streamer[]>("streamers", []);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(
    null
  );

  const [expanded, setExpanded] = useState<number | null>(
    null
  );

  const [form, setForm] = useState<any>(EMPTY_STREAMER);


  function resetForm() {
    setForm(EMPTY_STREAMER);
    setEditingId(null);
  }

  function openAdd() {
    resetForm();
    setShowModal(true);
  }

  function openEdit(streamer: Streamer) {
    setEditingId(streamer.id);

    setForm({
      ...streamer,
    });

    setShowModal(true);
  }

  function saveStreamer() {
    if (!form.brandName) return;

    if (editingId) {
      setStreamers((prev) =>
        prev.map((s) =>
          s.id === editingId
            ? {
                ...s,
                ...form,
              }
            : s
        )
      );
    } else {
      const newStreamer: Streamer = {
        id: Date.now(),
        onboardedAt: new Date().toLocaleDateString(),
        ...form,
      };

      setStreamers((prev) => [newStreamer, ...prev]);
    }

    setShowModal(false);

    resetForm();
  }

  function deleteStreamer(id: number) {
    const confirmDelete = window.confirm(
      "Delete this streamer?"
    );

    if (!confirmDelete) return;

    setStreamers((prev) =>
      prev.filter((s) => s.id !== id)
    );
  }

  function updateSocial(index: number, value: string) {
    const updated = [...form.socials];

    updated[index] = value;

    setForm({
      ...form,
      socials: updated,
    });
  }

  function addSocialField() {
    setForm({
      ...form,
      socials: [...form.socials, ""],
    });
  }

  const filtered = useMemo(() => {
    return streamers.filter((s) => {
      const query = search.toLowerCase();

      return (
        s.brandName.toLowerCase().includes(query) ||
        s.firstName.toLowerCase().includes(query) ||
        s.lastName.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        s.phone.toLowerCase().includes(query)
      );
    });
  }, [streamers, search]);

  const partneredCount = streamers.filter(
    (s) => s.partnered
  ).length;

  const testCount = streamers.filter(
    (s) => !s.partnered
  ).length;

  return (
    <>
        <PageHeader
          title="Streamers"
          description="Manage streamer accounts and logistics"
          actions={<PrimaryButton onClick={openAdd}>+ Add Streamer</PrimaryButton>}
        />

        <div className="mt-10">
          <DashboardInput
            value={search}
            onChange={setSearch}
            placeholder="Search Brand Name, First Name, Last Name, Email, or Phone"
          />
        </div>

        <MetricsGrid columns={3} className="mt-8">
          {[
            ["TOTAL STREAMERS", streamers.length, "text-white"],
            ["PARTNERED STREAMERS", partneredCount, "text-cyan-400"],
            ["TEST STREAMERS", testCount, "text-yellow-400"],
          ].map(([label, value, color]) => (
            <MetricCard
              key={label as string}
              label={label as string}
              value={value}
              color={color as string}
            />
          ))}
        </MetricsGrid>

        <div className="mt-8 space-y-4">
          {filtered.length === 0 ? (
            <EmptyState>No streamers match your search.</EmptyState>
          ) : (
            filtered.map((streamer) => (
              <ListCard key={streamer.id}>
              <div
                onClick={() =>
                  setExpanded(
                    expanded === streamer.id
                      ? null
                      : streamer.id
                  )
                }
                className="
                  grid
                  grid-cols-[1.4fr_1fr_1fr_1fr_2fr_auto]
                  items-center
                  gap-8
                  px-8
                  py-8
                  cursor-pointer
                "
              >
                <div>
                  <div className="text-4xl font-black">
                    {streamer.brandName}
                  </div>

                  <div className="text-zinc-500 mt-2 text-sm">
                    {streamer.onboardedAt}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                    FIRST NAME
                  </div>

                  <div className="text-lg font-semibold">
                    {streamer.firstName}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                    LAST NAME
                  </div>

                  <div className="text-lg font-semibold">
                    {streamer.lastName}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                    SHIPPING
                  </div>

                  <div className="text-cyan-400 text-lg font-black">
                    {streamer.shippingType}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                    FULL ADDRESS
                  </div>

                  <div className="text-zinc-300 text-sm">
                    {streamer.address1},{" "}
                    {streamer.city}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(streamer);
                    }}
                    className="
                      bg-[#111]
                      px-5
                      py-3
                      rounded-2xl
                    "
                  >
                    Edit
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteStreamer(streamer.id);
                    }}
                    className="
                      bg-red-900/50
                      text-red-400
                      px-5
                      py-3
                      rounded-2xl
                    "
                  >
                    Delete
                  </button>

                  <div className="text-3xl text-zinc-500">
                    {expanded === streamer.id
                      ? "−"
                      : "+"}
                  </div>
                </div>
              </div>

              {expanded === streamer.id && (
                <div className="border-t border-white/10 p-8">
                  <div className="grid grid-cols-3 gap-8">
                    <div>
                      <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                        EMAIL
                      </div>

                      <div>{streamer.email}</div>
                    </div>

                    <div>
                      <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                        PHONE
                      </div>

                      <div>{streamer.phone}</div>
                    </div>

                    <div>
                      <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                        PLATFORM
                      </div>

                      <div>{streamer.platform}</div>
                    </div>

                    <div className="col-span-3">
                      <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                        FULL ADDRESS
                      </div>

                      <div className="text-zinc-300">
                        {streamer.country === "US" ? (
                          <>
                            {streamer.address1}
                            {streamer.address2 &&
                              `, ${streamer.address2}`}
                            , {streamer.city},{" "}
                            {streamer.state}{" "}
                            {streamer.zip}
                          </>
                        ) : (
                          <>
                            {streamer.address1}
                            {streamer.address2 &&
                              `, ${streamer.address2}`}
                            , {streamer.city},{" "}
                            {streamer.ukCounty}{" "}
                            {streamer.ukPostal}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="col-span-3">
                      <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-3">
                        SOCIAL LINKS
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {streamer.socials?.map(
                          (
                            social: string,
                            index: number
                          ) => (
                            <div
                              key={index}
                              className="
                                bg-[#111]
                                px-4
                                py-2
                                rounded-xl
                                text-cyan-400
                                text-sm
                              "
                            >
                              {social}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </ListCard>
            ))
          )}
        </div>

      {showModal && (
        <div
          className="
            fixed
            inset-0
            bg-black/80
            backdrop-blur-sm
            z-50
            flex
            justify-end
          "
        >
          <div
            className="
              w-[760px]
              h-screen
              overflow-y-auto
              bg-black
              border-l
              border-white/10
              p-10
            "
          >
            <div className="flex items-center justify-between">
              <h2 className="text-5xl font-black">
                {editingId
                  ? "Edit Streamer"
                  : "Add Streamer"}
              </h2>

              <button
                onClick={() =>
                  setShowModal(false)
                }
                className="
                  w-16
                  h-16
                  rounded-full
                  bg-[#111]
                  text-2xl
                "
              >
                ×
              </button>
            </div>

            <div className="space-y-5 mt-10">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  value={form.firstName}
                  onChange={(v) =>
                    setForm({
                      ...form,
                      firstName: v,
                    })
                  }
                  placeholder="First Name"
                />

                <Input
                  value={form.lastName}
                  onChange={(v) =>
                    setForm({
                      ...form,
                      lastName: v,
                    })
                  }
                  placeholder="Last Name"
                />
              </div>

              <Input
                value={form.brandName}
                onChange={(v) =>
                  setForm({
                    ...form,
                    brandName: v,
                  })
                }
                placeholder="Brand Name"
              />

              <Input
                value={form.email}
                onChange={(v) =>
                  setForm({
                    ...form,
                    email: v,
                  })
                }
                placeholder="Email"
              />

              <Input
                value={form.phone}
                onChange={(v) =>
                  setForm({
                    ...form,
                    phone: v,
                  })
                }
                placeholder="Phone Number"
              />
<select
  value={form.shippingType}
  onChange={(e) =>
    setForm({
      ...form,
      shippingType: e.target.value,
    })
  }
  className="
    w-full
    bg-[#070707]
    border
    border-white/10
    rounded-2xl
    px-5
    py-5
    text-white
    outline-none
  "
>
  <option value="1 Day">1 Day Shipping</option>
  <option value="2 Day">2 Day Shipping</option>
  <option value="3 Day">3 Day Shipping</option>
</select>
<div className="grid grid-cols-2 gap-4">
  <button
    onClick={() =>
      setForm({
        ...form,
        partnered: true,
      })
    }
    className={`
      py-5
      rounded-2xl
      font-bold
      transition
      ${
        form.partnered
          ? "bg-cyan-400 text-black"
          : "bg-[#070707] border border-white/10 text-white"
      }
    `}
  >
    Partnered Streamer
  </button>

  <button
    onClick={() =>
      setForm({
        ...form,
        partnered: false,
      })
    }
    className={`
      py-5
      rounded-2xl
      font-bold
      transition
      ${
        !form.partnered
          ? "bg-yellow-400 text-black"
          : "bg-[#070707] border border-white/10 text-white"
      }
    `}
  >
    Test Streamer
  </button>
</div>
              <select
                value={form.country}
                onChange={(e) =>
                  setForm({
                    ...form,
                    country: e.target.value,
                  })
                }
                className="
                  w-full
                  bg-[#070707]
                  border
                  border-white/10
                  rounded-2xl
                  px-5
                  py-5
                "
              >
                <option value="US">
                  United States
                </option>

                <option value="UK">
                  United Kingdom
                </option>
              </select>

              <Input
                value={form.address1}
                onChange={(v) =>
                  setForm({
                    ...form,
                    address1: v,
                  })
                }
                placeholder="Address Line 1"
              />

              <Input
                value={form.address2}
                onChange={(v) =>
                  setForm({
                    ...form,
                    address2: v,
                  })
                }
                placeholder="Address Line 2"
              />

              {form.country === "US" ? (
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    value={form.city}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        city: v,
                      })
                    }
                    placeholder="City"
                  />

                  <Input
                    value={form.state}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        state: v,
                      })
                    }
                    placeholder="State"
                  />

                  <Input
                    value={form.zip}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        zip: v,
                      })
                    }
                    placeholder="Zip Code"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <Input
                    value={form.city}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        city: v,
                      })
                    }
                    placeholder="City"
                  />

                  <Input
                    value={form.ukCounty}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        ukCounty: v,
                      })
                    }
                    placeholder="County"
                  />

                  <Input
                    value={form.ukPostal}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        ukPostal: v,
                      })
                    }
                    placeholder="Postal Code"
                  />
                </div>
              )}

              <div className="space-y-3">
                <div className="text-[10px] tracking-[0.3em] text-zinc-600">
                  SOCIAL LINKS
                </div>

                {form.socials.map(
                  (
                    social: string,
                    index: number
                  ) => (
                    <Input
                      key={index}
                      value={social}
                      onChange={(v) =>
                        updateSocial(index, v)
                      }
                      placeholder="https://..."
                    />
                  )
                )}

                <button
                  onClick={addSocialField}
                  className="text-cyan-400"
                >
                  + Add Social Link
                </button>
              </div>

              <button
                onClick={saveStreamer}
                className="
                  w-full
                  bg-cyan-400
                  text-black
                  py-5
                  rounded-3xl
                  text-xl
                  font-bold
                  mt-6
                "
              >
                {editingId
                  ? "Update Streamer"
                  : "Create Streamer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
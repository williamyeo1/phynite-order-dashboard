"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type Point = {
  shortLabel: string
  label: string
  value: number
  [key: string]: string | number
}

export function KpiLineChart({
  data,
  valueLabel,
  formatValue,
  color = "#22d3ee",
}: {
  data: Point[]
  valueLabel: string
  formatValue?: (v: number) => string
  color?: string
}) {
  const fmt = formatValue ?? ((v: number) => String(Math.round(v)))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="shortLabel"
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            contentStyle={{
              background: "#0a0a0a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "10px 14px",
            }}
            labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
            itemStyle={{ color: "#fff" }}
            formatter={(value) => [
              fmt(typeof value === "number" ? value : Number(value)),
              valueLabel,
            ]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as Point | undefined
              return row?.label ?? ""
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

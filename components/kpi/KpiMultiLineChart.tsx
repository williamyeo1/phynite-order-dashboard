"use client"

import {
  CartesianGrid,
  Legend,
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
  [key: string]: string | number
}

const TOOLTIP_STYLE = {
  background: "#0a0a0a",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  padding: "10px 14px",
}

export function KpiMultiLineChart({
  data,
  lines,
}: {
  data: Point[]
  lines: {
    dataKey: string
    label: string
    color: string
    formatValue?: (v: number) => string
  }[]
}) {
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
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.15)" }}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as Point | undefined
              return row?.label ?? ""
            }}
            formatter={(value, name) => {
              const line = lines.find((l) => l.label === name || l.dataKey === name)
              const num = typeof value === "number" ? value : Number(value)
              const formatted = line?.formatValue
                ? line.formatValue(num)
                : String(Math.round(num))
              return [formatted, line?.label ?? String(name)]
            }}
          />
          <Legend
            wrapperStyle={{ color: "#a1a1aa", fontSize: 12, paddingTop: 8 }}
          />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.label}
              stroke={line.color}
              strokeWidth={2}
              dot={{ r: 3, fill: line.color, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: line.color }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

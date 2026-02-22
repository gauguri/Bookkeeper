import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { CHART_MARGIN, TOOLTIP_STYLE, GRID_STYLE, AXIS_STYLE } from "../../utils/chartHelpers";
import { COLOR, CHART_COLORS } from "../../utils/colorScales";
import { formatCurrency, formatCompact } from "../../utils/formatters";

type DataPoint = {
  period: string;
  value: number;
  forecast?: number;
  previous?: number;
};

type Props = {
  data: DataPoint[];
  title?: string;
  type?: "area" | "line" | "bar";
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
  forecastData?: DataPoint[];
};

function CustomTooltip({
  active,
  payload,
  label,
  formatValue,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatValue: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="app-card p-3 text-xs shadow-lg">
      <p className="font-medium text-muted">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="mt-1 font-semibold" style={{ color: entry.color }}>
          {entry.name}: {formatValue(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function TrendChart({
  data,
  title,
  type = "area",
  color = CHART_COLORS[0],
  height = 280,
  formatValue = formatCompact,
  showGrid = true,
  forecastData,
}: Props) {
  const combined = forecastData ? [...data, ...forecastData] : data;

  return (
    <div className="app-card p-4">
      {title && <h3 className="mb-4 text-sm font-semibold">{title}</h3>}
      <ResponsiveContainer width="100%" height={height}>
        {type === "bar" ? (
          <BarChart data={combined} margin={CHART_MARGIN}>
            {showGrid && <CartesianGrid {...GRID_STYLE} />}
            <XAxis dataKey="period" {...AXIS_STYLE} />
            <YAxis tickFormatter={formatValue} {...AXIS_STYLE} />
            <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} name="Actual" />
            {forecastData && (
              <Bar dataKey="forecast" fill={color} opacity={0.4} radius={[4, 4, 0, 0]} name="Forecast" />
            )}
          </BarChart>
        ) : type === "line" ? (
          <LineChart data={combined} margin={CHART_MARGIN}>
            {showGrid && <CartesianGrid {...GRID_STYLE} />}
            <XAxis dataKey="period" {...AXIS_STYLE} />
            <YAxis tickFormatter={formatValue} {...AXIS_STYLE} />
            <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Actual"
            />
            {forecastData && (
              <Line
                type="monotone"
                dataKey="forecast"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Forecast"
              />
            )}
          </LineChart>
        ) : (
          <AreaChart data={combined} margin={CHART_MARGIN}>
            {showGrid && <CartesianGrid {...GRID_STYLE} />}
            <XAxis dataKey="period" {...AXIS_STYLE} />
            <YAxis tickFormatter={formatValue} {...AXIS_STYLE} />
            <Tooltip content={<CustomTooltip formatValue={formatValue} />} />
            <defs>
              <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${color})`}
              name="Actual"
            />
            {forecastData && (
              <Area
                type="monotone"
                dataKey="forecast"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="5 5"
                fill={color}
                fillOpacity={0.1}
                name="Forecast"
              />
            )}
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

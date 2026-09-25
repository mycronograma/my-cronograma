'use client';

/**
 * WeeklyChart Component
 * Gráfico de barras mostrando horas de estudo por dia da semana
 */

import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { cn, formatHoursDuration } from '@/lib/utils';
import Card from '@/components/ui/Card';

interface WeeklyChartProps {
  data: {
    day: string;
    hours: number;
    target: number;
  }[];
  className?: string;
  compact?: boolean;
}

// Componente de tooltip personalizado
type WeeklyTooltipEntry = {
  value: number;
  payload: {
    target: number;
  };
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: WeeklyTooltipEntry[];
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card p-3">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-sm text-neon-blue">
          {formatHoursDuration(payload[0].value)} estudadas
        </p>
        <p className="text-xs text-text-muted">
          Meta: {formatHoursDuration(payload[0].payload.target)}
        </p>
      </div>
    );
  }
  return null;
};

export default function WeeklyChart({ data, className, compact = false }: WeeklyChartProps) {
  // Calcular se cada dia atingiu a meta
  const processedData = data.map((item) => ({
    ...item,
    metTarget: item.target > 0 && item.hours >= item.target,
  }));
  const totalTargetDays = processedData.filter((d) => d.target > 0).length;
  const achievedTargetDays = processedData.filter((d) => d.metTarget).length;

  if (compact) {
    return (
      <div className={cn('w-full', className)}>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processedData} barGap={8}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#8892A6', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8892A6', fontSize: 11 }} width={32} tickFormatter={(v) => formatHoursDuration(Number(v))} />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar dataKey="hours" radius={[6, 6, 0, 0]} maxBarSize={28}>
                {processedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.metTarget ? 'url(#gradientSuccessCompact)' : 'url(#gradientBarCompact)'} />
                ))}
              </Bar>
              <defs>
                <linearGradient id="gradientBarCompact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7F00FF" stopOpacity={1} />
                  <stop offset="100%" stopColor="#00B4FF" stopOpacity={0.6} />
                </linearGradient>
                <linearGradient id="gradientSuccessCompact" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00FFC8" stopOpacity={1} />
                  <stop offset="100%" stopColor="#00B4FF" stopOpacity={0.6} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-card-border pt-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-neon-blue to-neon-purple" />
            <span className="text-[11px] text-text-secondary">Realizado</span>
          </div>
          <span className="text-xs font-bold text-neon-purple">
            {totalTargetDays > 0 ? `${achievedTargetDays}/${totalTargetDays} dias na meta` : 'Sem meta configurada'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Card className={cn('h-full', className)}>
      <div className="mb-5 flex min-w-0 flex-col gap-3 max-[479px]:gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl max-[479px]:text-lg font-heading font-bold text-text-primary">Progresso Semanal</h2>
          <p className="text-sm max-[479px]:text-xs text-text-secondary mt-1">
            Horas de estudo esta semana
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 max-[479px]:gap-2 sm:gap-4">
          <div className="flex items-center gap-2 max-[479px]:gap-1">
            <div className="w-3 h-3 max-[479px]:w-2.5 max-[479px]:h-2.5 rounded-full bg-gradient-to-r from-neon-blue to-neon-purple" />
            <span className="text-xs text-text-secondary">Realizado</span>
          </div>
        </div>
      </div>

      <div className="h-56 max-[479px]:h-44 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={processedData} barGap={8}>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8892A6', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#8892A6', fontSize: 12 }}
              tickFormatter={(value) => formatHoursDuration(Number(value))}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar
              dataKey="hours"
              radius={[8, 8, 0, 0]}
              maxBarSize={40}
            >
              {processedData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.metTarget ? 'url(#gradientSuccess)' : 'url(#gradientBar)'}
                />
              ))}
            </Bar>
            <defs>
              <linearGradient id="gradientBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7F00FF" stopOpacity={1} />
                <stop offset="100%" stopColor="#00B4FF" stopOpacity={0.6} />
              </linearGradient>
              <linearGradient id="gradientSuccess" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00FFC8" stopOpacity={1} />
                <stop offset="100%" stopColor="#00B4FF" stopOpacity={0.6} />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Estatísticas Rápidas */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-card-border pt-4 max-[479px]:mt-3 max-[479px]:pt-3">
        <div className="min-w-0">
          <p className="text-2xl max-[479px]:text-[22px] font-heading font-bold text-text-primary">
            {formatHoursDuration(data.reduce((sum, d) => sum + d.hours, 0))}
          </p>
          <p className="text-xs text-text-secondary">Total esta semana</p>
        </div>
        <div className="min-w-0 text-left sm:text-right">
          <p className="text-2xl max-[479px]:text-[22px] font-heading font-bold text-neon-cyan">
            {totalTargetDays > 0 ? `${achievedTargetDays}/${totalTargetDays}` : '—'}
          </p>
          <p className="text-xs text-text-secondary">Dias com meta atingida</p>
        </div>
      </div>
    </Card>
  );
}

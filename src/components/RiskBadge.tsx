'use client';

import { type RiskLevel } from '@/lib/types';
import { ShieldCheck, ShieldAlert, AlertTriangle, AlertOctagon, Skull } from 'lucide-react';

interface RiskBadgeProps {
  level: RiskLevel;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const config: Record<RiskLevel, { label: string; icon: React.ReactNode; className: string }> = {
  safe: { label: 'Safe', icon: <ShieldCheck size={14} />, className: 'badge-safe' },
  low: { label: 'Low Risk', icon: <ShieldAlert size={14} />, className: 'badge-low' },
  medium: { label: 'Medium', icon: <AlertTriangle size={14} />, className: 'badge-medium' },
  high: { label: 'High Risk', icon: <AlertOctagon size={14} />, className: 'badge-high' },
  critical: { label: 'Critical', icon: <Skull size={14} />, className: 'badge-critical' },
};

export default function RiskBadge({ level, showIcon = true, size = 'md' }: RiskBadgeProps) {
  const { label, icon, className } = config[level];

  const sizeStyle: React.CSSProperties =
    size === 'sm'
      ? { fontSize: 11, padding: '2px 8px' }
      : size === 'lg'
        ? { fontSize: 14, padding: '6px 14px' }
        : {};

  return (
    <span className={`badge ${className}`} style={sizeStyle}>
      {showIcon && icon}
      {label}
    </span>
  );
}

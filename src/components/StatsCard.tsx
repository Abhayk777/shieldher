'use client';

import { type ReactNode } from 'react';
import styles from './StatsCard.module.css';

interface StatsCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  trend?: string;
  trendUp?: boolean;
}

export default function StatsCard({ icon, value, label, trend, trendUp }: StatsCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.iconWrap}>{icon}</div>
        {trend && (
          <span className={`${styles.trend} ${trendUp ? styles.trendUp : styles.trendDown}`}>
            {trendUp ? '↑' : '↓'} {trend}
          </span>
        )}
      </div>
      <div className={styles.value}>{value}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}

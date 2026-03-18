'use client';

import { type ReactNode } from 'react';
import styles from './FeatureCard.module.css';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  index?: number;
}

export default function FeatureCard({ icon, title, description, index = 0 }: FeatureCardProps) {
  return (
    <div
      className={styles.card}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className={styles.iconWrap}>{icon}</div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      <div className={styles.shine} />
    </div>
  );
}

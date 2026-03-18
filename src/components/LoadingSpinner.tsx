'use client';

import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  size?: number;
  text?: string;
}

export default function LoadingSpinner({ size = 40, text }: LoadingSpinnerProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.spinner} style={{ width: size, height: size }}>
        <div className={styles.ring} />
        <div className={styles.ring} />
        <div className={styles.dot} />
      </div>
      {text && <p className={styles.text}>{text}</p>}
    </div>
  );
}

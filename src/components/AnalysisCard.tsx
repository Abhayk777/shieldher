'use client';

import { type AnalysisResult } from '@/lib/types';
import RiskBadge from './RiskBadge';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import styles from './AnalysisCard.module.css';

interface AnalysisCardProps {
  analysis: AnalysisResult;
  fileName?: string;
  showLink?: boolean;
}

export default function AnalysisCard({ analysis, fileName, showLink = true }: AnalysisCardProps) {
  const flagCount = analysis.flags?.length || 0;
  const date = new Date(analysis.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <RiskBadge level={analysis.risk_level} />
          {fileName && <span className={styles.fileName}>{fileName}</span>}
        </div>
        <div className={styles.meta}>
          <Clock size={13} />
          <span>{date}</span>
        </div>
      </div>

      <p className={styles.summary}>{analysis.summary}</p>

      {flagCount > 0 && (
        <div className={styles.flags}>
          <div className={styles.flagHeader}>
            <AlertTriangle size={14} />
            <span>{flagCount} flag{flagCount !== 1 ? 's' : ''} detected</span>
          </div>
          <div className={styles.flagList}>
            {analysis.flags.slice(0, 3).map((flag, i) => (
              <div key={i} className={styles.flag}>
                <span className={styles.flagCategory}>{flag.category}</span>
                <span className={styles.flagDesc}>{flag.description}</span>
              </div>
            ))}
            {flagCount > 3 && (
              <span className={styles.moreFlags}>+{flagCount - 3} more</span>
            )}
          </div>
        </div>
      )}

      {showLink && (
        <Link
          href={`/dashboard/analysis/${analysis.upload_id}`}
          className={styles.link}
        >
          View Full Analysis
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

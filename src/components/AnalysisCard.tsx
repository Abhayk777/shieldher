'use client';

import { type AnalysisResult } from '@/lib/types';
import RiskBadge from './RiskBadge';
import { AlertTriangle, Clock, ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from './LanguageProvider';
import { getFriendlyAuthenticityMessage } from '@/lib/mediaAuthenticity';
import styles from './AnalysisCard.module.css';

interface AnalysisCardProps {
  analysis: AnalysisResult;
  fileName?: string;
  showLink?: boolean;
}

export default function AnalysisCard({ analysis, fileName, showLink = true }: AnalysisCardProps) {
  const { t } = useLanguage();
  const flagCount = analysis.flags?.length || 0;
  const authenticity = analysis.details?.media_authenticity;
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

      {authenticity && authenticity.supported_count > 0 && (
        <div className={styles.authenticity}>
          <div className={styles.authenticityTop}>
            <span className={styles.authenticityTitle}>
              {authenticity.status === 'ai_generated' ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
              Media Authenticity
            </span>
            <span className={styles.authenticityLabel}>{authenticity.label}</span>
          </div>
          <p className={styles.authenticityText}>{getFriendlyAuthenticityMessage(authenticity.status)}</p>
        </div>
      )}

      {flagCount > 0 && (
        <div className={styles.flags}>
          <div className={styles.flagHeader}>
            <AlertTriangle size={14} />
            <span>
              {flagCount} {t.analysisCard.flagsDetected}
            </span>
          </div>
          <div className={styles.flagList}>
            {analysis.flags.slice(0, 3).map((flag, i) => (
              <div key={i} className={styles.flag}>
                <span className={styles.flagCategory}>{flag.category}</span>
                <span className={styles.flagDesc}>{flag.description}</span>
              </div>
            ))}
            {flagCount > 3 && (
              <span className={styles.moreFlags}>+{flagCount - 3} {t.analysisCard.more}</span>
            )}
          </div>
        </div>
      )}

      {showLink && (
        <Link
          href={`/dashboard/analysis/${analysis.upload_id}`}
          className={styles.link}
        >
          {t.analysisCard.viewFull}
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

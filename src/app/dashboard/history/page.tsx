'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { type Upload, type AnalysisResult } from '@/lib/types';
import AnalysisCard from '@/components/AnalysisCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import RiskBadge from '@/components/RiskBadge';
import { FileSearch, Clock, Image } from 'lucide-react';
import styles from './page.module.css';

interface UploadWithAnalysis extends Upload {
  analysis_results: AnalysisResult[];
}

export default function HistoryPage() {
  const [uploads, setUploads] = useState<UploadWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'flagged' | 'safe'>('all');

  useEffect(() => {
    async function fetchHistory() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('uploads')
        .select('*, analysis_results(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data) setUploads(data as UploadWithAnalysis[]);
      setLoading(false);
    }
    fetchHistory();
  }, []);

  const filtered = uploads.filter((u) => {
    if (filter === 'all') return true;
    if (filter === 'flagged') return u.status === 'flagged';
    return u.status === 'completed' && u.analysis_results?.some(
      (a) => a.risk_level === 'safe' || a.risk_level === 'low'
    );
  });

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <LoadingSpinner text="Loading history..." />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Analysis History</h1>
        <p className={styles.subtitle}>
          View all your past uploads and their analysis results
        </p>
      </div>

      <div className={styles.filters}>
        {(['all', 'flagged', 'safe'] as const).map((f) => (
          <button
            key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'flagged' ? '🚨 Flagged' : '✅ Safe'}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className={styles.list}>
          {filtered.map((upload) => (
            <div key={upload.id} className={styles.uploadItem}>
              <div className={styles.uploadHeader}>
                <div className={styles.uploadInfo}>
                  <Image size={16} className={styles.fileIcon} />
                  <span className={styles.fileName}>{upload.file_name}</span>
                  <span className={styles.uploadDate}>
                    <Clock size={12} />
                    {new Date(upload.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <span className={`badge badge-${upload.status === 'flagged' ? 'high' : upload.status === 'completed' ? 'safe' : 'medium'}`}>
                  {upload.status}
                </span>
              </div>

              {upload.analysis_results?.map((analysis) => (
                <AnalysisCard
                  key={analysis.id}
                  analysis={analysis}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <FileSearch size={48} />
          <h3>No results found</h3>
          <p>
            {filter !== 'all'
              ? 'Try changing your filter'
              : 'Upload some screenshots to get started'}
          </p>
        </div>
      )}
    </div>
  );
}

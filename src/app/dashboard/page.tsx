'use client';

import { useEffect, useState } from 'react';
import {
  Upload,
  FileSearch,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import StatsCard from '@/components/StatsCard';
import AnalysisCard from '@/components/AnalysisCard';
import { type AnalysisResult, type Upload as UploadType } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import styles from './page.module.css';

export default function DashboardPage() {
  const [userName, setUserName] = useState('');
  const [uploads, setUploads] = useState<UploadType[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');

        // Fetch uploads
        const { data: uploadsData } = await supabase
          .from('uploads')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (uploadsData) setUploads(uploadsData);

        // Fetch recent analyses
        const { data: analysesData } = await supabase
          .from('analysis_results')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);

        if (analysesData) setAnalyses(analysesData);
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  const totalUploads = uploads.length;
  const analyzed = uploads.filter((u) => u.status === 'completed').length;
  const flagged = uploads.filter((u) => u.status === 'flagged').length;
  const safeCount = analyses.filter((a) => a.risk_level === 'safe' || a.risk_level === 'low').length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>
            Welcome back, <span className="gradient-text">{loading ? '...' : userName}</span>
          </h1>
          <p className={styles.subtitle}>Here&apos;s your safety overview</p>
        </div>
        <Link href="/dashboard/upload" className="btn btn-primary">
          <Upload size={16} />
          New Upload
        </Link>
      </div>

      <div className={styles.statsGrid}>
        <StatsCard
          icon={<Upload size={20} />}
          value={totalUploads}
          label="Total Uploads"
          trend="12%"
          trendUp
        />
        <StatsCard
          icon={<FileSearch size={20} />}
          value={analyzed}
          label="Analyzed"
        />
        <StatsCard
          icon={<ShieldCheck size={20} />}
          value={safeCount}
          label="Safe Results"
        />
        <StatsCard
          icon={<AlertTriangle size={20} />}
          value={flagged}
          label="Flagged"
        />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Analyses</h2>
          <Link href="/dashboard/history" className={styles.viewAll}>
            View All <ArrowRight size={14} />
          </Link>
        </div>

        {analyses.length > 0 ? (
          <div className={styles.analysisList}>
            {analyses.map((analysis) => (
              <AnalysisCard key={analysis.id} analysis={analysis} />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <FileSearch size={48} />
            <h3>No analyses yet</h3>
            <p>Upload your first chat screenshot to get started</p>
            <Link href="/dashboard/upload" className="btn btn-primary">
              <Upload size={16} />
              Upload Screenshot
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getFriendlyAuthenticityMessage } from "@/lib/mediaAuthenticity";
import { type Upload, type AnalysisResult } from "@/lib/types";
import RiskBadge from "@/components/RiskBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Brain,
  Target,
  MessageSquare,
  Lightbulb,
  Scale,
  FileDown,
  Loader,
  CheckCircle,
  ShieldAlert,
  Image as ImageIcon,
  Mic,
  Video,
} from "lucide-react";
import styles from "./page.module.css";
import { useLanguage } from "@/components/LanguageProvider";

export default function AnalysisDetailPage() {
  const { t } = useLanguage();
  const params = useParams();
  const uploadId = params.id as string;
  const [upload, setUpload] = useState<Upload | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const { data: uploadData } = await supabase
        .from("uploads")
        .select("*")
        .eq("id", uploadId)
        .single();

      if (uploadData) setUpload(uploadData);

      const { data: analysisData } = await supabase
        .from("analysis_results")
        .select("*")
        .eq("upload_id", uploadId)
        .single();

      if (analysisData) setAnalysis(analysisData);
      setLoading(false);
    }
    fetchData();
  }, [uploadId]);

  const handleExportPDF = async () => {
    if (!uploadId || generating) return;
    setGenerating(true);
    setGenerated(false);

    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t.analysisDetailPage.failedGenerate);
      }

      // Download the PDF
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ShieldHer-Report-${analysis?.id?.substring(0, 8) || "report"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setGenerated(true);

      setTimeout(() => setGenerated(false), 4000);
    } catch (err) {
      console.error("Export error:", err);
      alert(t.analysisDetailPage.failedGenerateAlert);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <LoadingSpinner text={t.analysisDetailPage.loading} />
        </div>
      </div>
    );
  }

  if (!analysis || !upload) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h3>{t.analysisDetailPage.notFound}</h3>
          <Link href="/dashboard/history" className="btn btn-secondary">
            {t.analysisDetailPage.backToHistory}
          </Link>
        </div>
      </div>
    );
  }

  const details = analysis.details || {};
  const authenticity = details.media_authenticity;
  const fileUrls = (upload.file_url || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  const getFileKind = (url: string) => {
    let pathname = url;
    try {
      pathname = new URL(url).pathname;
    } catch {
      // Use raw URL if parsing fails
    }
    const lower = pathname.toLowerCase();
    if (/\.(png|jpe?g|webp|gif)$/i.test(lower)) return "image";
    if (/\.(mp3|wav|m4a|ogg)$/i.test(lower)) return "audio";
    if (/\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(lower)) return "video";
    return "other";
  };

  const mediaItems = fileUrls.map((url, index) => {
    const kind = getFileKind(url);
    const label =
      kind === "image"
        ? `${t.analysisDetailPage.screenshot} ${index + 1}`
        : kind === "audio"
          ? `${t.analysisDetailPage.audioRecording} ${index + 1}`
          : kind === "video"
            ? `Video ${index + 1}`
            : `${t.analysisDetailPage.file} ${index + 1}`;
    return { url, kind, label };
  });

  return (
    <div className={styles.page}>
      <Link href="/dashboard/history" className={styles.back}>
        <ArrowLeft size={16} />
        {t.analysisDetailPage.backToHistory}
      </Link>

      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>{t.analysisDetailPage.reportTitle}</h1>
            <div className={styles.meta}>
              <span>{upload.file_name}</span>
              <span className={styles.dot}>•</span>
              <Clock size={13} />
              <span>
                {new Date(analysis.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
          <RiskBadge level={analysis.risk_level} size="lg" />
        </div>
      </div>

      {/* ═══ PROMINENT EXPORT BUTTON ═══ */}
      <div className={styles.exportBanner}>
        <div className={styles.exportBannerContent}>
          <div className={styles.exportBannerText}>
            <FileDown size={22} className={styles.exportBannerIcon} />
            <div>
              <h3 className={styles.exportBannerTitle}>
                {t.analysisDetailPage.exportTitle}
              </h3>
              <p className={styles.exportBannerDesc}>
                {t.analysisDetailPage.exportDesc}
              </p>
            </div>
          </div>
          <button
            className={styles.exportBtn}
            onClick={handleExportPDF}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader size={18} className="animate-spin" />
                {t.analysisDetailPage.generating}
              </>
            ) : generated ? (
              <>
                <CheckCircle size={18} />
                {t.analysisDetailPage.downloaded}
              </>
            ) : (
              <>
                <FileDown size={18} />
                {t.analysisDetailPage.downloadPdf}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Uploaded evidence */}
      <div className={styles.screenshotSection}>
        <h2 className={styles.sectionTitle}>
          <Target size={18} />
          {t.analysisDetailPage.uploadedEvidence}
        </h2>
        <div className={styles.mediaGrid}>
          {mediaItems.map((item) => (
            <div key={item.url} className={styles.mediaCard}>
              <div className={styles.mediaLabel}>{item.label}</div>
              {item.kind === "image" ? (
                <img
                  src={item.url}
                  alt={item.label}
                  className={styles.mediaImage}
                  loading="lazy"
                />
              ) : item.kind === "audio" ? (
                <audio controls className={styles.audioPlayer}>
                  <source src={item.url} />
                  {t.analysisDetailPage.audioNotSupported}
                </audio>
              ) : item.kind === "video" ? (
                <video controls className={styles.mediaImage} style={{ maxHeight: '400px', objectFit: 'contain' }}>
                  <source src={item.url} />
                  Your browser does not support the video tag.
                </video>
              ) : (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.mediaLink}
                >
                  {t.analysisDetailPage.openFile}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Brain size={18} />
          {t.analysisDetailPage.analysisSummary}
        </h2>
        <div className={styles.summaryCard}>
          <p>{analysis.summary}</p>
          {details.confidence_score !== undefined && (
            <div className={styles.confidence}>
              <span>{t.analysisDetailPage.confidence}:</span>
              <div className={styles.confidenceBar}>
                <div
                  className={styles.confidenceFill}
                  style={{ width: `${details.confidence_score}%` }}
                />
              </div>
              <span>{details.confidence_score}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Media Authenticity */}
      {authenticity && authenticity.supported_count > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            {authenticity.status === "ai_generated" ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
            Media Authenticity Check
          </h2>
          <div className={`${styles.detailCard} ${styles.authenticityCard}`}>
            <div className={styles.authenticityTopRow}>
              <span className={styles.authenticityLabel}>{authenticity.label}</span>
              {typeof authenticity.ai_probability === "number" && (
                <span className={styles.authenticityScore}>AI likelihood {authenticity.ai_probability}%</span>
              )}
            </div>
            <p>{getFriendlyAuthenticityMessage(authenticity.status)}</p>

            {authenticity.items?.length > 0 && (
              <div className={styles.authenticityItems}>
                {authenticity.items.map((item, index) => (
                  <div key={`${item.file_name}-${index}`} className={styles.authenticityItem}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <span className={styles.authenticityFileName}>
                        {item.media_type === "audio" ? <Mic size={13} /> : item.media_type === "video" ? <Video size={13} /> : <ImageIcon size={13} />}
                        {item.file_name}
                      </span>
                      <span className={styles.authenticityItemStatus}>{item.label}</span>
                    </div>
                    <p className={styles.authenticityItemSummary} style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-muted)", width: '100%' }}>
                      {getFriendlyAuthenticityMessage(item.status)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flags */}
      {analysis.flags && analysis.flags.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <AlertTriangle size={18} />
            {t.analysisDetailPage.detectedFlags} ({analysis.flags.length})
          </h2>
          <div className={styles.flagGrid}>
            {analysis.flags.map((flag, i) => (
              <div key={i} className={styles.flagCard}>
                <div className={styles.flagHeader}>
                  <RiskBadge level={flag.severity} size="sm" />
                  <span className={styles.flagCategory}>{flag.category}</span>
                </div>
                <p className={styles.flagDesc}>{flag.description}</p>
                {flag.evidence && (
                  <div className={styles.evidence}>
                    <MessageSquare size={13} />
                    <span>&ldquo;{flag.evidence}&rdquo;</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tone Analysis */}
      {details.tone_analysis && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <MessageSquare size={18} />
            {t.analysisDetailPage.toneAnalysis}
          </h2>
          <div className={styles.detailCard}>
            <p>{details.tone_analysis}</p>
          </div>
        </div>
      )}

      {/* Manipulation Indicators */}
      {details.manipulation_indicators &&
        details.manipulation_indicators.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <AlertTriangle size={18} />
              {t.analysisDetailPage.manipulationIndicators}
            </h2>
            <ul className={styles.indicatorList}>
              {details.manipulation_indicators.map((ind, i) => (
                <li key={i}>{ind}</li>
              ))}
            </ul>
          </div>
        )}

      {/* Recommendations */}
      {details.recommendations && details.recommendations.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Lightbulb size={18} />
            {t.analysisDetailPage.recommendations}
          </h2>
          <ul className={styles.recList}>
            {details.recommendations.map((rec, i) => (
              <li key={i}>
                <ShieldCheck size={14} />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Legal Analysis */}
      {details.legal_analysis && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Scale size={18} />
            {t.analysisDetailPage.legalAnalysis}
          </h2>
          <div className={`${styles.detailCard} ${styles.legalCard}`}>
            <p className={styles.legalSummary}>
              {details.legal_analysis.summary}
            </p>

            {details.legal_analysis.potential_violations &&
              details.legal_analysis.potential_violations.length > 0 && (
                <div className={styles.legalViolations}>
                  <strong className={styles.legalViolationsTitle}>
                    {t.analysisDetailPage.potentialViolations}
                  </strong>
                  <ul className={styles.indicatorList}>
                    {details.legal_analysis.potential_violations.map(
                      (violation, i) => (
                        <li key={i}>{violation}</li>
                      ),
                    )}
                  </ul>
                </div>
              )}

            <div className={styles.legalDisclaimer}>
              <AlertTriangle size={16} className={styles.legalDisclaimerIcon} />
              <p className={styles.legalDisclaimerText}>
                <strong>{t.analysisDetailPage.disclaimer}</strong> {details.legal_analysis.disclaimer}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

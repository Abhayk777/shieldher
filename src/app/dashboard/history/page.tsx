"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type Upload, type AnalysisResult } from "@/lib/types";
import { deriveKey, decryptText, decryptFile, storeKey, retrieveKey } from "@/lib/crypto";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  FileSearch,
  ArrowLeft,
  Filter,
  Calendar,
  AlertTriangle,
  ArrowRight,
  ImageIcon,
  Lock,
  Clock,
  FileAudio,
} from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

interface UploadWithAnalysis extends Upload {
  analysis_results: AnalysisResult[];
  decrypted_url?: string;
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i;

function getPrimaryAsset(fileUrl: string) {
  return fileUrl
    .split(",")
    .map((url) => url.trim())
    .find((url) => url.length > 0);
}

function isImageAsset(url: string) {
  return IMAGE_EXT_REGEX.test(url);
}

const AUDIO_EXT_REGEX = /\.(mp3|wav|m4a|aac|ogg|enc)(\?.*)?$/i;
function isAudioAsset(url: string, originalType?: string) {
  if (originalType?.startsWith('audio/')) return true;
  return AUDIO_EXT_REGEX.test(url);
}

function formatConfidence(score?: number) {
  if (typeof score !== "number" || Number.isNaN(score)) return "--";
  const normalized = score <= 1 ? score * 100 : score;
  return `${Math.round(normalized * 10) / 10}%`;
}

export default function HistoryPage() {
  const [uploads, setUploads] = useState<UploadWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "flagged" | "safe">("all");
  
  // Lock screen state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    async function fetchHistory() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("uploads")
        .select("*, analysis_results(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (data) {
        setUploads(data as UploadWithAnalysis[]);
        
        // Automatic unlock if the key is already in memory (session hasn't been wiped)
        const key = await retrieveKey();
        if (key) {
          setIsUnlocked(true);
          // Trigger a silent decryption of the loaded items
          performSilentDecryption(key, data as UploadWithAnalysis[]);
        }
      }
      setLoading(false);
    }
    fetchHistory();
  }, []);

  const performSilentDecryption = async (key: CryptoKey, items: UploadWithAnalysis[]) => {
      try {
        const decryptedUploads = await Promise.all(
          items.map(async (upload) => {
            let decryptedUrl = undefined;

            if (upload.file_iv) {
              try {
                const res = await fetch(upload.file_url);
                if (res.ok) {
                  const buf = await res.arrayBuffer();
                  const decryptedBlob = await decryptFile(key, buf, upload.file_iv, upload.original_type || 'image/png');
                  decryptedUrl = URL.createObjectURL(decryptedBlob);
                }
              } catch (e) {
                console.error("Failed to decrypt item", e);
              }
            }

            if (upload.analysis_results) {
              const decryptedResults = await Promise.all(
                upload.analysis_results.map(async (analysis) => {
                  if (analysis.encrypted_summary) {
                    try {
                      // Note: We use the same IV for all analytical fields for simplicity in this schema
                      const payload = { iv: analysis.encryption_iv || '', ciphertext: analysis.encrypted_summary };
                      const decryptedSummary = await decryptText(key, payload);
                      return { ...analysis, summary: decryptedSummary };
                    } catch {
                      return analysis;
                    }
                  }
                  return analysis;
                })
              );
              return { ...upload, analysis_results: decryptedResults, decrypted_url: decryptedUrl };
            }
            return { ...upload, decrypted_url: decryptedUrl };
          })
        );
        setUploads(decryptedUploads);
      } catch (err) {
        console.error("Silent decryption failed", err);
      }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    setUnlockError("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Not logged in");

      // Verify the password with Supabase
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordPrompt,
      });

      if (error) {
        throw new Error("Incorrect password");
      }

      // Check if we have legacy encrypted text OR encrypted images
      const hasEncryptedData = uploads.some((u) =>
        u.file_iv || u.analysis_results?.some((a) => a.summary === "[encrypted]" || a.encrypted_summary)
      );

      if (hasEncryptedData) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("encryption_salt")
          .eq("id", user.id)
          .single();

        if (profile?.encryption_salt) {
          try {
            const key = await deriveKey(passwordPrompt, profile.encryption_salt);
            await storeKey(key, profile.encryption_salt); // Cache it globally for the session limits
            
            // Decrypt legacy items AND images
            const decryptedUploads = await Promise.all(
              uploads.map(async (upload) => {
                let decryptedUrl = undefined;

                if (upload.file_iv) {
                  try {
                    const res = await fetch(upload.file_url);
                    if (res.ok) {
                      const buf = await res.arrayBuffer();
                      const decryptedBlob = await decryptFile(key, buf, upload.file_iv, upload.original_type || 'image/png');
                      decryptedUrl = URL.createObjectURL(decryptedBlob);
                    }
                  } catch (e) {
                    console.error("Failed to decrypt image", e);
                  }
                }

                if (upload.analysis_results) {
                  const decryptedResults = await Promise.all(
                    upload.analysis_results.map(async (analysis) => {
                      if (analysis.encrypted_summary) {
                        try {
                          const payload = JSON.parse(analysis.encrypted_summary);
                          const decryptedSummary = await decryptText(key, payload);
                          return { ...analysis, summary: decryptedSummary };
                        } catch {
                          return analysis;
                        }
                      }
                      return analysis;
                    })
                  );
                  return { ...upload, analysis_results: decryptedResults, decrypted_url: decryptedUrl };
                }
                return { ...upload, decrypted_url: decryptedUrl };
              })
            );
            setUploads(decryptedUploads);
          } catch (err) {
            console.error("Failed to decrypt secure items", err);
          }
        }
      }

      setIsUnlocked(true);
    } catch (err: any) {
      setUnlockError(err.message || "Failed to unlock history.");
    } finally {
      setUnlocking(false);
      setPasswordPrompt("");
    }
  };

  const filtered = uploads.filter((u) => {
    if (filter === "all") return true;
    if (filter === "flagged") return u.status === "flagged";
    return (
      u.status === "completed" &&
      u.analysis_results?.some(
        (a) => a.risk_level === "safe" || a.risk_level === "low",
      )
    );
  });

  const hasLegacyEncrypted = uploads.some((u) =>
    u.analysis_results?.some((a) => a.summary === "[encrypted]")
  );

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
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Analysis History</h1>
        <p className={styles.subtitle}>
          Browse your past screenshot uploads and review detailed AI analysis
          reports. Our system identifies structural discrepancies and security
          vulnerabilities in real-time.
        </p>
      </div>

      {!isUnlocked && (
        <div className={styles.unlockBanner}>
          <div className={styles.bannerIcon}>
            <Lock size={20} />
          </div>
          <div className={styles.bannerContent}>
            <h3 className={styles.bannerTitle}>History is Encrypted</h3>
            <p className={styles.bannerText}>Enter your password to unlock the vault and reveal your sensitive analysis data.</p>
          </div>
          <form onSubmit={handleUnlock} className={styles.bannerForm}>
            <input
              type="password"
              placeholder="Your password..."
              className={styles.bannerInput}
              value={passwordPrompt}
              onChange={(e) => setPasswordPrompt(e.target.value)}
              disabled={unlocking}
            />
            <button type="submit" className={styles.bannerBtn} disabled={unlocking || !passwordPrompt}>
              {unlocking ? "Decrypting..." : "Unlock Vault"}
            </button>
          </form>
          {unlockError && <div className={styles.bannerError}>{unlockError}</div>}
        </div>
      )}

      <div className={styles.filtersWrapper}>
        <div className={styles.filterIconWrap}>
          <Filter size={16} />
        </div>
        <div className={styles.filters}>
          {(["all", "flagged", "safe"] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.active : ""}`}
              onClick={() => setFilter(f)}
            >
              <span className={styles.filterDot} data-type={f} />
              {f === "all"
                ? "All Uploads"
                : f === "flagged"
                  ? "Flagged Issues"
                  : "Safe Results"}
            </button>
          ))}
        </div>
        <div className={styles.dateRangeChip}>
          <Calendar size={14} />
          Date Range
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className={styles.list}>
          {filtered.map((upload) => {
            const analyses = upload.analysis_results ?? [];
            const primaryAsset = getPrimaryAsset(upload.file_url);
            const statusTone =
              upload.status === "flagged"
                ? "flagged"
                : upload.status === "completed"
                  ? "safe"
                  : "processing";
            const statusLabel =
              upload.status === "flagged"
                ? "Flagged"
                : upload.status === "completed"
                  ? "Safe"
                  : "Processing";

            return (
              <article key={upload.id} className={styles.uploadCard}>
                <div className={styles.mediaPane}>
                  <span className={`${styles.mediaStatus} ${styles[statusTone]}`}>
                    {statusLabel}
                  </span>
                  {isUnlocked && primaryAsset && isImageAsset(primaryAsset) ? (
                    <img
                      src={upload.decrypted_url || primaryAsset}
                      alt={upload.file_name}
                      className={styles.mediaImage}
                    />
                  ) : isUnlocked && primaryAsset && isAudioAsset(primaryAsset, upload.original_type ?? undefined) ? (
                    <div className={styles.audioItemPreview}>
                       <FileAudio size={40} className={styles.audioIcon} />
                       <audio src={upload.decrypted_url || primaryAsset} controls className={styles.cardAudio} />
                    </div>
                  ) : (
                    <div className={styles.mediaPlaceholder}>
                      {isUnlocked ? <ImageIcon size={34} /> : <Lock size={30} />}
                      <span>{isUnlocked ? "No preview available" : "Encrypted Content"}</span>
                    </div>
                  )}
                </div>

                <div className={styles.contentPane}>
                  <div className={styles.cardTitleWrap}>
                    <h3 className={styles.fileName}>{upload.file_name}</h3>
                    <span className={styles.uploadDate}>
                      UPLOADED: {new Date(upload.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {!isUnlocked ? (
                    <div className={styles.lockedAnalysis}>
                      <Lock size={16} />
                      <span>Protected AI Analysis. Unlock vault to view flags and recommendations.</span>
                    </div>
                  ) : analyses.length > 0 ? (
                    <div className={styles.analysisStack}>
                      {analyses.map((analysis) => {
                        const firstFlag = analysis.flags?.[0];

                        return (
                          <section key={analysis.id} className={styles.analysisBlock}>
                            <p className={styles.summary}>{analysis.summary}</p>

                            {firstFlag && (
                              <div className={styles.alertBox}>
                                <div className={styles.alertTitle}>
                                  <AlertTriangle size={15} />
                                  Flag Detected: {firstFlag.category}
                                </div>
                                <p className={styles.alertDescription}>
                                  {firstFlag.description}
                                </p>
                              </div>
                            )}

                            <div className={styles.analysisMeta}>
                              <div className={styles.metaInfo}>
                                <span>
                                  AI Confidence: {formatConfidence(analysis.details?.confidence_score)}
                                </span>
                                <span>Report #{analysis.id.slice(0, 8).toUpperCase()}</span>
                              </div>
                              <Link
                                href={`/dashboard/analysis/${analysis.upload_id}`}
                                className={styles.analysisLink}
                              >
                                View Full Analysis
                                <ArrowRight size={15} />
                              </Link>
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.noAnalysis}>
                      Analysis is still processing for this upload.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIconWrap}>
            <FileSearch size={30} />
          </div>
          <h3>No results found</h3>
          <p>
            {filter !== "all"
              ? "Try changing your filter to see more results."
              : "Upload some screenshots to get started."}
          </p>
          <Link href="/dashboard/upload" className={styles.emptyButton}>
            New Upload
          </Link>
        </div>
      )}
    </div>
  );
}

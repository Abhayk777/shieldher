'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Loader } from 'lucide-react';
import Link from 'next/link';
import UploadZone from '@/components/UploadZone';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setError('');
  };

  const handleAnalyze = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in to upload');

      const uploadIds: string[] = [];

      for (const file of files) {
        // Upload file to Supabase Storage
        const fileName = `${user.id}/${Date.now()}-${file.name}`;
        const { error: storageError } = await supabase.storage
          .from('screenshots')
          .upload(fileName, file);

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage
          .from('screenshots')
          .getPublicUrl(fileName);

        // Create upload record
        const { data: upload, error: dbError } = await supabase
          .from('uploads')
          .insert({
            user_id: user.id,
            file_url: publicUrl,
            file_name: file.name,
            status: 'pending',
          })
          .select()
          .single();

        if (dbError) throw dbError;
        if (upload) uploadIds.push(upload.id);
      }

      setUploading(false);
      setAnalyzing(true);

      // Trigger analysis for each upload
      for (const uploadId of uploadIds) {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Analysis failed');
        }
      }

      router.push('/dashboard/history');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setUploading(false);
      setAnalyzing(false);
    }
  };

  return (
    <div className={styles.page}>
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Upload Screenshots</h1>
        <p className={styles.subtitle}>
          Upload chat screenshots for AI-powered analysis. We&apos;ll detect harmful
          patterns, manipulation, and potential threats.
        </p>
      </div>

      <UploadZone onFilesSelected={handleFilesSelected} isUploading={uploading} />

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      <div className={styles.actions}>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleAnalyze}
          disabled={files.length === 0 || uploading || analyzing}
          style={{ minWidth: 200 }}
        >
          {uploading ? (
            <>
              <Loader size={18} className="animate-spin" />
              Uploading...
            </>
          ) : analyzing ? (
            <>
              <Loader size={18} className="animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Analyze {files.length > 0 ? `(${files.length})` : ''}
            </>
          )}
        </button>
      </div>

      <div className={styles.tips}>
        <h3>Tips for best results</h3>
        <ul>
          <li>Take clear, full-screen screenshots of the chat</li>
          <li>Include the full conversation thread when possible</li>
          <li>Make sure text is readable and not blurry</li>
          <li>You can upload multiple screenshots at once</li>
        </ul>
      </div>
    </div>
  );
}

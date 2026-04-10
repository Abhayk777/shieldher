import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createClient } from '@/lib/supabase/server';

type FetchedUploadFile = {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'audio' | 'video' | 'other';
  arrayBuffer: ArrayBuffer;
  inlinePart: {
    inlineData: {
      data: string;
      mimeType: string;
    };
  };
};

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseAnalysisJson(rawText: string) {
  const jsonCandidate = extractJsonObject(rawText);
  if (!jsonCandidate) {
    throw new Error('Gemini response did not contain valid JSON');
  }
  try {
    return JSON.parse(jsonCandidate) as Record<string, unknown>;
  } catch {
    const normalized = jsonCandidate.replace(/,\s*([}\]])/g, '$1').trim();
    return JSON.parse(normalized) as Record<string, unknown>;
  }
}

function getFileNameFromUrl(fileUrl: string, fallback: string) {
  try {
    const pathname = new URL(fileUrl).pathname;
    const segments = pathname.split('/');
    const lastSegment = segments[segments.length - 1] || fallback;
    return decodeURIComponent(lastSegment);
  } catch {
    return fallback;
  }
}

function getStoragePathFromFileUrl(fileUrl: string, bucket: string) {
  try {
    const pathname = new URL(fileUrl).pathname;
    // Handle both public and private/authenticated bucket segments in the URL
    const publicMarker = `/object/public/${bucket}/`;
    const authMarker = `/object/authenticated/${bucket}/`;
    
    let markerIndex = pathname.indexOf(publicMarker);
    let markerLength = publicMarker.length;
    
    if (markerIndex === -1) {
      markerIndex = pathname.indexOf(authMarker);
      markerLength = authMarker.length;
    }
    
    if (markerIndex === -1) {
      // Fallback: try to find the bucket name anywhere in the path after /object/
      const objectMarker = '/object/';
      const objIndex = pathname.indexOf(objectMarker);
      if (objIndex !== -1) {
        const afterObject = pathname.slice(objIndex + objectMarker.length);
        const parts = afterObject.split('/');
        // Assuming structure is type/bucket/path...
        if (parts.length >= 3 && (parts[0] === 'public' || parts[0] === 'authenticated' || parts[0] === 'sign')) {
          return decodeURIComponent(parts.slice(2).join('/'));
        }
      }
      return null;
    }
    
    const rawPath = pathname.slice(markerIndex + markerLength);
    return decodeURIComponent(rawPath);
  } catch (err) {
    console.error('Error parsing storage path from URL:', err);
    return null;
  }
}

async function fetchUploadBytes(
  fileRef: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket = 'screenshots',
) {
  const isHttpUrl = /^https?:\/\//i.test(fileRef);
  let resolvedUrl = fileRef;

  // First attempt: direct URL fetch (works for public buckets)
  if (isHttpUrl) {
    const directResp = await fetch(fileRef);
    if (directResp.ok) {
      return {
        arrayBuffer: await directResp.arrayBuffer(),
        contentType: directResp.headers.get('content-type') || '',
        resolvedUrl,
      };
    }
  }

  // Fallback: generate signed URL (works for private buckets)
  const storagePath = isHttpUrl ? getStoragePathFromFileUrl(fileRef, bucket) : fileRef;
  if (!storagePath) {
    throw new Error('Failed to resolve storage path for uploaded file');
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 5);

  if (signError || !signedData?.signedUrl) {
    throw new Error('Failed to create signed URL for uploaded file');
  }

  resolvedUrl = signedData.signedUrl;
  const signedResp = await fetch(resolvedUrl);
  if (!signedResp.ok) {
    throw new Error('Failed to fetch uploaded file');
  }

  return {
    arrayBuffer: await signedResp.arrayBuffer(),
    contentType: signedResp.headers.get('content-type') || '',
    resolvedUrl,
  };
}

function detectMimeType(fileUrl: string, headerMimeType: string) {
  if (headerMimeType && !headerMimeType.startsWith('application/')) {
    return headerMimeType;
  }

  try {
    const pathname = new URL(fileUrl).pathname.toLowerCase();
    if (pathname.endsWith('.mp3')) return 'audio/mp3';
    if (pathname.endsWith('.wav')) return 'audio/wav';
    if (pathname.endsWith('.m4a')) return 'audio/x-m4a';
    if (pathname.endsWith('.aac')) return 'audio/aac';
    if (pathname.endsWith('.ogg')) return 'audio/ogg';
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
    if (pathname.endsWith('.webp')) return 'image/webp';
    if (pathname.endsWith('.mp4')) return 'video/mp4';
    if (pathname.endsWith('.webm')) return 'video/webm';
    if (pathname.endsWith('.mov')) return 'video/quicktime';
    if (pathname.endsWith('.avi')) return 'video/x-msvideo';
    if (pathname.endsWith('.mkv')) return 'video/x-matroska';
    if (pathname.endsWith('.3gp')) return 'video/3gpp';
  } catch {
    return 'application/octet-stream';
  }

  return 'application/octet-stream';
}

function normalizeMimeTypeForGemini(mimeType: string, kind: 'image' | 'audio' | 'video' | 'other') {
  const normalized = mimeType.toLowerCase();

  if (normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'audio/mp3') return 'audio/mpeg';
  if (normalized === 'audio/x-m4a') return 'audio/mp4';

  if (kind === 'image' && !normalized.startsWith('image/')) return 'image/jpeg';
  if (kind === 'audio' && !normalized.startsWith('audio/')) return 'audio/mpeg';
  if (kind === 'video' && !normalized.startsWith('video/')) return 'video/mp4';

  return normalized;
}

function getMediaKind(mimeType: string, fileName: string): 'image' | 'audio' | 'video' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';

  const lower = fileName.toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/i.test(lower)) return 'image';
  if (/\.(mp3|wav|m4a|aac|ogg)$/i.test(lower)) return 'audio';
  if (/\.(mp4|webm|mov|avi|mkv|3gp)$/i.test(lower)) return 'video';
  return 'other';
}

export async function POST(request: NextRequest) {
  try {
    const { uploadId, language = 'English' } = await request.json();

    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required' }, { status: 400 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userCountry = user?.user_metadata?.country || 'United States';

    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .select('*')
      .eq('id', uploadId)
      .single();

    if (uploadError || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    await supabase.from('uploads').update({ status: 'analyzing' }).eq('id', uploadId);

    let result;
    try {
      const fileUrls = upload.file_url
        ?.split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => url.length > 0) || [];

      if (fileUrls.length === 0) {
        throw new Error('No uploaded files were found in this record');
      }

      const fetchedFiles: FetchedUploadFile[] = await Promise.all(
        fileUrls.map(async (fileUrl: string, index: number) => {
          const fetched = await fetchUploadBytes(fileUrl, supabase);
          const arrayBuffer = fetched.arrayBuffer;
          const base64Data = Buffer.from(arrayBuffer).toString('base64');
          const fileName = getFileNameFromUrl(fileUrl, `upload-${index + 1}`);
          const detectedMimeType = detectMimeType(fileUrl, fetched.contentType);
          const kind = getMediaKind(detectedMimeType, fileName);
          const mimeType = normalizeMimeTypeForGemini(detectedMimeType, kind);

          return {
            fileUrl: fetched.resolvedUrl,
            fileName,
            mimeType,
            kind,
            arrayBuffer,
            inlinePart: {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
          };
        }),
      );

      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const contentParts: Part[] = [];
      const tempFilePaths: string[] = [];
      const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY!);

      for (const file of fetchedFiles) {
        if (file.kind === 'other') {
          console.warn(`Skipping unsupported file type for ${file.fileName}: ${file.mimeType}`);
          continue;
        }

        if (file.kind === 'video') {
          const tempDir = await mkdtemp(join(tmpdir(), 'shieldher-'));
          const tempPath = join(tempDir, file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_'));
          await writeFile(tempPath, Buffer.from(file.arrayBuffer));
          tempFilePaths.push(tempPath);

          try {
            const uploadResult = await fileManager.uploadFile(tempPath, {
              mimeType: file.mimeType,
              displayName: file.fileName,
            });

            let geminiFile = uploadResult.file;
            while (geminiFile.state === FileState.PROCESSING) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              geminiFile = await fileManager.getFile(geminiFile.name);
            }

            if (geminiFile.state === FileState.FAILED) {
              console.error('Video processing failed for:', file.fileName);
              continue;
            }

            contentParts.push({
              fileData: {
                fileUri: geminiFile.uri,
                mimeType: geminiFile.mimeType,
              },
            });
          } catch (videoErr) {
            console.error('Failed to upload video to Gemini:', videoErr);
          }
        } else {
          contentParts.push(file.inlinePart);
        }
      }

      for (const tempPath of tempFilePaths) {
        try {
          await unlink(tempPath);
        } catch {
          // ignore cleanup error
        }
      }

      const hasVideo = fetchedFiles.some((f) => f.kind === 'video');
      const evidenceTypes = [
        fetchedFiles.some((f) => f.kind === 'image') && 'screenshot(s)',
        fetchedFiles.some((f) => f.kind === 'audio') && 'voice recording(s)',
        hasVideo && 'video(s)',
      ]
        .filter(Boolean)
        .join(', ');

      const prompt = `Analyze this chat evidence (${evidenceTypes || 'uploaded media'}) for a women's protection application.
          
          CRITICAL INSTRUCTIONS:
          0. LANGUAGE REQUIREMENT: You MUST generate the ENTIRE analysis, summary, descriptions, and all JSON string values strictly in the following language: ${language}.
          1. COMMUNICATION STYLE: Write all responses in plain, simple, and highly empathetic language. Avoid overly clinical, technical, or confusing psychological jargon. Explain concepts clearly and gently, as if speaking to a friend in need of support. Keep sentences short and accessible.
          2. CONTEXT AWARENESS: Carefully evaluate the context, especially the recipient's responses. Distinguish between mutual banter/jokes and actual manipulative, coercive, or threatening behavior. Do not flag obvious mutual joking as critical abuse.
          3. BEHAVIORAL ANALYSIS: Look for signs of gaslighting, emotional blackmail, isolation tactics, DARVO, or physical threats, but explain them simply.
          4. LEGAL ANALYSIS: Perform a preliminary legal analysis identifying any potential laws or legal frameworks that may have been violated, specifically keeping in mind the jurisdiction and laws of ${userCountry}. Include a disclaimer that this is not official legal advice.
          ${hasVideo ? '5. VIDEO ANALYSIS: For any video content, analyze the visual scenes, spoken dialogue (if any), body language, on-screen text/chat messages, and overall context. Describe specific timestamps or moments that are concerning.' : ''}
          
          Please format your response EXACTLY as a JSON object matching this schema without markdown code blocks:
          {
            "risk_level": "safe" | "low" | "medium" | "high" | "critical",
            "summary": "A plain, easy-to-understand, and empathetic overview of the conversation and findings",
            "flags": [
              {
                "category": "String (e.g., Direct Threats, Gaslighting, Mutual Banter)",
                "description": "String describing what was found in simple, supportive language",
                "severity": "safe" | "low" | "medium" | "high" | "critical",
                "evidence": "String quoting the specific text from the image, audio transcription, or video scene description"
              }
            ],
            "details": {
              "tone_analysis": "String analyzing the power dynamic and tone in simple, non-clinical language",
              "manipulation_indicators": ["Array of short, easy-to-understand strings"],
              "threat_indicators": ["Array of short, easy-to-understand strings"],
              "recommendations": ["Array of strings with actionable, supportive, and practical advice"],
              "confidence_score": "Number between 0 and 100",
              "legal_analysis": {
                "summary": "String explaining the legal context simply",
                "potential_violations": ["Array of strings naming potential legal issues"],
                "disclaimer": "This AI-generated analysis is for informational purposes only and does not constitute professional legal advice. Please consult with a qualified attorney."
              }
            }
          }`;

      if (contentParts.length === 0) {
        throw new Error('No supported media could be attached for AI analysis');
      }

      const aiResponse = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, ...contentParts],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });
      const text = aiResponse.response.text()?.trim();
      if (!text) {
        throw new Error('Gemini returned an empty response');
      }
      result = parseAnalysisJson(text);
    } catch (aiError: unknown) {
      const errorMessage = aiError instanceof Error ? aiError.message : String(aiError);
      console.error('Gemini Analysis Critical Error:', aiError);

      // Keep a valid status value defined by DB constraints.
      const { error: statusError } = await supabase
        .from('uploads')
        .update({ status: 'pending' })
        .eq('id', uploadId);
      if (statusError) {
        console.error('Failed to reset upload status after analysis error:', statusError.message);
      }

      return NextResponse.json(
        { error: `AI Analysis failed: ${errorMessage}` },
        { status: 500 },
      );
    }

    const { data: analysisResult, error: analysisError } = await supabase
      .from('analysis_results')
      .insert({
        upload_id: uploadId,
        risk_level: result.risk_level,
        summary: result.summary,
        flags: result.flags,
        details: result.details,
      })
      .select()
      .single();

    if (analysisError) {
      throw analysisError;
    }

    const finalStatus =
      result.risk_level === 'high' || result.risk_level === 'critical'
        ? 'flagged'
        : 'completed';

    await supabase.from('uploads').update({ status: finalStatus }).eq('id', uploadId);

    return NextResponse.json({ success: true, analysis: analysisResult });
  } catch (error: unknown) {
    console.error('API Route Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to process uploads: ${errorMessage}` },
      { status: 500 }
    );
  }
}

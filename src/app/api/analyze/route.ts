import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { uploadId } = await request.json();

    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const supabase = await createClient();

    // Get the upload record
    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .select('*')
      .eq('id', uploadId)
      .single();

    if (uploadError || !upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
    }

    // Update status to analyzing
    await supabase
      .from('uploads')
      .update({ status: 'analyzing' })
      .eq('id', uploadId);

    let result;
    try {
      // 1. Fetch the image data from the Supabase public URL
      const imageResp = await fetch(upload.file_url);
      if (!imageResp.ok) {
         throw new Error('Failed to fetch image from storage');
      }
      const arrayBuffer = await imageResp.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      
      const mimeType = imageResp.headers.get('content-type') || 'image/png';

      // 2. Initialize the Gemini Vision model
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // 3. Define the prompt
      const prompt = `Analyze this chat screenshot for a women's protection application.
          
          CRITICAL INSTRUCTIONS:
          1. CONTEXT AWARENESS: Carefully evaluate the context, especially the recipient's responses. Distinguish between mutual banter/jokes and actual manipulative, coercive, or threatening behavior. Do not flag obvious mutual joking as critical abuse.
          2. BEHAVIORAL ANALYSIS: Look for signs of gaslighting, emotional blackmail, isolation tactics, DARVO, or physical threats.
          3. LEGAL ANALYSIS: Perform a preliminary legal analysis identifying any potential laws or legal frameworks that may have been violated (e.g., cyber harassment, stalking, terroristic threats). You MUST include a disclaimer that this is not official legal advice.
          
          Please format your response EXACTLY as a JSON object matching this schema without markdown code blocks:
          {
            "risk_level": "safe" | "low" | "medium" | "high" | "critical",
            "summary": "A concise overview of the conversation and findings",
            "flags": [
              {
                "category": "String (e.g., Direct Threats, Gaslighting, Mutual Banter)",
                "description": "String describing what was found",
                "severity": "safe" | "low" | "medium" | "high" | "critical",
                "evidence": "String quoting the specific text from the image"
              }
            ],
            "details": {
              "tone_analysis": "String analyzing the power dynamic and tone",
              "manipulation_indicators": ["Array of strings"],
              "threat_indicators": ["Array of strings"],
              "recommendations": ["Array of strings with actionable advice"],
              "confidence_score": "Number between 0 and 100",
              "legal_analysis": {
                "summary": "String",
                "potential_violations": ["Array of strings naming potential legal issues"],
                "disclaimer": "This AI-generated analysis is for informational purposes only and does not constitute professional legal advice. Please consult with a qualified attorney."
              }
            }
          }`;

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType
        },
      };

      // 4. Generate content
      const aiResponse = await model.generateContent([prompt, imagePart]);
      const text = aiResponse.response.text();
      
      // 5. Parse the JSON safely, handling potential markdown wrappers
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      result = JSON.parse(cleanText);

    } catch (aiError) {
      console.error('Gemini Analysis Failed:', aiError);
      // Fallback on error so app doesn't break
      await supabase.from('uploads').update({ status: 'completed' }).eq('id', uploadId);
      return NextResponse.json({ error: 'AI Analysis failed to process image' }, { status: 500 });
    }

    // Store analysis result in DB
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

    // Update upload status
    const finalStatus =
      result.risk_level === 'high' || result.risk_level === 'critical'
        ? 'flagged'
        : 'completed';

    await supabase
      .from('uploads')
      .update({ status: finalStatus })
      .eq('id', uploadId);

    return NextResponse.json({ success: true, analysis: analysisResult });
  } catch (error: unknown) {
    console.error('API Route Error:', error);
    return NextResponse.json(
      { error: 'Failed to process screenshot' },
      { status: 500 }
    );
  }
}

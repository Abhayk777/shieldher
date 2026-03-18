import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function run() {
  console.log('Testing OpenAI connection and prompt...');
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this chat screenshot for a women's protection application.
              
              CRITICAL INSTRUCTIONS:
              1. CONTEXT AWARENESS: Analyze the recipient's responses. Distinguish between mutual banter/jokes and actual manipulative, coercive, or threatening behavior.
              2. BEHAVIORAL ANALYSIS: Look for signs of gaslighting, emotional blackmail, isolation tactics.
              3. LEGAL ANALYSIS: Perform a preliminary legal analysis identifying potential laws violated (e.g., cyber harassment). You MUST include a disclaimer.
              
              Please format your response EXACTLY as a JSON object matching this schema:
              {
                "risk_level": "safe" | "low" | "medium" | "high" | "critical",
                "summary": "overview",
                "flags": [],
                "details": {
                  "legal_analysis": {
                    "summary": "string",
                    "potential_violations": ["string"],
                    "disclaimer": "string"
                  }
                }
              }`
            },
            {
              type: 'image_url',
              image_url: {
                url: 'https://i.ibb.co/L5hYhH1/abusive-text.png' // A generic example image URL since we just need to test the struct
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error('API Error:', error);
  }
}
run();

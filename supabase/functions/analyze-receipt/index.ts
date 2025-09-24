import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_base64 } = await req.json();

    if (!image_base64) {
      throw new Error('Image data is required');
    }

    console.log('Analyzing receipt with OpenAI Vision...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a receipt analysis expert. Analyze the receipt image and extract key information. 
            Return ONLY valid JSON in this exact format (no markdown, no extra text):
            {
              "merchant_name": "string",
              "total_amount": "number as string (e.g., '25.99')",
              "currency": "string (gbp, usd, eur)",
              "date": "string in YYYY-MM-DD format",
              "category": "string (optional category like 'Food', 'Office Supplies', etc.)",
              "line_items": [
                {
                  "description": "string", 
                  "quantity": number,
                  "unit_price": "number as string",
                  "amount": "number as string"
                }
              ]
            }
            
            Important guidelines:
            - If you can't read something clearly, use reasonable defaults or leave empty strings
            - For currency, try to detect from symbols (£=gbp, $=usd, €=eur) or default to 'gbp'
            - For date, if unclear, use today's date
            - Extract individual line items if visible
            - Total amount should be the final total paid
            - Keep merchant name concise (e.g., "Tesco", not "Tesco Express Store 123")
            - Category should be general (e.g., "Groceries", "Office Supplies", "Travel", "Fuel")`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please analyze this receipt and extract the information in the specified JSON format.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${image_base64}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('OpenAI response:', data);

    const analysisResult = data.choices[0].message.content;
    console.log('Raw analysis result:', analysisResult);

    // Parse the JSON response, handling markdown code blocks
    let receiptData;
    try {
      // Remove markdown code blocks if present
      let jsonString = analysisResult.trim();
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/```\n?/, '').replace(/\n?```$/, '');
      }
      
      receiptData = JSON.parse(jsonString);
      console.log('Successfully parsed receipt data:', receiptData);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      console.error('Cleaned JSON string:', jsonString);
      
      // Return a default structure if parsing fails
      receiptData = {
        merchant_name: 'Unknown Merchant',
        total_amount: '0.00',
        currency: 'gbp',
        date: new Date().toISOString().split('T')[0],
        category: '',
        line_items: []
      };
    }

    console.log('Parsed receipt data:', receiptData);

    return new Response(JSON.stringify({ 
      success: true,
      receipt_data: receiptData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-receipt function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message || 'Failed to analyze receipt'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
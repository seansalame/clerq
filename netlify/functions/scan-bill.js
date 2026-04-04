exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'GEMINI_API_KEY not set' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  const { image, mimeType } = body;
  if (!image || !mimeType) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing image or mimeType' })
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `You are a receipt scanner. Look at this restaurant receipt image and extract all food and drink line items.

RULES:
- Extract ONLY food and drink items
- Do NOT include: tax, VAT, service charge, tip, total, subtotal, discounts
- Keep item names exactly as written on the receipt (Hebrew or English)
- Return ONLY a JSON array, no explanation, no markdown, no code blocks
- Use this exact format: [{"name":"item name","price":12.50}]
- Price must be a number (not a string)
- If you cannot read the receipt, return empty array: []`
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: image
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 2048
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('Gemini status:', response.status);
    console.log('Gemini response:', responseText.substring(0, 500));

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Gemini API error', details: responseText })
      };
    }

    const data = JSON.parse(responseText);
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    text = text.trim();
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
      text = text.substring(startIdx, endIdx + 1);
    }

    let items = [];
    try {
      items = JSON.parse(text);
    } catch (parseErr) {
      console.log('Parse error:', parseErr.message, 'Raw text:', text);
      items = [];
    }

    if (!Array.isArray(items)) items = [];

    const validItems = items
      .filter(i => i && typeof i.name === 'string' && i.name.trim() && typeof i.price === 'number' && i.price > 0)
      .map(i => ({
        name: i.name.trim(),
        price: Math.round(i.price * 100) / 100
      }));

    console.log('Valid items found:', validItems.length);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ items: validItems })
    };

  } catch (err) {
    console.log('Fetch error:', err.message);
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Network error', details: err.message })
    };
  }
};

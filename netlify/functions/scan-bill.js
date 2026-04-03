exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API key not configured' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { image, mimeType } = body;
  if (!image || !mimeType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing image or mimeType' }) };
  }

  const prompt = `You are a receipt scanner. Extract ALL food and drink line items from this restaurant receipt image.
Rules:
- Include every food and drink item
- EXCLUDE: tax, VAT, service charge, tip, total, subtotal, discounts
- Keep item names exactly as written (Hebrew or English)
- Return ONLY a valid JSON array, no other text, no markdown
- Format: [{"name":"item name","price":12.50}]
- Price must be a number
- If you cannot read the receipt clearly, return: []`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: image } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error:', errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Gemini API error', details: errText })
      };
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    text = text.replace(/```json|```/g, '').trim();

    let items = [];
    try {
      items = JSON.parse(text);
    } catch {
      console.error('Parse error, raw text:', text);
      items = [];
    }

    if (!Array.isArray(items)) items = [];

    const valid = items.filter(i =>
      i &&
      typeof i.name === 'string' &&
      i.name.trim().length > 0 &&
      typeof i.price === 'number' &&
      i.price > 0
    ).map(i => ({
      name: i.name.trim(),
      price: Math.round(i.price * 100) / 100
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ items: valid })
    };

  } catch (err) {
    console.error('Function error:', err.message);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: err.message })
    };
  }
};

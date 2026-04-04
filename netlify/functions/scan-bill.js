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
    contents: [{
      parts: [
        {
          text: `You are an expert receipt scanner. Analyze this restaurant receipt image carefully.

CRITICAL RULES:
1. Extract ONLY food and drink items. Do NOT include: tax, VAT, service charge, tip, total, subtotal, discounts.
2. The receipt has columns: item name | unit price | quantity | total price.
3. READ THE QUANTITY COLUMN. If quantity is 2, add the item TWICE as separate entries. If quantity is 3, add it THREE times.
4. Always use the UNIT PRICE (not the total) for each entry.
5. Keep names exactly as written (Hebrew or English).
6. Return ONLY a raw JSON array. No markdown, no explanation, no code blocks.
7. Format: [{"name":"item name","price":50.00}]

EXAMPLE:
Receipt row: "פאפא בורגר | 50.00 | 2 | 100.00"
Correct output: [{"name":"פאפא בורגר","price":50.00},{"name":"פאפא בורגר","price":50.00}]

If unreadable, return: []`
        },
        {
          inline_data: {
            mime_type: mimeType,
            data: image
          }
        }
      ]
    }],
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
    } catch(e) {
      console.log('Parse error:', e.message);
      items = [];
    }

    if (!Array.isArray(items)) items = [];

    const validItems = items
      .filter(i => i && typeof i.name === 'string' && i.name.trim() && typeof i.price === 'number' && i.price > 0)
      .map(i => ({ name: i.name.trim(), price: Math.round(i.price * 100) / 100 }));

    console.log('Items found:', validItems.length);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ items: validItems })
    };

  } catch(err) {
    console.log('Error:', err.message);
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};

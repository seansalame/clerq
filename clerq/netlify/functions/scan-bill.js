exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
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

  const prompt = `אתה סורק קבלות מסעדה. חלץ את כל פריטי האוכל והשתייה מהקבלה.
אל תכלול: מע"מ, שירות, טיפ, סכום כולל, הנחות.
שמור על שמות הפריטים בדיוק כפי שכתוב (עברית או אנגלית).
החזר JSON בלבד, ללא טקסט נוסף, ללא markdown:
[{"name":"שם פריט","price":12.50}]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: image } }
            ]
          }]
        })
      }
    );

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    text = text.replace(/```json|```/g, '').trim();

    let items;
    try {
      items = JSON.parse(text);
    } catch {
      items = [];
    }

    const valid = items.filter(i => i.name && typeof i.price === 'number' && i.price > 0);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: valid })
    };

  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'AI service error', details: err.message })
    };
  }
};

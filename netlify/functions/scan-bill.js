exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { image, mimeType } = body;
  if (!image) return { statusCode: 400, body: JSON.stringify({ error: 'Missing image' }) };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'אתה סורק קבלות מסעדה. חלץ את כל פריטי האוכל והשתייה. אל תכלול מע"מ, שירות, טיפ, סכום כולל. שמור שמות פריטים כפי שכתוב. החזר JSON בלבד ללא שום טקסט אחר: [{"name":"שם פריט","price":12.50}]' },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
            ]
          }]
        })
      }
    );

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const items = JSON.parse(cleaned);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.filter(i => i.name && typeof i.price === 'number') })
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { question, answer, topicName } = req.body;

    if (!question || !answer || !topicName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 150,
                messages: [{
                    role: 'user',
                    content: `אתה עוזר לתעד ידע של עובדת אדמיניסטרציה בחברה.
הנושא: ${topicName}
השאלה ששאלנו: ${question}
התשובה שקיבלנו: ${answer}

אם התשובה חלקית או לא ברורה, כתוב שאלת המשך אחת קצרה (עד 15 מילים) בעברית פשוטה.
אם התשובה מספיקה, כתוב רק: OK

שאלת המשך:`
                }]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(500).json({ error: data.error.message });
        }

        const reply = data.content[0].text.trim();
        
        if (reply === 'OK' || reply.length > 60) {
            return res.status(200).json({ followUp: null });
        }

        return res.status(200).json({ followUp: reply });

    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
}

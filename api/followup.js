export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { question, answer, topicName, scaffoldPoints } = req.body;

    if (!question || !answer || !topicName) {
        return res.status(400).json({ error: 'Missing fields' });
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
                max_tokens: 400,
                messages: [{
                    role: 'user',
                    content: `אתה בודק תשובות בשאלון שימור ידע ארגוני. התפקיד שלך: לזהות תשובות לא רלוונטיות ולעזור להשלים מידע חסר.

הנושא: ${topicName}
השאלה: ${question}
נקודות שביקשנו לכסות: ${scaffoldPoints ? scaffoldPoints.join(' | ') : 'לא צוין'}

התשובה שהתקבלה: "${answer}"

בדוק את התשובה לפי הקריטריונים הבאים:

1. רלוונטיות (הכי חשוב!): האם התשובה עוסקת בנושא השאלה?
   - שאלה על מערכת כיבוי אש → תשובה צריכה לדבר על מטפים/גלאים/ספקים/בדיקות
   - שאלה על אזעקה → תשובה צריכה לדבר על קודים/מוקד/ספק אזעקה
   - אם התשובה על נושא אחר לגמרי (כדורגל, אוכל, בדיחות) = לא רלוונטי!

2. תוכן ממשי: האם יש מידע שימושי או רק מילים כלליות?

3. שלמות: כמה מהנקודות שביקשנו מכוסות?

החזר JSON בלבד (בלי שום טקסט אחר):
{
  "isRelevant": true/false,
  "relevanceReason": "הסבר קצר למה כן/לא רלוונטי",
  "hasContent": true/false,
  "completeness": "none"/"low"/"medium"/"high",
  "missingPoints": ["נקודה חסרה 1", "נקודה חסרה 2"],
  "feedback": "משוב קצר וחיובי אם רלוונטי, או הסבר מה לא בסדר",
  "followupQuestion": "שאלת המשך ספציפית או null"
}`
                }]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('API error:', data.error);
            return res.status(200).json({ needsReview: true });
        }

        let result;
        try {
            const text = data.content[0].text.trim();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (e) {
            return res.status(200).json({ needsReview: true });
        }

        if (!result) {
            return res.status(200).json({ needsReview: true });
        }

        // Not relevant = reject
        if (result.isRelevant === false) {
            return res.status(200).json({
                accepted: false,
                reason: 'not_relevant',
                message: result.relevanceReason || 'התשובה לא קשורה לשאלה',
                feedback: 'נראה שהתשובה לא עוסקת בנושא השאלה. ' + (result.relevanceReason || 'נסי לענות על מה שנשאל.')
            });
        }

        // No real content
        if (result.hasContent === false || result.completeness === 'none') {
            return res.status(200).json({
                accepted: false,
                reason: 'no_content',
                message: 'התשובה לא מכילה מידע שימושי',
                feedback: 'התשובה קצרה מדי או כללית מדי. נסי להוסיף פרטים ספציפיים.'
            });
        }

        // Accepted but might need followup
        const needsFollowup = result.completeness === 'low' || result.completeness === 'medium';
        
        return res.status(200).json({
            accepted: true,
            completeness: result.completeness,
            feedback: result.feedback || 'תודה!',
            needsFollowup: needsFollowup && result.followupQuestion,
            followupQuestion: result.followupQuestion,
            missingPoints: result.missingPoints
        });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(200).json({ needsReview: true });
    }
}

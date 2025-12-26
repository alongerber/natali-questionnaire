export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { question, answer, topicName, scaffoldPoints, example } = req.body;

    if (!question || !answer || !topicName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Quick gibberish check before API call
    const quickGibberishPatterns = [
        /^[א-ת]{1,4}$/,           // Single Hebrew letters
        /^[a-z]{1,5}$/i,          // Short random English
        /^[\d\s]+$/,              // Only numbers
        /^(.)\1{3,}$/,            // Repeated characters
        /^(בדיקה|טסט|test|asdf|qwer|123)/i,
        /^(גגג|ההה|ווו|חחח|ממם)/,
        /^(לא יודעת|לא יודע)$/   // Just "don't know" without elaboration
    ];

    for (const pattern of quickGibberishPatterns) {
        if (pattern.test(answer.trim())) {
            return res.status(200).json({
                isGibberish: true,
                needsFollowup: false,
                feedback: 'נראה שהתשובה לא מלאה. נסי לענות בהתאם לנקודות שמופיעות למעלה.'
            });
        }
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
                max_tokens: 300,
                messages: [{
                    role: 'user',
                    content: `אתה מנהל שאלון לשימור ידע ארגוני. המטרה: לשאוב מידע מפורט ושימושי מעובדת.

נושא: ${topicName}
שאלה: ${question}
נקודות שביקשנו לכלול: ${scaffoldPoints ? scaffoldPoints.join(', ') : 'לא צוין'}
דוגמה לתשובה טובה: ${example || 'לא צוין'}

תשובת העובדת: "${answer}"

נתח את התשובה והחזר JSON בפורמט הבא בלבד (ללא טקסט נוסף):
{
  "isGibberish": true/false,
  "isRelevant": true/false,
  "completeness": "low"/"medium"/"high",
  "feedback": "משפט קצר וחיובי על התשובה",
  "needsFollowup": true/false,
  "followupQuestion": "שאלת המשך ספציפית אם צריך, או null"
}

כללים:
- isGibberish=true רק אם התשובה חסרת משמעות לחלוטין (ג'יבריש, מספרים אקראיים, אותיות סתם)
- isRelevant=false אם התשובה לא קשורה לשאלה בכלל
- completeness: low אם חסרים רוב הפרטים, medium אם יש חלק, high אם מקיף
- needsFollowup=true אם completeness הוא low או medium וחסר מידע חשוב
- followupQuestion: שאלה ספציפית וקצרה (עד 15 מילים) על מה שחסר
- feedback: תמיד חיובי ומעודד, בעברית`
                }]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error('Anthropic API error:', data.error);
            return res.status(200).json({
                isGibberish: false,
                needsFollowup: false,
                feedback: 'תודה על התשובה!'
            });
        }

        let result;
        try {
            // Extract JSON from response
            const text = data.content[0].text.trim();
            // Try to find JSON in the response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found');
            }
        } catch (parseError) {
            console.error('Parse error:', parseError);
            // Fallback
            return res.status(200).json({
                isGibberish: false,
                needsFollowup: false,
                feedback: 'תודה על התשובה!'
            });
        }

        return res.status(200).json({
            isGibberish: result.isGibberish || false,
            isRelevant: result.isRelevant !== false,
            needsFollowup: result.needsFollowup || false,
            followupQuestion: result.followupQuestion || null,
            feedback: result.feedback || 'תודה!'
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(200).json({
            isGibberish: false,
            needsFollowup: false,
            feedback: 'תודה על התשובה!'
        });
    }
}

// backend/utils/geminiClient.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiClient {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is required');
        }
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
    }

    async summarizePage(text, pageNumber = null) {
        try {
            const prompt = `
                Please provide a comprehensive summary of the following text from a PDF document${pageNumber ? ` (Page ${pageNumber})` : ''}:
                
                Text: "${text}"
                
                Please structure your summary with:
                1. Main topic/theme
                2. Key points (3-5 bullet points)
                3. Important details or data
                4. Conclusion or takeaways
                
                Keep it concise but informative, suitable for study purposes.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini summarization error:', error);
            throw new Error('Failed to generate summary');
        }
    }

    async summarizePageRange(textsArray, fromPage, toPage) {
        try {
            const combinedText = textsArray.join('\n\n');
            const prompt = `
                Please provide a comprehensive summary of the following text from pages ${fromPage} to ${toPage} of a PDF document:
                
                Text: "${combinedText}"
                
                Please structure your summary with:
                1. Overall theme across these pages
                2. Key topics covered (organized by relevance)
                3. Important concepts, data, or findings
                4. Connections between different sections
                5. Main conclusions or implications
                
                This is for study purposes, so please make it educational and well-organized.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini page range summarization error:', error);
            throw new Error('Failed to generate page range summary');
        }
    }

    async explainText(text, context = '') {
        try {
            const prompt = `
                Please provide a detailed explanation of the following text:
                
                Text to explain: "${text}"
                ${context ? `Context: "${context}"` : ''}
                
                Please provide:
                1. Clear explanation of the concept/topic
                2. Key terms and their definitions
                3. Real-world examples or applications
                4. Why this is important or relevant
                5. Any related concepts worth knowing
                
                Make it educational and easy to understand for someone learning about this topic.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini explanation error:', error);
            throw new Error('Failed to generate explanation');
        }
    }

    async generateQuiz(text, pages, questionCount = 5) {
        try {
            const prompt = `
                Based on the following content from pages ${pages} of a PDF document, generate ${questionCount} quiz questions:
                
                Content: "${text}"
                
                Please create a mix of question types:
                - Multiple choice questions (with 4 options each)
                - True/False questions
                - Short answer questions
                
                Format your response as a JSON object with this structure:
                {
                    "quiz": [
                        {
                            "type": "multiple_choice",
                            "question": "Question text",
                            "options": ["A", "B", "C", "D"],
                            "correct_answer": 0,
                            "explanation": "Why this answer is correct"
                        },
                        {
                            "type": "true_false",
                            "question": "Statement to evaluate",
                            "correct_answer": true,
                            "explanation": "Explanation of the answer"
                        },
                        {
                            "type": "short_answer",
                            "question": "Question requiring brief response",
                            "sample_answer": "Example of good answer",
                            "key_points": ["point1", "point2"]
                        }
                    ]
                }
                
                Make sure questions test understanding, not just memorization.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            
            // Try to parse as JSON, fallback to text if parsing fails
            try {
                const jsonResponse = JSON.parse(response.text());
                return jsonResponse;
            } catch (parseError) {
                // If JSON parsing fails, return a structured response
                return {
                    quiz: [{
                        type: "text_response",
                        content: response.text(),
                        note: "Quiz generated in text format due to parsing constraints"
                    }]
                };
            }
        } catch (error) {
            console.error('Gemini quiz generation error:', error);
            throw new Error('Failed to generate quiz');
        }
    }

    async generateStudyTips(text, subject = '') {
        try {
            const prompt = `
                Based on this content${subject ? ` about ${subject}` : ''}, provide study tips and learning strategies:
                
                Content: "${text}"
                
                Please provide:
                1. Key concepts to focus on
                2. Memory techniques for important information
                3. Practice questions or self-assessment ideas
                4. Connections to other topics
                5. Real-world applications
                
                Make it actionable and helpful for effective learning.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini study tips error:', error);
            throw new Error('Failed to generate study tips');
        }
    }
}

module.exports = new GeminiClient();
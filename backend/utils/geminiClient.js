// backend/utils/geminiClient.js - ENHANCED with retry logic and error handling
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiClient {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is required');
        }
        
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Try multiple models as fallbacks
        this.models = [
            "gemini-1.5-flash",
            "gemini-1.5-pro", 
            "gemini-1.0-pro"
        ];
        
        this.currentModelIndex = 0;
        this.model = this.genAI.getGenerativeModel({ 
            model: this.models[this.currentModelIndex] 
        });
        
        console.log(`✅ Gemini client initialized with model: ${this.models[this.currentModelIndex]}`);
    }

    // Retry logic with exponential backoff
    async retryWithBackoff(operation, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.log(`❌ Attempt ${attempt} failed:`, error.message);
                
                // Handle specific error types
                if (error.status === 503) {
                    // Service overloaded - wait and retry
                    const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.log(`⏳ Service overloaded, waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`);
                    await this.sleep(waitTime);
                    continue;
                } else if (error.status === 404 && this.currentModelIndex < this.models.length - 1) {
                    // Model not found - try next model
                    this.currentModelIndex++;
                    console.log(`🔄 Switching to model: ${this.models[this.currentModelIndex]}`);
                    this.model = this.genAI.getGenerativeModel({ 
                        model: this.models[this.currentModelIndex] 
                    });
                    continue;
                } else if (error.status === 429) {
                    // Rate limited - wait longer
                    const waitTime = Math.pow(3, attempt) * 1000;
                    console.log(`⏳ Rate limited, waiting ${waitTime}ms before retry ${attempt}/${maxRetries}`);
                    await this.sleep(waitTime);
                    continue;
                } else {
                    // Other errors - don't retry
                    break;
                }
            }
        }
        
        throw lastError;
    }

    // Sleep utility
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Enhanced error handling
    handleGeminiError(error, operation) {
        console.error(`Gemini ${operation} error:`, error);
        
        if (error.status === 503) {
            return new Error(`Gemini service is temporarily overloaded. Please try again in a few moments.`);
        } else if (error.status === 429) {
            return new Error(`Too many requests. Please wait a moment before trying again.`);
        } else if (error.status === 400) {
            return new Error(`Invalid request. Please check your input and try again.`);
        } else if (error.status === 404) {
            return new Error(`Gemini model not available. Please try again later.`);
        } else {
            return new Error(`Failed to generate ${operation}. Please try again.`);
        }
    }

    async summarizePage(text, pageNumber = null) {
        const operation = async () => {
            const prompt = `
                Please provide a comprehensive summary of the following text from a PDF document${pageNumber ? ` (Page ${pageNumber})` : ''}:
                
                Text: "${text.substring(0, 8000)}" ${text.length > 8000 ? '...(truncated)' : ''}
                
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
        };

        try {
            return await this.retryWithBackoff(operation);
        } catch (error) {
            throw this.handleGeminiError(error, 'summary');
        }
    }

    async summarizePageRange(textsArray, fromPage, toPage) {
        const operation = async () => {
            const combinedText = textsArray.join('\n\n');
            const truncatedText = combinedText.substring(0, 10000);
            
            const prompt = `
                Please provide a comprehensive summary of the following text from pages ${fromPage} to ${toPage} of a PDF document:
                
                Text: "${truncatedText}" ${combinedText.length > 10000 ? '...(truncated)' : ''}
                
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
        };

        try {
            return await this.retryWithBackoff(operation);
        } catch (error) {
            throw this.handleGeminiError(error, 'page range summary');
        }
    }

    async explainText(text, context = '') {
        const operation = async () => {
            const truncatedText = text.substring(0, 5000);
            const prompt = `
                Please provide a detailed explanation of the following text:
                
                Text to explain: "${truncatedText}" ${text.length > 5000 ? '...(truncated)' : ''}
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
        };

        try {
            return await this.retryWithBackoff(operation);
        } catch (error) {
            throw this.handleGeminiError(error, 'explanation');
        }
    }

    async generateQuiz(text, pages, questionCount = 5) {
        // Reduce question count if service is overloaded
        const adjustedQuestionCount = Math.min(questionCount, 5);
        
        const operation = async () => {
            const truncatedText = text.substring(0, 8000);
            const prompt = `
                Based on the following content from pages ${pages} of a PDF document, generate ${adjustedQuestionCount} quiz questions:
                
                Content: "${truncatedText}" ${text.length > 8000 ? '...(truncated)' : ''}
                
                Please create a mix of question types and format as valid JSON:
                {
                    "quiz": [
                        {
                            "type": "multiple_choice",
                            "question": "Question text",
                            "options": ["Option A", "Option B", "Option C", "Option D"],
                            "correct_answer": 0,
                            "explanation": "Why this answer is correct"
                        },
                        {
                            "type": "true_false",
                            "question": "Statement to evaluate",
                            "correct_answer": true,
                            "explanation": "Explanation of the answer"
                        }
                    ]
                }
                
                Important: Return ONLY valid JSON, no additional text.
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const responseText = response.text();
            
            // Try to parse as JSON, fallback to structured text
            try {
                // Clean the response text
                const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const jsonResponse = JSON.parse(cleanJson);
                return jsonResponse;
            } catch (parseError) {
                console.log('JSON parsing failed, returning structured text response');
                return {
                    quiz: [{
                        type: "text_response",
                        content: responseText,
                        note: "Quiz generated in text format due to JSON parsing constraints",
                        pages: pages,
                        questionCount: adjustedQuestionCount
                    }]
                };
            }
        };

        try {
            return await this.retryWithBackoff(operation, 2); // Reduced retries for quiz
        } catch (error) {
            throw this.handleGeminiError(error, 'quiz');
        }
    }

    async generateStudyTips(text, subject = '') {
        const operation = async () => {
            const truncatedText = text.substring(0, 6000);
            const prompt = `
                Based on this content${subject ? ` about ${subject}` : ''}, provide study tips and learning strategies:
                
                Content: "${truncatedText}" ${text.length > 6000 ? '...(truncated)' : ''}
                
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
        };

        try {
            return await this.retryWithBackoff(operation);
        } catch (error) {
            throw this.handleGeminiError(error, 'study tips');
        }
    }

    async analyzeHighlights(text, pageNumber = null) {
        const operation = async () => {
            const truncatedText = text.substring(0, 8000);
            const prompt = `
                Analyze the following text from a PDF document${pageNumber ? ` (Page ${pageNumber})` : ''} and identify the most important passages that should be highlighted for studying purposes.

                Text: "${truncatedText}" ${text.length > 8000 ? '...(truncated)' : ''}

                Please identify text segments that are:
                1. Key concepts and definitions
                2. Important facts, data, or statistics
                3. Main conclusions or takeaways
                4. Technical terms or terminology
                5. Critical statements or arguments
                6. Examples that illustrate important concepts

                Return your response as valid JSON in this exact format:
                {
                    "suggestions": [
                        {
                            "text": "exact text to highlight",
                            "reason": "why this should be highlighted",
                            "importance": "high|medium|low",
                            "category": "definition|fact|conclusion|term|argument|example"
                        }
                    ]
                }

                Important rules:
                - Only include text that appears EXACTLY in the provided content
                - Keep highlighted text segments to 1-3 sentences maximum
                - Focus on the most study-worthy content
                - Return ONLY valid JSON, no additional text
                - Limit to maximum 8 suggestions to avoid overwhelming the user
            `;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const responseText = response.text();
            
            try {
                // Clean the response text
                const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const jsonResponse = JSON.parse(cleanJson);
                
                // Validate the response structure
                if (!jsonResponse.suggestions || !Array.isArray(jsonResponse.suggestions)) {
                    throw new Error('Invalid response structure');
                }
                
                // Filter out suggestions with text that doesn't exist in the original
                const validSuggestions = jsonResponse.suggestions.filter(suggestion => {
                    return suggestion.text && 
                           suggestion.reason && 
                           suggestion.importance && 
                           suggestion.category &&
                           text.includes(suggestion.text.trim());
                }).slice(0, 8); // Limit to 8 suggestions max
                
                return {
                    suggestions: validSuggestions,
                    pageNumber: pageNumber,
                    analyzedAt: new Date().toISOString()
                };
            } catch (parseError) {
                console.log('JSON parsing failed for highlight analysis, providing fallback');
                // Return a structured fallback response
                return {
                    suggestions: [],
                    error: 'AI analysis completed but response format needs adjustment',
                    fallbackContent: responseText,
                    pageNumber: pageNumber,
                    analyzedAt: new Date().toISOString()
                };
            }
        };

        try {
            return await this.retryWithBackoff(operation);
        } catch (error) {
            throw this.handleGeminiError(error, 'highlight analysis');
        }
    }

    // Method to check service status
    async checkServiceHealth() {
        try {
            const result = await this.model.generateContent("Hello");
            console.log('✅ Gemini service is healthy');
            return true;
        } catch (error) {
            console.log('❌ Gemini service health check failed:', error.message);
            return false;
        }
    }
}

module.exports = new GeminiClient();